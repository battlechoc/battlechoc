// The wallet names its addresses (minting plan D, ruling D21). For a `stake:` subject plan B's
// ownerOf takes every address with that stake key, whatever its payment key, and makes the
// richest the owner: an outsider who parks ADA at an address of their own payment key and a
// player's stake key gets every mint of that player built for them, never signable. So POST
// /chain/mint takes the wallet's own `addresses` (hex, as CIP-30 answers them) and builds from the
// UTxOs at those alone, and POST /chain/sign/:code/addresses builds a prepared operation again from
// them (one compare-and-set on its state and its old transaction). On plan C's chain double with
// the real tx.js, so the mints land.

const crypto = require('crypto');
const request = require('supertest');
const { Address, KeyHash, Pointer, PointerAddress, ScriptHash } = require('@evolution-sdk/evolution');
const { base58 } = require('@scure/base');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { WalletAddressError, walletAddressesOf, ownAddressesOf } = require('../src/chain/walletAddresses');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const ops = require('../src/chain/ops');
const { closeTestPools } = require('./helpers/db');
const { createAccount } = require('./helpers/api');
const { testKeys, signedChallenge, signMessage } = require('./helpers/cardano');
const { walletWitness } = require('./helpers/chain');
const { createChainApp } = require('./helpers/chainApp');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const UNKNOWN = { error: 'UNKNOWN SIGN CODE' };
const errorOf = response => [response.status, response.body.error];
const ok = async answer => {
    const response = await answer;
    expect([response.status, response.body.error]).toEqual([200, undefined]);
    return response;
};
const hexOf = bech32 => Address.toHex(Address.fromBech32(bech32));

/**
 * Ann (10 verified matches, a DARK_WALLS) with her wallet's base address holding `own` lovelace,
 * and an outsider's address (Mallory's payment key, Ann's stake key) holding `parked` (0: none).
 */
const setup = async (options = {}, { own = 20_000_000, parked = 50_000_000 } = {}) => {
    const env = await createChainApp(options);
    const ann = await env.player('Ann', { lovelace: [own], matches: 10, wallets: ['eternl'] });
    const mallory = testKeys();
    const outsider = { paymentKeyHashHex: mallory.paymentKeyHashHex, stakeKeyHashHex: ann.keys[0].stakeKeyHashHex };
    if (parked > 0) {
        env.fund(outsider, parked);
    }
    const itemId = await env.giveItem(ann.playerId, 'DARK_WALLS');
    const annHex = ann.keys[0].baseAddressHex;
    const mint = (body = {}, account = ann.account) => account.post('/chain/mint', { itemId, subject: ann.subjects[0], fee: 0, ...body });
    const show = code => request(env.app).get(`/chain/sign/${code}`);
    const sign = (code, witness) => request(env.app).post(`/chain/sign/${code}`).send({ witness });
    // the rebuild door: the payload for `addresses` (no proof: nothing changes), or the list with a proof
    const askPayload = (code, addresses) => request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses });
    const prove = (code, addresses, proof) => request(env.app).post(`/chain/sign/${code}/addresses`).send({ addresses, proof });
    // a whole rebuild as Ann's wallet does it: it asks for the payload, its stake key signs it (signData)
    const rebuild = async (code, addresses) => {
        const asked = await askPayload(code, addresses);
        if (asked.status !== 200) {
            return asked;
        }
        return prove(code, addresses, signMessage(ann.keys[0], Buffer.from(asked.body.payload, 'hex').toString('utf8')));
    };
    const rowOf = id => ops.byId(env.pool, id);
    return { env, ann, mallory, outsider, outsiderAddress: env.double.addressOf(outsider), itemId, annHex, mint, show, sign, askPayload, prove, rebuild, rowOf };
};

/** Another address of Ann's wallet (another payment key, her stake key) that holds nothing: its hex. */
const emptyOwnHex = (env, ann) =>
    Address.toHex(new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex(testKeys().paymentKeyHashHex), stakingCredential: KeyHash.fromHex(ann.keys[0].stakeKeyHashHex) }));

