// The chain operations (minting plan D, Task 1): every mint moves through the states of chain_ops
// only by compare-and-set updates, so a step and its effects happen once, whoever races whom (two
// tabs, the watcher, a cancel against a signature). The tests drive ops.js on a test pool with
// crafted items; the ones about the ownership sync link keys through the API and mint the token
// on plan C's chain double.

const crypto = require('crypto');
const ops = require('../src/chain/ops');
const players = require('../src/players');
const { hashOf } = require('../src/linkCodes');
const { ProviderError } = require('../src/chain/provider');
const { createTestPool, siblingPool, closeTestPools, postgresOnly, counting } = require('./helpers/db');
const { testKeys } = require('./helpers/cardano');
const { T0, userName, stake, pay, giveItem, chainApp, linkedPlayer } = require('./helpers/minting');

afterAll(closeTestPools);

const MINUTE = 60 * 1000;
const { SIGN_WINDOW_MS } = require('@battlechoc/battlechoc-shared-functions').chain;

const keyHash = byte => byte.repeat(28);
let serial = 0;

/** A plain item of `playerId` (its id). */
const plainItem = async (pool, playerId) => {
    serial += 1;
    const id = `item-${serial}`;
    await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $2, $5)', [
        id,
        playerId,
        'LIGHT_BARREL',
        serial,
        new Date(T0),
    ]);
    return id;
};

/** What the mint route stores for a prepared mint of `itemId` by `playerId` (`overrides` win). */
const fieldsOf = ({ playerId, itemId, ...overrides }) => {
    serial += 1;
    return {
        playerId,
        itemId,
        kind: 'mint',
        subject: `stake:${keyHash('aa')}`,
        ownerKeyHash: keyHash('bb'),
        ownerAddress: testKeys().baseAddress,
        requiredKeys: [keyHash('bb'), keyHash('cc')],
        assetName: userName(serial),
        txHash: crypto.randomBytes(32).toString('hex'),
        txCbor: '84a400',
        ttlSlot: 1200 + serial,
        signUntil: T0 + SIGN_WINDOW_MS,
        code: `code-${serial}`,
        feeOption: 0,
        networkFee: '487000',
        gameFeeAsset: 'lovelace',
        gameFee: '1000000',
        deposit: '3700000',
        depositUser: '1200000',
        now: T0,
        ...overrides,
    };
};

/** A pool, a player with a plain item and a prepared mint of it: { pool, playerId, itemId, op, fields }. */
const preparedMint = async (overrides = {}) => {
    const pool = await createTestPool();
    const playerId = await players.createPlayer(pool);
    const itemId = await plainItem(pool, playerId);
    const fields = fieldsOf({ playerId, itemId, ...overrides });
    const op = await ops.insertPrepared(pool, fields);
    return { pool, playerId, itemId, op, fields };
};

const itemRow = async (pool, id) =>
    (await pool.query('SELECT player_id, asset_name, minted_at, holder_subject, holder_pay, holder_since FROM items WHERE id = $1', [id])).rows[0];
const mintedOf = async (pool, playerId, itemId) => (await players.itemsOf(pool, playerId)).find(entry => entry.id === itemId).minted;

