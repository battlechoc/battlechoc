// Minting: turning a game item into a CIP-68 token pair in the player's own Cardano wallet. The
// rules and windows the game and the API share, and the URLs a minted item names (they are part
// of its on-chain datum, so they never change). Numbers, not BigInt: they go to JSON and the
// browser. No Cardano library here, the game loads this file too.

// who may mint (verified online matches), and how often (per player and UTC day)
const MINT_MIN_ONLINE_MATCHES = 10;
const MINTS_PER_DAY = 3;
// tokens in a wallet that was linked to another player before count this long after the new link
const WALLET_HOP_WAIT_MS = 24 * 60 * 60 * 1000;

// the player signs within the sign window; the transaction stays valid a while longer
const SIGN_WINDOW_MS = 10 * 60 * 1000;
const TX_VALIDITY_MS = 20 * 60 * 1000;

// what a wallet needs aside from the costs: the collateral of a Plutus transaction and some change
const COLLATERAL_LOVELACE = 2_000_000;
const CHANGE_RESERVE_LOVELACE = 1_000_000;

// the index of a tier into a fee option's `amounts` (the order of Tier in equipment.js and of
// the items validator: COMMON 0, RARE 1, EPIC 2)
const TIER_ORDER = Object.freeze(['COMMON', 'RARE', 'EPIC']);

// CIP-67 labels: the reference token (100), which carries the datum, and the user token (222)
const REFERENCE_LABEL = '000643b0';
const USER_LABEL = '000de140';

const kebab = key => key.toLowerCase().replace(/_/g, '-');

/** The picture of an item: DARK_WALLS → https://battlechoc.com/items/dark-walls.png */
const itemImageUrl = itemKey => `https://battlechoc.com/items/${kebab(itemKey)}.png`;

/** The page of a minted item, by the hex name of its user token. */
const itemPageUrl = userAssetNameHex => `https://battlechoc.com/item/?a=${userAssetNameHex}`;

module.exports = {
    MINT_MIN_ONLINE_MATCHES,
    MINTS_PER_DAY,
    WALLET_HOP_WAIT_MS,
    SIGN_WINDOW_MS,
    TX_VALIDITY_MS,
    COLLATERAL_LOVELACE,
    CHANGE_RESERVE_LOVELACE,
    TIER_ORDER,
    REFERENCE_LABEL,
    USER_LABEL,
    itemImageUrl,
    itemPageUrl,
};
