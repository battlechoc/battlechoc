// Preparing a mint (minting plan D, Task 3): POST /chain/mint checks everything, builds the
// unsigned transaction with plan B's buildMint from the player's wallet on plan C's chain double,
// locks the item with a prepared operation and hands out a sign code; GET and DELETE
// /chain/operations/:id; plain salvage refuses an item a mint holds. Expected amounts come from
// plan B's functions, the constants and the transaction itself, never from a brief.

const crypto = require('crypto');
const { PrivateKey } = require('@evolution-sdk/evolution');
const { Items, chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const tx = require('../src/chain/tx');
const ops = require('../src/chain/ops');
const { ProviderError } = require('../src/chain/provider');
const { ChainTxError, fundsCheck, gameFeeOf } = tx;
const { SIGN_CODE, newSignCode } = require('../src/chain/signCodes');
const { hashOf } = require('../src/linkCodes');
const { closeTestPools } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');
const { confirmWith, removeKey } = require('./helpers/cardano');
const { fixtureContracts, walletWitness, TEAM_ADDRESS } = require('./helpers/chain');
const { describeTx } = require('./helpers/describeTx');
const { markMinted } = require('./helpers/mintedItems');
const { createChainApp, loadedFixtureKey, T0, INDEX_MAX_LAG_MS } = require('./helpers/chainApp');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const HOUR = 60 * 60 * 1000;
const { config } = fixtureContracts();
const [COMMON, RARE] = [0, 1];
const tierOf = key => rules.TIER_ORDER.indexOf(Items[key].tier);

/** Ann with 10 verified matches, one wallet of 20 ADA and a DARK_WALLS (RARE). */
const setup = async (options = {}, { lovelace = [20_000_000], matches = 10, item = 'DARK_WALLS' } = {}) => {
    const env = await createChainApp(options);
    const ann = await env.player('Ann', { lovelace, matches, wallets: ['eternl'] });
    const itemId = await env.giveItem(ann.playerId, item);
    const mint = (body = {}, account = ann.account) => account.post('/chain/mint', { itemId, subject: ann.subjects[0], fee: 0, ...body });
    return { env, ann, itemId, mint };
};

const rowsOf = async (pool, playerId) => (await pool.query('SELECT * FROM chain_ops WHERE player_id = $1', [playerId])).rows;
const itemOf = async (account, itemId) => (await account.get('/user').expect(200)).body.stats.items.find(item => item.id === itemId);
const errorOf = response => [response.status, response.body.error];

let pastSerial = 0;
/** A mint of a fresh item submitted at `at` and final, stored as the routes store one (the daily limit counts it). */
const pastMint = async (env, { playerId, subject, at }) => {
    pastSerial += 1;
    const itemId = await env.giveItem(playerId, 'LIGHT_BARREL');
    const op = await ops.insertPrepared(env.pool, {
        playerId,
        itemId,
        kind: 'mint',
        subject,
        ownerKeyHash: 'bb'.repeat(28),
        ownerAddress: TEAM_ADDRESS,
        requiredKeys: ['bb'.repeat(28)],
        assetName: rules.USER_LABEL + pastSerial.toString(16).padStart(56, 'f'),
        txHash: crypto.randomBytes(32).toString('hex'),
        txCbor: '84a400',
        ttlSlot: 1,
        signUntil: at + rules.SIGN_WINDOW_MS,
        code: newSignCode().code,
        feeOption: 0,
        networkFee: '490000',
        gameFeeAsset: 'lovelace',
        gameFee: '1000000',
        deposit: '3720000',
        depositUser: '1220000',
        now: at,
    });
    const submitted = await ops.markSubmitted(env.pool, op, { signedCbor: '84a400', now: at + 1000 });
    const included = await ops.markIncluded(env.pool, submitted, { blockNo: 2000, now: at + 60_000 });
    return ops.markFinal(env.pool, included, at + 5 * 60_000);
};

/** A prepared mint of `itemId` stored as the route stores one, open for the sign window from now. */
const prepared = (env, { playerId, itemId, subject }) =>
    ops.insertPrepared(env.pool, {
        playerId,
        itemId,
        kind: 'mint',
        subject,
        ownerKeyHash: 'bb'.repeat(28),
        ownerAddress: TEAM_ADDRESS,
        requiredKeys: ['bb'.repeat(28)],
        assetName: rules.USER_LABEL + 'cd'.repeat(28),
        txHash: crypto.randomBytes(32).toString('hex'),
        txCbor: '84a400',
        ttlSlot: 1,
        signUntil: env.now() + rules.SIGN_WINDOW_MS,
        code: newSignCode().code,
        feeOption: 0,
        networkFee: '490000',
        gameFeeAsset: 'lovelace',
        gameFee: '2000000',
        deposit: '3720000',
        depositUser: '1220000',
        now: env.now(),
    });

describe('a mint is prepared', () => {
    test('201: the operation, the unsigned transaction, a sign code and the costs; the table keeps the code\'s hash only; the item is minting and stays equipped', async () => {
        const { env, ann, itemId, mint } = await setup();
        await ann.account.post('/user/equipment', { entityType: Items.DARK_WALLS.entityType, slot: 0, itemId }).expect(200);
        const tip = env.double.tip();
        const response = await mint().expect(201);
        const [row] = await rowsOf(env.pool, ann.playerId);
        const { body } = response;

        // the transaction is what was stored, and it mints this item for Ann's wallet
        const description = describeTx(body.tx);
        expect(body.tx).toBe(row.tx_cbor);
        const userUnit = Object.keys(description.mint).find(unit => unit.startsWith(env.contracts.policyId + rules.USER_LABEL));
        const assetName = userUnit.slice(env.contracts.policyId.length);
        const [store, user, fee, change] = description.outputs;
        expect(store).toMatchObject({ address: env.contracts.itemsAddress, assets: { [env.contracts.policyId + rules.REFERENCE_LABEL + assetName.slice(rules.USER_LABEL.length)]: '1' } });
        expect(user).toMatchObject({ address: ann.keys[0].baseAddress, assets: { [userUnit]: '1' } });
        const rareFee = gameFeeOf(config, { tier: tierOf('DARK_WALLS'), fee: 0 });
        expect(fee).toEqual({ address: env.contracts.treasuryAddress, lovelace: String(rareFee.amount), assets: {} });
        expect(change).toMatchObject({ address: ann.keys[0].baseAddress });
        expect(description.ttlSlot).toBe(tip.slot + rules.TX_VALIDITY_MS / 1000);
        const networkFee = 20_000_000 - description.outputs.reduce((sum, output) => sum + Number(output.lovelace), 0);
        // the deposit and its two parts as the transaction holds them (ruling D38): the store's
        // stays at the items script, the user token's ADA goes with the token to Ann's address
        const deposits = { reference: Number(store.lovelace), user: Number(user.lovelace) };
        const costs = { networkFee, gameFee: { asset: 'lovelace', label: 'ADA', amount: rareFee.amount }, deposit: deposits.reference + deposits.user, deposits };

        expect(body).toEqual({
            operation: {
                id: row.id,
                kind: 'mint',
                state: 'prepared',
                error: null,
                itemId,
                item: { item: 'DARK_WALLS', serial: Number(itemId.split('-').pop()) },
                assetName,
                txHash: description.txHash,
                subject: ann.subjects[0],
                signUntil: new Date(env.now() + rules.SIGN_WINDOW_MS).toISOString(),
                costs,
                slow: false,
                ownerConfirmed: false,
            },
            tx: row.tx_cbor,
            signCode: expect.stringMatching(SIGN_CODE),
            costs,
        });
        expect(body.costs.gameFee.amount).toBe(2_000_000);

        // the row: what plan B built, the owner, the keys the wallet signs with; the code as its hash
        expect(row).toMatchObject({
            state: 'prepared',
            kind: 'mint',
            item_id: itemId,
            subject: ann.subjects[0],
            owner_address: ann.keys[0].baseAddress,
            owner_key_hash: ann.keys[0].paymentKeyHashHex,
            required_keys: JSON.stringify([ann.keys[0].paymentKeyHashHex]),
            asset_name: assetName,
            tx_hash: description.txHash,
            fee_option: 0,
            network_fee: String(networkFee),
            game_fee_asset: 'lovelace',
            game_fee: String(rareFee.amount),
            deposit: String(costs.deposit),
            deposit_user: String(deposits.user),
            code_hash: hashOf(body.signCode),
        });
        // BIGINT: a string on Postgres, a number on pg-mem
        expect(Number(row.ttl_slot)).toBe(description.ttlSlot);
        expect(new Date(row.sign_until).getTime()).toBe(env.now() + rules.SIGN_WINDOW_MS);
        Object.values(row).forEach(value => expect(String(value)).not.toContain(body.signCode));

        // the item: minting, signing, still in its slot
        expect(await itemOf(ann.account, itemId)).toMatchObject({ minted: { state: 'minting', assetName, operationId: row.id, signing: true } });
        expect((await ann.account.get('/user').expect(200)).body.stats.equipment[Items.DARK_WALLS.entityType]).toContain(itemId);

        // what Task 4 needs is in the row: the wallet's witness verifies against it, the server signs last, the double takes it
        const signed = tx.verifyWitness({ cbor: row.tx_cbor, bodyHash: row.tx_hash, witness: walletWitness(row.tx_cbor, [ann.keys[0].paymentKey]), requiredWitnesses: JSON.parse(row.required_keys) });
        const coSigned = tx.addServerWitness({ cbor: signed.cbor, bodyHash: row.tx_hash, key: env.chain.serverKey });
        expect(await env.double.submit(coSigned.cbor)).toBe(row.tx_hash);
        env.block();
        expect(await env.double.index().mintOf(assetName)).toMatchObject({ txHash: row.tx_hash });
    });

    test('an operation whose item a salvage deleted while it was read: 404, not a fault', async () => {
        const { env, ann, mint } = await setup();
        const { operation } = (await mint().expect(201)).body;
        await ann.account.del(`/chain/operations/${operation.id}`).expect(200);
        // a salvage in another request deletes the ended operation and its item between the two reads
        const expireLapsed = ops.expireLapsed;
        jest.spyOn(ops, 'expireLapsed').mockImplementationOnce(async (db, op, now) => {
            const read = await expireLapsed(db, op, now);
            await env.pool.query('DELETE FROM chain_ops WHERE id = $1', [op.id]);
            await env.pool.query('DELETE FROM items WHERE id = $1', [op.item_id]);
            return read;
        });
        expect((await ann.account.get(`/chain/operations/${operation.id}`).expect(404)).body).toEqual({ error: 'NOT FOUND' });
        expect(env.chainLog.error).not.toHaveBeenCalled();
    });

    test('GET /chain/operations/:id answers the view, never a transaction; another player\'s or an unknown one is 404', async () => {
        const { env, ann, mint } = await setup();
        const { body } = await mint().expect(201);
        const got = await ann.account.get(`/chain/operations/${body.operation.id}`).expect(200);
        expect(got.body).toEqual(body.operation);
        expect(got.text).not.toContain(body.tx.slice(0, 64));
        expect(got.text).not.toContain(body.signCode);
        const ben = await env.player('Ben');
        expect((await ben.account.get(`/chain/operations/${body.operation.id}`).expect(404)).body).toEqual({ error: 'NOT FOUND' });
        expect((await ben.account.del(`/chain/operations/${body.operation.id}`).expect(404)).body).toEqual({ error: 'NOT FOUND' });
        await ann.account.get('/chain/operations/no-such-operation').expect(404);
        await ann.account.get(`/chain/operations/${'x'.repeat(200)}`).expect(404);
        expect((await rowsOf(env.pool, ann.playerId))[0].state).toBe('prepared');
    });

    test('a double tap: one 201, one 409; one row. For one item ITEM BUSY (its check comes first), for two items OPERATION RUNNING', async () => {
        const { env, ann, itemId, mint } = await setup();
        const same = await Promise.all([mint(), mint()]);
        expect(same.map(errorOf).sort()).toEqual([
            [201, undefined],
            [409, 'ITEM BUSY'],
        ]);
        expect(await rowsOf(env.pool, ann.playerId)).toHaveLength(1);

        await ann.account.del(`/chain/operations/${same.find(response => response.status === 201).body.operation.id}`).expect(200);
        const other = await env.giveItem(ann.playerId, 'NUT_BRICKS');
        const two = await Promise.all([mint({ itemId }), mint({ itemId: other })]);
        expect(two.map(errorOf).sort()).toEqual([
            [201, undefined],
            [409, 'OPERATION RUNNING'],
        ]);
        expect((await rowsOf(env.pool, ann.playerId)).filter(row => row.state === 'prepared')).toHaveLength(1);
    });

    test('cancel: DELETE → cancelled, the item plain, a new mint of it works; DELETE again → 409 OPERATION NOT OPEN', async () => {
        const { env, ann, itemId, mint } = await setup();
        const first = (await mint().expect(201)).body;
        const cancelled = await ann.account.del(`/chain/operations/${first.operation.id}`).expect(200);
        expect(cancelled.body).toEqual({ ...first.operation, state: 'cancelled', error: 'cancelled' });
        expect((await itemOf(ann.account, itemId)).minted).toBeNull();
        const second = (await mint().expect(201)).body;
        expect(second.operation.id).not.toBe(first.operation.id);
        expect((await ann.account.del(`/chain/operations/${first.operation.id}`).expect(409)).body).toEqual({ error: 'OPERATION NOT OPEN' });
        expect((await rowsOf(env.pool, ann.playerId)).map(row => row.state).sort()).toEqual(['cancelled', 'prepared']);
    });

    test('the sign window: once it is over the operation is expired on read (not signed), the item plain, and the next mint is not held up', async () => {
        const { env, ann, itemId, mint } = await setup();
        const { operation } = (await mint().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS - 1);
        expect((await ann.account.get(`/chain/operations/${operation.id}`).expect(200)).body.state).toBe('prepared');
        env.advance(1);
        env.block();
        const expired = (await ann.account.get(`/chain/operations/${operation.id}`).expect(200)).body;
        expect(expired).toMatchObject({ state: 'expired', error: 'not-signed' });
        expect((await itemOf(ann.account, itemId)).minted).toBeNull();
        // cancelling it now: it is no longer open
        expect((await ann.account.del(`/chain/operations/${operation.id}`).expect(409)).body).toEqual({ error: 'OPERATION NOT OPEN' });

        // a lapsed window that nobody read holds neither the player (another item) nor the item
        const second = (await mint().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS);
        env.block();
        const account = await env.refreshed(ann.account);
        const nutBricks = await env.giveItem(ann.playerId, 'NUT_BRICKS');
        const third = (await mint({ itemId: nutBricks }, account).expect(201)).body;
        expect((await ops.byId(env.pool, second.operation.id)).state).toBe('expired');
        env.advance(rules.SIGN_WINDOW_MS);
        env.block();
        await mint({ itemId: nutBricks }, account).expect(201);
        expect((await ops.byId(env.pool, third.operation.id)).state).toBe('expired');
    });

    test('no fee options: fee 0 mints without a battlechoc fee', async () => {
        const { env, ann, mint } = await setup({ fees: [] });
        const { body } = await mint().expect(201);
        expect(body.costs.gameFee).toBeNull();
        expect(describeTx(body.tx).outputs.map(output => output.address)).not.toContain(env.contracts.treasuryAddress);
        expect((await rowsOf(env.pool, ann.playerId))[0]).toMatchObject({ game_fee_asset: null, game_fee: null, fee_option: 0 });
    });

    test('the fee is the option the player chose, for the item\'s tier', async () => {
        const fees = [
            { asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: TEAM_ADDRESS, share: 1 }] },
            { asset: 'lovelace', amounts: [1_500_000, 3_000_000, 6_000_000], receivers: [{ address: TEAM_ADDRESS, share: 1 }] },
        ];
        const { mint } = await setup({ fees }, { item: 'NUT_BRICKS' });
        expect(tierOf('NUT_BRICKS')).toBe(COMMON);
        const { body } = await mint({ fee: 1 }).expect(201);
        expect(body.costs.gameFee).toEqual({ asset: 'lovelace', label: 'ADA', amount: 1_500_000 });
        expect(describeTx(body.tx).outputs.filter(output => output.address === TEAM_ADDRESS).map(output => output.lovelace)).toEqual(['1500000']);
    });

    test('the fee stored and shown is what the transaction pays: a share below the minimum UTxO is raised as the build raises it', async () => {
        const treasury = fixtureContracts().treasuryAddress;
        const fees = [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: treasury, share: 9 }, { address: TEAM_ADDRESS, share: 1 }] }];
        const { env, ann, mint } = await setup({ fees });
        const { body } = await mint().expect(201);
        const toReceivers = describeTx(body.tx)
            .outputs.filter(output => output.address === treasury || output.address === TEAM_ADDRESS)
            .reduce((sum, output) => sum + Number(output.lovelace), 0);
        // the team's due of a RARE item, 200_000, is below the minimum UTxO: the build pays more than the fee due
        expect(gameFeeOf(fixtureContracts({ fees }).config, { tier: RARE, fee: 0 }).payments[1].amount).toBe(200_000);
        expect(toReceivers).toBeGreaterThan(2_000_000);
        expect(body.costs.gameFee).toEqual({ asset: 'lovelace', label: 'ADA', amount: toReceivers });
        expect(body.operation.costs.gameFee.amount).toBe(toReceivers);
        expect((await rowsOf(env.pool, ann.playerId))[0].game_fee).toBe(String(toReceivers));
    });
});