describe('a prepared mint', () => {
    test('is stored as built, open, and found by player, item, id and sign code', async () => {
        const { pool, playerId, itemId, op, fields } = await preparedMint();
        expect(op).toMatchObject({
            player_id: playerId,
            item_id: itemId,
            kind: 'mint',
            state: 'prepared',
            error: null,
            subject: fields.subject,
            owner_key_hash: fields.ownerKeyHash,
            owner_address: fields.ownerAddress,
            asset_name: fields.assetName,
            tx_hash: fields.txHash,
            tx_cbor: fields.txCbor,
            signed_cbor: null,
            ttl_slot: fields.ttlSlot,
            sign_until: new Date(fields.signUntil),
            code_hash: hashOf(fields.code),
            fee_option: 0,
            network_fee: '487000',
            game_fee_asset: 'lovelace',
            game_fee: '1000000',
            deposit: '3700000',
            deposit_user: '1200000',
            created_at: new Date(T0),
            submitted_at: null,
            included_block: null,
            ended_at: null,
        });
        expect(JSON.parse(op.required_keys)).toEqual(fields.requiredKeys);
        expect(op.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(ops.OPEN).toContain(op.state);
        for (const found of [await ops.openOf(pool, playerId), await ops.openForItem(pool, itemId), await ops.byId(pool, op.id), await ops.byCode(pool, fields.code)]) {
            expect(found).toEqual(op);
        }
        // the code is stored hashed only
        expect(Object.values(op)).not.toContain(fields.code);
        expect(await ops.byCode(pool, 'another code')).toBeNull();
        expect(await ops.byCode(pool, undefined)).toBeNull();
        expect(await ops.byId(pool, 'unknown')).toBeNull();
        expect(await ops.openOf(pool, 'nobody')).toBeNull();
    });

    test('one open operation per player and one per item: a second is refused until the first ended', async () => {
        const { pool, playerId, itemId, op } = await preparedMint();
        const other = await plainItem(pool, playerId);
        await expect(ops.insertPrepared(pool, fieldsOf({ playerId, itemId: other }))).rejects.toMatchObject({ name: 'OpenOperationError', reason: 'player' });
        await expect(ops.insertPrepared(pool, fieldsOf({ playerId, itemId }))).rejects.toMatchObject({ reason: 'item' });
        expect(await ops.openOf(pool, playerId)).toEqual(op);
        await ops.cancel(pool, op, T0 + 1000);
        const next = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId, now: T0 + 2000 }));
        expect(await ops.openOf(pool, playerId)).toEqual(next);
        expect(await ops.openForItem(pool, itemId)).toEqual(next);
    });

    test('a cancelled or expired mint\'s transaction may be prepared again (the build is the same within one block)', async () => {
        for (const end of [(pool, op) => ops.cancel(pool, op, T0), (pool, op) => ops.expireUnsigned(pool, op, T0 + SIGN_WINDOW_MS)]) {
            const { pool, playerId, itemId, op, fields } = await preparedMint();
            await end(pool, op);
            const again = await ops.insertPrepared(pool, { ...fields, code: 'a new code', signUntil: T0 + 2 * SIGN_WINDOW_MS, now: T0 + SIGN_WINDOW_MS });
            expect(again).toMatchObject({ state: 'prepared', tx_hash: op.tx_hash, tx_cbor: op.tx_cbor });
            expect(again.id).not.toBe(op.id);
            expect(await ops.openOf(pool, playerId)).toEqual(again);
            expect(await ops.openForItem(pool, itemId)).toEqual(again);
            expect(await ops.markSubmitted(pool, again, { signedCbor: '84a5', now: T0 + SIGN_WINDOW_MS })).toMatchObject({ state: 'submitted' });
        }
    });

    test('any other refusal of the insert is no OpenOperationError: a sign code twice, an empty asset name', async () => {
        const { pool, playerId, itemId, op, fields } = await preparedMint();
        await ops.cancel(pool, op, T0);
        // code_hash is unique (on Postgres a 23505 of another constraint)
        const twice = await ops.insertPrepared(pool, { ...fields, now: T0 }).catch(error => error);
        expect(twice).toBeInstanceOf(Error);
        expect(twice).not.toBeInstanceOf(ops.OpenOperationError);
        // an empty name could never mark the item (migration 013's CHECK): refused before anything is signed
        const empty = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId, assetName: '' })).catch(error => error);
        expect(empty).not.toBeInstanceOf(ops.OpenOperationError);
        expect(empty.message).toMatch(/check constraint/);
        expect(await ops.openOf(pool, playerId)).toBeNull();
    });

    test('a refusal by a partial unique index (another process won the race) is an OpenOperationError of that index\'s reason', async () => {
        // a database where the checks before the insert find nothing and the insert is refused
        const refusing = constraint => ({
            query: async sql => {
                if (/^\s*SELECT/.test(sql)) {
                    return { rows: [] };
                }
                throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint });
            },
        });
        const fields = fieldsOf({ playerId: 'p', itemId: 'i' });
        await expect(ops.insertPrepared(refusing('chain_ops_one_open_item'), fields)).rejects.toMatchObject({ name: 'OpenOperationError', reason: 'item' });
        await expect(ops.insertPrepared(refusing('chain_ops_one_open_player'), fields)).rejects.toMatchObject({ name: 'OpenOperationError', reason: 'player' });
        for (const constraint of ['chain_ops_code_hash_key', 'chain_ops_pkey', 'toString', undefined]) {
            const refused = await ops.insertPrepared(refusing(constraint), fields).catch(error => error);
            expect(refused).not.toBeInstanceOf(ops.OpenOperationError);
            expect(refused).toMatchObject({ code: '23505', constraint });
        }
    });

    test('every step takes the app\'s clock: a missing or non-numeric now is a TypeError', async () => {
        const { pool, op } = await preparedMint();
        await expect(ops.cancel(pool, op)).rejects.toThrow(TypeError);
        await expect(ops.cancel(pool, op, new Date(T0))).rejects.toThrow(TypeError);
        await expect(ops.expireUnsigned(pool, op, undefined)).rejects.toThrow(TypeError);
        await expect(ops.markSubmitted(pool, op, { signedCbor: '84a5', now: NaN })).rejects.toThrow(TypeError);
        expect((await ops.byId(pool, op.id)).state).toBe('prepared');
        expect(() => ops.view(op, { item: 'LIGHT_BARREL', serial: 1 })).toThrow(TypeError);
        expect(() => ops.view(op, { item: 'LIGHT_BARREL', serial: 1 }, '0')).toThrow(TypeError);
    });

    test('the open operation of each player among many ended ones (pg-mem answers some filters wrongly)', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        const ben = await players.createPlayer(pool);
        const open = {};
        for (const playerId of [ann, ben]) {
            const itemId = await plainItem(pool, playerId);
            const cancelled = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId }));
            await ops.cancel(pool, cancelled, T0);
            const expired = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId }));
            await ops.expireUnsigned(pool, expired, T0 + SIGN_WINDOW_MS);
            const final = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId: await plainItem(pool, playerId) }));
            await ops.markSubmitted(pool, final, { signedCbor: '84a5', now: T0 });
            await ops.markFinal(pool, await ops.markIncluded(pool, final, { blockNo: 10, now: T0 }), T0);
            open[playerId] = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId }));
            await ops.markSubmitted(pool, open[playerId], { signedCbor: '84a5', now: T0 });
        }
        for (const playerId of [ann, ben]) {
            expect((await ops.openOf(pool, playerId)).id).toBe(open[playerId].id);
            expect((await ops.openForItem(pool, open[playerId].item_id)).id).toBe(open[playerId].id);
        }
        const states = (await pool.query('SELECT state FROM chain_ops ORDER BY state')).rows.map(row => row.state);
        expect(states).toEqual(['cancelled', 'cancelled', 'expired', 'expired', 'final', 'final', 'submitted', 'submitted']);
    });
});

