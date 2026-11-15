// The watcher's step `operations` (minting plan D, Task 5): every run moves the open operations
// along. An unsigned one past its sign window expires (also on a stale index: it needs no chain);
// on a fresh index only, a submitted one in a block becomes included (the item a minted item), an
// included one K_FINAL deep final, one whose block was rolled back submitted again, one the
// network has not taken is resubmitted (at most once a minute, while it can still land), and one
// that provably can no longer land expires: the tip past its ttl, not in the index, and K_FINAL
// blocks past the first tip seen beyond the ttl. On plan C's chain double with the real tx.js,
// through createChainApp's watcher with both steps (operations, then ownership).

const crypto = require('crypto');
const request = require('supertest');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const ops = require('../src/chain/ops');
const players = require('../src/players');
const { operationsStep, advanceOperations, RESUBMIT_AFTER_MS, MAX_PER_RUN } = require('../src/chain/operationsStep');
const { startWatcher } = require('../src/server');
const { ProviderError } = require('../src/chain/provider');
const { IndexUnavailableError } = require('../src/chain/indexUnavailable');
const { closeTestPools } = require('./helpers/db');
const { walletWitness } = require('./helpers/chain');
const { describeTx } = require('./helpers/describeTx');
const { jsonTx } = require('./chainDouble');
const { createChainApp, K_FINAL } = require('./helpers/chainApp');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const NOTHING = Object.freeze({ expired: 0, included: 0, rolledBack: 0, final: 0, resubmitted: 0, failed: 0 });

/** The app with the operations step before the ownership step (as server.js runs them), and Ann (10 matches, one wallet of 20 ADA). */
const setup = async ({ step = operationsStep, ...options } = {}) => {
    const env = await createChainApp({ steps: [step], ...options });
    const ann = await env.player('Ann', { lovelace: [20_000_000], matches: 10 });
    return { env, ann };
};

/** A mint of a new `itemKey` of `player`, prepared: { itemId, minted (the 201 answer), id }. */
const prepare = async (env, player, itemKey = 'DARK_WALLS') => {
    const itemId = await env.giveItem(player.playerId, itemKey);
    const account = await env.refreshed(player.account);
    // with the wallet's own address, as the game sends it: the owner is vouched for, the signature is taken
    const minted = (await account.post('/chain/mint', { itemId, subject: player.subjects[0], fee: 0, addresses: [player.keys[0].baseAddressHex] }).expect(201)).body;
    return { itemId, minted, id: minted.operation.id };
};

/** `player`'s wallet signs the prepared mint: the server co-signs and submits it. */
const sign = (env, player, { minted }) =>
    request(env.app)
        .post(`/chain/sign/${minted.signCode}`)
        .send({ witness: walletWitness(minted.tx, [player.keys[0].paymentKey]) })
        .expect(200);

/** A mint of `player` prepared and signed (its transaction in the double's mempool). */
const signedMint = async (env, player, itemKey) => {
    const mint = await prepare(env, player, itemKey);
    await sign(env, player, mint);
    return mint;
};

const rowOf = (env, mint) => ops.byId(env.pool, mint.id);
const itemOf = async (env, mint) =>
    (await env.pool.query('SELECT player_id, asset_name, minted_at, holder_subject, holder_pay FROM items WHERE id = $1', [mint.itemId])).rows[0];
const markOf = async (env, player, mint) => (await players.itemsOf(env.pool, player.playerId)).find(entry => entry.id === mint.itemId)?.minted ?? null;
const run = async env => (await env.runOnce()).steps.operations;

/** The clock's times of the provider's submits (the route's and the watcher's), the double answering them. */
const submitTimes = env => {
    const times = [];
    const original = env.chain.provider.submit;
    jest.spyOn(env.chain.provider, 'submit').mockImplementation(async cbor => {
        times.push(env.now());
        return original(cbor);
    });
    return times;
};

/** A block, then a run: the operations step's result. */
const blockAndRun = async env => {
    env.block();
    return run(env);
};

/** Blocks with a run after each until the tip has reached `ttlSlot` (the first tip beyond the ttl): that tip. */
const runPastTtl = async (env, ttlSlot) => {
    for (;;) {
        const tip = env.block();
        const result = await run(env);
        if (tip.slot >= ttlSlot) {
            return { tip, result };
        }
        expect(result.expired).toBe(0);
    }
};

const mintsLeft = async (env, player) => (await (await env.refreshed(player.account)).get('/chain/readiness').expect(200)).body.mintsLeftToday;

