// The server's access to the chain through a Blockfrost-compatible API (CHAIN_PROVIDER_URL; the
// project id CHAIN_PROVIDER_KEY goes in the `project_id` header of every request): a wallet's
// UTxOs, the UTxOs at an address, one UTxO by its output reference or by a unit it holds, the
// protocol parameters, the tip, and submitting and evaluating a transaction.
//
// UTxOs and parameters come back as the Evolution SDK's objects, exactly as tx.js takes them
// (UTxO.UTxO with its address, assets, datumOption and scriptRef; Provider.ProtocolParameters).
// They are converted here from Blockfrost's JSON with the SDK's constructors, as the SDK's own
// BlockfrostProvider converts them, rather than through that provider: it reads with the global
// fetch (no timeout of ours, nothing a test can replace), pages without an end, and answers a UTxO
// whose reference script it could not fetch as a UTxO without one, which spendableOf would then
// spend. A failure here is a ProviderError; the key is in no message and no log line.

const { Address, Assets, Data, DatumHash, InlineDatum, NativeScripts, PlutusV1, PlutusV2, PlutusV3, ScriptHash, TransactionHash, UTxO } = require('@evolution-sdk/evolution');
const { addressOfSubjectForFunds } = require('./addresses');

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const PARAMS_TTL_MS = 10 * 60 * 1000;
const REFUSAL_LOG_INTERVAL_MS = 60 * 60 * 1000;
const MAX_REASON = 300;
// reference scripts are immutable by their hash; a few hundred cover every script a wallet shows
const MAX_CACHED_SCRIPTS = 256;

const OUT_REF = /^([0-9a-f]{64})#(\d{1,10})$/;
// a policy id and an asset name of up to 32 bytes, in lower-case hex
const UNIT = /^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/;
const TX_HASH = /^[0-9a-f]{64}$/;

/**
 * A failure of the provider. `code`: 'rejected' (the provider refused a transaction: 400 on submit
 * or evaluate, or a script that fails; `message` is the provider's reason, at most 300
 * characters), 'busy' (a request limit: 402, 418, 425, 429), 'unauthorized' (401, 403: the key
 * was refused), 'unavailable' (5xx, no answer in time, a network error, an answer that cannot be
 * read). `status`: the HTTP status, null when no answer came.
 */
class ProviderError extends Error {
    constructor(code, message, status = null) {
        super(message);
        this.name = 'ProviderError';
        this.code = code;
        this.status = status;
    }
}

const BUSY = [402, 418, 425, 429];
const UNAUTHORIZED = [401, 403];

const parsed = text => {
    try {
        return { json: JSON.parse(text) };
    } catch {
        return {};
    }
};

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

const bigintOf = value => BigInt(String(value));
const optionalBigint = value => (value === undefined || value === null ? 0n : bigintOf(value));

// the amounts [{ unit, quantity }] as Assets ('lovelace', else policy id and asset name in hex)
const assetsOf = amounts => {
    let assets = Assets.fromLovelace(0n);
    for (const { unit, quantity } of amounts) {
        assets = unit === 'lovelace' ? Assets.withLovelace(assets, bigintOf(quantity)) : Assets.addByHex(assets, unit.slice(0, 56), unit.slice(56), bigintOf(quantity));
    }
    return assets;
};

const datumOptionOf = ({ inline_datum: inline, data_hash: hash }) => {
    if (inline) {
        return new InlineDatum.InlineDatum({ data: Data.fromCBORHex(inline) });
    }
    return hash ? DatumHash.fromHex(hash) : undefined;
};

// a UTxO entry of Blockfrost (an address's or an account's UTxOs, a transaction's output) with the
// transaction hash `txHash` and its reference script `scriptRef` (already fetched)
const utxoOf = (entry, { txHash = entry.tx_hash, scriptRef } = {}) =>
    new UTxO.UTxO({
        transactionId: TransactionHash.fromHex(txHash),
        index: bigintOf(entry.output_index),
        address: Address.fromBech32(entry.address),
        assets: assetsOf(entry.amount),
        datumOption: datumOptionOf(entry),
        scriptRef,
    });

