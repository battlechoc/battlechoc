// What the scene plays for the match's events and changes: explosions, trap icons, energy bars,
// the shield's chocolate flash, sounds, and the floating +cacao / +1 building of the producers.
import {
  engine,
  EntityType,
  AttackType,
  BoardCellTypes,
  isDonut,
} from "@battlechoc/battlechoc-shared-functions";
import {
  StandardMaterial,
  MeshBuilder,
  Vector3,
  Color3,
  Animation,
} from "./babylon.js";
import { InfoType } from "./InfoType.js";

// the opponent's board lies this far from the own one in x and z
export const BOARD_DISTANCE = 12;

// the donut type of each trap effect, for its icon
const TRAP_DONUTS = {
  "DonutEffect.PORTAL": EntityType.DONUT_PORTAL_BLUE,
  "DonutEffect.GREEN": EntityType.DONUT_HEALTH_GREEN,
  "DonutEffect.WHITE": EntityType.DONUT_CREAM_WHITE,
  "DonutEffect.PINK": EntityType.DONUT_STOP_PINK,
  "DonutEffect.XMAS_TO_BALLISTA": EntityType.DONUT_SURPRISE_YELLOW,
  "DonutEffect.XMAS_TO_FOUNTAIN": EntityType.DONUT_SURPRISE_YELLOW,
};

// a cell's place in the scene, on the own board or the opponent's (at the boards' base)
export const boardPosition = (row, col, ownBoard) =>
  ownBoard
    ? new Vector3(row, 0, col)
    : new Vector3(row - BOARD_DISTANCE, 0, col + BOARD_DISTANCE);

// a visible fountain of `owner` whose 3x3 shield covers the cell, if any
export const visibleFountain = (view, owner, row, col) => {
  const grid = view.board.fields[view.players[owner].fieldIndex].grid;
  const { rows, cols } = view.board.size;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (r >= 0 && c >= 0 && r < rows && c < cols) {
        const fountain = grid[r * cols + c].occupiedBy.find(
          (entity) => entity.type === EntityType.CHOCOLATE_FOUNTAIN
        );
        if (fountain) {
          return fountain;
        }
      }
    }
  }
  return undefined;
};

/**
 * Explosions, trap icons and sounds for attacks of both players, driven by match events.
 * @param {object[]} events the match's newest events
 * @param {object} view the match view
 * @param {object} fx what the scene does: playSound(name of Jukebox.SOUNDS),
 *   spawnInfo(type, position, amount, kind), detonate(row, col, ownBoard),
 *   chocolateFlash(position), showEnergyBar(entity, position), newDonuts()
 */
export const playMatchEvents = (events, view, fx) => {
  events.forEach((event) => {
    if (event.type === "attack") {
      const mine = event.player === view.viewer;
      const { row, col, attackType, result } = event.data;
      const ownBoard = !mine;
      const position = boardPosition(row, col, ownBoard);
      if (attackType === AttackType.BUNNY) {
        if (result.caught) {
          fx.playSound("BUNNY_CAUGHT");
          if (mine) {
            fx.spawnInfo(InfoType.BUNNY_CAUGHT, position.clone());
          }
        } else {
          fx.playSound("ATTACK_BUNNY");
        }
        return;
      }
      fx.playSound("ATTACK_EXPLOSION");
      fx.detonate(row, col, ownBoard);
      result.traps.forEach((trap) => {
        fx.spawnInfo(
          InfoType.DONUT_TRAP,
          position.clone(),
          undefined,
          TRAP_DONUTS[trap]
        );
      });
      const owner = mine ? 1 - view.viewer : view.viewer;
      if (result.shielded && !result.fountainDestroyed) {
        // the shield took the hit: the cell is coated in chocolate for a moment and the
        // fountain shows what is left of its shield
        fx.chocolateFlash(position.clone());
        const fountain = visibleFountain(view, owner, row, col);
        if (fountain) {
          fx.showEnergyBar(
            fountain,
            boardPosition(
              fountain.position.row,
              fountain.position.col,
              ownBoard
            )
          );
        }
        return;
      }
      const cell =
        view.board.fields[view.players[owner].fieldIndex].grid[
          row * view.board.size.cols + col
        ];
      const survivor = cell.occupiedBy.find(
        (entity) => entity.type !== EntityType.CREAM && !isDonut(entity.type)
      );
      if (survivor) {
        fx.showEnergyBar(survivor, position.clone());
      }
    } else if (event.type === "donutsSpawned") {
      fx.playSound("UI_ACCEPT");
      fx.newDonuts();
    }
  });
};

