// What the two chain providers share (provider.js: Blockfrost and the choice between the two;
// koiosProvider.js: Koios): the ProviderError and its codes, one HTTP request with its bounds (an
// injected fetch, a timeout, no redirect, the key masked in every message and its refusal logged
// at most once an hour), the shapes of what may be asked, the Evolution SDK's objects built from
// hex, reading a paged list up to 1000 UTxOs, the parameters' cache and the check of the tip.
// Both providers answer only the SDK's objects, so tx.js and the routes never know which one runs.

const { Address, Assets, Data, DatumHash, InlineDatum, NativeScripts, PlutusV1, PlutusV2, PlutusV3, ScriptHash, TransactionHash, UTxO } = require('@evolution-sdk/evolution');

const PARAMS_TTL_MS = 10 * 60 * 1000;
const REFUSAL_LOG_INTERVAL_MS = 60 * 60 * 1000;
const MAX_REASON = 300;
/** The most UTxOs a list answers (utxosOf, utxosAt); more are logged once and not read. */
const MAX_UTXOS = 1000;

const OUT_REF = /^([0-9a-f]{64})#(\d{1,10})$/;
// a policy id and an asset name of up to 32 bytes, in lower-case hex
const UNIT = /^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/;
const TX_HASH = /^[0-9a-f]{64}$/;

/**
 * A failure of the provider. `code`: 'rejected' (the provider refused a transaction: 400 on submit
 * or evaluate, or a script that fails; `message` is the provider's reason, at most 300
 * characters), 'busy' (a request limit: 402, 418, 425, 429), 'unauthorized' (401, 403: the key
 * was refused), 'unavailable' (5xx, no answer in time, a network error, an answer that cannot be
 * read, any other status: also a 413, a request too large for the provider's tier, which no node
 * has judged). `status`: the HTTP status, null when no answer came.
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

const bigintOf = value => BigInt(String(value));

/** The parts of the output reference `ref` ('<tx hash>#<index>'): { txHash, index }, or undefined. */
const outRefParts = ref => {
    const match = typeof ref === 'string' ? OUT_REF.exec(ref) : null;
    return match ? { txHash: match[1], index: Number(match[2]) } : undefined;
};

/** Whether `unit` is a unit the providers may be asked for: a policy id and a hex asset name. */
const isUnit = unit => typeof unit === 'string' && UNIT.test(unit);

/** Assets of `lovelace` and `tokens` ([[policy id, asset name (hex), quantity]]). */
const assetsOf = (lovelace, tokens) => tokens.reduce((assets, [policyId, assetName, quantity]) => Assets.addByHex(assets, policyId, assetName, bigintOf(quantity)), Assets.fromLovelace(bigintOf(lovelace)));

/** The datum option of an output: its inline datum (CBOR hex) first, else its datum hash, else none. */
const datumOptionOf = (inlineCbor, hash) => {
    if (inlineCbor) {
        return new InlineDatum.InlineDatum({ data: Data.fromCBORHex(inlineCbor) });
    }
    return hash ? DatumHash.fromHex(hash) : undefined;
};

/** The SDK UTxO of an output: `txHash`, `index`, `address` (bech32), `assets`, `datumOption`, `scriptRef`. */
const utxoOf = ({ txHash, index, address, assets, datumOption, scriptRef }) =>
    new UTxO.UTxO({ transactionId: TransactionHash.fromHex(txHash), index: bigintOf(index), address: Address.fromBech32(address), assets, datumOption, scriptRef });

/** A script of `type` ('timelock', 'plutusV1', 'plutusV2', 'plutusV3') from its CBOR as the providers give it. */
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

/** Whether `script` hashes to `hash` (hex): a UTxO never comes back with another script than its own. */
const isScriptOf = (script, hash) => ScriptHash.toHex(ScriptHash.fromScript(script)) === hash;

// a cost model from a list of costs (by index) or a map of named costs
const costModelOf = costs => (Array.isArray(costs) ? Object.fromEntries(costs.map((cost, index) => [String(index), Number(cost)])) : Object.fromEntries(Object.entries(costs ?? {}).map(([name, cost]) => [name, Number(cost)])));

// The parameters' values, strictly: a number (or the text of one), not negative, else an Error.
// A 0 or {} in place of a missing value would build a transaction the node refuses, or one that
// overpays.
const numberOf = value => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!Number.isFinite(number) || number < 0) {
        throw new Error('a parameter that is no number');
    }
    return number;
};
const wholeOf = value => {
    const number = numberOf(value);
    if (!Number.isSafeInteger(number)) {
        throw new Error('a parameter that is no whole number');
    }
    return number;
};
const amountOf = value => {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return BigInt(value);
    }
    return BigInt(wholeOf(value));
};
const costsOf = costs => {
    const model = costModelOf(costs);
    if (costs === undefined || costs === null || Object.keys(model).length === 0 || !Object.values(model).every(Number.isFinite)) {
        throw new Error('a missing cost model');
    }
    return model;
};

/**
 * A provider's protocol parameters as Provider.ProtocolParameters, from the field names both
 * Blockfrost and Koios use (some integers as text), the costs of each language from
 * `costsOfLanguage(language)` (a list by index or a map by name). Every value the builder reads must be there and be a number;
 * the governance deposits, which it does not read, may be missing (0). An Error otherwise.
 */
