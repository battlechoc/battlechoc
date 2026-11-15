// Signing a prepared mint (minting plan D, Task 4): GET /chain/sign/:code shows the sign page (and
// a wallet) what is signed; POST /chain/sign/:code takes the wallet's witness set, checks it
// against the stored transaction with plan B's verifyWitness, signs last with the server key,
// moves the operation to submitted (a compare-and-set) and only then submits to the network.
// Both routes have no session: the sign code alone names the operation. On plan C's chain double
// with the real tx.js, so the double takes (and lands) the real co-signed transaction.

const crypto = require('crypto');
const request = require('supertest');
const { blake2b } = require('@noble/hashes/blake2.js');
const { Address, KeyHash, PrivateKey, Transaction, VKey } = require('@evolution-sdk/evolution');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const tx = require('../src/chain/tx');
const ops = require('../src/chain/ops');
const { ProviderError } = require('../src/chain/provider');
const { closeTestPools } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');
const { testKeys, confirmWith, removeKey } = require('./helpers/cardano');
const { walletWitness } = require('./helpers/chain');
const { createChainApp } = require('./helpers/chainApp');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const WITNESS_MAX = 16 * 1024;
const UNKNOWN = { error: 'UNKNOWN SIGN CODE' };
const errorOf = response => [response.status, response.body.error];
const signersOf = cborHex => (Transaction.fromCBORHex(cborHex).witnessSet.vkeyWitnesses ?? []).map(entry => KeyHash.toHex(KeyHash.fromVKey(entry.vkey))).sort();
const privateHexOf = key => Buffer.from(PrivateKey.toBytes(key.privateKey)).toString('hex');
// what only the co-signed transaction holds: the server's signature (its other bytes are the
// unsigned transaction's and the wallet's)
const serverSignatureOf = (cborHex, keyHash) =>
    Buffer.from(Transaction.fromCBORHex(cborHex).witnessSet.vkeyWitnesses.find(entry => KeyHash.toHex(KeyHash.fromVKey(entry.vkey)) === keyHash).signature.bytes).toString('hex');

/** Ann with 10 verified matches, one wallet of 20 ADA, a DARK_WALLS and a NUT_BRICKS; a mint of the DARK_WALLS prepared. */
const setup = async (options = {}) => {
    const env = await createChainApp(options);
    const ann = await env.player('Ann', { lovelace: [20_000_000], matches: 10, wallets: ['eternl'] });
    const itemId = await env.giveItem(ann.playerId, 'DARK_WALLS');
    const otherItemId = await env.giveItem(ann.playerId, 'NUT_BRICKS');
    // with the wallet's own address, as the game sends it under the session: the owner is vouched for
    const mint = (body = {}) => ann.account.post('/chain/mint', { itemId, subject: ann.subjects[0], fee: 0, addresses: [ann.keys[0].baseAddressHex], ...body });
    const minted = (await mint().expect(201)).body;
    const show = (code = minted.signCode) => request(env.app).get(`/chain/sign/${code}`);
    const sign = (witness, code = minted.signCode) => request(env.app).post(`/chain/sign/${code}`).send({ witness });
    // what Ann's wallet answers to signTx(tx, true)
    const annSigns = (cbor = minted.tx) => walletWitness(cbor, [ann.keys[0].paymentKey]);
    const row = () => ops.byId(env.pool, minted.operation.id);
    return { env, ann, itemId, otherItemId, mint, minted, show, sign, annSigns, row };
};