describe('each step happens once', () => {
    test('cancel: prepared → cancelled; a second cancel changes nothing', async () => {
        const { pool, op, fields } = await preparedMint();
        const cancelled = await ops.cancel(pool, op, T0 + 1000);
        expect(cancelled).toMatchObject({ state: 'cancelled', error: 'cancelled', ended_at: new Date(T0 + 1000) });
        expect(ops.ENDED).toContain(cancelled.state);
        expect(ops.ENDED_IN).toBe("('final', 'cancelled', 'expired')");
        expect(await ops.cancel(pool, op, T0 + 2000)).toBeNull();
        expect(await ops.cancel(pool, cancelled, T0 + 2000)).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(cancelled);
        // the sign page still finds it (and says it was cancelled); nobody can sign it any more
        expect(await ops.byCode(pool, fields.code)).toEqual(cancelled);
        expect(await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 + 2000 })).toBeNull();
        expect(await ops.openOf(pool, op.player_id)).toBeNull();
    });

    test('submit: prepared → submitted within the sign window; a second submit changes nothing; the sign code is used up', async () => {
        const { pool, op, fields } = await preparedMint();
        const submitted = await ops.markSubmitted(pool, op, { signedCbor: '84a5first', now: T0 + MINUTE });
        expect(submitted).toMatchObject({
            state: 'submitted',
            signed_cbor: '84a5first',
            submitted_at: new Date(T0 + MINUTE),
            last_submit_at: new Date(T0 + MINUTE),
            code_hash: null,
        });
        expect(await ops.markSubmitted(pool, op, { signedCbor: '84a5second', now: T0 + 2 * MINUTE })).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(submitted);
        expect(await ops.byCode(pool, fields.code)).toBeNull();
        // a cancel comes too late once it is signed
        expect(await ops.cancel(pool, op, T0 + 2 * MINUTE)).toBeNull();
        expect(await ops.expireUnsigned(pool, op, T0 + SIGN_WINDOW_MS)).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(submitted);
    });

    test('the sign window: a signature at or after its end is refused; the unsigned mint expires then, not before', async () => {
        const { pool, op } = await preparedMint();
        const end = T0 + SIGN_WINDOW_MS;
        expect(await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: end })).toBeNull();
        expect(await ops.expireUnsigned(pool, op, end - 1)).toBeNull();
        expect((await ops.byId(pool, op.id)).state).toBe('prepared');
        const expired = await ops.expireUnsigned(pool, op, end);
        expect(expired).toMatchObject({ state: 'expired', error: 'not-signed', ended_at: new Date(end) });
        expect(await ops.expireUnsigned(pool, op, end + 1)).toBeNull();
        expect(await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: end - 1 })).toBeNull();
        expect(await ops.cancel(pool, op, end + 1)).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(expired);
    });

    test('included, then final: once each, in this order', async () => {
        const { pool, op } = await preparedMint();
        expect(await ops.markIncluded(pool, op, { blockNo: 7, now: T0 })).toBeNull();
        expect(await ops.markFinal(pool, op, T0)).toBeNull();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        const included = await ops.markIncluded(pool, op, { blockNo: 7, now: T0 + MINUTE });
        expect(included).toMatchObject({ state: 'included', included_block: 7, included_at: new Date(T0 + MINUTE) });
        expect(await ops.markIncluded(pool, op, { blockNo: 8, now: T0 + 2 * MINUTE })).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(included);
        expect(await ops.expireSubmitted(pool, op, T0 + 2 * MINUTE)).toBeNull();
        const final = await ops.markFinal(pool, included, T0 + 3 * MINUTE);
        expect(final).toMatchObject({ state: 'final', error: null, final_at: new Date(T0 + 3 * MINUTE), ended_at: new Date(T0 + 3 * MINUTE) });
        expect(await ops.markFinal(pool, included, T0 + 4 * MINUTE)).toBeNull();
        expect(await ops.markRolledBack(pool, included)).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(final);
        expect(await ops.openOf(pool, op.player_id)).toBeNull();
    });

    test('a stale copy of an inclusion that was rolled back and included again at another block neither rolls back nor finalises', async () => {
        const { pool, itemId, op } = await preparedMint();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        const stale = await ops.markIncluded(pool, op, { blockNo: 5, now: T0 });
        expect(await ops.markRolledBack(pool, stale)).toMatchObject({ state: 'submitted', included_block: null });
        const fresh = await ops.markIncluded(pool, op, { blockNo: 6, now: T0 + MINUTE });
        // a second process still holding the inclusion at block 5
        expect(await ops.markRolledBack(pool, stale)).toBeNull();
        expect(await ops.markFinal(pool, stale, T0 + 2 * MINUTE)).toBeNull();
        expect(await ops.byId(pool, op.id)).toEqual(fresh);
        expect(await itemRow(pool, itemId)).toMatchObject({ asset_name: op.asset_name, minted_at: new Date(T0 + MINUTE) });
        // the copy of the inclusion at block 6 does both
        expect(await ops.markFinal(pool, fresh, T0 + 2 * MINUTE)).toMatchObject({ state: 'final', included_block: 6 });
    });

    test('an inclusion needs its block: without a whole block number nothing is written; the table refuses one without it', async () => {
        const { pool, op } = await preparedMint();
        const submitted = await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        for (const blockNo of [undefined, null, -1, 1.5, '5', NaN, Infinity]) {
            await expect(ops.markIncluded(pool, op, { blockNo, now: T0 })).rejects.toThrow(TypeError);
        }
        expect(await ops.byId(pool, op.id)).toEqual(submitted);
        // past ops.js too (an included operation without its block could never be rolled back or finalised)
        await expect(pool.query("UPDATE chain_ops SET state = 'included' WHERE id = $1", [op.id])).rejects.toThrow(/check constraint/);
        expect(await ops.byId(pool, op.id)).toEqual(submitted);
        expect(await ops.markIncluded(pool, op, { blockNo: 0, now: T0 })).toMatchObject({ state: 'included', included_block: 0 });
    });

    test('a stale copy of the second inclusion does not roll back the third', async () => {
        const { pool, op } = await preparedMint();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        await ops.markRolledBack(pool, await ops.markIncluded(pool, op, { blockNo: 5, now: T0 }));
        const second = await ops.markIncluded(pool, op, { blockNo: 6, now: T0 });
        await ops.markRolledBack(pool, second);
        const third = await ops.markIncluded(pool, op, { blockNo: 7, now: T0 });
        expect(await ops.markRolledBack(pool, second)).toBeNull();
        expect(await ops.markRolledBack(pool, third)).toMatchObject({ state: 'submitted' });
    });

    test('a submitted mint that never landed expires: rejected after the network refused it, else expired', async () => {
        const rejected = await preparedMint();
        await ops.markSubmitted(rejected.pool, rejected.op, { signedCbor: '84a5', now: T0 });
        const noted = await ops.noteSubmit(rejected.pool, rejected.op, { now: T0 + MINUTE, error: `BadInputsUTxO ${'x'.repeat(400)}`, rejected: true });
        expect(noted).toMatchObject({ state: 'submitted', last_submit_at: new Date(T0 + MINUTE), submit_rejected: true });
        expect(noted.submit_error).toHaveLength(300);
        expect(noted.submit_error.startsWith('BadInputsUTxO')).toBe(true);
        expect(await ops.expireSubmitted(rejected.pool, rejected.op, T0 + 30 * MINUTE)).toMatchObject({ state: 'expired', error: 'rejected', ended_at: new Date(T0 + 30 * MINUTE) });
        expect(await ops.expireSubmitted(rejected.pool, rejected.op, T0 + 31 * MINUTE)).toBeNull();
        // nothing is noted on an operation that is no longer submitted
        expect(await ops.noteSubmit(rejected.pool, rejected.op, { now: T0 + 32 * MINUTE, error: null })).toBeNull();

        const refusedThenTaken = await preparedMint();
        await ops.markSubmitted(refusedThenTaken.pool, refusedThenTaken.op, { signedCbor: '84a5', now: T0 });
        await ops.noteSubmit(refusedThenTaken.pool, refusedThenTaken.op, { now: T0 + MINUTE, error: 'BadInputsUTxO', rejected: true });
        // an accepted submit afterwards clears it: the transaction is in a mempool after all
        expect(await ops.noteSubmit(refusedThenTaken.pool, refusedThenTaken.op, { now: T0 + 2 * MINUTE, error: null })).toMatchObject({
            submit_error: null,
            submit_rejected: false,
            last_submit_at: new Date(T0 + 2 * MINUTE),
        });
        expect(await ops.expireSubmitted(refusedThenTaken.pool, refusedThenTaken.op, T0 + 30 * MINUTE)).toMatchObject({ state: 'expired', error: 'expired' });
    });

    test('only a refusal by the network makes the expiry rejected: a busy or unreachable provider is noted for diagnosis, and keeps an earlier refusal', async () => {
        const busy = await preparedMint();
        await ops.markSubmitted(busy.pool, busy.op, { signedCbor: '84a5', now: T0 });
        // the routes' form '<code>: <reason>' (routes/chain.js reasonOf), and errors as they are
        for (const error of ['busy: Usage is over limit.', 'TypeError: fetch failed', new ProviderError('unavailable', 'no answer'), new Error('socket hang up')]) {
            const noted = await ops.noteSubmit(busy.pool, busy.op, { now: T0 + MINUTE, error });
            expect(noted).toMatchObject({ submit_rejected: false, submit_error: String(error instanceof Error ? error.message : error) });
        }
        expect(await ops.expireSubmitted(busy.pool, busy.op, T0 + 30 * MINUTE)).toMatchObject({ state: 'expired', error: 'expired' });

        // a refusal is what the caller says it is: never read from a reason's text or an error's code
        const unsaid = await preparedMint();
        await ops.markSubmitted(unsaid.pool, unsaid.op, { signedCbor: '84a5', now: T0 });
        for (const error of ['rejected: BadInputsUTxO', new ProviderError('rejected', 'BadInputsUTxO', 400)]) {
            expect(await ops.noteSubmit(unsaid.pool, unsaid.op, { now: T0 + MINUTE, error })).toMatchObject({ submit_rejected: false });
        }

        for (const refusal of ['rejected: BadInputsUTxO', new ProviderError('rejected', 'BadInputsUTxO', 400)]) {
            const refused = await preparedMint();
            await ops.markSubmitted(refused.pool, refused.op, { signedCbor: '84a5', now: T0 });
            expect(await ops.noteSubmit(refused.pool, refused.op, { now: T0 + MINUTE, error: refusal, rejected: true })).toMatchObject({ submit_rejected: true });
            // a transient failure afterwards says nothing about the transaction: the refusal stays, the last attempt is noted
            expect(await ops.noteSubmit(refused.pool, refused.op, { now: T0 + 2 * MINUTE, error: 'busy: Usage is over limit.' })).toMatchObject({
                submit_rejected: true,
                submit_error: 'busy: Usage is over limit.',
                last_submit_at: new Date(T0 + 2 * MINUTE),
            });
            // `rejected: false` keeps it too
            expect(await ops.noteSubmit(refused.pool, refused.op, { now: T0 + 3 * MINUTE, error: 'rejected: looks like one', rejected: false })).toMatchObject({ submit_rejected: true });
            expect(await ops.expireSubmitted(refused.pool, refused.op, T0 + 30 * MINUTE)).toMatchObject({ state: 'expired', error: 'rejected' });
        }
    });

    test('the first tip seen beyond the ttl is noted on a submitted operation, and cleared again', async () => {
        const { pool, op } = await preparedMint();
        expect(await ops.noteTtlPassed(pool, op, 12)).toBeNull();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        for (const blockNo of [undefined, -1, 1.5, '5', NaN]) {
            await expect(ops.noteTtlPassed(pool, op, blockNo)).rejects.toThrow(TypeError);
        }
        expect(await ops.noteTtlPassed(pool, op, 12)).toMatchObject({ state: 'submitted', ttl_passed_block: 12 });
        expect(await ops.noteTtlPassed(pool, op, null)).toMatchObject({ state: 'submitted', ttl_passed_block: null });
        await ops.markIncluded(pool, op, { blockNo: 13, now: T0 });
        expect(await ops.noteTtlPassed(pool, op, 14)).toBeNull();
    });

    test('an inclusion and a rollback both clear the noted tip beyond the ttl: it was noted on a fork that is gone', async () => {
        const { pool, op } = await preparedMint();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        await ops.noteTtlPassed(pool, op, 12);
        const included = await ops.markIncluded(pool, op, { blockNo: 11, now: T0 });
        expect(included).toMatchObject({ state: 'included', ttl_passed_block: null });
        // noted again while included (a stale caller, past ops.js): the rollback clears it too
        await pool.query('UPDATE chain_ops SET ttl_passed_block = 12 WHERE id = $1', [op.id]);
        expect(await ops.markRolledBack(pool, included)).toMatchObject({ state: 'submitted', ttl_passed_block: null });
    });

    test('the expiry of a submitted operation holds only at the noted tip its caller decided from', async () => {
        const { pool, op } = await preparedMint();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        const noted = await ops.noteTtlPassed(pool, op, 12);
        // another process cleared it (a rollback had the tip before the ttl), or noted another
        const cleared = await ops.noteTtlPassed(pool, op, null);
        expect(await ops.expireSubmitted(pool, noted, T0 + 30 * MINUTE)).toBeNull();
        await ops.noteTtlPassed(pool, op, 14);
        expect(await ops.expireSubmitted(pool, noted, T0 + 30 * MINUTE)).toBeNull();
        expect(await ops.expireSubmitted(pool, cleared, T0 + 30 * MINUTE)).toBeNull();
        expect((await ops.byId(pool, op.id)).state).toBe('submitted');
        expect(await ops.expireSubmitted(pool, await ops.byId(pool, op.id), T0 + 30 * MINUTE)).toMatchObject({ state: 'expired', ttl_passed_block: 14 });
    });

    test('the open operations, oldest first, a page at a time after the last one of the page before', async () => {
        const pool = await createTestPool();
        const opened = [];
        for (let i = 0; i < 4; i++) {
            const playerId = await players.createPlayer(pool);
            const itemId = await plainItem(pool, playerId);
            // two of them at the same moment: the id decides between them
            opened.push(await ops.insertPrepared(pool, fieldsOf({ playerId, itemId, now: T0 + Math.min(i, 2) * MINUTE, signUntil: T0 + SIGN_WINDOW_MS })));
        }
        // an ended one is left out
        await ops.cancel(pool, opened[1], T0);
        const open = [opened[0], opened[2], opened[3]].sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
        const ids = rows => rows.map(row => row.id);
        expect(ids(await ops.openOperations(pool, { limit: 200 }))).toEqual(ids(open));
        const first = await ops.openOperations(pool, { limit: 2 });
        expect(ids(first)).toEqual(ids(open.slice(0, 2)));
        const after = { createdAt: first[1].created_at, id: first[1].id };
        expect(ids(await ops.openOperations(pool, { after, limit: 2 }))).toEqual(ids(open.slice(2)));
        expect(typeof first[0].ttl_slot).toBe('number');
    });
});

