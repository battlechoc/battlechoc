const { createTestPool, closeTestPools } = require('./helper');
const { withTransaction, migrate } = require('../src/db');
const pantry = require('../src/pantry');
const players = require('../src/players');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12);
let pool;
let playerId;

beforeEach(async () => {
    pool = await createTestPool();
    playerId = await players.createPlayer(pool);
});
afterAll(closeTestPools);

test('totals add up batches and ignore spoiled ones', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: 100 }, { ingredient: 'COCOA', amount: 20 }], NOW);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 1 }], NOW - 8 * DAY);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 2 }], NOW - DAY);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ COCOA: 120, VANILLA: 2 });
    expect(await pantry.spoiling(pool, playerId, NOW)).toEqual([{ ingredient: 'VANILLA', amount: 2, expiresAt: NOW + 6 * DAY }]);
});

test('unknown ingredients and empty amounts are not stored', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'GOLD', amount: 5 }, { ingredient: 'SUGAR', amount: 0 }], NOW);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({});
});

test('spending uses the batches that spoil first and refuses what is missing', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 1 }], NOW - 5 * DAY);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 2 }], NOW - DAY);
    await withTransaction(pool, client => pantry.spend(client, playerId, { VANILLA: 2 }, NOW));
    expect(await pantry.spoiling(pool, playerId, NOW)).toEqual([{ ingredient: 'VANILLA', amount: 1, expiresAt: NOW + 6 * DAY }]);
    await expect(withTransaction(pool, client => pantry.spend(client, playerId, { VANILLA: 2 }, NOW)))
        .rejects.toThrow(pantry.NotEnoughIngredientsError);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ VANILLA: 1 });
});

test('a spoiled batch never pays, even though its row still exists', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], NOW - 4 * DAY);
    await expect(withTransaction(pool, client => pantry.spend(client, playerId, { GOLDLEAF: 1 }, NOW)))
        .rejects.toThrow(pantry.NotEnoughIngredientsError);
});

test('a failed purchase takes nothing, not even the ingredients that were there', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: 500 }], NOW);
    await expect(withTransaction(pool, client => pantry.spend(client, playerId, { COCOA: 300, RUM: 5 }, NOW)))
        .rejects.toThrow(pantry.NotEnoughIngredientsError);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ COCOA: 500 });
});

test('cleanup deletes spoiled and used-up batches', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], NOW - 4 * DAY);
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: 5 }], NOW);
    await withTransaction(pool, client => pantry.spend(client, playerId, { COCOA: 5 }, NOW));
    await pantry.cleanup(pool, NOW);
    expect(Number((await pool.query('SELECT COUNT(*) AS n FROM pantry')).rows[0].n)).toBe(0);
});

test('the migration converts coins into cocoa and score into xp', async () => {
    const { newDb } = require('pg-mem');
    const { Pool: MemoryPool } = newDb().adapters.createPg();
    const old = new MemoryPool();
    await migrate(old, { upTo: '002_live_matches.sql' });
    const id = await players.createPlayer(old);
    await old.query('UPDATE players SET coins = 300, score = 450 WHERE id = $1', [id]);
    await migrate(old);
    const { rows } = await old.query('SELECT xp, coins, rating, rating_deviation, rated_matches FROM players WHERE id = $1', [id]);
    expect(rows[0]).toMatchObject({ xp: 450, coins: 0, rating: 1500, rating_deviation: 350, rated_matches: 0 });
    expect(await pantry.totals(old, id, NOW)).toEqual({ COCOA: 300 });
    await old.end();
});
