// What the chain scripts share (deploy.js, update-config.js, new-key.js): the network and the
// provider from the environment, the Blockfrost client, waiting for a block, the check of a config
// datum before it is written, building, signing and showing an admin's transaction, and running
// a script so that nothing secret reaches the terminal.
//
// The owner runs these scripts by hand against preprod with his own key and Blockfrost project id.
// The project id goes into a request header only; the key stays in its file and in memory. A
// script's error is printed as its message alone, with the project id taken out.

const util = require('util');
const {
    Address,
    Assets,
    AssetName,
    Effect,
    Either,
    InlineDatum,
    KeyHash,
    PolicyId,
    ScriptHash,
    Time,
    Transaction,
    TransactionBody,
    TransactionHash,
    preprod: preprodChain,
} = require('@evolution-sdk/evolution');
// public subpaths of the package (its `./*` export), not in the root index
const { makeTxBuilder } = require('@evolution-sdk/evolution/sdk/builders/TransactionBuilder');
const { BlockfrostProvider } = require('@evolution-sdk/evolution/sdk/provider/Blockfrost');
const { createAikenEvaluator } = require('@evolution-sdk/aiken-uplc');
const { cardano, chain } = require('@battlechoc/battlechoc-shared-functions');
const { decodeConfigDatum, encodeConfigDatum, isFeeAsset } = require('../../src/chain/blueprint');
const { maskKeys, secretShapeOf } = require('../../src/chain/keys');
const { addServerWitness } = require('../../src/chain/tx');

const { preprod } = cardano.Networks;

/** A refusal for the owner: its message says what is wrong and what to do. */
class ScriptError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ScriptError';
    }
}

// ---------------------------------------------------------------------------------------------
// The environment and the command line

/** The network of CARDANO_NETWORK: preprod. Anything else is refused in this version. */
const networkFromEnv = env => {
    if (env.CARDANO_NETWORK !== 'preprod') {
        throw new ScriptError(`CARDANO_NETWORK must be preprod (the only network these scripts deploy to in this version), not ${JSON.stringify(env.CARDANO_NETWORK ?? '')}`);
    }
    return preprod;
};

// The argument of `argv` that has the shape of a secret (secretShapeOf: a key, in bech32 or hex,
// or recovery words, anywhere in it, so in any segment of a path), with the option it is the
// value of (`where`, named only if `options` knows it); undefined if there is none.
const secretArgumentOf = (argv, options) => {
    const known = name => typeof name === 'string' && name.startsWith('--') && Object.prototype.hasOwnProperty.call(options, name.slice(2));
    for (let at = 0; at < argv.length; at++) {
        const shape = secretShapeOf(argv[at]);
        if (shape) {
            const joined = argv[at].startsWith('--') && argv[at].includes('=') ? argv[at].slice(0, argv[at].indexOf('=')) : undefined;
            const previous = argv[at - 1];
            const where = known(joined) ? joined : known(previous) && options[previous.slice(2)].type === 'string' ? previous : undefined;
            return { shape, where: where ?? 'an argument without an option' };
        }
    }
    return undefined;
};

/** The arguments of `argv` that have a secret's shape, whole and as the value of --option=value. */
const secretArgumentsOf = argv => argv.flatMap(arg => [arg, arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : '']).filter(arg => arg && secretShapeOf(arg) !== null);

/**
 * The command line `argv` by util.parseArgs `options` (strict). A ScriptError for a bad one, and
 * first, before anything is read, created or printed, for any argument that has the shape of a
 * key or of recovery words (as a value, a path or a segment of a path): it is never used, and
 * never repeated.
 */
const argsOf = (argv, options) => {
    const secret = secretArgumentOf(argv, options);
    if (secret) {
        throw new ScriptError(
            secret.shape === 'key'
                ? `${secret.where}: that is a key, not a file or a value (it is not repeated here)`
                : `${secret.where}: those are recovery words, not a file or a value (they are not repeated here)`
        );
    }
    try {
        return util.parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
    } catch (error) {
        throw new ScriptError(maskKeys(error.message, secretArgumentsOf(argv)));
    }
};