describe('the item while it is minted', () => {
    test('in a block: the asset name, minted_at and the holder from the minting output; rolled back: plain again', async () => {
        const keys = testKeys();
        const { pool, playerId, itemId, op } = await preparedMint({ ownerAddress: keys.baseAddress });
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        const included = await ops.markIncluded(pool, op, { blockNo: 5, now: T0 + MINUTE });
        expect(await itemRow(pool, itemId)).toEqual({
            player_id: playerId,
            asset_name: op.asset_name,
            minted_at: new Date(T0 + MINUTE),
            holder_subject: stake(keys),
            holder_pay: pay(keys),
            holder_since: new Date(T0 + MINUTE),
        });
        const rolledBack = await ops.markRolledBack(pool, included);
        expect(rolledBack).toMatchObject({ state: 'submitted', included_block: null, included_at: null });
        expect(await ops.markRolledBack(pool, included)).toBeNull();
        expect(await itemRow(pool, itemId)).toEqual({ player_id: playerId, asset_name: null, minted_at: null, holder_subject: null, holder_pay: null, holder_since: null });
        // and in a block again
        await ops.markIncluded(pool, op, { blockNo: 6, now: T0 + 2 * MINUTE });
        expect(await itemRow(pool, itemId)).toMatchObject({ asset_name: op.asset_name, minted_at: new Date(T0 + 2 * MINUTE) });
    });

    test('rolled back while the sync had given the item to nobody: the minter\'s plain item again', async () => {
        const { pool, playerId, itemId, op } = await preparedMint();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        const included = await ops.markIncluded(pool, op, { blockNo: 5, now: T0 });
        // what the sync writes when the token went to a key nobody linked
        await pool.query('UPDATE items SET player_id = NULL, holder_subject = $2, holder_pay = $2 WHERE id = $1', [itemId, `pay:${keyHash('dd')}`]);
        expect(await players.itemsOf(pool, playerId)).toEqual([]);
        await ops.markRolledBack(pool, included);
        expect(await itemRow(pool, itemId)).toEqual({ player_id: playerId, asset_name: null, minted_at: null, holder_subject: null, holder_pay: null, holder_since: null });
        expect(await mintedOf(pool, playerId, itemId)).toEqual({ assetName: op.asset_name, state: 'minting', operationId: op.id, signing: false });
    });

    test('minted to an enterprise address: the holder is its payment key', async () => {
        const keys = testKeys();
        const { pool, itemId, op } = await preparedMint({ ownerAddress: keys.enterpriseAddress, subject: pay(keys) });
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        await ops.markIncluded(pool, op, { blockNo: 5, now: T0 });
        expect(await itemRow(pool, itemId)).toMatchObject({ holder_subject: pay(keys), holder_pay: pay(keys) });
    });

    test('the stats: minting while prepared (signing) and submitted, minted once in a block, plain after a cancel', async () => {
        const { pool, playerId, itemId, op } = await preparedMint();
        const plain = await plainItem(pool, playerId);
        expect(await mintedOf(pool, playerId, itemId)).toEqual({ assetName: op.asset_name, state: 'minting', operationId: op.id, signing: true });
        expect(await mintedOf(pool, playerId, plain)).toBeNull();
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        expect(await mintedOf(pool, playerId, itemId)).toEqual({ assetName: op.asset_name, state: 'minting', operationId: op.id, signing: false });
        const included = await ops.markIncluded(pool, op, { blockNo: 5, now: T0 });
        expect(await mintedOf(pool, playerId, itemId)).toEqual({ assetName: op.asset_name, state: 'minted' });
        await ops.markFinal(pool, included, T0);
        expect(await mintedOf(pool, playerId, itemId)).toEqual({ assetName: op.asset_name, state: 'minted' });
        expect(await mintedOf(pool, playerId, plain)).toBeNull();

        const again = await preparedMint();
        await ops.cancel(again.pool, again.op, T0);
        expect(await mintedOf(again.pool, again.playerId, again.itemId)).toBeNull();
    });

    test('the stats of several players with mints in every state: each item its own mark, in one statement', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        const ben = await players.createPlayer(pool);
        const marks = {};
        for (const playerId of [ann, ben]) {
            const cancelled = await plainItem(pool, playerId);
            await ops.cancel(pool, await ops.insertPrepared(pool, fieldsOf({ playerId, itemId: cancelled })), T0);
            const final = await plainItem(pool, playerId);
            const finalOp = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId: final }));
            await ops.markSubmitted(pool, finalOp, { signedCbor: '84a5', now: T0 });
            await ops.markFinal(pool, await ops.markIncluded(pool, finalOp, { blockNo: 3, now: T0 }), T0);
            const open = await plainItem(pool, playerId);
            const openOp = await ops.insertPrepared(pool, fieldsOf({ playerId, itemId: open }));
            marks[playerId] = {
                [cancelled]: null,
                [final]: { assetName: finalOp.asset_name, state: 'minted' },
                [open]: { assetName: openOp.asset_name, state: 'minting', operationId: openOp.id, signing: true },
                [await plainItem(pool, playerId)]: null,
            };
        }
        for (const playerId of [ann, ben]) {
            const items = await players.itemsOf(pool, playerId);
            expect(Object.fromEntries(items.map(entry => [entry.id, entry.minted]))).toEqual(marks[playerId]);
        }
        const counted = counting(pool);
        await players.itemsOf(counted.pool, ann);
        expect(counted.counter.statements).toBe(1);
    });
});