/** A player whose wallet has no stake key (a pay: subject), linked, its enterprise address funded, 10 matches. */
const payPlayer = async env => {
    const account = await createAccount(env.app, { username: 'Pia' });
    const keys = testKeys();
    const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, address: keys.enterpriseAddress, with: 'enterprise' });
    const linked = await request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`).send(verify);
    expect(linked.status).toBe(200);
    env.double.fund(env.double.addressOf(keys, 'enterprise'), '20000000');
    env.block();
    await env.matches(account.playerId, 10);
    return { account, keys, subject: linked.body.identity.subject };
};

// a Byron address of mainnet and one of a testnet (the SDK reads both with networkId 0 and cannot
// write them as bech32)
const BYRON = ['Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi', '2cWKMJemoBain3UWCzSY5wDvYBp1S5eVmCMoTyRXyazp8Bup3rz5v4mFkA5BzRrWLtvGE'].map(text =>
    Buffer.from(base58.decode(text)).toString('hex')
);

/**
 * Addresses that cannot carry Ann's stake key, hex: Byron ones, another wallet's base address, her
 * payment key alone (enterprise), a pointer address of her payment key, her reward address, a script
 * payment part with her stake key.
 */
const leftOutFor = ann => [
    ...BYRON,
    testKeys().baseAddressHex,
    ann.keys[0].enterpriseAddressHex,
    PointerAddress.toHex(new PointerAddress.PointerAddress({ networkId: 0, paymentCredential: KeyHash.fromHex(ann.keys[0].paymentKeyHashHex), pointer: new Pointer.Pointer({ slot: 1, txIndex: 2, certIndex: 3 }) })),
    ann.keys[0].rewardAddressHex,
    Address.toHex(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('ab'.repeat(28)), stakingCredential: KeyHash.fromHex(ann.keys[0].stakeKeyHashHex) })),
];

/** A second address of Ann's wallet (another payment key of hers, her stake key) holding `lovelace`: its hex and its key. */
const secondAddress = (env, ann, lovelace) => {
    const keys = testKeys();
    const address = { paymentKeyHashHex: keys.paymentKeyHashHex, stakeKeyHashHex: ann.keys[0].stakeKeyHashHex };
    env.fund(address, lovelace);
    return { hex: hexOf(env.double.addressOf(address)), bech32: env.double.addressOf(address), paymentKey: keys.paymentKey, keyHash: keys.paymentKeyHashHex };
};

describe('POST /chain/mint with the wallet\'s addresses', () => {
    test('without them (as before): the outsider\'s richer address is the owner, its key is required; no witness is co-signed for an owner nobody vouched for', async () => {
        const { env, ann, mallory, outsiderAddress, mint, show, sign, rowOf } = await setup();
        const { body } = await mint().expect(201);
        const row = await rowOf(body.operation.id);
        expect(row.owner_address).toBe(outsiderAddress);
        expect(JSON.parse(row.required_keys)).toEqual([mallory.paymentKeyHashHex]);
        expect((await show(body.signCode).expect(200)).body.address).toBe(outsiderAddress);
        expect(row.owner_confirmed).toBe(false);
        expect(errorOf(await sign(body.signCode, walletWitness(body.tx, [ann.keys[0].paymentKey])))).toEqual([409, 'ADDRESSES NEEDED']);
        expect(env.double.mempool()).toEqual([]);
    });

    test('with Ann\'s addresses: the owner is hers, Ann\'s key alone signs, the mint lands at her address', async () => {
        const { env, ann, annHex, mint, sign, rowOf } = await setup();
        const { body } = await mint({ addresses: [annHex] }).expect(201);
        const row = await rowOf(body.operation.id);
        expect(row.owner_address).toBe(ann.keys[0].baseAddress);
        expect(JSON.parse(row.required_keys)).toEqual([ann.keys[0].paymentKeyHashHex]);
        await sign(body.signCode, walletWitness(body.tx, [ann.keys[0].paymentKey])).expect(200);
        env.block();
        const holders = await env.chain.index.holdersOf([row.asset_name]);
        expect(holders.map(holder => holder.address)).toEqual([ann.keys[0].baseAddress]);
    });

    test('hex in either case is the same address; an address of the wallet that holds nothing is no harm', async () => {
        const { env, ann, annHex, mint, rowOf } = await setup();
        const { body } = await mint({ addresses: [emptyOwnHex(env, ann), annHex.toUpperCase()] }).expect(201);
        expect((await rowOf(body.operation.id)).owner_address).toBe(ann.keys[0].baseAddress);
    });

    test('a wrong shape is INVALID REQUEST PARAMETERS before anything is read', async () => {
        const { env, annHex, mint, ann } = await setup();
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        const tooMany = Array.from({ length: 101 }, () => annHex);
        for (const addresses of ['x', {}, null, [], tooMany, [42], ['zz'], ['00'], ['ab'.repeat(57)], [annHex, 'abc'], [testKeys({ networkId: 1 }).baseAddressHex]]) {
            expect(errorOf(await mint({ addresses }))).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        }
        expect(utxosOf).not.toHaveBeenCalled();
        expect(await env.pool.query('SELECT id FROM chain_ops WHERE player_id = $1', [ann.playerId]).then(result => result.rows)).toEqual([]);
        // exactly 100 is fine
        await mint({ addresses: Array.from({ length: 100 }, () => annHex) }).expect(201);
    });

    test('an address that cannot carry the subject\'s stake key is left out, the others are used; only such ones: NOT YOUR WALLET', async () => {
        const { ann, annHex, mint, rowOf } = await setup();
        const leftOut = leftOutFor(ann);
        for (const other of leftOut) {
            expect(errorOf(await mint({ addresses: [other] }))).toEqual([400, 'NOT YOUR WALLET']);
        }
        expect(errorOf(await mint({ addresses: leftOut }))).toEqual([400, 'NOT YOUR WALLET']);
        const { body } = await mint({ addresses: [...leftOut, annHex] }).expect(201);
        const row = await rowOf(body.operation.id);
        expect(row.owner_address).toBe(ann.keys[0].baseAddress);
        expect(JSON.parse(row.required_keys)).toEqual([ann.keys[0].paymentKeyHashHex]);
    });

    test('no usable ADA at the named addresses: NOT ENOUGH ADA, as for an empty wallet', async () => {
        const { env, ann, mint } = await setup({}, { own: 0, parked: 50_000_000 });
        const response = await mint({ addresses: [ann.keys[0].baseAddressHex] });
        expect(errorOf(response)).toEqual([400, 'NOT ENOUGH ADA']);
        expect(response.body.missing).toBe(response.body.needed);
        expect(env.double.mempool()).toEqual([]);
    });

    test('a pay: subject (a wallet without a stake key): its enterprise address; another key\'s is NOT YOUR WALLET', async () => {
        const env = await createChainApp();
        const account = await createAccount(env.app, { username: 'Pia' });
        const keys = testKeys();
        const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, address: keys.enterpriseAddress, with: 'enterprise' });
        const linked = await request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`).send(verify);
        expect(linked.status).toBe(200);
        const subject = linked.body.identity.subject;
        expect(subject).toBe(`pay:${keys.paymentKeyHashHex}`);
        env.double.fund(env.double.addressOf(keys, 'enterprise'), '20000000');
        env.block();
        await env.matches(account.playerId, 10);
        const itemId = await env.giveItem(account.playerId, 'DARK_WALLS');
        const mint = addresses => account.post('/chain/mint', { itemId, subject, fee: 0, addresses });

        expect(errorOf(await mint([testKeys().enterpriseAddressHex]))).toEqual([400, 'NOT YOUR WALLET']);
        const { body } = await mint([keys.enterpriseAddressHex]).expect(201);
        const row = await ops.byId(env.pool, body.operation.id);
        expect(row.owner_address).toBe(keys.enterpriseAddress);
        await request(env.app).post(`/chain/sign/${body.signCode}`).send({ witness: walletWitness(body.tx, [keys.paymentKey]) }).expect(200);
        env.block();
        expect((await env.chain.index.holdersOf([row.asset_name])).map(holder => holder.address)).toEqual([keys.enterpriseAddress]);
    });

    test('nobody without the session can mint: 401', async () => {
        const { env, ann, itemId, annHex } = await setup();
        const response = await request(env.app).post('/chain/mint').send({ itemId, subject: ann.subjects[0], fee: 0, addresses: [annHex] });
        expect(response.status).toBe(401);
    });
});

