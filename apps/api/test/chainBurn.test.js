// The burn of a minted item (minting plan E, Task 2): POST /chain/burn checks the item, the
// player and the holder's wallet, builds the unsigned burn with plan B's buildBurn from the
// addresses the wallet named, and stores it as a prepared operation of kind `burn` with a sign
// code; the sign route co-signs it last and submits it, but only while the user token is still
// where the burn spends it; nothing of the item changes before the burn is credited (Task 3). On
// plan C's chain double with the real tx.js: the item is minted through the API first, so its
// store at the items script is the real one and the validator runs on every build.

const crypto = require('crypto');
const fs = require('fs');
const request = require('supertest');
const { Address, Assets, KeyHash, Transaction } = require('@evolution-sdk/evolution');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const tx = require('../src/chain/tx');
const ops = require('../src/chain/ops');
const players = require('../src/players');
const { ChainTxError } = tx;
const { operationsStep } = require('../src/chain/operationsStep');
const { ProviderError } = require('../src/chain/provider');
const { SIGN_CODE } = require('../src/chain/signCodes');
const { hashOf } = require('../src/linkCodes');
const { outRef } = require('../src/chain/names');
const { createRecipeBook, SAMPLE } = require('../src/lab/recipes');
const { createTestPool, siblingPool, closeTestPools, postgresOnly } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');
const { testKeys, confirmWith, removeKey, signedChallenge } = require('./helpers/cardano');
const { walletWitness } = require('./helpers/chain');
const { describeTx } = require('./helpers/describeTx');
const { jsonTx } = require('./chainDouble');
const { markMinted } = require('./helpers/mintedItems');
const { createChainApp, INDEX_MAX_LAG_MS, K_FINAL } = require('./helpers/chainApp');
const { mintedItem, referenceUnitOf, burnRequest, signBurn } = require('./helpers/burns');
const { T0, userName } = require('./helpers/minting');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

// the sample recipes without NUT_BRICKS (an item whose recipe is gone); TURBO_CONVEYOR is
// { MILK: 5, VANILLA: 2, GOLDLEAF: 1 }
const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).recipes;
const recipes = () => createRecipeBook(sample.filter(recipe => recipe.item !== 'NUT_BRICKS'));

const errorOf = response => [response.status, response.body.error];
const signersOf = cborHex => (Transaction.fromCBORHex(cborHex).witnessSet.vkeyWitnesses ?? []).map(entry => KeyHash.toHex(KeyHash.fromVKey(entry.vkey))).sort();
const lovelaceOf = utxo => Number(Assets.lovelaceOf(utxo.assets));
const rowsOf = async (pool, playerId) => (await pool.query('SELECT * FROM chain_ops WHERE player_id = $1 ORDER BY created_at', [playerId])).rows;
const itemRow = async (pool, itemId) =>
    (await pool.query('SELECT player_id, asset_name, minted_at, burned_at, holder_subject, holder_pay FROM items WHERE id = $1', [itemId])).rows[0];
const refOf = utxo => {
    const [txHash, index] = outRef(utxo).split('#');
    return { txHash, index: Number(index) };
};
/** A transaction of the double's own (no value check) that spends `inputs` (SDK UTxOs) and makes `outputs`, in a block. */
const spendOnDouble = async (env, inputs, outputs) => {
    await env.double.submit(jsonTx({ txHash: crypto.randomBytes(32).toString('hex'), ttlSlot: null, inputs: inputs.map(refOf), outputs }));
    env.block();
};
const markOf = async (pool, playerId, itemId) => (await players.itemsOf(pool, playerId)).find(entry => entry.id === itemId)?.minted ?? null;

/**
 * Anna (10 matches, a wallet of 20 ADA, more wallets by `lovelace`) with a TURBO_CONVEYOR minted to
 * her first wallet and final; the operations step runs before the ownership step.
 */
const setup = async (options = {}, { lovelace = [20_000_000] } = {}) => {
    const env = await createChainApp({ steps: [operationsStep], recipes: recipes(), ...options });
    const anna = await env.player('Anna', { lovelace, matches: 10, wallets: ['eternl'] });
    const { itemId, assetName, account } = await mintedItem(env, anna);
    const burn = (body = {}, as = account) => burnRequest(as, anna, itemId, body);
    return { env, anna, account, itemId, assetName, burn };
};

