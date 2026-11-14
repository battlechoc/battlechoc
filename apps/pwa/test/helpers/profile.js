// The game's IndexedDB "battlechoc" (src/OfflineStore.js) as the tests prepare and read it:
// store "player" (stats, account), "settings" (unlocks, labIntroSeen, …) and "gamestate"
// (realtime-match). The page must have opened the game once, which creates the stores.

// a reload in the middle (the game reloads after a switch to another account, a moment after it
// stored the new account) destroys the page the operations ran in: they run again in the new page,
// once it has loaded. Each operation gives the same result twice (put, merge, delete, get).
const CUT_OFF = /Execution context was destroyed/;
const TRIES = 5;

// runs the operations in one transaction in the page: { op: "get" | "put" | "merge" | "delete",
// store, key, value }; resolves with what each "get" found
const run = async (page, ops, tries = TRIES) => {
  try {
    return await inPage(page, ops);
  } catch (failure) {
    if (tries <= 1 || !CUT_OFF.test(String(failure && failure.message))) {
      throw failure;
    }
    await page.waitForLoadState("load");
    return run(page, ops, tries - 1);
  }
};

const inPage = (page, ops) =>
  page.evaluate(
    (ops) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const stores = [...new Set(ops.map((op) => op.store))];
          const writes = ops.some((op) => op.op !== "get");
          const tx = open.result.transaction(
            stores,
            writes ? "readwrite" : "readonly"
          );
          const results = [];
          ops.forEach((op, i) => {
            const store = tx.objectStore(op.store);
            if (op.op === "get") {
              const get = store.get(op.key);
              get.onsuccess = () => (results[i] = get.result);
            } else if (op.op === "put") {
              store.put(op.value, op.key);
            } else if (op.op === "delete") {
              store.delete(op.key);
            } else if (op.op === "merge") {
              const get = store.get(op.key);
              get.onsuccess = () =>
                store.put(
                  Object.assign({}, get.result || {}, op.value),
                  op.key
                );
            }
          });
          tx.oncomplete = () => resolve(results);
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    ops
  );

/** Merges `stats` into the stored player stats (the EmptyPlayerStats shape), and with
 * `settings` puts those settings entries in the same transaction. */
export const seedStats = (
  page,
  stats,
  { settings = {}, deleteSettings = [] } = {}
) =>
  run(page, [
    { op: "merge", store: "player", key: "stats", value: stats },
    ...Object.entries(settings).map(([key, value]) => ({
      op: "put",
      store: "settings",
      key,
      value,
    })),
    ...deleteSettings.map((key) => ({ op: "delete", store: "settings", key })),
  ]);

/** Opens `url`, seeds the stats once the game has started (its database exists), opens it again. */
export const openWithStats = async (page, stats, url = "/") => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seedStats(page, stats);
  await page.goto(url, { waitUntil: "networkidle" });
};

/** The value of an entry of a store ("player", "settings", "gamestate"). */
export const readEntry = async (page, store, key) =>
  (await run(page, [{ op: "get", store, key }]))[0];

/** Replaces an entry of a store. */
export const writeEntry = (page, store, key, value) =>
  run(page, [{ op: "put", store, key, value }]);

export const readSetting = (page, key) => readEntry(page, "settings", key);

export const writeSetting = (page, key, value) =>
  writeEntry(page, "settings", key, value);

/** The device account (refresh token, player id) the game registered. */
export const accountOf = (page) => readEntry(page, "player", "account");

/** The game decides once per device what an earlier player keeps (src/unlocks.js, settings key
 * "unlocks"); a test that changes the stats or the unlocks waits for that first. */
export const waitForUnlockDecision = (page) =>
  page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result
            .transaction("settings")
            .objectStore("settings")
            .get("unlocks");
          get.onsuccess = () => resolve(get.result !== undefined);
        };
      })
  );

/** Finished matches for stats.trackRecord: offline the device counts them (shared
 * progression.js: four open the Choclab and online play). */
export const wonMatches = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `seed-${i}`,
    won: true,
    winners: [{ idx: 0 }],
  }));
