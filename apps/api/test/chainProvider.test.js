// The chain provider (plan C, Task 2): a Blockfrost-compatible API read through an injected fetch
// that answers from a table, so no test reaches a network. The answers are the Evolution SDK's
// objects that plan B's tx.js takes; the last tests feed them into its fundsCheck and readConfig.

const { Address, Assets, Data, DatumHash, InlineDatum, NativeScripts, PlutusV3, ScriptHash, TransactionHash, UTxO } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { ProviderError, createProvider } = require('../src/chain/provider');
const { addressOfSubjectForFunds } = require('../src/chain/addresses');
const { CONFIG_TOKEN_NAME, ChainConfigError, loadBlueprint } = require('../src/chain/blueprint');
const { fundsCheck, readConfig } = require('../src/chain/tx');
const { testKeys } = require('./helpers/cardano');
const { fixtureContracts, fixtureKey, loadParams, utxo } = require('./helpers/chain');

const { preprod } = cardano.Networks;
const BASE = 'https://cardano-preprod.blockfrost.io/api/v0';
const KEY = 'preprodTestKeyThatMustNeverShow0123';
const TOKEN = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
const txHashOf = n => n.toString(16).padStart(64, '0');

// A UTxO as Blockfrost answers it (/addresses/…/utxos, /accounts/…/utxos)
const entry = ({ address, lovelace = '5000000', tokens = {}, txHash = txHashOf(1), index = 0, inlineDatum = null, dataHash = null, referenceScriptHash = null }) => ({
    address,
    tx_hash: txHash,
    tx_index: index,
    output_index: index,
    amount: [{ unit: 'lovelace', quantity: lovelace }, ...Object.entries(tokens).map(([unit, quantity]) => ({ unit, quantity }))],
    block: 'b1'.repeat(32),
    data_hash: dataHash,
    inline_datum: inlineDatum,
    reference_script_hash: referenceScriptHash,
});
const entries = (count, address, from = 0) => Array.from({ length: count }, (_, i) => entry({ address, txHash: txHashOf(from + i + 1) }));

