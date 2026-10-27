// A player's ingredients, stored as batches. Spoiling batches carry expires_at; spoiled ones
// stop counting at once and are deleted by `cleanup`. `db` is a pool or a transaction client,
// `now` a millisecond timestamp.

const crypto = require('crypto');
const { Ingredients } = require('@battlechoc/battlechoc-shared-functions');

class NotEnoughIngredientsError extends Error {
    constructor(ingredient) {
        super(`not enough ${ingredient}`);
        this.ingredient = ingredient;
    }
}

const FRESH = 'player_id = $1 AND (expires_at IS NULL OR expires_at > $2) AND amount > 0';

const add = async (db, playerId, items, now) => {
    for (const { ingredient, amount } of items) {
        const definition = Ingredients[ingredient];
        if (!definition || !(amount > 0)) {
            continue;
        }
        const expiresAt = definition.shelfLifeMs === null ? null : new Date(now + definition.shelfLifeMs);
        await db.query('INSERT INTO pantry (id, player_id, ingredient, amount, expires_at) VALUES ($1, $2, $3, $4, $5)',
            [crypto.randomUUID(), playerId, ingredient, amount, expiresAt]);
    }
};

const totals = async (db, playerId, now) => {
    const { rows } = await db.query(
        `SELECT ingredient, SUM(amount) AS n FROM pantry WHERE ${FRESH} GROUP BY ingredient`, [playerId, new Date(now)]);
    return Object.fromEntries(rows.map(row => [row.ingredient, Number(row.n)]).filter(([, n]) => n > 0));
};

const spoiling = async (db, playerId, now) => {
    const { rows } = await db.query(
        'SELECT ingredient, amount, expires_at FROM pantry WHERE player_id = $1 AND expires_at > $2 AND amount > 0 ORDER BY expires_at',
        [playerId, new Date(now)]);
    return rows.map(row => ({ ingredient: row.ingredient, amount: Number(row.amount), expiresAt: new Date(row.expires_at).getTime() }));
};

// fresh batches of one ingredient, the ones that spoil first first, the ones that never spoil last
const batchesOf = async (db, playerId, ingredient, now) => {
    const { rows } = await db.query(`SELECT id, amount, expires_at FROM pantry WHERE ${FRESH} AND ingredient = $3`,
        [playerId, new Date(now), ingredient]);
    const expiry = row => (row.expires_at === null ? Infinity : new Date(row.expires_at).getTime());
    return rows.sort((a, b) => expiry(a) - expiry(b));
};

/**
 * Takes `cost` ({ ingredient: amount }) from the batches that spoil first. Checks everything
 * before it changes anything; call it inside a transaction.
 */
const spend = async (client, playerId, cost, now) => {
    const needed = Object.entries(cost).filter(([, amount]) => amount > 0);
    const batches = {};
    for (const [ingredient, amount] of needed) {
        batches[ingredient] = await batchesOf(client, playerId, ingredient, now);
        if (batches[ingredient].reduce((sum, row) => sum + Number(row.amount), 0) < amount) {
            throw new NotEnoughIngredientsError(ingredient);
        }
    }
    for (const [ingredient, amount] of needed) {
        let missing = amount;
        for (const row of batches[ingredient]) {
            if (missing === 0) {
                break;
            }
            const take = Math.min(missing, Number(row.amount));
            // written as an addition of a negative amount (pg-mem mis-evaluates `amount - $1`)
            await client.query('UPDATE pantry SET amount = amount + $1 WHERE id = $2', [-take, row.id]);
            missing -= take;
        }
    }
};

const cleanup = async (db, now) => {
    await db.query('DELETE FROM pantry WHERE amount <= 0 OR expires_at <= $1', [new Date(now)]);
};

module.exports = { add, totals, spoiling, spend, cleanup, NotEnoughIngredientsError };
