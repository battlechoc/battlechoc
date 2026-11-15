// The chain provider over Koios (CHAIN_PROVIDER_KIND=koios): Koios's REST API read through an
// injected fetch that answers from a table, so no test reaches a network. It answers what the
// Blockfrost adapter answers (chainProvider.test.js; chainProviderContract.test.js compares the
// two on one chain): the Evolution SDK's objects that plan B's tx.js takes, and the same
// ProviderError codes. The answers here are shaped as preprod.koios.rest answered them on
// 2026-11-15 (the extended UTxO fields, the PostgREST error body, epoch_params).

const fs = require('fs');
const path = require('path');
const { Address, Assets, Data, DatumHash, InlineDatum, NativeScripts, PlutusV3, ScriptHash, TransactionHash, UTxO } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { ProviderError, createProvider } = require('../src/chain/provider');
const { addressOfSubjectForFunds } = require('../src/chain/addresses');
const { CONFIG_TOKEN_NAME, ChainConfigError, loadBlueprint } = require('../src/chain/blueprint');
const { fundsCheck, readConfig } = require('../src/chain/tx');
const { testKeys } = require('./helpers/cardano');
const { fixtureContracts, fixtureKey, loadParams, utxo } = require('./helpers/chain');
const { koiosEntry, koiosParamsOf } = require('./helpers/koios');

const { preprod } = cardano.Networks;
const BASE = 'https://preprod.koios.rest/api/v1';
const TOKEN = 'preprodKoiosTokenThatMustNeverShow0123';
const UNIT = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
const txHashOf = n => n.toString(16).padStart(64, '0');
const ORDER = 'order=tx_hash.asc,tx_index.asc';
const page = (route, n) => `POST ${route}?offset=${(n - 1) * 500}&limit=500&${ORDER}`;
const entries = (count, address, from = 0) => Array.from({ length: count }, (_, i) => koiosEntry({ address, txHash: txHashOf(from + i + 1) }));

// A fetch that answers `routes` ({ 'METHOD /path?query': { status, json | text } or a function of
// the request's init }) and records every request with its JSON body read; a route it does not
// know is a test error.
const fakeFetch = routes => {
    const requests = [];
    const fetch = async (url, init = {}) => {
        const method = init.method || 'GET';
        const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
        const json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        requests.push({ url, path, method, headers: init.headers || {}, body: init.body, json, redirect: init.redirect, signal: init.signal });
        const route = routes[`${method} ${path}`];
        if (route === undefined) {
            throw new Error(`the fake fetch has no route for ${method} ${path}`);
        }
        const { status = 200, json: answer, text } = typeof route === 'function' ? await route(init) : route;
        const body = text !== undefined ? text : JSON.stringify(answer);
        return { status, ok: status >= 200 && status < 300, text: async () => body };
    };
    return { fetch, requests };
};

const fakeLog = () => {
    const lines = [];
    const line = level => (...args) => lines.push(`${level}: ${args.join(' ')}`);
    return { lines, log: line('log'), info: line('info'), warn: line('warn'), error: line('error') };
};

const providerWith = (routes, options = {}) => {
    const { fetch, requests } = fakeFetch(routes);
    const log = options.log || fakeLog();
    const provider = createProvider({ kind: 'koios', url: BASE, network: preprod, fetch, log, ...options });
    return { provider, requests, log };
};

const failureOf = async promise => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('resolved, but a failure was expected');
};

const headerOf = (request, name) => Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1];

describe('createProvider chooses the kind', () => {
    test('koios and blockfrost; anything else is a TypeError', () => {
        for (const kind of ['koios', 'blockfrost']) {
            expect(Object.keys(createProvider({ kind, url: BASE, key: TOKEN, network: preprod, fetch: async () => undefined })).sort()).toEqual(
                ['evaluate', 'protocolParameters', 'submit', 'tip', 'utxoByRef', 'utxoByUnit', 'utxosAt', 'utxosOf'].sort()
            );
        }
        for (const kind of [undefined, '', 'Koios', 'maestro']) {
            expect(() => createProvider({ kind, url: BASE, network: preprod })).toThrow(TypeError);
        }
    });
});

