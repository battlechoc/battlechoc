// The server's access to the chain: a wallet's UTxOs, the UTxOs at an address, one UTxO by its
// output reference or by a unit it holds, the protocol parameters, the tip, and submitting and
// evaluating a transaction. createProvider chooses the API by CHAIN_PROVIDER_KIND: Koios
// (koiosProvider.js; CHAIN_PROVIDER_KEY, if any, is a bearer token) or a Blockfrost-compatible
// API (below; CHAIN_PROVIDER_KEY is the project id in the `project_id` header). Both answer
// alike (test/chainProviderContract.test.js) and share providerCommon.js.
//
// UTxOs and parameters come back as the Evolution SDK's objects, exactly as tx.js takes them
// (UTxO.UTxO with its address, assets, datumOption and scriptRef; Provider.ProtocolParameters).
// They are converted here from Blockfrost's JSON with the SDK's constructors, as the SDK's own
// BlockfrostProvider converts them, rather than through that provider: it reads with the global
// fetch (no timeout of ours, nothing a test can replace), pages without an end, and answers a UTxO
// whose reference script it could not fetch as a UTxO without one, which spendableOf would then
// spend. A failure here is a ProviderError; the key is in no message and no log line.

const { Assets } = require('@evolution-sdk/evolution');
const { addressOfSubjectForFunds } = require('./addresses');
const {
    ProviderError,
    TX_HASH,
    assetsOf,
    cachedParameters,
    checkedTip,
    createHttp,
    datumOptionOf,
    isScriptOf,
    isUnit,
    outRefParts,
    parsed,
    protocolParametersOf,
    readPages,
    scriptOf,
    utxoOf,
} = require('./providerCommon');
const { createKoiosProvider } = require('./koiosProvider');
const { PROVIDER_KINDS } = require('./providerKinds');

const PAGE_SIZE = 100;
// reference scripts are immutable by their hash; a few hundred cover every script a wallet shows
const MAX_CACHED_SCRIPTS = 256;

// Blockfrost's `message` of an error answer, else the answer itself; a submit error's message is
// itself a JSON string, which is read unquoted
const reasonOf = text => {
    const message = parsed(text).json?.message;
    const reason = typeof message === 'string' ? message : String(text);
    const unquoted = parsed(reason).json;
    return typeof unquoted === 'string' ? unquoted : reason;
};

// ---------------------------------------------------------------------------------------------
// Blockfrost's JSON as the SDK's objects

// a UTxO entry of Blockfrost (an address's or an account's UTxOs, a transaction's output) with the
// transaction hash `txHash` and its reference script `scriptRef` (already fetched); the amounts
// [{ unit, quantity }] are 'lovelace' and units of a policy id and a hex asset name
const blockfrostUtxoOf = (entry, { txHash = entry.tx_hash, scriptRef } = {}) => {
    const lovelace = entry.amount.find(({ unit }) => unit === 'lovelace')?.quantity ?? 0;
    const tokens = entry.amount.filter(({ unit }) => unit !== 'lovelace').map(({ unit, quantity }) => [unit.slice(0, 56), unit.slice(56), quantity]);
    return utxoOf({ txHash, index: entry.output_index, address: entry.address, assets: assetsOf(lovelace, tokens), datumOption: datumOptionOf(entry.inline_datum, entry.data_hash), scriptRef });
};

// the costs of `language` in /epochs/latest/parameters: the raw list (cost_models_raw) by index,
// else the named map
const blockfrostCostsOf = ({ cost_models_raw: raw, cost_models: named }) => language => (raw?.[language] ? raw[language] : named?.[language]);

// Ogmios' EvaluateTx result (Blockfrost's /utils/txs/evaluate) as [{ tag, index, memory, steps }]
const exUnitsOf = result =>
    Object.entries(result).map(([key, { memory, steps }]) => {
        const [tag, index] = key.split(':');
        return { tag, index: Number(index), memory: Number(memory), steps: Number(steps) };
    });

// ---------------------------------------------------------------------------------------------
// The provider

/**
 * The Blockfrost-compatible API at `url` (no trailing slash) with the project id `key`, for
 * `network`. Every request: `${url}${path}`, the `project_id` header, at most `timeoutMs`. `log`
 * gets one warning when a wallet has more UTxOs than are read, and `chain provider refused the
 * key` at most once an hour (`now`) while the key is refused.
 */
