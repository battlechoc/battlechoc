// What a board cell shows in 3D and how its meshes leave (src/3d/cellMeshes.js, no Babylon).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EntityType,
  BoardCellTypes,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cellMeshes,
  departure,
  CREAM_AROUND_BUILDING,
  TILE,
} from "../../src/3d/cellMeshes.js";

const { CREAM, FACTORY, CACAOTREE, DONUT_STOP_PINK } = EntityType;
const tile = { phenotype: BoardCellTypes.WHITE, id: TILE };

const cell = (entities = [], molten = false) => ({
  type: BoardCellTypes.WHITE,
  row: 2,
  col: 3,
  molten,
  occupiedBy: entities.map(([id, type]) => ({ id, type })),
});

test("an empty cell shows its tile on both boards; a molten one nothing", () => {
  for (const own of [true, false]) {
    assert.deepEqual(cellMeshes(cell(), own), [tile]);
    assert.deepEqual(cellMeshes(cell([], true), own), []);
  }
});

test("own board: cream over a building leaves room for it, plain cream does not", () => {
  assert.deepEqual(cellMeshes(cell([["c", CREAM]]), true), [
    tile,
    { phenotype: CREAM, id: "c" },
  ]);
  assert.deepEqual(
    cellMeshes(
      cell([
        ["c", CREAM],
        ["t", CACAOTREE],
      ]),
      true
    ),
    [
      tile,
      { phenotype: CREAM_AROUND_BUILDING, id: "c" },
      { phenotype: CACAOTREE, id: "t" },
    ]
  );
});

test("own board: a donut lies in place of the tile; cream over it stays plain cream", () => {
  assert.deepEqual(cellMeshes(cell([["d", DONUT_STOP_PINK]]), true), [
    { phenotype: DONUT_STOP_PINK, id: "d" },
  ]);
  assert.deepEqual(
    cellMeshes(
      cell([
        ["c", CREAM],
        ["d", DONUT_STOP_PINK],
      ]),
      true
    ),
    [
      { phenotype: CREAM, id: "c" },
      { phenotype: DONUT_STOP_PINK, id: "d" },
    ]
  );
});

test("opponent board: no donuts, nothing under cream, the cream always plain", () => {
  assert.deepEqual(cellMeshes(cell([["d", DONUT_STOP_PINK]]), false), [tile]);
  assert.deepEqual(
    cellMeshes(
      cell([
        ["c", CREAM],
        ["f", FACTORY],
      ]),
      false
    ),
    [tile, { phenotype: CREAM, id: "c" }]
  );
  assert.deepEqual(cellMeshes(cell([["f", FACTORY]]), false), [
    tile,
    { phenotype: FACTORY, id: "f" },
  ]);
});

test("departure: what was destroyed bursts, the cream first and the building under it later", () => {
  const before = cell([
    ["c", CREAM],
    ["f", FACTORY],
  ]);
  assert.equal(
    departure({ phenotype: CREAM_AROUND_BUILDING, id: "c" }, before, cell()),
    "burst"
  );
  assert.equal(
    departure({ phenotype: FACTORY, id: "f" }, before, cell()),
    "later"
  );
  // the cream alone shot away: the building stays, the cream bursts
  assert.equal(
    departure(
      { phenotype: CREAM_AROUND_BUILDING, id: "c" },
      before,
      cell([["f", FACTORY]])
    ),
    "burst"
  );
  // without cream the building bursts at once
  assert.equal(
    departure({ phenotype: FACTORY, id: "f" }, cell([["f", FACTORY]]), cell()),
    "burst"
  );
});

test("departure: what stays, is replaced or is a donut goes quietly", () => {
  // the same cream, now plain: the fountain under it broke (that one bursts)
  const before = cell([
    ["f", EntityType.CHOCOLATE_FOUNTAIN],
    ["c", CREAM],
  ]);
  const after = cell([["c", CREAM]]);
  assert.equal(
    departure({ phenotype: CREAM_AROUND_BUILDING, id: "c" }, before, after),
    "away"
  );
  assert.equal(
    departure(
      { phenotype: EntityType.CHOCOLATE_FOUNTAIN, id: "f" },
      before,
      after
    ),
    "burst"
  );
  // a fruit cannon replaces a truffle cannon: the same number of entities
  assert.equal(
    departure(
      { phenotype: EntityType.RUM_TRUFFLE_CANNON, id: "a" },
      cell([["a", EntityType.RUM_TRUFFLE_CANNON]]),
      cell([["b", EntityType.FRUIT_CANNON]])
    ),
    "away"
  );
  // a trap went off under cream that was shot away with it
  assert.equal(
    departure(
      { phenotype: CREAM, id: "c" },
      cell([
        ["c", CREAM],
        ["d", DONUT_STOP_PINK],
      ]),
      cell()
    ),
    "away"
  );
  // a donut never bursts, also when its cell melts
  assert.equal(
    departure(
      { phenotype: DONUT_STOP_PINK, id: "d" },
      cell([["d", DONUT_STOP_PINK]]),
      cell([], true)
    ),
    "away"
  );
});

test("departure: the tile melts with its cell, else it just goes (a donut took its place)", () => {
  assert.equal(departure(tile, cell(), cell([], true)), "melt");
  assert.equal(departure(tile, cell(), cell([["d", DONUT_STOP_PINK]])), "away");
});