describe('a mint that lands', () => {
    test('submitted → (a block) included, the item minted and still Ann\'s after the sync → K_FINAL deep: final, once', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        // in the mempool, not in a block yet: nothing to do, and no resubmit within the minute
        expect(await run(env)).toEqual(NOTHING);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted' });

        const tip = env.block();
        const report = await env.runOnce();
        expect(report.steps.operations).toEqual({ ...NOTHING, included: 1 });
        // the sync, after the step in the same run, finds the item minted with the holder Ann (depth 0) and keeps it Ann's
        expect(report.steps.ownership).toMatchObject({ checked: 1, changed: 0, unknown: 0, failed: 0 });
        const included = await rowOf(env, mint);
        expect(included).toMatchObject({ state: 'included', included_block: tip.blockNo, error: null });
        expect(await itemOf(env, mint)).toEqual({
            player_id: ann.playerId,
            asset_name: included.asset_name,
            minted_at: new Date(env.now()),
            holder_subject: ann.subjects[0],
            holder_pay: `pay:${ann.keys[0].paymentKeyHashHex}`,
        });
        expect(await markOf(env, ann, mint)).toEqual({ assetName: included.asset_name, state: 'minted' });

        for (let depth = 1; depth < K_FINAL; depth++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
            expect(await rowOf(env, mint)).toMatchObject({ state: 'included', included_block: tip.blockNo });
        }
        expect(await blockAndRun(env)).toEqual({ ...NOTHING, final: 1 });
        const final = await rowOf(env, mint);
        expect(final).toMatchObject({ state: 'final', error: null, final_at: new Date(env.now()), ended_at: new Date(env.now()) });
        expect(env.double.tip().blockNo - tip.blockNo).toBe(K_FINAL);

        // final once: further runs change nothing
        expect(await blockAndRun(env)).toEqual(NOTHING);
        expect(await rowOf(env, mint)).toEqual(final);
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: included.asset_name });
    });

    test('already deep when first seen (the watcher was down): included and final in one run', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        env.block(K_FINAL + 1);
        expect(await run(env)).toEqual({ ...NOTHING, included: 1, final: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'final' });
    });

    test('in a mempool for minutes, each resubmit refused as a real node refuses a transaction it already has, then it lands: never rejected', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        // a real provider answers a transaction it already holds (in its mempool or on chain) with a rejection
        const original = env.chain.provider.submit;
        const refused = [];
        jest.spyOn(env.chain.provider, 'submit').mockImplementation(async cbor => {
            if (env.double.mempool().includes(op.tx_hash) || (await env.chain.index.transaction(op.tx_hash))) {
                refused.push(env.now());
                throw new ProviderError('rejected', 'ApplyTxError [UtxowFailure (UtxoFailure (BadInputsUTxO …)))]', 400);
            }
            return original(cbor);
        });
        env.double.holdMempool(true);
        for (let i = 0; i < 15; i++) {
            await blockAndRun(env);
        }
        expect(refused.length).toBeGreaterThanOrEqual(4);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', submit_rejected: true, error: null });

        env.double.holdMempool(false);
        expect(await blockAndRun(env)).toEqual({ ...NOTHING, included: 1 });
        for (let i = 0; i < K_FINAL; i++) {
            await blockAndRun(env);
        }
        expect(await rowOf(env, mint)).toMatchObject({ state: 'final', error: null });
        const account = await env.refreshed(ann.account);
        expect((await account.get(`/chain/operations/${mint.id}`).expect(200)).body).toMatchObject({ state: 'final', error: null });
    });
});

describe('no fresh index needed', () => {
    test('a cancel and the unsigned expiry work on a stale and on an unavailable index', async () => {
        const { env, ann } = await setup();
        const cancelled = await prepare(env, ann);
        env.double.fail({ index: 'stale' });
        const account = await env.refreshed(ann.account);
        expect((await account.del(`/chain/operations/${cancelled.id}`).expect(200)).body).toMatchObject({ state: 'cancelled' });

        for (const fault of ['stale', 'unavailable']) {
            env.double.fail({});
            const mint = await prepare(env, ann, 'NUT_BRICKS');
            env.double.fail({ index: fault });
            env.advance(rules.SIGN_WINDOW_MS - 1);
            expect(await run(env)).toEqual(NOTHING);
            env.advance(1);
            const report = await env.runOnce();
            expect(report.fresh).toBe(false);
            expect(report.steps.operations).toEqual({ ...NOTHING, expired: 1 });
            expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'not-signed', ended_at: new Date(env.now()) });
            expect(await markOf(env, ann, mint)).toBeNull();
        }
    });
});