describe('utxosOf', () => {
    const keys = testKeys();
    const accountPage = n => page('/account_utxos', n);

    test('a stake key: the UTxOs of its account, extended, as SDK UTxOs; without a token no authorization header', async () => {
        const { provider, requests } = providerWith({ [accountPage(1)]: { json: [koiosEntry({ address: keys.baseAddress, tokens: { [UNIT]: '1' } })] } });
        const [found, ...rest] = await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(rest).toEqual([]);
        expect(requests.map(request => request.url)).toEqual([`${BASE}/account_utxos?offset=0&limit=500&${ORDER}`]);
        expect(requests[0].json).toEqual({ _stake_addresses: [keys.rewardAddress], _extended: true });
        expect(headerOf(requests[0], 'content-type')).toBe('application/json');
        expect(headerOf(requests[0], 'authorization')).toBeUndefined();
        // no redirect is followed: it would carry a token elsewhere
        expect(requests[0].redirect).toBe('error');
        expect(found).toBeInstanceOf(UTxO.UTxO);
        expect(Assets.lovelaceOf(found.assets)).toBe(5_000_000n);
        expect(Assets.getByUnit(found.assets, UNIT)).toBe(1n);
        expect(TransactionHash.toHex(found.transactionId)).toBe(txHashOf(1));
        expect(found.index).toBe(0n);
        expect(Address.toBech32(found.address)).toBe(keys.baseAddress);
        expect(found.datumOption).toBeUndefined();
        expect(found.scriptRef).toBeUndefined();
    });

    test('with a token (a paid tier): Authorization: Bearer on every request', async () => {
        const { provider, requests } = providerWith({ [accountPage(1)]: { json: [] } }, { key: TOKEN });
        await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(headerOf(requests[0], 'authorization')).toBe(`Bearer ${TOKEN}`);
        expect(requests[0].url).not.toContain(TOKEN);
    });

    test('pages of 500 until a shorter one: 500 and 3 are 503 UTxOs in two requests', async () => {
        const { provider, requests } = providerWith({
            [accountPage(1)]: { json: entries(500, keys.baseAddress) },
            [accountPage(2)]: { json: entries(3, keys.baseAddress, 500) },
        });
        expect(await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`)).toHaveLength(503);
        expect(requests.map(request => request.path)).toEqual([accountPage(1), accountPage(2)].map(route => route.slice('POST '.length)));
    });

    test('at most 2 pages: the first 1000 UTxOs, one warning, page 3 is never asked', async () => {
        const log = fakeLog();
        const { provider, requests } = providerWith(
            Object.fromEntries([1, 2, 3].map(n => [accountPage(n), { json: entries(500, keys.baseAddress, (n - 1) * 500) }])),
            { log }
        );
        expect(await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`)).toHaveLength(1000);
        expect(requests).toHaveLength(2);
        expect(log.lines.filter(line => line.startsWith('warn: '))).toEqual(['warn: chain provider utxosOf: more than 1000 UTxOs, only the first 1000 are read']);
        expect(log.lines.join('\n')).not.toContain(keys.rewardAddress);
    });

    test('a payment key: the UTxOs at its enterprise address', async () => {
        const { provider, requests } = providerWith({ [page('/address_utxos', 1)]: { json: [koiosEntry({ address: keys.enterpriseAddress, lovelace: '7000000' })] } });
        const [found] = await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`);
        expect(requests[0].json).toEqual({ _addresses: [keys.enterpriseAddress], _extended: true });
        expect(keys.enterpriseAddress).toMatch(/^addr_test1v/);
        expect(Assets.lovelaceOf(found.assets)).toBe(7_000_000n);
    });

    test('an account or address the chain has never seen: Koios answers [], no UTxOs; an entry marked spent is none', async () => {
        const { provider } = providerWith({
            [accountPage(1)]: { json: [] },
            [page('/address_utxos', 1)]: { json: [koiosEntry({ address: keys.enterpriseAddress, isSpent: true }), koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(2) })] },
        });
        expect(await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`)).toEqual([]);
        expect((await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`)).map(found => TransactionHash.toHex(found.transactionId))).toEqual([txHashOf(2)]);
    });

    test('a 404 is no "nothing found" (Koios answers [] for that) but a wrong URL: unavailable', async () => {
        const { provider } = providerWith({ [accountPage(1)]: { status: 404, text: '' } });
        expect(await failureOf(provider.utxosOf(`stake:${keys.stakeKeyHashHex}`))).toMatchObject({ name: 'ProviderError', code: 'unavailable', status: 404 });
    });
});

describe('the datum and the reference script of a UTxO', () => {
    const keys = testKeys();
    const { items } = fixtureContracts();
    const scriptHash = ScriptHash.toHex(ScriptHash.fromScript(items.script));
    const scriptHex = Buffer.from(items.script.bytes).toString('hex');
    const datum = Data.constr(0n, [42n, Data.bytearray('beef')]);
    const route = page('/address_utxos', 1);
    const plutus = { hash: scriptHash, size: scriptHex.length / 2, type: 'plutusV3', bytes: scriptHex, value: null };
    const ask = async answer => providerWith({ [route]: { json: answer } }).provider.utxosOf(`pay:${keys.paymentKeyHashHex}`);

    test('an inline datum (its hash beside it, as Koios sends it), a datum hash and a reference script come back as the SDK holds them', async () => {
        const [inline, hashed, withScript, again] = await ask([
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(1), inlineDatum: Data.toCBORHex(datum), dataHash: 'ab'.repeat(32) }),
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(2), dataHash: 'da'.repeat(32) }),
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(3), referenceScript: plutus }),
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(4), referenceScript: plutus }),
        ]);
        expect(inline.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(Data.toCBORHex(inline.datumOption.data)).toBe(Data.toCBORHex(datum));
        expect(DatumHash.isDatumHash(hashed.datumOption)).toBe(true);
        expect(withScript.scriptRef).toBeInstanceOf(PlutusV3.PlutusV3);
        expect(ScriptHash.toHex(ScriptHash.fromScript(withScript.scriptRef))).toBe(scriptHash);
        expect(again.scriptRef).toEqual(withScript.scriptRef);
    });

    test('a native reference script: from its CBOR, or from the JSON Koios gives when it has no bytes ("timelock" and "multisig")', async () => {
        const native = NativeScripts.fromCBORHex('8201828200581c' + keys.paymentKeyHashHex + '8205190400');
        const nativeHash = ScriptHash.toHex(ScriptHash.fromScript(native));
        const json = NativeScripts.toJSON(native.script);
        expect(json).toEqual({ type: 'all', scripts: [{ type: 'sig', keyHash: keys.paymentKeyHashHex }, { type: 'before', slot: 1024 }] });
        const found = await ask([
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(1), referenceScript: { hash: nativeHash, type: 'timelock', bytes: NativeScripts.toCBORHex(native), value: null } }),
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(2), referenceScript: { hash: nativeHash, type: 'timelock', bytes: null, value: json } }),
            koiosEntry({ address: keys.enterpriseAddress, txHash: txHashOf(3), referenceScript: { hash: nativeHash, type: 'multisig', bytes: null, value: json } }),
        ]);
        found.forEach(entry => expect(ScriptHash.toHex(ScriptHash.fromScript(entry.scriptRef))).toBe(nativeHash));
        // the other kinds, nested: [atLeast 1 [after 7, any [sig]]]
        const nested = NativeScripts.fromCBORHex('830301828204078202818200581c' + keys.stakeKeyHashHex);
        const atLeast = { type: 'atLeast', required: 1, scripts: [{ type: 'after', slot: 7 }, { type: 'any', scripts: [{ type: 'sig', keyHash: keys.stakeKeyHashHex }] }] };
        expect(NativeScripts.toJSON(nested.script)).toEqual(atLeast);
        const nestedHash = ScriptHash.toHex(ScriptHash.fromScript(nested));
        const [fromJson] = await ask([koiosEntry({ address: keys.enterpriseAddress, referenceScript: { hash: nestedHash, type: 'timelock', bytes: null, value: atLeast } })]);
        expect(ScriptHash.toHex(ScriptHash.fromScript(fromJson.scriptRef))).toBe(nestedHash);
    });

    test('a reference script that is not what its hash says, of a type nobody knows, or without its bytes: unavailable, never a UTxO without its script', async () => {
        for (const referenceScript of [
            { ...plutus, hash: 'ee'.repeat(28) },
            { ...plutus, type: 'plutusV9' },
            { ...plutus, bytes: null },
            { ...plutus, hash: null },
            { hash: scriptHash, type: 'timelock', bytes: null, value: { type: 'sig', keyHash: 'nothex' } },
        ]) {
            expect(await failureOf(ask([koiosEntry({ address: keys.enterpriseAddress, referenceScript })]))).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
    });

    test('an inline datum without its bytes (a call without _extended): unavailable, never read as a datum hash', async () => {
        const entry = { ...koiosEntry({ address: keys.enterpriseAddress, dataHash: 'ab'.repeat(32) }), inline_datum: { bytes: null, value: { int: 42 } } };
        expect(await failureOf(ask([entry]))).toMatchObject({ code: 'unavailable' });
    });
});

describe('utxosAt', () => {
    const keys = testKeys();
    const holding = `asset_list=cs.${encodeURIComponent(JSON.stringify([{ policy_id: UNIT.slice(0, 56), asset_name: UNIT.slice(56) }]))}`;

    test('the UTxOs at an address, or those of them that hold an asset (asked of Koios, and checked here)', async () => {
        const { provider, requests } = providerWith({
            [page('/address_utxos', 1)]: { json: entries(2, keys.baseAddress) },
            [`${page('/address_utxos', 1)}&${holding}`]: { json: [koiosEntry({ address: keys.baseAddress, tokens: { [UNIT]: '3' } }), koiosEntry({ address: keys.baseAddress, txHash: txHashOf(9) })] },
        });
        expect(await provider.utxosAt(keys.baseAddress)).toHaveLength(2);
        const found = await provider.utxosAt(keys.baseAddress, { asset: UNIT });
        // an instance that ignored the filter would answer the other UTxO too
        expect(found).toHaveLength(1);
        expect(Assets.getByUnit(found[0].assets, UNIT)).toBe(3n);
        expect(requests.map(request => request.json)).toEqual([
            { _addresses: [keys.baseAddress], _extended: true },
            { _addresses: [keys.baseAddress], _extended: true },
        ]);
    });
});

describe('utxoByRef', () => {
    const keys = testKeys();
    const hash = txHashOf(77);
    const answer = (...found) => ({ json: found });

    test('found: the unspent output of that transaction with that index, in one request', async () => {
        const { provider, requests } = providerWith({
            'POST /utxo_info': answer(koiosEntry({ address: keys.baseAddress, txHash: hash, index: 1, lovelace: '2000000' })),
        });
        const found = await provider.utxoByRef(`${hash}#1`);
        expect(requests.map(request => request.json)).toEqual([{ _utxo_refs: [`${hash}#1`], _extended: true }]);
        expect(found).toBeInstanceOf(UTxO.UTxO);
        expect(TransactionHash.toHex(found.transactionId)).toBe(hash);
        expect(found.index).toBe(1n);
        expect(Assets.lovelaceOf(found.assets)).toBe(2_000_000n);
    });

    test('not found: an unknown output ([]), an answer for another output, a spent output; no request for a malformed reference', async () => {
        const { provider: unknown } = providerWith({ 'POST /utxo_info': answer() });
        expect(await unknown.utxoByRef(`${hash}#0`)).toBeUndefined();
        const { provider: other } = providerWith({ 'POST /utxo_info': answer(koiosEntry({ address: keys.baseAddress, txHash: hash, index: 2 })) });
        expect(await other.utxoByRef(`${hash}#0`)).toBeUndefined();
        const { provider, requests } = providerWith({ 'POST /utxo_info': answer(koiosEntry({ address: keys.baseAddress, txHash: hash, index: 0, isSpent: true })) });
        expect(await provider.utxoByRef(`${hash}#0`)).toBeUndefined();
        expect(requests).toHaveLength(1);
        for (const ref of [`${hash}`, `${hash}#x`, `${hash.slice(2)}#0`, '../../submittx#0', null]) {
            expect(await provider.utxoByRef(ref)).toBeUndefined();
        }
        expect(requests).toHaveLength(1);
    });

    test('an output without is_spent (a server that does not say whether it is spent): unavailable, never taken as unspent', async () => {
        const { is_spent: dropped, ...silent } = koiosEntry({ address: keys.baseAddress, txHash: hash });
        expect(dropped).toBe(false);
        const { provider } = providerWith({ 'POST /utxo_info': answer(silent) });
        expect(await failureOf(provider.utxoByRef(`${hash}#0`))).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
    });

    test('a provider failure is a ProviderError', async () => {
        const { provider } = providerWith({ 'POST /utxo_info': { status: 503, text: 'Service Unavailable' } });
        expect(await failureOf(provider.utxoByRef(`${hash}#0`))).toMatchObject({ name: 'ProviderError', code: 'unavailable', status: 503 });
    });
});