describe('the mint and plan C\'s ownership sync', () => {
    // Ann linked by her stake key, an item of hers prepared for a mint to her base address, the
    // mint signed and in a block on the double, and marked included
    const mintedByAnn = async () => {
        const env = await chainApp();
        const annKeys = testKeys();
        const ann = await linkedPlayer(env, 'Ann', annKeys);
        const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
        const assetName = userName(1);
        const fields = fieldsOf({ playerId: ann.playerId, itemId, assetName, subject: stake(annKeys), ownerAddress: env.double.addressOf(annKeys), now: env.now() });
        const op = await ops.insertPrepared(env.pool, fields);
        await ops.markSubmitted(env.pool, op, { signedCbor: '84a5', now: env.now() });
        env.double.mintToken({ assetName, to: env.double.addressOf(annKeys) });
        const tip = env.block();
        await ops.markIncluded(env.pool, op, { blockNo: tip.blockNo, now: env.now() });
        return { env, ann, annKeys, itemId, assetName, op };
    };

    test('a mint in a block is what the sync would store: a run with the token in the minter\'s wallet changes nothing', async () => {
        const { env, ann, annKeys, itemId } = await mintedByAnn();
        const marked = await itemRow(env.pool, itemId);
        expect(marked).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys), holder_pay: pay(annKeys) });
        expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 0, failed: 0, skipped: null });
        env.block();
        expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 0, failed: 0, skipped: null });
        expect(await itemRow(env.pool, itemId)).toEqual(marked);
        expect(Number((await env.pool.query('SELECT COUNT(*) AS n FROM item_notices')).rows[0].n)).toBe(0);
    });

    test('a rollback gives the item back to its minter, even after the sync gave it to someone else, and withdraws its unseen notices', async () => {
        const { env, ann, itemId, assetName, op } = await mintedByAnn();
        const benKeys = testKeys();
        const ben = await linkedPlayer(env, 'Ben', benKeys);
        env.double.moveToken({ assetName, to: env.double.addressOf(benKeys) });
        env.block();
        await env.sync();
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ben.playerId });
        const notices = async () => (await env.pool.query('SELECT player_id, kind, seen_at FROM item_notices WHERE item_id = $1 ORDER BY kind', [itemId])).rows;
        expect(await notices()).toEqual([
            { player_id: ben.playerId, kind: 'arrived', seen_at: null },
            { player_id: ann.playerId, kind: 'departed', seen_at: null },
        ]);
        // Ann has seen hers: it stays; Ben's unseen one goes
        await players.markNoticesSeen(env.pool, ann.playerId, [(await env.pool.query("SELECT id FROM item_notices WHERE kind = 'departed'")).rows[0].id], env.now());

        const included = await ops.byId(env.pool, op.id);
        expect(await ops.markRolledBack(env.pool, included)).toMatchObject({ state: 'submitted' });
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: ann.playerId, asset_name: null, minted_at: null, holder_subject: null, holder_pay: null, holder_since: null });
        expect(await notices()).toEqual([{ player_id: ann.playerId, kind: 'departed', seen_at: new Date(env.now()) }]);
        expect(await mintedOf(env.pool, ann.playerId, itemId)).toEqual({ assetName, state: 'minting', operationId: op.id, signing: false });
        expect((await players.itemsOf(env.pool, ben.playerId)).map(entry => entry.id)).not.toContain(itemId);
        // the sync does not pick a plain item, wherever its token is on the double
        env.block();
        expect(await env.sync()).toEqual({ checked: 0, changed: 0, unknown: 0, failed: 0, skipped: null });
        expect((await itemRow(env.pool, itemId)).player_id).toBe(ann.playerId);
    });

    test('a rollback after the sync gave the item to nobody (the token at a key no player linked): the minter\'s plain item again, her unseen notice withdrawn', async () => {
        const { env, ann, itemId, assetName, op } = await mintedByAnn();
        env.double.moveToken({ assetName, to: env.double.addressOf(testKeys()) });
        env.block();
        await env.sync();
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, asset_name: assetName });
        expect((await env.pool.query('SELECT player_id, kind FROM item_notices WHERE item_id = $1', [itemId])).rows).toEqual([{ player_id: ann.playerId, kind: 'departed' }]);

        expect(await ops.markRolledBack(env.pool, await ops.byId(env.pool, op.id))).toMatchObject({ state: 'submitted' });
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: ann.playerId, asset_name: null, minted_at: null, holder_subject: null, holder_pay: null, holder_since: null });
        expect(Number((await env.pool.query('SELECT COUNT(*) AS n FROM item_notices WHERE item_id = $1', [itemId])).rows[0].n)).toBe(0);
        expect(await mintedOf(env.pool, ann.playerId, itemId)).toEqual({ assetName, state: 'minting', operationId: op.id, signing: false });
    });
});