// A fetch that answers `routes` ({ 'METHOD /path?query': { status, json | text } or a function of
// the request's init }) and records every request; a route it does not know is a test error.
const fakeFetch = routes => {
    const requests = [];
    const fetch = async (url, init = {}) => {
        const method = init.method || 'GET';
        const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
        requests.push({ url, path, method, headers: init.headers || {}, body: init.body, redirect: init.redirect, signal: init.signal });
        const route = routes[`${method} ${path}`];
        if (route === undefined) {
            throw new Error(`the fake fetch has no route for ${method} ${path}`);
        }
        const { status = 200, json, text } = typeof route === 'function' ? await route(init) : route;
        const body = text !== undefined ? text : JSON.stringify(json);
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
    const provider = createProvider({ kind: 'blockfrost', url: BASE, key: KEY, network: preprod, fetch, log, ...options });
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

describe('utxosOf', () => {
    const keys = testKeys();
    const accountPage = page => `GET /accounts/${keys.rewardAddress}/utxos?count=100&page=${page}`;

    test('a stake key: the UTxOs of its account, as SDK UTxOs, asked with the project id', async () => {
        const { provider, requests } = providerWith({ [accountPage(1)]: { json: [entry({ address: keys.baseAddress, tokens: { [TOKEN]: '1' } })] } });
        const [found, ...rest] = await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(rest).toEqual([]);
        expect(requests.map(request => request.url)).toEqual([`${BASE}/accounts/${keys.rewardAddress}/utxos?count=100&page=1`]);
        expect(headerOf(requests[0], 'project_id')).toBe(KEY);
        // a redirect would carry the key elsewhere: none is followed
        expect(requests[0].redirect).toBe('error');
        expect(found).toBeInstanceOf(UTxO.UTxO);
        expect(Assets.lovelaceOf(found.assets)).toBe(5_000_000n);
        expect(Assets.getByUnit(found.assets, TOKEN)).toBe(1n);
        expect(TransactionHash.toHex(found.transactionId)).toBe(txHashOf(1));
        expect(found.index).toBe(0n);
        expect(Address.toBech32(found.address)).toBe(keys.baseAddress);
        expect(found.datumOption).toBeUndefined();
        expect(found.scriptRef).toBeUndefined();
    });

    test('pages of 100 until a shorter one: 100 and 3 are 103 UTxOs in two requests', async () => {
        const { provider, requests } = providerWith({
            [accountPage(1)]: { json: entries(100, keys.baseAddress) },
            [accountPage(2)]: { json: entries(3, keys.baseAddress, 100) },
        });
        const found = await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(found).toHaveLength(103);
        expect(requests).toHaveLength(2);
    });

    test('at most 10 pages: the first 1000 UTxOs, one warning, page 11 is never asked', async () => {
        const routes = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [accountPage(i + 1), { json: entries(100, keys.baseAddress, i * 100) }]));
        const log = fakeLog();
        const { provider, requests } = providerWith(routes, { log });
        const found = await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`);
        expect(found).toHaveLength(1000);
        expect(requests.map(request => request.path)).not.toContain(accountPage(11).slice('GET '.length));
        expect(requests).toHaveLength(10);
        expect(log.lines.filter(line => line.startsWith('warn: '))).toHaveLength(1);
        expect(log.lines.join('\n')).not.toContain(keys.rewardAddress);
    });

    test('a payment key: the UTxOs at its enterprise address', async () => {
        const { provider, requests } = providerWith({
            [`GET /addresses/${keys.enterpriseAddress}/utxos?count=100&page=1`]: { json: [entry({ address: keys.enterpriseAddress, lovelace: '7000000' })] },
        });
        const [found] = await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`);
        expect(requests[0].path).toMatch(/^\/addresses\/addr_test1v/);
        expect(Assets.lovelaceOf(found.assets)).toBe(7_000_000n);
    });

    test('404 (an account or address the chain has never seen): no UTxOs', async () => {
        const { provider } = providerWith({
            [accountPage(1)]: { status: 404, json: { status_code: 404, error: 'Not Found', message: 'The requested component has not been found.' } },
            [`GET /addresses/${keys.enterpriseAddress}/utxos?count=100&page=1`]: { status: 404, json: { status_code: 404 } },
        });
        expect(await provider.utxosOf(`stake:${keys.stakeKeyHashHex}`)).toEqual([]);
        expect(await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`)).toEqual([]);
    });
});

describe('the datum and the reference script of a UTxO', () => {
    const keys = testKeys();
    const { items } = fixtureContracts();
    const scriptHash = ScriptHash.toHex(ScriptHash.fromScript(items.script));
    const scriptHex = Buffer.from(items.script.bytes).toString('hex');
    const datum = Data.constr(0n, [42n, Data.bytearray('beef')]);
    const page = `GET /addresses/${keys.enterpriseAddress}/utxos?count=100&page=1`;

    test('an inline datum, a datum hash and a reference script (fetched once per script) come back as the SDK holds them', async () => {
        const { provider, requests } = providerWith({
            [page]: {
                json: [
                    entry({ address: keys.enterpriseAddress, txHash: txHashOf(1), inlineDatum: Data.toCBORHex(datum) }),
                    entry({ address: keys.enterpriseAddress, txHash: txHashOf(2), dataHash: 'da'.repeat(32) }),
                    entry({ address: keys.enterpriseAddress, txHash: txHashOf(3), referenceScriptHash: scriptHash }),
                    entry({ address: keys.enterpriseAddress, txHash: txHashOf(4), referenceScriptHash: scriptHash }),
                ],
            },
            [`GET /scripts/${scriptHash}`]: { json: { script_hash: scriptHash, type: 'plutusV3', serialised_size: scriptHex.length / 2 } },
            [`GET /scripts/${scriptHash}/cbor`]: { json: { cbor: scriptHex } },
        });
        const [inline, hashed, withScript, again] = await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`);
        expect(inline.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(Data.toCBORHex(inline.datumOption.data)).toBe(Data.toCBORHex(datum));
        expect(DatumHash.isDatumHash(hashed.datumOption)).toBe(true);
        expect(withScript.scriptRef).toBeInstanceOf(PlutusV3.PlutusV3);
        expect(ScriptHash.toHex(ScriptHash.fromScript(withScript.scriptRef))).toBe(scriptHash);
        expect(again.scriptRef).toEqual(withScript.scriptRef);
        expect(requests.filter(request => request.path.startsWith('/scripts/'))).toHaveLength(2);
    });

    test('a native (timelock) reference script, and a script type nobody knows (unavailable)', async () => {
        const native = '8200581c' + keys.paymentKeyHashHex;
        const nativeHash = ScriptHash.toHex(ScriptHash.fromScript(NativeScripts.fromCBORHex(native)));
        const { provider } = providerWith({
            [page]: { json: [entry({ address: keys.enterpriseAddress, referenceScriptHash: nativeHash })] },
            [`GET /scripts/${nativeHash}`]: { json: { script_hash: nativeHash, type: 'timelock' } },
            [`GET /scripts/${nativeHash}/cbor`]: { json: { cbor: native } },
        });
        const [found] = await provider.utxosOf(`pay:${keys.paymentKeyHashHex}`);
        expect(ScriptHash.toHex(ScriptHash.fromScript(found.scriptRef))).toBe(nativeHash);
        const { provider: strange } = providerWith({
            [page]: { json: [entry({ address: keys.enterpriseAddress, referenceScriptHash: scriptHash })] },
            [`GET /scripts/${scriptHash}`]: { json: { script_hash: scriptHash, type: 'plutusV9' } },
            [`GET /scripts/${scriptHash}/cbor`]: { json: { cbor: scriptHex } },
        });
        expect(await failureOf(strange.utxosOf(`pay:${keys.paymentKeyHashHex}`))).toMatchObject({ code: 'unavailable' });
    });

    test('a reference script that is not what its hash says, or that the provider does not know: unavailable, never a UTxO without its script', async () => {
        const wrong = 'ee'.repeat(28);
        const { provider } = providerWith({
            [page]: { json: [entry({ address: keys.enterpriseAddress, referenceScriptHash: wrong })] },
            [`GET /scripts/${wrong}`]: { json: { script_hash: wrong, type: 'plutusV3' } },
            [`GET /scripts/${wrong}/cbor`]: { json: { cbor: scriptHex } },
        });
        expect(await failureOf(provider.utxosOf(`pay:${keys.paymentKeyHashHex}`))).toMatchObject({ code: 'unavailable' });
        const { provider: unknown } = providerWith({
            [page]: { json: [entry({ address: keys.enterpriseAddress, referenceScriptHash: scriptHash })] },
            [`GET /scripts/${scriptHash}`]: { status: 404, json: { status_code: 404 } },
            [`GET /scripts/${scriptHash}/cbor`]: { status: 404, json: { status_code: 404 } },
        });
        expect(await failureOf(unknown.utxosOf(`pay:${keys.paymentKeyHashHex}`))).toMatchObject({ code: 'unavailable' });
    });
});