describe('a burn is prepared', () => {
    test('201: the operation of kind burn, the unsigned burn from Anna\'s wallet, a sign code, the costs (no battlechoc fee) and what comes back; the item stays minted', async () => {
        const { env, anna, account, itemId, assetName, burn } = await setup();
        const before = await itemRow(env.pool, itemId);
        const store = await env.chain.provider.utxoByUnit(referenceUnitOf(env.contracts.policyId, assetName));
        const held = await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName);
        const response = await burn().expect(201);
        const { body } = response;
        const [, row] = await rowsOf(env.pool, anna.playerId);

        // the transaction burns both tokens of the item, spends its store and the token's UTxO,
        // and pays the change to Anna's address alone: nothing to the config's fee receivers
        const description = describeTx(body.tx);
        expect(body.tx).toBe(row.tx_cbor);
        expect(description.mint).toEqual({ [referenceUnitOf(env.contracts.policyId, assetName)]: '-1', [env.contracts.policyId + assetName]: '-1' });
        expect(description.inputs.map(input => `${input.txHash}#${input.index}`)).toEqual(expect.arrayContaining([outRef(store), outRef(held)]));
        expect(description.outputs.map(output => output.address)).toEqual(description.outputs.map(() => anna.keys[0].baseAddress));
        expect(description.outputs.map(output => output.address)).not.toContain(env.contracts.treasuryAddress);
        const networkFee = Number(Transaction.fromCBORHex(body.tx).body.fee);
        expect(networkFee).toBeGreaterThan(0);
        // what comes back is the store's ADA; the user token's ADA was in the wallet all along
        const deposits = { reference: lovelaceOf(store), user: lovelaceOf(held) };
        const costs = { networkFee, gameFee: null, deposit: deposits.reference + deposits.user, deposits };

        expect(body).toEqual({
            operation: {
                id: row.id,
                kind: 'burn',
                state: 'prepared',
                error: null,
                itemId,
                item: { item: 'TURBO_CONVEYOR', serial: Number(itemId.split('-').pop()) },
                assetName,
                txHash: description.txHash,
                subject: anna.subjects[0],
                signUntil: new Date(env.now() + rules.SIGN_WINDOW_MS).toISOString(),
                costs,
                slow: false,
                ownerConfirmed: true,
            },
            tx: row.tx_cbor,
            signCode: expect.stringMatching(SIGN_CODE),
            costs,
            // the rare and the legendary ingredient in full, the milk halved
            returns: { MILK: 2, VANILLA: 2, GOLDLEAF: 1 },
        });

        // the row: a burn of Anna's wallet with the keys she signs with, no fee option, the code as its hash
        expect(row).toMatchObject({
            kind: 'burn',
            state: 'prepared',
            item_id: itemId,
            subject: anna.subjects[0],
            owner_address: anna.keys[0].baseAddress,
            owner_key_hash: anna.keys[0].paymentKeyHashHex,
            owner_confirmed: true,
            required_keys: JSON.stringify([anna.keys[0].paymentKeyHashHex]),
            asset_name: assetName,
            tx_hash: description.txHash,
            fee_option: null,
            network_fee: String(networkFee),
            game_fee_asset: null,
            game_fee: null,
            deposit: String(costs.deposit),
            deposit_user: String(deposits.user),
            code_hash: hashOf(body.signCode),
        });
        expect(Number(row.ttl_slot)).toBe(description.ttlSlot);

        // nothing of the item changed: it is minted and usable while the burn is only prepared; its
        // mark carries the operation (ruling E31) so the card can offer Continue and Cancel
        expect(await itemRow(env.pool, itemId)).toEqual(before);
        expect(await markOf(env.pool, anna.playerId, itemId)).toEqual({ assetName, state: 'minted', operationId: body.operation.id, signing: true, kind: 'burn' });
        // readiness answers the open operation with its kind (the mint dialog shows it as another operation)
        expect((await account.get('/chain/readiness').expect(200)).body.operation).toEqual(body.operation);
        expect((await account.get(`/chain/operations/${row.id}`).expect(200)).body).toEqual(body.operation);
        expect(response.text).not.toContain(row.code_hash);
    });

    test('a double tap: one 201, one 409 ITEM BUSY; one burn stored', async () => {
        const { env, anna, burn } = await setup();
        const answers = await Promise.all([burn(), burn()]);
        expect(answers.map(errorOf).sort()).toEqual([
            [201, undefined],
            [409, 'ITEM BUSY'],
        ]);
        expect((await rowsOf(env.pool, anna.playerId)).filter(row => row.kind === 'burn')).toHaveLength(1);
    });

    test('a cancel ends it, the item minted as before, and a new burn of it can be prepared; a lapsed sign window the same', async () => {
        const { env, anna, account, itemId, assetName, burn } = await setup();
        const first = (await burn().expect(201)).body;
        expect((await account.del(`/chain/operations/${first.operation.id}`).expect(200)).body).toEqual({ ...first.operation, state: 'cancelled', error: 'cancelled' });
        expect(await markOf(env.pool, anna.playerId, itemId)).toEqual({ assetName, state: 'minted' });
        const second = (await burn().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS);
        env.block();
        const later = await env.refreshed(anna.account);
        expect((await later.get(`/chain/operations/${second.operation.id}`).expect(200)).body).toMatchObject({ state: 'expired', error: 'not-signed' });
        await burn({}, later).expect(201);
    });

    test('without the wallet\'s addresses: prepared but not vouched for; the sign route wants the addresses first (their proof and the rebuild: chainBurnProof.test.js)', async () => {
        const { env, anna, burn } = await setup();
        const prepared = (await burn({ addresses: undefined }).expect(201)).body;
        expect(prepared.operation.ownerConfirmed).toBe(false);
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        expect(errorOf(await signBurn(env, anna, prepared))).toEqual([409, 'ADDRESSES NEEDED']);
        // the addresses alone are the burn's proof text to sign, nothing more
        const asked = await request(env.app).post(`/chain/sign/${prepared.signCode}/addresses`).send({ addresses: [anna.keys[0].baseAddressHex] }).expect(200);
        expect(Object.keys(asked.body)).toEqual(['payload']);
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'prepared' });
    });
});