describe('GET /chain/sign/:code', () => {
    test('without a session: what is signed, for which item, its costs, where the token goes, until when', async () => {
        const { env, ann, minted, show, row } = await setup();
        const op = await row();
        const { body } = await show().expect(200);
        expect(body).toEqual({
            kind: 'mint',
            operationId: minted.operation.id,
            ownerConfirmed: true,
            item: minted.operation.item,
            tx: minted.tx,
            network: env.chain.network.name,
            costs: minted.costs,
            subject: ann.subjects[0],
            // the address the build chose for the token (ownerOf): the wallet's base address, not
            // its reward address
            address: op.owner_address,
            signUntil: minted.operation.signUntil,
        });
        expect(body.address).toBe(ann.keys[0].baseAddress);
        expect(body.network).toBe('preprod');
        // the deposit's two parts (ruling D38): what leaves the wallet, what stays with the token in it
        expect(body.costs.deposits.reference + body.costs.deposits.user).toBe(body.costs.deposit);
        expect(body.costs.deposits.user).toBeGreaterThan(0);
        expect(JSON.stringify(body)).not.toContain(minted.signCode);
    });

    test('a cancelled, used-up, expired or unknown code is one 404 that says nothing more', async () => {
        const { env, ann, minted, show, sign, annSigns, mint } = await setup();
        await ann.account.del(`/chain/operations/${minted.operation.id}`).expect(200);
        expect((await show().expect(404)).body).toEqual(UNKNOWN);

        const second = (await mint().expect(201)).body;
        env.advance(rules.SIGN_WINDOW_MS);
        expect((await show(second.signCode).expect(404)).body).toEqual(UNKNOWN);
        // the window that just passed expired it
        expect(await ops.byId(env.pool, second.operation.id)).toMatchObject({ state: 'expired', error: 'not-signed' });

        const third = (await mint().expect(201)).body;
        await sign(annSigns(third.tx), third.signCode).expect(200);
        expect((await show(third.signCode).expect(404)).body).toEqual(UNKNOWN);

        expect((await show('A'.repeat(22)).expect(404)).body).toEqual(UNKNOWN);
    });

    test('a malformed code (not 22 base64url characters) is the same 404, without asking the database', async () => {
        const { env, show, sign, annSigns } = await setup();
        const query = jest.spyOn(env.pool, 'query');
        for (const code of ['A'.repeat(21), 'A'.repeat(23), `${'A'.repeat(21)}+`, `${'A'.repeat(21)}=`, `${'A'.repeat(21)}.`, '%20'.repeat(22), `${'A'.repeat(21)}%E0`]) {
            expect([await show(code), await sign(annSigns(), code)].map(response => [response.status, response.body])).toEqual([
                [404, UNKNOWN],
                [404, UNKNOWN],
            ]);
        }
        expect(query).not.toHaveBeenCalled();
    });
});