describe('utxosAt', () => {
    const keys = testKeys();

    test('the UTxOs at an address, or those of them that hold an asset; 404 is none', async () => {
        const { provider, requests } = providerWith({
            [`GET /addresses/${keys.baseAddress}/utxos?count=100&page=1`]: { json: entries(2, keys.baseAddress) },
            [`GET /addresses/${keys.baseAddress}/utxos/${TOKEN}?count=100&page=1`]: { json: [entry({ address: keys.baseAddress, tokens: { [TOKEN]: '3' } })] },
            [`GET /addresses/${keys.enterpriseAddress}/utxos?count=100&page=1`]: { status: 404, json: { status_code: 404 } },
        });
        expect(await provider.utxosAt(keys.baseAddress)).toHaveLength(2);
        const [holding] = await provider.utxosAt(keys.baseAddress, { asset: TOKEN });
        expect(Assets.getByUnit(holding.assets, TOKEN)).toBe(3n);
        expect(await provider.utxosAt(keys.enterpriseAddress)).toEqual([]);
        expect(requests).toHaveLength(3);
    });
});

describe('utxoByRef', () => {
    const keys = testKeys();
    const hash = txHashOf(77);
    const output = (index, extra = {}) => ({
        address: keys.baseAddress,
        amount: [{ unit: 'lovelace', quantity: String(1_000_000 * (index + 1)) }],
        output_index: index,
        data_hash: null,
        inline_datum: null,
        reference_script_hash: null,
        collateral: false,
        consumed_by_tx: null,
        ...extra,
    });
    const txUtxos = outputs => ({ json: { hash, inputs: [], outputs } });

    test('found: the unspent output of that transaction with that index', async () => {
        const { provider, requests } = providerWith({ [`GET /txs/${hash}/utxos`]: txUtxos([output(0), output(1)]) });
        const found = await provider.utxoByRef(`${hash}#1`);
        expect(requests.map(request => request.path)).toEqual([`/txs/${hash}/utxos`]);
        expect(found).toBeInstanceOf(UTxO.UTxO);
        expect(TransactionHash.toHex(found.transactionId)).toBe(hash);
        expect(found.index).toBe(1n);
        expect(Assets.lovelaceOf(found.assets)).toBe(2_000_000n);
    });

    test('not found: an unknown transaction (404), an index it does not have, a spent output, a collateral return; no request for a malformed reference', async () => {
        const { provider: unknown } = providerWith({ [`GET /txs/${hash}/utxos`]: { status: 404, json: { status_code: 404 } } });
        expect(await unknown.utxoByRef(`${hash}#0`)).toBeUndefined();
        const { provider, requests } = providerWith({ [`GET /txs/${hash}/utxos`]: txUtxos([output(0, { consumed_by_tx: txHashOf(78) }), output(1, { collateral: true })]) });
        expect(await provider.utxoByRef(`${hash}#2`)).toBeUndefined();
        expect(await provider.utxoByRef(`${hash}#0`)).toBeUndefined();
        expect(await provider.utxoByRef(`${hash}#1`)).toBeUndefined();
        expect(requests).toHaveLength(3);
        for (const ref of [`${hash}`, `${hash}#x`, `${hash.slice(2)}#0`, `../../tx/submit#0`, null]) {
            expect(await provider.utxoByRef(ref)).toBeUndefined();
        }
        expect(requests).toHaveLength(3);
    });

    test('an output without consumed_by_tx (a server that does not say whether it is spent): unavailable, never taken as unspent', async () => {
        const { consumed_by_tx: dropped, ...silent } = output(0);
        expect(dropped).toBeNull();
        const { provider } = providerWith({ [`GET /txs/${hash}/utxos`]: txUtxos([silent]) });
        const error = await failureOf(provider.utxoByRef(`${hash}#0`));
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({ code: 'unavailable' });
    });

    test('a provider failure is a ProviderError', async () => {
        const { provider } = providerWith({ [`GET /txs/${hash}/utxos`]: { status: 503, text: 'Service Unavailable' } });
        const error = await failureOf(provider.utxoByRef(`${hash}#0`));
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({ code: 'unavailable', status: 503 });
    });
});

