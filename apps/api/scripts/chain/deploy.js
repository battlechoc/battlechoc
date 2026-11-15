// Deploys the contracts to preprod, once, for the owner:
//
//   CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://cardano-preprod.blockfrost.io/api/v0 \
//   CHAIN_PROVIDER_KEY=<project id> node apps/api/scripts/chain/deploy.js \
//     --admin-key <file> --server-key-hash <hex> [--dry-run] [--again]
//   … deploy.js --admin-key <file> --server-key-hash <hex> --new-seed [--dry-run]
//   … deploy.js --confirm
//
// One transaction, signed by the admin key and paid from its enterprise address: it spends the
// seed (the admin's largest ADA-only UTxO), mints the config NFT under the config policy (the
// config validator applied to the seed) and locks it at the config address with the first config
// datum: the server key, the admin, threshold 1, not paused, and the fee of 1, 2 or 4 ADA by tier
// paid in full to the treasury. Nothing else needs a transaction: the treasury is the enterprise
// script address of the treasury validator applied to the config policy (computed before the
// datum, which names it), and the items policy (the items validator applied to the config
// policy) travels in each mint.
//
// It prints the ids, waits for the block and prints the two lines for the server's .env
// (CHAIN_POLICY_ID, CHAIN_CONFIG_REF), and writes contracts/deployments/preprod.json (public data
// only). --dry-run builds and signs the transaction and shows all of it, and submits nothing.
// Once the provider may have the transaction, the ids are printed ("submitted, not yet
// confirmed") and the record is written with `status: 'submitted'` before the wait; once the
// block is seen it is rewritten with `status: 'confirmed'` and the block height. Only a confirmed
// record is committed and read for its ids. --confirm waits for the transaction of a submitted
// record and confirms it, without a key and without a new transaction. While a record exists it
// deploys again only with --again: over a submitted record that is the retry of the same seed
// (the same policy ids), over a confirmed one a second config policy (the record is kept aside).
// When the seed of a submitted record is spent, --again and --confirm look whether the recorded
// transaction or one of an earlier attempt of the same deploy set aside (preprod.replaced-*.json:
// still submitted, the same seed, admin key and network) is in a block and confirm that one; if
// none is, something else spent the seed, and the one way on is a fresh deployment with a new
// seed (--new-seed: other policy ids). fateOf decides which of these it is; adopt acts on it.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Address, Assets, Data, InlineDatum, TransactionHash } = require('@evolution-sdk/evolution');
const { chain } = require('@battlechoc/battlechoc-shared-functions');
const { BLUEPRINT_FILE, CONFIG_TOKEN_NAME, loadBlueprint, configScript, itemsScript, treasuryScript, scriptAddress, encodeConfigDatum } = require('../../src/chain/blueprint');
const { loadKey } = require('../../src/chain/keys');
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
    spendableOf,
    signWith,
    buildAdminTx,
    builderFor,
    outputRefOf,
    describeTx,
    labelled,
} = require('./lib');

/** Where the deployment of preprod is recorded (committed: public data only). */
const DEPLOYMENT_FILE = path.resolve(__dirname, '../../../../contracts/deployments/preprod.json');

/** The fee preprod deploys with: one ADA option, 1, 2 or 4 ADA by tier, all of it to `treasury`. */
const PREPROD_FEE_AMOUNTS = [1_000_000, 2_000_000, 4_000_000];

// the config policy ignores its redeemer
const CONFIG_MINT_REDEEMER = Data.constr(0n, []);

const OPTIONS = {
    'admin-key': { type: 'string' },
    'server-key-hash': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    again: { type: 'boolean', default: false },
    confirm: { type: 'boolean', default: false },
    'new-seed': { type: 'boolean', default: false },
};

const lovelaceOf = utxo => Assets.lovelaceOf(utxo.assets);
const outRefOf = utxo => `${TransactionHash.toHex(utxo.transactionId)}#${utxo.index}`;
// the most lovelace first, ties by output reference
const byLovelaceDescending = (a, b) => {
    const [x, y] = [lovelaceOf(a), lovelaceOf(b)];
    if (x !== y) {
        return x > y ? -1 : 1;
    }
    return outRefOf(a) < outRefOf(b) ? -1 : 1;
};