// a script of the type Blockfrost names (/scripts/{hash}) from its CBOR (/scripts/{hash}/cbor)
const scriptOf = (type, cbor) => {
    switch (type) {
        case 'timelock':
            return NativeScripts.fromCBORHex(cbor);
        case 'plutusV1':
            return new PlutusV1.PlutusV1({ bytes: Buffer.from(cbor, 'hex') });
        case 'plutusV2':
            return new PlutusV2.PlutusV2({ bytes: Buffer.from(cbor, 'hex') });
        case 'plutusV3':
            return new PlutusV3.PlutusV3({ bytes: Buffer.from(cbor, 'hex') });
        default:
            throw new Error(`unknown script type ${type}`);
    }
};

// the cost model of `language`: the raw list (cost_models_raw) by index, else the named map
const costModelOf = ({ cost_models_raw: raw, cost_models: named }, language) =>
    raw?.[language]
        ? Object.fromEntries(raw[language].map((cost, index) => [String(index), Number(cost)]))
        : Object.fromEntries(Object.entries(named?.[language] ?? {}).map(([name, cost]) => [name, Number(cost)]));

// /epochs/latest/parameters as Provider.ProtocolParameters, field by field as the SDK's provider
// reads them (Blockfrost sends some integers as strings)
const protocolParametersOf = params => ({
    minFeeA: Number(params.min_fee_a),
    minFeeB: Number(params.min_fee_b),
    maxTxSize: Number(params.max_tx_size),
    maxValSize: Number(params.max_val_size ?? 0),
    keyDeposit: bigintOf(params.key_deposit),
    poolDeposit: bigintOf(params.pool_deposit),
    drepDeposit: optionalBigint(params.drep_deposit),
    govActionDeposit: optionalBigint(params.gov_action_deposit),
    priceMem: Number(params.price_mem) || 0,
    priceStep: Number(params.price_step) || 0,
    maxTxExMem: optionalBigint(params.max_tx_ex_mem),
    maxTxExSteps: optionalBigint(params.max_tx_ex_steps),
    coinsPerUtxoByte: optionalBigint(params.coins_per_utxo_size),
    collateralPercentage: Number(params.collateral_percent ?? 0),
    maxCollateralInputs: Number(params.max_collateral_inputs ?? 0),
    minFeeRefScriptCostPerByte: Number(params.min_fee_ref_script_cost_per_byte) || 0,
    costModels: { PlutusV1: costModelOf(params, 'PlutusV1'), PlutusV2: costModelOf(params, 'PlutusV2'), PlutusV3: costModelOf(params, 'PlutusV3') },
});

// Ogmios' EvaluateTx result (Blockfrost's /utils/txs/evaluate) as [{ tag, index, memory, steps }]
const exUnitsOf = result =>
    Object.entries(result).map(([key, { memory, steps }]) => {
        const [tag, index] = key.split(':');
        return { tag, index: Number(index), memory: Number(memory), steps: Number(steps) };
    });

// ---------------------------------------------------------------------------------------------
// The provider

/**
 * The provider at `url` (no trailing slash) with the project id `key`, for `network`. Every
 * request: `${url}${path}`, the `project_id` header, at most `timeoutMs`. `log` gets one warning
 * when a wallet has more UTxOs than are read, and `chain provider refused the key` at most once an
 * hour (`now`) while the key is refused.
 */