const protocolParametersOf = (params, costsOfLanguage) => ({
    minFeeA: wholeOf(params.min_fee_a),
    minFeeB: wholeOf(params.min_fee_b),
    maxTxSize: wholeOf(params.max_tx_size),
    maxValSize: wholeOf(params.max_val_size),
    keyDeposit: amountOf(params.key_deposit),
    poolDeposit: amountOf(params.pool_deposit),
    drepDeposit: params.drep_deposit === undefined || params.drep_deposit === null ? 0n : amountOf(params.drep_deposit),
    govActionDeposit: params.gov_action_deposit === undefined || params.gov_action_deposit === null ? 0n : amountOf(params.gov_action_deposit),
    priceMem: numberOf(params.price_mem),
    priceStep: numberOf(params.price_step),
    maxTxExMem: amountOf(params.max_tx_ex_mem),
    maxTxExSteps: amountOf(params.max_tx_ex_steps),
    coinsPerUtxoByte: amountOf(params.coins_per_utxo_size),
    collateralPercentage: wholeOf(params.collateral_percent),
    maxCollateralInputs: wholeOf(params.max_collateral_inputs),
    minFeeRefScriptCostPerByte: numberOf(params.min_fee_ref_script_cost_per_byte),
    costModels: { PlutusV1: costsOf(costsOfLanguage('PlutusV1')), PlutusV2: costsOf(costsOfLanguage('PlutusV2')), PlutusV3: costsOf(costsOfLanguage('PlutusV3')) },
});

/**
 * The HTTP side of a provider at `url` (no trailing slash): `headers` go with every request, `key`
 * (the secret in them, if any) is masked in every message, `reasonOf(text)` reads a refusal's
 * reason from an answer. `tooLarge`: what a 413 means for this provider (a request size limit of
 * its tier, and what raises it); with it a 413 is 'unavailable' with that reason, logged at most
 * once an hour; without it a 413 is any other status. { failure, rejection, unreadable, request }.
 */
const createHttp = ({ url, headers = {}, key, fetch, timeoutMs, now, log, reasonOf, tooLarge }) => {
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
    let tooLargeLoggedAt = -Infinity;
    const refusedForSize = () => {
        if (now() - tooLargeLoggedAt >= REFUSAL_LOG_INTERVAL_MS) {
            tooLargeLoggedAt = now();
            log.warn(`chain provider refused a request for its size (413): ${tooLarge}`);
        }
    };

    /**
     * The answer of one request: { status, text }. `rejectable`: a 400 is the provider refusing a
     * transaction. 404 is answered as it is (each operation knows what it means); every other
     * status but 2xx is a ProviderError.
     */
    const request = async (operation, method, path, { body, contentType, rejectable = false } = {}) => {
        let status;
        let text;
        try {
            // no redirect: it would carry the key's header to wherever it points
            const response = await fetch(`${base}${path}`, {
                method,
                headers: { ...headers, ...(contentType ? { 'content-type': contentType } : {}) },
                body,
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
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
        if (status === 413 && tooLarge) {
            refusedForSize();
            throw failure('unavailable', `chain provider ${operation}: the provider refused the request for its size (413): ${tooLarge}`, status);
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

    return { failure, rejection, unreadable, request };
};

/**
 * The entries of a paged list, read page by page (`page(n)`: the entries of page n, from 1, or
 * undefined for none) until a page shorter than `pageSize`, at most MAX_UTXOS of them; more are
 * logged once (`log.warn`) and not read. A page that is no list is `unreadable(operation)`.
 */
const readPages = async ({ operation, pageSize, page, log, unreadable }) => {
    const found = [];
    for (let n = 1; n <= MAX_UTXOS / pageSize; n++) {
        const entries = await page(n);
        if (entries === undefined) {
            return found;
        }
        if (!Array.isArray(entries)) {
            throw unreadable(operation);
        }
        found.push(...entries);
        if (entries.length < pageSize) {
            return found;
        }
    }
    log.warn(`chain provider ${operation}: more than ${MAX_UTXOS} UTxOs, only the first ${MAX_UTXOS} are read`);
    return found;
};

/**
 * The protocol parameters of `read()`, read at most every 10 minutes (`now`): a read under way is
 * shared, a failed one is not kept.
 */
const cachedParameters = ({ now, read }) => {
    let params;
    return () => {
        if (params && now() - params.at < PARAMS_TTL_MS) {
            return params.answer;
        }
        const answer = read();
        const entry = { at: now(), answer };
        params = entry;
        answer.catch(() => {
            if (params === entry) {
                params = undefined;
            }
        });
        return answer;
    };
};

/** `tip` ({ blockNo, slot, hash, time }) if all of it is there, else `unreadable('tip')`. */
const checkedTip = (tip, unreadable) => {
    if (![tip.blockNo, tip.slot, tip.time].every(Number.isSafeInteger) || typeof tip.hash !== 'string') {
        throw unreadable('tip');
    }
    return tip;
};

module.exports = {
    BUSY,
    MAX_REASON,
    MAX_UTXOS,
    TX_HASH,
    ProviderError,
    assetsOf,
    bigintOf,
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
};