/**
 * What the deployment from the admin's wallet `adminUtxos` is, before anything is built: { seed
 * ('txid#index': the largest ADA-only UTxO the admin may spend), configPolicyId, policyId (the
 * items policy), treasuryAddress, configDatum (as encodeConfigDatum takes it, checked by
 * checkConfigDatum) }. With `seed`, that UTxO is the seed (the retry of a deploy that never
 * reached the chain). Refuses a wallet without an ADA-only UTxO (or without `seed` among them), a
 * UTxO of another network, a malformed key hash and a server key hash that is the admin's.
 */
const planDeployment = ({ blueprint, adminUtxos, adminKeyHash, serverKeyHash, network, seed: wanted }) => {
    if (!isKeyHash(serverKeyHash)) {
        throw new ScriptError('the server key hash must be 28 bytes in lower-case hex (56 characters), as new-key.js prints it');
    }
    if (!isKeyHash(adminKeyHash)) {
        throw new ScriptError('the admin key hash must be 28 bytes in lower-case hex');
    }
    if (serverKeyHash === adminKeyHash) {
        throw new ScriptError(
            "the server key hash is the admin key's hash: give the key hash new-key.js printed for preprod-server.sk. The admin key (preprod-admin.sk) signs this deploy and the config updates and stays on your machine; the server key co-signs the mints on the VPS"
        );
    }
    if (adminUtxos.some(utxo => utxo.address.networkId !== network.networkId)) {
        throw new ScriptError(`a UTxO of the admin's wallet is on another network than ${network.name}`);
    }
    const candidates = spendableOf(adminUtxos)
        .filter(utxo => !Assets.hasMultiAsset(utxo.assets))
        .sort(byLovelaceDescending);
    const [seedUtxo] = wanted === undefined ? candidates : candidates.filter(utxo => outRefOf(utxo) === wanted);
    if (!seedUtxo && wanted !== undefined) {
        throw new ScriptError(`the seed ${wanted} is no ADA-only UTxO the admin may spend`);
    }
    if (!seedUtxo) {
        throw new ScriptError("no ADA-only UTxO at the admin's address: send it test ADA from the faucet first");
    }
    const seed = outRefOf(seedUtxo);
    const configPolicyId = configScript(blueprint, seed).policyId;
    const treasuryAddress = scriptAddress(treasuryScript(blueprint, configPolicyId).hash, network);
    const configDatum = checkConfigDatum(
        {
            serverKeys: [serverKeyHash],
            admins: [adminKeyHash],
            threshold: 1,
            paused: false,
            fees: [{ asset: 'lovelace', amounts: [...PREPROD_FEE_AMOUNTS], receivers: [{ address: treasuryAddress, share: 1 }] }],
        },
        network
    );
    return { seed, configPolicyId, policyId: itemsScript(blueprint, configPolicyId).policyId, treasuryAddress, configDatum };
};

/**
 * The unsigned deploy transaction of `plan` (planDeployment), paid from `admin` ({ keyHash,
 * address }) with `adminUtxos`: it spends the seed, mints the config NFT with the config script
 * attached and locks it at the config address with `plan.configDatum` inline. The config
 * validator runs while it builds. { cbor, txId, fee, configRef (where the NFT is) }.
 */
const buildDeployment = async ({ blueprint, plan, admin, adminUtxos, params, tip, network }) => {
    const seedUtxo = adminUtxos.find(utxo => outRefOf(utxo) === plan.seed);
    const { script, policyId } = configScript(blueprint, plan.seed);
    const unit = policyId + CONFIG_TOKEN_NAME;
    const builder = builderFor(network)
        .collectFrom({ inputs: [seedUtxo] })
        .attachScript({ script })
        .mintAssets({ assets: Assets.fromRecord({ [unit]: 1n }), redeemer: CONFIG_MINT_REDEEMER })
        .payToAddress({
            address: Address.fromBech32(scriptAddress(policyId, network)),
            assets: Assets.fromRecord({ [unit]: 1n }),
            datum: new InlineDatum.InlineDatum({ data: encodeConfigDatum(plan.configDatum) }),
            autoMinUtxo: true,
        });
    const built = await buildAdminTx(builder, { admin, adminUtxos, params, tip, network });
    return { ...built, configRef: outputRefOf(built.cbor, unit) };
};

/**
 * The record of a deployment (contracts/deployments/<network>.json), public data only, as it is
 * written once the transaction is submitted: `status: 'submitted'`, `date` the time of the
 * submit, `configTx` its id, `block` null. confirmedRecord makes it `confirmed`.
 */