const createProvider = ({ url, key, network, fetch = globalThis.fetch, timeoutMs = 10000, now = Date.now, log = console }) => {
    const base = String(url).replace(/\/+$/, '');
    // defensive: whatever an answer repeats, the key never leaves in a message
    const masked = text => (key ? String(text).split(key).join('<redacted>') : String(text));
    const failure = (code, message, status) => new ProviderError(code, masked(message), status);
    // the provider's reason, masked before it is cut (a cut through the key would leave a part)
    const rejection = (reason, status) => new ProviderError('rejected', masked(reason).slice(0, MAX_REASON), status);
    const unreadable = operation => failure('unavailable', `chain provider ${operation}: an answer that cannot be read`, null);

    let refusalLoggedAt = -Infinity;
    const refused = () => {
        if (now() - refusalLoggedAt >= REFUSAL_LOG_INTERVAL_MS) {
            refusalLoggedAt = now();
            log.error('chain provider refused the key');
        }
    };

    // The answer of one request: { status, text }. `rejectable`: a 400 is the provider refusing a
    // transaction. 404 is answered as it is (each operation knows what it means); every other
    // status but 2xx is a ProviderError.
    const request = async (operation, method, path, { body, contentType, rejectable = false } = {}) => {
        const headers = { project_id: key, ...(contentType ? { 'content-type': contentType } : {}) };
        let status;
        let text;
        try {
            // no redirect: it would carry the project_id header to wherever it points
            const response = await fetch(`${base}${path}`, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
            status = response.status;
            text = await response.text();
        } catch (error) {
            const why = error?.name === 'TimeoutError' ? `no answer within ${timeoutMs} ms` : `no answer (${error?.cause?.code || error?.name || 'network error'})`;
            throw failure('unavailable', `chain provider ${operation}: ${why}`, null);
        }
        if ((status >= 200 && status < 300) || status === 404) {
            return { status, text };
        }
        if (status === 400 && rejectable) {
            throw rejection(reasonOf(text), status);
        }
        if (UNAUTHORIZED.includes(status)) {
            refused();
            throw failure('unauthorized', `chain provider ${operation}: the provider refused the key (${status})`, status);
        }
        if (BUSY.includes(status)) {
            throw failure('busy', `chain provider ${operation}: the provider's request limit is reached (${status})`, status);
        }
        throw failure('unavailable', `chain provider ${operation}: the provider answered ${status}`, status);
    };

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

    // the entries of a paged list: pages of PAGE_SIZE until a shorter one, at most MAX_PAGES
    const pages = async (operation, path) => {
        const found = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const entries = await get(operation, `${path}?count=${PAGE_SIZE}&page=${page}`);
            if (entries === undefined) {
                return found;
            }
            if (!Array.isArray(entries)) {
                throw unreadable(operation);
            }
            found.push(...entries);
            if (entries.length < PAGE_SIZE) {
                return found;
            }
        }
        log.warn(`chain provider ${operation}: more than ${PAGE_SIZE * MAX_PAGES} UTxOs, only the first ${PAGE_SIZE * MAX_PAGES} are read`);
        return found;
    };

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
        let scriptHash;
        try {
            script = scriptOf(info.type, cbor.cbor);
            scriptHash = ScriptHash.toHex(ScriptHash.fromScript(script));
        } catch {
            throw unreadable(operation);
        }
        if (scriptHash !== hash) {
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
                utxos.push(utxoOf(entry, { txHash, scriptRef }));
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
        const match = typeof ref === 'string' ? OUT_REF.exec(ref) : null;
        if (!match) {
            return undefined;
        }
        const [, txHash, index] = match;
        const tx = await get('utxoByRef', `/txs/${txHash}/utxos`);
        if (tx === undefined) {
            return undefined;
        }
        if (!Array.isArray(tx?.outputs)) {
            throw unreadable('utxoByRef');
        }
        // a collateral return is no output of a valid transaction; a consumed output is spent
        const output = tx.outputs.find(candidate => Number(candidate?.output_index) === Number(index) && candidate.collateral !== true);
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
     * The unspent output that holds `unit` (policy id and asset name, hex): at the address the
     * provider names first as its holder (an NFT has exactly one). Undefined if nobody holds it;
     * an output it answers that does not hold the unit is a provider that answers wrongly
     * (ProviderError 'unavailable'), never another output.
     */
    const utxoByUnit = async unit => {
        if (typeof unit !== 'string' || !UNIT.test(unit)) {
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

    // the parameters of the latest epoch, read at most every PARAMS_TTL_MS (a read under way is
    // shared; a failed one is not kept)
    let params;
    /** The protocol parameters (Provider.ProtocolParameters), cached for 10 minutes. */
    const protocolParameters = () => {
        if (params && now() - params.at < PARAMS_TTL_MS) {
            return params.answer;
        }
        const answer = get('protocolParameters', '/epochs/latest/parameters', { absent: false }).then(json => {
            try {
                return protocolParametersOf(json);
            } catch {
                throw unreadable('protocolParameters');
            }
        });
        const entry = { at: now(), answer };
        params = entry;
        answer.catch(() => {
            if (params === entry) {
                params = undefined;
            }
        });
        return answer;
    };

    /** The latest block: { blockNo, slot, hash, time (ms) }. */
    const tip = async () => {
        const block = await get('tip', '/blocks/latest', { absent: false });
        const answer = { blockNo: block?.height, slot: block?.slot, hash: block?.hash, time: block?.time * 1000 };
        if (![answer.blockNo, answer.slot, answer.time].every(Number.isSafeInteger) || typeof answer.hash !== 'string') {
            throw unreadable('tip');
        }
        return answer;
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

module.exports = { ProviderError, createProvider };