describe('signing a burn', () => {
    test('the server signs last: Anna\'s witness and the server\'s, submitted, in the mempool; it lands and ends final; the item row is not touched (the credit is Task 3\'s)', async () => {
        const { env, anna, itemId, assetName, burn } = await setup();
        const prepared = (await burn().expect(201)).body;
        const before = await itemRow(env.pool, itemId);
        const response = await signBurn(env, anna, prepared).expect(200);
        const op = await ops.byId(env.pool, prepared.operation.id);
        expect(response.body).toEqual({ state: 'submitted', operation: { ...prepared.operation, state: 'submitted' } });
        expect(op).toMatchObject({ state: 'submitted', code_hash: null, submit_error: null });
        expect(signersOf(op.signed_cbor)).toEqual([anna.keys[0].paymentKeyHashHex, env.chain.serverKey.keyHash].sort());
        expect(signersOf(op.tx_cbor)).toEqual([]);
        expect(env.double.mempool()).toEqual([op.tx_hash]);
        expect(await itemRow(env.pool, itemId)).toEqual(before);

        // in a block: included, the token gone; the item row as it was (asset name, minted_at, no burned_at)
        const tip = env.block();
        expect((await env.runOnce()).steps.operations).toMatchObject({ included: 1 });
        expect(await ops.byId(env.pool, op.id)).toMatchObject({ state: 'included', included_block: tip.blockNo });
        expect(await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName)).toBeUndefined();
        expect(await env.chain.provider.utxoByUnit(referenceUnitOf(env.contracts.policyId, assetName))).toBeUndefined();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ asset_name: assetName, minted_at: before.minted_at, burned_at: null });
        env.block(10);
        expect((await env.runOnce()).steps.operations).toMatchObject({ final: 1 });
        expect(await ops.byId(env.pool, op.id)).toMatchObject({ state: 'final' });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ asset_name: assetName, burned_at: null });
    });

    test('the burn\'s block rolled back: submitted again, the item row untouched; landed again in the next block: included again', async () => {
        const { env, anna, itemId, burn } = await setup();
        const prepared = (await burn().expect(201)).body;
        await signBurn(env, anna, prepared).expect(200);
        const before = await itemRow(env.pool, itemId);
        const first = env.block();
        expect((await env.runOnce()).steps.operations).toMatchObject({ included: 1 });
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'included', included_block: first.blockNo });
        // the block is gone; its burn waits in the mempool again, the next block has not come yet
        env.double.holdMempool(true);
        env.double.rollback(1);
        env.block();
        expect((await env.runOnce()).steps.operations).toMatchObject({ rolledBack: 1, included: 0 });
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'submitted', included_block: null });
        expect((await itemRow(env.pool, itemId))).toMatchObject({ asset_name: before.asset_name, minted_at: before.minted_at, burned_at: null });
        env.double.holdMempool(false);
        const again = env.block();
        expect((await env.runOnce()).steps.operations).toMatchObject({ included: 1 });
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'included', included_block: again.blockNo });
        expect((await itemRow(env.pool, itemId))).toMatchObject({ asset_name: before.asset_name, burned_at: null });
    });

    test('a cancelled or expired burn is never co-signed: 404 UNKNOWN SIGN CODE, nothing submitted, the item still minted', async () => {
        const { env, anna, account, itemId, assetName, burn } = await setup();
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        const cancelled = (await burn().expect(201)).body;
        await account.del(`/chain/operations/${cancelled.operation.id}`).expect(200);
        expect((await signBurn(env, anna, cancelled).expect(404)).body).toEqual({ error: 'UNKNOWN SIGN CODE' });

        const lapsed = (await burn().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS);
        expect((await signBurn(env, anna, lapsed).expect(404)).body).toEqual({ error: 'UNKNOWN SIGN CODE' });
        expect(await ops.byId(env.pool, lapsed.operation.id)).toMatchObject({ state: 'expired', error: 'not-signed' });

        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect(await markOf(env.pool, anna.playerId, itemId)).toEqual({ assetName, state: 'minted' });
    });

    test('a witness of another key, or over another transaction: 400 INVALID WITNESS, nothing signed, still prepared', async () => {
        const { env, anna, burn } = await setup();
        const ben = await env.player('Ben');
        const prepared = (await burn().expect(201)).body;
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        const send = witness => request(env.app).post(`/chain/sign/${prepared.signCode}`).send({ witness });
        expect(errorOf(await send(walletWitness(prepared.tx, [ben.keys[0].paymentKey])))).toEqual([400, 'INVALID WITNESS']);
        // Anna's own key over another body: a burn of hers cancelled before (another ttl, another body)
        await (await env.refreshed(anna.account)).del(`/chain/operations/${prepared.operation.id}`).expect(200);
        env.block();
        const other = (await burn({}, await env.refreshed(anna.account)).expect(201)).body;
        expect(other.operation.txHash).not.toBe(prepared.operation.txHash);
        const sendOther = witness => request(env.app).post(`/chain/sign/${other.signCode}`).send({ witness });
        expect(errorOf(await sendOther(walletWitness(prepared.tx, [anna.keys[0].paymentKey])))).toEqual([400, 'INVALID WITNESS']);
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect(await ops.byId(env.pool, other.operation.id)).toMatchObject({ state: 'prepared' });
    });

    test('the token left the wallet after the prepare: 409 ITEM LEFT WALLET, nothing co-signed or submitted, the operation cancelled; the item row as it was', async () => {
        const { env, anna, itemId, assetName, burn } = await setup();
        const ben = await env.player('Ben');
        const prepared = (await burn().expect(201)).body;
        const before = await itemRow(env.pool, itemId);
        env.double.moveToken({ assetName, to: env.double.addressOf(ben.keys[0]) });
        env.block();
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        const submit = jest.spyOn(env.chain.provider, 'submit');
        expect((await signBurn(env, anna, prepared).expect(409)).body).toEqual({ error: 'ITEM LEFT WALLET' });
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(submit).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        // cancelled with an error of its own: a tab that follows the operation does not read it as the player's cancel
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'cancelled', error: 'token-moved', signed_cbor: null });
        expect(await itemRow(env.pool, itemId)).toEqual(before);
        // its code is dead now
        expect(errorOf(await signBurn(env, anna, prepared))).toEqual([404, 'UNKNOWN SIGN CODE']);
    });

    test('the token moved within the wallet after the prepare (a wallet transaction gave it back as change): 409 ITEM MOVED, cancelled (token-moved), nothing signed; a new burn works', async () => {
        const { env, anna, assetName, burn } = await setup();
        const prepared = (await burn().expect(201)).body;
        const held = await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName);
        await spendOnDouble(env, [held], [{ address: anna.keys[0].baseAddress, lovelace: String(lovelaceOf(held)), assets: { [env.contracts.policyId + assetName]: '1' } }]);
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        expect((await signBurn(env, anna, prepared).expect(409)).body).toEqual({ error: 'ITEM MOVED' });
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'cancelled', error: 'token-moved', signed_cbor: null });
        addServerWitness.mockRestore();
        const again = (await burn({}, await env.refreshed(anna.account)).expect(201)).body;
        await signBurn(env, anna, again).expect(200);
    });

    test('the token moved to an address the SDK cannot write as bech32: ITEM LEFT WALLET, not a 500; cancelled (token-moved)', async () => {
        const { env, anna, assetName, burn } = await setup();
        const prepared = (await burn().expect(201)).body;
        // an address that carries Anna's stake key: read as it is, it would be ITEM MOVED; only the
        // caught throw of the conversion makes it ITEM LEFT WALLET
        env.double.moveToken({ assetName, to: env.double.addressOf({ paymentKeyHashHex: testKeys().paymentKeyHashHex, stakeKeyHashHex: anna.keys[0].stakeKeyHashHex }) });
        env.block();
        const byUnit = env.chain.provider.utxoByUnit;
        jest.spyOn(env.chain.provider, 'utxoByUnit').mockImplementation(async unit => {
            const answer = await byUnit(unit);
            if (unit === env.contracts.policyId + assetName) {
                // the next bech32 the route writes is the holder's address
                jest.spyOn(Address, 'toBech32').mockImplementationOnce(() => {
                    throw new Error('an address the SDK cannot write');
                });
            }
            return answer;
        });
        expect((await signBurn(env, anna, prepared).expect(409)).body).toEqual({ error: 'ITEM LEFT WALLET' });
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'cancelled', error: 'token-moved' });
        expect(env.double.mempool()).toEqual([]);
    });

    test('the provider cannot say where the token is at the signature: 503 CHAIN UNAVAILABLE, nothing signed, still prepared', async () => {
        const { env, anna, assetName, burn } = await setup();
        const prepared = (await burn().expect(201)).body;
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        // only the question for the user token fails (the config is read by its NFT as well)
        const byUnit = env.chain.provider.utxoByUnit;
        const lookup = jest.spyOn(env.chain.provider, 'utxoByUnit').mockImplementation(async unit => {
            if (unit === env.contracts.policyId + assetName) {
                throw new ProviderError('unavailable', 'down', 503);
            }
            return byUnit(unit);
        });
        expect(errorOf(await signBurn(env, anna, prepared))).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'prepared' });
        expect(lookup).toHaveBeenCalledWith(env.contracts.policyId + assetName);
        lookup.mockRestore();
        await signBurn(env, anna, prepared).expect(200);
    });
});

