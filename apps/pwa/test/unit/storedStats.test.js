// The stats as the device keeps them (node --test): never with the notices about minted items,
// which show only from stats the server answered in this session (src/storedStats.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { keptWithoutNotices, withoutNotices } from "../../src/storedStats.js";

const notice = {
  id: "notice-1",
  kind: "departed",
  item: { id: "item-1", item: "HEAVY_BARREL", serial: 4 },
  building: null,
  at: "2026-11-01T08:00:00.000Z",
};

// a store as OfflineStore.wrapObjectStore makes one, over a Map
const memoryStore = () => {
  const entries = new Map();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
    add: async (key, value) => {
      if (entries.has(key)) {
        throw new Error("ConstraintError");
      }
      entries.set(key, value);
    },
    delete: async (key) => void entries.delete(key),
    clear: async () => entries.clear(),
    keys: async () => [...entries.keys()],
  };
};

test("the stats without their notices, the rest as it is; other values untouched", () => {
  const stats = { username: "Mira", score: 10, notices: [notice] };
  assert.deepEqual(withoutNotices(stats), { username: "Mira", score: 10 });
  assert.deepEqual(stats.notices, [notice], "the stats given are not changed");
  const plain = { username: "Mira" };
  assert.equal(withoutNotices(plain), plain);
  assert.equal(withoutNotices(undefined), undefined);
  assert.equal(withoutNotices(null), null);
});

test("stats written to the device keep no notices, by set and by add", async () => {
  const raw = memoryStore();
  const store = keptWithoutNotices(raw);
  await store.set("stats", { username: "Mira", notices: [notice] });
  assert.deepEqual(raw.entries.get("stats"), { username: "Mira" });
  await raw.delete("stats");
  await store.add("stats", { username: "Ann", notices: [notice] });
  assert.deepEqual(raw.entries.get("stats"), { username: "Ann" });
});

test("stats stored before this rule are read without their notices", async () => {
  const raw = memoryStore();
  raw.entries.set("stats", { username: "Mira", notices: [notice] });
  const store = keptWithoutNotices(raw);
  assert.deepEqual(await store.get("stats"), { username: "Mira" });
  assert.equal(await store.get("nothing"), undefined);
});

test("the store's other entries and calls pass through", async () => {
  const raw = memoryStore();
  const store = keptWithoutNotices(raw);
  const account = { playerId: "p1", notices: "not stats" };
  await store.set("account", account);
  assert.equal(raw.entries.get("account"), account);
  assert.equal(await store.get("account"), account);
  assert.deepEqual(await store.keys(), ["account"]);
  await store.delete("account");
  await store.set("stats", { username: "Mira" });
  await store.clear();
  assert.deepEqual(await store.keys(), []);
});