describe('the view of an operation', () => {
    const view = (op, overrides = {}, now = T0) => ops.view({ ...op, ...overrides }, { item: 'LIGHT_BARREL', serial: 4 }, now);

    test('what the game and the sign page are shown: no transaction, no code', async () => {
        const { pool, op, itemId } = await preparedMint();
        expect(view(op)).toEqual({
            id: op.id,
            kind: 'mint',
            state: 'prepared',
            error: null,
            itemId,
            item: { item: 'LIGHT_BARREL', serial: 4 },
            assetName: op.asset_name,
            txHash: op.tx_hash,
            subject: op.subject,
            signUntil: new Date(T0 + SIGN_WINDOW_MS).toISOString(),
            // the deposit and its two parts: the reference token's stays at the items script, the
            // user token's goes with the token to the player's own address
            costs: { networkFee: 487000, gameFee: { asset: 'lovelace', label: 'ADA', amount: 1000000 }, deposit: 3700000, deposits: { reference: 2500000, user: 1200000 } },
            slow: false,
            ownerConfirmed: false,
        });
        expect(view(op, { owner_confirmed: true }).ownerConfirmed).toBe(true);
        const submitted = await ops.markSubmitted(pool, op, { signedCbor: '84a5signed', now: T0 });
        const shown = JSON.stringify(view(submitted));
        for (const secret of [op.tx_cbor, '84a5signed', op.code_hash]) {
            expect(shown).not.toContain(secret);
        }
    });

    test('slow: submitted for more than three minutes', async () => {
        const { pool, op } = await preparedMint();
        expect(view(op, {}, T0 + 10 * MINUTE).slow).toBe(false);
        const submitted = await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        expect(view(submitted, {}, T0 + 3 * MINUTE).slow).toBe(false);
        expect(view(submitted, {}, T0 + 3 * MINUTE + 1).slow).toBe(true);
        const included = await ops.markIncluded(pool, op, { blockNo: 1, now: T0 + 4 * MINUTE });
        expect(view(included, {}, T0 + 10 * MINUTE).slow).toBe(false);
    });

    test('the battlechoc fee: none, ADA, or a token by its name (its hex when the name is not printable)', async () => {
        const { op } = await preparedMint();
        const policy = 'ab'.repeat(28);
        const name = text => Buffer.from(text, 'utf8').toString('hex');
        expect(view(op, { game_fee_asset: null, game_fee: null }).costs.gameFee).toBeNull();
        expect(view(op, { game_fee_asset: policy + name('CHOC'), game_fee: '25' }).costs.gameFee).toEqual({ asset: policy + name('CHOC'), label: 'CHOC', amount: 25 });
        expect(view(op, { game_fee_asset: `${policy}00ff`, game_fee: '25' }).costs.gameFee.label).toBe('00ff');
        expect(view(op, { game_fee_asset: `${policy}${name('a\nb')}`, game_fee: '25' }).costs.gameFee.label).toBe(name('a\nb'));
    });
});