/** Whether `value` is a key hash: 28 bytes in lower-case hex. */
const isKeyHash = value => typeof value === 'string' && /^[0-9a-f]{56}$/.test(value);

/** `text` with every one of `secrets` (empty ones ignored) replaced by <redacted>. */
const redact = (text, secrets) => secrets.filter(Boolean).reduce((result, secret) => result.split(secret).join('<redacted>'), String(text));

/**
 * Runs `main` ({ argv, env, log, ...the rest of `args` }) with what it prints going to `out`, one
 * line at a time, and a failure to `err` as its message alone (no stack, no cause: they may carry
 * what an SDK parsed). Every line passes through maskKeys (with the command line's secret-shaped
 * arguments as known secrets) and has the provider's project id redacted. Answers the exit code:
 * 0, or 1 on a failure.
 */
const runMain = async (main, { out, err, ...args }) => {
    const mask = text => maskKeys(redact(text, [args.env?.CHAIN_PROVIDER_KEY]), secretArgumentsOf(args.argv ?? []));
    try {
        await main({ ...args, log: line => out(mask(String(line))) });
        return 0;
    } catch (error) {
        err(mask(`error: ${error?.message ?? error}`));
        return 1;
    }
};

/** Runs `main` as the script of this process (runMain on its arguments, stdout and stderr). */
const runScript = main => {
    runMain(main, { argv: process.argv.slice(2), env: process.env, out: line => console.log(line), err: line => console.error(line) }).then(code => {
        process.exitCode = code;
    });
};

// ---------------------------------------------------------------------------------------------
// The provider

// What a provider failure was, from the errors under it. The SDK fails with a ProviderError
// ("Blockfrost <operation> failed") whose `cause` chain leads to what happened: an
// HttpResponseError (`status`, and Blockfrost's JSON body in its message after "non 2xx status
// code : "), an HttpRequestError when no response came (its `cause` is fetch's error, with the
// system's code in its own `cause`), or a ProviderError of the SDK's own ("No address found
// holding unit …"). Read by `_tag`: the classes are internal to the SDK.
const MAX_DEPTH = 10;
const causesOf = error => {
    const causes = [];
    for (let cause = error; cause !== undefined && cause !== null && causes.length < MAX_DEPTH; cause = cause.cause) {
        causes.push(cause);
    }
    return causes;
};
const NON_2XX = /^non 2xx status code : /;
const MAX_REASON = 4000;
const parsedOrUndefined = text => {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
};
// Blockfrost's `message` from a body, else the body itself; a submit error's message is itself a
// JSON string, which is unquoted
const reasonOfBody = text => {
    const message = parsedOrUndefined(text)?.message;
    const reason = typeof message === 'string' ? message : String(text);
    const unquoted = parsedOrUndefined(reason);
    return (typeof unquoted === 'string' ? unquoted : reason).slice(0, MAX_REASON);
};
// the system's reason a request got no response: the innermost code (ENOTFOUND …) or message
const unreachableReasonOf = error => {
    const causes = causesOf(error);
    return causes.map(cause => cause?.code).find(Boolean) ?? causes.at(-1)?.message ?? 'no answer';
};
const failureOf = error => {
    const causes = causesOf(error);
    const response = causes.find(cause => cause?._tag === 'HttpResponseError' && typeof cause.status === 'number');
    if (response) {
        return { status: response.status, reason: reasonOfBody(String(response.message ?? '').replace(NON_2XX, '')) };
    }
    const request = causes.find(cause => cause?._tag === 'HttpRequestError');
    if (request) {
        return { unreachable: unreachableReasonOf(request.cause) };
    }
    // the SDK's own failures; the outer "Blockfrost … failed" says nothing the operation does not
    return { reason: causes.map(cause => cause?.message).filter(message => message && !/^Blockfrost \w+ failed$/.test(message)).join('; ') || String(error?.message ?? error) };
};
// the SDK's answers for a unit no UTxO holds
const NO_HOLDER = /^No (?:address|UTxO) found/;
const holdsNothing = error => causesOf(error).some(cause => (cause?._tag === 'ProviderError' && NO_HOLDER.test(cause.message ?? '')) || (cause?._tag === 'HttpResponseError' && cause.status === 404));