describe('a mint that never lands', () => {
    test('held in the mempool: resubmitted at most once a minute while it can land, expired only K_FINAL blocks after the first tip beyond its ttl', async () => {
        const { env, ann } = await setup();
        const times = submitTimes(env);
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        const signedAt = env.now();
        expect(await mintsLeft(env, ann)).toBe(rules.MINTS_PER_DAY - 1);
        env.double.holdMempool(true);

        // within the minute: no resubmit, however often the watcher runs
        env.advance(RESUBMIT_AFTER_MS - 1);
        expect(await run(env)).toEqual(NOTHING);
        expect(await run(env)).toEqual(NOTHING);
        expect(times).toEqual([signedAt]);
        env.advance(1);
        expect(await run(env)).toEqual({ ...NOTHING, resubmitted: 1 });
        expect(await run(env)).toEqual(NOTHING);
        expect(times).toEqual([signedAt, signedAt + RESUBMIT_AFTER_MS]);

        const { tip: beyond } = await runPastTtl(env, op.ttl_slot);
        // every submit while the transaction could still land, a minute apart at least
        const gaps = times.slice(1).map((time, i) => time - times[i]);
        expect(gaps.every(gap => gap >= RESUBMIT_AFTER_MS)).toBe(true);
        expect(times.length).toBeGreaterThan(10);
        const lastSubmit = times[times.length - 1];
        expect(lastSubmit).toBeLessThan(env.now());
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: beyond.blockNo, submit_rejected: false });

        for (let i = 1; i < K_FINAL; i++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
            expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted' });
        }
        expect(times[times.length - 1]).toBe(lastSubmit);
        // before the irreversible end the provider is asked for the user token, once, and has none
        const byUnit = jest.spyOn(env.chain.provider, 'utxoByUnit');
        expect(await blockAndRun(env)).toEqual({ ...NOTHING, expired: 1 });
        expect(byUnit.mock.calls).toEqual([[env.chain.policyId + op.asset_name]]);
        expect(env.double.tip().blockNo - beyond.blockNo).toBe(K_FINAL);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'expired', ended_at: new Date(env.now()) });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: null, minted_at: null, holder_subject: null });
        expect(await markOf(env, ann, mint)).toBeNull();
        expect(await mintsLeft(env, ann)).toBe(rules.MINTS_PER_DAY);
        // ended: a further run leaves it alone
        expect(await blockAndRun(env)).toEqual(NOTHING);
    });

    test('a first submit refused, then the wallet spends its ADA elsewhere: the resubmit is refused, and the expiry says rejected', async () => {
        const { env, ann } = await setup();
        const original = env.chain.provider.submit;
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValueOnce(new ProviderError('busy', 'Usage is over limit.', 429));
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        // a transient failure is noted for diagnosis, it is no rejection
        expect(op).toMatchObject({ state: 'submitted', submit_rejected: false });
        expect(op.submit_error).toMatch(/^busy: /);
        expect(env.double.mempool()).toEqual([]);

        // the wallet spends the mint's inputs on something else
        const { inputs } = describeTx(op.signed_cbor);
        await original(jsonTx({ txHash: crypto.randomBytes(32).toString('hex'), ttlSlot: null, inputs, outputs: [{ address: ann.keys[0].baseAddress, lovelace: '19000000' }] }));
        env.block();
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, resubmitted: 1 });
        const refused = await rowOf(env, mint);
        expect(refused).toMatchObject({ state: 'submitted', submit_rejected: true });
        expect(refused.submit_error).toMatch(/^rejected: BadInputsUTxO/);

        const { tip: beyond } = await runPastTtl(env, op.ttl_slot);
        for (let i = 1; i < K_FINAL; i++) {
            await blockAndRun(env);
        }
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: beyond.blockNo });
        expect(await blockAndRun(env)).toEqual({ ...NOTHING, expired: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'rejected' });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: null });
    });

    test('the provider busy at every submit: noted for diagnosis, logged once, never a rejection; the expiry says expired', async () => {
        const { env, ann } = await setup();
        env.double.holdMempool(true);
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValueOnce(new ProviderError('busy', 'Usage is over limit.', 429));
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        env.double.fail({ provider: 'busy' });
        const results = [];
        const { tip: beyond } = await (async () => {
            for (;;) {
                const tip = env.block();
                results.push(await run(env));
                if (tip.slot >= op.ttl_slot) {
                    return { tip };
                }
            }
        })();
        // one failed resubmit a minute, none counted as answered
        expect(results.filter(result => result.failed === 1).length).toBeGreaterThan(10);
        expect(results.every(result => result.resubmitted === 0)).toBe(true);
        const noted = await rowOf(env, mint);
        expect(noted).toMatchObject({ state: 'submitted', submit_rejected: false, ttl_passed_block: beyond.blockNo });
        expect(noted.submit_error).toMatch(/^busy: /);
        // a failure that lasts is logged when it starts, not at every run or every minute
        const lines = env.log.warn.mock.calls.filter(call => /operations/.test(call[0]));
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatch(/could not be submitted again/);
        expect(env.log.error.mock.calls.filter(call => /operations/.test(call[0]))).toHaveLength(0);

        for (let i = 1; i < K_FINAL; i++) {
            await blockAndRun(env);
        }
        // still busy: it cannot say whether the token exists, so the expiry waits (no failure)
        expect(await blockAndRun(env)).toEqual(NOTHING);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted' });
        env.double.fail({});
        expect(await run(env)).toEqual({ ...NOTHING, expired: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'expired' });
    });

    test('the provider back: an accepted resubmit clears a recorded refusal (the transaction is in a mempool after all) and the "works again" line', async () => {
        const { env, ann } = await setup();
        env.double.holdMempool(true);
        jest.spyOn(env.chain.provider, 'submit')
            .mockRejectedValueOnce(new ProviderError('rejected', 'BadInputsUTxO', 400))
            .mockRejectedValueOnce(new ProviderError('unavailable', 'no answer within 10000 ms'));
        const mint = await signedMint(env, ann);
        expect(await rowOf(env, mint)).toMatchObject({ submit_rejected: true });
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        // a transient failure after a refusal keeps the refusal, and is noted
        const kept = await rowOf(env, mint);
        expect(kept).toMatchObject({ submit_rejected: true });
        expect(kept.submit_error).toMatch(/^unavailable: /);
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, resubmitted: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ submit_rejected: false, submit_error: null });
        expect(env.log.warn.mock.calls.filter(call => /operations/.test(call[0]))).toHaveLength(1);
        expect(env.log.info.mock.calls.filter(call => /operations: submitting works again/.test(call[0]))).toHaveLength(1);
    });

    test('a resubmit refused with the transaction\'s bytes in its reason: noted and logged without them', async () => {
        const { env, ann } = await setup();
        env.double.holdMempool(true);
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValue(new ProviderError('unavailable', `could not send ${op.signed_cbor}`));
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        const noted = await rowOf(env, mint);
        expect(noted.submit_error).toBe('unavailable: could not send <bytes>');
        const logged = JSON.stringify([env.log.info.mock.calls, env.log.warn.mock.calls, env.log.error.mock.calls]);
        expect(logged).toContain('<bytes>');
        expect(logged).not.toContain(op.signed_cbor.slice(0, 120));
    });
});