const deploymentRecord = ({ blueprint, blueprintSha256, plan, configRef, adminKeyHash, network, date }) => ({
    network: network.name,
    date,
    compiler: blueprint.compiler,
    blueprintSha256,
    configSeed: plan.seed,
    configPolicyId: plan.configPolicyId,
    policyId: plan.policyId,
    configRef,
    treasuryAddress: plan.treasuryAddress,
    adminKeyHash,
    serverKeyHashes: plan.configDatum.serverKeys,
    threshold: plan.configDatum.threshold,
    fees: plan.configDatum.fees,
    status: 'submitted',
    configTx: configRef.split('#')[0],
    block: null,
});

/** `record` once its transaction is in the block of height `block`, seen at `date`. */
const confirmedRecord = (record, block, date) => ({ ...record, status: 'confirmed', block, confirmedAt: date });

// The record in `file`: undefined if there is none, { unreadable: true } if it is not JSON
const readRecord = file => {
    if (!fs.existsSync(file)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return { unreadable: true };
    }
};
// `record` written to `file` whole or not at all (a new file renamed over it)
const writeRecord = (file, record) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const partial = `${file}.partial`;
    fs.writeFileSync(partial, `${JSON.stringify(record, null, 2)}\n`);
    fs.renameSync(partial, file);
};

// The refusal to deploy over the record `record` in `file`, by the record's state
const deployedAlready = (file, record, network) => {
    if (record.status === 'confirmed') {
        return new ScriptError(
            `${file} exists: ${network.name} is deployed, config policy ${record.configPolicyId}, confirmed in block ${record.block} (config tx ${record.configTx}). ` +
                'Deploying again makes a second config policy, and everything that knows the first keeps using it. Run with --again only to replace that deployment; its record is then kept aside'
        );
    }
    if (record.status === 'submitted') {
        return new ScriptError(
            `${file} records a deploy submitted on ${record.date} and not confirmed: config tx ${record.configTx}. Look it up on a preprod explorer. ` +
                'If it is in a block, run deploy.js --confirm to record that. If it never reached the chain, retry with --again: it spends the same seed ' +
                `${record.configSeed}, and the same seed gives the same policy ids (if that seed is spent anyway, --again and --confirm find out by what and say what to do)`
        );
    }
    return new ScriptError(`${file} exists, in no state this script knows (status ${JSON.stringify(record.status ?? null)}): look at it first. --again deploys anew and keeps it aside`);
};

const envLines = record => [`CHAIN_POLICY_ID=${record.policyId}`, `CHAIN_CONFIG_REF=${record.configRef}`];

// A copy of `file` kept aside as <name>.replaced-<date>.json before `file` is written over; answers
// the copy's path. A copy, not a rename: stopped at any point, `file` is still there, whole, and
// at worst the copy is a duplicate.
const copyAside = (file, date) => {
    const aside = path.join(path.dirname(file), `${path.basename(file, '.json')}.replaced-${date.replace(/[:.]/g, '-')}.json`);
    fs.copyFileSync(file, aside);
    return aside;
};

// Why the record `aside` (set aside next to the submitted `record`) cannot have spent the seed of
// `record`, or undefined if it can: only an earlier attempt of the same deploy can, still
// submitted, from the same seed, admin key and network
const mismatchOf = (record, aside) => {
    if (!aside || typeof aside !== 'object' || typeof aside.configTx !== 'string') {
        return 'unreadable, or no config tx';
    }
    if (aside.status === 'confirmed') {
        return 'confirmed: a deployment replaced on purpose with --again';
    }
    if (aside.status !== 'submitted') {
        return `status ${JSON.stringify(aside.status ?? null)}`;
    }
    if (aside.network !== record.network) {
        return `another network (${aside.network})`;
    }
    if (aside.adminKeyHash !== record.adminKeyHash) {
        return `another admin key (${aside.adminKeyHash})`;
    }
    if (aside.configSeed !== record.configSeed) {
        return `another seed (${aside.configSeed}): another collection`;
    }
    return undefined;
};

