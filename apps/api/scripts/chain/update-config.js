// Changes the config datum on preprod, for the owner:
//
//   CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://preprod.koios.rest/api/v1 \
//   node apps/api/scripts/chain/update-config.js \
//     --admin-key <file> (--pause | --resume | --add-server-key <hex> | --remove-server-key <hex> |
//                         --fees <json file>) [--dry-run]
//   (Koios's public tier needs no key; with CHAIN_PROVIDER_KIND=blockfrost, CHAIN_PROVIDER_URL is
//   Blockfrost's and CHAIN_PROVIDER_KEY its project id: lib.js providerFromEnv)
//
// One transaction, signed by the admin key and paid from its enterprise address: it spends the
// config UTxO (found by its NFT, wherever the last update put it) with the config script
// attached (the config validator applied to the seed of contracts/deployments/preprod.json) and
// pays the NFT back to the config address with the new datum. --fees replaces the whole list
// with the JSON file's ([] = no fee; the file has the form of `fees` in the deployment record).
// The new datum is checked as the validator checks it before anything is built. It prints the
// new CHAIN_CONFIG_REF; --dry-run shows everything and submits nothing.

const fs = require('fs');
const { Address, Data, InlineDatum, ScriptHash } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { BLUEPRINT_FILE, CONFIG_TOKEN_NAME, loadBlueprint, configScript, contractsFor, encodeConfigDatum } = require('../../src/chain/blueprint');
const { loadKey } = require('../../src/chain/keys');
const { outRef } = require('../../src/chain/names');
const {
    ScriptError,
    argsOf,
    isKeyHash,
    networkFromEnv,
    providerFromEnv,
    runScript,
    waitForBlock,
    checkConfigDatum,
    adminOf,
    signWith,
    buildAdminTx,
    builderFor,
    outputRefOf,
    describeTx,
    labelled,
} = require('./lib');
const { DEPLOYMENT_FILE } = require('./deploy');

// the config validator's spend ignores its redeemer
const CONFIG_SPEND_REDEEMER = Data.constr(0n, []);

const OPTIONS = {
    'admin-key': { type: 'string' },
    pause: { type: 'boolean' },
    resume: { type: 'boolean' },
    'add-server-key': { type: 'string' },
    'remove-server-key': { type: 'string' },
    fees: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
};
const CHANGES = { pause: 'pause', resume: 'resume', 'add-server-key': 'addServerKey', 'remove-server-key': 'removeServerKey', fees: 'fees' };
const USAGE = 'give exactly one of --pause, --resume, --add-server-key <hex>, --remove-server-key <hex>, --fees <json file>';

/**
 * The change the command line asks for: { pause: true } | { resume: true } | { addServerKey } |
 * { removeServerKey } | { fees } (the list read from the JSON file `args.fees`).
 */
const changeOf = (args, readFile = file => fs.readFileSync(file, 'utf8')) => {
    const given = Object.keys(CHANGES).filter(option => args[option] !== undefined);
    if (given.length !== 1) {
        throw new ScriptError(USAGE);
    }
    const [option] = given;
    if (option !== 'fees') {
        return { [CHANGES[option]]: args[option] };
    }
    let text;
    try {
        text = readFile(args.fees);
    } catch (error) {
        throw new ScriptError(`--fees: cannot read ${args.fees} (${error.code ?? error.message})`);
    }
    try {
        return { fees: JSON.parse(text) };
    } catch {
        throw new ScriptError(`--fees: ${args.fees} is not JSON`);
    }
};

/**
 * The config datum after `change` (changeOf's form) to `current` (decodeConfigDatum's form),
 * checked by checkConfigDatum on `network`. Refuses a change that changes nothing, removing the
 * last server key, an admin's key hash as a server key (as deploy.js does), a malformed key hash
 * and a malformed fee list.
 */