describe('the provider asked before an expiry (the index alone never ends a mint)', () => {
    /** Ann's mint signed, its transaction held by the chain or not, and the runs up to the one where the index's rule would expire it. */
    const readyToExpire = async env => {
        const { ann } = env;
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        await runPastTtl(env, op.ttl_slot);
        for (let i = 1; i < K_FINAL; i++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
        }
        return { mint, op };
    };
    const missingLines = env => env.log.error.mock.calls.filter(call => /index does not have a mint the provider sees/.test(call[0]));

    test('the mint landed but the index misses it: never expired, logged once as an error, asked once a run; the index caught up: included and final', async () => {
        const { env, ann } = await setup();
        env.ann = ann;
        // the index drops this mint (a filter that keeps nothing of it), the chain has it
        let hidden = null;
        const transaction = env.chain.index.transaction;
        jest.spyOn(env.chain.index, 'transaction').mockImplementation(async hash => (hash === hidden ? null : transaction(hash)));
        const submit = env.chain.provider.submit;
        jest.spyOn(env.chain.provider, 'submit').mockImplementation(async cbor => {
            hidden = describeTx(cbor).txHash;
            return submit(cbor);
        });
        const byUnit = jest.spyOn(env.chain.provider, 'utxoByUnit');
        const { mint, op } = await readyToExpire(env);
        expect(await env.chain.provider.utxoByUnit(env.chain.policyId + op.asset_name)).toBeDefined();
        byUnit.mockClear();
        // asked only for an operation the index's rule would expire, never at the runs before
        for (let i = 0; i < 3; i++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
            expect(byUnit).toHaveBeenCalledTimes(i + 1);
        }
        expect(byUnit.mock.calls.every(([unit]) => unit === env.chain.policyId + op.asset_name)).toBe(true);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', error: null });
        expect(await markOf(env, ann, mint)).toMatchObject({ state: 'minting' });
        const lines = missingLines(env);
        expect(lines).toHaveLength(1);
        expect(lines[0][1]).toEqual({ operations: [op.id] });

        // the index has it after all (its filters fixed, synced again): the normal path, from the block it is in
        hidden = null;
        expect(await run(env)).toEqual({ ...NOTHING, included: 1, final: 1 });
        expect(await itemOf(env, mint)).toMatchObject({ asset_name: op.asset_name });
        expect(missingLines(env)).toHaveLength(1);
    });

    test('the provider cannot answer when the expiry is due: no expiry and no failure that run, and no more asking in it; it answers no token: expired', async () => {
        const { env, ann } = await setup();
        env.ann = ann;
        // Ben's mint is due in the same run as Ann's
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        env.double.holdMempool(true);
        const benMint = await signedMint(env, ben);
        const { mint } = await readyToExpire(env);
        const byUnit = jest.spyOn(env.chain.provider, 'utxoByUnit');
        env.double.fail({ provider: 'unavailable' });
        // one call a run: after the first that got no answer the run asks no more (each could wait for the timeout)
        expect(await blockAndRun(env)).toEqual(NOTHING);
        expect(await run(env)).toEqual(NOTHING);
        expect(byUnit).toHaveBeenCalledTimes(2);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted' });
        expect(await rowOf(env, benMint)).toMatchObject({ state: 'submitted' });
        expect(env.log.error.mock.calls.filter(call => /operations/.test(call[0]))).toEqual([]);
        env.double.fail({});
        expect(await run(env)).toEqual({ ...NOTHING, expired: 2 });
        expect(byUnit).toHaveBeenCalledTimes(4);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'expired' });
        expect(await rowOf(env, benMint)).toMatchObject({ state: 'expired', error: 'expired' });
        expect(missingLines(env)).toEqual([]);
    });
});