describe('POST /chain/sign/:code', () => {
    test('a good witness: 200 submitted; the co-signed transaction is stored and in the mempool, exactly that one; the code is used up', async () => {
        const { env, ann, minted, show, sign, annSigns, row } = await setup();
        const response = await sign(annSigns()).expect(200);
        const op = await row();
        expect(op).toMatchObject({ state: 'submitted', code_hash: null, submit_error: null });
        expect(new Date(op.submitted_at).getTime()).toBe(env.now());
        expect(new Date(op.last_submit_at).getTime()).toBe(env.now());
        expect(response.body).toEqual({ state: 'submitted', operation: { ...minted.operation, state: 'submitted' } });
        expect(env.double.mempool()).toEqual([op.tx_hash]);
        // Ann's wallet and the server signed it, nobody else
        expect(signersOf(op.signed_cbor)).toEqual([ann.keys[0].paymentKeyHashHex, env.chain.serverKey.keyHash].sort());
        expect(signersOf(op.tx_cbor)).toEqual([]);

        // the answer carries no signed bytes, neither does the operation's view
        expect(JSON.stringify(response.body)).not.toContain(serverSignatureOf(op.signed_cbor, env.chain.serverKey.keyHash));
        const viewed = (await ann.account.get(`/chain/operations/${op.id}`).expect(200)).body;
        expect(JSON.stringify(viewed)).not.toContain(serverSignatureOf(op.signed_cbor, env.chain.serverKey.keyHash));

        expect((await show().expect(404)).body).toEqual(UNKNOWN);
    });

    test('every signature in the stored co-signed transaction verifies over its body\'s hash (the wallet\'s and the server\'s), checked apart from tx.js; a tampered one does not', async () => {
        const { env, ann, sign, annSigns, row } = await setup();
        await sign(annSigns()).expect(200);
        const op = await row();
        const bytes = Buffer.from(op.signed_cbor, 'hex');
        // the hash of the body's bytes as written: what the node verifies the signatures over
        const bodyHash = Buffer.from(blake2b(Transaction.extractBodyBytes(bytes), { dkLen: 32 }));
        expect(bodyHash.toString('hex')).toBe(op.tx_hash);
        // Node's own Ed25519 (OpenSSL), not the SDK's or noble's: a raw key in its SPKI form
        const verifies = (vkey, signature, message) =>
            crypto.verify(null, message, crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(VKey.toBytes(vkey))]), format: 'der', type: 'spki' }), signature);
        const witnesses = Transaction.fromCBORHex(op.signed_cbor).witnessSet.vkeyWitnesses;
        expect(witnesses.map(entry => KeyHash.toHex(KeyHash.fromVKey(entry.vkey))).sort()).toEqual([ann.keys[0].paymentKeyHashHex, env.chain.serverKey.keyHash].sort());
        for (const { vkey, signature } of witnesses) {
            const signed = Buffer.from(signature.bytes);
            expect(verifies(vkey, signed, bodyHash)).toBe(true);
            const tampered = Buffer.from(signed);
            tampered[10] ^= 0x01;
            expect(verifies(vkey, tampered, bodyHash)).toBe(false);
            const otherBody = Buffer.from(bodyHash);
            otherBody[0] ^= 0x01;
            expect(verifies(vkey, signed, otherBody)).toBe(false);
        }
    });

    test('after the next block the transaction is on chain and the token at the owner\'s address: the server\'s signature made a valid transaction', async () => {
        const { env, ann, sign, annSigns, row } = await setup();
        await sign(annSigns()).expect(200);
        const op = await row();
        env.block();
        expect(env.double.mempool()).toEqual([]);
        expect(await env.chain.index.transaction(op.tx_hash)).not.toBeNull();
        expect(await env.chain.index.mintOf(op.asset_name)).toMatchObject({ txHash: op.tx_hash });
        const holders = await env.chain.index.holdersOf([op.asset_name]);
        expect(holders).toHaveLength(1);
        expect(holders[0]).toMatchObject({ address: op.owner_address, txHash: op.tx_hash });
        // and the provider finds it in Ann's wallet
        const held = await env.chain.provider.utxoByUnit(env.chain.policyId + op.asset_name);
        expect(Address.toBech32(held.address)).toBe(ann.keys[0].baseAddress);
    });

    test('a witness by a key that is not required, alone (Ben\'s), is INVALID WITNESS; nothing changes, nothing is submitted, the reason is logged without bytes', async () => {
        const { env, minted, show, sign, row } = await setup();
        const ben = testKeys();
        const witness = walletWitness(minted.tx, [ben.paymentKey]);
        expect((await sign(witness).expect(400)).body).toEqual({ error: 'INVALID WITNESS' });
        expect(await row()).toMatchObject({ state: 'prepared', signed_cbor: null, submitted_at: null });
        expect(env.double.mempool()).toEqual([]);
        await show().expect(200);
        const logged = JSON.stringify(env.chainLog.warn.mock.calls);
        expect(logged).toContain('MISSING_SIGNATURE');
        expect(logged).toContain(minted.operation.id);
        expect(logged).not.toContain(witness);
        expect(logged).not.toContain(minted.tx.slice(0, 64));
        expect(logged).not.toContain(minted.signCode);
    });

    test('a witness over another body (Ann signed the transaction of another item) is INVALID WITNESS; then her right one is taken', async () => {
        const { env, ann, otherItemId, mint, minted, sign, annSigns } = await setup();
        await ann.account.del(`/chain/operations/${minted.operation.id}`).expect(200);
        const other = (await mint({ itemId: otherItemId }).expect(201)).body;
        expect(other.tx).not.toBe(minted.tx);
        expect((await sign(annSigns(minted.tx), other.signCode).expect(400)).body).toEqual({ error: 'INVALID WITNESS' });
        expect((await ops.byId(env.pool, other.operation.id)).state).toBe('prepared');
        expect(JSON.stringify(env.chainLog.warn.mock.calls)).toContain('BAD_WITNESS');
        await sign(annSigns(other.tx), other.signCode).expect(200);
        expect(env.double.mempool()).toEqual([other.operation.txHash]);
    });

    test('a witness set with another key\'s good witness besides Ann\'s: the other is dropped (plan B), the transaction carries Ann\'s and the server\'s only', async () => {
        const { env, ann, minted, sign, row } = await setup();
        const ben = testKeys();
        await sign(walletWitness(minted.tx, [ann.keys[0].paymentKey, ben.paymentKey])).expect(200);
        expect(signersOf((await row()).signed_cbor)).toEqual([ann.keys[0].paymentKeyHashHex, env.chain.serverKey.keyHash].sort());
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
    });

    test('Ann\'s witness beside one that does not verify over this body: INVALID WITNESS', async () => {
        const { minted, ann, sign, row } = await setup();
        const ben = testKeys();
        // one vkey witness each, in a tagged set { 0: 258([…]) }
        const ONE = 'a100d9010281';
        const good = walletWitness(minted.tx, [ann.keys[0].paymentKey]);
        const ben1 = walletWitness(minted.tx, [ben.paymentKey]).slice(ONE.length);
        expect(good.startsWith(ONE)).toBe(true);
        // Ben's signature with its last byte changed (the signature ends the witness)
        const broken = ben1.slice(0, -2) + (ben1.endsWith('00') ? '01' : '00');
        const both = `a100d9010282${good.slice(ONE.length)}${broken}`;
        expect((await sign(both).expect(400)).body).toEqual({ error: 'INVALID WITNESS' });
        expect((await row()).state).toBe('prepared');
    });

    test('the witness\'s shape: a hex string of at most 16 KB, else INVALID REQUEST PARAMETERS; a large body too (not 413, not 500)', async () => {
        const { env, sign, row } = await setup();
        for (const witness of [undefined, null, 42, '', 'zz', 'abc', ['a1'], { a: 1 }, 'a'.repeat(WITNESS_MAX + 2)]) {
            expect(errorOf(await sign(witness))).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        }
        // at the bound it is read: not a witness set
        expect(errorOf(await sign('a'.repeat(WITNESS_MAX)))).toEqual([400, 'INVALID WITNESS']);
        const huge = await request(env.app).post(`/chain/sign/${'A'.repeat(22)}`).set('content-type', 'application/json').send(JSON.stringify({ witness: 'a'.repeat(300 * 1024) }));
        expect(errorOf(huge)).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        expect(errorOf(await request(env.app).post(`/chain/sign/${'A'.repeat(22)}`).set('content-type', 'application/json').send('{"witness":'))).toEqual([400, 'INVALID JSON']);
        expect((await row()).state).toBe('prepared');
        expect(env.double.mempool()).toEqual([]);
    });

    test('the same good witness twice in a row: the second is 404 (the code is used up), one transaction in the mempool', async () => {
        const { env, minted, sign, annSigns } = await setup();
        await sign(annSigns()).expect(200);
        expect((await sign(annSigns()).expect(404)).body).toEqual(UNKNOWN);
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
    });

    test('the same good witness twice at once: one 200, the other 409 OPERATION NOT OPEN or 404; one transaction in the mempool', async () => {
        const { env, minted, sign, annSigns, row } = await setup();
        const answers = await Promise.all([sign(annSigns()), sign(annSigns())]);
        const sorted = answers.map(errorOf).sort();
        expect(sorted[0]).toEqual([200, undefined]);
        expect([[409, 'OPERATION NOT OPEN'], [404, 'UNKNOWN SIGN CODE']]).toContainEqual(sorted[1]);
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
        expect((await row()).state).toBe('submitted');
    });

    test('the second signature loses the compare-and-set: 409 OPERATION NOT OPEN, its bytes are dropped, nothing more is submitted', async () => {
        const { env, minted, sign, annSigns, row } = await setup();
        const real = ops.markSubmitted;
        let second;
        jest.spyOn(ops, 'markSubmitted').mockImplementationOnce(async (...args) => {
            // the other signature wins while this one was co-signing
            second = await sign(annSigns());
            return real(...args);
        });
        const first = await sign(annSigns());
        expect([errorOf(second), errorOf(first)]).toEqual([
            [200, undefined],
            [409, 'OPERATION NOT OPEN'],
        ]);
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
        expect((await row()).state).toBe('submitted');
    });

    test('a cancel and a signature at once: exactly one wins; when the cancel wins nothing is submitted', async () => {
        const { env, ann, minted, sign, annSigns, row } = await setup();
        const results = await Promise.all([ann.account.del(`/chain/operations/${minted.operation.id}`), sign(annSigns())]);
        const op = await row();
        const [cancel, signature] = results.map(response => response.status);
        expect([cancel, signature].filter(status => status === 200)).toHaveLength(1);
        if (cancel === 200) {
            expect(op.state).toBe('cancelled');
            expect(env.double.mempool()).toEqual([]);
        } else {
            expect(op.state).toBe('submitted');
            expect(env.double.mempool()).toEqual([op.tx_hash]);
        }
    });

    test('the cancel wins the compare-and-set while the signature is being co-signed: 409, nothing stored, nothing submitted', async () => {
        const { env, ann, minted, sign, annSigns, row } = await setup();
        const real = ops.markSubmitted;
        let cancelled;
        jest.spyOn(ops, 'markSubmitted').mockImplementationOnce(async (...args) => {
            cancelled = await ann.account.del(`/chain/operations/${minted.operation.id}`);
            return real(...args);
        });
        const submit = jest.spyOn(env.chain.provider, 'submit');
        expect(errorOf(await sign(annSigns()))).toEqual([409, 'OPERATION NOT OPEN']);
        expect(cancelled.status).toBe(200);
        expect(await row()).toMatchObject({ state: 'cancelled', signed_cbor: null });
        expect(submit).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
    });

    test('the signature wins the compare-and-set while the cancel runs: the cancel is 409, the transaction is submitted', async () => {
        const { env, ann, minted, sign, annSigns, row } = await setup();
        const real = ops.cancel;
        let signed;
        jest.spyOn(ops, 'cancel').mockImplementationOnce(async (...args) => {
            signed = await sign(annSigns());
            return real(...args);
        });
        expect(errorOf(await ann.account.del(`/chain/operations/${minted.operation.id}`))).toEqual([409, 'OPERATION NOT OPEN']);
        expect(signed.status).toBe(200);
        expect((await row()).state).toBe('submitted');
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
    });

    test('the sign window: just before its end the signature is taken; at its end 404 and the operation expired', async () => {
        const late = await setup();
        late.env.advance(rules.SIGN_WINDOW_MS - 1);
        await late.sign(late.annSigns()).expect(200);

        const { env, sign, annSigns, row } = await setup();
        env.advance(rules.SIGN_WINDOW_MS);
        expect((await sign(annSigns()).expect(404)).body).toEqual(UNKNOWN);
        expect(await row()).toMatchObject({ state: 'expired', error: 'not-signed', signed_cbor: null });
        expect(env.double.mempool()).toEqual([]);
    });

    test('the provider down at the submit: still 200 submitted, the error recorded for the watcher, the signed transaction kept and good', async () => {
        // the config as the app keeps it (a minute), read when the mint was prepared
        const { env, minted, sign, annSigns, row } = await setup({ configTtlMs: 60_000 });
        env.double.fail({ provider: 'busy' });
        const response = await sign(annSigns()).expect(200);
        expect(response.body).toEqual({ state: 'submitted', operation: { ...minted.operation, state: 'submitted' } });
        const op = await row();
        expect(op.state).toBe('submitted');
        expect(op.submit_error).toMatch(/^busy: /);
        expect(env.double.mempool()).toEqual([]);
        expect(JSON.stringify(env.chainLog.warn.mock.calls)).not.toContain(serverSignatureOf(op.signed_cbor, env.chain.serverKey.keyHash));

        // nothing is lost: what the watcher resubmits lands
        env.double.fail({});
        expect(await env.chain.provider.submit(op.signed_cbor)).toBe(op.tx_hash);
        env.block();
        expect(await env.chain.index.mintOf(op.asset_name)).toMatchObject({ txHash: op.tx_hash });
    });

    test('the network refuses the first submit: 200 submitted, the refusal recorded as one (the route says so, nothing is read from the text)', async () => {
        const { env, sign, annSigns, row } = await setup();
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValueOnce(new ProviderError('rejected', 'BadInputsUTxO', 400));
        await sign(annSigns()).expect(200);
        const op = await row();
        expect(op).toMatchObject({ state: 'submitted', submit_rejected: true });
        expect(op.submit_error).toMatch(/^rejected: BadInputsUTxO/);
        // a failure whose text merely starts like one is no refusal
        const other = await setup();
        jest.spyOn(other.env.chain.provider, 'submit').mockRejectedValueOnce(Object.assign(new Error('BadInputsUTxO'), { code: 'rejected' }));
        await other.sign(other.annSigns()).expect(200);
        expect(await other.row()).toMatchObject({ state: 'submitted', submit_rejected: false, submit_error: 'rejected: BadInputsUTxO' });
    });

    test('a submit that fails with bytes in its reason, or with an error nobody expected: 200 submitted, recorded and logged without the bytes', async () => {
        const { env, sign, annSigns, row } = await setup();
        const bytes = 'ab'.repeat(200);
        jest.spyOn(env.chain.provider, 'submit').mockRejectedValueOnce(new TypeError(`fetch failed for ${bytes}`));
        await sign(annSigns()).expect(200);
        const op = await row();
        expect(op).toMatchObject({ state: 'submitted', submit_error: 'TypeError: fetch failed for <bytes>' });
        const logged = JSON.stringify(env.chainLog.error.mock.calls);
        expect(logged).toContain(op.id);
        expect(logged).not.toContain(bytes.slice(0, 120));
        expect(logged).not.toContain(serverSignatureOf(op.signed_cbor, env.chain.serverKey.keyHash));
    });

    test('the server cannot sign (a fault on our side): CHAIN UNAVAILABLE, logged by its code, nothing stored or submitted', async () => {
        const { env, minted, sign, annSigns, row } = await setup();
        jest.spyOn(tx, 'addServerWitness').mockImplementationOnce(() => {
            throw new tx.ChainTxError('SERVER_ALREADY_SIGNED');
        });
        expect(errorOf(await sign(annSigns()))).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(await row()).toMatchObject({ state: 'prepared', signed_cbor: null });
        expect(env.double.mempool()).toEqual([]);
        expect(env.chainLog.error).toHaveBeenCalledWith('chain: the server could not sign', { operation: minted.operation.id, reason: expect.stringContaining('SERVER_ALREADY_SIGNED') });
    });

    test('the config cannot be read (the provider down, nothing cached): CHAIN UNAVAILABLE, nothing signed, the code still works', async () => {
        const { env, minted, sign, annSigns, row } = await setup();
        env.double.fail({ provider: 'unavailable' });
        expect(errorOf(await sign(annSigns()))).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(await row()).toMatchObject({ state: 'prepared', signed_cbor: null });
        env.double.fail({});
        await sign(annSigns()).expect(200);
        expect(env.double.mempool()).toEqual([minted.operation.txHash]);
    });

    test('the server key no longer in the config: CHAIN UNAVAILABLE, nothing signed or submitted', async () => {
        const { env, sign, annSigns, row } = await setup();
        await env.setConfig({ serverKeys: [testKeys().paymentKeyHashHex] });
        const submit = jest.spyOn(env.chain.provider, 'submit');
        expect(errorOf(await sign(annSigns()))).toEqual([503, 'CHAIN UNAVAILABLE']);
        expect(await row()).toMatchObject({ state: 'prepared', signed_cbor: null });
        expect(submit).not.toHaveBeenCalled();
    });

    test('the server key\'s content and the signed transaction never reach a log line or an answer', async () => {
        const consoleCalls = ['log', 'info', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method));
        const { env, minted, show, sign, annSigns, row } = await setup({ configTtlMs: 60_000 });
        const answers = [];
        answers.push(await show());
        answers.push(await sign(walletWitness(minted.tx, [testKeys().paymentKey])));
        answers.push(await sign('a'.repeat(WITNESS_MAX)));
        env.double.fail({ provider: 'busy' });
        answers.push(await sign(annSigns()));
        env.double.fail({});
        answers.push(await sign(annSigns()));
        const op = await row();
        const secret = privateHexOf(env.chain.serverKey);
        const texts = [
            ...answers.map(response => response.text),
            JSON.stringify(Object.values(env.chainLog).map(fn => fn.mock.calls)),
            JSON.stringify(consoleCalls.map(spy => spy.mock.calls)),
            JSON.stringify(ops.view(op, minted.operation.item, env.now())),
        ];
        for (const text of texts) {
            expect(text).not.toContain(secret);
            expect(text).not.toMatch(/ed25519_sk/);
            expect(text).not.toContain(serverSignatureOf(op.signed_cbor, env.chain.serverKey.keyHash));
        }
        expect(JSON.stringify(env.chain.serverKey)).not.toContain(secret);
    });

    test('rate-limited per address (the routes with a session have buckets of their own); CORS as for the link page', async () => {
        const { env, show, sign, annSigns } = await setup({ chainPerMinute: 3, corsOrigins: ['https://battlechoc.com'] });
        // the mint did not count: it is limited per player, after a looser limit per address
        await show().expect(200);
        await sign('zz').expect(400);
        await show().expect(200);
        expect(errorOf(await sign(annSigns()))).toEqual([429, 'TOO MANY REQUESTS']);
        expect(errorOf(await show())).toEqual([429, 'TOO MANY REQUESTS']);
        env.advance(60_001);

        const preflight = await request(env.app).options(`/chain/sign/${'A'.repeat(22)}`).set('Origin', 'https://battlechoc.com');
        expect(preflight.status).toBe(204);
        expect(preflight.headers['access-control-allow-origin']).toBe('https://battlechoc.com');
        expect(preflight.headers['access-control-allow-methods']).toMatch(/POST/);
        expect(preflight.headers['access-control-allow-headers']).toMatch(/Content-Type/);
        const shown = await show().set('Origin', 'https://battlechoc.com');
        expect(shown.headers['access-control-allow-origin']).toBe('https://battlechoc.com');
    });

    test('CHAIN OFF without the chain features, also for a body over the sign routes\' limit (their parser is not there then)', async () => {
        const { app } = await createTestApp();
        expect((await request(app).get(`/chain/sign/${'A'.repeat(22)}`).expect(404)).body).toEqual({ error: 'CHAIN OFF' });
        expect((await request(app).post(`/chain/sign/${'A'.repeat(22)}`).send({ witness: 'a100' }).expect(404)).body).toEqual({ error: 'CHAIN OFF' });
        const large = await request(app).post(`/chain/sign/${'A'.repeat(22)}`).send({ witness: 'a'.repeat(WITNESS_MAX + 4096) });
        expect([large.status, large.body]).toEqual([404, { error: 'CHAIN OFF' }]);
    });
});

