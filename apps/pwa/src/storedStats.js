// The player's stats as the device keeps them (OfflineStore's player store, key "stats"): never
// with the notices about minted items (stats.notices). A notice shows only from stats the server
// answered in this session: a stored one could have been answered on another device, or
// withdrawn by the server after a rollback, and it would show at the start, before the server's
// stats arrive, and vanish with them. Stats a device stored before this rule are read without
// their notices. Plain functions, so the rule has unit tests (test/unit/storedStats.test.js).

const STATS = "stats";

/** `stats` without its `notices` (a copy; anything else, and stats without notices, as given). */
export const withoutNotices = (stats) => {
  if (!stats || typeof stats !== "object" || !("notices" in stats)) {
    return stats;
  }
  const { notices, ...rest } = stats;
  return rest;
};

/**
 * `store` (OfflineStore.wrapObjectStore's get, set, add, delete, clear, keys) with its entry
 * "stats" written and read without notices; every other entry and call as the store has it.
 */
export const keptWithoutNotices = (store) => ({
  ...store,
  get: async (key) =>
    key === STATS ? withoutNotices(await store.get(key)) : store.get(key),
  set: (key, value) =>
    store.set(key, key === STATS ? withoutNotices(value) : value),
  add: (key, value) =>
    store.add(key, key === STATS ? withoutNotices(value) : value),
});
