// Salvaging a plain item in the lab: the item is gone, half of each amount of its (current)
// recipe comes back as fresh ingredients, the crafting fee does not. Its serial stays used.
// Because the current recipe decides, an existing recipe never gets a rare or legendary amount
// raised and no other amount more than doubled (packages/shared/salvage.js).

const { salvageReturns } = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const pantry = require('../pantry');
const ops = require('../chain/ops');
const { HttpError, ErrorCode } = require('../errors');

// the states of the operations that ended, as SQL (chain_ops.item_id has no ON DELETE)
const { ENDED_IN } = ops;

/**
 * Salvages the player's item `itemId`; `client` is a transaction client, `now` a millisecond
 * timestamp. Resolves with { returned, equipment }: the ingredients that came back and the
 * player's equipment without the item.
 */
const salvagePlain = async (client, { playerId, itemId, recipes, now }) => {
    // the row stays locked until the commit, so a second salvage of the item finds it gone
    const { rows } = await client.query('SELECT id, item_key, asset_name FROM items WHERE id = $1 AND player_id = $2 FOR UPDATE', [itemId, playerId]);
    if (rows.length === 0) {
        throw new HttpError(400, ErrorCode.NOT_YOUR_ITEM);
    }
    // a minted item (its asset name is set when its mint is in a block): deleting the row would
    // leave its token on the chain with no item behind it. An item whose mint is not yet in a
    // block has no asset name and is not caught here.
    if (rows[0].asset_name !== null) {
        throw new HttpError(409, ErrorCode.ITEM_MINTED);
    }
    // an item a mint holds (prepared or sent, not in a block yet: no asset name); a prepared one
    // whose sign window is over lets it go
    const open = await ops.expireLapsed(client, await ops.openForItem(client, itemId), now);
    if (open && ops.OPEN.includes(open.state)) {
        throw new HttpError(409, ErrorCode.ITEM_BUSY);
    }
    const recipe = recipes.get(rows[0].item_key);
    if (!recipe) {
        throw new HttpError(400, ErrorCode.NO_RECIPE);
    }
    const returned = salvageReturns(recipe.amounts);
    // item_serials is left alone: a serial is never given twice. The item's ended operations
    // (cancelled, not signed, rejected) go with it; an open one would refuse the delete.
    await client.query(`DELETE FROM chain_ops WHERE item_id = $1 AND state IN ${ENDED_IN}`, [itemId]);
    await client.query('DELETE FROM items WHERE id = $1', [itemId]);

    const equipment = players.equipmentWithout(players.equipmentOf(await players.findPlayer(client, playerId)), itemId);
    await client.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify(equipment), playerId]);

    // new batches: spoiling ingredients get their full shelf life from now
    await pantry.add(client, playerId, Object.entries(returned).map(([ingredient, amount]) => ({ ingredient, amount })), now);
    return { returned, equipment };
};

module.exports = { salvagePlain };
