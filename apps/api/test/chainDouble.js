// The chain double: an in-memory blockchain for tests (never required from src/). Blocks, a
// mempool, rollbacks and faults, read through the two doors the server reads the chain through:
//
// - provider(): the real provider of src/chain/provider.js over `fetch`, which the double answers
//   from its blocks in Blockfrost's JSON (the endpoints the provider reads, paged as Blockfrost
//   pages, 404 for what the chain has never seen). Every test runs the real conversion to the
//   Evolution SDK's objects, and the double cannot drift from the provider.
// - index(): the functions of the chain index (Task 4's tip, holdersOf, tokensHeldBy, transaction,
//   mintOf; eventsAmong; burnsOf) in the shapes of the real one. Like the real one it sees only blocks, and
//   of them only what Yaci Store's filters keep (deploy/chain/application-plugins.yml): the
//   outputs that hold a user token of the policy (whole, with every other token in them), their
//   spends, and the mints and burns of user tokens. The reference tokens' outputs, mints and burns
//   are not in it.
//
// A block is { blockNo, slot, hash, time, txs: TxDescription[] }; the UTxO set is recomputed from
// the blocks on each read. A TxDescription is { txHash, ttlSlot: number | null, inputs: [{ txHash,
// index }], outputs: [Output], mint: { [unit]: string } } (negative quantities burn), an Output
// { address (bech32), lovelace: string, assets: { [unit]: string }, inlineDatum?: CBOR hex of
// Plutus data, referenceScript?: { type: 'timelock' | 'plutusV1' | 'plutusV2' | 'plutusV3', cbor:
// hex of the script's bytes as the SDK holds them } }. `ttlSlot` is the ledger's invalid_hereafter
// (tx.js's body.ttl): the transaction is valid only in slots < ttlSlot. Value is not checked to be
// conserved (the double's own transactions make value from nothing), nor are fees, witnesses or
// scripts.
//
// Two doors into the mempool:
// - submit(cborHex) (and the provider's submit through `fetch`) is the node the server talks to:
//   it refuses, as a node does, a transaction it cannot read, one whose ttlSlot the tip has
//   reached, and one with an input that is neither unspent on chain nor an output of a waiting
//   transaction, or that a waiting transaction already spends (BadInputsUTxO). Spending a waiting
//   transaction's output is fine (a chain in the mempool). The same hash again, waiting or on
//   chain, resolves with the hash (Blockfrost would answer 400; the double is kinder).
// - queue(cborHex) is "another node accepted it": the transaction waits without any check, and
//   the next block decides, as for the transactions a rollback returns. So two waiting
//   transactions can spend the same input; a block takes the first and drops the second.

const crypto = require('crypto');
const { blake2b } = require('@noble/hashes/blake2.js');
const { Address, AddressEras, KeyHash, NativeScripts, PlutusV1, PlutusV2, PlutusV3, ScriptHash } = require('@evolution-sdk/evolution');
const { cardano, chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { ProviderError, createProvider } = require('../src/chain/provider');
const { holderOf } = require('../src/chain/addresses');
const { scriptAddress } = require('../src/chain/blueprint');
const { IndexUnavailableError } = require('../src/chain/indexUnavailable');
const { MAX_ASSET_NAMES, holderKeysOf } = require('../src/chain/chainIndex');
const { loadParams } = require('./helpers/chain');

// The items policy the tests and the browser tests' API (e2eServer.js, CHAIN_POLICY_ID in
// apps/pwa/playwright.config.js) put the double on: the policy of test/helpers/chain.js
// fixtureContracts() (e2eServer.test.js fails when the two drift apart).
const TEST_POLICY_ID = '7b74a5bddaeee2acb07f59f8c9a98e4ebb3a09f0d827b085da71ee61';

const URL_BASE = 'https://chain-double.test/api/v0';
const HOUR_MS = 60 * 60 * 1000;
const PAGE_SIZE = 100;
// the lovelace of the outputs the double's own transactions make for a token
const TOKEN_LOVELACE = '1500000';
const STORE_LOVELACE = '2000000';

const HEX = /^(?:[0-9a-f]{2})*$/;
const TX_HASH = /^[0-9a-f]{64}$/;
const POLICY_ID = /^[0-9a-f]{56}$/;
const USER_NAME = new RegExp(`^${rules.USER_LABEL}[0-9a-f]{56}$`);

const sha256Hex = text => crypto.createHash('sha256').update(text).digest('hex');
const refOf = ({ txHash, index }) => `${txHash}#${index}`;

/**
 * Blockfrost's /epochs/latest/parameters for the parameters plan B's builder tests use
 * (loadParams()): the provider turns it into exactly that object.
 */
const TEST_PARAMETERS = (() => {
    const params = loadParams();
    return Object.freeze({
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
        min_utxo: String(params.coinsPerUtxoByte),
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
        cost_models: params.costModels,
        cost_models_raw: Object.fromEntries(Object.entries(params.costModels).map(([language, costs]) => [language, Object.values(costs)])),
    });
})();

/** A TxDescription as a hex-encoded UTF-8 JSON, the "CBOR" describeJsonTx reads. */
const jsonTx = description => Buffer.from(JSON.stringify(description), 'utf8').toString('hex');

/** The TxDescription of a hex-encoded UTF-8 JSON (jsonTx), for the double's own tests. */
const describeJsonTx = cborHex => {
    if (typeof cborHex !== 'string' || !HEX.test(cborHex)) {
        throw new TypeError('not hex');
    }
    return JSON.parse(Buffer.from(cborHex, 'hex').toString('utf8'));
};

// ---------------------------------------------------------------------------------------------
// Transactions, checked and in one form

const quantityOf = value => {
    const text = String(value);
    if (!/^-?\d+$/.test(text)) {
        throw new TypeError(`not a quantity: ${text}`);
    }
    return BigInt(text).toString();
};

const scriptOf = ({ type, cbor }) => {
    if (typeof cbor !== 'string' || !HEX.test(cbor)) {
        throw new TypeError('a reference script needs its cbor in hex');
    }
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
            throw new TypeError(`unknown script type ${type}`);
    }
};
const scriptHashOf = referenceScript => ScriptHash.toHex(ScriptHash.fromScript(scriptOf(referenceScript)));

