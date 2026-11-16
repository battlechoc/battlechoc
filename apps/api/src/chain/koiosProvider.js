// The chain provider over Koios (CHAIN_PROVIDER_KIND=koios, the default): the same eight
// functions as the Blockfrost adapter in provider.js, answering the same Evolution SDK objects and
// failing with the same ProviderError codes (test/chainProviderContract.test.js holds the two to
// that). Koios's public tier needs no key; CHAIN_PROVIDER_KEY, if set, is a bearer token (the
// free registered tier's is enough and is the recommended setting: deploy/README.md) and goes in
// the Authorization header only.
//
// What Koios is asked (its API v1, read at preprod.koios.rest on 2026-11-15):
//   utxosOf    POST /account_utxos (a stake key's account, also an unregistered one) or
//              /address_utxos (a payment key's enterprise address), `_extended: true`
//   utxosAt    POST /address_utxos, for one asset with Koios's filter asset_list=cs.[…]
//   utxoByRef  POST /utxo_info (it says whether the output is spent: is_spent)
//   utxoByUnit POST /asset_utxos, the first unspent one
//   protocolParameters  GET /epoch_params of the latest epoch
//   tip        GET /tip
//   submit     POST /submittx (the CBOR's bytes; Koios answers 202 and the hash)
//   evaluate   POST /ogmios evaluateTransaction (Koios passes it to Ogmios 6)
// The lists are PostgREST's: pages by offset and limit (Koios gives at most 1000 rows a request),
// in a fixed order so no page skips or repeats a row; "nothing found" is an empty list, never a
// 404. Inline datums and reference scripts come with their bytes (`_extended`), so no second
// request is needed for a script; each script is checked against its hash all the same.

const { Assets, NativeScripts } = require('@evolution-sdk/evolution');
const { addressOfSubjectForFunds } = require('./addresses');
const { TX_HASH, assetsOf, bigintOf, cachedParameters, checkedTip, createHttp, datumOptionOf, isScriptOf, isUnit, outRefParts, parsed, protocolParametersOf, readPages, scriptOf, utxoOf } = require('./providerCommon');

const PAGE_SIZE = 500;
// Koios limits a request's body by its tier (1 kB public, 5 kB with a token); a deploy or mint
// transaction may be larger than the public tier allows: a 413 never reached a node
const TOO_LARGE = "the request is over Koios's request size limit of its tier (1 kB without a key); a free koios.rest token in CHAIN_PROVIDER_KEY raises it";
const ORDER = 'order=tx_hash.asc,tx_index.asc';

// Koios's reason of a refusal: Ogmios's error, PostgREST's message, cardano-submit-api's answer
// (a JSON object, written out), else the answer itself
const reasonOf = text => {
    const { json } = parsed(text);
    if (typeof json === 'string') {
        return json;
    }
    if (json?.error && typeof json.error === 'object') {
        return JSON.stringify(json.error);
    }
    if (typeof json?.message === 'string') {
        return json.message;
    }
    return json !== undefined && json !== null && typeof json === 'object' ? JSON.stringify(json) : String(text);
};

// ---------------------------------------------------------------------------------------------
// Koios's JSON as the SDK's objects

// a native script from the JSON Koios gives when it has no bytes for it (cardano-cli's form, as
// NativeScripts.toJSON writes it)
const nativeOf = json => {
    switch (json?.type) {
        case 'sig':
            if (typeof json.keyHash !== 'string' || !/^[0-9a-f]{56}$/.test(json.keyHash)) {
                throw new Error('a key hash of 28 bytes');
            }
            return { _tag: 'ScriptPubKey', keyHash: new Uint8Array(Buffer.from(json.keyHash, 'hex')) };
        case 'all':
            return { _tag: 'ScriptAll', scripts: json.scripts.map(nativeOf) };
        case 'any':
            return { _tag: 'ScriptAny', scripts: json.scripts.map(nativeOf) };
        case 'atLeast':
            return { _tag: 'ScriptNOfK', required: bigintOf(json.required), scripts: json.scripts.map(nativeOf) };
        case 'after':
            return { _tag: 'InvalidBefore', slot: bigintOf(json.slot) };
        case 'before':
            return { _tag: 'InvalidHereafter', slot: bigintOf(json.slot) };
        default:
            throw new Error(`unknown native script ${json?.type}`);
    }
};