describe('utxoByUnit', () => {
    const keys = testKeys();
    const unit = 'a7'.repeat(28) + '000de140' + 'cd'.repeat(28);

    test('found: the UTxO that holds the unit, where the provider says it is', async () => {
        const { provider, requests } = providerWith({
            [`GET /assets/${unit}/addresses`]: { json: [{ address: keys.baseAddress, quantity: '1' }] },
            [`GET /addresses/${keys.baseAddress}/utxos/${unit}`]: { json: [entry({ address: keys.baseAddress, tokens: { [unit]: '1' } })] },
        });
        const found = await provider.utxoByUnit(unit);
        expect(requests.map(request => request.path)).toEqual([`/assets/${unit}/addresses`, `/addresses/${keys.baseAddress}/utxos/${unit}`]);
        expect(Assets.getByUnit(found.assets, unit)).toBe(1n);
    });

    test('not found: an asset the chain never saw (404), one nobody holds (burned), no UTxO at the address; no request for a malformed unit', async () => {
        const { provider: never } = providerWith({ [`GET /assets/${unit}/addresses`]: { status: 404, json: { status_code: 404 } } });
        expect(await never.utxoByUnit(unit)).toBeUndefined();
        const { provider: burned } = providerWith({ [`GET /assets/${unit}/addresses`]: { json: [] } });
        expect(await burned.utxoByUnit(unit)).toBeUndefined();
        const { provider: moved } = providerWith({
            [`GET /assets/${unit}/addresses`]: { json: [{ address: keys.baseAddress, quantity: '1' }] },
            [`GET /addresses/${keys.baseAddress}/utxos/${unit}`]: { json: [] },
        });
        expect(await moved.utxoByUnit(unit)).toBeUndefined();
        const { provider: strict, requests } = providerWith({});
        for (const bad of ['a7'.repeat(27), `${unit}/../x`, unit.toUpperCase(), null]) {
            expect(await strict.utxoByUnit(bad)).toBeUndefined();
        }
        expect(requests).toHaveLength(0);
    });

    test('an answer whose UTxO does not hold the unit is a provider that answers wrongly: ProviderError unavailable', async () => {
        const other = 'a7'.repeat(28) + '000de140' + 'ef'.repeat(28);
        for (const tokens of [{}, { [other]: '1' }, { [unit]: '0' }]) {
            const { provider } = providerWith({
                [`GET /assets/${unit}/addresses`]: { json: [{ address: keys.baseAddress, quantity: '1' }] },
                [`GET /addresses/${keys.baseAddress}/utxos/${unit}`]: { json: [entry({ address: keys.baseAddress, tokens })] },
            });
            expect(await failureOf(provider.utxoByUnit(unit))).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
    });

    test('a provider failure is a ProviderError', async () => {
        const { provider } = providerWith({ [`GET /assets/${unit}/addresses`]: { status: 429, json: { status_code: 429, error: 'Project Over Limit' } } });
        expect(await failureOf(provider.utxoByUnit(unit))).toMatchObject({ name: 'ProviderError', code: 'busy', status: 429 });
    });
});

describe('submit and evaluate', () => {
    const cbor = '84a300d9010281825820' + 'ab'.repeat(32);
    const hash = txHashOf(5);

    test('submit posts the bytes as application/cbor and resolves with the transaction hash', async () => {
        const { provider, requests } = providerWith({ 'POST /tx/submit': { json: hash } });
        expect(await provider.submit(cbor)).toBe(hash);
        expect(requests[0].method).toBe('POST');
        expect(headerOf(requests[0], 'content-type')).toBe('application/cbor');
        expect(headerOf(requests[0], 'project_id')).toBe(KEY);
        expect(Buffer.from(requests[0].body).equals(Buffer.from(cbor, 'hex'))).toBe(true);
    });

    test('a refused transaction (400): rejected, with Blockfrost\'s message, at most 300 characters', async () => {
        const { provider } = providerWith({
            'POST /tx/submit': { status: 400, json: { status_code: 400, error: 'Bad Request', message: 'BadInputsUTxO (fromList [TxIn …])' } },
        });
        const error = await failureOf(provider.submit(cbor));
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({ code: 'rejected', status: 400 });
        expect(error.message).toContain('BadInputsUTxO');
        const { provider: long } = providerWith({ 'POST /tx/submit': { status: 400, json: { message: JSON.stringify(`ValueNotConservedUTxO ${'x'.repeat(1000)}`) } } });
        const cut = await failureOf(long.submit(cbor));
        expect(cut.message.length).toBeLessThanOrEqual(300);
        // a submit error's message is itself a JSON string: it is read unquoted
        expect(cut.message.startsWith('ValueNotConservedUTxO')).toBe(true);
    });

    test('evaluate posts the transaction as application/cbor and lists the execution units of each redeemer', async () => {
        const { provider, requests } = providerWith({
            'POST /utils/txs/evaluate': {
                json: { type: 'jsonwsp/response', version: '1.0', servicename: 'ogmios', methodname: 'EvaluateTx', result: { EvaluationResult: { 'spend:1': { memory: 1700, steps: 476468 }, 'mint:0': { memory: 2200, steps: 600000 } } } },
            },
        });
        expect(await provider.evaluate(cbor)).toEqual([
            { tag: 'spend', index: 1, memory: 1700, steps: 476468 },
            { tag: 'mint', index: 0, memory: 2200, steps: 600000 },
        ]);
        expect(requests[0].method).toBe('POST');
        expect(headerOf(requests[0], 'content-type')).toBe('application/cbor');
        // unlike a submit, Blockfrost's evaluate takes the CBOR as hex text (as blockfrost-js sends it)
        expect(requests[0].body).toBe(cbor);
    });

    test('evaluate: a script that fails, or a 400, is rejected', async () => {
        const { provider } = providerWith({ 'POST /utils/txs/evaluate': { json: { type: 'jsonwsp/response', result: { EvaluationFailure: { ScriptFailures: { 'mint:0': [{ validatorFailed: { error: 'the items validator said no' } }] } } } } } });
        const failed = await failureOf(provider.evaluate(cbor));
        expect(failed).toMatchObject({ code: 'rejected' });
        expect(failed.message).toContain('the items validator said no');
        const { provider: refused } = providerWith({ 'POST /utils/txs/evaluate': { status: 400, json: { message: 'Deserialisation failure' } } });
        expect(await failureOf(refused.evaluate(cbor))).toMatchObject({ code: 'rejected', status: 400, message: 'Deserialisation failure' });
    });
});

describe('failures', () => {
    const keys = testKeys();
    const route = `GET /addresses/${keys.enterpriseAddress}/utxos?count=100&page=1`;
    const askWith = (answer, options) => {
        const { provider, log } = providerWith({ [route]: answer }, options);
        return { failure: failureOf(provider.utxosOf(`pay:${keys.paymentKeyHashHex}`)), log, provider };
    };

    test('413, on a submit too: unavailable as any other status, nothing logged (as before Koios came)', async () => {
        const { provider, log } = providerWith({ 'POST /tx/submit': { status: 413, text: 'Request Entity Too Large' } });
        expect(await failureOf(provider.submit('00'))).toMatchObject({ code: 'unavailable', status: 413, message: 'chain provider submit: the provider answered 413' });
        expect(log.lines).toEqual([]);
    });

    test('429 and 418: busy; 5xx: unavailable', async () => {
        expect(await askWith({ status: 429, json: { status_code: 429 } }).failure).toMatchObject({ code: 'busy', status: 429 });
        expect(await askWith({ status: 418, json: { status_code: 418 } }).failure).toMatchObject({ code: 'busy', status: 418 });
        expect(await askWith({ status: 503, text: '<html>busy</html>' }).failure).toMatchObject({ code: 'unavailable', status: 503 });
        expect(await askWith({ status: 500, json: { status_code: 500 } }).failure).toMatchObject({ code: 'unavailable', status: 500 });
    });

    test('no answer within timeoutMs, a network error, or an answer that is not JSON: unavailable', async () => {
        const never = init => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
        const started = Date.now();
        const timedOut = await askWith(never, { timeoutMs: 50 }).failure;
        expect(timedOut).toMatchObject({ code: 'unavailable', status: null });
        expect(Date.now() - started).toBeLessThan(5000);
        const unreachable = () => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }));
        expect(await askWith(unreachable).failure).toMatchObject({ code: 'unavailable', status: null });
        expect(await askWith({ text: '{"not json' }).failure).toMatchObject({ code: 'unavailable' });
        expect(await askWith({ json: { not: 'a list' } }).failure).toMatchObject({ code: 'unavailable' });
    });

    test('403: unauthorized, logged once an hour, and the key is in no message and no log line', async () => {
        let clock = 1_000_000;
        const log = fakeLog();
        const { fetch } = fakeFetch({ [route]: { status: 403, json: { status_code: 403, error: 'Forbidden', message: `Invalid project token: ${KEY}` } } });
        const provider = createProvider({ kind: 'blockfrost', url: BASE, key: KEY, network: preprod, fetch, log, now: () => clock });
        const ask = () => failureOf(provider.utxosOf(`pay:${keys.paymentKeyHashHex}`));
        const errors = [await ask(), await ask()];
        clock += 30 * 60 * 1000;
        errors.push(await ask());
        expect(log.lines).toEqual(['error: chain provider refused the key']);
        clock += 31 * 60 * 1000;
        errors.push(await ask());
        expect(log.lines).toEqual(['error: chain provider refused the key', 'error: chain provider refused the key']);
        errors.forEach(error => expect(error).toMatchObject({ name: 'ProviderError', code: 'unauthorized', status: 403 }));
        // nor anywhere else: a timeout, a refused submit that repeats the key, a 5xx
        const { provider: echoing } = providerWith({ 'POST /tx/submit': { status: 400, json: { message: `bad ${KEY}` } } });
        // a reason cut at 300 characters right through the key: no part of it is left
        const { provider: cutting } = providerWith({ 'POST /tx/submit': { status: 400, json: { message: `${'x'.repeat(290)}${KEY}` } } });
        const cut = await failureOf(cutting.submit('00'));
        expect(cut.message).not.toContain(KEY.slice(0, 10));
        errors.push(await failureOf(echoing.submit('00')), cut, await askWith({ status: 502, text: KEY }).failure);
        errors.forEach(error => {
            expect(error.message).not.toContain(KEY);
            expect(String(error.stack)).not.toContain(KEY);
            expect(JSON.stringify(error)).not.toContain(KEY);
        });
        expect(log.lines.join('\n')).not.toContain(KEY);
    });
});

