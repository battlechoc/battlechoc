// The public data of a minted item (minting plan F): GET /items/:assetName, which the item page
// (battlechoc.com/item/?a=<asset name>, the URL every token's datum carries for good) reads. What
// the token is in the game, from the database and the shared package's Items alone: its item, the
// building, tier and points, today's effects (the current balance, not the one at mint time), its
// serial, when the server saw its mint in a block and when it was salvaged. Nothing of its holder,
// its player, its crafter or its chain operations. No session; answered whether the chain features
// are on or off (a token's page must not vanish while the server's chain is off), never asking the
// provider, the index or the config.
//
// Every name that is not a minted item's user token answers the same 404 UNKNOWN ITEM: one that
// never existed, one whose mint is still open (its name is only the operation's until the mint is
// in a block), one whose key is not an own entry of Items (only a safety net: an item key is never
// removed once it may have been minted, packages/shared/equipment.js), and a malformed one, which
// is refused before any query. So the route tells nothing about what exists beyond the minted
// items, which are public on the chain anyway, and it echoes nothing of the request.

const { Items, chain } = require('@battlechoc/battlechoc-shared-functions');
const { HttpError, ErrorCode } = require('../errors');

// a user token's name as items.asset_name holds it: the CIP-67 label 222 and the 28-byte suffix
// (blake2b-224, chain/names.js assetNamesOf), lower-case hex
const USER_ASSET_NAME = new RegExp(`^${chain.USER_LABEL}[0-9a-f]{56}$`);

// a found item, for a minute in any cache (a salvage shows within it); everything else not at all
const CACHE_FOUND = 'public, max-age=60';

const unknownItem = () => new HttpError(404, ErrorCode.UNKNOWN_ITEM);

/** The answer for an item row: the contract the item page reads (see the route). */
const publicItemOf = row => {
    const item = Items[row.item_key];
    return {
        assetName: row.asset_name,
        item: row.item_key,
        entityType: item.entityType,
        tier: item.tier,
        points: item.points,
        serial: Number(row.serial),
        mintedAt: new Date(row.minted_at).getTime(),
        burnedAt: row.burned_at === null ? null : new Date(row.burned_at).getTime(),
        effects: item.effects,
    };
};

/**
 * GET /items/:assetName → { assetName, item, entityType, tier, points, serial, mintedAt, burnedAt,
 * effects } (times in ms since the epoch, burnedAt null until salvaged; effects Items[item].effects
 * now), Cache-Control public for a minute; else 404 UNKNOWN ITEM. Every answer but a found item's
 * (also a 429 of `limit`, the route's own limit per address, and a 500) is no-store.
 */
const registerItemRoutes = (app, { pool, limit }) => {
    // before the route, so that also what fails before it (the limit, a name Express cannot decode) is not cached
    app.use('/items', (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    app.get('/items/:assetName', limit, async (req, res) => {
        const { assetName } = req.params;
        if (!USER_ASSET_NAME.test(assetName)) {
            throw unknownItem();
        }
        // minted_at is set (with the asset name) only once the mint is in a block
        const { rows } = await pool.query(
            'SELECT item_key, serial, asset_name, minted_at, burned_at FROM items WHERE asset_name = $1 AND minted_at IS NOT NULL', [assetName]);
        if (rows.length === 0 || !Object.prototype.hasOwnProperty.call(Items, rows[0].item_key)) {
            throw unknownItem();
        }
        // the answer differs by Origin (the CORS header): a shared cache must keep one per origin
        res.vary('Origin');
        res.set('Cache-Control', CACHE_FOUND).json(publicItemOf(rows[0]));
    });

    // a name that is not even percent-encoded right, which Express cannot decode: the same 404
    app.use('/items', (error, req, res, next) => {
        next(error instanceof URIError ? unknownItem() : error);
    });
};

module.exports = { registerItemRoutes };
