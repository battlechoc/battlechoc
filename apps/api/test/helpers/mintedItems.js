// Marking an item minted as plan D marks it once its mint is in a block, without Jest: the API
// tests (helpers/minting.js) and the browser tests' API (test/e2eServer.js, plain node) share it.

/** Marks the item minted: its asset_name and minted_at. */
const markMinted = (pool, itemId, assetName, at = new Date()) => pool.query('UPDATE items SET asset_name = $2, minted_at = $3 WHERE id = $1', [itemId, assetName, at]);

module.exports = { markMinted };
