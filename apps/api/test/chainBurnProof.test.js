// The phone path of a burn (minting plan E, Task 2b): on a phone the game has no wallet of its own,
// so POST /chain/burn comes without the wallet's addresses and the burn is prepared from every
// address the provider lists for the holder's stake key, the owner vouched for by nobody. Its
// sign code alone opens the sign page in the wallet app, where the wallet proves its addresses
// with the burn's own address proof (shared cardano.addressProofMessage, purpose 'burn'):
// POST /chain/sign/:code/addresses answers the text, and with the proof the server builds the
// burn again from those addresses alone and vouches for the owner. As plan D's tests of the mint's
// rebuild (chainWalletAddresses.test.js), every refusal leaves the row as it was, and no request a
// stranger with the code can send ends with the server's signature on a burn that pays to an
// address the holder's wallet does not control. On plan C's chain double with the real tx.js.

const crypto = require('crypto');
const request = require('supertest');
const { Address, Assets } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const tx = require('../src/chain/tx');
const ops = require('../src/chain/ops');
const { ChainTxError } = tx;
const { outRef } = require('../src/chain/names');
const { operationsStep } = require('../src/chain/operationsStep');
const { closeTestPools } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');
const { testKeys, signMessage, signedChallenge } = require('./helpers/cardano');
const { walletWitness } = require('./helpers/chain');
const { describeTx } = require('./helpers/describeTx');
const { createChainApp, K_FINAL } = require('./helpers/chainApp');
const { mintedItem, referenceUnitOf, burnRequest } = require('./helpers/burns');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const UNKNOWN = { error: 'UNKNOWN SIGN CODE' };
const errorOf = response => [response.status, response.body.error];
const hexOf = bech32 => Address.toHex(Address.fromBech32(bech32));
const textOf = payload => Buffer.from(payload, 'hex').toString('utf8');
const lovelaceOf = utxo => Number(Assets.lovelaceOf(utxo.assets));

/**
 * Ann (10 matches, a wallet of 20 ADA) with a TURBO_CONVEYOR minted to her base address and
 * final; then Mallory parks 50 ADA at an address of her payment key and Ann's stake key, and Ann's
 * burn of the item is prepared without the wallet's addresses, as the game on a phone asks.
 */
const setup = async (options = {}) => {
    const env = await createChainApp({ steps: [operationsStep], ...options });
    const ann = await env.player('Ann', { lovelace: [20_000_000], matches: 10, wallets: ['eternl'] });
    const { itemId, assetName, account } = await mintedItem(env, ann);
    const mallory = testKeys();
    const outsider = { paymentKeyHashHex: mallory.paymentKeyHashHex, stakeKeyHashHex: ann.keys[0].stakeKeyHashHex };
    env.fund(outsider, 50_000_000);
    const burned = (await burnRequest(account, ann, itemId, { addresses: undefined }).expect(201)).body;
    const code = burned.signCode;
    const annHex = ann.keys[0].baseAddressHex;
    const show = () => request(env.app).get(`/chain/sign/${code}`);
    const sign = witness => request(env.app).post(`/chain/sign/${code}`).send({ witness });
    const askPayload = addresses => request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses });
    const prove = (addresses, proof) => request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses, proof });
    // a whole rebuild as Ann's wallet does it on the sign page: the payload, then her stake key's signData of it
    const rebuild = async (addresses = [annHex]) => {
        const asked = await askPayload(addresses);
        return asked.status === 200 ? prove(addresses, signMessage(ann.keys[0], textOf(asked.body.payload))) : asked;
    };
    const row = () => ops.byId(env.pool, burned.operation.id);
    return { env, ann, account, itemId, assetName, mallory, outsider, outsiderAddress: env.double.addressOf(outsider), burned, code, annHex, show, sign, askPayload, prove, rebuild, row };
};

/** Another address of Ann's wallet (a fresh payment key, her stake key): { bech32, hex }. */
const otherOwnAddress = (env, ann) => {
    const bech32 = env.double.addressOf({ paymentKeyHashHex: testKeys().paymentKeyHashHex, stakeKeyHashHex: ann.keys[0].stakeKeyHashHex });
    return { bech32, hex: hexOf(bech32) };
};