describe('on Postgres', () => {
    // a mint of `itemId` by `playerId` written past ops.js, as a second process would race it in
    const insertRaw = (pool, { playerId, itemId, state = 'prepared' }) =>
        pool.query(
            `INSERT INTO chain_ops (id, player_id, item_id, kind, state, subject, owner_key_hash, owner_address, required_keys, asset_name,
                tx_hash, tx_cbor, ttl_slot, sign_until, fee_option, network_fee, deposit, deposit_user, created_at)
             VALUES ($1, $2, $3, 'mint', $4, 's', 'k', 'a', '[]', $5, $6, '84', 1, $7, 0, '1', '1', '1', $7)`,
            [crypto.randomUUID(), playerId, itemId, state, userName(++serial), crypto.randomBytes(32).toString('hex'), new Date(T0)]
        );

    postgresOnly('the partial unique indexes refuse a second open operation for a player or an item, not an ended one', async () => {
        const { pool, playerId, itemId } = await preparedMint();
        const other = await plainItem(pool, playerId);
        await expect(insertRaw(pool, { playerId, itemId: other })).rejects.toMatchObject({ code: '23505', constraint: 'chain_ops_one_open_player' });
        const ben = await players.createPlayer(pool);
        await expect(insertRaw(pool, { playerId: ben, itemId })).rejects.toMatchObject({ code: '23505', constraint: 'chain_ops_one_open_item' });
        await insertRaw(pool, { playerId, itemId, state: 'cancelled' });
        await insertRaw(pool, { playerId, itemId: other, state: 'final' });
    });

    postgresOnly('two processes that prepare at once for one player: one operation, the other refused', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const items = [await plainItem(pool, playerId), await plainItem(pool, playerId)];
        const results = await Promise.allSettled([pool, siblingPool(pool)].map((each, i) => ops.insertPrepared(each, fieldsOf({ playerId, itemId: items[i] }))));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const [refused] = results.filter(result => result.status === 'rejected');
        expect(refused.reason).toMatchObject({ name: 'OpenOperationError', reason: 'player' });
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM chain_ops')).rows[0].n)).toBe(1);
    });

    postgresOnly('two processes that prepare one item at once for two players: one operation, the other refused for the item', async () => {
        const pool = await createTestPool();
        const ann = await players.createPlayer(pool);
        const ben = await players.createPlayer(pool);
        const itemId = await plainItem(pool, ann);
        const results = await Promise.allSettled([[pool, ann], [siblingPool(pool), ben]].map(([each, playerId]) => ops.insertPrepared(each, fieldsOf({ playerId, itemId }))));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const [refused] = results.filter(result => result.status === 'rejected');
        expect(refused.reason).toMatchObject({ name: 'OpenOperationError', reason: 'item' });
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM chain_ops')).rows[0].n)).toBe(1);
    });

    postgresOnly('a mint whose item cannot be marked stays submitted (one transaction)', async () => {
        const { pool, playerId, op } = await preparedMint();
        // another item already has the asset name (the unique index refuses the second)
        const twin = await plainItem(pool, playerId);
        await pool.query('UPDATE items SET asset_name = $2 WHERE id = $1', [twin, op.asset_name]);
        await ops.markSubmitted(pool, op, { signedCbor: '84a5', now: T0 });
        await expect(ops.markIncluded(pool, op, { blockNo: 5, now: T0 })).rejects.toThrow();
        expect((await ops.byId(pool, op.id)).state).toBe('submitted');
    });
});