// Koios's reference script ({ hash, type, bytes, value }) as the SDK's script, or a reason it is not
// one; db-sync's types are 'timelock' and 'multisig' (both native) and 'plutusV1' to 'plutusV3'
const referenceScriptOf = ({ hash, type, bytes, value }) => {
    const native = type === 'timelock' || type === 'multisig';
    let script;
    if (typeof bytes === 'string' && bytes !== '') {
        script = scriptOf(native ? 'timelock' : type, bytes);
    } else if (native && value) {
        script = new NativeScripts.NativeScript({ script: nativeOf(value) });
    } else {
        throw new Error('a reference script without its bytes');
    }
    if (typeof hash !== 'string' || !isScriptOf(script, hash)) {
        throw new Error('a reference script of another hash');
    }
    return script;
};

// a UTxO of Koios (`_extended`) as an SDK UTxO; an inline datum must come with its bytes, a
// reference script with its bytes (or a native one with its JSON) and its own hash
const koiosUtxoOf = entry => {
    if (entry.inline_datum && typeof entry.inline_datum.bytes !== 'string') {
        throw new Error('an inline datum without its bytes');
    }
    const tokens = (entry.asset_list ?? []).map(({ policy_id: policyId, asset_name: assetName, quantity }) => [policyId, assetName ?? '', quantity]);
    return utxoOf({
        txHash: entry.tx_hash,
        index: entry.tx_index,
        address: entry.address,
        assets: assetsOf(entry.value, tokens),
        datumOption: datumOptionOf(entry.inline_datum?.bytes, entry.datum_hash),
        scriptRef: entry.reference_script ? referenceScriptOf(entry.reference_script) : undefined,
    });
};

// Ogmios 6 names a redeemer's purpose; the Blockfrost adapter answers Ogmios 5's tags
const TAGS = { publish: 'certificate', withdraw: 'withdrawal' };

// ---------------------------------------------------------------------------------------------
// The provider

/**
 * The Koios API at `url` (no trailing slash, e.g. https://preprod.koios.rest/api/v1) with the
 * bearer token `key` (none for the public tier), for `network`. Every request: `${url}${path}`,
 * at most `timeoutMs`. `log` gets one warning when a wallet has more UTxOs than are read, and
 * `chain provider refused the key` at most once an hour (`now`) while the token is refused.
 */
