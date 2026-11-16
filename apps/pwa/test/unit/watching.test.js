// What the minting watcher follows (MintWatcher.jsx, plan D, and plan E's salvages; node --test):
// the operations the stats mark, whether an item is being salvaged, and how often the stats are
// read again while one is.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  operationsOf,
  salvaging,
  STATS_RELOAD,
  statsReloadGap,
} from "../../src/ui/mint/watching.js";

const item = (id, minted) => ({
  id,
  item: "TURBO_CONVEYOR",
  serial: 1,
  minted,
});

test("the operations to follow: minting ones, salvages signed or in a block, salvages waiting for the signature", () => {
  const items = [
    item("a", null),
    item("b", { state: "minted", assetName: "aa" }),
    item("c", { state: "minting", operationId: "op-c", signing: false }),
    item("d", { state: "burning", operationId: "op-d" }),
    // a burn made outside the game: no operation to follow
    item("e", { state: "burning", operationId: null }),
    item("f", {
      state: "minted",
      assetName: "ff",
      operationId: "op-f",
      signing: true,
      kind: "burn",
    }),
    item("g", { state: "minting", operationId: "op-a", signing: true }),
  ];
  assert.equal(operationsOf(items), "op-a|op-c|op-d|op-f");
  assert.equal(operationsOf([]), "");
  assert.equal(operationsOf(undefined), "");
});

test("an item is being salvaged while its mark says burning, with or without an operation", () => {
  assert.equal(
    salvaging([item("a", { state: "burning", operationId: null })]),
    true
  );
  assert.equal(
    salvaging([item("a", { state: "burning", operationId: "op" })]),
    true
  );
  assert.equal(
    salvaging([
      item("a", {
        state: "minted",
        operationId: "op",
        signing: true,
        kind: "burn",
      }),
      item("b", { state: "minting", operationId: "op-b" }),
      item("c", null),
    ]),
    false
  );
  assert.equal(salvaging(null), false);
});

test("the stats are read every 30 s for the first 10 minutes an item is being salvaged, then every 5 minutes", () => {
  assert.deepEqual(STATS_RELOAD, {
    early: 30000,
    later: 300000,
    earlyFor: 600000,
  });
  assert.equal(statsReloadGap(0), 30000);
  assert.equal(statsReloadGap(599999), 30000);
  assert.equal(statsReloadGap(600000), 300000);
  assert.equal(statsReloadGap(3600000), 300000);
});