// The attempts that can have spent the seed of the submitted `record` in `file`: the record itself
// first, then the earlier attempts of the same deploy a retry set aside next to it, newest first
// (at most one transaction spends a seed, so whichever of them is in a block is the deployment).
// `skipped` are the other records set aside, each with why it does not count: [{ file, why }].
const attemptsOf = (file, record) => {
    const dir = path.dirname(file);
    const prefix = `${path.basename(file, '.json')}.replaced-`;
    const attempts = [{ file, record }];
    const skipped = [];
    const names = fs
        .readdirSync(dir)
        .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
        .sort()
        .reverse();
    for (const name of names) {
        const aside = { file: path.join(dir, name), record: readRecord(path.join(dir, name)) };
        const why = mismatchOf(record, aside.record);
        if (why) {
            skipped.push({ file: aside.file, why });
        } else if (!attempts.some(attempt => attempt.record.configTx === aside.record.configTx)) {
            // (a copy of an attempt already listed, left by an interrupted run, is looked at once)
            attempts.push(aside);
        }
    }
    return { attempts, skipped };
};

// The refusal when the seed of the submitted `record` in `file` is spent and none of `attempts`
// (attemptsOf) is in a block
const seedSpentElsewhere = (file, record, { attempts, skipped }) => {
    const earlier = attempts.slice(1).map(attempt => path.basename(attempt.file));
    return new ScriptError(
        `the seed ${record.configSeed} of the submitted deploy is spent, but not by its config tx ${record.configTx}, which is in no block, ` +
            (earlier.length > 0 ? `nor by an earlier attempt of it set aside (${earlier.join(', ')}). ` : 'and no earlier attempt of it was set aside. ') +
            (skipped.length > 0
                ? `Not counted, being no earlier attempt of this deploy: ${skipped.map(({ file: aside, why }) => `${path.basename(aside)} (${why})`).join(', ')}. `
                : '') +
            `Something else spent it: look up ${record.configSeed} on a preprod explorer to see which transaction. ` +
            `If that is a config tx of this deploy whose record you have, put that record back as ${path.basename(file)} and run deploy.js --confirm. ` +
            'Otherwise the one way on is a fresh deployment with a new seed: deploy.js --admin-key <file> --server-key-hash <hex> --new-seed. ' +
            `Its policy ids will differ from the recorded ones (config policy ${record.configPolicyId}); the record is kept aside`
    );
};

/**
 * What became of the submitted `record` in `file`, from its admin's wallet `utxos` (undefined: not
 * known) and one look at the chain for each attempt, no waiting. The one place that decides:
 *   { open: true }                       the seed is unspent (or not known to be spent): no attempt
 *                                        is in a block, and the record's own may still land
 *   { landed: { file, record, block } }  an attempt (attemptsOf) is in that block: it spent the seed
 *   { lost: ScriptError }                the seed is spent, by no attempt this script recorded
 */
const fateOf = async (client, file, record, utxos) => {
    if (utxos === undefined || spendableOf(utxos).some(utxo => outRefOf(utxo) === record.configSeed)) {
        return { open: true };
    }
    const found = attemptsOf(file, record);
    for (const attempt of found.attempts) {
        const block = await client.blockOf(attempt.record.configTx);
        if (block !== null && block !== undefined) {
            return { landed: { ...attempt, block } };
        }
    }
    return { lost: seedSpentElsewhere(file, record, found) };
};

// Records the attempt `landed` (fateOf) as the deployment in `file`, confirmed: an attempt set
// aside takes the place of the record in `file`, which is kept aside in turn. The order keeps a
// readable `file` at every step: copy aside, write over (atomically), then remove the adopted file.
const adopt = ({ file, landed, log, now, dryRun = false }) => {
    const of = landed.file === file ? '' : ` of ${path.basename(landed.file)}`;
    log(`config tx ${landed.record.configTx}${of} is in block ${landed.block}: that deploy reached the chain, and nothing new is submitted`);
    if (dryRun) {
        log(`dry run: ${file} is not changed`);
        return;
    }
    const date = now().toISOString();
    if (landed.file !== file) {
        log(`the record of the later attempt is kept as ${path.basename(copyAside(file, date))}`);
    }
    writeRecord(file, confirmedRecord(landed.record, landed.block, date));
    if (landed.file !== file) {
        fs.rmSync(landed.file);
    }
    log(`wrote ${file} (status confirmed)`);
    envLines(landed.record).forEach(line => log(line));
};