describe('protocolParameters and tip', () => {
    // Blockfrost's /epochs/latest/parameters for the parameters of the fixture tx.js is tested with
    const blockfrostParamsOf = params => ({
        epoch: 230,
        min_fee_a: params.minFeeA,
        min_fee_b: params.minFeeB,
        max_block_size: 90112,
        max_tx_size: params.maxTxSize,
        max_block_header_size: 1100,
        key_deposit: String(params.keyDeposit),
        pool_deposit: String(params.poolDeposit),
        e_max: 18,
        n_opt: 500,
        a0: 0.3,
        rho: 0.003,
        tau: 0.2,
        decentralisation_param: 0,
        extra_entropy: null,
        protocol_major_ver: 10,
        protocol_minor_ver: 0,
        min_utxo: '4310',
        min_pool_cost: '170000000',
        nonce: 'ab'.repeat(32),
        price_mem: params.priceMem,
        price_step: params.priceStep,
        max_tx_ex_mem: String(params.maxTxExMem),
        max_tx_ex_steps: String(params.maxTxExSteps),
        max_block_ex_mem: '62000000',
        max_block_ex_steps: '20000000000',
        max_val_size: String(params.maxValSize),
        collateral_percent: params.collateralPercentage,
        max_collateral_inputs: params.maxCollateralInputs,
        coins_per_utxo_size: String(params.coinsPerUtxoByte),
        coins_per_utxo_word: String(params.coinsPerUtxoByte),
        drep_deposit: String(params.drepDeposit),
        gov_action_deposit: String(params.govActionDeposit),
        min_fee_ref_script_cost_per_byte: params.minFeeRefScriptCostPerByte,
        cost_models: { PlutusV1: { 'addInteger-cpu-arguments-intercept': 1 } },
        cost_models_raw: Object.fromEntries(Object.entries(params.costModels).map(([language, costs]) => [language, Object.values(costs)])),
    });

    test('the parameters are those tx.js builds with (the SDK\'s ProtocolParameters)', async () => {
        const { provider } = providerWith({ 'GET /epochs/latest/parameters': { json: blockfrostParamsOf(loadParams()) } });
        expect(await provider.protocolParameters()).toEqual(loadParams());
    });

    test('a field the builder reads that is missing, null or not a number, or a missing cost model: unavailable, never a 0 or {}', async () => {
        const whole = blockfrostParamsOf(loadParams());
        const fields = ['min_fee_a', 'min_fee_b', 'max_tx_size', 'max_val_size', 'key_deposit', 'pool_deposit', 'price_mem', 'price_step', 'max_tx_ex_mem', 'max_tx_ex_steps', 'coins_per_utxo_size', 'collateral_percent', 'max_collateral_inputs', 'min_fee_ref_script_cost_per_byte'];
        const broken = [
            ...fields.flatMap(field => [{ ...whole, [field]: undefined }, { ...whole, [field]: null }, { ...whole, [field]: 'many' }]),
            { ...whole, cost_models_raw: { ...whole.cost_models_raw, PlutusV3: undefined }, cost_models: {} },
            { ...whole, cost_models_raw: undefined, cost_models: undefined },
        ];
        for (const params of broken) {
            const { provider } = providerWith({ 'GET /epochs/latest/parameters': { json: params } });
            expect(await failureOf(provider.protocolParameters())).toMatchObject({ name: 'ProviderError', code: 'unavailable' });
        }
    });

    test('without cost_models_raw the named cost models are read', async () => {
        const { cost_models_raw, ...named } = blockfrostParamsOf(loadParams());
        expect(cost_models_raw).toBeDefined();
        named.cost_models = { PlutusV1: { a: 1, b: 2 }, PlutusV2: { a: 3 }, PlutusV3: { c: 4 } };
        const { provider } = providerWith({ 'GET /epochs/latest/parameters': { json: named } });
        expect((await provider.protocolParameters()).costModels).toEqual({ PlutusV1: { a: 1, b: 2 }, PlutusV2: { a: 3 }, PlutusV3: { c: 4 } });
    });

    test('cached for 10 minutes', async () => {
        let clock = 5_000_000;
        const { fetch, requests } = fakeFetch({ 'GET /epochs/latest/parameters': { json: blockfrostParamsOf(loadParams()) } });
        const provider = createProvider({ kind: 'blockfrost', url: BASE, key: KEY, network: preprod, fetch, log: fakeLog(), now: () => clock });
        await provider.protocolParameters();
        clock += 10 * 60 * 1000 - 1;
        await Promise.all([provider.protocolParameters(), provider.protocolParameters()]);
        expect(requests).toHaveLength(1);
        clock += 1;
        await provider.protocolParameters();
        expect(requests).toHaveLength(2);
    });

    test('a failed read is not cached', async () => {
        let answer = { status: 503, text: 'down' };
        const { provider, requests } = providerWith({ 'GET /epochs/latest/parameters': () => answer });
        expect(await failureOf(provider.protocolParameters())).toMatchObject({ code: 'unavailable' });
        answer = { json: blockfrostParamsOf(loadParams()) };
        expect(await provider.protocolParameters()).toEqual(loadParams());
        expect(requests).toHaveLength(2);
    });

    test('tip: the latest block, its time in milliseconds', async () => {
        const { provider } = providerWith({
            'GET /blocks/latest': { json: { time: 1700000000, height: 3_000_123, hash: 'bc'.repeat(32), slot: 80_000_456, epoch: 230, epoch_slot: 12, slot_leader: 'pool1x', size: 3, tx_count: 1 } },
        });
        expect(await provider.tip()).toEqual({ blockNo: 3_000_123, slot: 80_000_456, hash: 'bc'.repeat(32), time: 1700000000000 });
    });
});