describe('POST /chain/sign/:code/addresses', () => {
    test('the outsider\'s build: a witness is refused (ADDRESSES NEEDED); the payload alone changes nothing; Ann\'s proof rebuilds it for her, and her signature lands', async () => {
        const { env, ann, annHex, mint, show, sign, askPayload, rebuild, rowOf, outsiderAddress, mallory } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        expect(before).toMatchObject({ owner_address: outsiderAddress, owner_confirmed: false });
        // not even the outsider's own (valid) witness is co-signed
        expect(errorOf(await sign(minted.signCode, walletWitness(minted.tx, [mallory.paymentKey])))).toEqual([409, 'ADDRESSES NEEDED']);

        const asked = await askPayload(minted.signCode, [annHex]).expect(200);
        expect(asked.headers['cache-control']).toBe('no-store');
        expect(Object.keys(asked.body)).toEqual(['payload']);
        expect(await rowOf(minted.operation.id)).toEqual(before);

        const response = await rebuild(minted.signCode, [annHex]);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const after = await rowOf(minted.operation.id);
        expect(after).toMatchObject({
            id: before.id,
            state: 'prepared',
            owner_confirmed: true,
            owner_address: ann.keys[0].baseAddress,
            owner_key_hash: ann.keys[0].paymentKeyHashHex,
            required_keys: JSON.stringify([ann.keys[0].paymentKeyHashHex]),
            code_hash: before.code_hash,
            subject: before.subject,
            item_id: before.item_id,
            fee_option: before.fee_option,
        });
        expect(new Date(after.sign_until).getTime()).toBe(new Date(before.sign_until).getTime());
        expect(after.tx_hash).not.toBe(before.tx_hash);
        // what GET /chain/sign/:code answers now, for the rebuilt operation
        expect(response.body).toEqual((await show(minted.signCode).expect(200)).body);
        expect(response.body).toMatchObject({ kind: 'mint', operationId: before.id, ownerConfirmed: true, tx: after.tx_cbor, address: ann.keys[0].baseAddress, subject: ann.subjects[0], signUntil: minted.operation.signUntil });
        expect(response.body.costs).toEqual(ops.view(after, minted.operation.item, env.now()).costs);

        await sign(minted.signCode, walletWitness(response.body.tx, [ann.keys[0].paymentKey])).expect(200);
        expect(env.double.mempool()).toEqual([after.tx_hash]);
        env.block();
        expect((await env.chain.index.holdersOf([after.asset_name])).map(holder => holder.address)).toEqual([ann.keys[0].baseAddress]);
    });

    test('the payload: the shared address-proof text (cardano.addressProofMessage) of this operation, item, subject, window and list, as hex; the same for the same list', async () => {
        const { ann, annHex, mint, askPayload, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const row = await rowOf(minted.operation.id);
        const list = [annHex, emptyOwnHex(undefined, ann)];
        const payload = (await askPayload(minted.signCode, list).expect(200)).body.payload;
        expect(payload).toMatch(/^[0-9a-f]+$/);
        const digest = crypto.createHash('sha256').update(list.map(address => address.toLowerCase()).join('\n')).digest('hex');
        const text = Buffer.from(payload, 'hex').toString('utf8');
        expect(text).toBe(
            [
                'battlechoc.com asks your wallet to vouch for its own addresses for a mint (this is not a sign-in):',
                ann.keys[0].rewardAddress,
                '',
                "These addresses are this wallet's own; the item is minted to one of them. Signing this moves no funds.",
                '',
                'URI: https://battlechoc.com',
                'Action: mint-addresses',
                'Network: preprod',
                `Item: DARK_WALLS #${minted.operation.item.serial}`,
                `Operation: ${minted.operation.id}`,
                `Addresses: 2, SHA-256 ${digest}`,
                `Expiration Time: ${new Date(row.sign_until).toISOString()}`,
            ].join('\n')
        );
        expect(cardano.addressProofOf(text)).toMatchObject({ operationId: minted.operation.id, subjectAddress: ann.keys[0].rewardAddress, digest, expires: minted.operation.signUntil });
        expect((await askPayload(minted.signCode, list).expect(200)).body.payload).toBe(payload);
        // the digest's form is lower-case hex: the case does not count; the order and every address do
        expect((await askPayload(minted.signCode, [list[0].toUpperCase(), list[1]]).expect(200)).body.payload).toBe(payload);
        for (const other of [[...list].reverse(), [list[0]]]) {
            expect((await askPayload(minted.signCode, other).expect(200)).body.payload).not.toBe(payload);
        }
    });

    test('the review\'s attack: Mallory holds Ann\'s code of a correctly built mint and parks ADA at her address with Ann\'s stake key; every proof of hers is refused, the row stays, Ann signs as before', async () => {
        const { env, ann, annHex, mint, sign, askPayload, rowOf, mallory, outsiderAddress, prove } = await setup();
        const { body: minted } = await mint({ addresses: [annHex] }).expect(201);
        const before = await rowOf(minted.operation.id);
        expect(before).toMatchObject({ owner_address: ann.keys[0].baseAddress, owner_confirmed: true });
        const theirs = [hexOf(outsiderAddress)];
        const asked = await askPayload(minted.signCode, theirs).expect(200);
        const text = Buffer.from(asked.body.payload, 'hex').toString('utf8');
        const annsForAnother = signMessage(ann.keys[0], Buffer.from((await askPayload(minted.signCode, [annHex]).expect(200)).body.payload, 'hex').toString('utf8'));
        for (const proof of [
            signMessage(mallory, text),
            signMessage(mallory, text, { with: 'base' }),
            signMessage(mallory, text, { with: 'enterprise' }),
            annsForAnother,
            { ...signMessage(ann.keys[0], text), key: signMessage(mallory, text).key },
            null,
            'x',
            {},
            { signature: 'zz', key: 'zz' },
        ]) {
            expect(errorOf(await prove(minted.signCode, theirs, proof))).toEqual([400, 'INVALID SIGNATURE']);
        }
        expect(await rowOf(minted.operation.id)).toEqual(before);
        await sign(minted.signCode, walletWitness(minted.tx, [ann.keys[0].paymentKey])).expect(200);
        env.block();
        expect((await env.chain.index.holdersOf([before.asset_name])).map(holder => holder.address)).toEqual([ann.keys[0].baseAddress]);
    });

    test('never exchangeable with the sign-in: a signature over a sign-in or link challenge is no address proof', async () => {
        const { env, ann, annHex, mint, prove, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        const challenges = [
            (await ann.account.post('/auth/cardano/challenge', { purpose: 'link', address: ann.keys[0].rewardAddress }).expect(200)).body,
            (await request(env.app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: ann.keys[0].rewardAddress }).expect(200)).body,
        ];
        for (const challenge of challenges) {
            expect(errorOf(await prove(minted.signCode, [annHex], signMessage(ann.keys[0], challenge.message)))).toEqual([400, 'INVALID SIGNATURE']);
        }
        expect(await rowOf(minted.operation.id)).toEqual(before);
    });

    test('never exchangeable with the sign-in: a valid address proof offered to /auth/cardano/verify is refused, for a sign-in and for a link', async () => {
        const { env, ann, annHex, mint, askPayload, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const text = Buffer.from((await askPayload(minted.signCode, [annHex]).expect(200)).body.payload, 'hex').toString('utf8');
        const proof = signMessage(ann.keys[0], text);
        const signIn = (await request(env.app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: ann.keys[0].rewardAddress }).expect(200)).body;
        const refused = await request(env.app).post('/auth/cardano/verify').send({ nonce: signIn.nonce, ...proof });
        expect([refused.status, refused.body]).toEqual([400, { error: 'INVALID SIGNATURE' }]);
        const link = (await ann.account.post('/auth/cardano/challenge', { purpose: 'link', address: ann.keys[0].rewardAddress }).expect(200)).body;
        const linkRefused = await ann.account.post('/auth/cardano/verify', { nonce: link.nonce, ...proof });
        expect([linkRefused.status, linkRefused.body]).toEqual([400, { error: 'INVALID SIGNATURE' }]);
        // and the proof still does what it is for
        expect((await rowOf(minted.operation.id)).owner_confirmed).toBe(false);
    });

    test('the sign-in verifier refuses a text with the address proof\'s first line, even when it is validly signed; no challenge begins with that line', () => {
        const { ADDRESS_PROOF_HEADLINE, verifySignature } = require('../src/cardano');
        const keys = testKeys();
        const text = `${ADDRESS_PROOF_HEADLINE}\nItem: DARK_WALLS #1`;
        const signed = signMessage(keys, text);
        expect(() => verifySignature({ ...signed, message: text, address: keys.rewardAddress, network: cardano.Networks.preprod })).toThrow(expect.objectContaining({ status: 400, code: 'INVALID SIGNATURE' }));
        const other = 'Item: DARK_WALLS #1';
        expect(verifySignature({ ...signMessage(keys, other), message: other, address: keys.rewardAddress, network: cardano.Networks.preprod })).toBe(`stake:${keys.stakeKeyHashHex}`);
        for (const purpose of cardano.ChallengePurpose) {
            for (const onAnotherDevice of [false, true]) {
                let message;
                try {
                    message = cardano.challengeMessage({ address: keys.rewardAddress, purpose, network: cardano.Networks.preprod, nonce: 'n', issuedAt: new Date(0), expiresAt: new Date(1), onAnotherDevice });
                } catch {
                    continue;
                }
                expect(message.split('\n')[0]).not.toBe(ADDRESS_PROOF_HEADLINE);
                expect(message.startsWith(ADDRESS_PROOF_HEADLINE)).toBe(false);
            }
        }
    });

    test('a witness for the old transaction fails after a rebuild (INVALID WITNESS); one for the new transaction is taken', async () => {
        const { env, ann, annHex, mint, sign, rebuild, rowOf } = await setup({}, { parked: 0 });
        const second = secondAddress(env, ann, 30_000_000);
        // both Ann's own; the richer is the owner
        const { body: minted } = await mint({ addresses: [second.hex, annHex] }).expect(201);
        expect(await rowOf(minted.operation.id)).toMatchObject({ owner_address: second.bech32, owner_confirmed: true });
        const old = walletWitness(minted.tx, [second.paymentKey, ann.keys[0].paymentKey]);
        const rebuilt = (await ok(rebuild(minted.signCode, [annHex]))).body;
        expect(errorOf(await sign(minted.signCode, old))).toEqual([400, 'INVALID WITNESS']);
        expect((await rowOf(minted.operation.id)).state).toBe('prepared');
        await sign(minted.signCode, walletWitness(rebuilt.tx, [ann.keys[0].paymentKey])).expect(200);
        expect(env.double.mempool()).toEqual([(await rowOf(minted.operation.id)).tx_hash]);
    });

    test('a rebuild that wins while the old transaction\'s signature is being co-signed: the signature is 409, nothing is submitted', async () => {
        const { env, ann, annHex, mint, sign, rebuild, rowOf } = await setup({}, { parked: 0 });
        const second = secondAddress(env, ann, 30_000_000);
        const { body: minted } = await mint({ addresses: [second.hex, annHex] }).expect(201);
        const old = walletWitness(minted.tx, [second.paymentKey]);
        const real = ops.markSubmitted;
        let rebuilt;
        jest.spyOn(ops, 'markSubmitted').mockImplementationOnce(async (...args) => {
            rebuilt = await rebuild(minted.signCode, [annHex]);
            return real(...args);
        });
        const submit = jest.spyOn(env.chain.provider, 'submit');
        expect(errorOf(await sign(minted.signCode, old))).toEqual([409, 'OPERATION NOT OPEN']);
        expect(rebuilt.status).toBe(200);
        const row = await rowOf(minted.operation.id);
        expect(row).toMatchObject({ state: 'prepared', owner_address: ann.keys[0].baseAddress, signed_cbor: null });
        expect(submit).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
    });

    test('a cancel that wins while it builds: 409 OPERATION NOT OPEN, the cancelled operation keeps its old transaction', async () => {
        const { ann, annHex, mint, rebuild, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        const real = ops.rebuildPrepared;
        jest.spyOn(ops, 'rebuildPrepared').mockImplementationOnce(async (...args) => {
            await ann.account.del(`/chain/operations/${minted.operation.id}`).expect(200);
            return real(...args);
        });
        expect(errorOf(await rebuild(minted.signCode, [annHex]))).toEqual([409, 'OPERATION NOT OPEN']);
        expect(await rowOf(minted.operation.id)).toMatchObject({ state: 'cancelled', tx_hash: before.tx_hash, owner_address: before.owner_address, owner_confirmed: false });
    });

    test('refusals, nothing changed by any: the shape, NOT YOUR WALLET, no ADA there, a dead or malformed code', async () => {
        const { env, ann, annHex, mint, askPayload, rebuild, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        for (const addresses of [undefined, 'x', [], [42], ['zz'], Array.from({ length: 101 }, () => annHex)]) {
            expect(errorOf(await askPayload(minted.signCode, addresses))).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        }
        expect(errorOf(await askPayload(minted.signCode, [testKeys().baseAddressHex]))).toEqual([400, 'NOT YOUR WALLET']);
        expect(errorOf(await askPayload(minted.signCode, leftOutFor(ann)))).toEqual([400, 'NOT YOUR WALLET']);
        expect(errorOf(await rebuild(minted.signCode, [emptyOwnHex(env, ann)]))).toEqual([400, 'NOT ENOUGH ADA']);
        const query = jest.spyOn(env.pool, 'query');
        for (const code of ['A'.repeat(21), `${'A'.repeat(21)}%E0`]) {
            expect((await askPayload(code, [annHex]).expect(404)).body).toEqual(UNKNOWN);
        }
        expect(query).not.toHaveBeenCalled();
        query.mockRestore();
        expect((await askPayload(crypto.randomBytes(16).toString('base64url'), [annHex]).expect(404)).body).toEqual(UNKNOWN);
        expect(await rowOf(minted.operation.id)).toEqual(before);
    });

    test('a cancelled operation, and one past its window (expired then), is 404 UNKNOWN SIGN CODE', async () => {
        const { env, ann, annHex, mint, askPayload, rowOf } = await setup();
        const first = (await mint().expect(201)).body;
        await ann.account.del(`/chain/operations/${first.operation.id}`).expect(200);
        expect((await askPayload(first.signCode, [annHex]).expect(404)).body).toEqual(UNKNOWN);
        const second = (await mint().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS);
        expect((await askPayload(second.signCode, [annHex]).expect(404)).body).toEqual(UNKNOWN);
        expect(await rowOf(second.operation.id)).toMatchObject({ state: 'expired', error: 'not-signed' });
    });

    test('an operation that is not a mint (plan E\'s burn) is never rebuilt as one: its payload is the burn\'s proof text, a mint\'s proof is refused, the row as it was', async () => {
        const { env, ann, annHex, mint, askPayload, prove, rowOf } = await setup();
        const minted = (await mint().expect(201)).body;
        const mintText = Buffer.from((await askPayload(minted.signCode, [annHex]).expect(200)).body.payload, 'hex').toString('utf8');
        await env.pool.query("UPDATE chain_ops SET kind = 'burn' WHERE id = $1", [minted.operation.id]);
        const before = await rowOf(minted.operation.id);
        const text = Buffer.from((await askPayload(minted.signCode, [annHex]).expect(200)).body.payload, 'hex').toString('utf8');
        expect(cardano.readAddressProof(text)).toMatchObject({ purpose: 'burn', operationId: minted.operation.id });
        expect(cardano.readAddressProof(mintText)).toMatchObject({ purpose: 'mint', operationId: minted.operation.id });
        // Ann's valid signature over the mint's text of this very operation and list
        expect(errorOf(await prove(minted.signCode, [annHex], signMessage(ann.keys[0], mintText)))).toEqual([400, 'INVALID SIGNATURE']);
        expect(errorOf(await prove(minted.signCode, [annHex], signMessage(ann.keys[0], 'any text')))).toEqual([400, 'INVALID SIGNATURE']);
        expect(await rowOf(minted.operation.id)).toEqual(before);
    });

    test('a mint\'s payload is the mint\'s proof; a valid signature over the burn\'s text of this operation and list is refused', async () => {
        const { ann, annHex, mint, askPayload, prove, rowOf } = await setup();
        const minted = (await mint().expect(201)).body;
        const before = await rowOf(minted.operation.id);
        const text = Buffer.from((await askPayload(minted.signCode, [annHex]).expect(200)).body.payload, 'hex').toString('utf8');
        const burnText = cardano.addressProofMessage({ ...cardano.readAddressProof(text), network: cardano.Networks.preprod, addresses: [annHex], purpose: 'burn' });
        expect(cardano.readAddressProof(burnText)).toMatchObject({ purpose: 'burn', operationId: minted.operation.id });
        expect(errorOf(await prove(minted.signCode, [annHex], signMessage(ann.keys[0], burnText)))).toEqual([400, 'INVALID SIGNATURE']);
        expect(await rowOf(minted.operation.id)).toEqual(before);
    });

    test('the pause, the server key and the hop wait apply as at the mint; the match gate and the day\'s limit are not asked again', async () => {
        const { env, ann, annHex, mint, rebuild, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);

        await env.setConfig({ paused: true });
        expect(errorOf(await rebuild(minted.signCode, [annHex]))).toEqual([503, 'CHAIN PAUSED']);
        await env.setConfig({ serverKeys: [testKeys().paymentKeyHashHex] });
        expect(errorOf(await rebuild(minted.signCode, [annHex]))).toEqual([503, 'CHAIN UNAVAILABLE']);
        await env.setConfig({});

        // the wallet was Ben's just before Ann linked it: its items do not count for her yet
        const ben = await createAccount(env.app, { username: 'Ben' });
        const { rows } = await env.pool.query('SELECT linked_at FROM identity_history WHERE subject = $1 AND player_id = $2', [ann.subjects[0], ann.playerId]);
        const linkedAt = new Date(rows[0].linked_at).getTime();
        await env.pool.query('INSERT INTO identity_history (id, subject, player_id, linked_at, unlinked_at) VALUES ($1, $2, $3, $4, $5)', [
            crypto.randomUUID(),
            ann.subjects[0],
            ben.playerId,
            new Date(linkedAt - 2000),
            new Date(linkedAt - 1000),
        ]);
        expect(errorOf(await rebuild(minted.signCode, [annHex]))).toEqual([409, 'WALLET WAITING']);
        expect(await rowOf(minted.operation.id)).toEqual(before);
        await env.pool.query('DELETE FROM identity_history WHERE player_id = $1', [ben.playerId]);

        // no matches any more: the gate was passed at the mint
        await env.pool.query('DELETE FROM track_records WHERE player_id = $1', [ann.playerId]);
        await ok(rebuild(minted.signCode, [annHex]));
    });

    test('a pay: subject: its payment key signs the payload with its enterprise address; then its witness is taken', async () => {
        const env = await createChainApp();
        const { account, keys, subject } = await payPlayer(env);
        const itemId = await env.giveItem(account.playerId, 'DARK_WALLS');
        const minted = (await account.post('/chain/mint', { itemId, subject, fee: 0 }).expect(201)).body;
        expect(minted.operation.ownerConfirmed).toBe(false);
        const signWith = witnessKeys => request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, witnessKeys) });
        expect(errorOf(await signWith([keys.paymentKey]))).toEqual([409, 'ADDRESSES NEEDED']);

        const addresses = [keys.enterpriseAddressHex];
        const asked = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses }).expect(200);
        const text = Buffer.from(asked.body.payload, 'hex').toString('utf8');
        // the stake-key form is no proof for a pay: subject
        const wrong = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses, proof: signMessage(keys, text) });
        expect(errorOf(wrong)).toEqual([400, 'INVALID SIGNATURE']);
        // the wallet signs with the address it has: a base address with that payment key does too
        const fromBase = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses, proof: signMessage(keys, text, { with: 'base' }) }).expect(200);
        expect(fromBase.body).toMatchObject({ ownerConfirmed: true, address: keys.enterpriseAddress });
        const proved = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses, proof: signMessage(keys, text, { with: 'enterprise' }) }).expect(200);
        expect(proved.body).toMatchObject({ ownerConfirmed: true, address: keys.enterpriseAddress });
        // another key's base address is no proof, though it signed this very text
        const strangers = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses, proof: signMessage(testKeys(), text, { with: 'base' }) });
        expect(errorOf(strangers)).toEqual([400, 'INVALID SIGNATURE']);
        await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(proved.body.tx, [keys.paymentKey]) }).expect(200);
        env.block();
        const row = await ops.byId(env.pool, minted.operation.id);
        expect((await env.chain.index.holdersOf([row.asset_name])).map(holder => holder.address)).toEqual([keys.enterpriseAddress]);
    });

    test('limited per address and operation, a knob of its own: a stranger with the code cannot use up the player\'s attempts', async () => {
        const { annHex, mint, askPayload, rebuild } = await setup({ chainRebuildsPerMinute: 3, chainMintsPerMinute: 1000 });
        const { body: minted } = await mint().expect(201);
        for (let i = 0; i < 3; i++) {
            await askPayload(minted.signCode, [annHex]).set('X-Forwarded-For', '203.0.113.9').expect(200);
        }
        expect(errorOf(await askPayload(minted.signCode, [annHex]).set('X-Forwarded-For', '203.0.113.9'))).toEqual([429, 'TOO MANY REQUESTS']);
        // the player's own address: its bucket is untouched (one rebuild is two requests)
        await ok(rebuild(minted.signCode, [annHex]));
        expect(errorOf(await askPayload(minted.signCode, [annHex]))).toEqual([200, undefined]);
        expect(errorOf(await askPayload(minted.signCode, [annHex]))).toEqual([429, 'TOO MANY REQUESTS']);
    });
});