describe('rollbacks', () => {
    test('the block rolled back: submitted again before the sync looks, the item plain and Ann\'s; landed again with the next block: included and minted again', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        env.block();
        await run(env);
        const { asset_name: assetName } = await rowOf(env, mint);

        env.double.rollback(1);
        const report = await env.runOnce();
        expect(report.steps.operations).toEqual({ ...NOTHING, rolledBack: 1 });
        // the step ran first: the sync no longer sees a minted item
        expect(report.steps.ownership).toMatchObject({ checked: 0, changed: 0 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', included_block: null, included_at: null });
        expect(await itemOf(env, mint)).toEqual({ player_id: ann.playerId, asset_name: null, minted_at: null, holder_subject: null, holder_pay: null });
        expect(await markOf(env, ann, mint)).toMatchObject({ state: 'minting', signing: false });

        // the rollback put the transaction back into the mempool: the next block has it
        const tip = env.block();
        const again = await env.runOnce();
        expect(again.steps.operations).toEqual({ ...NOTHING, included: 1 });
        expect(again.steps.ownership).toMatchObject({ checked: 1, changed: 0 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'included', included_block: tip.blockNo });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: assetName, holder_subject: ann.subjects[0] });
    });

    test('rolled back and included again at another block between two runs: included at the new block, final K_FINAL blocks after it', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        const first = env.block();
        await run(env);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'included', included_block: first.blockNo });

        // the block goes, two blocks without the transaction, then it lands at N + 2
        env.double.rollback(1);
        env.double.holdMempool(true);
        env.block(2);
        env.double.holdMempool(false);
        const landed = env.block();
        expect(landed.blockNo).toBe(first.blockNo + 2);
        expect(await env.chain.index.transaction((await rowOf(env, mint)).tx_hash)).toMatchObject({ blockNo: landed.blockNo });

        expect(await run(env)).toEqual({ ...NOTHING, rolledBack: 1, included: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'included', included_block: landed.blockNo });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, holder_subject: ann.subjects[0] });

        // K_FINAL deep from the first block would be two blocks early
        for (let depth = 1; depth < K_FINAL; depth++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
        }
        expect(env.double.tip().blockNo - first.blockNo).toBeGreaterThanOrEqual(K_FINAL);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'included' });
        expect(await blockAndRun(env)).toEqual({ ...NOTHING, final: 1 });
        expect(env.double.tip().blockNo - landed.blockNo).toBe(K_FINAL);
    });

    test('rolled back with the transaction dropped, past the ttl: submitted again, resubmitted while it can land, then expired; the item plain', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        env.block();
        await run(env);
        const op = await rowOf(env, mint);
        env.double.rollback(1, { drop: true });
        // nobody takes it again (the wallet's node forgot it too)
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValue(new ProviderError('unavailable', 'no answer'));
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toMatchObject({ rolledBack: 1, failed: 1 });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: null });

        const { tip: beyond } = await runPastTtl(env, op.ttl_slot);
        for (let i = 1; i < K_FINAL; i++) {
            await blockAndRun(env);
        }
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: beyond.blockNo });
        expect(await blockAndRun(env)).toMatchObject({ expired: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'expired', error: 'expired' });
        expect(await itemOf(env, mint)).toMatchObject({ player_id: ann.playerId, asset_name: null, minted_at: null });
    });

    test('the tip back before the ttl after a rollback: the count towards the expiry starts again at the next tip beyond it', async () => {
        const { env, ann } = await setup();
        env.double.holdMempool(true);
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        const { tip: beyond } = await runPastTtl(env, op.ttl_slot);
        expect(await rowOf(env, mint)).toMatchObject({ ttl_passed_block: beyond.blockNo });

        // the blocks from the one beyond the ttl roll back: the transaction could land again
        env.double.rollback(2);
        expect(env.double.tip().slot).toBeLessThan(op.ttl_slot);
        await run(env);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: null });

        // the watcher first sees a tip beyond the ttl again one block later than before
        env.block(2);
        const { tip: again } = await runPastTtl(env, op.ttl_slot);
        expect(again.blockNo).toBeGreaterThan(beyond.blockNo);
        expect(await rowOf(env, mint)).toMatchObject({ ttl_passed_block: again.blockNo });
        for (let i = 1; i < K_FINAL; i++) {
            await blockAndRun(env);
        }
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted' });
        expect(await blockAndRun(env)).toMatchObject({ expired: 1 });
    });

    test('included on another fork after the tip beyond the ttl was noted, then briefly missing: no expiry on the old note, only a new one', async () => {
        const { env, ann } = await setup();
        env.double.holdMempool(true);
        const mint = await signedMint(env, ann);
        const op = await rowOf(env, mint);
        const { tip: beyond } = await runPastTtl(env, op.ttl_slot);
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: beyond.blockNo });

        // the index shows the transaction in a block of a fork that replaced blocks before the ttl
        const original = env.chain.index.transaction;
        let shown = { blockNo: env.block().blockNo, slot: op.ttl_slot - 20 };
        jest.spyOn(env.chain.index, 'transaction').mockImplementation(async hash => (hash === op.tx_hash ? shown : original(hash)));
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'included', included_block: shown.blockNo });
        for (let depth = 1; depth < K_FINAL; depth++) {
            expect(await blockAndRun(env)).toEqual(NOTHING);
        }
        // K_FINAL past the old note, not past the inclusion
        expect(env.double.tip().blockNo - beyond.blockNo).toBeGreaterThanOrEqual(K_FINAL);

        // missing for one run (a rollback, or the index between two writes): rolled back, the tip beyond the ttl noted anew, not expired
        shown = null;
        expect(await run(env)).toEqual({ ...NOTHING, rolledBack: 1 });
        expect(await rowOf(env, mint)).toMatchObject({ state: 'submitted', ttl_passed_block: env.double.tip().blockNo });
        expect(await itemOf(env, mint)).toMatchObject({ asset_name: null });
    });
});