describe('what a burn is refused for', () => {
    test('only a minted item of the player: another player\'s (plain or minted) NOT YOUR ITEM, a plain one NOT MINTED, a burned one NOT YOUR ITEM', async () => {
        const { env, anna, account, burn } = await setup();
        const ben = await env.player('Ben');
        const bensPlain = await env.giveItem(ben.playerId, 'DARK_WALLS');
        const bensMinted = await env.giveItem(ben.playerId, 'DARK_WALLS');
        await markMinted(env.pool, bensMinted, userName(9001), new Date(T0));
        await env.pool.query('UPDATE items SET holder_subject = $2, holder_pay = $3 WHERE id = $1', [bensMinted, ben.subjects[0], `pay:${ben.keys[0].paymentKeyHashHex}`]);
        const plain = await env.giveItem(anna.playerId, 'DARK_WALLS');
        const burned = await env.giveItem(anna.playerId, 'DARK_WALLS');
        await markMinted(env.pool, burned, userName(9002), new Date(T0));
        await env.pool.query('UPDATE items SET burned_at = $2 WHERE id = $1', [burned, new Date(T0)]);
        const build = jest.spyOn(tx, 'buildBurn');
        expect(errorOf(await burnRequest(account, anna, bensPlain))).toEqual([400, 'NOT YOUR ITEM']);
        expect(errorOf(await burnRequest(account, anna, bensMinted))).toEqual([400, 'NOT YOUR ITEM']);
        expect(errorOf(await burnRequest(account, anna, 'no-such-item'))).toEqual([400, 'NOT YOUR ITEM']);
        expect(errorOf(await burnRequest(account, anna, plain))).toEqual([409, 'NOT MINTED']);
        expect(errorOf(await burnRequest(account, anna, burned))).toEqual([400, 'NOT YOUR ITEM']);
        expect(build).not.toHaveBeenCalled();
        await burn().expect(201);
    });

    test('an open operation: of this item ITEM BUSY whatever its kind and state (a mint prepared or submitted, not minted yet; a mint on its way to final; a burn prepared), of another item OPERATION RUNNING', async () => {
        const { env, anna, account, burn } = await setup();
        // a mint of a plain item prepared, then submitted: the item has no asset name yet, ITEM BUSY all the same
        const plain = await env.giveItem(anna.playerId, 'DARK_WALLS');
        const pending = (await account.post('/chain/mint', { itemId: plain, subject: anna.subjects[0], fee: 0, addresses: [anna.keys[0].baseAddressHex] }).expect(201)).body;
        expect(errorOf(await burnRequest(account, anna, plain))).toEqual([409, 'ITEM BUSY']);
        env.double.holdMempool(true);
        await request(env.app).post(`/chain/sign/${pending.signCode}`).send({ witness: walletWitness(pending.tx, [anna.keys[0].paymentKey]) }).expect(200);
        expect(errorOf(await burnRequest(account, anna, plain))).toEqual([409, 'ITEM BUSY']);
        // that mint never lands (dropped): expired at last, the item plain again
        env.double.dropMempool();
        env.double.holdMempool(false);
        await env.pool.query("UPDATE chain_ops SET state = 'expired', error = 'expired', ended_at = $2 WHERE id = $1", [pending.operation.id, new Date(env.now())]);
        expect(errorOf(await burnRequest(account, anna, plain))).toEqual([409, 'NOT MINTED']);
        // a second item minted, its mint in a block but not final: the item is minted, its mint still open
        const second = await env.giveItem(anna.playerId, 'DARK_WALLS');
        const minted = (await account.post('/chain/mint', { itemId: second, subject: anna.subjects[0], fee: 0, addresses: [anna.keys[0].baseAddressHex] }).expect(201)).body;
        await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [anna.keys[0].paymentKey]) }).expect(200);
        env.block();
        await env.runOnce();
        expect(await ops.byId(env.pool, minted.operation.id)).toMatchObject({ state: 'included' });
        expect(errorOf(await burnRequest(account, anna, second))).toEqual([409, 'ITEM BUSY']);
        // the mint of another item is open: the first item's burn waits for it
        expect(errorOf(await burn())).toEqual([409, 'OPERATION RUNNING']);
        env.block(10);
        await env.runOnce();
        const prepared = (await burn().expect(201)).body;
        expect(errorOf(await burn())).toEqual([409, 'ITEM BUSY']);
        expect(errorOf(await burnRequest(account, anna, second))).toEqual([409, 'OPERATION RUNNING']);
        // and a mint of a third item while the burn is prepared
        const third = await env.giveItem(anna.playerId, 'NUT_BRICKS');
        expect(errorOf(await account.post('/chain/mint', { itemId: third, subject: anna.subjects[0], fee: 0 }))).toEqual([409, 'OPERATION RUNNING']);
        expect((await rowsOf(env.pool, anna.playerId)).filter(row => ops.OPEN.includes(row.state)).map(row => row.id)).toEqual([prepared.operation.id]);
    });

    test('the token left the wallet before the prepare (the sync has not seen it yet): 409 ITEM LEFT WALLET, nothing stored', async () => {
        const { env, anna, assetName, burn } = await setup();
        const ben = await env.player('Ben');
        env.double.moveToken({ assetName, to: env.double.addressOf(ben.keys[0]) });
        env.block();
        expect(errorOf(await burn())).toEqual([409, 'ITEM LEFT WALLET']);
        expect((await rowsOf(env.pool, anna.playerId)).filter(row => row.kind === 'burn')).toEqual([]);
        expect(env.chainLog.error).not.toHaveBeenCalled();
    });

    test('the token at an address of the subject\'s key the build cannot use: 409 ITEM MOVED at the prepare, as at the rebuild (one utxoByUnit, on the failure path only); nothing stored', async () => {
        const { env, anna, assetName, burn } = await setup();
        // an address of Anna's stake key she did not name (the game sends her base address only)
        const own = env.double.addressOf({ paymentKeyHashHex: testKeys().paymentKeyHashHex, stakeKeyHashHex: anna.keys[0].stakeKeyHashHex });
        env.double.moveToken({ assetName, to: own });
        env.block();
        const userUnit = env.contracts.policyId + assetName;
        const real = env.chain.provider.utxoByUnit.bind(env.chain.provider);
        const byUnit = jest.spyOn(env.chain.provider, 'utxoByUnit');
        // the item's units asked about (the config's token is read and cached as for every request)
        const itemUnitsAsked = () => byUnit.mock.calls.map(([unit]) => unit).filter(unit => unit.endsWith(assetName.slice(rules.USER_LABEL.length)));
        expect(errorOf(await burn())).toEqual([409, 'ITEM MOVED']);
        expect(itemUnitsAsked()).toEqual([userUnit]);
        // the provider cannot say where the token is: CHAIN UNAVAILABLE, never a guess
        byUnit.mockClear();
        byUnit.mockImplementation(async unit => {
            if (unit === userUnit) {
                throw new ProviderError('unavailable', 'down', 503);
            }
            return real(unit);
        });
        expect(errorOf(await burn())).toEqual([503, 'CHAIN UNAVAILABLE']);
        byUnit.mockRestore();
        // a build that succeeds asks no such question: the store's reference token only
        env.double.moveToken({ assetName, to: anna.keys[0].baseAddress });
        env.block();
        const asked = jest.spyOn(env.chain.provider, 'utxoByUnit');
        await burn().expect(201);
        expect(asked.mock.calls.map(([unit]) => unit).filter(unit => unit.endsWith(assetName.slice(rules.USER_LABEL.length)))).toEqual([referenceUnitOf(env.contracts.policyId, assetName)]);
    });

    test('a pay: subject whose token sits at a base address of its payment key: 409 ITEM MOVED at the prepare, nothing built from that address (ruling E21)', async () => {
        const env = await createChainApp({ steps: [operationsStep], recipes: recipes() });
        const account = await createAccount(env.app, { username: 'Pia' });
        const keys = testKeys();
        const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, address: keys.enterpriseAddress, with: 'enterprise' });
        const subject = (await request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`).send(verify).expect(200)).body.identity.subject;
        expect(subject).toBe(`pay:${keys.paymentKeyHashHex}`);
        env.double.fund(env.double.addressOf(keys, 'enterprise'), '20000000');
        env.block();
        await env.matches(account.playerId, 10);
        const itemId = await env.giveItem(account.playerId, 'TURBO_CONVEYOR');
        const minted = (await account.post('/chain/mint', { itemId, subject, fee: 0, addresses: [keys.enterpriseAddressHex] }).expect(201)).body;
        await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [keys.paymentKey]) }).expect(200);
        env.block(K_FINAL + 1);
        await env.runOnce();
        const assetName = minted.operation.assetName;
        // the token moves to a base address of the same payment key and a stranger's stake key
        env.double.moveToken({ assetName, to: env.double.addressOf({ paymentKeyHashHex: keys.paymentKeyHashHex, stakeKeyHashHex: testKeys().stakeKeyHashHex }) });
        env.block();
        const build = jest.spyOn(tx, 'buildBurn');
        const fresh = await env.refreshed(account);
        // the phone (no addresses) and the extension (its enterprise address): both ITEM MOVED, nothing built
        expect(errorOf(await fresh.post('/chain/burn', { itemId, subject }))).toEqual([409, 'ITEM MOVED']);
        expect(errorOf(await fresh.post('/chain/burn', { itemId, subject, addresses: [keys.enterpriseAddressHex] }))).toEqual([409, 'ITEM MOVED']);
        expect(build).not.toHaveBeenCalled();
        expect((await rowsOf(env.pool, account.playerId)).filter(row => row.kind === 'burn')).toEqual([]);
    });

    test('the wallet: the request names another wallet than the holder NOT YOUR WALLET (with the holder), addresses of another wallet NOT YOUR WALLET, the holder unlinked since NOT YOUR WALLET', async () => {
        const { env, anna, account, burn } = await setup({}, { lovelace: [20_000_000, 5_000_000] });
        const ben = await env.player('Ben');
        const build = jest.spyOn(tx, 'buildBurn');
        expect((await burn({ subject: anna.subjects[1], addresses: [anna.keys[1].baseAddressHex] }).expect(400)).body).toEqual({ error: 'NOT YOUR WALLET', holder: anna.subjects[0] });
        expect((await burn({ addresses: [ben.keys[0].baseAddressHex] }).expect(400)).body).toEqual({ error: 'NOT YOUR WALLET' });
        expect((await burn({ subject: ben.subjects[0] }).expect(400)).body).toEqual({ error: 'NOT YOUR WALLET', holder: anna.subjects[0] });
        // the holder's key removed from Anna's account (the sync has not run since)
        const { confirmToken } = (await confirmWith(env.app, account, anna.keys[1])).body;
        await removeKey(env.app, account, anna.subjects[0], confirmToken).expect(204);
        expect((await burn().expect(400)).body).toEqual({ error: 'NOT YOUR WALLET' });
        expect(build).not.toHaveBeenCalled();
    });

    test('the holder\'s wallet in its hop wait (it was Ben\'s since; the sync has not run): 409 WALLET WAITING, nothing built', async () => {
        const { env, anna, account, burn } = await setup({}, { lovelace: [20_000_000, 5_000_000] });
        const ben = await env.player('Ben', { lovelace: [5_000_000] });
        // Anna removes the holder's key, Ben links it and removes it again, Anna links it again: her wait runs
        const unlink = async (owner, keys, subject) => {
            const { confirmToken } = (await confirmWith(env.app, owner, keys)).body;
            await removeKey(env.app, owner, subject, confirmToken).expect(204);
        };
        // a second between the steps: the hop wait compares the links' times
        await unlink(account, anna.keys[1], anna.subjects[0]);
        env.advance(1000);
        await env.link(ben.account, anna.keys[0], { confirmBy: ben.keys[0] });
        env.advance(1000);
        await unlink(ben.account, ben.keys[0], anna.subjects[0]);
        env.advance(1000);
        await env.link(account, anna.keys[0], { confirmBy: anna.keys[1] });
        const build = jest.spyOn(tx, 'buildBurn');
        expect(errorOf(await burn())).toEqual([409, 'WALLET WAITING']);
        expect(build).not.toHaveBeenCalled();
    });

    test('no recipe: 400 NO RECIPE', async () => {
        const { env, anna, account } = await setup();
        const nuts = await env.giveItem(anna.playerId, 'NUT_BRICKS');
        await markMinted(env.pool, nuts, userName(9003), new Date(T0));
        await env.pool.query('UPDATE items SET holder_subject = $2 WHERE id = $1', [nuts, anna.subjects[0]]);
        expect(errorOf(await burnRequest(account, anna, nuts))).toEqual([400, 'NO RECIPE']);
    });

    test('NOT ENOUGH ADA from a real build: the token next to many other tokens on little ADA, a wallet of 2 ADA besides; what is missing and needed; with the top-up it builds', async () => {
        const { env, anna, assetName, burn } = await setup();
        // the wallet's own transaction (the double checks no value): the token sits with 40 other
        // tokens on 1.2 ADA, the rest of the wallet is the 2 ADA of the collateral
        const wallet = await env.chain.provider.utxosOf(anna.subjects[0]);
        const others = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${(0x10 + i).toString(16).repeat(28)}01`, '1']));
        await spendOnDouble(env, wallet, [
            { address: anna.keys[0].baseAddress, lovelace: '1200000', assets: { [env.contracts.policyId + assetName]: '1', ...others } },
            { address: anna.keys[0].baseAddress, lovelace: '2000000' },
        ]);
        const short = (await burn().expect(400)).body;
        expect(short.error).toBe('NOT ENOUGH ADA');
        const missing = Number(short.missing);
        expect(missing).toBeGreaterThan(0);
        // a burn needs nothing of its own (fundsCheck kind 'burn'): needed is what the wallet holds and lacks
        expect(short.needed).toBe(String(3_200_000 + missing));
        env.fund(anna.keys[0], missing);
        await burn({}, await env.refreshed(anna.account)).expect(201);
    });

    test('the build\'s refusals: NO COLLATERAL, WALLET TOO FULL; a store the provider does not have is CHAIN UNAVAILABLE, logged', async () => {
        const { env, anna, burn } = await setup();
        jest.spyOn(tx, 'buildBurn').mockRejectedValueOnce(new ChainTxError('NO_COLLATERAL'));
        expect(errorOf(await burn())).toEqual([400, 'NO COLLATERAL']);
        jest.spyOn(tx, 'buildBurn').mockRejectedValueOnce(new ChainTxError('TOO_MANY_TOKENS'));
        expect(errorOf(await burn())).toEqual([400, 'WALLET TOO FULL']);
        expect(env.chainLog.error).not.toHaveBeenCalled();

        const byUnit = env.chain.provider.utxoByUnit;
        jest.spyOn(env.chain.provider, 'utxoByUnit').mockImplementation(async unit => (unit.slice(56).startsWith(rules.REFERENCE_LABEL) ? undefined : byUnit(unit)));
        expect(errorOf(await burn())).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(env.chainLog.error).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(env.chainLog.error.mock.calls)).toMatch(/REFERENCE_NOT_FOUND/);
        expect((await rowsOf(env.pool, anna.playerId)).filter(row => row.kind === 'burn')).toEqual([]);
    });

    test('CHAIN UNAVAILABLE: a stale index, the provider down; a paused config does not stop a burn', async () => {
        const { env, burn } = await setup();
        env.advance(INDEX_MAX_LAG_MS + 1);
        expect(errorOf(await burn())).toEqual([503, 'CHAIN UNAVAILABLE']);
        env.block();
        env.double.fail({ provider: 'unavailable' });
        expect(errorOf(await burn())).toEqual([503, 'CHAIN UNAVAILABLE']);
        env.double.fail({});
        await env.setConfig({ paused: true });
        await burn().expect(201);
    });

    test('wrong body types: INVALID REQUEST PARAMETERS before anything is read', async () => {
        const { env, anna, itemId, account } = await setup();
        env.double.fail({ index: 'unavailable', provider: 'unavailable' });
        const good = { itemId, subject: anna.subjects[0], addresses: [anna.keys[0].baseAddressHex] };
        for (const body of [{}, { ...good, itemId: 5 }, { ...good, itemId: '' }, { ...good, subject: null }, { ...good, addresses: [] }, { ...good, addresses: 'ab' }, { ...good, addresses: ['zz'] }]) {
            expect((await account.post('/chain/burn', body).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        }
    });

    test('rate-limited per player by a bucket of its own', async () => {
        const { env, account } = await setup({ chainBurnsPerMinute: 2 });
        await account.post('/chain/burn', {}).expect(400);
        await account.post('/chain/burn', {}).expect(400);
        expect((await account.post('/chain/burn', {}).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
        const ben = await env.player('Ben');
        await ben.account.post('/chain/burn', {}).expect(400);
        env.advance(60_001);
        env.block();
        await (await env.refreshed(account)).post('/chain/burn', {}).expect(400);
    });

    test('CHAIN OFF without the chain features', async () => {
        const { app } = await createTestApp();
        const account = await createAccount(app);
        expect((await account.post('/chain/burn', {}).expect(404)).body).toEqual({ error: 'CHAIN OFF' });
    });
});

describe('plain salvage', () => {
    test('refuses a minted item, also while its burn is prepared: 409 ITEM MINTED, the row stays', async () => {
        const { env, account, itemId, burn } = await setup();
        expect(errorOf(await account.post('/lab/salvage', { itemId }))).toEqual([409, 'ITEM MINTED']);
        await burn().expect(201);
        expect(errorOf(await account.post('/lab/salvage', { itemId }))).toEqual([409, 'ITEM MINTED']);
        expect(await itemRow(env.pool, itemId)).toBeDefined();
    });
});

describe('on Postgres', () => {
    /** What the burn route stores for a prepared burn of `itemId` by `playerId`. */
    let serial = 0;
    const burnFields = ({ playerId, itemId }) => {
        serial += 1;
        return {
            playerId,
            itemId,
            kind: 'burn',
            subject: `stake:${'aa'.repeat(28)}`,
            ownerKeyHash: 'bb'.repeat(28),
            ownerAddress: 'addr_test1',
            requiredKeys: ['bb'.repeat(28)],
            assetName: userName(9100 + serial),
            txHash: `${serial}`.padStart(64, 'e'),
            txCbor: '84a400',
            ttlSlot: 1200,
            signUntil: T0 + rules.SIGN_WINDOW_MS,
            code: `burn-code-${serial}`,
            feeOption: null,
            networkFee: '210000',
            gameFeeAsset: null,
            gameFee: null,
            deposit: '3700000',
            depositUser: '1200000',
            ownerConfirmed: true,
            now: T0,
        };
    };

    postgresOnly('two processes that prepare a burn of one item of one player at once: one operation; the other refused by whichever check or partial index Postgres meets first (the item\'s or the player\'s; the route answers ITEM BUSY or OPERATION RUNNING)', async () => {
        const pool = await createTestPool();
        const playerId = await players.createPlayer(pool);
        const itemId = `burn-item-${Date.now()}`;
        await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $2, $5)', [itemId, playerId, 'DARK_WALLS', 77, new Date(T0)]);
        const results = await Promise.allSettled([pool, siblingPool(pool)].map(each => ops.insertPrepared(each, burnFields({ playerId, itemId }))));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const [refused] = results.filter(result => result.status === 'rejected');
        expect(refused.reason).toMatchObject({ name: 'OpenOperationError' });
        expect(['item', 'player']).toContain(refused.reason.reason);
        const { rows } = await pool.query('SELECT kind, fee_option FROM chain_ops');
        expect(rows).toEqual([{ kind: 'burn', fee_option: null }]);
    });
});
