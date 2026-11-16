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
// What a mint and a burn cost, the "about" numbers the game shows before the wallet opens: each
// network fee is its largest measured case × 1.1, the deposit its largest measured case as it
// is, both rounded up to 10_000 lovelace. Measured 2026-11-15 by
// apps/api/scripts/chain/measure-costs.js (every item, serial 1_000_000, in four wallets, and a
// fee split 9:1 to two receivers) against the fixed preprod parameters (minFeeA 44, minFeeB
// 155_381, coinsPerUtxoByte 4310, priceMem 0.0577, priceStep 0.0000721) with the local
// evaluator; apps/api/test/chain.costs.test.js fails when one drifts. Largest cases:
// - mint network fee 442_539 (an EPIC item, the split fee, six inputs at two wallet keys with
//   tokens in the change); 413_757 with one key and one input; 409_025 at the least
// - deposit 3_710_910 = reference 2_448_080 (SUGAR_FERTILIZER, MARZIPAN_CARROTS: their key and
//   name make the longest datum) + user 1_262_830 (at a base address; 1_142_150 at an enterprise
//   address)
// - burn network fee 368_106 (two wallet keys, tokens in the change); 361_515 with one key
// The battlechoc fee is in none of them: it comes from the config (1 / 2 / 4 ADA by tier on
// preprod), and what a wallet must hold is MINT_NEEDED_ESTIMATE_LOVELACE plus that fee.
const MINT_NETWORK_FEE_ESTIMATE_LOVELACE = 490_000;
const MINT_DEPOSIT_ESTIMATE_LOVELACE = 3_720_000;
const BURN_NETWORK_FEE_ESTIMATE_LOVELACE = 410_000;
// What a burn gives back to the wallet before it is built: the reference token's part of the
// deposit (its largest measured case above, 2_448_080, rounded up to 10_000 lovelace as the
// others). The user token's part (1_262_830) is not in it: that ADA sat with the token in the
// wallet all along and is only free again.
const BURN_DEPOSIT_BACK_ESTIMATE_LOVELACE = 2_450_000;
// The mint network fee estimate covers a wallet of up to 6 inputs at 2 of its keys (the largest
// case spent that many). For a larger wallet the funds check adds per input and per key beyond
// those, and per byte of tokens the change (or the collateral return) must carry: the largest
// measured step × 1.1, rounded up to 100 lovelace (per byte: to 1). Measured by the same script on
// the largest case's mint (an EPIC item, the split fee): inputs 1 → 31 at one key, 2_003 per input
// (36 bytes and the validator's walk over them); 12 inputs at 1 → 12 keys, 4_444 per key (a
// witness of 101 bytes); 2 → 80 NFTs in the change, 44 per byte (minFeeA, nothing more).
const MINT_NETWORK_FEE_ESTIMATE_INPUTS = 6;
const MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS = 2;
const MINT_FEE_PER_INPUT_LOVELACE = 2_300;
const MINT_FEE_PER_WALLET_KEY_LOVELACE = 4_900;
const MINT_FEE_PER_CHANGE_BYTE_LOVELACE = 49;
// what a mint needs from a wallet besides the battlechoc fee: the network fee, the deposits of
// both token outputs and the change, at least the collateral
const MINT_NEEDED_ESTIMATE_LOVELACE = Math.max(COLLATERAL_LOVELACE, MINT_NETWORK_FEE_ESTIMATE_LOVELACE + MINT_DEPOSIT_ESTIMATE_LOVELACE + CHANGE_RESERVE_LOVELACE);

// the index of a tier into a fee option's `amounts` (the order of Tier in equipment.js and of
// the items validator: COMMON 0, RARE 1, EPIC 2)
const TIER_ORDER = Object.freeze(['COMMON', 'RARE', 'EPIC']);

// CIP-67 labels: the reference token (100), which carries the datum, and the user token (222)
const REFERENCE_LABEL = '000643b0';
const USER_LABEL = '000de140';

// An item key is never renamed or removed once it may have been minted; retire an item by its
// recipe, never its key (equipment.js). `kebab` never changes: every token's picture URL is the
// key in kebab case, in its datum for good.
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
    MINT_NETWORK_FEE_ESTIMATE_LOVELACE,
    MINT_DEPOSIT_ESTIMATE_LOVELACE,
    BURN_NETWORK_FEE_ESTIMATE_LOVELACE,
    BURN_DEPOSIT_BACK_ESTIMATE_LOVELACE,
    MINT_NETWORK_FEE_ESTIMATE_INPUTS,
    MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS,
    MINT_FEE_PER_INPUT_LOVELACE,
    MINT_FEE_PER_WALLET_KEY_LOVELACE,
    MINT_FEE_PER_CHANGE_BYTE_LOVELACE,
    MINT_NEEDED_ESTIMATE_LOVELACE,
    TIER_ORDER,
    REFERENCE_LABEL,
    USER_LABEL,
    itemImageUrl,
    itemPageUrl,
};
