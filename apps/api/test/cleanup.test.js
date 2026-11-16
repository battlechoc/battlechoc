const { createTestPool, closeTestPools } = require('./helpers/db');
const { until } = require('./helpers/wait');
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

test('link codes (plan 3) are deleted once expired; the scheduled cleanup does it too', async () => {
    const { createLinkCode, cleanupLinkCodes } = require('../src/linkCodes');
    const other = await players.createPlayer(pool);
    await createLinkCode(pool, { playerId, purpose: 'connect', now: () => NOW - 11 * 60 * 1000 });
    await createLinkCode(pool, { playerId: other, purpose: 'connect', now: () => NOW });
    await cleanupLinkCodes(pool, NOW);
    expect((await pool.query('SELECT player_id FROM link_codes')).rows).toEqual([{ player_id: other }]);
    await pool.query("UPDATE link_codes SET expires_at = NOW() - INTERVAL '1 minute'");
    const stop = scheduleCleanup(pool, { intervalMs: 60 * 60 * 1000 });
    try {
        await until(async () => (await count('link_codes')) === 0);
    } finally {
        stop();
    }
});

test('notices (plan C) go 30 days after they were seen, unseen ones after 180 days; the scheduled cleanup does it too', async () => {
    const { cleanupNotices } = require('../src/chain/notices');
    await pool.query("INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ('item', $1, 'LIGHT_BARREL', 1, $1)", [playerId]);
    const notice = (id, createdAt, seenAt) => pool.query(
        "INSERT INTO item_notices (id, player_id, item_id, kind, created_at, seen_at) VALUES ($1, $2, 'item', 'arrived', $3, $4)",
        [id, playerId, new Date(createdAt), seenAt === null ? null : new Date(seenAt)]);
    await notice('seen-31-days-ago', NOW - 40 * DAY, NOW - 31 * DAY);
    await notice('seen-yesterday', NOW - 40 * DAY, NOW - DAY);
    await notice('unseen-179-days', NOW - 179 * DAY, null);
    await notice('unseen-181-days', NOW - 181 * DAY, null);
    await notice('seen-181-days', NOW - 181 * DAY, NOW - DAY);
    await cleanupNotices(pool, NOW);
    const ids = async () => (await pool.query('SELECT id FROM item_notices ORDER BY id')).rows.map(row => row.id);
    expect(await ids()).toEqual(['seen-yesterday', 'unseen-179-days']);
    await pool.query('UPDATE item_notices SET seen_at = $1', [new Date(Date.now() - 31 * DAY)]);
    const stop = scheduleCleanup(pool, { intervalMs: 60 * 60 * 1000 });
    try {
        await until(async () => (await count('item_notices')) === 0, 'the notices cleanup');
    } finally {
        stop();
    }
});

