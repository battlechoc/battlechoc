// Feeds the board views of real AI matches into the 3D Gamefield (headless, Babylon NullEngine
// with stand-in models): every change of a cell must update its meshes without throwing.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  engine,
  EntityType,
  BoardCellTypes,
  PlayerType,
  isDonut,
} from "@battlechoc/battlechoc-shared-functions";
import {
  NullEngine,
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  FreeCamera,
} from "@babylonjs/core";
import Gamefield from "../../src/3d/Gamefield.js";

// what the asset loader provides: a disabled "<phenotype>__root__" template per model
const createScene = () => {
  const scene = new Scene(new NullEngine());
  // some updates render right away
  new FreeCamera("camera", new Vector3(30, 30, 30), scene);
  const phenotypes = [
    ...Object.values(EntityType),
    `${EntityType.CREAM}.AROUND.BUILDING`,
    ...Object.values(BoardCellTypes),
  ];
  phenotypes.forEach((phenotype) => {
    const root = new Mesh(`${phenotype}__root__`, scene);
    const model = MeshBuilder.CreateBox(`${phenotype}.model`, { size: 0.5 }, scene);
    model.material = new StandardMaterial(`${phenotype}.material`, scene);
    model.parent = root;
    root.setEnabled(false);
  });
  return scene;
};

// the entity meshes a cell should have, by the rules of Gamefield.renderEntities
const expectedMeshes = (cell, own, fieldIdx) => {
  if (cell.molten) {
    return [];
  }
  const solid = cell.occupiedBy.filter((entity) => !isDonut(entity.type));
  const creamed = solid.some((entity) => entity.type === EntityType.CREAM);
  return cell.occupiedBy
    .filter((entity) => own || !isDonut(entity.type))
    .filter(
      (entity) =>
        own || entity.type === EntityType.CREAM || solid.length === 1 || !creamed
    )
    .map((entity) =>
      entity.type === EntityType.CREAM && own && solid.length > 1
        ? `${EntityType.CREAM}.AROUND.BUILDING`
        : entity.type
    )
    .map((phenotype) => `${fieldIdx}.${phenotype}.${cell.row}.${cell.col}`)
    .sort();
};

const tiles = Object.values(BoardCellTypes);
const actualMeshes = (scene, cell, fieldIdx) =>
  scene.meshes
    .filter(
      (mesh) =>
        !mesh.isDisposed() &&
        mesh.name.startsWith(`${fieldIdx}.`) &&
        mesh.name.endsWith(`.${cell.row}.${cell.col}`) &&
        !tiles.some((tile) => mesh.name.startsWith(`${fieldIdx}.${tile}.`))
    )
    .map((mesh) => mesh.name)
    .sort();

const playAndRender = (seed, size) => {
  const match = engine.createMatch({
    players: [
      { id: "a", name: "A", type: PlayerType.AI_STRONG },
      { id: "b", name: "B", type: PlayerType.AI_STRONG },
    ],
    boardSize: { rows: size, cols: size },
    seed,
  });
  const agents = [0, 1].map(
    (playerIndex) =>
      new engine.ai.GustavGanache({ playerIndex, seed: `${seed}-${playerIndex}`, handicap: 0 })
  );
  const scene = createScene();
  let view;
  let fields;
  engine.playMatch(engine, engine.getPlayerView, match, agents, {
    onStep: () => {
      view = engine.getPlayerView(match, 0);
      const own = view.players[view.viewer].fieldIndex;
      if (typeof own !== "number") {
        return;
      }
      const opponent = 1 - own;
      if (!fields) {
        const noop = () => {};
        fields = [
          new Gamefield(true, new Vector3(0, 0, 0), () => view.board.fields[own], own, view.board.size, scene, noop, noop),
          new Gamefield(false, new Vector3(-12, 0, 12), () => view.board.fields[opponent], opponent, view.board.size, scene, noop, noop),
        ];
      }
      fields.forEach((field) => {
        const before = JSON.parse(JSON.stringify(field.playerField));
        field.update();
        // the delayed explosions of buildings under exploding cream, then the animations
        mock.timers.tick(5000);
        field.stopAllAnimations();
        field.getPlayerField().grid.forEach((cell, i) => {
          assert.deepEqual(
            actualMeshes(scene, cell, field.fieldIdx),
            expectedMeshes(cell, field.isPlayerGameField, field.fieldIdx),
            `${field.isPlayerGameField ? "own" : "opponent"} cell ${cell.row},${cell.col}: ` +
              `${JSON.stringify(before.grid[i].occupiedBy.map((e) => e.type))} -> ` +
              `${JSON.stringify(cell.occupiedBy.map((e) => e.type))}`
          );
        });
      });
    },
  });
  scene.getEngine().dispose();
  return match;
};

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
test.afterEach(() => mock.timers.reset());

for (const size of [6, 8, 10]) {
  test(`the 3D board follows Gustav vs Gustav on ${size}x${size} without errors`, () => {
    for (let i = 0; i < 12; i++) {
      const match = playAndRender(`gamefield-${size}-${i}`, size);
      assert.ok(match.t > 0);
    }
  });
}