describe('what a mint is refused for', () => {
    test('every check in its order: each is answered while all after it would fail too', async () => {
        const { env, ann, itemId, mint } = await setup({}, { lovelace: [0], matches: 9 });
        const ben = await env.player('Ben', { lovelace: [10_000_000, 10_000_000] });
        const bensItem = await env.giveItem(ben.playerId, 'DARK_WALLS');
        const minted = await env.giveItem(ann.playerId, 'NUT_BRICKS');
        await markMinted(env.pool, minted, rules.USER_LABEL + 'ab'.repeat(28), new Date(T0));
        const fresh = await env.giveItem(ann.playerId, 'LIGHT_BARREL');
        // Ben's second wallet goes to Ann: under the hop wait
        const { confirmToken } = (await confirmWith(env.app, ben.account, ben.keys[0])).body;
        await removeKey(env.app, ben.account, ben.subjects[1], confirmToken).expect(204);
        await env.link(ann.account, ben.keys[1], { confirmBy: ann.keys[0] });
        // three mints today already, and a prepared one of Ann's DARK_WALLS
        for (const hour of [1, 2, 3]) {
            await pastMint(env, { playerId: ann.playerId, subject: ann.subjects[0], at: T0 - hour * HOUR });
        }
        const open = await prepared(env, { playerId: ann.playerId, itemId, subject: ann.subjects[0] });
        await env.setConfig({ paused: true });

        const body = { itemId: bensItem, subject: ben.subjects[0], fee: 1 };
        const refused = async (status, error) => expect(errorOf(await mint(body))).toEqual([status, error]);
        env.double.fail({ index: 'stale' });
        await refused(503, 'CHAIN UNAVAILABLE');
        env.double.fail({});
        await refused(400, 'NOT YOUR ITEM');
        body.itemId = minted;
        await refused(409, 'ALREADY MINTED');
        body.itemId = itemId;
        await refused(409, 'ITEM BUSY');
        body.itemId = fresh;
        await refused(409, 'OPERATION RUNNING');
        await ops.cancel(env.pool, open, env.now());
        await refused(403, 'NOT ENOUGH MATCHES');
        await env.matches(ann.playerId, 1);
        await refused(409, 'MINT LIMIT');
        await env.pool.query('UPDATE chain_ops SET submitted_at = $1 WHERE player_id = $2', [new Date(T0 - 24 * HOUR), ann.playerId]);
        await refused(400, 'NOT YOUR WALLET');
        body.subject = ben.subjects[1];
        await refused(409, 'WALLET WAITING');
        body.subject = ann.subjects[0];
        await refused(503, 'CHAIN PAUSED');
        await env.setConfig({});
        await refused(400, 'UNKNOWN FEE');
        body.fee = 0;
        await refused(400, 'NOT ENOUGH ADA');
        env.fund(ann.keys[0], 20_000_000);
        await mint(body).expect(201);
        expect(env.chainLog.error).not.toHaveBeenCalled();
    });

    test('CHAIN OFF without the chain features', async () => {
        const { app } = await createTestApp();
        const account = await createAccount(app);
        expect((await account.post('/chain/mint', {}).expect(404)).body).toEqual({ error: 'CHAIN OFF' });
        expect((await account.get('/chain/operations/x').expect(404)).body).toEqual({ error: 'CHAIN OFF' });
        expect((await account.del('/chain/operations/x').expect(404)).body).toEqual({ error: 'CHAIN OFF' });
    });

    test('CHAIN UNAVAILABLE: the index stale or unreachable, the provider down or busy, no config', async () => {
        const { env, mint } = await setup();
        env.advance(INDEX_MAX_LAG_MS + 1);
        expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
        env.block();
        for (const fault of [{ index: 'unavailable' }, { provider: 'unavailable' }, { provider: 'busy' }]) {
            env.double.fail(fault);
            expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
        }
        env.double.fail({});
        await env.removeConfig();
        expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(env.chainLog.error).toHaveBeenCalledTimes(1);
    });

    test('the provider failing after the checks (the wallet, the parameters, the tip): CHAIN UNAVAILABLE, nothing stored', async () => {
        const { env, ann, mint } = await setup();
        for (const method of ['utxosOf', 'protocolParameters', 'tip']) {
            const spy = jest.spyOn(env.chain.provider, method).mockRejectedValueOnce(new ProviderError('unavailable', 'down', 503));
            expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
            expect(spy).toHaveBeenCalled();
        }
        expect(await rowsOf(env.pool, ann.playerId)).toEqual([]);
        await mint().expect(201);
    });

    test('a server key the config does not list: CHAIN UNAVAILABLE, one log line without key material, readiness not ready', async () => {
        const stranger = loadedFixtureKey('stranger');
        const { env, ann, mint } = await setup({ serverKey: stranger });
        // refused before the wallet is read and anything is built
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        for (let i = 0; i < 3; i++) {
            expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
        }
        expect(utxosOf).not.toHaveBeenCalled();
        const readiness = (await ann.account.get('/chain/readiness').expect(200)).body;
        expect(readiness).toMatchObject({ ready: false, paused: false });
        expect(env.chainLog.error).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(env.chainLog.error.mock.calls);
        expect(logged).toMatch(/server key is not in the config/);
        expect(logged).not.toMatch(/ed25519_sk/);
        expect(logged).not.toContain(Buffer.from(PrivateKey.toBytes(stranger.privateKey)).toString('hex'));
        expect(await rowsOf(env.pool, ann.playerId)).toEqual([]);
    });

    test('NOT ENOUGH ADA: an empty wallet needs what the funds check says; a short one is missing what the build says, and with it the mint builds', async () => {
        const { env, ann, mint } = await setup({}, { lovelace: [0] });
        const rare = gameFeeOf(config, { tier: RARE, fee: 0 });
        const empty = fundsCheck({ utxos: [], kind: 'mint', gameFee: rare });
        expect((await mint().expect(400)).body).toEqual({ error: 'NOT ENOUGH ADA', missing: String(empty.needed), needed: String(empty.needed) });

        env.fund(ann.keys[0], 6_000_000);
        const short = (await mint().expect(400)).body;
        expect(short.error).toBe('NOT ENOUGH ADA');
        const missing = Number(short.missing);
        expect(missing).toBeGreaterThan(0);
        // "your wallet has 6 ADA, minting needs <needed>": never less than the wallet and what is missing
        expect(Number(short.needed)).toBeGreaterThanOrEqual(6_000_000 + missing);
        expect(Number(short.needed)).toBe(Math.max(fundsCheck({ utxos: await env.chain.provider.utxosOf(ann.subjects[0]), kind: 'mint', gameFee: rare }).needed, 6_000_000 + missing));
        env.fund(ann.keys[0], missing);
        await mint().expect(201);
    });

    test('NO COLLATERAL: the ADA is there, but in crumbs no three of which hold the collateral', async () => {
        const { env, ann, mint } = await setup({}, { lovelace: [0] });
        for (let i = 0; i < 20; i++) {
            env.double.fund(env.double.addressOf(ann.keys[0]), '600000');
        }
        env.block();
        expect((await mint().expect(400)).body).toEqual({ error: 'NO COLLATERAL' });
    });

    test('WALLET TOO FULL: the wallet\'s tokens do not fit into the change', async () => {
        const { env, ann, mint } = await setup({}, { lovelace: [0] });
        const policy = 'c7'.repeat(28);
        const tokens = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [policy + crypto.createHash('sha256').update(`token ${i}`).digest('hex'), '1']));
        env.double.fund(env.double.addressOf(ann.keys[0]), '40000000', tokens);
        env.block();
        expect((await mint().expect(400)).body).toEqual({ error: 'WALLET TOO FULL' });
    });

    test('UNKNOWN FEE: an index that is no option, none but 0 without options, an option in a token this build cannot pay', async () => {
        const { env, mint } = await setup();
        expect(errorOf(await mint({ fee: 1 }))).toEqual([400, 'UNKNOWN FEE']);
        expect(errorOf(await mint({ fee: -1 }))).toEqual([400, 'UNKNOWN FEE']);
        await env.setConfig({ fees: [] });
        expect(errorOf(await mint({ fee: 1 }))).toEqual([400, 'UNKNOWN FEE']);
        const choc = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
        await env.setConfig({ fees: [{ asset: choc, amounts: [50, 100, 200], receivers: [{ address: TEAM_ADDRESS, share: 1 }] }] });
        expect(errorOf(await mint({ fee: 0 }))).toEqual([400, 'UNKNOWN FEE']);
    });

    test('wrong body types: INVALID REQUEST PARAMETERS before anything is read (the chain is down here)', async () => {
        const { env, itemId, ann } = await setup();
        env.double.fail({ index: 'unavailable', provider: 'unavailable' });
        const good = { itemId, subject: ann.subjects[0], fee: 0 };
        for (const body of [
            {},
            { ...good, itemId: 5 },
            { ...good, itemId: '' },
            { ...good, itemId: 'x'.repeat(129) },
            { ...good, subject: null },
            { ...good, subject: ['stake:ab'] },
            { ...good, fee: '0' },
            { ...good, fee: 1.5 },
            { itemId, subject: ann.subjects[0] },
        ]) {
            expect((await ann.account.post('/chain/mint', body).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        }
    });

    test('plan B\'s faults on our side (BUILD_FAILED, BAD_ITEM, anything unexpected) are CHAIN UNAVAILABLE, logged without the transaction', async () => {
        const { env, mint } = await setup();
        const cbor = '84a4' + 'ab'.repeat(400);
        const faults = [new ChainTxError('BUILD_FAILED', { cause: `the SDK refused ${cbor}` }), new ChainTxError('BAD_ITEM'), new TypeError(`something else ${cbor}`)];
        for (const fault of faults) {
            jest.spyOn(tx, 'buildMint').mockRejectedValueOnce(fault);
            expect(errorOf(await mint())).toEqual([503, 'CHAIN UNAVAILABLE']);
        }
        expect(env.chainLog.error).toHaveBeenCalledTimes(3);
        const logged = JSON.stringify(env.chainLog.error.mock.calls);
        expect(logged).toMatch(/BUILD_FAILED/);
        expect(logged).toMatch(/BAD_ITEM/);
        expect(logged).not.toContain('ab'.repeat(100));
        // plan B's refusals that are the player's are not logged
        jest.spyOn(tx, 'buildMint').mockRejectedValueOnce(new ChainTxError('TX_TOO_LARGE'));
        expect(errorOf(await mint())).toEqual([400, 'WALLET TOO FULL']);
        expect(env.chainLog.error).toHaveBeenCalledTimes(3);
    });

    test('rate-limited per player, tighter than the readiness', async () => {
        const { env, ann } = await setup({ chainMintsPerMinute: 2 });
        await ann.account.post('/chain/mint', {}).expect(400);
        await ann.account.post('/chain/mint', {}).expect(400);
        expect((await ann.account.post('/chain/mint', {}).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
        // another player has a limit of their own
        const ben = await env.player('Ben');
        await ben.account.post('/chain/mint', {}).expect(400);
        env.advance(60_001);
        env.block();
        await ann.account.post('/chain/mint', {}).expect(400);
    });
});

describe('plain salvage and the item lock', () => {
    test('an item a mint holds is ITEM BUSY; once the mint is cancelled or expired it can be salvaged, its ended operations go with it', async () => {
        const { env, ann, itemId, mint } = await setup();
        const salvage = id => ann.account.post('/lab/salvage', { itemId: id });
        const first = (await mint().expect(201)).body;
        expect((await salvage(itemId).expect(409)).body).toEqual({ error: 'ITEM BUSY' });
        expect(await itemOf(ann.account, itemId)).toBeDefined();
        await ann.account.del(`/chain/operations/${first.operation.id}`).expect(200);
        // a second attempt that runs out of its sign window
        await mint().expect(201);
        env.advance(rules.SIGN_WINDOW_MS);
        env.block();
        await salvage(itemId).expect(200);
        expect(await itemOf(ann.account, itemId)).toBeUndefined();
        expect(await rowsOf(env.pool, ann.playerId)).toEqual([]);
    });

    test('another item\'s operations stay', async () => {
        const { env, ann, mint } = await setup();
        const other = await env.giveItem(ann.playerId, 'LIGHT_BARREL');
        const { operation } = (await mint().expect(201)).body;
        await ann.account.post('/lab/salvage', { itemId: other }).expect(200);
        expect((await rowsOf(env.pool, ann.playerId)).map(row => row.id)).toEqual([operation.id]);
    });
});