// deploy.js --confirm: confirms the submitted record in `file` once its transaction (or that of an
// earlier attempt) is in a block, waiting for it while its seed is unspent
const confirm = async ({ env, log, client, file, network, now, sleep }) => {
    const record = readRecord(file);
    if (!record) {
        throw new ScriptError(`no deployment record at ${file}: nothing to confirm`);
    }
    if (record.status === 'confirmed') {
        log(labelled('config tx', `${record.configTx}  confirmed already, in block ${record.block}`));
        envLines(record).forEach(line => log(line));
        return;
    }
    if (record.status !== 'submitted' || typeof record.configTx !== 'string') {
        throw new ScriptError(`${file} is in no state --confirm knows (status ${JSON.stringify(record.status ?? null)})`);
    }
    const chainClient = client ?? providerFromEnv(env);
    const fate = async () =>
        fateOf(chainClient, file, record, isKeyHash(record.adminKeyHash) ? await chainClient.utxosAt(adminOf({ keyHash: record.adminKeyHash }, network).address) : undefined);
    // a spent seed settles it: an attempt landed, or none ever will
    const settle = ({ landed, lost }) => {
        if (lost) {
            throw lost;
        }
        adopt({ file, landed, log, now });
    };
    const before = await fate();
    if (!before.open) {
        return settle(before);
    }
    log(`waiting for config tx ${record.configTx} to be in a block …`);
    let block;
    try {
        block = await waitForBlock({ client: chainClient, txId: record.configTx, ...(sleep ? { sleep } : {}) });
    } catch (error) {
        throw new ScriptError(`waiting for the block failed: ${error.message}; the record stays submitted`);
    }
    if (block !== null) {
        return adopt({ file, landed: { file, record, block }, log, now });
    }
    const after = await fate();
    if (!after.open) {
        return settle(after);
    }
    throw new ScriptError(
        `config tx ${record.configTx} is in no block yet; the record stays submitted. Run --confirm again later; if it never reaches the chain (it is valid for ${chain.TX_VALIDITY_MS / 60_000} minutes from its build), retry with --again (the same seed, the same policy ids)`
    );
};

/**
 * The script: `argv` and `env` as above; `client` (providerFromEnv's shape) and the other
 * arguments are for the tests.
 *
 * Once the provider may have the transaction, the ids are on the terminal and in the record
 * before anything else can fail: a submit the provider refused (a 4xx: it certainly did not reach
 * the chain) writes nothing; any other outcome writes the record first, so a rerun knows of it and
 * deploys again only with --again (which keeps the earlier record aside).
 */
