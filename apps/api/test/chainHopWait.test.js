// The wallet hop wait (plan C, spec 2): the tokens in a wallet that was another player's count for
// the new player only a while after that player's first link since then, so a wallet passed on
// cannot carry items into a match at once, and unlinking and relinking it does not restart or
// shorten the wait.

const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { hopWaitUntil, linkedPlayers, MAX_SUBJECTS } = require('../src/chain/hopWait');
const { createTestPool, closeTestPools } = require('./helpers/db');

afterAll(closeTestPools);

const HOUR = 60 * 60 * 1000;
const WAIT = rules.WALLET_HOP_WAIT_MS;
const T0 = Date.parse('2026-11-01T12:00:00Z');
const SUBJECT = `stake:${'ab'.repeat(28)}`;

const row = (playerId, linkedAt, unlinkedAt = null) => ({ playerId, linkedAt, unlinkedAt });

describe('hopWaitUntil', () => {
    test('a wallet that was never another player\'s counts at once', () => {
        expect(hopWaitUntil([row('P', T0)], SUBJECT, 'P', WAIT)).toBeNull();
    });

    test('Q, then P: P waits 24 h from the link', () => {
        const history = [row('Q', T0, T0 + HOUR), row('P', T0 + 2 * HOUR)];
        expect(hopWaitUntil(history, SUBJECT, 'P', WAIT)).toBe(T0 + 2 * HOUR + WAIT);
    });

    test('Q, then P, who unlinks after an hour and links again after two: still P\'s first link + 24 h', () => {
        const linked = T0 + HOUR;
        const history = [row('Q', T0, linked), row('P', linked, linked + HOUR), row('P', linked + 3 * HOUR)];
        expect(hopWaitUntil(history, SUBJECT, 'P', WAIT)).toBe(linked + WAIT);
    });

    test('Q, then P (wait over), then Q again: Q waits from its newest link', () => {
        const back = T0 + 3 * WAIT;
        const history = [row('Q', T0, T0 + HOUR), row('P', T0 + HOUR, back - HOUR), row('Q', back)];
        expect(hopWaitUntil(history, SUBJECT, 'Q', WAIT)).toBe(back + WAIT);
        // and P, who no longer has it, is not linked
        expect(hopWaitUntil(history, SUBJECT, 'P', WAIT)).toBeNull();
    });

    test('P alone, with three relinks: no wait', () => {
        const history = [row('P', T0, T0 + HOUR), row('P', T0 + 2 * HOUR, T0 + 3 * HOUR), row('P', T0 + 4 * HOUR, T0 + 5 * HOUR), row('P', T0 + 6 * HOUR)];
        expect(hopWaitUntil(history, SUBJECT, 'P', WAIT)).toBeNull();
    });

    test('a subject not linked to the player: null', () => {
        expect(hopWaitUntil([row('Q', T0)], SUBJECT, 'P', WAIT)).toBeNull();
        expect(hopWaitUntil([row('Q', T0, T0 + HOUR), row('P', T0 + HOUR, T0 + 2 * HOUR)], SUBJECT, 'P', WAIT)).toBeNull();
        expect(hopWaitUntil([], SUBJECT, 'P', WAIT)).toBeNull();
    });

    test('rows of other subjects in the history are left out', () => {
        const other = `stake:${'cd'.repeat(28)}`;
        const history = [{ ...row('Q', T0, T0 + HOUR), subject: other }, { ...row('P', T0 + 2 * HOUR), subject: SUBJECT }];
        expect(hopWaitUntil(history, SUBJECT, 'P', WAIT)).toBeNull();
    });
});