describe('chain operations (minting plan F)', () => {
    const ops = require('../src/chain/ops');
    const { cleanupEnded, ENDED_KEEP_MS } = ops;

    // an operation of its own player and item (Postgres allows one open operation per player and
    // per item); `endedAt` null for an open one
    const operation = async (id, { state, createdAt, endedAt }) => {
        const owner = await players.createPlayer(pool);
        await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ($1, $2, \'LIGHT_BARREL\', 1, $2)', [`item-${id}`, owner]);
        await pool.query(
            `INSERT INTO chain_ops (id, player_id, item_id, kind, state, subject, owner_key_hash, owner_address, required_keys, asset_name,
                tx_hash, tx_cbor, ttl_slot, sign_until, fee_option, network_fee, deposit, deposit_user, included_block, created_at, ended_at)
             VALUES ($1, $2, $3, 'mint', $4, 's', 'k', 'a', '[]', $5, 't', '84', 1, $6, 0, '1', '1', '1', $7, $6, $8)`,
            [id, owner, `item-${id}`, state, `000de140${id}`, new Date(createdAt), state === 'included' ? 1 : null, endedAt === null ? null : new Date(endedAt)]);
    };
    const ids = async () => (await pool.query('SELECT id FROM chain_ops ORDER BY id')).rows.map(row => row.id);

    test('keeps an ended operation for 90 days', () => {
        expect(ENDED_KEEP_MS).toBe(90 * DAY);
    });

    test('deletes ended operations 90 days after they ended, keeps younger ones, never an open one', async () => {
        await operation('final-91-days', { state: 'final', createdAt: NOW - 92 * DAY, endedAt: NOW - 91 * DAY });
        await operation('cancelled-91-days', { state: 'cancelled', createdAt: NOW - 91 * DAY, endedAt: NOW - 91 * DAY });
        await operation('expired-91-days', { state: 'expired', createdAt: NOW - 91 * DAY, endedAt: NOW - 91 * DAY });
        await operation('final-89-days', { state: 'final', createdAt: NOW - 400 * DAY, endedAt: NOW - 89 * DAY });
        await operation('expired-yesterday', { state: 'expired', createdAt: NOW - DAY, endedAt: NOW - DAY });
        // open ones, however old; one even with an old end time, which no step writes: the state decides
        await operation('prepared-old', { state: 'prepared', createdAt: NOW - 400 * DAY, endedAt: null });
        await operation('submitted-old', { state: 'submitted', createdAt: NOW - 400 * DAY, endedAt: null });
        await operation('included-old', { state: 'included', createdAt: NOW - 400 * DAY, endedAt: NOW - 400 * DAY });
        await cleanupEnded(pool, NOW);
        expect(await ids()).toEqual(['expired-yesterday', 'final-89-days', 'included-old', 'prepared-old', 'submitted-old']);
        // a second run finds nothing more to delete
        await cleanupEnded(pool, NOW);
        expect(await count('chain_ops')).toBe(5);
    });

    test('a burn (plan E) that ends in any of its ways is ended for the cleanup too, and goes 90 days later', async () => {
        const MINUTE = 60 * 1000;
        const END = NOW;
        let serial = 0;
        // a prepared burn of its own player and item, as the burn route stores it (no fee option,
        // no battlechoc fee); `signUntil` decides whether it can still be signed at END
        const burn = async (signUntil = END + 10 * MINUTE) => {
            serial += 1;
            const owner = await players.createPlayer(pool);
            const itemId = `burned-${serial}`;
            await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ($1, $2, \'LIGHT_BARREL\', $3, $2)', [itemId, owner, serial]);
            return ops.insertPrepared(pool, {
                playerId: owner, itemId, kind: 'burn', subject: 's', ownerKeyHash: 'k', ownerAddress: 'a', requiredKeys: [],
                assetName: `000de140${serial}`, txHash: `tx-${serial}`, txCbor: '84', ttlSlot: 1, signUntil, code: `code-${serial}`,
                feeOption: null, networkFee: '410000', gameFeeAsset: null, gameFee: null, deposit: '3700000', depositUser: '1250000', now: END - 5 * MINUTE,
            });
        };
        const submitted = async () => {
            const op = await burn();
            return ops.markSubmitted(pool, op, { signedCbor: '84', now: END - MINUTE });
        };
        const ended = [
            await ops.cancel(pool, await burn(), END),
            await ops.cancel(pool, await burn(), END, ops.CANCELLED_BECAUSE.WALLET_UNLINKED),
            await ops.cancel(pool, await burn(), END, ops.CANCELLED_BECAUSE.TOKEN_MOVED),
            await ops.expireUnsigned(pool, await burn(END - MINUTE), END),
            await ops.expireSubmitted(pool, await submitted(), END),
            await ops.expireSubmitted(pool, await submitted(), END, { because: ops.BURNED_ELSEWHERE }),
            await ops.markFinal(pool, await ops.markIncluded(pool, await submitted(), { blockNo: 7, now: END - MINUTE }), END),
        ];
        expect(ended.map(op => [op.kind, op.state, op.error])).toEqual([
            ['burn', 'cancelled', 'cancelled'],
            ['burn', 'cancelled', 'wallet-unlinked'],
            ['burn', 'cancelled', 'token-moved'],
            ['burn', 'expired', 'not-signed'],
            ['burn', 'expired', 'expired'],
            ['burn', 'expired', 'burned-elsewhere'],
            ['burn', 'final', null],
        ]);
        ended.forEach(op => expect(op.ended_at).toEqual(new Date(END)));
        await cleanupEnded(pool, END + ENDED_KEEP_MS - DAY);
        expect(await count('chain_ops')).toBe(ended.length);
        await cleanupEnded(pool, END + ENDED_KEEP_MS + DAY);
        expect(await count('chain_ops')).toBe(0);
    });

    test('with no operations (the chain features off) it does nothing and fails nothing', async () => {
        await cleanupEnded(pool, NOW);
        expect(await count('chain_ops')).toBe(0);
    });

    test('the scheduled cleanup deletes them too', async () => {
        await operation('final-long-ago', { state: 'final', createdAt: Date.now() - 100 * DAY, endedAt: Date.now() - 91 * DAY });
        await operation('final-recently', { state: 'final', createdAt: Date.now() - 2 * DAY, endedAt: Date.now() - DAY });
        const stop = scheduleCleanup(pool, { intervalMs: 60 * 60 * 1000 });
        try {
            await until(async () => (await count('chain_ops')) === 1, 'the chain operations cleanup');
            expect(await ids()).toEqual(['final-recently']);
        } finally {
            stop();
        }
    });
});

test('the scheduled cleanup runs right away and then periodically, until stopped', async () => {
    const left = async () => (await count('pantry')) + (await count('reports'));
    // waits on real time until everything is gone: on Postgres in CI a cleanup can take longer
    // than a fixed wait of a few ticks
    const emptied = () => until(async () => (await left()) === 0, 'the cleanup to delete everything');
    await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], Date.now() - 4 * DAY);
    await reportFrom(Date.now() - 61 * DAY, 'first');
    const stop = scheduleCleanup(pool, { intervalMs: 30 });
    try {
        await emptied();
        // added after the first run had finished: only a later run can delete them
        await pantry.add(pool, playerId, [{ ingredient: 'GOLDLEAF', amount: 1 }], Date.now() - 4 * DAY);
        await reportFrom(Date.now() - 61 * DAY, 'second');
        await emptied();
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
            await until(async () => (await count('pantry')) === 0, 'the pantry cleanup');
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
            await until(() => log.info.mock.calls.length > 0, 'the match cleanup to report');
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
