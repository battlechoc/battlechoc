// The fruit cannon's light (node --test): the scene's state only changes when the picture of the
// lit columns changes, not on every rendered frame while the pools of light breathe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSpots } from "../../src/3d/cannonPick.js";

const column = (dx = 0, dy = 0) => [
  [
    [100 + dx, 200 + dy],
    [140 + dx, 180 + dy],
    [180 + dx, 200 + dy],
    [140 + dx, 220 + dy],
  ],
  [
    [100 + dx, 160 + dy],
    [140 + dx, 140 + dy],
    [180 + dx, 160 + dy],
    [140 + dx, 180 + dy],
  ],
  [
    [100 + dx, 200 + dy],
    [100 + dx, 160 + dy],
    [180 + dx, 160 + dy],
    [180 + dx, 200 + dy],
  ],
];

test("the same picture again, also within a tenth of a pixel, is the same", () => {
  const spots = { lights: [column()], blur: 4.5 };
  assert.equal(sameSpots(spots, { lights: [column()], blur: 4.5 }), true);
  assert.equal(
    sameSpots(spots, { lights: [column(0.03, -0.04)], blur: 4.5 }),
    true
  );
});

test("a moved column, another blur, another number of cannons: not the same", () => {
  const spots = { lights: [column()], blur: 4.5 };
  assert.equal(sameSpots(spots, { lights: [column(0.3)], blur: 4.5 }), false);
  assert.equal(sameSpots(spots, { lights: [column()], blur: 4.6 }), false);
  assert.equal(
    sameSpots(spots, { lights: [column(), column(50)], blur: 4.5 }),
    false
  );
});

test("nothing shown is only the same as nothing shown", () => {
  assert.equal(sameSpots(null, null), true);
  assert.equal(sameSpots(null, { lights: [column()], blur: 4.5 }), false);
  assert.equal(sameSpots({ lights: [column()], blur: 4.5 }, null), false);
});