describe('utxoByUnit', () => {
    const keys = testKeys();
    const unit = 'a7'.repeat(28) + '000de140' + 'cd'.repeat(28);
    const route = `POST /asset_utxos?is_spent=eq.false&limit=1&${ORDER}`;

    test('found: the unspent UTxO that holds the unit, in one request', async () => {
        const { provider, requests } = providerWith({ [route]: { json: [koiosEntry({ address: keys.baseAddress, tokens: { [unit]: '1' } })] } });
        const found = await provider.utxoByUnit(unit);
        expect(requests.map(request => request.json)).toEqual([{ _asset_list: [[unit.slice(0, 56), unit.slice(56)]], _extended: true }]);
        expect(Assets.getByUnit(found.assets, unit)).toBe(1n);
        expect(Address.toBech32(found.address)).toBe(keys.baseAddress);
    });

    test('not found: an asset nobody holds ([], also for one never minted), an answer marked spent; no request for a malformed unit', async () => {
        const { provider: nobody } = providerWith({ [route]: { json: [] } });
        expect(await nobody.utxoByUnit(unit)).toBeUndefined();
        const { provider: spent } = providerWith({ [route]: { json: [koiosEntry({ address: keys.baseAddress, tokens: { [unit]: '1' }, isSpent: true })] } });
        expect(await spent.utxoByUnit(unit)).toBeUndefined();
        const { provider: strict, requests } = providerWith({});
        for (const bad of ['a7'.repeat(27), `${unit}/../x`, unit.toUpperCase(), null]) {
            expect(await strict.utxoByUnit(bad)).toBeUndefined();
        }
        expect(requests).toHaveLength(0);
    });

    test('an answer whose UTxO does not hold the unit is a provider that answers wrongly: ProviderError unavailable', async () => {
        const other = 'a7'.repeat(28) + '000de140' + 'ef'.repeat(28);
        for (const tokens of [{}, { [other]: '1' }, { [unit]: '0' }]) {
            const { provider } = providerWith({ [route]: { json: [koiosEntry({ address: keys.baseAddress, tokens })] } });
            expect(await failureOf(provider.utxoByUnit(unit))).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
    });

    test('a provider failure is a ProviderError: 429 is busy', async () => {
        const { provider } = providerWith({ [route]: { status: 429, text: '' } });
        expect(await failureOf(provider.utxoByUnit(unit))).toMatchObject({ name: 'ProviderError', code: 'busy', status: 429 });
    });
});

describe('submit and evaluate', () => {
    const cbor = '84a300d9010281825820' + 'ab'.repeat(32);
    const hash = txHashOf(5);
    // what cardano-submit-api (behind Koios's /submittx) answers for a transaction the node refuses
    const submitApiRefusal = reason => ({
        status: 400,
        json: { tag: 'TxSubmitFail', contents: { tag: 'TxCmdTxSubmitValidationError', contents: { tag: 'TxValidationErrorInCardanoMode', contents: { kind: 'ShelleyTxValidationError', error: [reason], era: 'ShelleyBasedEraConway' } } } },
    });

    test('submit posts the bytes as application/cbor and resolves with the transaction hash (202, JSON or plain text)', async () => {
        const { provider, requests } = providerWith({ 'POST /submittx': { status: 202, json: hash } }, { key: TOKEN });
        expect(await provider.submit(cbor)).toBe(hash);
        expect(requests[0].method).toBe('POST');
        expect(headerOf(requests[0], 'content-type')).toBe('application/cbor');
        expect(headerOf(requests[0], 'authorization')).toBe(`Bearer ${TOKEN}`);
        expect(Buffer.from(requests[0].body).equals(Buffer.from(cbor, 'hex'))).toBe(true);
        const { provider: plain } = providerWith({ 'POST /submittx': { status: 202, text: `${hash}\n` } });
        expect(await plain.submit(cbor)).toBe(hash);
        const { provider: strange } = providerWith({ 'POST /submittx': { status: 202, text: 'accepted' } });
        expect(await failureOf(strange.submit(cbor))).toMatchObject({ code: 'unavailable' });
    });

    test("a refused transaction (400): rejected, with the node's reason, at most 300 characters", async () => {
        const { provider } = providerWith({ 'POST /submittx': submitApiRefusal('ConwayUtxowFailure (UtxoFailure (BadInputsUTxO (fromList [TxIn …])))') });
        const error = await failureOf(provider.submit(cbor));
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({ code: 'rejected', status: 400 });
        expect(error.message).toContain('BadInputsUTxO');
        const { provider: long } = providerWith({ 'POST /submittx': submitApiRefusal(`ValueNotConservedUTxO ${'x'.repeat(1000)}`) });
        expect((await failureOf(long.submit(cbor))).message.length).toBeLessThanOrEqual(300);
    });

    test("a body too large for the tier (413) is no refusal by the network: unavailable, naming the provider's request limit and CHAIN_PROVIDER_KEY, logged once an hour", async () => {
        let clock = 1_000_000;
        const log = fakeLog();
        const { fetch } = fakeFetch({ 'POST /submittx': { status: 413, text: 'Payload Too Large' }, 'POST /ogmios': { status: 413, text: '' } });
        const provider = createProvider({ kind: 'koios', url: BASE, key: TOKEN, network: preprod, fetch, log, now: () => clock });
        const errors = [await failureOf(provider.submit(cbor)), await failureOf(provider.evaluate(cbor))];
        errors.forEach(error => {
            expect(error).toMatchObject({ name: 'ProviderError', code: 'unavailable', status: 413 });
            expect(error.message).toMatch(/request size limit/);
            expect(error.message).toMatch(/CHAIN_PROVIDER_KEY/);
            expect(error.message).not.toContain(TOKEN);
        });
        expect(log.lines).toEqual([expect.stringMatching(/^warn: chain provider refused a request for its size \(413\): .*CHAIN_PROVIDER_KEY/)]);
        clock += 61 * 60 * 1000;
        await failureOf(provider.submit(cbor));
        expect(log.lines).toHaveLength(2);
        expect(log.lines.join('\n')).not.toContain(TOKEN);
    });

    test('evaluate asks Ogmios through /ogmios and lists the execution units of each redeemer, as the Blockfrost adapter names them', async () => {
        const { provider, requests } = providerWith({
            'POST /ogmios': {
                json: {
                    jsonrpc: '2.0',
                    method: 'evaluateTransaction',
                    result: [
                        { validator: { index: 1, purpose: 'spend' }, budget: { memory: 1700, cpu: 476468 } },
                        { validator: { index: 0, purpose: 'mint' }, budget: { memory: 2200, cpu: 600000 } },
                        { validator: { index: 0, purpose: 'publish' }, budget: { memory: 1, cpu: 2 } },
                        { validator: { index: 0, purpose: 'withdraw' }, budget: { memory: 3, cpu: 4 } },
                    ],
                    id: null,
                },
            },
        });
        expect(await provider.evaluate(cbor)).toEqual([
            { tag: 'spend', index: 1, memory: 1700, steps: 476468 },
            { tag: 'mint', index: 0, memory: 2200, steps: 600000 },
            { tag: 'certificate', index: 0, memory: 1, steps: 2 },
            { tag: 'withdrawal', index: 0, memory: 3, steps: 4 },
        ]);
        expect(headerOf(requests[0], 'content-type')).toBe('application/json');
        expect(requests[0].json).toEqual({ jsonrpc: '2.0', method: 'evaluateTransaction', params: { transaction: { cbor } }, id: null });
    });

    test('evaluate: a script that fails (an Ogmios error, with 200 or 400), or a 400 of Koios, is rejected', async () => {
        const failure = { jsonrpc: '2.0', method: 'evaluateTransaction', error: { code: 3010, message: 'Some scripts of the transactions terminated with error(s).', data: [{ validator: { index: 0, purpose: 'mint' }, error: { code: 3012, message: 'the items validator said no' } }] }, id: null };
        for (const status of [200, 400]) {
            const { provider } = providerWith({ 'POST /ogmios': { status, json: failure } });
            const error = await failureOf(provider.evaluate(cbor));
            expect(error).toMatchObject({ code: 'rejected' });
            expect(error.message).toContain('the items validator said no');
        }
        const { provider: refused } = providerWith({ 'POST /ogmios': { status: 400, json: { code: '22P02', details: null, hint: null, message: 'Deserialisation failure' } } });
        expect(await failureOf(refused.evaluate(cbor))).toMatchObject({ code: 'rejected', status: 400, message: 'Deserialisation failure' });
        const { provider: empty } = providerWith({ 'POST /ogmios': { json: { jsonrpc: '2.0', id: null } } });
        expect(await failureOf(empty.evaluate(cbor))).toMatchObject({ code: 'unavailable' });
    });
});

describe('failures', () => {
    const keys = testKeys();
    const route = page('/address_utxos', 1);
    const askWith = (answer, options) => {
        const { provider, log } = providerWith({ [route]: answer }, options);
        return { failure: failureOf(provider.utxosOf(`pay:${keys.paymentKeyHashHex}`)), log, provider };
    };

    test('429: busy; 5xx (504 is Koios\'s query timeout): unavailable; a 400 of a read is no refusal of a transaction', async () => {
        expect(await askWith({ status: 429, text: '' }).failure).toMatchObject({ code: 'busy', status: 429 });
        expect(await askWith({ status: 504, text: '<html>Gateway Time-out</html>' }).failure).toMatchObject({ code: 'unavailable', status: 504 });
        expect(await askWith({ status: 500, json: {} }).failure).toMatchObject({ code: 'unavailable', status: 500 });
        // as preprod.koios.rest answers a malformed request
        const malformed = { status: 400, json: { code: '22P02', details: 'Array value must start with "{" or dimension information.', hint: null, message: 'malformed array literal: "not a list"' } };
        expect(await askWith(malformed).failure).toMatchObject({ code: 'unavailable', status: 400 });
    });

    test('no answer within timeoutMs, a network error, or an answer that is not a list of UTxOs: unavailable', async () => {
        const never = init => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
        const started = Date.now();
        expect(await askWith(never, { timeoutMs: 50 }).failure).toMatchObject({ code: 'unavailable', status: null });
        expect(Date.now() - started).toBeLessThan(5000);
        const unreachable = () => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }));
        expect(await askWith(unreachable).failure).toMatchObject({ code: 'unavailable', status: null });
        expect(await askWith({ text: '{"not json' }).failure).toMatchObject({ code: 'unavailable' });
        expect(await askWith({ json: { not: 'a list' } }).failure).toMatchObject({ code: 'unavailable' });
        expect(await askWith({ json: [{ tx_hash: 'zz', tx_index: 0 }] }).failure).toMatchObject({ code: 'unavailable' });
    });

    test('401: unauthorized, logged once an hour, and the token is in no message and no log line', async () => {
        let clock = 1_000_000;
        const log = fakeLog();
        const { fetch } = fakeFetch({ [route]: { status: 401, json: { message: `invalid token ${TOKEN}` } } });
        const provider = createProvider({ kind: 'koios', url: BASE, key: TOKEN, network: preprod, fetch, log, now: () => clock });
        const ask = () => failureOf(provider.utxosOf(`pay:${keys.paymentKeyHashHex}`));
        const errors = [await ask(), await ask()];
        clock += 30 * 60 * 1000;
        errors.push(await ask());
        expect(log.lines).toEqual(['error: chain provider refused the key']);
        clock += 31 * 60 * 1000;
        errors.push(await ask());
        expect(log.lines).toEqual(['error: chain provider refused the key', 'error: chain provider refused the key']);
        errors.forEach(error => expect(error).toMatchObject({ name: 'ProviderError', code: 'unauthorized', status: 401 }));
        const { provider: echoing } = providerWith({ 'POST /submittx': { status: 400, text: `bad ${TOKEN}` } }, { key: TOKEN });
        // a reason cut at 300 characters right through the token: no part of it is left
        const { provider: cutting } = providerWith({ 'POST /submittx': { status: 400, json: { message: `${'x'.repeat(290)}${TOKEN}` } } }, { key: TOKEN });
        const cut = await failureOf(cutting.submit('00'));
        expect(cut.message).not.toContain(TOKEN.slice(0, 10));
        errors.push(await failureOf(echoing.submit('00')), cut, await askWith({ status: 502, text: TOKEN }, { key: TOKEN }).failure);
        errors.forEach(error => {
            expect(error.message).not.toContain(TOKEN);
            expect(String(error.stack)).not.toContain(TOKEN);
            expect(JSON.stringify(error)).not.toContain(TOKEN);
        });
        expect(log.lines.join('\n')).not.toContain(TOKEN);
    });
});

