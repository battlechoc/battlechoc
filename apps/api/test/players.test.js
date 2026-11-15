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

describe('minted items and their notices (plan C)', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const T0 = Date.UTC(2026, 10, 15, 12);
    const assetName = n => `000de140${n.toString(16).padStart(56, '0')}`;
    const item = (pool, id, playerId, serial) => pool.query(
        'INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, playerId, 'LIGHT_BARREL', serial, 'crafter', new Date(T0)]);
    let notices = 0;
    const notice = async (pool, { playerId, itemId, kind = 'arrived', building = null, at, seenAt = null }) => {
        notices += 1;
        const id = `notice-${notices}`;
        await pool.query('INSERT INTO item_notices (id, player_id, item_id, kind, building, created_at, seen_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id, playerId, itemId, kind, building, new Date(at), seenAt === null ? null : new Date(seenAt)]);
        return id;
    };

    test('a plain item has minted: null; a minted one its asset name; one not yet in a block or burned: null', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        await item(pool, 'plain', playerId, 1);
        await item(pool, 'minted', playerId, 2);
        await item(pool, 'pending', playerId, 3);
        await item(pool, 'burned', playerId, 4);
        await pool.query('UPDATE items SET asset_name = $2, minted_at = $3 WHERE id = $1', ['minted', assetName(1), new Date(T0)]);
        await pool.query('UPDATE items SET asset_name = $2 WHERE id = $1', ['pending', assetName(2)]);
        await pool.query('UPDATE items SET asset_name = $2, minted_at = $3, burned_at = $3 WHERE id = $1', ['burned', assetName(3), new Date(T0)]);
        const minted = Object.fromEntries((await players.itemsOf(pool, playerId)).map(entry => [entry.id, entry.minted]));
        expect(minted).toEqual({ plain: null, minted: { assetName: assetName(1), state: 'minted' }, pending: null, burned: null });
    });

    test('the stats carry the unseen notices, oldest first, at most 20, with the item as it is now', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        const ben = await players.createPlayer(pool);
        await item(pool, 'gone', null, 7);
        await item(pool, 'back', ann, 8);
        // the departure of an item that is now nobody's, an arrival, one already seen, one of Ben's
        const departed = await notice(pool, { playerId: ann, itemId: 'gone', kind: 'departed', building: 'RUM_TRUFFLE_CANNON', at: T0 + 1000 });
        const arrived = await notice(pool, { playerId: ann, itemId: 'back', at: T0 });
        await notice(pool, { playerId: ann, itemId: 'back', at: T0 - DAY, seenAt: T0 });
        await notice(pool, { playerId: ben, itemId: 'gone', at: T0 });
        const { notices: listed } = await players.stats(pool, ann);
        expect(listed).toEqual([
            { id: arrived, kind: 'arrived', item: { id: 'back', item: 'LIGHT_BARREL', serial: 8 }, building: null, at: new Date(T0).toISOString() },
            { id: departed, kind: 'departed', item: { id: 'gone', item: 'LIGHT_BARREL', serial: 7 }, building: 'RUM_TRUFFLE_CANNON', at: new Date(T0 + 1000).toISOString() },
        ]);
        expect((await players.stats(pool, ben)).notices).toHaveLength(1);
        // 25 unseen: the 20 oldest, in order
        const ids = [];
        for (let i = 0; i < 25; i += 1) {
            ids.push(await notice(pool, { playerId: ben, itemId: 'back', at: T0 + (i + 1) * 1000 }));
        }
        expect((await players.stats(pool, ben)).notices.map(entry => entry.id)).toEqual([expect.any(String), ...ids.slice(0, 19)]);
        expect(await players.markNoticesSeen(pool, ben, ids.slice(0, 10), T0 + DAY)).toBe(10);
        expect((await players.stats(pool, ben)).notices.map(entry => entry.id).slice(1)).toEqual(ids.slice(10));
    });

    test('marking notices seen touches only the player\'s own unseen ones', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        const ben = await players.createPlayer(pool);
        await item(pool, 'it', ann, 1);
        const hers = await notice(pool, { playerId: ann, itemId: 'it', at: T0 });
        const seen = await notice(pool, { playerId: ann, itemId: 'it', at: T0, seenAt: T0 });
        expect(await players.markNoticesSeen(pool, ben, [hers, seen, 'unknown'], T0 + DAY)).toBe(0);
        expect(await players.markNoticesSeen(pool, ann, [hers, seen, 'unknown'], T0 + DAY)).toBe(1);
        const seenAt = async id => (await pool.query('SELECT seen_at FROM item_notices WHERE id = $1', [id])).rows[0].seen_at;
        expect(await seenAt(hers)).toEqual(new Date(T0 + DAY));
        expect(await seenAt(seen)).toEqual(new Date(T0));
    });

    test('a notice whose item row is gone is left out of the stats', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        // without the reference to items (it keeps this from happening today; a later plan may delete item rows)
        await pool.query('DROP TABLE item_notices');
        await pool.query(`CREATE TABLE item_notices (id TEXT NOT NULL, player_id TEXT NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL,
            building TEXT, created_at TIMESTAMPTZ NOT NULL, seen_at TIMESTAMPTZ)`);
        await item(pool, 'kept', ann, 1);
        await notice(pool, { playerId: ann, itemId: 'deleted', at: T0 });
        const kept = await notice(pool, { playerId: ann, itemId: 'kept', at: T0 + 1000 });
        expect((await players.stats(pool, ann)).notices.map(entry => entry.id)).toEqual([kept]);
    });
});
