// The energy bar over a unit that was hit: green, yellow or red by what is left of it, fading
// out after three seconds. A new hit replaces the bar of the same cell.
import {
  StandardMaterial,
  MeshBuilder,
  Mesh,
  Vector3,
  Color3,
  Animation,
} from "./babylon.js";
import { OneShots } from "./oneShots.js";

export class EnergyBars {
  /**
   * @param {object} options
   * @param {Scene} options.scene
   * @param {(run?: boolean) => void} options.setRenderLoop
   * @param {() => number} options.height how high the bars float (above the base of the boards)
   */
  constructor({ scene, setRenderLoop, height }) {
    this.scene = scene;
    this.setRenderLoop = setRenderLoop;
    this.height = height;
    this.bars = new OneShots();
    // the bars on the screen by their place
    this.shown = new Map();
  }

  // the bar's name: its place
  name(position) {
    return `${position.x}-${this.height()}-${position.z}`;
  }

  hide(position) {
    const shown = this.shown.get(this.name(position));
    if (shown) {
      // its fade's end takes it away
      this.scene.stopAnimation(shown.bar);
    }
  }

  // `position`: a Vector3 (its y is replaced), a { row, col } of the own board, or by default
  // the entity's place on the own board
  show(entity, position) {
    const height = this.height();
    if (typeof position === "undefined") {
      position = new Vector3(entity.position.row, height, entity.position.col);
    } else if (!(position instanceof Vector3)) {
      position = new Vector3(position.row, height, position.col);
    } else {
      position.y = height;
    }

    const name = this.name(position);
    this.hide(position);

    const maxHp =
      typeof entity.maxHp === "number" ? entity.maxHp : entity.max.hp;
    const energy = Math.max(0, Math.min(1, entity.hp / maxHp));
    const bar = MeshBuilder.CreatePlane(
      "energy.bar." + name,
      { width: energy, height: 0.15 },
      this.scene
    );
    bar.isPickable = false;
    const material = new StandardMaterial(
      "energy.bar.material." + name,
      this.scene
    );
    // unlit like the weapon indicators: the lights would darken the bar's colour
    material.disableLighting = true;
    if (energy < 0.3) {
      material.emissiveColor = Color3.FromHexString("#D05531");
    } else if (energy < 0.6) {
      material.emissiveColor = Color3.FromHexString("#DFBF31");
    } else {
      material.emissiveColor = Color3.FromHexString("#70bf31");
    }

    bar.material = material;
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bar.position = position.clone();
    bar.position.x = bar.position.x + (1 - energy) * 0.35;
    bar.position.z = bar.position.z - (1 - energy) * 0.35;

    const fade = new Animation(
      "fade",
      "visibility",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    fade.setKeys([
      { frame: 0, value: 1.0 },
      { frame: 180, value: 0.9 },
      { frame: 240, value: 0.0 },
    ]);

    this.setRenderLoop();
    bar.animations = [fade];
    const end = this.bars.start(() => {
      material.dispose();
      bar.dispose();
      if (this.shown.get(name) && this.shown.get(name).bar === bar) {
        this.shown.delete(name);
      }
      this.setRenderLoop(false);
    });
    this.shown.set(name, { bar, end });
    this.scene.beginAnimation(bar, 0, 240, false, 1, end);
  }
}
