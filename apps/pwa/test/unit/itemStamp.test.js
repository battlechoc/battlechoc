// The stamp's look scales with the icon (node --test): the gold rim, the dark ring and the outer
// gold ring in the mockup's proportions, never under one pixel; the serial tag below the rim and
// the badge (src/ui/lab/itemText.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAMP, MINT } from "../../src/ui/lab/itemText.js";

test("the ring: 5 % gold rim, 3 % dark ring, 4 % outer gold of the icon's diameter", () => {
  const ring = STAMP.ring("6em");
  assert.equal(
    ring.boxShadow,
    `inset 0 0 0 max(1px, calc(6em * 0.05)) ${MINT.gold}, ` +
      `0 0 0 max(1px, calc(6em * 0.03)) ${MINT.dark}, ` +
      `0 0 0 calc(max(1px, calc(6em * 0.03)) + max(1px, calc(6em * 0.04))) ${MINT.gold}, ` +
      "0 0.1em 0.25em rgba(0, 0, 0, 0.35)"
  );
});

test("the serial tag sits against the ring's outer edge, a pixel into it; the room it needs below the icon", () => {
  // the dark and the outer gold ring as the stamp's box-shadow spreads them (the same terms)
  const outer = "max(1px, calc(6em * 0.03)) + max(1px, calc(6em * 0.04))";
  assert.ok(STAMP.ring("6em").boxShadow.includes(`calc(${outer})`));
  assert.equal(STAMP.tag("6em").top, `calc(100% + ${outer} - 1px)`);
  assert.equal(STAMP.tagRoom("6em"), `calc(${outer} - 1px + 1.125em + 4px)`);
  // centred, in the mockup's gold
  assert.equal(STAMP.tag("6em").left, "50%");
  assert.equal(STAMP.tag("6em").transform, "translateX(-50%)");
  assert.equal(STAMP.tag("6em").background, MINT.gold);
});

test("an item that is gone: a dark face, a light dashed rim in proportion", () => {
  assert.equal(STAMP.away.face, "#5C7482");
  assert.equal(
    STAMP.away.rim("4.5em"),
    "max(2px, calc(4.5em * 0.055)) dashed #B7C7D1"
  );
});