const nextConfigDatum = (current, change, network = cardano.Networks.preprod) => {
    const kinds = Object.values(CHANGES).filter(kind => change[kind] !== undefined);
    if (kinds.length !== 1) {
        throw new ScriptError('exactly one change at a time');
    }
    const [kind] = kinds;
    const key = change[kind];
    let next;
    if (kind === 'pause') {
        if (current.paused) {
            throw new ScriptError('the config is already paused');
        }
        next = { ...current, paused: true };
    } else if (kind === 'resume') {
        if (!current.paused) {
            throw new ScriptError('the config is not paused');
        }
        next = { ...current, paused: false };
    } else if (kind === 'addServerKey' || kind === 'removeServerKey') {
        if (!isKeyHash(key)) {
            throw new ScriptError('the server key hash must be 28 bytes in lower-case hex (56 characters), as new-key.js prints it');
        }
        const known = current.serverKeys.includes(key);
        if (kind === 'addServerKey') {
            if (known) {
                throw new ScriptError(`${key} is already a server key of the config`);
            }
            if (current.admins.includes(key)) {
                throw new ScriptError(
                    `${key} is an admin key's hash: give the key hash new-key.js printed for a server key (preprod-server.sk). An admin key signs the config updates and stays on your machine; a server key co-signs the mints on the VPS`
                );
            }
            next = { ...current, serverKeys: [...current.serverKeys, key] };
        } else {
            if (!known) {
                throw new ScriptError(`${key} is not a server key of the config`);
            }
            if (current.serverKeys.length === 1) {
                throw new ScriptError(`${key} is the last server key: add its successor first, then remove it`);
            }
            next = { ...current, serverKeys: current.serverKeys.filter(serverKey => serverKey !== key) };
        }
    } else {
        next = { ...current, fees: change.fees };
    }
    return checkConfigDatum(next, network);
};

/**
 * The unsigned update of the config in `configUtxo` to `datum`: it spends `configUtxo` with the
 * config script of `configSeed` attached and pays its value (raised to the minimum UTxO if the
 * new datum needs more) back to its address with `datum` inline, required to be signed by
 * `signers` (the admin by default), paid from `admin` with `adminUtxos`. The config validator runs
 * while it builds. { cbor, txId, fee, configRef (where the NFT goes) }.
 */
const buildConfigUpdate = async ({ blueprint, configSeed, configUtxo, datum, admin, adminUtxos, signers = [admin.keyHash], params, tip, network }) => {
    const { script, policyId } = configScript(blueprint, configSeed);
    const builder = builderFor(network)
        .collectFrom({ inputs: [configUtxo], redeemer: CONFIG_SPEND_REDEEMER })
        .attachScript({ script })
        .payToAddress({ address: configUtxo.address, assets: configUtxo.assets, datum: new InlineDatum.InlineDatum({ data: encodeConfigDatum(datum) }), autoMinUtxo: true });
    const built = await buildAdminTx(builder, { admin, adminUtxos, signers, params, tip, network });
    return { ...built, configRef: outputRefOf(built.cbor, policyId + CONFIG_TOKEN_NAME) };
};

// The deployment record of `network` in `file`: its seed and policies, checked against `blueprint`.
const deploymentOf = (file, blueprint, network) => {
    let record;
    try {
        record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new ScriptError(`cannot read the deployment record ${file} (${error.code ?? 'not JSON'})`);
    }
    if (record.status !== 'confirmed') {
        throw new ScriptError(`${file} is not confirmed (status ${JSON.stringify(record.status ?? null)}): run deploy.js --confirm first`);
    }
    if (record.network !== network.name) {
        throw new ScriptError(`${file} is the deployment of ${record.network}, not ${network.name}`);
    }
    if (configScript(blueprint, record.configSeed).policyId !== record.configPolicyId) {
        throw new ScriptError(`contracts/plutus.json is not the blueprint ${file} was deployed with: its config policy for the seed is another`);
    }
    return record;
};

/**
 * The script: `argv` and `env` as above; `client` (providerFromEnv's shape) and the other
 * arguments are for the tests.
 */
