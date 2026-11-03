// The outline of the lit cannon cells (src/3d/cannonPick.js): a lone cell keeps its four edges,
// neighbours share one frame without the edge between them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineEdges } from "../../src/3d/cannonPick.js";

const sorted = (edges) => edges.map((edge) => JSON.stringify(edge)).sort();

test("a lone cell has four edges", () => {
  assert.equal(outlineEdges([{ row: 2, col: 3 }]).length, 4);
});

test("two neighbours share one frame of six edges", () => {
  const edges = outlineEdges([
    { row: 2, col: 3 },
    { row: 2, col: 4 },
  ]);
  assert.equal(edges.length, 6);
  // the edge between them is not drawn
  const between = sorted([
    [
      [2.5, 3.5],
      [1.5, 3.5],
    ],
  ])[0];
  assert.ok(!sorted(edges).includes(between));
});

test("a block of four has eight edges, cells apart keep their own", () => {
  const block = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ];
  assert.equal(outlineEdges(block).length, 8);
  assert.equal(outlineEdges([...block, { row: 5, col: 5 }]).length, 12);
});
