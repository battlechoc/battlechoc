const { createTestPool, closeTestPools } = require('./helper');
const pantry = require('../src/pantry');
const players = require('../src/players');
const reports = require('../src/reports');
const { scheduleCleanup } = require('../src/cleanup');
const { createMatchStore } = require('../src/live/store');

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

describe('match retention', () => {
    const quiet = { error: jest.fn(), info: jest.fn() };
    // a stored match with three logged actions and a snapshot
    const match = async (id, { status = 'ended', endedAt = null } = {}) => {
        await pool.query(
            'INSERT INTO matches (id, kind, player_ids, status, snapshot, snapshot_seq, outcome, ended_at) VALUES ($1, $2, $3, $4, $5, 3, $6, $7)',
            [id, 'queue', JSON.stringify([playerId, null]), status, JSON.stringify({ match: { t: 1000 }, agents: [] }),
                status === 'running' ? null : JSON.stringify({ winners: [0], reason: 'surrender' }), endedAt === null ? null : new Date(endedAt)]);
        for (const seq of [1, 2, 3]) {
            await pool.query('INSERT INTO match_actions (match_id, seq, t, action) VALUES ($1, $2, $3, $4)',
                [id, seq, seq * 100, JSON.stringify({ type: 'x' })]);
        }
    };
    const stored = async () => {
        const { rows } = await pool.query('SELECT id, status, snapshot, outcome, trimmed_at FROM matches ORDER BY id');
        const actions = await pool.query('SELECT match_id FROM match_actions');
        return rows.map(row => ({
            id: row.id,
            status: row.status,
            snapshot: row.snapshot,
            outcome: row.outcome,
            trimmed: row.trimmed_at !== null,
            actions: actions.rows.filter(action => action.match_id === row.id).length,
        }));
    };
    const full = { snapshot: { match: { t: 1000 }, agents: [] }, trimmed: false, actions: 3 };
    const outcome = { winners: [0], reason: 'surrender' };
    const seed = async now => {
        await match('ended-long-ago', { endedAt: now - 31 * DAY });
        await match('ended-recently', { endedAt: now - 29 * DAY });
        await match('failed-long-ago', { status: 'failed', endedAt: now - 40 * DAY });
        await match('running', { status: 'running' });
        await pool.query("UPDATE matches SET created_at = $1 WHERE id = 'running'", [new Date(now - 90 * DAY)]);
    };
    const overview = async () => (await stored()).map(row => [row.id, row.trimmed, row.actions]);

    test('trimming removes the actions and the snapshot of matches that ended before a date, and nothing else', async () => {
        await seed(NOW);
        const store = createMatchStore(pool);
        expect(await store.trimEndedBefore(new Date(NOW - 30 * DAY), new Date(NOW))).toBe(2);
        expect(await stored()).toEqual([
            { id: 'ended-long-ago', status: 'ended', outcome, snapshot: {}, trimmed: true, actions: 0 },
            { id: 'ended-recently', status: 'ended', outcome, ...full },
            { id: 'failed-long-ago', status: 'failed', outcome, snapshot: {}, trimmed: true, actions: 0 },
            { id: 'running', status: 'running', outcome: null, ...full },
        ]);
        // a second run finds nothing left to do
        expect(await store.trimEndedBefore(new Date(NOW - 30 * DAY), new Date(NOW))).toBe(0);
    });

    test('a long history is trimmed in batches', async () => {
        for (let i = 0; i < 7; i++) {
            await match(`old-${i}`, { endedAt: NOW - (40 + i) * DAY });
        }
        expect(await createMatchStore(pool).trimEndedBefore(new Date(NOW - 30 * DAY), new Date(NOW), { batchSize: 3 })).toBe(7);
        expect(await count('match_actions')).toBe(0);
    });

    test('by default the scheduled cleanup keeps every match, however old', async () => {
        await seed(Date.now());
        await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], Date.now() - 4 * DAY);
        const stop = scheduleCleanup(pool, { intervalMs: 20, log: quiet });
        try {
            // waits until the spoiled batch is gone: the cleanups have run, the matches had their turn
            const end = Date.now() + 3000;
            while ((await count('pantry')) > 0 && Date.now() < end) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(await count('pantry')).toBe(0);
            expect(await overview()).toEqual([
                ['ended-long-ago', false, 3], ['ended-recently', false, 3], ['failed-long-ago', false, 3], ['running', false, 3],
            ]);
        } finally {
            stop();
        }
    });

    test('with a retention the scheduled cleanup trims the matches that ended longer ago, and says so', async () => {
        await seed(Date.now());
        const log = { error: jest.fn(), info: jest.fn() };
        const stop = scheduleCleanup(pool, { intervalMs: 20, log, matchRetentionDays: 30 });
        try {
            const end = Date.now() + 3000;
            while (log.info.mock.calls.length === 0 && Date.now() < end) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(await overview()).toEqual([
                ['ended-long-ago', true, 0], ['ended-recently', false, 3], ['failed-long-ago', true, 0], ['running', false, 3],
            ]);
            expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/2 matches/));
            expect(log.error).not.toHaveBeenCalled();
        } finally {
            stop();
        }
    });
});