describe('a stale index', () => {
    test('decides nothing on the chain: no inclusion, rollback, final, resubmit or expiry, until it is fresh again', async () => {
        const { env, ann } = await setup();
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const carl = await env.player('Carl', { lovelace: [20_000_000], matches: 10 });
        // Ann's mint in a block (deep enough for final by the end), Ben's in the next block (rolled
        // back and gone during the outage), Carl's waiting in the mempool (past its ttl by the end)
        const annMint = await signedMint(env, ann);
        env.block();
        await run(env);
        const benMint = await signedMint(env, ben);
        env.block();
        await run(env);
        env.double.holdMempool(true);
        const carlMint = await signedMint(env, carl);
        const carlOp = await rowOf(env, carlMint);
        const before = await Promise.all([annMint, benMint, carlMint].map(mint => rowOf(env, mint)));
        expect(before.map(op => op.state)).toEqual(['included', 'included', 'submitted']);

        const times = submitTimes(env);
        env.double.fail({ index: 'stale' });
        env.double.rollback(1, { drop: true });
        for (let i = 0; i < 70 + K_FINAL; i++) {
            const report = await env.runOnce();
            expect(report.fresh).toBe(false);
            expect(report.steps.operations).toEqual(NOTHING);
            env.block();
        }
        expect(env.double.tip().slot).toBeGreaterThan(carlOp.ttl_slot);
        expect(await Promise.all([annMint, benMint, carlMint].map(mint => rowOf(env, mint)))).toEqual(before);
        expect(times).toEqual([]);

        // fresh again: Ann's final, Ben's rolled back, Carl's past the ttl from now on
        env.double.fail({});
        const result = await run(env);
        expect(result).toMatchObject({ final: 1, rolledBack: 1, expired: 0 });
        expect((await rowOf(env, carlMint)).ttl_passed_block).toBe(env.double.tip().blockNo);
    });
});

