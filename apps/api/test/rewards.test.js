const { createTestPool, closeTestPools } = require('./helper');
const players = require('../src/players');
const pantry = require('../src/pantry');
const rewards = require('../src/rewards');

const NOW = Date.UTC(2026, 9, 15, 12);
let pool;
beforeEach(async () => { pool = await createTestPool(); });
afterAll(closeTestPools);

const record = (id, awards, won = true) => ({ id, won, lost: !won, online: true, builtEntities: 3, awards,
    opponent: { ai: false }, winners: [] });
const credit = (playerId, id, awards, extra = {}) => rewards.creditVerifiedMatch(pool, {
    playerId, isWinner: true, opponentIsAi: false, now: NOW, random: () => 0.99, record: record(id, awards), ...extra,
});

test('a verified match is credited once: xp, drops, fresh batch', async () => {
    const playerId = await players.createPlayer(pool);
    const first = await credit(playerId, 'm1', [{ key: 'WINNER', xp: 25 }]);
    expect(first.xp).toBe(25);
    expect(first.drops).toEqual([
        { ingredient: 'COCOA', amount: 25, achievement: 'WINNER' },
        { ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' },
    ]);
    expect(await credit(playerId, 'm1', [{ key: 'WINNER', xp: 25 }])).toBeNull();
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ COCOA: 125 });
    expect((await players.findPlayer(pool, playerId)).xp).toBe(25);
    const second = await credit(playerId, 'm2', [{ key: 'WINNER', xp: 25 }]);
    expect(second.drops.map(drop => drop.achievement)).not.toContain('FRESHBATCH');
});

test('the fresh batch comes back on the next UTC day', async () => {
    const playerId = await players.createPlayer(pool);
    await credit(playerId, 'm1', []);
    const tomorrow = await credit(playerId, 'm2', [], { now: NOW + 24 * 60 * 60 * 1000 });
    expect(tomorrow.drops).toEqual([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]);
});

test('a loser gets half the xp and half the cocoa', async () => {
    const playerId = await players.createPlayer(pool);
    await credit(playerId, 'm0', []);
    const lost = await credit(playerId, 'm1', [{ key: 'SURVIVOR', xp: 150 }], { isWinner: false, record: record('m1', [{ key: 'SURVIVOR', xp: 150 }], false) });
    expect(lost).toEqual({ xp: 75, drops: [{ ingredient: 'COCOA', amount: 75, achievement: 'SURVIVOR' }] });
});

test('the sixth verified match of a day rolls with half the chance', async () => {
    const playerId = await players.createPlayer(pool);
    for (let i = 0; i < 5; i++) {
        await credit(playerId, `m${i}`, []);
    }
    // 0.07 hits WINNER's 10 % but not 5 %
    const sixth = await credit(playerId, 'm6', [{ key: 'WINNER', xp: 25 }], { random: () => 0.07 });
    expect(sixth.drops).toEqual([{ ingredient: 'COCOA', amount: 25, achievement: 'WINNER' }]);
});

test('a match is rated once; a draw between equals keeps both ratings', async () => {
    const a = await players.createPlayer(pool);
    const b = await players.createPlayer(pool);
    const change = await rewards.rateMatch(pool, 'm1', [a, b], 1);
    expect(change[a].after).toBeGreaterThan(1500);
    expect(change[b].after).toBeLessThan(1500);
    expect(await rewards.rateMatch(pool, 'm1', [a, b], 1)).toBeNull();
    const { rows } = await pool.query('SELECT rated_matches FROM players');
    rows.forEach(row => expect(row.rated_matches).toBe(1));
    const c = await players.createPlayer(pool);
    const d = await players.createPlayer(pool);
    const draw = await rewards.rateMatch(pool, 'm2', [c, d], 0.5);
    expect(draw[c]).toEqual({ before: 1500, after: 1500 });
});