const main = async ({ argv, env, log, client, deploymentFile = DEPLOYMENT_FILE, blueprintFile = BLUEPRINT_FILE, now = () => new Date(), sleep }) => {
    const network = networkFromEnv(env);
    const args = argsOf(argv, OPTIONS);
    if (args.confirm) {
        return confirm({ env, log, client, file: deploymentFile, network, now, sleep });
    }
    if (!args['admin-key'] || !args['server-key-hash']) {
        throw new ScriptError('usage: deploy.js --admin-key <file> --server-key-hash <hex> [--dry-run] [--again | --new-seed], or deploy.js --confirm');
    }
    const dryRun = args['dry-run'];
    const earlier = readRecord(deploymentFile);
    if (args['new-seed'] && earlier?.status !== 'submitted') {
        throw new ScriptError('--new-seed is only for a submitted record whose seed something else spent (deploy.js --again or --confirm says when)');
    }
    if (earlier && !args.again && !args['new-seed']) {
        throw deployedAlready(deploymentFile, earlier, network);
    }
    // the retry of a deploy that never reached the chain spends the same seed: the same policy ids
    const retry = earlier?.status === 'submitted';
    const key = loadKey(args['admin-key']);
    const admin = adminOf(key, network);
    const blueprint = loadBlueprint(blueprintFile);
    const chainClient = client ?? providerFromEnv(env);

    if (retry && isKeyHash(earlier.adminKeyHash) && earlier.adminKeyHash !== admin.keyHash) {
        throw new ScriptError(`${deploymentFile} was made with the admin key ${earlier.adminKeyHash}, not with this one (${admin.keyHash}): give that key`);
    }

    log(labelled('admin', `${admin.keyHash}  ${admin.address}`));
    const [adminUtxos, params, tip] = await Promise.all([chainClient.utxosAt(admin.address), chainClient.params(), chainClient.tip()]);
    let seed;
    if (retry) {
        const { open, landed, lost } = await fateOf(chainClient, deploymentFile, earlier, adminUtxos);
        if (landed) {
            return adopt({ file: deploymentFile, landed, log, now, dryRun });
        }
        if (open && args['new-seed']) {
            throw new ScriptError(
                `the seed ${earlier.configSeed} of the submitted deploy is unspent: retry with --again (the same seed, the same policy ids); --new-seed is for a seed something else spent`
            );
        }
        if (open) {
            seed = earlier.configSeed;
            log(`a retry of the submitted deploy with its seed ${earlier.configSeed}`);
        } else if (!args['new-seed']) {
            throw lost;
        } else {
            log(`a fresh deployment with a new seed: its policy ids differ from the recorded ones (config policy ${earlier.configPolicyId}); the record is kept aside`);
        }
    }
    const plan = planDeployment({ blueprint, adminUtxos, adminKeyHash: admin.keyHash, serverKeyHash: args['server-key-hash'], network, ...(seed ? { seed } : {}) });
    log(labelled('config seed', plan.seed));
    log(labelled('config policy', plan.configPolicyId));
    log(labelled('items policy', plan.policyId));
    log(labelled('treasury address', plan.treasuryAddress));
    log(labelled('config datum', JSON.stringify(plan.configDatum, null, 2).replace(/\n/g, '\n  ')));

    const built = await buildDeployment({ blueprint, plan, admin, adminUtxos, params, tip, network });
    const signed = signWith(built.cbor, key);
    log(labelled('config tx', `${built.txId}  fee ${built.fee} lovelace`));
    for (const line of describeTx(signed)) {
        log(line);
    }
    if (dryRun) {
        log(labelled('config ref', `${built.configRef} once submitted`));
        log('dry run: nothing submitted');
        return;
    }

    let submitted;
    let submitFailure;
    try {
        submitted = await chainClient.submit(signed);
    } catch (error) {
        if (error?.refused === true) {
            throw new ScriptError(`${error.message}. Nothing is deployed: the seed is unspent and no record is written`);
        }
        submitFailure = error;
    }

    // the provider may have it: the ids and the record first
    const record = deploymentRecord({
        blueprint,
        blueprintSha256: crypto.createHash('sha256').update(fs.readFileSync(blueprintFile)).digest('hex'),
        plan,
        configRef: built.configRef,
        adminKeyHash: admin.keyHash,
        network,
        date: now().toISOString(),
    });
    log('submitted, not yet confirmed:');
    log(labelled('  config policy', plan.configPolicyId));
    log(labelled('  items policy', plan.policyId));
    log(labelled('  config ref', built.configRef));
    log(labelled('  treasury', plan.treasuryAddress));
    if (fs.existsSync(deploymentFile)) {
        log(`the earlier record is kept as ${path.basename(copyAside(deploymentFile, record.date))}`);
    }
    writeRecord(deploymentFile, record);
    log(`wrote ${deploymentFile} (status submitted)`);
    const unconfirmed = reason =>
        new ScriptError(
            `${reason}. The transaction may have reached the chain: ${deploymentFile} is written with its ids (status submitted). ` +
                `Look up config tx ${built.txId} on a preprod explorer: if it is in a block, run deploy.js --confirm; if it never reached the chain, retry with --again (the same seed, the same policy ids)`
        );
    if (submitFailure) {
        throw unconfirmed(submitFailure.message ?? String(submitFailure));
    }
    if (submitted !== built.txId) {
        throw unconfirmed(`the provider answered the transaction id ${submitted}, not ${built.txId}`);
    }

    log(`waiting for a block (up to ${chain.TX_VALIDITY_MS / 60_000} minutes) …`);
    let block;
    try {
        block = await waitForBlock({ client: chainClient, txId: built.txId, ...(sleep ? { sleep } : {}) });
    } catch (error) {
        throw unconfirmed(`waiting for the block failed: ${error.message}`);
    }
    if (block === null) {
        throw unconfirmed(`config tx ${built.txId} is in no block yet`);
    }
    writeRecord(deploymentFile, confirmedRecord(record, block, now().toISOString()));
    log(labelled('config tx', `${built.txId}  waiting for a block … in block ${block}`));
    log(`wrote ${deploymentFile} (status confirmed)`);
    envLines(record).forEach(line => log(line));
};

module.exports = { OPTIONS, DEPLOYMENT_FILE, planDeployment, buildDeployment, deploymentRecord, confirmedRecord, main };

if (require.main === module) {
    runScript(main);
}