/**
 * Floating +cacao over every producer that just harvested, +1 building over a factory or
 * extension that just added a building slot (only when the storage was not full), between two
 * views of a running match.
 */
export const showProduction = (before, view, spawnInfo) => {
  const running = engine.MatchPhase.RUNNING;
  if (!before || !view || before.phase !== running || view.phase !== running) {
    return;
  }
  const viewer = view.viewer;
  const entitiesById = (match) => {
    const grid = match.board.fields[match.players[viewer].fieldIndex].grid;
    const entities = new Map();
    grid.forEach((cell) =>
      cell.occupiedBy.forEach((entity) => entities.set(entity.id, entity))
    );
    return entities;
  };
  const previous = entitiesById(before);
  let newSlots = Math.max(
    0,
    view.players[viewer].buildTokens - before.players[viewer].buildTokens
  );
  entitiesById(view).forEach((entity, id) => {
    const old = previous.get(id);
    if (!old) {
      return;
    }
    if (
      typeof entity.cacaoAt === "number" &&
      typeof old.cacaoAt === "number" &&
      entity.cacaoAt > old.cacaoAt
    ) {
      const amount = engine.producerStats(view, viewer, entity).amount;
      spawnInfo(InfoType.CACAO_HARVESTED, entity.position, amount);
    }
    if (
      newSlots > 0 &&
      typeof entity.buildAt === "number" &&
      typeof old.buildAt === "number" &&
      entity.buildAt > old.buildAt
    ) {
      newSlots -= 1;
      // a little to the side, the factory may have harvested cacao at the same moment
      spawnInfo(
        InfoType.BUILDING_READY,
        { row: entity.position.row + 0.6, col: entity.position.col - 0.6 },
        1
      );
    }
  });
};

// a brown chocolate dome over a cell that fades out: the shield absorbed the shot; `top` is
// just above the cell's chocolate piece
export const chocolateFlash = (scene, position, top, setRenderLoop) => {
  const dome = MeshBuilder.CreateSphere(
    "chocolate.flash." + Date.now(),
    { diameter: 1.05, segments: 16 },
    scene
  );
  dome.scaling = new Vector3(1, 0.75, 1);
  dome.position = new Vector3(position.x, top, position.z);
  dome.isPickable = false;
  dome.renderingGroupId = 1;
  const material = new StandardMaterial(
    "chocolate.flash.material." + Date.now(),
    scene
  );
  material.diffuseColor = Color3.FromHexString("#5A2E16");
  material.emissiveColor = Color3.FromHexString("#3E1E0E");
  material.specularColor = new Color3(0.4, 0.3, 0.25);
  material.alpha = 0.85;
  dome.material = material;
  const fade = new Animation(
    "chocolate.flash.fade",
    "alpha",
    60,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  fade.setKeys([
    { frame: 0, value: 0.85 },
    { frame: 30, value: 0.75 },
    { frame: 60, value: 0 },
  ]);
  setRenderLoop(true);
  scene.beginDirectAnimation(material, [fade], 0, 60, false, 1, () => {
    dome.dispose();
    material.dispose();
    setRenderLoop(false);
  });
};

// the burst of a shot on a cell of `gamefield`'s board, at height `y`
export const detonate = (scene, gamefield, row, col, y) => {
  const truffle = MeshBuilder.CreateTorus("knot", { diameter: 0.1 }, scene);
  truffle.material = scene.getMaterialByName(
    BoardCellTypes.BROWN + ".material"
  );
  const base = boardPosition(row, col, gamefield.isPlayerGameField);
  truffle.position = new Vector3(base.x, y, base.z);
  gamefield.explode(truffle);
};