describe('an owner no wallet vouched for (ruling of the review of Task 4b)', () => {
    test('a mint without the wallet\'s addresses: its witness is refused with 409 ADDRESSES NEEDED before it is read; nothing is signed or changed', async () => {
        const { env, ann, mint, minted: first } = await setup();
        await ann.account.del(`/chain/operations/${first.operation.id}`).expect(200);
        const minted = (await mint({ addresses: undefined }).expect(201)).body;
        expect(minted.operation.ownerConfirmed).toBe(false);
        expect((await request(env.app).get(`/chain/sign/${minted.signCode}`).expect(200)).body).toMatchObject({ operationId: minted.operation.id, ownerConfirmed: false });
        const verifyWitness = jest.spyOn(tx, 'verifyWitness');
        const before = await ops.byId(env.pool, minted.operation.id);
        const response = await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [ann.keys[0].paymentKey]) });
        expect([response.status, response.body]).toEqual([409, { error: 'ADDRESSES NEEDED' }]);
        expect(verifyWitness).not.toHaveBeenCalled();
        expect(await ops.byId(env.pool, minted.operation.id)).toEqual(before);
        expect(env.double.mempool()).toEqual([]);
    });
});

describe('hardening (the review of Task 4)', () => {
    test('the sign window is judged when the operation would be stored: a request that waited on the config past the window loses (409), nothing is submitted', async () => {
        const { env, sign, annSigns, row } = await setup();
        const real = env.configReader.get.bind(env.configReader);
        jest.spyOn(env.configReader, 'get').mockImplementation(async () => {
            const contracts = await real();
            env.advance(rules.SIGN_WINDOW_MS);
            return contracts;
        });
        const submit = jest.spyOn(env.chain.provider, 'submit');
        expect(errorOf(await sign(annSigns()))).toEqual([409, 'OPERATION NOT OPEN']);
        expect((await row()).signed_cbor).toBeNull();
        expect(submit).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
    });

    test('a body the parser refuses below 500 (an unknown charset or encoding) is 400 INVALID REQUEST PARAMETERS, never the 500 that logs the whole error', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { env, minted, row } = await setup();
        const send = (headers, body = '{"witness":"a100"}') => {
            const sent = request(env.app).post(`/chain/sign/${minted.signCode}`);
            Object.entries(headers).forEach(([name, value]) => sent.set(name, value));
            return sent.send(body);
        };
        for (const headers of [{ 'content-type': 'application/json; charset=klingon' }, { 'content-type': 'application/json', 'content-encoding': 'bogus' }]) {
            expect(errorOf(await send(headers))).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        }
        const rebuilt = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).set('content-type', 'application/json; charset=klingon').send('{}');
        expect(errorOf(rebuilt)).toEqual([400, 'INVALID REQUEST PARAMETERS']);
        expect(consoleError).not.toHaveBeenCalled();
        expect((await row()).state).toBe('prepared');
    });

    test('what the parser\'s errors become: below 500 INVALID REQUEST PARAMETERS (an aborted body too), broken JSON INVALID JSON, others as they are', () => {
        const { sessionlessBodyError } = require('../src/routes/chain');
        expect(sessionlessBodyError(undefined)).toBeUndefined();
        for (const error of [{ type: 'request.aborted', status: 400 }, { type: 'charset.unsupported', status: 415 }, { type: 'entity.too.large', status: 413 }, { type: 'request.size.invalid', statusCode: 400 }]) {
            expect(sessionlessBodyError(Object.assign(new Error('x'), error))).toMatchObject({ status: 400, code: 'INVALID REQUEST PARAMETERS' });
        }
        const broken = Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed', status: 400 });
        expect(sessionlessBodyError(broken)).toBe(broken);
        const stream = Object.assign(new Error('x'), { type: 'stream.not.readable', status: 500 });
        expect(sessionlessBodyError(stream)).toBe(stream);
    });

    test('GET /chain/sign/:code is never cached', async () => {
        const { show } = await setup();
        expect((await show().expect(200)).headers['cache-control']).toBe('no-store');
    });

    test('the sign routes have a limit per address of their own: readiness polling and neighbours on the session routes do not push them into 429, nor they those', async () => {
        const { env, ann, show } = await setup({ chainPerMinute: 2, chainAddressPerMinute: 3 });
        for (let i = 0; i < 2; i++) {
            await ann.account.get('/chain/readiness').expect(200);
        }
        // the address's limit of the session routes is used up (the mint counted too)
        expect((await ann.account.get('/chain/readiness')).status).toBe(429);
        await show().expect(200);
        await show().expect(200);
        expect((await show()).status).toBe(429);
        env.advance(60_001);
        await ann.account.get('/chain/readiness').expect(200);
    });

    test('a stored row that is corrupt (its body hash, its required keys) is our fault: still INVALID WITNESS, but logged as an error', async () => {
        const { env, minted, sign, annSigns, row } = await setup();
        for (const [column, value, code] of [
            ['tx_hash', 'ab'.repeat(32), 'BODY_CHANGED'],
            ['required_keys', '[]', 'BAD_REQUIRED_WITNESSES'],
        ]) {
            const stored = await row();
            await env.pool.query(`UPDATE chain_ops SET ${column} = $2 WHERE id = $1`, [stored.id, value]);
            expect(errorOf(await sign(annSigns()))).toEqual([400, 'INVALID WITNESS']);
            expect(env.chainLog.error).toHaveBeenLastCalledWith('chain: a stored operation does not hold together', { operation: minted.operation.id, code });
            await env.pool.query(`UPDATE chain_ops SET ${column} = $2 WHERE id = $1`, [stored.id, stored[column]]);
        }
        expect(env.chainLog.warn).not.toHaveBeenCalled();
        expect((await row()).state).toBe('prepared');
    });
});