describe('protocolParameters and tip', () => {
    const route = 'GET /epoch_params?limit=1&order=epoch_no.desc';

    test("the parameters of the latest epoch are those tx.js builds with (the SDK's ProtocolParameters)", async () => {
        const { provider } = providerWith({ [route]: { json: [koiosParamsOf(loadParams())] } });
        expect(await provider.protocolParameters()).toEqual(loadParams());
    });

    test('what preprod.koios.rest answered on 2026-11-15 (test/fixtures/chain/koios-epoch-params.json): the parameters the builder tests use', async () => {
        const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'chain', 'koios-epoch-params.json'), 'utf8'));
        const { provider } = providerWith({ [route]: { json: recorded } });
        expect(await provider.protocolParameters()).toEqual(loadParams());
    });

    test('a field the builder reads that is missing, null or not a number, or a missing cost model: unavailable, never a 0 or {}', async () => {
        const whole = koiosParamsOf(loadParams());
        const fields = ['min_fee_a', 'min_fee_b', 'max_tx_size', 'max_val_size', 'key_deposit', 'pool_deposit', 'price_mem', 'price_step', 'max_tx_ex_mem', 'max_tx_ex_steps', 'coins_per_utxo_size', 'collateral_percent', 'max_collateral_inputs', 'min_fee_ref_script_cost_per_byte'];
        const broken = [
            ...fields.flatMap(field => [{ ...whole, [field]: undefined }, { ...whole, [field]: null }, { ...whole, [field]: 'many' }]),
            ...['PlutusV1', 'PlutusV2', 'PlutusV3'].flatMap(language => [{ ...whole, cost_models: { ...whole.cost_models, [language]: undefined } }, { ...whole, cost_models: { ...whole.cost_models, [language]: [] } }, { ...whole, cost_models: { ...whole.cost_models, [language]: ['x'] } }]),
            { ...whole, cost_models: null },
        ];
        for (const params of broken) {
            const { provider } = providerWith({ [route]: { json: [params] } });
            expect(await failureOf(provider.protocolParameters())).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
        // the governance deposits the builder does not read may be missing
        const { drep_deposit, gov_action_deposit, ...withoutDeposits } = whole;
        expect([drep_deposit, gov_action_deposit].every(Boolean)).toBe(true);
        const { provider } = providerWith({ [route]: { json: [withoutDeposits] } });
        expect(await provider.protocolParameters()).toMatchObject({ drepDeposit: 0n, govActionDeposit: 0n });
    });

    test('an answer that is no list of epochs is unavailable', async () => {
        for (const json of [{ not: 'a list' }, 'text', null]) {
            const { provider } = providerWith({ [route]: { json } });
            expect(await failureOf(provider.protocolParameters())).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
    });

    test('cost models as named maps are read too; no epoch at all is unavailable', async () => {
        const named = { ...koiosParamsOf(loadParams()), cost_models: { PlutusV1: { a: 1, b: 2 }, PlutusV2: { a: 3 }, PlutusV3: { c: 4 } } };
        const { provider } = providerWith({ [route]: { json: [named] } });
        expect((await provider.protocolParameters()).costModels).toEqual({ PlutusV1: { a: 1, b: 2 }, PlutusV2: { a: 3 }, PlutusV3: { c: 4 } });
        const { provider: none } = providerWith({ [route]: { json: [] } });
        expect(await failureOf(none.protocolParameters())).toMatchObject({ code: 'unavailable' });
    });

    test('cached for 10 minutes; a failed read is not cached', async () => {
        let clock = 5_000_000;
        let answer = { status: 503, text: 'down' };
        const { fetch, requests } = fakeFetch({ [route]: () => answer });
        const provider = createProvider({ kind: 'koios', url: BASE, network: preprod, fetch, log: fakeLog(), now: () => clock });
        expect(await failureOf(provider.protocolParameters())).toMatchObject({ code: 'unavailable' });
        answer = { json: [koiosParamsOf(loadParams())] };
        await provider.protocolParameters();
        clock += 10 * 60 * 1000 - 1;
        await Promise.all([provider.protocolParameters(), provider.protocolParameters()]);
        expect(requests).toHaveLength(2);
        clock += 1;
        await provider.protocolParameters();
        expect(requests).toHaveLength(3);
    });

    test('tip: the latest block, its time in milliseconds; an empty answer is unavailable', async () => {
        const { provider } = providerWith({
            'GET /tip': { json: [{ hash: 'bc'.repeat(32), epoch_no: 325, era: 'Conway', abs_slot: 139066878, epoch_slot: 308478, block_height: 5415506, block_no: 5415506, block_time: 1794750078 }] },
        });
        expect(await provider.tip()).toEqual({ blockNo: 5415506, slot: 139066878, hash: 'bc'.repeat(32), time: 1794750078000 });
        const { provider: empty } = providerWith({ 'GET /tip': { json: [] } });
        expect(await failureOf(empty.tip())).toMatchObject({ code: 'unavailable' });
    });
});

