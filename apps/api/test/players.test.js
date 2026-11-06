// The player repository against the database, without HTTP: what a failure or a second request in
// the middle of a multi-step write leaves behind.

const players = require('../src/players');
const { createPush } = require('../src/push');
const { createTestPool, closeTestPools, postgresOnly, failingOn, counting } = require('./helpers/db');

afterAll(closeTestPools);

const count = async (pool, table) => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);

const win = id => ({ id, won: true, lost: false, builtEntities: 3, winners: [{ idx: 0 }], awards: ['WINNER'] });
const loss = id => ({ id, won: false, lost: true, winners: [{ idx: 1 }], awards: [] });

describe('offline match records', () => {
    test('a request counts each record id once, also when it repeats within the request', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        expect(await players.addTrackRecords(pool, playerId, [win('a'), win('a'), null, 'text', loss('b')])).toBe(25);
        expect(await players.addTrackRecords(pool, playerId, [win('a'), win('c')])).toBe(25);
        const player = await players.findPlayer(pool, playerId);
        expect(player.xp).toBe(50);
        expect(await players.results(pool, playerId)).toEqual({ winnings: 2, drawn: 0, losses: 1 });
        // won, lost, won: the ladder moved once per stored record, in the order of the request
        expect(players.ladderOf(player)).toMatchObject({ games: 3 });
    });

    test('records without an id are all stored; an open match gives nothing and leaves the ladder', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const open = { winners: [], awards: ['WINNER'] };
        expect(await players.addTrackRecords(pool, playerId, [open, open, { ...win('x'), id: 'y'.repeat(65) }])).toBe(25);
        expect(await count(pool, 'track_records')).toBe(3);
        const player = await players.findPlayer(pool, playerId);
        expect(player.xp).toBe(25);
        expect(players.ladderOf(player)).toMatchObject({ games: 1 });
        expect(await players.addTrackRecords(pool, playerId, [])).toBe(0);
    });

    test('two requests with the same record at the same time credit it once', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const credited = await Promise.all([
            players.addTrackRecords(pool, playerId, [win('a'), win('b')]),
            players.addTrackRecords(pool, playerId, [win('b'), win('a')]),
            players.addTrackRecords(pool, playerId, [win('a')]),
        ]);
        expect(credited.reduce((sum, xp) => sum + xp, 0)).toBe(50);
        expect((await players.findPlayer(pool, playerId)).xp).toBe(50);
        expect(await count(pool, 'track_records')).toBe(2);
    });

    test('a big import takes a handful of statements, not several per record', async () => {
        const { pool, counter } = counting(await createTestPool());
        const playerId = await players.createPlayer(pool);
        counter.statements = 0;
        const records = Array.from({ length: 500 }, (_, i) => (i % 2 === 0 ? win(`m${i}`) : loss(`m${i}`)));
        expect(await players.addTrackRecords(pool, playerId, records)).toBe(250 * 25);
        expect(counter.statements).toBeLessThanOrEqual(6);
        expect(await count(pool, 'track_records')).toBe(500);
        expect(players.ladderOf(await players.findPlayer(pool, playerId))).toMatchObject({ games: 500 });
    });

    postgresOnly('records are stored together with their XP or not at all', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const broken = failingOn(pool, /UPDATE players SET xp/);
        await expect(players.addTrackRecords(broken, playerId, [win('a'), win('b')])).rejects.toThrow('injected failure');
        expect(await count(pool, 'track_records')).toBe(0);
        // the device sends them again: now they count
        expect(await players.addTrackRecords(pool, playerId, [win('a'), win('b')])).toBe(50);
        expect((await players.findPlayer(pool, playerId)).xp).toBe(50);
    });
});

describe('accounts and subscriptions', () => {
    postgresOnly('a player whose identity cannot be stored is not created', async () => {
        const pool = await createTestPool();
        await expect(players.createPlayer(failingOn(pool, /INSERT INTO identities/))).rejects.toThrow('injected failure');
        expect(await count(pool, 'players')).toBe(0);
    });

    test('a new player has a device identity', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const { rows } = await pool.query('SELECT provider, subject, player_id FROM identities');
        expect(rows).toEqual([{ provider: 'device', subject: playerId, player_id: playerId }]);
    });

    test('a browser that subscribes twice at the same time ends up with one subscription', async () => {
        const pool = await createTestPool();
        const push = createPush({ pool });
        const [first, second] = [await players.createPlayer(pool), await players.createPlayer(pool)];
        const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'key', auth: 'secret' } };
        const stored = await Promise.all([first, second, first, second].map(playerId => push.subscribe(playerId, subscription)));
        expect(stored).toEqual([true, true, true, true]);
        const { rows } = await pool.query('SELECT endpoint, keys FROM push_subscriptions');
        expect(rows).toEqual([{ endpoint: subscription.endpoint, keys: subscription.keys }]);
        // the endpoint belongs to whoever subscribed last
        await push.subscribe(second, { ...subscription, keys: { p256dh: 'new', auth: 'secret' } });
        const after = await pool.query('SELECT player_id, keys FROM push_subscriptions');
        expect(after.rows).toEqual([{ player_id: second, keys: { p256dh: 'new', auth: 'secret' } }]);
    });
});