describe('the wallet unlinked between the mint and the signature (ruling D22)', () => {
    /** Ann with two wallets (the second unfunded), a mint prepared with the first, then the first unlinked. */
    const unlinkedSetup = async () => {
        const env = await createChainApp();
        const ann = await env.player('Ann', { lovelace: [20_000_000, 0], matches: 10, wallets: ['eternl', 'lace'] });
        const itemId = await env.giveItem(ann.playerId, 'DARK_WALLS');
        const minted = (await ann.account.post('/chain/mint', { itemId, subject: ann.subjects[0], fee: 0 }).expect(201)).body;
        const confirmed = await confirmWith(env.app, ann.account, ann.keys[1]);
        expect(confirmed.status).toBe(200);
        await removeKey(env.app, ann.account, ann.subjects[0], confirmed.body.confirmToken).expect(204);
        return { env, ann, minted, row: () => ops.byId(env.pool, minted.operation.id) };
    };

    test('POST /chain/sign/:code: the operation is cancelled, the answer is the 404 of a dead code, nothing is signed or submitted', async () => {
        const { env, ann, minted, row } = await unlinkedSetup();
        const addServerWitness = jest.spyOn(tx, 'addServerWitness');
        const response = await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [ann.keys[0].paymentKey]) });
        expect([response.status, response.body]).toEqual([404, UNKNOWN]);
        expect(await row()).toMatchObject({ state: 'cancelled', error: 'cancelled', signed_cbor: null });
        expect(addServerWitness).not.toHaveBeenCalled();
        expect(env.double.mempool()).toEqual([]);
        expect((await request(env.app).get(`/chain/sign/${minted.signCode}`).expect(404)).body).toEqual(UNKNOWN);
    });

    test('POST /chain/sign/:code/addresses: the same, nothing is built', async () => {
        const { env, ann, minted, row } = await unlinkedSetup();
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        const response = await request(env.app).post(`/chain/sign/${minted.signCode}/addresses`).send({ addresses: [ann.keys[0].baseAddressHex] });
        expect([response.status, response.body]).toEqual([404, UNKNOWN]);
        expect(await row()).toMatchObject({ state: 'cancelled', error: 'cancelled' });
        expect(utxosOf).not.toHaveBeenCalled();
    });

    test('linked to another player since: the same', async () => {
        const { env, ann, minted, row } = await unlinkedSetup();
        const ben = await createAccount(env.app, { username: 'Ben' });
        await env.link(ben, ann.keys[0]);
        const response = await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [ann.keys[0].paymentKey]) });
        expect([response.status, response.body]).toEqual([404, UNKNOWN]);
        expect((await row()).state).toBe('cancelled');
    });
});