const createBlockfrostProvider = ({ url, key, network, fetch = globalThis.fetch, timeoutMs = 10000, now = Date.now, log = console }) => {
    const { failure, rejection, unreadable, request } = createHttp({ url, headers: { project_id: key }, key, fetch, timeoutMs, now, log, reasonOf });

    // the JSON of a GET; undefined for a 404 when `absent` allows it
    const get = async (operation, path, { absent = true } = {}) => {
        const { status, text } = await request(operation, 'GET', path);
        if (status === 404) {
            if (absent) {
                return undefined;
            }
            throw failure('unavailable', `chain provider ${operation}: the provider answered 404`, status);
        }
        const { json } = parsed(text);
        if (json === undefined) {
            throw unreadable(operation);
        }
        return json;
    };

    // the entries of a paged list: pages of PAGE_SIZE until a shorter one, at most 1000 entries
    const pages = (operation, path) => readPages({ operation, pageSize: PAGE_SIZE, page: n => get(operation, `${path}?count=${PAGE_SIZE}&page=${n}`), log, unreadable });

    // A reference script by its hash: its type and its CBOR, checked against the hash (a UTxO
    // never comes back with another script than the one it holds), cached.
    const scripts = new Map();
    const scriptByHash = async (operation, hash) => {
        if (scripts.has(hash)) {
            return scripts.get(hash);
        }
        const info = await get(operation, `/scripts/${hash}`);
        const cbor = info === undefined ? undefined : await get(operation, `/scripts/${hash}/cbor`);
        if (info === undefined || cbor === undefined) {
            throw failure('unavailable', `chain provider ${operation}: the provider does not know the reference script ${hash}`, 404);
        }
        let script;
        let matches;
        try {
            script = scriptOf(info.type, cbor.cbor);
            matches = isScriptOf(script, hash);
        } catch {
            throw unreadable(operation);
        }
        if (!matches) {
            throw failure('unavailable', `chain provider ${operation}: the reference script ${hash} the provider sent has another hash`, null);
        }
        if (scripts.size >= MAX_CACHED_SCRIPTS) {
            scripts.clear();
        }
        scripts.set(hash, script);
        return script;
    };

    // Blockfrost's UTxO entries as SDK UTxOs, their reference scripts fetched
    const utxosOfEntries = async (operation, entries, { txHash } = {}) => {
        const utxos = [];
        for (const entry of entries) {
            const hash = entry?.reference_script_hash;
            const scriptRef = hash ? await scriptByHash(operation, hash) : undefined;
            try {
                utxos.push(blockfrostUtxoOf(entry, { txHash, scriptRef }));
            } catch {
                throw unreadable(operation);
            }
        }
        return utxos;
    };

    const utxosAtAddress = async (operation, address, asset) => {
        const path = `/addresses/${encodeURIComponent(address)}/utxos${asset ? `/${encodeURIComponent(asset)}` : ''}`;
        return utxosOfEntries(operation, await pages(operation, path));
    };

    /**
     * The UTxOs of a wallet: for 'stake:<hash>' those of every address of its account (the
     * reward address), for 'pay:<hash>' those at its enterprise address (its funds at base
     * addresses are not found: such wallets have no reward address and are rare). At most 1000.
     */
    const utxosOf = async subject => {
        const address = addressOfSubjectForFunds(subject, network);
        if (subject.startsWith('stake:')) {
            return utxosOfEntries('utxosOf', await pages('utxosOf', `/accounts/${address}/utxos`));
        }
        return utxosAtAddress('utxosOf', address);
    };

    /** The UTxOs at `address` (bech32), only those holding `asset` (a unit) if given. At most 1000. */
    const utxosAt = (address, { asset } = {}) => utxosAtAddress('utxosAt', address, asset);

    /** The unspent output `ref` ('<tx hash>#<index>'); undefined if there is none. */
    const utxoByRef = async ref => {
        const parts = outRefParts(ref);
        if (!parts) {
            return undefined;
        }
        const { txHash, index } = parts;
        const tx = await get('utxoByRef', `/txs/${txHash}/utxos`);
        if (tx === undefined) {
            return undefined;
        }
        if (!Array.isArray(tx?.outputs)) {
            throw unreadable('utxoByRef');
        }
        // a collateral return is no output of a valid transaction; a consumed output is spent
        const output = tx.outputs.find(candidate => Number(candidate?.output_index) === index && candidate.collateral !== true);
        if (!output) {
            return undefined;
        }
        // Blockfrost always says whether an output is spent (null: unspent); a server that does
        // not cannot be trusted with the config's reference, so its answer is unreadable
        if (!('consumed_by_tx' in output)) {
            throw unreadable('utxoByRef');
        }
        if (output.consumed_by_tx) {
            return undefined;
        }
        const [utxo] = await utxosOfEntries('utxoByRef', [output], { txHash });
        return utxo;
    };

    /**
     * The unspent output that holds `unit` (policy id and asset name, hex), for a unit with one
     * holder (an NFT: the config NFT, an item's tokens): at the address the provider names first as
     * its holder; for a unit many outputs hold, only that first one. Undefined if nobody holds it;
     * an output it answers that does not hold the unit is a provider that answers wrongly
     * (ProviderError 'unavailable'), never another output.
     */
    const utxoByUnit = async unit => {
        if (!isUnit(unit)) {
            return undefined;
        }
        const holders = await get('utxoByUnit', `/assets/${unit}/addresses`);
        if (holders === undefined || (Array.isArray(holders) && holders.length === 0)) {
            return undefined;
        }
        if (!Array.isArray(holders) || typeof holders[0]?.address !== 'string') {
            throw unreadable('utxoByUnit');
        }
        const entries = await get('utxoByUnit', `/addresses/${encodeURIComponent(holders[0].address)}/utxos/${unit}`);
        if (entries === undefined || (Array.isArray(entries) && entries.length === 0)) {
            return undefined;
        }
        if (!Array.isArray(entries)) {
            throw unreadable('utxoByUnit');
        }
        const [utxo] = await utxosOfEntries('utxoByUnit', [entries[0]]);
        if (Assets.getByUnit(utxo.assets, unit) <= 0n) {
            throw unreadable('utxoByUnit');
        }
        return utxo;
    };

    /** The protocol parameters of the latest epoch (Provider.ProtocolParameters), cached for 10 minutes. */
    const protocolParameters = cachedParameters({
        now,
        read: () =>
            get('protocolParameters', '/epochs/latest/parameters', { absent: false }).then(json => {
                try {
                    return protocolParametersOf(json, blockfrostCostsOf(json));
                } catch {
                    throw unreadable('protocolParameters');
                }
            }),
    });

    /** The latest block: { blockNo, slot, hash, time (ms) }. */
    const tip = async () => {
        const block = await get('tip', '/blocks/latest', { absent: false });
        return checkedTip({ blockNo: block?.height, slot: block?.slot, hash: block?.hash, time: block?.time * 1000 }, unreadable);
    };

    /** Submits the signed transaction `cborHex`; resolves with its hash. */
    const submit = async cborHex => {
        const { status, text } = await request('submit', 'POST', '/tx/submit', { body: Buffer.from(cborHex, 'hex'), contentType: 'application/cbor', rejectable: true });
        const hash = parsed(text).json;
        if (status === 404 || typeof hash !== 'string' || !TX_HASH.test(hash)) {
            throw unreadable('submit');
        }
        return hash;
    };

    /**
     * The execution units the provider evaluates for the transaction `cborHex`: [{ tag, index,
     * memory, steps }]; a script that fails is 'rejected' with the provider's reason.
     */
    const evaluate = async cborHex => {
        const { status, text } = await request('evaluate', 'POST', '/utils/txs/evaluate', { body: cborHex, contentType: 'application/cbor', rejectable: true });
        const result = status === 404 ? undefined : parsed(text).json?.result;
        if (result?.EvaluationFailure) {
            throw rejection(JSON.stringify(result.EvaluationFailure), status);
        }
        const units = result?.EvaluationResult;
        if (!units || typeof units !== 'object') {
            throw unreadable('evaluate');
        }
        return exUnitsOf(units);
    };

    return { utxosOf, utxosAt, utxoByRef, utxoByUnit, protocolParameters, tip, submit, evaluate };
};

/**
 * The provider of `kind` ('koios' or 'blockfrost', else a TypeError) at `url` with `key` (Koios:
 * a bearer token or nothing; Blockfrost: the project id), for `network`; the other options
 * (`fetch`, `timeoutMs`, `now`, `log`) as each provider takes them.
 */
const createProvider = ({ kind, ...options }) => {
    if (kind === 'koios') {
        return createKoiosProvider(options);
    }
    if (kind === 'blockfrost') {
        return createBlockfrostProvider(options);
    }
    throw new TypeError(`createProvider: kind must be one of ${PROVIDER_KINDS.join(', ')}`);
};

module.exports = { PROVIDER_KINDS, ProviderError, createProvider };