/**
 * The chain through Blockfrost (CHAIN_PROVIDER_URL, CHAIN_PROVIDER_KEY = the project id): {
 * params (protocol parameters), utxosAt(bech32), utxoByUnit(unit) (undefined if none), tip ({
 * slot, block }), submit(cbor) → tx id, blockOf(txId) → the block height, null while it is in no
 * block }. The SDK's BlockfrostProvider reads and submits; `fetch` (globalThis.fetch by default)
 * reads the tip and a transaction's block.
 *
 * A failure is a ScriptError that names the operation and what went wrong: the provider refused
 * the project id (401, 403), a limit (402, 429), the provider refused the transaction (400 on
 * submit, with the ledger's reason), another status with Blockfrost's message, or the host that
 * could not be reached. Its `refused` says the provider answered with a 4xx, so a refused submit
 * certainly did not reach the chain; any other failure of a submit may have. The project id is in
 * no message.
 */
const providerFromEnv = (env, { fetch } = {}) => {
    for (const name of ['CHAIN_PROVIDER_URL', 'CHAIN_PROVIDER_KEY']) {
        if (!env[name]) {
            throw new ScriptError(`${name} is not set`);
        }
    }
    const baseUrl = env.CHAIN_PROVIDER_URL.replace(/\/+$/, '');
    let host;
    try {
        host = new URL(baseUrl).host;
    } catch {
        throw new ScriptError('CHAIN_PROVIDER_URL is not a URL (https://cardano-preprod.blockfrost.io/api/v0)');
    }
    const projectId = env.CHAIN_PROVIDER_KEY;
    const provider = new BlockfrostProvider(baseUrl, projectId);

    const failure = (operation, { status, reason, unreachable }) => {
        let message;
        if (unreachable !== undefined) {
            message = `${operation}: could not reach ${host} (${unreachable}); check CHAIN_PROVIDER_URL and the connection`;
        } else if (status === 401 || status === 403) {
            message = `${operation}: the provider refused the project id (${status}: ${reason}); check CHAIN_PROVIDER_KEY: it must be the id of a preprod project`;
        } else if (status === 402 || status === 429) {
            message = `${operation}: the provider's request limit is reached (${status}: ${reason}); try again later`;
        } else if (status === 400 && operation === 'submit') {
            message = `submit: the provider refused the transaction (400): ${reason}`;
        } else if (status !== undefined) {
            message = `${operation}: the provider answered ${status}: ${reason}`;
        } else {
            message = `${operation} failed: ${reason}`;
        }
        const error = new ScriptError(maskKeys(redact(message, [projectId])));
        error.refused = status !== undefined && status >= 400 && status < 500;
        return error;
    };
    // the SDK's call `effect` run to an Either, so its failure arrives as the ProviderError itself
    const sdk = async (operation, effect, { absent } = {}) => {
        let result;
        try {
            result = await Effect.runPromise(Effect.either(effect));
        } catch (defect) {
            throw failure(operation, { reason: String(defect?.message ?? defect) });
        }
        if (Either.isRight(result)) {
            return result.right;
        }
        if (absent && holdsNothing(result.left)) {
            return undefined;
        }
        throw failure(operation, failureOf(result.left));
    };
    // a GET of Blockfrost's REST API: the JSON, null for a 404
    const get = async (operation, route) => {
        let response;
        try {
            response = await (fetch ?? globalThis.fetch)(`${baseUrl}${route}`, { headers: { project_id: projectId } });
        } catch (error) {
            throw failure(operation, { unreachable: unreachableReasonOf(error) });
        }
        if (response.status === 404) {
            return null;
        }
        const text = await response.text();
        if (!response.ok) {
            throw failure(operation, { status: response.status, reason: reasonOfBody(text) });
        }
        return JSON.parse(text);
    };
    return {
        params: () => sdk('params', provider.effect.getProtocolParameters()),
        utxosAt: address => sdk('utxosAt', provider.effect.getUtxos(Address.fromBech32(address))),
        utxoByUnit: unit => sdk('utxoByUnit', provider.effect.getUtxoByUnit(unit), { absent: true }),
        tip: async () => {
            const block = await get('tip', '/blocks/latest');
            if (!block) {
                throw failure('tip', { status: 404, reason: 'no latest block; check CHAIN_PROVIDER_URL' });
            }
            return { slot: block.slot, block: block.height };
        },
        submit: async cbor => TransactionHash.toHex(await sdk('submit', provider.effect.submitTx(Transaction.fromCBORHex(cbor)))),
        blockOf: async txId => {
            const tx = await get('blockOf', `/txs/${txId}`);
            return tx ? tx.block_height : null;
        },
    };
};