const createKoiosProvider = ({ url, key, network, fetch = globalThis.fetch, timeoutMs = 10000, now = Date.now, log = console }) => {
    const token = typeof key === 'string' && key !== '' ? key : undefined;
    const headers = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const { failure, rejection, unreadable, request } = createHttp({ url, headers, key: token, fetch, timeoutMs, now, log, reasonOf, tooLarge: TOO_LARGE });

    // the JSON of an answer; a 404 is a wrong URL (Koios answers an empty list for "none")
    const jsonOf = (operation, { status, text }) => {
        if (status === 404) {
            throw failure('unavailable', `chain provider ${operation}: the provider answered 404`, status);
        }
        const { json } = parsed(text);
        if (json === undefined) {
            throw unreadable(operation);
        }
        return json;
    };
    const get = async (operation, path) => jsonOf(operation, await request(operation, 'GET', path));
    const post = async (operation, path, body) => jsonOf(operation, await request(operation, 'POST', path, { body: JSON.stringify(body), contentType: 'application/json' }));
    const list = async (operation, path, body) => {
        const answer = await post(operation, path, body);
        if (!Array.isArray(answer)) {
            throw unreadable(operation);
        }
        return answer;
    };

    // Koios's UTxO entries as SDK UTxOs: those it marks spent are none
    const utxosOfEntries = (operation, entries) => {
        try {
            return entries.filter(entry => entry?.is_spent !== true).map(koiosUtxoOf);
        } catch {
            throw unreadable(operation);
        }
    };

    // the UTxOs of a list route, page by page (at most 1000), `query` added to each page's
    const pages = async (operation, route, body, query = '') =>
        utxosOfEntries(operation, await readPages({ operation, pageSize: PAGE_SIZE, page: n => post(operation, `${route}?offset=${(n - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}&${ORDER}${query}`, body), log, unreadable }));

    const utxosAtAddress = async (operation, address, asset) => {
        if (!asset) {
            return pages(operation, '/address_utxos', { _addresses: [address], _extended: true });
        }
        // Koios filters by the asset; an instance that did not would answer others too
        const holding = isUnit(asset) && asset.length > 56 ? `&asset_list=cs.${encodeURIComponent(JSON.stringify([{ policy_id: asset.slice(0, 56), asset_name: asset.slice(56) }]))}` : '';
        const utxos = await pages(operation, '/address_utxos', { _addresses: [address], _extended: true }, holding);
        return utxos.filter(utxo => Assets.getByUnit(utxo.assets, asset) > 0n);
    };

    /**
     * The UTxOs of a wallet: for 'stake:<hash>' those of every address of its account (the
     * reward address), for 'pay:<hash>' those at its enterprise address. At most 1000.
     */
    const utxosOf = async subject => {
        const address = addressOfSubjectForFunds(subject, network);
        if (subject.startsWith('stake:')) {
            return pages('utxosOf', '/account_utxos', { _stake_addresses: [address], _extended: true });
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
        const entries = await list('utxoByRef', '/utxo_info', { _utxo_refs: [ref], _extended: true });
        const entry = entries.find(candidate => candidate?.tx_hash === parts.txHash && Number(candidate?.tx_index) === parts.index);
        if (!entry) {
            return undefined;
        }
        // Koios says whether an output is spent; a server that does not cannot be trusted with the
        // config's reference, so its answer is unreadable
        if (typeof entry.is_spent !== 'boolean') {
            throw unreadable('utxoByRef');
        }
        return utxosOfEntries('utxoByRef', [entry])[0];
    };

    /**
     * The unspent output that holds `unit` (policy id and asset name, hex), for a unit with one
     * holder (an NFT: the config NFT, an item's tokens): the first one Koios names; for a unit many
     * outputs hold, only that first one. Undefined if nobody holds it; an output it answers that
     * does not hold the unit is a provider that answers wrongly (ProviderError 'unavailable').
     */
    const utxoByUnit = async unit => {
        if (!isUnit(unit)) {
            return undefined;
        }
        const entries = await list('utxoByUnit', `/asset_utxos?is_spent=eq.false&limit=1&${ORDER}`, { _asset_list: [[unit.slice(0, 56), unit.slice(56)]], _extended: true });
        const [utxo] = utxosOfEntries('utxoByUnit', entries.slice(0, 1));
        if (utxo && Assets.getByUnit(utxo.assets, unit) <= 0n) {
            throw unreadable('utxoByUnit');
        }
        return utxo;
    };

    /** The protocol parameters of the latest epoch (Provider.ProtocolParameters), cached for 10 minutes. */
    const protocolParameters = cachedParameters({
        now,
        read: async () => {
            const answer = await get('protocolParameters', '/epoch_params?limit=1&order=epoch_no.desc');
            try {
                const [params] = answer;
                return protocolParametersOf(params, language => params.cost_models?.[language]);
            } catch {
                throw unreadable('protocolParameters');
            }
        },
    });

    /** The latest block: { blockNo, slot, hash, time (ms) }. */
    const tip = async () => {
        const answer = await get('tip', '/tip');
        const block = Array.isArray(answer) ? answer[0] : undefined;
        return checkedTip({ blockNo: block?.block_height, slot: block?.abs_slot, hash: block?.hash, time: block?.block_time * 1000 }, unreadable);
    };

    /** Submits the signed transaction `cborHex`; resolves with its hash. */
    const submit = async cborHex => {
        const { status, text } = await request('submit', 'POST', '/submittx', { body: Buffer.from(cborHex, 'hex'), contentType: 'application/cbor', rejectable: true });
        const { json } = parsed(text);
        const hash = typeof json === 'string' ? json : String(text).trim();
        if (status === 404 || !TX_HASH.test(hash)) {
            throw unreadable('submit');
        }
        return hash;
    };

    /**
     * The execution units Ogmios evaluates for the transaction `cborHex`: [{ tag, index, memory,
     * steps }]; a script that fails is 'rejected' with Ogmios's reason.
     */
    const evaluate = async cborHex => {
        const body = JSON.stringify({ jsonrpc: '2.0', method: 'evaluateTransaction', params: { transaction: { cbor: cborHex } }, id: null });
        const { status, text } = await request('evaluate', 'POST', '/ogmios', { body, contentType: 'application/json', rejectable: true });
        const answer = status === 404 ? undefined : parsed(text).json;
        if (answer?.error && typeof answer.error === 'object') {
            throw rejection(JSON.stringify(answer.error), status);
        }
        if (!Array.isArray(answer?.result)) {
            throw unreadable('evaluate');
        }
        try {
            return answer.result.map(({ validator, budget }) => {
                const units = { tag: TAGS[validator.purpose] ?? validator.purpose, index: Number(validator.index), memory: Number(budget.memory), steps: Number(budget.cpu) };
                if (typeof units.tag !== 'string' || ![units.index, units.memory, units.steps].every(Number.isSafeInteger)) {
                    throw new Error('not a redeemer');
                }
                return units;
            });
        } catch {
            throw unreadable('evaluate');
        }
    };

    return { utxosOf, utxosAt, utxoByRef, utxoByUnit, protocolParameters, tip, submit, evaluate };
};

module.exports = { createKoiosProvider };
