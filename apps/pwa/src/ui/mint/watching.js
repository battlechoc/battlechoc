// What the minting watcher (MintWatcher.jsx) follows, kept free of React so node tests it
// (test/unit/watching.test.js): the operations the stats mark (minting, and plan E's salvages),
// whether an item is being salvaged, and how often the stats are read again while one is.

// an item's mark with an operation to follow: being minted, being salvaged (plan E: signed or in
// a block), or a salvage waiting for its signature (it may be signed on a phone)
const followed = (mark) =>
  Boolean(mark) &&
  typeof mark.operationId === "string" &&
  (["minting", "burning"].includes(mark.state) || mark.kind === "burn");

/**
 * The operations the stats' `items` mark as being minted or salvaged, as a stable key
 * ("id|id").
 */
export const operationsOf = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((entry) => entry && followed(entry.minted))
    .map((entry) => entry.minted.operationId)
    .sort()
    .join("|");

/** Whether the stats' `items` hold one being salvaged (its ingredients not credited yet). */
export const salvaging = (items) =>
  (Array.isArray(items) ? items : []).some(
    (entry) => entry && entry.minted && entry.minted.state === "burning"
  );

/**
 * How often the stats are read again while an item is being salvaged (ms): every `early` for
 * the first `earlyFor` (its ingredients usually arrive within that), then every `later` (a burn
 * that waits for the network, or a credit the server holds back).
 */
export const STATS_RELOAD = Object.freeze({
  early: 30000,
  later: 300000,
  earlyFor: 600000,
});

/** The gap before the next read of the stats, `elapsed` ms after an item began being salvaged. */
export const statsReloadGap = (elapsed) =>
  elapsed < STATS_RELOAD.earlyFor ? STATS_RELOAD.early : STATS_RELOAD.later;
