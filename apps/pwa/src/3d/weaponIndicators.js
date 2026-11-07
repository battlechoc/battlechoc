// A donut above every weapon unit, factory and extension of the own board that grows while it
// reloads or produces the next building slot. Its glaze shows the state: plain while charging,
// blue when the weapon can fire early, green when the shot is free or the building storage is
// full. It hops when it gets ready. A fruit cannon shows one donut per weapon.
import { engine, EntityType } from "@battlechoc/battlechoc-shared-functions";
import {
  DynamicTexture,
  StandardMaterial,
  MeshBuilder,
  Mesh,
  Vector3,
  Animation,
} from "./babylon.js";

// the progress donut's glaze by the cannon's state: pistachio when a shot is ready, blueberry
// when one can be rushed (the weapon palette's colours, mixed with 25 % white: the full colours
// were too dark for a glaze, the user's pick from screenshots/progress-donut/glaze-colours.png)
const GLAZE_COLORS = { ready: [172, 220, 84], rushable: [101, 172, 210] };
const PRODUCERS = [EntityType.FACTORY, EntityType.FACTORY_EXTENSION];

/**
 * Progress (0..1) and state ("charging", "rushable", "ready") of each donut over an entity: one
 * per weapon (two at most), or the next building slot of a factory or extension.
 */
export const indicatorDonuts = (view, entity, now) => {
  if (Array.isArray(entity.weapons)) {
    return entity.weapons.slice(0, 2).map((weapon) => {
      const status = engine.weaponStatus(view, weapon, now);
      return { progress: status.progress, state: status.state };
    });
  }
  const me = view.players[view.viewer];
  if (me.buildTokens >= engine.buildCapacity(view, view.viewer)) {
    return [{ progress: 1, state: "ready" }];
  }
  const intervalMs = engine.generatorStats(
    view,
    view.viewer,
    entity
  ).intervalMs;
  const progress =
    typeof entity.buildAt === "number"
      ? 1 - (entity.buildAt - now) / intervalMs
      : 0;
  return [{ progress: Math.max(0, Math.min(1, progress)), state: "charging" }];
};

export class WeaponIndicators {
  /**
   * @param {object} options
   * @param {Scene} options.scene
   * @param {() => void} options.requestRender
   * @param {(run?: boolean) => void} options.setRenderLoop
   * @param {() => ({view, now}|null)} options.current the match view and its time, null when
   *   the donuts stand still (no match, or it is over: its clock goes on, and a cannon would
   *   report a shot over the end screen)
   * @param {(entity, attackType) => void} options.onShotReady a weapon got a shot ready
   */
  constructor({ scene, requestRender, setRenderLoop, current, onShotReady }) {
    this.scene = scene;
    this.requestRender = requestRender;
    this.setRenderLoop = setRenderLoop;
    this.current = current;
    this.onShotReady = onShotReady;
    // by entity id: { mesh, material, texture, donuts, key, states, progress, entity }
    this.indicators = new Map();
    this.bitmaps = new Map();
    // the loading donut in ten steps doubles as the progress indicator above the units
    this.images = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((percent) => {
      const image = new Image();
      image.onload = () => this.update();
      image.src = `/images/progress-${percent}.svg`;
      return image;
    });
    this.interval = setInterval(() => this.update(), 250);
  }

  // an indicator over every weapon unit and producer of the own board's `grid`, at `height`
  sync(grid, height) {
    const present = new Set();
    grid.forEach((cell) =>
      cell.occupiedBy
        .filter(
          (entity) =>
            Array.isArray(entity.weapons) || PRODUCERS.includes(entity.type)
        )
        .forEach((entity) => {
          present.add(entity.id);
          const donuts = Array.isArray(entity.weapons)
            ? Math.min(2, entity.weapons.length)
            : 1;
          let indicator = this.indicators.get(entity.id);
          if (indicator && indicator.donuts !== donuts) {
            this.dispose(entity.id, indicator);
            indicator = undefined;
          }
          if (!indicator) {
            indicator = this.create(entity.id, donuts);
          }
          indicator.entity = entity;
          // the factory models are taller than the cannons
          const lift = PRODUCERS.includes(entity.type) ? 0.35 : 0;
          indicator.mesh.position = new Vector3(
            cell.row,
            height - 0.3 + lift,
            cell.col
          );
        })
    );
    this.indicators.forEach((indicator, id) => {
      if (!present.has(id)) {
        this.dispose(id, indicator);
      }
    });
    this.update(false);
  }

  create(id, donuts) {
    const size = 0.8;
    const mesh = MeshBuilder.CreatePlane(
      "weapon.indicator." + id,
      { width: size * donuts, height: size },
      this.scene
    );
    const texture = new DynamicTexture(
      "weapon.indicator.texture." + id,
      { width: 128 * donuts, height: 128 },
      this.scene,
      true
    );
    texture.hasAlpha = true;
    const material = new StandardMaterial(
      "weapon.indicator.material." + id,
      this.scene
    );
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    // drawn after the boards, so trees and buildings never cover it
    mesh.renderingGroupId = 1;
    const indicator = {
      mesh,
      material,
      texture,
      donuts,
      key: undefined,
      states: [],
      progress: [],
    };
    this.indicators.set(id, indicator);
    return indicator;
  }