/**
 * The height of the block that holds `txId`, asked of `client` every `interval` ms until
 * `timeout` ms have passed; null if it is in none by then.
 */
const waitForBlock = async ({ client, txId, interval = 5_000, timeout = chain.TX_VALIDITY_MS, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) => {
    for (let waited = 0; ; waited += interval) {
        const block = await client.blockOf(txId);
        if (block !== null && block !== undefined) {
            return block;
        }
        if (waited + interval > timeout) {
            return null;
        }
        await sleep(interval);
    }
};

// ---------------------------------------------------------------------------------------------
// The config datum before it is written

const isCount = value => Number.isSafeInteger(value) && value >= 0;
const fieldsOf = (value, allowed, what) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ScriptError(`${what} is not an object`);
    }
    const unknown = Object.keys(value).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw new ScriptError(`${what}: unknown field ${unknown.join(', ')} (the fields are ${allowed.join(', ')})`);
    }
    const missing = allowed.filter(key => !(key in value));
    if (missing.length > 0) {
        throw new ScriptError(`${what}: missing ${missing.join(', ')}`);
    }
};

const checkFee = (option, index, network) => {
    const what = `fees[${index}]`;
    fieldsOf(option, ['asset', 'amounts', 'receivers'], what);
    if (!isFeeAsset(option.asset)) {
        throw new ScriptError(`${what}.asset is neither 'lovelace' nor a policy id (56 hex) with an asset name (up to 64 hex), in lower case`);
    }
    if (!Array.isArray(option.amounts) || option.amounts.length !== chain.TIER_ORDER.length || !option.amounts.every(isCount)) {
        throw new ScriptError(`${what}.amounts must be ${chain.TIER_ORDER.length} whole numbers, none negative, one per tier (${chain.TIER_ORDER.join(', ')})`);
    }
    if (!Array.isArray(option.receivers) || option.receivers.length === 0) {
        throw new ScriptError(`${what}.receivers must name at least one receiver`);
    }
    const seen = new Set();
    option.receivers.forEach((receiver, at) => {
        const where = `${what}.receivers[${at}]`;
        fieldsOf(receiver, ['address', 'share'], where);
        let address;
        try {
            address = Address.fromBech32(receiver.address);
        } catch {
            throw new ScriptError(`${where}.address is not a bech32 address`);
        }
        if (address.networkId !== network.networkId) {
            throw new ScriptError(`${where}.address is an address of another network than ${network.name}`);
        }
        if (!Number.isSafeInteger(receiver.share) || receiver.share <= 0) {
            throw new ScriptError(`${where}.share must be a whole number above 0`);
        }
        const canonical = Address.toBech32(address);
        if (seen.has(canonical)) {
            throw new ScriptError(`${where}.address is named twice in this option`);
        }
        seen.add(canonical);
    });
};