describe("what plan B's tx.js does with the answers", () => {
    const owner = fixtureKey('provider-owner');
    const stake = fixtureKey('provider-owner-stake');
    const ownerAddress = owner.baseAddress('provider-owner-stake');
    const rewardAddress = addressOfSubjectForFunds(`stake:${stake.keyHash}`, preprod);
    const contracts = fixtureContracts();
    const configUnit = contracts.configPolicyId + CONFIG_TOKEN_NAME;
    const configAddress = Address.toBech32(contracts.configUtxo.address);
    const configEntry = koiosEntry({
        address: configAddress,
        lovelace: '2000000',
        tokens: { [configUnit]: '1' },
        txHash: 'cf'.repeat(32),
        index: 0,
        inlineDatum: Data.toCBORHex(contracts.configUtxo.datumOption.data),
    });

    test("fundsCheck answers for the provider's UTxOs what it answers for the same UTxOs built by hand", async () => {
        const { provider, requests } = providerWith({
            [page('/account_utxos', 1)]: {
                json: [
                    koiosEntry({ address: ownerAddress, lovelace: '30000000', txHash: txHashOf(1) }),
                    koiosEntry({ address: ownerAddress, lovelace: '2000000', txHash: txHashOf(2), tokens: { [UNIT]: '5' } }),
                    koiosEntry({ address: ownerAddress, lovelace: '50000000', txHash: txHashOf(3), inlineDatum: Data.toCBORHex(42n) }),
                ],
            },
        });
        const utxos = await provider.utxosOf(`stake:${stake.keyHash}`);
        expect(requests[0].json._stake_addresses).toEqual([rewardAddress]);
        const byHand = [
            utxo({ address: ownerAddress, lovelace: 30_000_000n, txId: txHashOf(1), index: 0 }),
            utxo({ address: ownerAddress, lovelace: 2_000_000n, tokens: { [UNIT]: 5n }, txId: txHashOf(2), index: 0 }),
            utxo({ address: ownerAddress, lovelace: 50_000_000n, txId: txHashOf(3), index: 0, datum: 42n }),
        ];
        expect(fundsCheck({ utxos, kind: 'mint' })).toEqual(fundsCheck({ utxos: byHand, kind: 'mint' }));
        expect(fundsCheck({ utxos, kind: 'mint' })).toMatchObject({ enough: true, collateral: true });
        expect(fundsCheck({ utxos: utxos.slice(0, 2), kind: 'mint' })).toEqual(fundsCheck({ utxos, kind: 'mint' }));
        expect(fundsCheck({ utxos: utxos.slice(1), kind: 'mint' })).toMatchObject({ enough: false });
    });

    test('readConfig reads the config by its NFT and by its output reference', async () => {
        const { provider } = providerWith({
            [`POST /asset_utxos?is_spent=eq.false&limit=1&${ORDER}`]: { json: [configEntry] },
            'POST /utxo_info': { json: [configEntry] },
        });
        const blueprint = loadBlueprint();
        const byNft = await readConfig({ provider, blueprint, policyId: contracts.policyId, network: preprod, configPolicyId: contracts.configPolicyId });
        expect(byNft.config).toEqual(contracts.config);
        expect(byNft.configPolicyId).toBe(contracts.configPolicyId);
        expect(byNft.configUtxo).toEqual(contracts.configUtxo);
        const byRef = await readConfig({ provider, blueprint, policyId: contracts.policyId, network: preprod, configRef: `${'cf'.repeat(32)}#0` });
        expect(byRef.config).toEqual(contracts.config);
    });

    test('readConfig: CONFIG_NOT_FOUND when the provider finds no config', async () => {
        const { provider } = providerWith({ [`POST /asset_utxos?is_spent=eq.false&limit=1&${ORDER}`]: { json: [] } });
        const error = await failureOf(readConfig({ provider, blueprint: loadBlueprint(), policyId: contracts.policyId, network: preprod, configPolicyId: contracts.configPolicyId }));
        expect(error).toBeInstanceOf(ChainConfigError);
        expect(error.code).toBe('CONFIG_NOT_FOUND');
    });
});
