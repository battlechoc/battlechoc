// The catalog of pictures and models (node --test): every entry names a file the game ships, and
// every building, attack and donut the palettes offer has its picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EntityType,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";
import {
  BUILDING_ICON,
  ATTACK_ICON,
  DONUT_ICON,
  BUILD_PALETTE,
  WEAPON_PALETTE,
  LAB_BUILDINGS,
  MODEL,
  iconUrl,
  catalogIconFiles,
} from "../../src/catalog.js";

const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public"
);
const shipped = (url) => fs.existsSync(path.join(publicDir, url));

test("every icon is a picture in public/images", () => {
  for (const name of [
    ...Object.values(BUILDING_ICON),
    ...Object.values(ATTACK_ICON),
    ...Object.values(DONUT_ICON),
  ]) {
    assert.ok(shipped(iconUrl(name)), iconUrl(name));
  }
  for (const file of catalogIconFiles()) {
    assert.ok(shipped(`/images/${file}`), file);
  }
});

test("every model is a file in public/models", () => {
  for (const file of new Set(Object.values(MODEL))) {
    assert.ok(shipped(`/models/${file}`), file);
  }
});

test("the palettes have a picture for each entry", () => {
  for (const type of [...BUILD_PALETTE, ...LAB_BUILDINGS]) {
    assert.equal(typeof BUILDING_ICON[type], "string", type);
  }
  for (const type of WEAPON_PALETTE) {
    assert.equal(typeof ATTACK_ICON[type], "string", type);
  }
  assert.deepEqual(
    [...WEAPON_PALETTE].sort(),
    Object.values(AttackType)
      .filter((type) => ATTACK_ICON[type])
      .sort()
  );
});

test("every donut has a picture and a model", () => {
  const donuts = Object.values(EntityType).filter(
    (type) =>
      typeof type === "string" &&
      type.includes("DONUT_") &&
      type !== EntityType.DONUT_FACTORY
  );
  assert.ok(donuts.length >= 6);
  for (const type of donuts) {
    assert.equal(typeof DONUT_ICON[type], "string", type);
    assert.equal(MODEL[type], "donut.glb", type);
  }
});