/**
 * `config` (the form encodeConfigDatum takes), checked before it is written by the rules the config
 * validator applies (rules.ak `well_formed_config`): at least one server key, every key 28 bytes,
 * 1 ≤ threshold ≤ the distinct admins, and every fee option with an asset, one amount per tier,
 * none negative, at least one receiver on `network`, each share above 0 and no address twice;
 * and then encoded and decoded again, which must give the same config. Answers `config`; a
 * ScriptError names the first field that is wrong.
 */
const checkConfigDatum = (config, network) => {
    fieldsOf(config, ['serverKeys', 'admins', 'threshold', 'paused', 'fees'], 'the config');
    const { serverKeys, admins, threshold, paused, fees } = config;
    if (!Array.isArray(serverKeys) || serverKeys.length === 0 || !serverKeys.every(isKeyHash)) {
        throw new ScriptError('the server keys must be at least one key hash, each 28 bytes (56 hex)');
    }
    if (!Array.isArray(admins) || !admins.every(isKeyHash)) {
        throw new ScriptError('the admins must be key hashes, each 28 bytes (56 hex)');
    }
    const distinctAdmins = new Set(admins).size;
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > distinctAdmins) {
        throw new ScriptError(`the threshold must be between 1 and the number of distinct admins (${distinctAdmins})`);
    }
    if (typeof paused !== 'boolean') {
        throw new ScriptError('paused must be true or false');
    }
    if (!Array.isArray(fees)) {
        throw new ScriptError('fees must be a list of fee options ([] for no fee)');
    }
    fees.forEach((option, index) => checkFee(option, index, network));
    let decoded;
    try {
        decoded = decodeConfigDatum(encodeConfigDatum(config), network);
    } catch (error) {
        throw new ScriptError(`the config does not survive its encoding (${error.message})`);
    }
    if (!util.isDeepStrictEqual(decoded, config)) {
        throw new ScriptError('the config does not survive its encoding: it reads back as another config');
    }
    return config;
};

// ---------------------------------------------------------------------------------------------
// The admin's wallet and transactions

/** The key `key` (loadKey) on `network`: { keyHash, address (its enterprise address) }. */
const adminOf = (key, network) => ({
    keyHash: key.keyHash,
    address: Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: KeyHash.fromHex(key.keyHash) })),
});

/** `utxos` the admin's wallet may spend: at a key address, without a datum or a script. */
const spendableOf = utxos => utxos.filter(utxo => utxo.address.paymentCredential instanceof KeyHash.KeyHash && utxo.datumOption === undefined && utxo.scriptRef === undefined);

/** The id (the body hash) of the transaction `cbor` (hex). */
const txIdOf = cbor => TransactionHash.toHex(TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cbor, 'hex'))));

/** `cbor` with the witness of `key` ({ privateKey }, loadKey) added. */
const signWith = (cbor, key) => addServerWitness({ cbor, bodyHash: txIdOf(cbor), key }).cbor;

// the SDK's message and, for a failed evaluation, where it failed (never a key)
const reasonOf = error => [error?.message ?? String(error), ...(error?.cause?.failures ?? []).map(failure => failure.validationError)].filter(Boolean).join('; ');

/**
 * The transaction of `builder` (its inputs, scripts, mints and outputs added), valid for
 * TX_VALIDITY_MS from `tip`, with `signers` (key hashes) as its required signers, balanced from
 * the admin's spendable `adminUtxos` with the change and the collateral return to `admin.address`.
 * The SDK evaluates the scripts on the way with the local Aiken evaluator, so a transaction the
 * validators refuse does not build. { cbor, txId, fee (lovelace) }; a ScriptError "does not
 * build" with the SDK's reason otherwise.
 */