describe('what plan B\'s tx.js does with the answers', () => {
    const owner = fixtureKey('provider-owner');
    const stake = fixtureKey('provider-owner-stake');
    const ownerAddress = owner.baseAddress('provider-owner-stake');
    const rewardAddress = addressOfSubjectForFunds(`stake:${stake.keyHash}`, preprod);
    const contracts = fixtureContracts();
    const configUnit = contracts.configPolicyId + CONFIG_TOKEN_NAME;
    const configAddress = Address.toBech32(contracts.configUtxo.address);
    const configEntry = entry({
        address: configAddress,
        lovelace: '2000000',
        tokens: { [configUnit]: '1' },
        txHash: 'cf'.repeat(32),
        index: 0,
        inlineDatum: Data.toCBORHex(contracts.configUtxo.datumOption.data),
    });

    test('fundsCheck answers for the provider\'s UTxOs what it answers for the same UTxOs built by hand', async () => {
        const { provider } = providerWith({
            [`GET /accounts/${rewardAddress}/utxos?count=100&page=1`]: {
                json: [
                    entry({ address: ownerAddress, lovelace: '30000000', txHash: txHashOf(1) }),
                    entry({ address: ownerAddress, lovelace: '2000000', txHash: txHashOf(2), tokens: { [TOKEN]: '5' } }),
                    entry({ address: ownerAddress, lovelace: '50000000', txHash: txHashOf(3), inlineDatum: Data.toCBORHex(42n) }),
                ],
            },
        });
        const utxos = await provider.utxosOf(`stake:${stake.keyHash}`);
        const byHand = [
            utxo({ address: ownerAddress, lovelace: 30_000_000n, txId: txHashOf(1), index: 0 }),
            utxo({ address: ownerAddress, lovelace: 2_000_000n, tokens: { [TOKEN]: 5n }, txId: txHashOf(2), index: 0 }),
            utxo({ address: ownerAddress, lovelace: 50_000_000n, txId: txHashOf(3), index: 0, datum: 42n }),
        ];
        expect(fundsCheck({ utxos, kind: 'mint' })).toEqual(fundsCheck({ utxos: byHand, kind: 'mint' }));
        expect(fundsCheck({ utxos, kind: 'mint' })).toMatchObject({ enough: true, collateral: true });
        // the UTxO with a datum is not spendable: the wallet counts as the other two alone
        expect(fundsCheck({ utxos: utxos.slice(0, 2), kind: 'mint' })).toEqual(fundsCheck({ utxos, kind: 'mint' }));
        expect(fundsCheck({ utxos: utxos.slice(1), kind: 'mint' })).toMatchObject({ enough: false });
    });

    test('readConfig reads the config by its NFT and by its output reference', async () => {
        const { provider } = providerWith({
            [`GET /assets/${configUnit}/addresses`]: { json: [{ address: configAddress, quantity: '1' }] },
            [`GET /addresses/${configAddress}/utxos/${configUnit}`]: { json: [configEntry] },
            [`GET /txs/${'cf'.repeat(32)}/utxos`]: { json: { hash: 'cf'.repeat(32), inputs: [], outputs: [{ ...configEntry, collateral: false, consumed_by_tx: null }] } },
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
        const { provider } = providerWith({ [`GET /assets/${configUnit}/addresses`]: { json: [] } });
        const error = await failureOf(readConfig({ provider, blueprint: loadBlueprint(), policyId: contracts.policyId, network: preprod, configPolicyId: contracts.configPolicyId }));
        expect(error).toBeInstanceOf(ChainConfigError);
        expect(error.code).toBe('CONFIG_NOT_FOUND');
    });
});