describe('walletAddressesOf and ownAddressesOf', () => {
    const { preprod, mainnet } = cardano.Networks;
    const refusal = fn => {
        try {
            fn();
        } catch (error) {
            return [error instanceof WalletAddressError, error.code];
        }
        return 'no refusal';
    };

    test('on both networks: a Byron address is left out, never an error of the SDK; a list of nothing but left-out ones is NOT_THE_SUBJECTS', () => {
        for (const network of [preprod, mainnet]) {
            const keys = testKeys({ networkId: network.networkId });
            const wallet = walletAddressesOf([...BYRON, keys.baseAddressHex], network);
            expect(ownAddressesOf(wallet, `stake:${keys.stakeKeyHashHex}`).map(({ hex }) => hex)).toEqual([keys.baseAddressHex.toLowerCase()]);
            expect(refusal(() => ownAddressesOf(walletAddressesOf(BYRON, network), `stake:${keys.stakeKeyHashHex}`))).toEqual([true, 'NOT_THE_SUBJECTS']);
        }
    });

    test('a pay: subject keeps the addresses with its payment key (enterprise, base, pointer) and leaves out the rest', () => {
        const keys = testKeys();
        const pointer = PointerAddress.toHex(new PointerAddress.PointerAddress({ networkId: 0, paymentCredential: KeyHash.fromHex(keys.paymentKeyHashHex), pointer: new Pointer.Pointer({ slot: 1, txIndex: 2, certIndex: 3 }) }));
        const wallet = walletAddressesOf([keys.enterpriseAddressHex, keys.baseAddressHex, pointer, keys.rewardAddressHex, testKeys().enterpriseAddressHex, ...BYRON], preprod);
        expect(ownAddressesOf(wallet, `pay:${keys.paymentKeyHashHex}`).map(({ hex }) => hex)).toEqual([keys.enterpriseAddressHex, keys.baseAddressHex, pointer].map(hex => hex.toLowerCase()));
    });

    test('no address at all, or one of another network, is INVALID; nothing but WalletAddressError leaves', () => {
        for (const addresses of [undefined, null, 'x', [], Array.from({ length: 101 }, () => testKeys().baseAddressHex), [42], ['zz'], ['00'], ['ab'.repeat(57)], ['ab'.repeat(200)], [testKeys({ networkId: 1 }).baseAddressHex]]) {
            expect(refusal(() => walletAddressesOf(addresses, preprod))).toEqual([true, 'INVALID']);
        }
        expect(refusal(() => walletAddressesOf([testKeys().baseAddressHex], mainnet))).toEqual([true, 'INVALID']);
    });
});