const buildAdminTx = async (builder, { admin, adminUtxos, signers = [], params, tip, network }) => {
    if (network.name !== 'preprod') {
        throw new ScriptError('only preprod in this version');
    }
    builder.setValidity({ to: Time.slotToUnixTime(BigInt(tip.slot + chain.TX_VALIDITY_MS / 1000), preprodChain.slotConfig) });
    for (const signer of signers) {
        builder.addSigner({ keyHash: KeyHash.fromHex(signer) });
    }
    let cbor;
    try {
        const result = await builder.build({
            availableUtxos: spendableOf(adminUtxos),
            changeAddress: Address.fromBech32(admin.address),
            fullProtocolParameters: params,
            evaluator: createAikenEvaluator,
            setCollateral: BigInt(chain.COLLATERAL_LOVELACE),
        });
        cbor = Transaction.toCBORHex(await result.toTransaction());
    } catch (error) {
        throw new ScriptError(`the transaction does not build: ${reasonOf(error)}`);
    }
    return { cbor, txId: txIdOf(cbor), fee: Number(Transaction.fromCBORHex(cbor).body.fee) };
};

/** A new transaction builder for `network`. */
const builderFor = network => {
    if (network.name !== 'preprod') {
        throw new ScriptError('only preprod in this version');
    }
    return makeTxBuilder({ chain: preprodChain });
};

/** The output reference of the output of `cbor` that holds `unit` once: 'txid#index'. */
const outputRefOf = (cbor, unit) => {
    const index = Transaction.fromCBORHex(cbor).body.outputs.findIndex(output => Assets.getByUnit(output.assets, unit) === 1n);
    return index === -1 ? undefined : `${txIdOf(cbor)}#${index}`;
};

const credentialHex = credential => (credential instanceof KeyHash.KeyHash ? KeyHash.toHex(credential) : ScriptHash.toHex(credential));
const assetsText = assets =>
    [
        `${Assets.lovelaceOf(assets)} lovelace`,
        ...Assets.flatten(assets).map(([policy, name, quantity]) => `${quantity} ${PolicyId.toHex(policy)}.${AssetName.toHex(name)}`),
    ].join(' + ');

/**
 * What the transaction `cbor` does, line by line, for a dry run: its inputs, collateral, mint,
 * outputs (address, value, datum), required signers, validity, fee and size. Public data only.
 */
const describeTx = cbor => {
    const { body, witnessSet } = Transaction.fromCBORHex(cbor);
    const ref = input => `${TransactionHash.toHex(input.transactionId)}#${input.index}`;
    const minted = body.mint
        ? [...body.mint.map.entries()].flatMap(([policy, names]) => [...names.entries()].map(([name, quantity]) => `${quantity} ${PolicyId.toHex(policy)}.${AssetName.toHex(name)}`))
        : [];
    return [
        `  inputs           ${body.inputs.map(ref).join(', ')}`,
        `  collateral       ${(body.collateralInputs ?? []).map(ref).join(', ')}`,
        ...minted.map(line => `  mint             ${line}`),
        ...body.outputs.map(
            (output, index) =>
                `  output ${String(index).padEnd(9)} ${Address.toBech32(output.address)}: ${assetsText(output.assets)}${output.datumOption instanceof InlineDatum.InlineDatum ? ', inline datum' : ''}`
        ),
        `  required signers ${(body.requiredSigners ?? []).map(credentialHex).join(', ') || 'none'}`,
        `  valid until slot ${body.ttl}`,
        `  scripts          ${(witnessSet.plutusV3Scripts ?? []).length} Plutus V3, ${(witnessSet.redeemers?.toArray() ?? []).length} redeemer(s)`,
        `  fee              ${body.fee} lovelace, ${cbor.length / 2} bytes`,
    ];
};

/** A label padded into the column the scripts print their values in. */
const labelled = (label, value) => `${label.padEnd(17)} ${value}`;

module.exports = {
    ScriptError,
    networkFromEnv,
    argsOf,
    isKeyHash,
    redact,
    runMain,
    runScript,
    providerFromEnv,
    waitForBlock,
    checkConfigDatum,
    adminOf,
    spendableOf,
    txIdOf,
    signWith,
    buildAdminTx,
    builderFor,
    outputRefOf,
    describeTx,
    labelled,
};