describe('failures and volume', () => {
    test('one operation\'s failure does not stop the others; it is logged once while it lasts, and once when it clears', async () => {
        const { env, ann } = await setup();
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const annMint = await signedMint(env, ann);
        const benMint = await signedMint(env, ben);
        env.block();
        const original = ops.markIncluded;
        const annOp = await rowOf(env, annMint);
        const spy = jest.spyOn(ops, 'markIncluded').mockImplementation((pool, op, fields) => {
            if (op.id === annOp.id) {
                return Promise.reject(new Error('connection reset'));
            }
            return original(pool, op, fields);
        });
        expect(await run(env)).toEqual({ ...NOTHING, included: 1, failed: 1 });
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        expect((await rowOf(env, annMint)).state).toBe('submitted');
        expect((await rowOf(env, benMint)).state).toBe('included');
        const failures = env.log.error.mock.calls.filter(call => /operations/.test(call[0]));
        expect(failures).toHaveLength(1);
        expect(failures[0][0]).toMatch(/1 of 2 open operations failed/);
        expect(JSON.stringify(failures)).toContain('connection reset');

        spy.mockRestore();
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect(env.log.info.mock.calls.filter(call => /operations: no operation fails any more/.test(call[0]))).toHaveLength(1);
        expect(await run(env)).toEqual(NOTHING);
        expect(env.log.error.mock.calls.filter(call => /operations/.test(call[0]))).toHaveLength(1);
    });

    test('a step another process won (a lost compare-and-set) is no failure: nothing counted or logged, the rest goes on, the next run reads it again', async () => {
        const { env, ann } = await setup();
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const annMint = await signedMint(env, ann);
        // Ann's is the older one: the first step of the run
        env.advance(1000);
        const benMint = await signedMint(env, ben);
        env.block();
        jest.spyOn(ops, 'markIncluded').mockResolvedValueOnce(null);
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect((await rowOf(env, annMint)).state).toBe('submitted');
        expect((await rowOf(env, benMint)).state).toBe('included');
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect((await rowOf(env, annMint)).state).toBe('included');
        const lines = [env.log.info, env.log.warn, env.log.error].flatMap(fn => fn.mock.calls).filter(call => /operations/.test(call[0]) && !/included/.test(call[0]));
        expect(lines).toEqual([]);
    });

    test('on a stale index nothing on the chain is looked at either: a lasting failure is not reported as over', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        env.block();
        const spy = jest.spyOn(ops, 'markIncluded').mockRejectedValue(new Error('connection reset'));
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        spy.mockRestore();
        const over = () => env.log.info.mock.calls.filter(call => /no operation fails any more/.test(call[0]));
        env.double.fail({ index: 'stale' });
        expect(await run(env)).toEqual(NOTHING);
        expect(over()).toHaveLength(0);
        env.double.fail({});
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect(over()).toHaveLength(1);
        expect((await rowOf(env, mint)).state).toBe('included');
    });

    test('while the index is down nothing is looked at: a lasting failure is not reported as over', async () => {
        const { env, ann } = await setup();
        const mint = await signedMint(env, ann);
        env.block();
        const spy = jest.spyOn(ops, 'markIncluded').mockRejectedValue(new Error('connection reset'));
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        jest.spyOn(env.chain.index, 'transaction').mockRejectedValueOnce(new IndexUnavailableError('the views are gone'));
        expect((await env.runOnce()).steps.operations.error).toBeInstanceOf(IndexUnavailableError);
        const over = () => env.log.info.mock.calls.filter(call => /no operation fails any more/.test(call[0]));
        expect(over()).toHaveLength(0);
        spy.mockRestore();
        expect(await run(env)).toEqual({ ...NOTHING, included: 1 });
        expect(over()).toHaveLength(1);
        expect((await rowOf(env, mint)).state).toBe('included');
    });

    test('after a transient provider failure no more resubmits in that run (each may wait for the provider\'s timeout); a refusal does not stop the others', async () => {
        const { env, ann } = await setup();
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const carl = await env.player('Carl', { lovelace: [20_000_000], matches: 10 });
        env.double.holdMempool(true);
        for (const player of [ann, ben, carl]) {
            await signedMint(env, player);
        }
        const submit = jest.spyOn(env.chain.provider, 'submit').mockRejectedValue(new ProviderError('unavailable', 'no answer within 10000 ms'));
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, failed: 1 });
        expect(submit).toHaveBeenCalledTimes(1);
        // the provider answers again (refusals: each node has the transaction already): every one is resubmitted
        submit.mockClear();
        submit.mockRejectedValue(new ProviderError('rejected', 'BadInputsUTxO', 400));
        env.advance(RESUBMIT_AFTER_MS);
        expect(await run(env)).toEqual({ ...NOTHING, resubmitted: 3 });
        expect(submit).toHaveBeenCalledTimes(3);
    });

    test('the index failing in the middle of a run: the rest gets only what needs no chain, and the watcher hears of the index', async () => {
        const { env, ann } = await setup();
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const annMint = await signedMint(env, ann);
        const benMint = await prepare(env, ben);
        env.advance(rules.SIGN_WINDOW_MS);
        // Ann's transaction lands, and the index is fresh
        env.block();
        jest.spyOn(env.chain.index, 'transaction').mockRejectedValueOnce(new IndexUnavailableError('the views are gone'));
        const report = await env.runOnce();
        expect(report.steps.operations.error).toBeInstanceOf(IndexUnavailableError);
        expect((await rowOf(env, annMint)).state).toBe('submitted');
        expect(await rowOf(env, benMint)).toMatchObject({ state: 'expired', error: 'not-signed' });
        expect(await run(env)).toMatchObject({ included: 1 });
    });

    test(`at most ${MAX_PER_RUN} operations a run, oldest first; the next run goes on after the last, then starts again from the oldest`, async () => {
        const seen = [];
        const step = {
            name: 'operations',
            run: context => advanceOperations({ ...context, limit: 2 }),
        };
        const { env, ann } = await setup({ step });
        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const carl = await env.player('Carl', { lovelace: [20_000_000], matches: 10 });
        const mints = [];
        for (const player of [ann, ben, carl]) {
            mints.push(await prepare(env, player));
            env.advance(1000);
        }
        const openOperations = ops.openOperations;
        jest.spyOn(ops, 'openOperations').mockImplementation(async (...args) => {
            const rows = await openOperations(...args);
            seen.push(rows.map(row => row.id));
            return rows;
        });
        const ids = mints.map(mint => mint.id);
        await run(env);
        await run(env);
        await run(env);
        expect(seen).toEqual([[ids[0], ids[1]], [ids[2]], [ids[0], ids[1]]]);

        env.advance(rules.SIGN_WINDOW_MS);
        expect(await run(env)).toEqual({ ...NOTHING, expired: 1 });
        expect(await run(env)).toEqual({ ...NOTHING, expired: 2 });
        expect((await Promise.all(mints.map(mint => rowOf(env, mint)))).map(op => op.state)).toEqual(['expired', 'expired', 'expired']);
    });
});

