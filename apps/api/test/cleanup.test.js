const { createTestPool, closeTestPools } = require('./helper');
const pantry = require('../src/pantry');
const players = require('../src/players');
const reports = require('../src/reports');
const { scheduleCleanup } = require('../src/cleanup');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 27, 12);
let pool;
let playerId;

beforeEach(async () => {
    pool = await createTestPool();
    playerId = await players.createPlayer(pool);
});
afterAll(closeTestPools);

const count = async table => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
const reportFrom = async (createdAt, message) => {
    await reports.add(pool, playerId, { message });
    await pool.query('UPDATE reports SET created_at = $1 WHERE payload @> $2', [new Date(createdAt), JSON.stringify({ message })]);
};

test('problem reports are kept for 60 days, then deleted', async () => {
    await reportFrom(NOW - 61 * DAY, 'old');
    await reportFrom(NOW - 59 * DAY, 'recent');
    await reports.cleanup(pool, NOW);
    const { rows } = await pool.query('SELECT payload FROM reports');
    expect(rows.map(row => row.payload.message)).toEqual(['recent']);
});

test('the scheduled cleanup runs right away and then periodically, until stopped', async () => {
    const left = async () => (await count('pantry')) + (await count('reports'));
    // waits on real time until everything is gone: on Postgres in CI a cleanup can take longer
    // than a fixed wait of a few ticks
    const emptied = async () => {
        const end = Date.now() + 3000;
        while ((await left()) > 0 && Date.now() < end) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return left();
    };
    await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], Date.now() - 4 * DAY);
    await reportFrom(Date.now() - 61 * DAY, 'first');
    const stop = scheduleCleanup(pool, { intervalMs: 30 });
    try {
        expect(await emptied()).toBe(0);
        // added after the first run had finished: only a later run can delete them
        await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], Date.now() - 4 * DAY);
        await reportFrom(Date.now() - 61 * DAY, 'second');
        expect(await emptied()).toBe(0);
    } finally {
        stop();
    }
});
