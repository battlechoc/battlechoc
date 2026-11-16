// The pictures of the item tokens (node --test): public/items/ holds one PNG per item type, at
// the path of the URL the token's metadata names (chain.itemImageUrl), and no PNG of anything
// else but a retired key's (RETIRED_KEYS); each a 512 × 512 picture with an alpha channel whose edge is transparent all round
// (nothing of the icon, its ring, badge or shadow is cut off), that a round crop keeps whole
// (wallets with round thumbnails), and that shows its own item: the ring in its tier's colour,
// a building on the face, a badge beyond the circle, no two pictures alike.
// npm run items:pictures -w apps/pwa makes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Items, chain } from "@battlechoc/battlechoc-shared-functions";
import { TIER_COLORS } from "../../src/ui/lab/itemText.js";

const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public"
);
const itemsDir = path.join(publicDir, "items");
const SIZE = 512;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// where scripts/item-pictures.mjs draws the icon: a 384 px circle, 8 px up and left of the
// middle, its tier ring 0.18em wide at 3.2em
const DIAMETER = 384;
const CENTRE = SIZE / 2 - 8;
const RING = (0.18 / 3.2) * DIAMETER;
// a round crop of the picture: nothing opaque beyond this distance from its middle
const ROUND_CROP = 254;

const pictureOf = (key) =>
  path.join(publicDir, new URL(chain.itemImageUrl(key)).pathname);

// Item keys that left `Items` although a token may name them. None today, and there should be
// none: an item key is never renamed or removed once it may have been minted (retire an item by
// its recipe, never its key; packages/shared/equipment.js). Should one ever leave, it goes here
// and its picture stays, because a token names its picture's URL for good.
const RETIRED_KEYS = [];

/** The chunks of a PNG file: { type, data }. */
const chunks = (file) => {
  const found = [];
  for (let at = SIGNATURE.length; at < file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.toString("latin1", at + 4, at + 8);
    found.push({ type, data: file.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return found;
};

/** The pixels of an 8-bit RGBA PNG without interlacing: RGBA bytes, row by row. */
const pixelsOf = (file) => {
  const all = chunks(file);
  const header = all[0].data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const raw = zlib.inflateSync(
    Buffer.concat(all.filter((c) => c.type === "IDAT").map((c) => c.data))
  );
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(
      raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    );
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? line[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [a, b, c] = [left, up, upLeft].map((v) => Math.abs(p - v));
        predicted = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      line[x] = (line[x] + predicted) & 0xff;
    }
    line.copy(pixels, y * stride);
    previous = line;
  }
  return pixels;
};

/** The pixel at (x, y): [r, g, b, a]. */
const at = (pixels, x, y) => [
  ...pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
];

/** Every pixel with its distance from a point (pixel centres). */
const eachPixel = (pixels, centre, visit) => {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      visit(at(pixels, x, y), distance, x, y);
    }
  }
};