describe('what a failure says (lastingLog.js reasonOf, the routes\' and the watcher\'s one rule)', () => {
    test('its code or name, its cause or message, bytes cut, at most the limit given', () => {
        const { reasonOf } = require('../src/chain/lastingLog');
        const bytes = 'ab'.repeat(60);
        expect(reasonOf(new ProviderError('rejected', `BadInputsUTxO ${bytes}`, 400), 300)).toBe('rejected: BadInputsUTxO <bytes>');
        expect(reasonOf(Object.assign(new Error('the build failed'), { code: 'BUILD_FAILED', cause: 'no top-up found' }), 300)).toBe('BUILD_FAILED: no top-up found');
        expect(reasonOf(new TypeError('fetch failed'), 300)).toBe('TypeError: fetch failed');
        expect(reasonOf('plain text', 300)).toBe('Error: plain text');
        expect(reasonOf(new Error('x'.repeat(1000)), 300)).toHaveLength(300);
        expect(reasonOf(new Error('x'.repeat(1000)), 500)).toHaveLength(500);
    });
});

describe('in the server', () => {
    test('startWatcher runs the operations step before the ownership step', async () => {
        const env = await createChainApp();
        const runtime = { chain: env.chain, watcher: null };
        const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
        const stop = startWatcher({ chain: env.chain, pool: env.pool, intervalMs: 20000, runtime, log });
        try {
            const report = await runtime.watcher.runOnce();
            expect(Object.keys(report.steps)).toEqual(['operations', 'ownership']);
            expect(report.steps.operations).toEqual(NOTHING);
        } finally {
            stop();
        }
    });
});