describe('ops.rebuildPrepared', () => {
    const fieldsOf = row => ({
        ownerKeyHash: 'ee'.repeat(28),
        ownerAddress: row.owner_address,
        requiredKeys: ['ee'.repeat(28)],
        assetName: `${rules.USER_LABEL}${'ef'.repeat(28)}`,
        txHash: 'f0'.repeat(32),
        txCbor: '84a0a0f5f6',
        ttlSlot: 1234,
        networkFee: '400000',
        gameFeeAsset: null,
        gameFee: null,
        deposit: '3000000',
        depositUser: '1100000',
    });

    test('replaces the transaction, the owner, the keys, the asset name, the ttl and the costs in one compare-and-set; the window and the code stay', async () => {
        const { env, mint, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        const rebuilt = await ops.rebuildPrepared(env.pool, before, fieldsOf(before), env.now());
        expect(rebuilt).toEqual({
            ...before,
            owner_key_hash: 'ee'.repeat(28),
            required_keys: JSON.stringify(['ee'.repeat(28)]),
            asset_name: `${rules.USER_LABEL}${'ef'.repeat(28)}`,
            tx_hash: 'f0'.repeat(32),
            tx_cbor: '84a0a0f5f6',
            ttl_slot: 1234,
            network_fee: '400000',
            game_fee_asset: null,
            game_fee: null,
            deposit: '3000000',
            deposit_user: '1100000',
        });
        expect(await ops.byCode(env.pool, minted.signCode)).toEqual(rebuilt);
        // the copy from before names the old transaction: a second rebuild of it changes nothing
        expect(await ops.rebuildPrepared(env.pool, before, { ...fieldsOf(before), txHash: 'f1'.repeat(32) }, env.now())).toBeNull();
        expect(await rowOf(before.id)).toEqual(rebuilt);
    });

    test('nothing once the window is over, nor after a signature or a cancel', async () => {
        const { env, ann, mint, rowOf } = await setup();
        const first = (await mint().expect(201)).body;
        const row = await rowOf(first.operation.id);
        expect(await ops.rebuildPrepared(env.pool, row, fieldsOf(row), new Date(row.sign_until).getTime())).toBeNull();
        await ann.account.del(`/chain/operations/${row.id}`).expect(200);
        expect(await ops.rebuildPrepared(env.pool, row, fieldsOf(row), env.now())).toBeNull();
        const second = await rowOf((await mint().expect(201)).body.operation.id);
        const submitted = await ops.markSubmitted(env.pool, second, { signedCbor: '84a0a0f5f6', now: env.now() });
        expect(submitted.state).toBe('submitted');
        expect(await ops.rebuildPrepared(env.pool, second, fieldsOf(second), env.now())).toBeNull();
        expect(await rowOf(second.id)).toEqual(submitted);
        await expect(ops.rebuildPrepared(env.pool, second, fieldsOf(second))).rejects.toThrow(TypeError);
    });

    test('markSubmitted only takes the transaction the copy names: after a rebuild a signature of the old one is refused', async () => {
        const { env, mint, rowOf } = await setup();
        const { body: minted } = await mint().expect(201);
        const before = await rowOf(minted.operation.id);
        await ops.rebuildPrepared(env.pool, before, fieldsOf(before), env.now());
        expect(await ops.markSubmitted(env.pool, before, { signedCbor: before.tx_cbor, now: env.now() })).toBeNull();
        expect((await rowOf(before.id)).state).toBe('prepared');
    });
});