const outputOf = ({ address, lovelace, assets = {}, inlineDatum, referenceScript } = {}) => {
    try {
        AddressEras.fromBech32(address);
    } catch {
        throw new TypeError(`not an address: ${address}`);
    }
    const output = {
        address,
        lovelace: quantityOf(lovelace),
        assets: Object.fromEntries(
            Object.entries(assets)
                .map(([unit, quantity]) => [unit, quantityOf(quantity)])
                .filter(([, quantity]) => quantity !== '0')
        ),
    };
    if (inlineDatum !== undefined && inlineDatum !== null) {
        if (typeof inlineDatum !== 'string' || inlineDatum === '' || !HEX.test(inlineDatum)) {
            throw new TypeError('an inline datum is CBOR in hex');
        }
        output.inlineDatum = inlineDatum;
    }
    if (referenceScript !== undefined && referenceScript !== null) {
        scriptHashOf(referenceScript);
        output.referenceScript = { type: referenceScript.type, cbor: referenceScript.cbor };
    }
    return output;
};

// a TxDescription, checked, its quantities as strings (throws a TypeError for anything else)
const txOf = description => {
    const { txHash, ttlSlot = null, inputs = [], outputs = [], mint = {} } = description ?? {};
    if (typeof txHash !== 'string' || !TX_HASH.test(txHash)) {
        throw new TypeError('a transaction needs a txHash of 64 hex digits');
    }
    if (ttlSlot !== null && !Number.isSafeInteger(ttlSlot)) {
        throw new TypeError('ttlSlot: a slot or null');
    }
    if (!Array.isArray(inputs) || !Array.isArray(outputs) || typeof mint !== 'object' || mint === null) {
        throw new TypeError('inputs and outputs are lists, mint an object');
    }
    return {
        txHash,
        ttlSlot,
        inputs: inputs.map(input => {
            if (!TX_HASH.test(input?.txHash) || !Number.isSafeInteger(Number(input?.index)) || Number(input.index) < 0) {
                throw new TypeError('an input is { txHash, index }');
            }
            return { txHash: input.txHash, index: Number(input.index) };
        }),
        outputs: outputs.map(outputOf),
        mint: Object.fromEntries(Object.entries(mint).map(([unit, quantity]) => [unit, quantityOf(quantity)])),
    };
};

// the stake credential of an address as `<kind>:<hex>`, null without one
const credentialOf = credential =>
    credential instanceof KeyHash.KeyHash ? `key:${KeyHash.toHex(credential)}` : credential instanceof ScriptHash.ScriptHash ? `script:${ScriptHash.toHex(credential)}` : null;
const stakeOf = bech32 => {
    const address = AddressEras.fromBech32(bech32);
    return address._tag === 'BaseAddress' ? credentialOf(address.stakeCredential) : null;
};

const without = (assets, ...units) => Object.fromEntries(Object.entries(assets).filter(([unit]) => !units.includes(unit)));

// ---------------------------------------------------------------------------------------------
// The double

/**
 * A chain for the items policy `policyId` on `network`, starting at the genesis tip (`firstBlockNo`,
 * `firstSlot`, `time` = now()). `describeTx(cborHex)` → TxDescription reads what `submit` gets;
 * `protocolParameters` is Blockfrost's JSON of /epochs/latest/parameters.
 */