describe('linkedPlayers', () => {
    let pool;
    let players = 0;
    const newPlayer = async () => {
        players += 1;
        const id = `player-${players}`;
        await pool.query("INSERT INTO players (id, level) VALUES ($1, '{}')", [id]);
        return id;
    };
    const link = (subject, playerId, linkedAt) => pool.query('INSERT INTO identities (provider, subject, player_id, created_at) VALUES ($1, $2, $3, $4)',
        ['cardano', subject, playerId, new Date(linkedAt)]);
    let rows = 0;
    const history = (subject, playerId, linkedAt, unlinkedAt = null) => {
        rows += 1;
        return pool.query('INSERT INTO identity_history (id, subject, player_id, linked_at, unlinked_at) VALUES ($1, $2, $3, $4, $5)',
            [`history-${rows}`, subject, playerId, new Date(linkedAt), unlinkedAt === null ? null : new Date(unlinkedAt)]);
    };

    beforeAll(async () => {
        pool = await createTestPool();
    });

    test('the player of each linked subject, with the end of its hop wait while it lasts', async () => {
        const [p, q] = [await newPlayer(), await newPlayer()];
        const [moved, own, stale, nobody] = ['11', '22', '33', '44'].map(hex => `stake:${hex.repeat(28)}`);
        // moved: Q's, then P's for an hour now
        await history(moved, q, T0, T0 + HOUR);
        await history(moved, p, T0 + HOUR);
        await link(moved, p, T0 + HOUR);
        // own: P's from the start
        await history(own, p, T0);
        await link(own, p, T0);
        // stale: Q's, then P's for more than a day
        await history(stale, q, T0 - 3 * WAIT, T0 - 2 * WAIT);
        await history(stale, p, T0 - 2 * WAIT);
        await link(stale, p, T0 - 2 * WAIT);
        // nobody: was Q's, unlinked
        await history(nobody, q, T0, T0 + HOUR);

        const now = T0 + 2 * HOUR;
        const found = await linkedPlayers(pool, [moved, own, stale, nobody, 'device-id'], now);
        expect(found).toEqual(new Map([
            [moved, { playerId: p, waitUntil: T0 + HOUR + WAIT }],
            [own, { playerId: p, waitUntil: null }],
            [stale, { playerId: p, waitUntil: null }],
        ]));
        // the wait is over once its end has come
        expect((await linkedPlayers(pool, [moved], T0 + HOUR + WAIT)).get(moved)).toEqual({ playerId: p, waitUntil: null });
    });

    test('the device identity of an account is no Cardano key', async () => {
        const p = await newPlayer();
        await pool.query('INSERT INTO identities (provider, subject, player_id) VALUES ($1, $2, $2)', ['device', p]);
        expect(await linkedPlayers(pool, [p], T0)).toEqual(new Map());
    });

    test('no subjects: no query; more than 500: a RangeError (the caller batches); not a list or a number: a TypeError', async () => {
        const watched = { query: () => { throw new Error('no query expected'); } };
        expect(await linkedPlayers(watched, [], T0)).toEqual(new Map());
        const many = Array.from({ length: MAX_SUBJECTS + 1 }, (_, i) => `stake:${String(i).padStart(56, '0')}`);
        expect(MAX_SUBJECTS).toBe(500);
        await expect(linkedPlayers(pool, many, T0)).rejects.toThrow(RangeError);
        expect((await linkedPlayers(pool, many.slice(0, MAX_SUBJECTS), T0)).size).toBe(0);
        await expect(linkedPlayers(pool, 'stake:ab', T0)).rejects.toThrow(TypeError);
        await expect(linkedPlayers(pool, [42], T0)).rejects.toThrow(TypeError);
        await expect(linkedPlayers(pool, [SUBJECT], () => T0)).rejects.toThrow(TypeError);
    });

    test('two queries for any number of subjects up to 500, one when none of them is linked', async () => {
        let queries = 0;
        const counted = { query: (...args) => { queries += 1; return pool.query(...args); } };
        const subjects = Array.from({ length: 50 }, (_, i) => `pay:${String(i).padStart(56, '0')}`);
        await linkedPlayers(counted, subjects, T0);
        expect(queries).toBe(1);
        const p = await newPlayer();
        await history(subjects[7], p, T0);
        await link(subjects[7], p, T0);
        queries = 0;
        expect(await linkedPlayers(counted, [...subjects, subjects[7]], T0)).toEqual(new Map([[subjects[7], { playerId: p, waitUntil: null }]]));
        expect(queries).toBe(2);
    });
});