  dispose(id, indicator) {
    indicator.mesh.dispose();
    indicator.texture.dispose();
    indicator.material.dispose();
    this.indicators.delete(id);
  }

  // all of them go (the board is cleared)
  clear() {
    this.indicators.forEach((indicator, id) => this.dispose(id, indicator));
  }

  // no more redraws (the scene goes)
  stop() {
    clearInterval(this.interval);
  }

  // A donut step as a 112 px bitmap, coloured for its state: "ready" and "rushable" colour the
  // glaze only, the dough and the sprinkles keep their colours (the user, 2026-11-01); "ghost"
  // is the whole donut as a pale shadow of what is still missing. Rasterised once per step and
  // state, not on every redraw.
  bitmap(step, state) {
    const key = `${step}:${state}`;
    if (this.bitmaps.has(key)) {
      return this.bitmaps.get(key);
    }
    const image = this.images[step - 1];
    if (!image || !image.complete || image.naturalWidth === 0) {
      return undefined;
    }
    const bitmap = document.createElement("canvas");
    bitmap.width = 112;
    bitmap.height = 112;
    const context = bitmap.getContext("2d");
    context.drawImage(image, 0, 0, 112, 112);
    if (state === "ghost") {
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = "rgba(226, 230, 236, 0.8)";
      context.fillRect(0, 0, 112, 112);
    } else if (GLAZE_COLORS[state]) {
      // the glaze is the light, unsaturated part of the picture: those pixels take the state's
      // colour, shaded as they were
      const [red, green, blue] = GLAZE_COLORS[state];
      const pixels = context.getImageData(0, 0, 112, 112);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (data[i + 3] > 0 && max > 150 && max - min < 40) {
          const shade = max / 255;
          data[i] = red * shade;
          data[i + 1] = green * shade;
          data[i + 2] = blue * shade;
        }
      }
      context.putImageData(pixels, 0, 0);
    }
    this.bitmaps.set(key, bitmap);
    return bitmap;
  }

  draw(texture, donuts) {
    const context = texture.getContext();
    context.clearRect(0, 0, 128 * donuts.length, 128);
    donuts.forEach(({ progress, state }, index) => {
      const step =
        progress <= 0
          ? 0
          : Math.max(1, Math.min(10, Math.round(progress * 10)));
      const x = index * 128 + 8;
      // a pale whole donut shows what is still missing (a grey one looked black and dirty; the
      // user's pick of 2026-11-01, "C3" in screenshots/progress-donut)
      const ghost = this.bitmap(10, "ghost");
      if (ghost) {
        context.globalAlpha = 0.35;
        context.drawImage(ghost, x, 8);
        context.globalAlpha = 1;
      }
      const piece = step > 0 ? this.bitmap(step, state) : undefined;
      if (piece) {
        context.drawImage(piece, x, 8);
      }
    });
    texture.update();
  }

  // a short hop when a donut becomes ready
  hop(indicator) {
    const hop = new Animation(
      "weapon.indicator.hop",
      "scaling",
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    hop.setKeys([
      { frame: 0, value: new Vector3(1, 1, 1) },
      { frame: 7, value: new Vector3(1.4, 1.4, 1.4) },
      { frame: 14, value: new Vector3(0.9, 0.9, 0.9) },
      { frame: 20, value: new Vector3(1, 1, 1) },
    ]);
    this.setRenderLoop(true);
    this.scene.beginDirectAnimation(
      indicator.mesh,
      [hop],
      0,
      20,
      false,
      1,
      () => this.setRenderLoop(false)
    );
  }

  // redraws the donuts that grew a piece or changed their glaze, and a frame if `render`
  update(render = true) {
    if (this.indicators.size === 0) {
      return;
    }
    const current = this.current();
    if (!current) {
      return;
    }
    const { view, now } = current;
    const loaded = this.images.filter((image) => image.complete).length;
    let changed = false;
    this.indicators.forEach((indicator) => {
      const donuts = indicatorDonuts(view, indicator.entity, now);
      const key =
        `${loaded}:` +
        donuts
          .map((donut) => `${donut.state}:${Math.round(donut.progress * 10)}`)
          .join("|");
      if (key === indicator.key) {
        return;
      }
      const becameReady = donuts.some(
        (donut, index) =>
          donut.state === "ready" &&
          indicator.states[index] &&
          indicator.states[index] !== "ready"
      );
      const previousStates = indicator.states;
      // a factory that just produced a building slot starts a new donut
      const slotArrived = donuts.some(
        (donut, index) =>
          (indicator.progress[index] || 0) > 0.8 && donut.progress < 0.2
      );
      indicator.key = key;
      indicator.states = donuts.map((donut) => donut.state);
      indicator.progress = donuts.map((donut) => donut.progress);
      this.draw(indicator.texture, donuts);
      if (becameReady || slotArrived) {
        this.hop(indicator);
      }
      if (becameReady && Array.isArray(indicator.entity.weapons)) {
        donuts.forEach((donut, index) => {
          if (
            donut.state === "ready" &&
            previousStates[index] &&
            previousStates[index] !== "ready"
          ) {
            this.onShotReady(
              indicator.entity,
              indicator.entity.weapons[index].attackType
            );
          }
        });
      }
      changed = true;
    });
    if (changed && render) {
      this.requestRender();
    }
  }
}
