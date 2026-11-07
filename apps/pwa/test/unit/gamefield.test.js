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
import { CREAM_AROUND_BUILDING } from "../../src/3d/cellMeshes.js";

// what the asset loader provides: a disabled "<phenotype>__root__" template per model
const createScene = () => {
  const scene = new Scene(new NullEngine());
  // some updates render right away
  new FreeCamera("camera", new Vector3(30, 30, 30), scene);
  const phenotypes = [
    ...Object.values(EntityType),
    CREAM_AROUND_BUILDING,
    ...Object.values(BoardCellTypes),
  ];
  phenotypes.forEach((phenotype) => {
    const root = new Mesh(`${phenotype}__root__`, scene);
    const model = MeshBuilder.CreateBox(
      `${phenotype}.model`,
      { size: 0.5 },
      scene
    );
    model.material = new StandardMaterial(`${phenotype}.material`, scene);
    model.parent = root;
    root.setEnabled(false);
  });
  return scene;
};

// the entity meshes a cell should have, written out on their own (src/3d/cellMeshes.js has the
// same rules)
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
        own ||
        entity.type === EntityType.CREAM ||
        solid.length === 1 ||
        !creamed
    )
    .map((entity) =>
      entity.type === EntityType.CREAM && own && solid.length > 1
        ? CREAM_AROUND_BUILDING
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
      new engine.ai.GustavGanache({
        playerIndex,
        seed: `${seed}-${playerIndex}`,
        handicap: 0,
      })
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
        const board = (mine, fieldIdx, position) =>
          new Gamefield({
            own: mine,
            position,
            getField: () => view.board.fields[fieldIdx],
            fieldIdx,
            size: view.board.size,
            scene,
            onCellTap: noop,
            setRenderLoop: noop,
          });
        fields = [
          board(true, own, new Vector3(0, 0, 0)),
          board(false, opponent, new Vector3(-12, 0, 12)),
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

// Scripted transitions of one cell, (1, 1) of a 3×3 board: which meshes the cell has afterwards,
// which of them burst (explode) and which tile melted, against what the game shows today.
const {
  CREAM,
  FACTORY,
  FACTORY_EXTENSION,
  CACAOTREE,
  CHOCOLATE_FOUNTAIN,
  SPYING_EASTER_BUNNY,
} = EntityType;
const AROUND = CREAM_AROUND_BUILDING;
const TILE = BoardCellTypes.BROWN;

// a 3×3 grid, empty but for the given cells: { "1.1": [[id, type], …] }; `molten` lists cells
const grid = (cells = {}, molten = [], size = { rows: 3, cols: 3 }) => {
  const result = [];
  for (let row = 0; row < size.rows; row++) {
    for (let col = 0; col < size.cols; col++) {
      const entities = cells[`${row}.${col}`] || [];
      result.push({
        type: TILE,
        row,
        col,
        molten: molten.includes(`${row}.${col}`),
        occupiedBy: entities.map(([id, type]) => ({
          id,
          type,
          position: { row, col },
        })),
      });
    }
  }
  return result;
};

const board = (
  own,
  cells,
  molten,
  size = { rows: 3, cols: 3 },
  { shield = false } = {}
) => {
  const scene = createScene();
  if (shield) {
    // the fountain's dome is a second part of its model with a material of its own
    const dome = MeshBuilder.CreateBox(
      `${CHOCOLATE_FOUNTAIN}.shield`,
      { size: 2 },
      scene
    );
    dome.material = new StandardMaterial(
      `${CHOCOLATE_FOUNTAIN}.Shield.material`,
      scene
    );
    dome.parent = scene.getMeshByName(`${CHOCOLATE_FOUNTAIN}__root__`);
  }
  const fieldIdx = own ? 0 : 1;
  let field = { grid: grid(cells, molten, size) };
  let loops = 0;
  const gamefield = new Gamefield({
    own,
    position: own ? new Vector3(0, 0, 0) : new Vector3(-12, 0, 12),
    getField: () => field,
    fieldIdx,
    size,
    scene,
    onCellTap: () => {},
    setRenderLoop: (run = true) => (loops += run ? 1 : -1),
    requestRender: () => {},
  });
  const exploded = [];
  const melted = [];
  const explode = gamefield.explode.bind(gamefield);
  gamefield.explode = (mesh) => {
    exploded.push(mesh ? mesh.name : null);
    explode(mesh);
  };
  const melt = gamefield.animateHotChocolate.bind(gamefield);
  gamefield.animateHotChocolate = (tile) => {
    melted.push(tile.name);
    melt(tile);
  };
  const name = (phenotype, row = 1, col = 1) =>
    `${fieldIdx}.${phenotype}.${row}.${col}`;
  return {
    scene,
    gamefield,
    exploded,
    melted,
    name,
    loops: () => loops,
    show(cells, molten) {
      field = { grid: grid(cells, molten, size) };
      gamefield.update();
    },
    // the meshes of a cell, its tile included
    meshes: (row = 1, col = 1) =>
      scene.meshes
        .filter(
          (mesh) =>
            !mesh.isDisposed() &&
            mesh.name.startsWith(`${fieldIdx}.`) &&
            mesh.name.endsWith(`.${row}.${col}`)
        )
        .map((mesh) => mesh.name)
        .sort(),
    // a phenotype's meshes, wherever they are
    find: (phenotype) =>
      scene.meshes.filter(
        (mesh) =>
          !mesh.isDisposed() &&
          mesh.name.startsWith(`${fieldIdx}.${phenotype}.`)
      ),
  };
};

const names = (b, ...phenotypes) =>
  phenotypes.map((phenotype) => b.name(phenotype)).sort();

test("own board: cream shot away from a tree bursts, the tree stays", () => {
  const b = board(true, {
    1.1: [
      ["c", CREAM],
      ["t", CACAOTREE],
    ],
  });
  assert.deepEqual(b.meshes(), names(b, TILE, AROUND, CACAOTREE));
  b.show({ 1.1: [["t", CACAOTREE]] });
  assert.deepEqual(b.exploded, [b.name(AROUND)]);
  assert.deepEqual(b.meshes(), names(b, TILE, CACAOTREE));
});

test("own board: plain cream shot away bursts", () => {
  const b = board(true, { 1.1: [["c", CREAM]] });
  b.show({});
  assert.deepEqual(b.exploded, [b.name(CREAM)]);
  assert.deepEqual(b.meshes(), names(b, TILE));
});

test("own board: a fountain destroyed under its cream bursts and leaves plain cream (2026-10-19)", () => {
  const b = board(true, {
    1.1: [
      ["f", CHOCOLATE_FOUNTAIN],
      ["c", CREAM],
    ],
  });
  assert.deepEqual(b.meshes(), names(b, TILE, AROUND, CHOCOLATE_FOUNTAIN));
  b.show({ 1.1: [["c", CREAM]] });
  assert.deepEqual(b.exploded, [b.name(CHOCOLATE_FOUNTAIN)]);
  assert.deepEqual(b.meshes(), names(b, TILE, CREAM));
  // the next hit takes the cream: no ghost fountain, no explode(null)
  b.show({});
  assert.deepEqual(b.exploded, [b.name(CHOCOLATE_FOUNTAIN), b.name(CREAM)]);
  assert.deepEqual(b.meshes(), names(b, TILE));
});

test("own board: cream and the factory under it go together, the factory bursts a second later", () => {
  const b = board(true, {
    1.1: [
      ["c", CREAM],
      ["f", FACTORY],
    ],
  });
  b.show({});
  assert.deepEqual(b.exploded, [b.name(AROUND)]);
  assert.deepEqual(b.meshes(), names(b, TILE, FACTORY));
  mock.timers.tick(1000);
  assert.deepEqual(b.exploded, [b.name(AROUND), b.name(FACTORY)]);
  assert.deepEqual(b.meshes(), names(b, TILE));
  mock.timers.tick(5000);
  assert.equal(b.loops(), 0);
});

test("own board: a fruit cannon replaces a truffle cannon without a burst", () => {
  const b = board(true, { 1.1: [["a", EntityType.RUM_TRUFFLE_CANNON]] });
  b.show({ 1.1: [["b", EntityType.FRUIT_CANNON]] });
  assert.deepEqual(b.exploded, []);
  assert.deepEqual(b.meshes(), names(b, TILE, EntityType.FRUIT_CANNON));
  // under cream too
  const creamed = board(true, {
    1.1: [
      ["c", CREAM],
      ["a", EntityType.RUM_TRUFFLE_CANNON],
    ],
  });
  creamed.show({
    1.1: [
      ["c", CREAM],
      ["b", EntityType.FRUIT_CANNON],
    ],
  });
  assert.deepEqual(creamed.exploded, []);
  assert.deepEqual(
    creamed.meshes(),
    names(creamed, TILE, AROUND, EntityType.FRUIT_CANNON)
  );
});

test("a caught bunny turns the Xmas factory into a ballista without a burst, on both boards", () => {
  for (const own of [true, false]) {
    const b = board(own, { 1.1: [["x", EntityType.XMAS_FACTORY]] });
    b.show({ 1.1: [["y", EntityType.HOT_CHOCOLATE_BALLISTA]] });
    assert.deepEqual(b.exploded, []);
    assert.deepEqual(
      b.meshes(),
      names(b, TILE, EntityType.HOT_CHOCOLATE_BALLISTA)
    );
  }
});

test("own board: a caught bunny bursts, its cream stays as plain cream", () => {
  const b = board(true, {
    1.1: [
      ["c", CREAM],
      ["s", SPYING_EASTER_BUNNY],
    ],
  });
  b.show({ 1.1: [["c", CREAM]] });
  assert.deepEqual(b.exploded, [b.name(SPYING_EASTER_BUNNY)]);
  assert.deepEqual(b.meshes(), names(b, TILE, CREAM));
});

test("own board: a donut takes the tile's place and a triggered trap gives it back, quietly", () => {
  const donut = EntityType.DONUT_STOP_PINK;
  const b = board(true, {});
  b.show({ 1.1: [["d", donut]] });
  assert.deepEqual(b.meshes(), names(b, donut));
  b.show({});
  assert.deepEqual(b.meshes(), names(b, TILE));
  // cream over a donut: the trap goes off, the cream stays
  b.show({ 1.1: [["d", donut]] });
  b.show({
    1.1: [
      ["c", CREAM],
      ["d", donut],
    ],
  });
  assert.deepEqual(b.meshes(), names(b, CREAM, donut));
  b.show({ 1.1: [["c", CREAM]] });
  assert.deepEqual(b.meshes(), names(b, TILE, CREAM));
  assert.deepEqual(b.exploded, []);
});

test("opponent board: donuts never show", () => {
  const b = board(false, { 1.1: [["d", EntityType.DONUT_STOP_PINK]] });
  assert.deepEqual(b.meshes(), names(b, TILE));
  b.show({});
  assert.deepEqual(b.meshes(), names(b, TILE));
  assert.deepEqual(b.exploded, []);
});

test("a cell melts: the tile goes in a spray of hot chocolate, once", () => {
  const b = board(true, {});
  b.show({}, ["1.1"]);
  assert.deepEqual(b.melted, [b.name(TILE)]);
  // the next views come before the tile is gone
  b.show({}, ["1.1"]);
  assert.deepEqual(b.melted, [b.name(TILE)]);
  mock.timers.tick(1000);
  assert.deepEqual(b.meshes(), []);
  mock.timers.tick(5000);
  assert.equal(b.loops(), 0);
});

test("own board: a donut's cell melts, the donut goes with it", () => {
  const b = board(true, { 1.1: [["d", EntityType.DONUT_STOP_PINK]] });
  b.show({}, ["1.1"]);
  mock.timers.tick(5000);
  assert.deepEqual(b.meshes(), []);
  assert.equal(b.loops(), 0);
});

test("a cell melts with cream and a factory on it: they burst, the factory a second later", () => {
  const b = board(true, {
    1.1: [
      ["c", CREAM],
      ["f", FACTORY],
    ],
  });
  b.show({}, ["1.1"]);
  assert.deepEqual(b.melted, [b.name(TILE)]);
  assert.deepEqual(b.exploded, [b.name(AROUND)]);
  mock.timers.tick(1000);
  assert.deepEqual(b.exploded, [b.name(AROUND), b.name(FACTORY)]);
  assert.deepEqual(b.meshes(), []);
  // the opponent's creamed cell
  const opponent = board(false, { 1.1: [["c", CREAM]] });
  opponent.show({}, ["1.1"]);
  assert.deepEqual(opponent.melted, [opponent.name(TILE)]);
  assert.deepEqual(opponent.exploded, [opponent.name(CREAM)]);
});

test("opponent board: a creamed cell shows only its cream; shot away, the building appears", () => {
  // a view from before the fog of war came from the server, with the building under the cream
  const unredacted = board(false, {
    1.1: [
      ["c", CREAM],
      ["f", FACTORY],
    ],
  });
  assert.deepEqual(unredacted.meshes(), names(unredacted, TILE, CREAM));
  // the view has only the cream of a creamed cell of the opponent
  const b = board(false, { 1.1: [["c", CREAM]] });
  assert.deepEqual(b.meshes(), names(b, TILE, CREAM));
  b.show({ 1.1: [["f", FACTORY]] });
  assert.deepEqual(b.meshes(), names(b, TILE, FACTORY));
  // the cream simply makes way: the shot's own burst comes from the event (matchEffects.detonate)
  assert.deepEqual(b.exploded, []);
  b.show({});
  assert.deepEqual(b.exploded, [b.name(FACTORY)]);
});

test("a disposed board leaves nothing behind: no meshes, no explosion to come, the render loop balanced", () => {
  const b = board(true, {
    1.1: [
      ["c", CREAM],
      ["f", FACTORY],
    ],
    "0.0": [["t", CACAOTREE]],
  });
  b.show({ "0.0": [["t", CACAOTREE]] }, ["1.1"]);
  assert.ok(b.loops() > 0);
  b.gamefield.dispose();
  assert.deepEqual(
    b.scene.meshes.filter(
      (mesh) => !mesh.isDisposed() && mesh.name.startsWith("0.")
    ),
    []
  );
  assert.equal(b.loops(), 0);
  // the factory under the cream would have burst a second later
  mock.timers.tick(5000);
  assert.deepEqual(b.exploded, [b.name(AROUND)]);
  assert.equal(b.loops(), 0);
});

test("the opponent's weapons face the own board", () => {
  const b = board(false, {
    1.1: [["a", EntityType.RUM_TRUFFLE_CANNON]],
    "0.0": [["t", CACAOTREE]],
  });
  assert.equal(b.find(EntityType.RUM_TRUFFLE_CANNON)[0].rotation.y, Math.PI);
  assert.equal(b.find(CACAOTREE)[0].rotation.y, 0);
});

test("a factory extension turns its pipes to the factory", () => {
  // rows ≠ cols, so a mix-up of the two would show
  const size = { rows: 3, cols: 4 };
  const turn = (factory) =>
    board(
      true,
      { 1.1: [["e", FACTORY_EXTENSION]], [factory]: [["f", FACTORY]] },
      [],
      size
    ).find(FACTORY_EXTENSION)[0].rotation.y;
  assert.equal(turn("1.2"), 0);
  assert.equal(turn("0.1"), -Math.PI / 2);
  assert.equal(turn("2.1"), Math.PI / 2);
  assert.equal(turn("1.0"), Math.PI);
});

test("board meshes know their cell for the scene's taps; the fountain's shield is not pickable", () => {
  const b = board(
    true,
    { 1.1: [["t", CACAOTREE]], 2.2: [["f", CHOCOLATE_FOUNTAIN]] },
    [],
    undefined,
    {
      shield: true,
    }
  );
  const [tree] = b.find(CACAOTREE);
  assert.deepEqual(
    { ...tree.metadata, gamefield: tree.metadata.gamefield === b.gamefield },
    {
      gamefield: true,
      row: 1,
      col: 1,
    }
  );
  const fountain = b.find(CHOCOLATE_FOUNTAIN);
  assert.equal(fountain.length, 2);
  assert.deepEqual(
    fountain.map((mesh) => mesh.isPickable),
    [true, false]
  );
});