describe('POST /chain/sign/:code/addresses for a burn', () => {
    test('the phone path: built from every address under Ann\'s stake key (Mallory\'s richer one among them) but paying only the token\'s own address; a witness is refused (ADDRESSES NEEDED); the payload changes nothing; Ann\'s proof builds the burn again from her address; her signature lands, the deposit and the change at her address', async () => {
        const { env, ann, assetName, mallory, outsiderAddress, burned, annHex, show, sign, askPayload, rebuild, row } = await setup();
        const before = await row();
        // the owner is the address of the UTxO that holds the token (ruling E13), never ownerOf's
        // richest address: Mallory's address carries Ann's stake key and holds the most
        expect(before).toMatchObject({ kind: 'burn', owner_address: ann.keys[0].baseAddress, owner_key_hash: ann.keys[0].paymentKeyHashHex, owner_confirmed: false });
        expect(before.owner_address).not.toBe(outsiderAddress);
        expect(describeTx(before.tx_cbor).outputs.map(output => output.address)).toEqual(describeTx(before.tx_cbor).outputs.map(() => ann.keys[0].baseAddress));
        expect((await show().expect(200)).body.address).toBe(ann.keys[0].baseAddress);
        expect(errorOf(await sign(walletWitness(burned.tx, [mallory.paymentKey])))).toEqual([409, 'ADDRESSES NEEDED']);

        const asked = await askPayload([annHex]).expect(200);
        expect(asked.headers['cache-control']).toBe('no-store');
        expect(Object.keys(asked.body)).toEqual(['payload']);
        expect(await row()).toEqual(before);

        const store = await env.chain.provider.utxoByUnit(referenceUnitOf(env.contracts.policyId, assetName));
        const response = await rebuild([annHex]);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const after = await row();
        expect(after).toMatchObject({
            id: before.id,
            kind: 'burn',
            state: 'prepared',
            owner_confirmed: true,
            owner_address: ann.keys[0].baseAddress,
            owner_key_hash: ann.keys[0].paymentKeyHashHex,
            required_keys: JSON.stringify([ann.keys[0].paymentKeyHashHex]),
            asset_name: assetName,
            code_hash: before.code_hash,
            subject: ann.subjects[0],
            item_id: before.item_id,
            fee_option: null,
            game_fee_asset: null,
        });
        expect(new Date(after.sign_until).getTime()).toBe(new Date(before.sign_until).getTime());
        expect(after.tx_hash).not.toBe(before.tx_hash);
        // the answer is what GET /chain/sign/:code answers now: the rebuilt burn, with what comes back
        expect(response.body).toEqual((await show().expect(200)).body);
        expect(response.body).toEqual({
            kind: 'burn',
            operationId: before.id,
            ownerConfirmed: true,
            item: burned.operation.item,
            tx: after.tx_cbor,
            network: 'preprod',
            costs: ops.view(after, burned.operation.item, env.now()).costs,
            subject: ann.subjects[0],
            address: ann.keys[0].baseAddress,
            signUntil: burned.operation.signUntil,
            returns: { MILK: 2, VANILLA: 2, GOLDLEAF: 1 },
        });
        expect(response.body.costs.deposits.reference).toBe(lovelaceOf(store));
        expect(response.body.costs.gameFee).toBeNull();
        // every output of the rebuilt burn is Ann's
        expect(describeTx(after.tx_cbor).outputs.map(output => output.address)).toEqual(describeTx(after.tx_cbor).outputs.map(() => ann.keys[0].baseAddress));

        await sign(walletWitness(response.body.tx, [ann.keys[0].paymentKey])).expect(200);
        expect(env.double.mempool()).toEqual([after.tx_hash]);
        env.block();
        expect(await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName)).toBeUndefined();
        expect(await env.chain.provider.utxoByUnit(referenceUnitOf(env.contracts.policyId, assetName))).toBeUndefined();
    });

    test('the payload is the burn\'s own address proof (purpose burn) of this operation, item, subject, window and list; never the mint\'s', async () => {
        const { ann, burned, annHex, askPayload, row } = await setup();
        const op = await row();
        const list = [annHex];
        const text = textOf((await askPayload(list).expect(200)).body.payload);
        const digest = crypto.createHash('sha256').update(list.map(address => address.toLowerCase()).join('\n')).digest('hex');
        expect(text).toBe(
            [
                'battlechoc.com asks your wallet to vouch for its own addresses for salvaging an item (this is not a sign-in and not a minting):',
                ann.keys[0].rewardAddress,
                '',
                "These addresses are this wallet's own; the item's token is burned from one of them and its deposit comes back to one of them. Signing this moves no funds.",
                '',
                'URI: https://battlechoc.com',
                'Action: burn-addresses',
                'Network: preprod',
                `Item: TURBO_CONVEYOR #${burned.operation.item.serial}`,
                `Operation: ${op.id}`,
                `Addresses: 1, SHA-256 ${digest}`,
                `Expiration Time: ${new Date(op.sign_until).toISOString()}`,
            ].join('\n')
        );
        expect(cardano.readAddressProof(text)).toMatchObject({ purpose: 'burn', operationId: op.id, subjectAddress: ann.keys[0].rewardAddress, digest, expires: burned.operation.signUntil });
        // the mint's parser (plan D's game and sign page) refuses it
        expect(cardano.addressProofOf(text)).toBeNull();
        expect(cardano.addressProofOf(text, 'burn')).not.toBeNull();
    });

    test('the attack: Mallory holds Ann\'s code and parks ADA at her address with Ann\'s stake key; none of her proofs, nor a proof of Ann\'s for anything else (another list or order, another operation, a mint, a sign-in or a link), changes the row; then Ann proves and her burn lands at her own address', async () => {
        const { env, ann, assetName, mallory, outsiderAddress, burned, annHex, sign, askPayload, prove, rebuild, row } = await setup();
        const before = await row();
        const own = otherOwnAddress(env, ann);
        const theirs = [hexOf(outsiderAddress)];
        const mixed = [annHex, hexOf(outsiderAddress)];
        const theirText = textOf((await askPayload(theirs).expect(200)).body.payload);
        const mixedText = textOf((await askPayload(mixed).expect(200)).body.payload);
        const annText = textOf((await askPayload([annHex]).expect(200)).body.payload);
        const fields = { domain: 'battlechoc.com', network: cardano.Networks.preprod, item: 'TURBO_CONVEYOR', serial: burned.operation.item.serial, subjectAddress: ann.keys[0].rewardAddress, expires: before.sign_until };
        const annSigns = text => signMessage(ann.keys[0], text);
        const challenges = [
            (await ann.account.post('/auth/cardano/challenge', { purpose: 'link', address: ann.keys[0].rewardAddress }).expect(200)).body.message,
            (await request(env.app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: ann.keys[0].rewardAddress }).expect(200)).body.message,
        ];
        const attempts = [
            // Mallory's own valid signData by her own keys, for her list and for a mixed one
            [theirs, signMessage(mallory, theirText)],
            [theirs, signMessage(mallory, theirText, { with: 'base' })],
            [theirs, signMessage(mallory, theirText, { with: 'enterprise' })],
            [mixed, signMessage(mallory, mixedText, { with: 'base' })],
            // Ann's real proof of her list, offered with another list, in another order, with one more address
            [theirs, annSigns(annText)],
            [mixed, annSigns(annText)],
            [[annHex, own.hex], annSigns(annText)],
            [[own.hex, annHex], annSigns(textOf((await askPayload([annHex, own.hex]).expect(200)).body.payload))],
            // Ann's key over the same list for another operation, or for a mint (of this operation, or of another item)
            [[annHex], annSigns(cardano.addressProofMessage({ ...fields, operationId: crypto.randomUUID(), addresses: [annHex], purpose: 'burn' }))],
            [[annHex], annSigns(cardano.addressProofMessage({ ...fields, operationId: before.id, addresses: [annHex], purpose: 'mint' }))],
            [[annHex], annSigns(cardano.addressProofMessage({ ...fields, item: 'DARK_WALLS', serial: 1, operationId: crypto.randomUUID(), addresses: [annHex] }))],
            // Ann's signatures over her sign-in and link challenges
            ...challenges.map(message => [[annHex], annSigns(message)]),
            // her signature with Mallory's key in it, and no proof at all
            [[annHex], { ...annSigns(annText), key: signMessage(mallory, annText).key }],
            [[annHex], null],
            [[annHex], 'x'],
            [[annHex], {}],
            [[annHex], { signature: 'zz', key: 'zz' }],
        ];
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        for (const [addresses, proof] of attempts) {
            expect(errorOf(await prove(addresses, proof))).toEqual([400, 'INVALID SIGNATURE']);
        }
        expect(await row()).toEqual(before);
        // nothing a stranger can send makes the server sign the burn built from the addresses nobody vouched for
        expect(errorOf(await sign(walletWitness(burned.tx, [mallory.paymentKey, ann.keys[0].paymentKey])))).toEqual([409, 'ADDRESSES NEEDED']);
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);

        // Ann's wallet proves her own address: the burn lands, everything it pays is hers
        const rebuilt = await rebuild([annHex]);
        expect(rebuilt.status).toBe(200);
        await sign(walletWitness(rebuilt.body.tx, [ann.keys[0].paymentKey])).expect(200);
        const signed = (await row()).signed_cbor;
        expect(describeTx(signed).outputs.every(output => output.address === ann.keys[0].baseAddress)).toBe(true);
        env.block();
        expect(await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName)).toBeUndefined();
        // Mallory's parked ADA was never spent
        expect((await env.chain.provider.utxosOf(ann.subjects[0])).some(utxo => Address.toBech32(utxo.address) === outsiderAddress)).toBe(true);
    });

    test('never exchangeable with the sign-in: a valid burn proof offered to /auth/cardano/verify is refused (sign-in and link); the verifier refuses the burn proof\'s first line', async () => {
        const { env, ann, annHex, askPayload, row } = await setup();
        const proof = signMessage(ann.keys[0], textOf((await askPayload([annHex]).expect(200)).body.payload));
        const signIn = (await request(env.app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: ann.keys[0].rewardAddress }).expect(200)).body;
        expect(errorOf(await request(env.app).post('/auth/cardano/verify').send({ nonce: signIn.nonce, ...proof }))).toEqual([400, 'INVALID SIGNATURE']);
        const link = (await ann.account.post('/auth/cardano/challenge', { purpose: 'link', address: ann.keys[0].rewardAddress }).expect(200)).body;
        expect(errorOf(await ann.account.post('/auth/cardano/verify', { nonce: link.nonce, ...proof }))).toEqual([400, 'INVALID SIGNATURE']);
        expect((await row()).owner_confirmed).toBe(false);

        const { verifySignature } = require('../src/cardano');
        const keys = testKeys();
        const text = `${cardano.BURN_ADDRESS_PROOF_HEADLINE}\nItem: TURBO_CONVEYOR #1`;
        expect(() => verifySignature({ ...signMessage(keys, text), message: text, address: keys.rewardAddress, network: cardano.Networks.preprod })).toThrow(
            expect.objectContaining({ status: 400, code: 'INVALID SIGNATURE' })
        );
    });

    test('refusals, the row unchanged by each: the shape, NOT YOUR WALLET, NOT ENOUGH ADA, NO COLLATERAL, CHAIN UNAVAILABLE, WALLET WAITING, ITEM MOVED, ITEM LEFT WALLET; a cancelled code is dead', async () => {
        const { env, ann, assetName, annHex, askPayload, prove, rebuild, row, account, burned } = await setup();
        const before = await row();
        for (const addresses of [undefined, 'x', [], [42], ['zz']]) {
            expect(errorOf(await askPayload(addresses))).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        }
        expect(errorOf(await askPayload([testKeys().baseAddressHex]))).toEqual([400, 'NOT YOUR WALLET']);
        jest.spyOn(tx, 'buildBurn').mockRejectedValueOnce(new ChainTxError('NOT_ENOUGH_ADA', { missing: 4321 }));
        const short = await rebuild();
        expect([short.status, short.body.error, short.body.missing]).toEqual([400, 'NOT ENOUGH ADA', '4321']);
        jest.spyOn(tx, 'buildBurn').mockRejectedValueOnce(new ChainTxError('NO_COLLATERAL'));
        expect(errorOf(await rebuild())).toEqual([400, 'NO COLLATERAL']);
        // a stale index (the sign window is shorter than the index's lag: the double says it is stale)
        env.double.fail({ index: 'stale' });
        expect(errorOf(await rebuild())).toEqual([503, 'CHAIN UNAVAILABLE']);
        env.double.fail({ provider: 'unavailable' });
        expect(errorOf(await rebuild())).toEqual([503, 'CHAIN UNAVAILABLE']);
        env.double.fail({});
        // the hop wait: the wallet was Ben's just before Ann linked it
        const { rows } = await env.pool.query('SELECT linked_at FROM identity_history WHERE subject = $1 AND player_id = $2', [ann.subjects[0], ann.playerId]);
        const linkedAt = new Date(rows[0].linked_at).getTime();
        const ben = await env.player('Ben');
        await env.pool.query('INSERT INTO identity_history (id, subject, player_id, linked_at, unlinked_at) VALUES ($1, $2, $3, $4, $5)', [
            crypto.randomUUID(), ann.subjects[0], ben.playerId, new Date(linkedAt - 2000), new Date(linkedAt - 1000),
        ]);
        expect(errorOf(await rebuild())).toEqual([409, 'WALLET WAITING']);
        await env.pool.query('DELETE FROM identity_history WHERE player_id = $1', [ben.playerId]);
        expect(await row()).toEqual(before);

        // the token at another address of Ann's wallet, not one she named: ITEM MOVED
        const own = otherOwnAddress(env, ann);
        env.double.moveToken({ assetName, to: own.bech32 });
        env.block();
        expect(errorOf(await rebuild([annHex]))).toEqual([409, 'ITEM MOVED']);
        expect(await row()).toEqual(before);
        // in Ben's wallet: ITEM LEFT WALLET
        env.double.moveToken({ assetName, to: env.double.addressOf(ben.keys[0]) });
        env.block();
        expect(errorOf(await rebuild([annHex, own.hex]))).toEqual([409, 'ITEM LEFT WALLET']);
        expect(await row()).toEqual(before);

        // cancelled by Ann: the code is dead for the payload and for the proof
        await (await env.refreshed(account)).del(`/chain/operations/${burned.operation.id}`).expect(200);
        expect((await askPayload([annHex]).expect(404)).body).toEqual(UNKNOWN);
        expect((await prove([annHex], signMessage(ann.keys[0], 'any text')).expect(404)).body).toEqual(UNKNOWN);
    });

    test('a token moved within the wallet to an address it names is no refusal: the burn is built from where the token is now', async () => {
        const { env, ann, assetName, annHex, rebuild, row } = await setup();
        const own = otherOwnAddress(env, ann);
        env.double.moveToken({ assetName, to: own.bech32 });
        env.block();
        const rebuilt = await rebuild([annHex, own.hex]);
        expect(rebuilt.status).toBe(200);
        const held = await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName);
        expect(tx.inputsOf((await row()).tx_cbor)).toContain(outRef(held));
    });

    test('a list with an address twice: its own text (the digest counts each entry), a proof of the single list is refused for it; its proof builds the same burn as the single list', async () => {
        const { ann, annHex, askPayload, prove, rebuild, row } = await setup();
        const single = textOf((await askPayload([annHex]).expect(200)).body.payload);
        const twice = textOf((await askPayload([annHex, annHex]).expect(200)).body.payload);
        expect(twice).not.toBe(single);
        expect(cardano.readAddressProof(twice)).toMatchObject({ purpose: 'burn', addressCount: 2 });
        const before = await row();
        expect(errorOf(await prove([annHex, annHex], signMessage(ann.keys[0], single)))).toEqual([400, 'INVALID SIGNATURE']);
        expect(await row()).toEqual(before);
        const rebuilt = await rebuild([annHex, annHex]);
        expect(rebuilt.status).toBe(200);
        const after = await row();
        expect(after).toMatchObject({ owner_confirmed: true, owner_address: ann.keys[0].baseAddress, required_keys: JSON.stringify([ann.keys[0].paymentKeyHashHex]) });
        const once = await rebuild([annHex]);
        expect(once.status).toBe(200);
        expect((await row()).tx_hash).toBe(after.tx_hash);
    });

    test('a burn prepared on the desktop (vouched for) and built again on the phone: a witness of the transaction before the rebuild is refused (INVALID WITNESS), the new one is taken', async () => {
        const { env, ann, itemId, annHex } = await setup();
        const account = await env.refreshed(ann.account);
        const phoneBurn = (await account.get('/chain/readiness').expect(200)).body.operation;
        await account.del(`/chain/operations/${phoneBurn.id}`).expect(200);
        // the desktop: the extension's addresses with the prepare
        const desktop = (await burnRequest(account, ann, itemId).expect(201)).body;
        expect(desktop.operation.ownerConfirmed).toBe(true);
        const code = desktop.signCode;
        // a block later the phone builds it again (a new tip: a new ttl, a new transaction)
        env.block();
        const asked = await request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses: [annHex] }).expect(200);
        const rebuilt = await request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses: [annHex], proof: signMessage(ann.keys[0], textOf(asked.body.payload)) }).expect(200);
        expect(rebuilt.body.tx).not.toBe(desktop.tx);
        const signWith = cbor => request(env.app).post(`/chain/sign/${code}`).send({ witness: walletWitness(cbor, [ann.keys[0].paymentKey]) });
        expect(errorOf(await signWith(desktop.tx))).toEqual([400, 'INVALID WITNESS']);
        expect(env.double.mempool()).toEqual([]);
        await signWith(rebuilt.body.tx).expect(200);
        expect(env.double.mempool()).toEqual([describeTx(rebuilt.body.tx).txHash]);
    });

    test('a pay: subject (a wallet without a stake key): its payment key proves with an address of that key; a token at another address of that key is ITEM MOVED; at its enterprise address the burn pays the token\'s own address and lands', async () => {
        const env = await createChainApp({ steps: [operationsStep] });
        const account = await createAccount(env.app, { username: 'Pia' });
        const keys = testKeys();
        const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, address: keys.enterpriseAddress, with: 'enterprise' });
        const linked = await request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`).send(verify).expect(200);
        const subject = linked.body.identity.subject;
        expect(subject).toBe(`pay:${keys.paymentKeyHashHex}`);
        env.double.fund(env.double.addressOf(keys, 'enterprise'), '20000000');
        env.block();
        await env.matches(account.playerId, 10);
        // a TURBO_CONVEYOR minted to the enterprise address, final
        const itemId = await env.giveItem(account.playerId, 'TURBO_CONVEYOR');
        const minted = (await account.post('/chain/mint', { itemId, subject, fee: 0, addresses: [keys.enterpriseAddressHex] }).expect(201)).body;
        await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [keys.paymentKey]) }).expect(200);
        env.block(K_FINAL + 1);
        await env.runOnce();
        expect(await ops.byId(env.pool, minted.operation.id)).toMatchObject({ state: 'final' });
        const assetName = minted.operation.assetName;

        // the phone: prepared without addresses; the token then moves to a base address of the same payment key
        const fresh = await env.refreshed(account);
        const burned = (await fresh.post('/chain/burn', { itemId, subject }).expect(201)).body;
        expect(burned.operation.ownerConfirmed).toBe(false);
        const base = env.double.addressOf({ paymentKeyHashHex: keys.paymentKeyHashHex, stakeKeyHashHex: testKeys().stakeKeyHashHex });
        env.double.moveToken({ assetName, to: base });
        env.block();
        const code = burned.signCode;
        const before = await ops.byId(env.pool, burned.operation.id);
        const proveWith = async addresses => {
            const asked = await request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses }).expect(200);
            return request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses, proof: signMessage(keys, textOf(asked.body.payload), { with: 'enterprise' }) });
        };
        // the stake-key form of the proof is none for a pay: subject
        const askedOnly = await request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses: [keys.enterpriseAddressHex] }).expect(200);
        expect(errorOf(await request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses: [keys.enterpriseAddressHex], proof: signMessage(keys, textOf(askedOnly.body.payload)) }))).toEqual([400, 'INVALID SIGNATURE']);
        // the enterprise address alone: the token is at another address of the same payment key (heldBy's holder.pay)
        expect(errorOf(await proveWith([keys.enterpriseAddressHex]))).toEqual([409, 'ITEM MOVED']);
        expect(await ops.byId(env.pool, burned.operation.id)).toEqual(before);
        // the provider lists a pay: subject's funds at its enterprise address alone, so naming the
        // base address does not reach the token there either (still ITEM MOVED)
        expect(errorOf(await proveWith([keys.enterpriseAddressHex, hexOf(base)]))).toEqual([409, 'ITEM MOVED']);
        // the token back at the enterprise address: built from it, paying the token's own address
        env.double.moveToken({ assetName, to: keys.enterpriseAddress });
        env.block();
        const rebuilt = await proveWith([keys.enterpriseAddressHex]);
        expect(rebuilt.status).toBe(200);
        expect(rebuilt.body).toMatchObject({ kind: 'burn', ownerConfirmed: true, subject, address: keys.enterpriseAddress });
        expect(describeTx(rebuilt.body.tx).outputs.every(output => output.address === keys.enterpriseAddress)).toBe(true);
        await request(env.app).post(`/chain/sign/${code}`).send({ witness: walletWitness(rebuilt.body.tx, [keys.paymentKey]) }).expect(200);
        env.block();
        expect(await env.chain.provider.utxoByUnit(env.contracts.policyId + assetName)).toBeUndefined();
    });

    test('the kind is the row\'s: an operation of another kind is never rebuilt (404, the row as it was)', async () => {
        const { ann, annHex, askPayload, prove, row } = await setup();
        const before = await row();
        const byCode = ops.byCode;
        jest.spyOn(ops, 'byCode').mockImplementation(async (...args) => {
            const found = await byCode(...args);
            return found && { ...found, kind: 'swap' };
        });
        expect((await askPayload([annHex]).expect(404)).body).toEqual(UNKNOWN);
        expect((await prove([annHex], signMessage(ann.keys[0], 'any text')).expect(404)).body).toEqual(UNKNOWN);
        jest.restoreAllMocks();
        expect(await row()).toEqual(before);
    });

    test('limited per address and operation by the rebuild\'s bucket, as for a mint', async () => {
        const { annHex, askPayload, rebuild } = await setup({ chainRebuildsPerMinute: 3 });
        for (let i = 0; i < 3; i++) {
            await askPayload([annHex]).set('X-Forwarded-For', '203.0.113.9').expect(200);
        }
        expect(errorOf(await askPayload([annHex]).set('X-Forwarded-For', '203.0.113.9'))).toEqual([429, 'TOO MANY REQUESTS']);
        expect((await rebuild()).status).toBe(200);
        expect(errorOf(await askPayload([annHex]))).toEqual([200, undefined]);
        expect(errorOf(await askPayload([annHex]))).toEqual([429, 'TOO MANY REQUESTS']);
    });
});

describe('GET /chain/sign/:code', () => {
    test('a burn\'s sign info: kind burn, the view\'s costs, what comes back by today\'s recipes; a mint\'s is unchanged (no returns)', async () => {
        const { env, burned, show, row } = await setup();
        const info = (await show().expect(200)).body;
        expect(Object.keys(info)).toEqual(['kind', 'operationId', 'ownerConfirmed', 'item', 'tx', 'network', 'costs', 'subject', 'address', 'signUntil', 'returns']);
        expect(info).toMatchObject({ kind: 'burn', operationId: burned.operation.id, ownerConfirmed: false, returns: { MILK: 2, VANILLA: 2, GOLDLEAF: 1 } });
        expect(info.costs).toEqual(ops.view(await row(), burned.operation.item, env.now()).costs);
        expect(info.costs).toEqual(burned.costs);

        const ben = await env.player('Ben', { lovelace: [20_000_000], matches: 10 });
        const benItem = await env.giveItem(ben.playerId, 'DARK_WALLS');
        const minted = (await ben.account.post('/chain/mint', { itemId: benItem, subject: ben.subjects[0], fee: 0 }).expect(201)).body;
        const mintInfo = (await request(env.app).get(`/chain/sign/${minted.signCode}`).expect(200)).body;
        expect(Object.keys(mintInfo)).toEqual(['kind', 'operationId', 'ownerConfirmed', 'item', 'tx', 'network', 'costs', 'subject', 'address', 'signUntil']);
        expect(mintInfo.kind).toBe('mint');
    });

    test('CHAIN OFF without the chain features', async () => {
        const { app } = await createTestApp();
        expect((await request(app).post('/chain/sign/AAAAAAAAAAAAAAAAAAAAAA/addresses').send({}).expect(404)).body).toEqual({ error: 'CHAIN OFF' });
        expect((await request(app).get('/chain/sign/AAAAAAAAAAAAAAAAAAAAAA').expect(404)).body).toEqual({ error: 'CHAIN OFF' });
    });
});