const main = async ({ argv, env, log, client, deploymentFile = DEPLOYMENT_FILE, blueprintFile = BLUEPRINT_FILE, sleep }) => {
    const network = networkFromEnv(env);
    const args = argsOf(argv, OPTIONS);
    if (!args['admin-key']) {
        throw new ScriptError(`--admin-key <file> is missing; ${USAGE}`);
    }
    const change = changeOf(args);
    const blueprint = loadBlueprint(blueprintFile);
    const deployment = deploymentOf(deploymentFile, blueprint, network);
    const key = loadKey(args['admin-key']);
    const admin = adminOf(key, network);
    const chainClient = client ?? providerFromEnv(env);

    const configUtxo = await chainClient.utxoByUnit(deployment.configPolicyId + CONFIG_TOKEN_NAME);
    if (!configUtxo) {
        throw new ScriptError(`the config NFT ${deployment.configPolicyId}.${CONFIG_TOKEN_NAME} is in no UTxO`);
    }
    const credential = configUtxo.address.paymentCredential;
    if (!(credential instanceof ScriptHash.ScriptHash) || ScriptHash.toHex(credential) !== deployment.configPolicyId) {
        throw new ScriptError(`the config NFT is not at the config address but at ${Address.toBech32(configUtxo.address)}`);
    }
    const { config: current } = contractsFor({ blueprint, configUtxo, policyId: deployment.policyId, network });
    const ref = outRef(configUtxo);
    log(labelled('config', `${ref} (where the config NFT is)`));
    if (env.CHAIN_CONFIG_REF && env.CHAIN_CONFIG_REF !== ref) {
        log(`note: CHAIN_CONFIG_REF=${env.CHAIN_CONFIG_REF} is out of date; the config is at ${ref}`);
    }
    log(labelled('admin', `${admin.keyHash}  ${admin.address}`));
    if (!current.admins.includes(admin.keyHash)) {
        throw new ScriptError(`the key ${admin.keyHash} is not an admin of the config (its admins: ${current.admins.join(', ')})`);
    }
    if (current.threshold > 1) {
        throw new ScriptError(`the config needs ${current.threshold} admin signatures; this script signs with one key`);
    }
    const datum = nextConfigDatum(current, change, network);
    log(labelled('datum now', JSON.stringify(current, null, 2).replace(/\n/g, '\n  ')));
    log(labelled('datum after', JSON.stringify(datum, null, 2).replace(/\n/g, '\n  ')));

    const [adminUtxos, params, tip] = await Promise.all([chainClient.utxosAt(admin.address), chainClient.params(), chainClient.tip()]);
    const built = await buildConfigUpdate({ blueprint, configSeed: deployment.configSeed, configUtxo, datum, admin, adminUtxos, params, tip, network });
    const signed = signWith(built.cbor, key);
    log(labelled('config tx', `${built.txId}  fee ${built.fee} lovelace`));
    for (const line of describeTx(signed)) {
        log(line);
    }
    if (args['dry-run']) {
        log(labelled('config ref', `${built.configRef} once submitted`));
        log('dry run: nothing submitted');
        return;
    }

    let submitted;
    try {
        submitted = await chainClient.submit(signed);
    } catch (error) {
        if (error?.refused === true) {
            throw new ScriptError(`${error.message}. Nothing changed: the config is where it was`);
        }
        throw new ScriptError(`${error.message}. The update may have reached the chain: look up config tx ${built.txId} on a preprod explorer; if it is there, CHAIN_CONFIG_REF=${built.configRef}`);
    }
    log(labelled('config ref', `${built.configRef} (submitted, not yet confirmed)`));
    const unconfirmed = reason => new ScriptError(`${reason}. Look up config tx ${built.txId} on a preprod explorer; once it is in a block, CHAIN_CONFIG_REF=${built.configRef}`);
    if (submitted !== built.txId) {
        throw unconfirmed(`the provider answered the transaction id ${submitted}, not ${built.txId}`);
    }
    log('waiting for a block …');
    let block;
    try {
        block = await waitForBlock({ client: chainClient, txId: built.txId, ...(sleep ? { sleep } : {}) });
    } catch (error) {
        throw unconfirmed(`waiting for the block failed: ${error.message}`);
    }
    if (block === null) {
        throw unconfirmed(`config tx ${built.txId} is in no block yet`);
    }
    log(labelled('config tx', `${built.txId}  waiting for a block … in block ${block}`));
    log(`CHAIN_CONFIG_REF=${built.configRef}`);
};

module.exports = { OPTIONS, changeOf, nextConfigDatum, buildConfigUpdate, deploymentOf, main };

if (require.main === module) {
    runScript(main);
}