const hex = (colour) =>
  `#${colour
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

const luminance = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

const pictures = new Map(
  Object.keys(Items)
    .filter((key) => fs.existsSync(pictureOf(key)))
    .map((key) => [key, fs.readFileSync(pictureOf(key))])
);

test("public/items/ holds the picture of every item type and no other PNG but a retired key's", () => {
  const expected = Object.keys(Items)
    .map((key) => path.basename(pictureOf(key)))
    .sort();
  assert.equal(expected.length, Object.keys(Items).length);
  assert.equal(new Set(expected).size, expected.length);
  const retired = new Set(
    RETIRED_KEYS.map((key) => path.basename(pictureOf(key)))
  );
  // other files (a .DS_Store once Finder looked in) are not pictures
  const pngs = fs
    .readdirSync(itemsDir)
    .filter((name) => name.toLowerCase().endsWith(".png"));
  assert.deepEqual(pngs.filter((name) => !retired.has(name)).sort(), expected);
  for (const key of Object.keys(Items)) {
    assert.equal(path.dirname(pictureOf(key)), itemsDir, key);
  }
});

test("no two pictures are alike", () => {
  assert.equal(pictures.size, Object.keys(Items).length);
  const digests = [...pictures.values()].map((file) =>
    crypto.createHash("sha256").update(pixelsOf(file)).digest("hex")
  );
  assert.equal(new Set(digests).size, digests.length);
});

for (const key of Object.keys(Items)) {
  test(`${key}: a 512 × 512 PNG with alpha, transparent at its edge, of a sane size`, () => {
    const file = fs.readFileSync(pictureOf(key));
    assert.ok(file.subarray(0, 8).equals(SIGNATURE), "the PNG signature");
    const [header] = chunks(file);
    assert.equal(header.type, "IHDR");
    assert.equal(header.data.readUInt32BE(0), SIZE, "width");
    assert.equal(header.data.readUInt32BE(4), SIZE, "height");
    assert.equal(header.data[8], 8, "8 bits per channel");
    assert.equal(header.data[9], 6, "colour type 6: RGBA");
    assert.equal(header.data[12], 0, "not interlaced");
    assert.ok(
      file.length > 20_000 && file.length < 400_000,
      `${file.length} B`
    );
    const pixels = pixelsOf(file);
    let edge = 0;
    eachPixel(pixels, SIZE / 2, ([, , , alpha], _distance, x, y) => {
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
        edge = Math.max(edge, alpha);
      }
    });
    assert.equal(edge, 0, "the edge is transparent");
    assert.equal(at(pixels, CENTRE, CENTRE)[3], 255, "the icon is opaque");
  });

  test(`${key}: a round crop of the picture keeps the icon and its badge whole`, () => {
    const pixels = pixelsOf(fs.readFileSync(pictureOf(key)));
    let farthest = 0;
    eachPixel(pixels, SIZE / 2, ([, , , alpha], distance) => {
      if (alpha >= 128) farthest = Math.max(farthest, distance);
    });
    assert.ok(
      farthest <= ROUND_CROP,
      `opaque out to ${farthest.toFixed(1)} px from the middle`
    );
  });

  test(`${key}: the ring in its tier's colour, a building on the face, a badge beyond the circle`, () => {
    const pixels = pixelsOf(fs.readFileSync(pictureOf(key)));
    // the middle of the ring at its left, top and right
    const middle = DIAMETER / 2 - RING / 2;
    const ring = TIER_COLORS[Items[key].tier].ring.toLowerCase();
    for (const [x, y] of [
      [CENTRE - middle, CENTRE],
      [CENTRE, CENTRE - middle],
      [CENTRE + middle, CENTRE],
    ]) {
      const colour = at(pixels, Math.floor(x), Math.floor(y));
      assert.equal(hex(colour), ring, `the ring at ${x}, ${y}`);
      assert.equal(colour[3], 255);
    }
    // the face is a light gradient (every tier's fill is lighter than 210): darker pixels round
    // the middle are the building
    let dark = 0;
    let all = 0;
    const box = DIAMETER * 0.2;
    eachPixel(pixels, CENTRE, (colour, _distance, x, y) => {
      if (
        Math.abs(x + 0.5 - CENTRE) <= box &&
        Math.abs(y + 0.5 - CENTRE) <= box
      ) {
        all += 1;
        if (luminance(colour) < 160) dark += 1;
      }
    });
    assert.ok(dark / all > 0.1, `the building: ${dark} of ${all} pixels`);
    // beyond the circle only the shadow (at most 35 % opaque) and the badge
    let badge = 0;
    eachPixel(pixels, CENTRE, ([, , , alpha], distance) => {
      if (distance > DIAMETER * 0.53 && alpha >= 250) badge += 1;
    });
    assert.ok(
      badge > 1000,
      `the badge: ${badge} opaque pixels beyond the circle`
    );
  });
}