const createChainDouble = ({
    policyId,
    network = cardano.Networks.preprod,
    now = () => Date.now(),
    firstBlockNo = 1000,
    firstSlot = 50000000,
    slotsPerBlock = 20,
    describeTx = describeJsonTx,
    protocolParameters = TEST_PARAMETERS,
} = {}) => {
    if (typeof policyId !== 'string' || !POLICY_ID.test(policyId)) {
        throw new TypeError('policyId: 56 hex digits');
    }
    const ours = unit => unit.length >= 56 && unit.startsWith(policyId);
    // what the index keeps: a user token of the policy, an output with one
    const userUnit = unit => unit.startsWith(policyId + rules.USER_LABEL);
    const kept = output => Object.keys(output.assets).some(userUnit);
    const blockOf = (blockNo, slot, txs) => ({ blockNo, slot, hash: sha256Hex(`${blockNo}:${txs.map(tx => tx.txHash).join(',')}`), time: now(), txs });

    const blocks = [blockOf(firstBlockNo, firstSlot, [])];
    // `network` with a slot configuration of the double's own: the genesis block's time at
    // firstSlot, one second per slot. Block times take the clock, so the real index's times (from
    // the slots) agree with the double's while a test advances the clock by slotsPerBlock seconds
    // per block, as the index contract does.
    const doubleNetwork = Object.freeze({ ...network, slotConfig: Object.freeze({ zeroTime: BigInt(blocks[0].time), zeroSlot: BigInt(firstSlot), slotLength: 1000 }) });
    let mempool = [];
    let held = false;
    let faults = { provider: null, index: null };
    let made = 0;
    // the hash of one of the double's own transactions
    const madeHash = kind => sha256Hex(`chain-double ${kind} ${made++}`);

    const tipBlock = () => blocks[blocks.length - 1];
    /** The latest block: { blockNo, slot, hash, time }. */
    const tip = () => {
        const { blockNo, slot, hash, time } = tipBlock();
        return { blockNo, slot, hash, time };
    };

    // What the blocks hold: every output ever made ({ txHash, index, output, block } by its
    // reference), who spent it (reference → spending transaction's hash), each transaction's block.
    const ledger = () => {
        const outputs = new Map();
        const spentBy = new Map();
        const included = new Map();
        for (const block of blocks) {
            for (const tx of block.txs) {
                included.set(tx.txHash, { tx, block });
                tx.inputs.forEach(input => spentBy.set(refOf(input), tx.txHash));
                tx.outputs.forEach((output, index) => outputs.set(refOf({ txHash: tx.txHash, index }), { txHash: tx.txHash, index, output, block }));
            }
        }
        const unspent = () => [...outputs].filter(([key]) => !spentBy.has(key)).map(([, entry]) => entry);
        const unspentAt = key => outputs.has(key) && !spentBy.has(key);
        return { outputs, spentBy, included, unspent, unspentAt };
    };

    /** The hashes of the transactions that wait, in submission order. */
    const mempoolHashes = () => mempool.map(tx => tx.txHash);

    // One block after the tip. It takes, in submission order, every waiting transaction whose
    // inputs are unspent (on chain, or made by an earlier transaction of the block) and not spent
    // by an earlier one, in a slot before its ttlSlot, not on chain yet. One that can never land
    // (expired, an input spent, already on chain, an input nobody makes) leaves the mempool; while
    // the mempool is held, the others wait.
    const produceBlock = () => {
        const state = ledger();
        const last = tipBlock();
        const slot = last.slot + slotsPerBlock;
        const taken = [];
        const takenHashes = new Set();
        const created = new Set();
        const spent = new Set();
        const kept = [];
        const keptOutputs = new Set();
        const available = key => (created.has(key) || state.unspentAt(key)) && !spent.has(key);
        for (const tx of mempool) {
            const keys = tx.inputs.map(refOf);
            const dead = state.included.has(tx.txHash) || takenHashes.has(tx.txHash) || (tx.ttlSlot !== null && slot >= tx.ttlSlot) || keys.some(key => state.spentBy.has(key) || spent.has(key));
            if (dead) {
                continue;
            }
            if (!held && keys.every(available)) {
                taken.push(tx);
                takenHashes.add(tx.txHash);
                keys.forEach(key => spent.add(key));
                tx.outputs.forEach((_, index) => created.add(refOf({ txHash: tx.txHash, index })));
            } else if (keys.every(key => available(key) || keptOutputs.has(key))) {
                kept.push(tx);
                tx.outputs.forEach((_, index) => keptOutputs.add(refOf({ txHash: tx.txHash, index })));
            }
        }
        mempool = kept;
        blocks.push(blockOf(last.blockNo + 1, slot, taken));
    };

    /** `count` blocks; the tip after them. */
    const produceBlocks = (count = 1) => {
        for (let i = 0; i < count; i++) {
            produceBlock();
        }
        return tip();
    };

    /**
     * Removes the last `count` blocks (never the genesis block); their transactions go back to the
     * front of the mempool, in chain order, unless `drop`. The tip after it.
     */
    const rollback = (count, { drop = false } = {}) => {
        if (!Number.isSafeInteger(count) || count < 0) {
            throw new TypeError('rollback: a number of blocks');
        }
        const removed = blocks.splice(Math.max(1, blocks.length - count));
        if (!drop) {
            mempool = [...removed.flatMap(block => block.txs), ...mempool];
        }
        return tip();
    };

    /** While `on`, blocks take no waiting transaction (one that can never land still leaves). */
    const holdMempool = on => {
        held = Boolean(on);
    };

    /**
     * The unspent outputs in the blocks that hold `unit` ({ txHash, index, output } copies), read
     * from the double itself: no fault of `fail` touches it (for the test routes that arrange
     * faults). The waiting transactions do not count.
     */
    const unspentHolding = unit =>
        ledger()
            .unspent()
            .filter(entry => entry.output.assets[unit] !== undefined && BigInt(entry.output.assets[unit]) > 0n)
            .map(({ txHash, index, output }) => ({ txHash, index, output: JSON.parse(JSON.stringify(output)) }));

    /** Copies of the waiting transactions' descriptions, in mempool order. */
    const waitingTransactions = () => JSON.parse(JSON.stringify(mempool));

    /** Drops every waiting transaction (none of them lands): their hashes. */
    const dropMempool = () => {
        const dropped = mempoolHashes();
        mempool = [];
        return dropped;
    };

    const enqueue = tx => {
        mempool.push(tx);
        return tx.txHash;
    };

    // the unspent outputs once the mempool has landed: where the double's own transactions look
    // for a token, so a test may mint and move before a block
    const outputsHolding = unit => {
        const outputs = new Map(ledger().unspent().map(entry => [refOf(entry), entry]));
        for (const tx of mempool) {
            tx.inputs.forEach(input => outputs.delete(refOf(input)));
            tx.outputs.forEach((output, index) => outputs.set(refOf({ txHash: tx.txHash, index }), { txHash: tx.txHash, index, output }));
        }
        return [...outputs.values()].filter(entry => entry.output.assets[unit] !== undefined && BigInt(entry.output.assets[unit]) > 0n);
    };

    const scriptAddressOfDouble = scriptAddress(policyId, network);

    const pairOf = assetName => {
        if (typeof assetName !== 'string' || !USER_NAME.test(assetName)) {
            throw new TypeError(`assetName: a user token's name (${rules.USER_LABEL} and 56 hex digits)`);
        }
        return { user: policyId + assetName, reference: policyId + rules.REFERENCE_LABEL + assetName.slice(rules.USER_LABEL.length) };
    };

    /** Sends `lovelace` and `assets` ({ unit: quantity }) to `address`: { txHash, index: 0 }. */
    const fund = (address, lovelace, assets = {}, { inlineDatum, referenceScript } = {}) => {
        const txHash = enqueue(txOf({ txHash: madeHash('fund'), ttlSlot: null, inputs: [], outputs: [{ address, lovelace, assets, inlineDatum, referenceScript }], mint: {} }));
        return { txHash, index: 0 };
    };

    /**
     * Mints the user token `assetName` (output 0, to `to`) and its reference token (output 1, at
     * `scriptAddress`, the items script's address): the transaction's hash.
     */
    const mintToken = ({ assetName, to }) => {
        const { user, reference } = pairOf(assetName);
        const outputs = [
            { address: to, lovelace: TOKEN_LOVELACE, assets: { [user]: '1' } },
            { address: scriptAddressOfDouble, lovelace: STORE_LOVELACE, assets: { [reference]: '1' } },
        ];
        return enqueue(txOf({ txHash: madeHash('mint'), ttlSlot: null, inputs: [], outputs, mint: { [user]: '1', [reference]: '1' } }));
    };

    /**
     * Moves the user token `assetName` to `to`, spending the output that holds it now; that
     * output's other assets stay at its address. The transaction's hash.
     */
    const moveToken = ({ assetName, to }) => {
        const { user } = pairOf(assetName);
        const [from] = outputsHolding(user);
        if (!from) {
            throw new Error(`the chain double: nobody holds ${assetName}`);
        }
        const { address, lovelace, assets } = from.output;
        const others = without(assets, user);
        const outputs =
            Object.keys(others).length === 0
                ? [{ address: to, lovelace, assets: { [user]: assets[user] } }]
                : [
                      { address: to, lovelace: TOKEN_LOVELACE, assets: { [user]: assets[user] } },
                      { address, lovelace, assets: others },
                  ];
        return enqueue(txOf({ txHash: madeHash('move'), ttlSlot: null, inputs: [from], outputs, mint: {} }));
    };

    /** Burns the pair of `assetName` where it is held (other assets stay); the transaction's hash. */
    const burnToken = ({ assetName }) => {
        const { user, reference } = pairOf(assetName);
        const holding = outputsHolding(user);
        if (holding.length === 0) {
            throw new Error(`the chain double: nobody holds ${assetName}`);
        }
        const spent = [...holding, ...outputsHolding(reference).filter(entry => !holding.some(other => refOf(other) === refOf(entry)))];
        const burned = unit => spent.reduce((sum, entry) => sum + BigInt(entry.output.assets[unit] ?? '0'), 0n);
        const mint = Object.fromEntries([user, reference].filter(unit => burned(unit) > 0n).map(unit => [unit, (-burned(unit)).toString()]));
        const outputs = spent
            .map(entry => ({ address: entry.output.address, lovelace: entry.output.lovelace, assets: without(entry.output.assets, user, reference) }))
            .filter(output => Object.keys(output.assets).length > 0);
        return enqueue(txOf({ txHash: madeHash('burn'), ttlSlot: null, inputs: spent, outputs, mint }));
    };

    const rejected = reason => new ProviderError('rejected', reason, 400);

    const isWaitingOrOnChain = (tx, state) => state.included.has(tx.txHash) || mempool.some(waiting => waiting.txHash === tx.txHash);

    /**
     * Submits the transaction `cborHex` (describeTx reads it) as a node takes it: its hash. The
     * same hash again while it waits or is on chain: its hash. ProviderError 'rejected' for a
     * transaction that cannot be read, a tip at or past its ttlSlot, an input that is neither
     * unspent on chain nor an output of a waiting transaction, or that a waiting transaction
     * already spends.
     */
    const submit = async cborHex => {
        let tx;
        try {
            tx = txOf(await describeTx(cborHex));
        } catch (error) {
            throw rejected(`DeserialiseFailure: ${error?.message ?? error}`);
        }
        const state = ledger();
        if (isWaitingOrOnChain(tx, state)) {
            return tx.txHash;
        }
        const { slot } = tipBlock();
        if (tx.ttlSlot !== null && slot >= tx.ttlSlot) {
            throw rejected(`OutsideValidityIntervalUTxO: the tip (slot ${slot}) has reached the ttl (slot ${tx.ttlSlot}, exclusive)`);
        }
        const waitingOutputs = new Set(mempool.flatMap(waiting => waiting.outputs.map((_, index) => refOf({ txHash: waiting.txHash, index }))));
        const spentByWaiting = new Set(mempool.flatMap(waiting => waiting.inputs.map(refOf)));
        const bad = tx.inputs.map(refOf).filter(key => (!state.unspentAt(key) && !waitingOutputs.has(key)) || spentByWaiting.has(key));
        if (bad.length > 0) {
            throw rejected(`BadInputsUTxO: ${bad.join(', ')}`);
        }
        return enqueue(tx);
    };

    /**
     * Puts the transaction `cborHex` (describeTx reads it) into the mempool without any check, as
     * if another node had accepted it: the next block decides whether it lands. Its hash (the
     * same hash again while it waits or is on chain: nothing new waits).
     */
    const queue = async cborHex => {
        const tx = txOf(await describeTx(cborHex));
        return isWaitingOrOnChain(tx, ledger()) ? tx.txHash : enqueue(tx);
    };

    /**
     * Faults until the next call: `provider` 'unavailable' (every request answers 503) or 'busy'
     * (429); `index` 'unavailable' (every index call throws IndexUnavailableError) or 'stale'
     * (index.tip() an hour old). fail({}) clears both.
     */
    const fail = ({ provider = null, index = null } = {}) => {
        if (![null, 'unavailable', 'busy'].includes(provider) || ![null, 'unavailable', 'stale'].includes(index)) {
            throw new TypeError('fail: provider null | unavailable | busy, index null | unavailable | stale');
        }
        faults = { provider, index };
    };

    // -----------------------------------------------------------------------------------------
    // Blockfrost's REST API over the blocks

    const respond = (status, json) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
    const notFound = () => respond(404, { status_code: 404, error: 'Not Found', message: 'The requested component has not been found.' });
    const badRequest = message => respond(400, { status_code: 400, error: 'Bad Request', message });

    const amountOf = ({ lovelace, assets }) => [{ unit: 'lovelace', quantity: lovelace }, ...Object.entries(assets).map(([unit, quantity]) => ({ unit, quantity }))];
    const outputFields = output => ({
        data_hash: output.inlineDatum ? Buffer.from(blake2b(Buffer.from(output.inlineDatum, 'hex'), { dkLen: 32 })).toString('hex') : null,
        inline_datum: output.inlineDatum ?? null,
        reference_script_hash: output.referenceScript ? scriptHashOf(output.referenceScript) : null,
    });
    const utxoEntry = ({ txHash, index, output, block }) => ({
        address: output.address,
        tx_hash: txHash,
        tx_index: index,
        output_index: index,
        amount: amountOf(output),
        block: block.hash,
        ...outputFields(output),
    });

    // a page of `entries` as Blockfrost answers ?count (1–100, default 100) and ?page (default 1)
    const paged = (entries, query) => {
        const count = query.has('count') ? Number(query.get('count')) : PAGE_SIZE;
        const page = query.has('page') ? Number(query.get('page')) : 1;
        if (!Number.isInteger(count) || count < 1 || count > PAGE_SIZE || !Number.isInteger(page) || page < 1) {
            return badRequest('querystring/count must be <= 100, querystring/page must be >= 1');
        }
        return respond(200, entries.slice((page - 1) * count, page * count));
    };

    const isAddress = bech32 => {
        try {
            AddressEras.fromBech32(bech32);
            return true;
        } catch {
            return false;
        }
    };
    const holds = unit => entry => entry.output.assets[unit] !== undefined;

    const accountUtxos = (stakeAddress, query) => {
        let account;
        try {
            account = AddressEras.fromBech32(stakeAddress);
        } catch {
            account = undefined;
        }
        if (account?._tag !== 'RewardAccount') {
            return badRequest('Invalid or malformed stake address format.');
        }
        const credential = credentialOf(account.stakeCredential);
        const state = ledger();
        const ofAccount = entry => stakeOf(entry.output.address) === credential;
        if (![...state.outputs.values()].some(ofAccount)) {
            return notFound();
        }
        return paged(state.unspent().filter(ofAccount).map(utxoEntry), query);
    };

    const addressUtxos = (address, unit, query) => {
        if (!isAddress(address)) {
            return badRequest('Invalid address for this network or malformed address format.');
        }
        const state = ledger();
        const atAddress = entry => entry.output.address === address;
        if (![...state.outputs.values()].some(atAddress)) {
            return notFound();
        }
        return paged(
            state
                .unspent()
                .filter(atAddress)
                .filter(unit ? holds(unit) : () => true)
                .map(utxoEntry),
            query
        );
    };

    const assetAddresses = (unit, query) => {
        const state = ledger();
        const known = [...state.included.values()].some(({ tx }) => tx.mint[unit] !== undefined) || [...state.outputs.values()].some(holds(unit));
        if (!known) {
            return notFound();
        }
        const quantities = new Map();
        for (const entry of state.unspent().filter(holds(unit))) {
            quantities.set(entry.output.address, (quantities.get(entry.output.address) ?? 0n) + BigInt(entry.output.assets[unit]));
        }
        return paged(
            [...quantities].map(([address, quantity]) => ({ address, quantity: quantity.toString() })),
            query
        );
    };

    const txUtxos = hash => {
        const state = ledger();
        const found = state.included.get(hash);
        if (!found) {
            return notFound();
        }
        const { tx } = found;
        const inputs = tx.inputs.map(input => {
            const spent = state.outputs.get(refOf(input));
            return {
                address: spent?.output.address ?? null,
                amount: spent ? amountOf(spent.output) : [],
                tx_hash: input.txHash,
                output_index: input.index,
                ...(spent ? outputFields(spent.output) : { data_hash: null, inline_datum: null, reference_script_hash: null }),
                collateral: false,
                reference: false,
            };
        });
        const outputs = tx.outputs.map((output, index) => ({
            address: output.address,
            amount: amountOf(output),
            output_index: index,
            ...outputFields(output),
            collateral: false,
            consumed_by_tx: state.spentBy.get(refOf({ txHash: hash, index })) ?? null,
        }));
        return respond(200, { hash, inputs, outputs });
    };

    const latestBlock = () => {
        const block = tipBlock();
        const previous = blocks[blocks.length - 2];
        return respond(200, {
            time: Math.floor(block.time / 1000),
            height: block.blockNo,
            hash: block.hash,
            slot: block.slot,
            tx_count: block.txs.length,
            previous_block: previous?.hash ?? null,
            next_block: null,
            confirmations: 0,
        });
    };

    const scriptByHash = (hash, part) => {
        const script = [...ledger().outputs.values()].map(entry => entry.output.referenceScript).find(candidate => candidate && scriptHashOf(candidate) === hash);
        if (!script) {
            return notFound();
        }
        return respond(200, part === 'cbor' ? { cbor: script.cbor } : { script_hash: hash, type: script.type, serialised_size: script.cbor.length / 2 });
    };

    const submitted = async body => {
        try {
            return respond(200, await submit(Buffer.from(body ?? []).toString('hex')));
        } catch (error) {
            if (error instanceof ProviderError && error.code === 'rejected') {
                return badRequest(error.message);
            }
            throw error;
        }
    };

    const EVALUATED = { type: 'jsonwsp/response', version: '1.0', servicename: 'ogmios', methodname: 'EvaluateTx', result: { EvaluationResult: {} } };

    const ROUTES = [
        ['GET', /^\/accounts\/([^/]+)\/utxos$/, ([address], query) => accountUtxos(address, query)],
        ['GET', /^\/addresses\/([^/]+)\/utxos$/, ([address], query) => addressUtxos(address, null, query)],
        ['GET', /^\/addresses\/([^/]+)\/utxos\/([^/]+)$/, ([address, unit], query) => addressUtxos(address, unit, query)],
        ['GET', /^\/assets\/([^/]+)\/addresses$/, ([unit], query) => assetAddresses(unit, query)],
        ['GET', /^\/txs\/([^/]+)\/utxos$/, ([hash]) => txUtxos(hash)],
        ['GET', /^\/epochs\/latest\/parameters$/, () => respond(200, protocolParameters)],
        ['GET', /^\/blocks\/latest$/, () => latestBlock()],
        ['GET', /^\/scripts\/([^/]+)$/, ([hash]) => scriptByHash(hash, 'info')],
        ['GET', /^\/scripts\/([^/]+)\/cbor$/, ([hash]) => scriptByHash(hash, 'cbor')],
        ['POST', /^\/tx\/submit$/, (_, __, body) => submitted(body)],
        ['POST', /^\/utils\/txs\/evaluate$/, () => respond(200, EVALUATED)],
    ];

    /** A fetch that answers Blockfrost's requests (any base URL ending in /api/v0) from the blocks. */
    const fetch = async (url, init = {}) => {
        if (faults.provider === 'unavailable') {
            return new Response('Service Unavailable', { status: 503 });
        }
        if (faults.provider === 'busy') {
            return respond(429, { status_code: 429, error: 'Project Over Limit', message: 'Usage is over limit.' });
        }
        const { pathname, searchParams } = new URL(url);
        const path = pathname.replace(/^\/api\/v0/, '');
        const method = (init.method || 'GET').toUpperCase();
        for (const [routeMethod, pattern, answer] of ROUTES) {
            const match = routeMethod === method ? pattern.exec(path) : null;
            if (match) {
                return answer(match.slice(1).map(decodeURIComponent), searchParams, init.body);
            }
        }
        return respond(501, { status_code: 501, error: 'Not Implemented', message: `the chain double serves no ${method} ${path}` });
    };

    const provider = createProvider({ kind: 'blockfrost', url: URL_BASE, key: 'chain-double', network, fetch, now });

    // -----------------------------------------------------------------------------------------
    // The index (Task 4's functions, over the same blocks)

    const indexed =
        read =>
        async (...args) => {
            if (faults.index === 'unavailable') {
                throw new IndexUnavailableError('the chain double\'s index is unavailable');
            }
            return read(...args);
        };

    // a row per unspent output the index keeps and policy token whose asset name `accept`s
    const rowsOf = accept =>
        ledger()
            .unspent()
            .filter(entry => kept(entry.output))
            .flatMap(entry =>
                Object.keys(entry.output.assets)
                    .filter(unit => ours(unit) && accept(unit.slice(56)))
                    .map(unit => ({
                        assetName: unit.slice(56),
                        address: entry.output.address,
                        ...holderOf(entry.output.address),
                        txHash: entry.txHash,
                        index: entry.index,
                        blockNo: entry.block.blockNo,
                        slot: entry.block.slot,
                    }))
            );

    // whether the real index sees `tx`: it mints or burns a user token, makes or spends an output
    // with one
    const touchesPolicy = (tx, state) => {
        const spent = input => state.outputs.get(refOf(input))?.output;
        return Object.keys(tx.mint).some(userUnit) || tx.outputs.some(kept) || tx.inputs.some(input => spent(input) !== undefined && kept(spent(input)));
    };

    const index = {
        /** The tip; with the 'stale' fault an hour old. */
        tip: indexed(() => (faults.index === 'stale' ? { ...tip(), time: now() - HOUR_MS } : tip())),
        /** The unspent outputs holding one of `assetNames` of the policy (at most MAX_ASSET_NAMES, more is a RangeError). */
        holdersOf: indexed(assetNames => {
            if (assetNames.length > MAX_ASSET_NAMES) {
                throw new RangeError(`holdersOf: at most ${MAX_ASSET_NAMES} asset names per call`);
            }
            const wanted = new Set(assetNames);
            return rowsOf(name => wanted.has(name));
        }),
        /** The unspent outputs of the policy's user tokens held by one of `subjects`. */
        tokensHeldBy: indexed(subjects => {
            const wanted = new Set(subjects);
            return rowsOf(name => name.startsWith(rules.USER_LABEL)).filter(row => (row.stake !== null && wanted.has(row.stake)) || (row.pay !== null && wanted.has(row.pay)));
        }),
        /** The block of the transaction `hash`: { blockNo, slot } | null. */
        transaction: indexed(hash => {
            const state = ledger();
            const found = state.included.get(hash);
            return found && touchesPolicy(found.tx, state) ? { blockNo: found.block.blockNo, slot: found.block.slot } : null;
        }),
        /** The mint of the user token `assetName` (the first): { txHash, blockNo, time } | null. */
        mintOf: indexed(assetName => {
            const unit = policyId + assetName;
            if (!userUnit(unit)) {
                return null;
            }
            for (const block of blocks) {
                const tx = block.txs.find(candidate => candidate.mint[unit] !== undefined && BigInt(candidate.mint[unit]) > 0n);
                if (tx) {
                    return { txHash: tx.txHash, blockNo: block.blockNo, time: block.time };
                }
            }
            return null;
        }),
        /**
         * The names among `assetNames` of the policy that a block mints, and those a block burns (at
         * most MAX_ASSET_NAMES, more is a RangeError): { minted: Set, burned: Set }.
         */
        eventsAmong: indexed(assetNames => {
            if (assetNames.length > MAX_ASSET_NAMES) {
                throw new RangeError(`eventsAmong: at most ${MAX_ASSET_NAMES} asset names per call`);
            }
            const units = sign => new Set(blocks.flatMap(block => block.txs.flatMap(tx => Object.keys(tx.mint).filter(unit => userUnit(unit) && sign(BigInt(tx.mint[unit]))))));
            const [minted, burned] = [units(quantity => quantity > 0n), units(quantity => quantity < 0n)];
            return { minted: new Set(assetNames.filter(name => minted.has(policyId + name))), burned: new Set(assetNames.filter(name => burned.has(policyId + name))) };
        }),
        /**
         * The burns of `assetNames` of the policy in blocks, one per (transaction, name), with the
         * keys of the spent output's address that held the token (at most MAX_ASSET_NAMES, more is
         * a RangeError): [{ assetName, txHash, block, holder: { stake, payment, script } }].
         */
        burnsOf: indexed(assetNames => {
            if (assetNames.length > MAX_ASSET_NAMES) {
                throw new RangeError(`burnsOf: at most ${MAX_ASSET_NAMES} asset names per call`);
            }
            const wanted = new Set(assetNames.map(name => policyId + name));
            const state = ledger();
            const order = entry => `${String(entry.block).padStart(16, '0')}#${entry.txHash}#${entry.assetName}`;
            return blocks.flatMap(block =>
                block.txs.flatMap(tx =>
                    Object.keys(tx.mint)
                        .filter(unit => wanted.has(unit) && userUnit(unit) && BigInt(tx.mint[unit]) < 0n)
                        .sort()
                        .flatMap(unit => {
                            const held = tx.inputs.map(input => state.outputs.get(refOf(input))).find(spent => spent && BigInt(spent.output.assets[unit] ?? '0') > 0n);
                            return held ? [{ assetName: unit.slice(56), txHash: tx.txHash, block: block.blockNo, holder: holderKeysOf(held.output.address) }] : [];
                        })
                )
            ).sort((a, b) => order(a).localeCompare(order(b)));
        }),
    };

    // -----------------------------------------------------------------------------------------
    // Addresses for tests

    const keyAddress = (payment, stake) =>
        Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: KeyHash.fromHex(payment), ...(stake ? { stakingCredential: KeyHash.fromHex(stake) } : {}) }));

    /** The base (or 'enterprise') address of test/helpers/cardano.js `keys` on the double's network. */
    const addressOf = (keys, kind = 'base') => {
        if (kind === 'base') {
            return keyAddress(keys.paymentKeyHashHex, keys.stakeKeyHashHex);
        }
        if (kind === 'enterprise') {
            return keyAddress(keys.paymentKeyHashHex);
        }
        throw new TypeError(`addressOf: kind 'base' or 'enterprise', not ${kind}`);
    };

    /** A fresh base address of keys nobody has (for "sold to a stranger"). */
    const newAddress = () => keyAddress(crypto.randomBytes(28).toString('hex'), crypto.randomBytes(28).toString('hex'));

    /** Copies of the blocks, oldest first (chainIndex.test.js writes Yaci Store's rows from them). */
    const blockList = () => JSON.parse(JSON.stringify(blocks));

    return {
        url: URL_BASE,
        fetch,
        scriptAddress: scriptAddressOfDouble,
        tip,
        blocks: blockList,
        network: doubleNetwork,
        mempool: mempoolHashes,
        produceBlocks,
        rollback,
        holdMempool,
        dropMempool,
        unspentHolding,
        waitingTransactions,
        fund,
        mintToken,
        moveToken,
        burnToken,
        submit,
        queue,
        fail,
        provider: () => provider,
        index: () => index,
        addressOf,
        newAddress,
    };
};

module.exports = { TEST_PARAMETERS, TEST_POLICY_ID, createChainDouble, describeJsonTx, jsonTx };
