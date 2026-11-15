// Deploying the contracts and updating the config (plan B, Task 10): scripts/chain/deploy.js mints
// the config NFT with its first datum, scripts/chain/update-config.js moves it on with a new one.
// Their pure parts are tested here against the fixtures (the real blueprint, the fixed preprod
// protocol parameters, the local Aiken evaluator): every transaction that builds here passed the
// config validator. The network is a fake: nothing here reaches preprod, and the keys are the
// fixtures' (derived from fixed labels, never funded), in files in a temporary directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Address, AssetName, Assets, InlineDatum, KeyHash, Mint, PolicyId, PrivateKey, Transaction, TransactionHash, UTxO } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { BLUEPRINT_FILE, CONFIG_TOKEN_NAME, loadBlueprint, configScript, itemsScript, treasuryScript, scriptAddress, decodeConfigDatum } = require('../src/chain/blueprint');
const { writeKeyFile } = require('../src/chain/keys');
const { checkConfigDatum, networkFromEnv, providerFromEnv, redact, runMain, signWith, txIdOf, waitForBlock } = require('../scripts/chain/lib');
const newKey = require('../scripts/chain/new-key');
const deploy = require('../scripts/chain/deploy');
const updateConfig = require('../scripts/chain/update-config');
const { TIP, TEAM_ADDRESS, loadParams, fixtureKey, ledgerMinimumFeeOf, utxo } = require('./helpers/chain');

const { planDeployment, buildDeployment } = deploy;
const { nextConfigDatum, buildConfigUpdate } = updateConfig;

const preprod = cardano.Networks.preprod;
const params = loadParams();
const blueprint = loadBlueprint();
const admin = fixtureKey('admin');
const server = fixtureKey('server');
const stranger = fixtureKey('stranger');
const adminOfWallet = { keyHash: admin.keyHash, address: admin.enterpriseAddress };

const ada = n => BigInt(n) * 1_000_000n;
// the admin's wallet: the most ADA sits next to a token, then two ADA-only UTxOs, and a UTxO
// with a datum (not the wallet's to spend)
const adminUtxos = [
    utxo({ address: admin.enterpriseAddress, lovelace: ada(30), tokens: { ['c4'.repeat(28) + '01']: 5n }, txId: 'd1'.repeat(32), index: 0 }),
    utxo({ address: admin.enterpriseAddress, lovelace: ada(8), txId: 'd3'.repeat(32), index: 0 }),
    utxo({ address: admin.enterpriseAddress, lovelace: ada(12), txId: 'd2'.repeat(32), index: 1 }),
    utxo({ address: admin.enterpriseAddress, lovelace: ada(50), txId: 'd4'.repeat(32), index: 0, datum: 42n }),
];
const SEED = 'd2'.repeat(32) + '#1';

const plan = () => planDeployment({ blueprint, adminUtxos, adminKeyHash: admin.keyHash, serverKeyHash: server.keyHash, network: preprod });
const build = (overrides = {}) => buildDeployment({ blueprint, plan: plan(), admin: adminOfWallet, adminUtxos, params, tip: TIP, network: preprod, ...overrides });

const failure = promise =>
    promise.then(
        () => undefined,
        error => error
    );
const thrown = run => {
    try {
        run();
    } catch (error) {
        return error;
    }
    return undefined;
};
const decoded = cbor => Transaction.fromCBORHex(cbor);
const unitsOf = assets => Object.fromEntries(Assets.flatten(assets).map(([policy, name, quantity]) => [PolicyId.toHex(policy) + AssetName.toHex(name), quantity]));
const outRefOf = input => `${TransactionHash.toHex(input.transactionId)}#${input.index}`;
const vkeyHashesOf = cbor => (decoded(cbor).witnessSet.vkeyWitnesses ?? []).map(witness => KeyHash.toHex(KeyHash.fromVKey(witness.vkey)));

// The UTxO the transaction `cbor` creates at output `index`
const outputUtxo = (cbor, index) => {
    const output = decoded(cbor).body.outputs[index];
    return new UTxO.UTxO({ transactionId: TransactionHash.fromHex(txIdOf(cbor)), index: BigInt(index), address: output.address, assets: output.assets, datumOption: output.datumOption });
};
const nftIndexOf = (cbor, configPolicyId) => decoded(cbor).body.outputs.findIndex(output => Assets.getByUnit(output.assets, configPolicyId + CONFIG_TOKEN_NAME) === 1n);

describe('planDeployment', () => {
    test('spends the largest ADA-only UTxO of the admin as the seed; its ids are configScript and itemsScript of it', () => {
        const planned = plan();
        expect(planned.seed).toBe(SEED);
        expect(planned.configPolicyId).toBe(configScript(blueprint, SEED).policyId);
        expect(planned.policyId).toBe(itemsScript(blueprint, planned.configPolicyId).policyId);
    });

    test('the treasury is the enterprise script address of treasuryScript of the config policy', () => {
        const planned = plan();
        expect(planned.treasuryAddress).toBe(scriptAddress(treasuryScript(blueprint, planned.configPolicyId).hash, preprod));
        expect(planned.treasuryAddress).toMatch(/^addr_test1w/);
    });

    test('the datum: the server key, the admin, threshold 1, not paused, 1/2/4 ADA all to the treasury', () => {
        const planned = plan();
        expect(planned.configDatum).toEqual({
            serverKeys: [server.keyHash],
            admins: [admin.keyHash],
            threshold: 1,
            paused: false,
            fees: [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: planned.treasuryAddress, share: 1 }] }],
        });
    });

    test('refuses a wallet without an ADA-only UTxO, a UTxO of another network and a malformed server key hash', () => {
        const tokensOnly = adminUtxos.filter(entry => Assets.hasMultiAsset(entry.assets));
        expect(() => planDeployment({ blueprint, adminUtxos: tokensOnly, adminKeyHash: admin.keyHash, serverKeyHash: server.keyHash, network: preprod })).toThrow(
            /no ADA-only UTxO/
        );
        const mainnetUtxo = new UTxO.UTxO({ ...adminUtxos[2], address: new Address.Address({ networkId: 1, paymentCredential: KeyHash.fromHex(admin.keyHash) }) });
        expect(() => planDeployment({ blueprint, adminUtxos: [mainnetUtxo], adminKeyHash: admin.keyHash, serverKeyHash: server.keyHash, network: preprod })).toThrow(
            /another network/
        );
        for (const serverKeyHash of ['', server.keyHash.slice(2), server.keyHash.toUpperCase(), `${server.keyHash}00`]) {
            expect(() => planDeployment({ blueprint, adminUtxos, adminKeyHash: admin.keyHash, serverKeyHash, network: preprod })).toThrow(/server key/);
        }
    });
});

describe('the deploy transaction', () => {
    let built;
    beforeAll(async () => {
        built = await build();
    });

    test('passes the config validator: it built, with the evaluator, and has the mint redeemer', () => {
        const { witnessSet } = decoded(built.cbor);
        expect(witnessSet.redeemers.toArray()).toHaveLength(1);
        expect(witnessSet.plutusV3Scripts).toHaveLength(1);
    });

    test('spends the seed and mints exactly the config NFT', () => {
        const { body } = decoded(built.cbor);
        expect(body.inputs.map(outRefOf)).toContain(SEED);
        expect(Mint.policyCount(body.mint)).toBe(1);
        const minted = [...Mint.getAssetsByPolicyHex(body.mint, plan().configPolicyId)].map(([name, quantity]) => [AssetName.toHex(name), quantity]);
        expect(minted).toEqual([[CONFIG_TOKEN_NAME, 1n]]);
    });

    test('locks the NFT at output 0, the config address, with the planned datum inline', () => {
        const planned = plan();
        const output = decoded(built.cbor).body.outputs[0];
        expect(Address.toBech32(output.address)).toBe(scriptAddress(planned.configPolicyId, preprod));
        expect(unitsOf(output.assets)).toEqual({ [planned.configPolicyId + CONFIG_TOKEN_NAME]: 1n });
        expect(Assets.lovelaceOf(output.assets)).toBeGreaterThan(1_000_000n);
        expect(output.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(decodeConfigDatum(output.datumOption.data, preprod)).toEqual(planned.configDatum);
        expect(built.configRef).toBe(`${built.txId}#0`);
        expect(built.txId).toBe(txIdOf(built.cbor));
    });

    test('is paid from the admin: the change goes back to its address; signed, the fee covers the ledger minimum', () => {
        const { body } = decoded(built.cbor);
        const others = body.outputs.slice(1).map(output => Address.toBech32(output.address));
        expect(new Set(others)).toEqual(new Set([admin.enterpriseAddress]));
        const signed = signWith(built.cbor, { privateKey: admin.privateKey });
        expect(vkeyHashesOf(signed)).toEqual([admin.keyHash]);
        expect(txIdOf(signed)).toBe(built.txId);
        expect(BigInt(built.fee)).toBeGreaterThanOrEqual(ledgerMinimumFeeOf(signed, params));
    });

    test('the evaluator has the last word: a datum the validator refuses does not build', async () => {
        const planned = plan();
        const error = await failure(build({ plan: { ...planned, configDatum: { ...planned.configDatum, threshold: 0 } } }));
        expect(error?.message).toMatch(/does not build/);
    });
});

describe('the config update', () => {
    let deployed;
    let configUtxo;
    beforeAll(async () => {
        deployed = await build();
        configUtxo = outputUtxo(deployed.cbor, 0);
    });
    const update = (datum, overrides = {}) =>
        buildConfigUpdate({ blueprint, configSeed: SEED, configUtxo, datum, admin: adminOfWallet, adminUtxos, params, tip: TIP, network: preprod, ...overrides });
    const current = () => decodeConfigDatum(configUtxo.datumOption.data, preprod);

    test.each([
        ['a pause', () => nextConfigDatum(current(), { pause: true })],
        ['a new server key', () => nextConfigDatum(current(), { addServerKey: fixtureKey('server-2').keyHash })],
        ['no fee (--fees [])', () => nextConfigDatum(current(), { fees: [] })],
    ])('%s passes the config validator; the NFT stays at the config address with the new datum', async (_name, next) => {
        const datum = next();
        const built = await update(datum);
        const index = nftIndexOf(built.cbor, plan().configPolicyId);
        expect(built.configRef).toBe(`${built.txId}#${index}`);
        const output = decoded(built.cbor).body.outputs[index];
        expect(Address.toBech32(output.address)).toBe(Address.toBech32(configUtxo.address));
        expect(decodeConfigDatum(output.datumOption.data, preprod)).toEqual(datum);
        expect(decoded(built.cbor).body.inputs.map(outRefOf)).toContain(`${deployed.txId}#0`);
        expect(decoded(built.cbor).body.requiredSigners.map(KeyHash.toHex)).toEqual([admin.keyHash]);
    });

    test('one signed by a non-admin fails evaluation', async () => {
        const datum = nextConfigDatum(current(), { pause: true });
        const error = await failure(update(datum, { signers: [stranger.keyHash] }));
        expect(error?.message).toMatch(/does not build/);
    });

    test('a datum the validator refuses fails evaluation', async () => {
        const error = await failure(update({ ...current(), serverKeys: [] }));
        expect(error?.message).toMatch(/does not build/);
    });
});

describe('nextConfigDatum', () => {
    const base = {
        serverKeys: [server.keyHash],
        admins: [admin.keyHash],
        threshold: 1,
        paused: false,
        fees: [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: scriptAddress('7e'.repeat(28), preprod), share: 1 }] }],
    };
    const second = fixtureKey('server-2').keyHash;

    test('pauses, resumes, adds and removes a server key, replaces the fees', () => {
        expect(nextConfigDatum(base, { pause: true })).toEqual({ ...base, paused: true });
        expect(nextConfigDatum({ ...base, paused: true }, { resume: true })).toEqual(base);
        expect(nextConfigDatum(base, { addServerKey: second })).toEqual({ ...base, serverKeys: [server.keyHash, second] });
        expect(nextConfigDatum({ ...base, serverKeys: [server.keyHash, second] }, { removeServerKey: server.keyHash })).toEqual({ ...base, serverKeys: [second] });
        const split = [{ asset: 'lovelace', amounts: [0, 2_000_000, 4_000_000], receivers: [base.fees[0].receivers[0], { address: TEAM_ADDRESS, share: 3 }] }];
        expect(nextConfigDatum(base, { fees: split })).toEqual({ ...base, fees: split });
        expect(nextConfigDatum(base, { fees: [] })).toEqual({ ...base, fees: [] });
    });

    test('refuses removing the last server key, and changes that change nothing', () => {
        expect(() => nextConfigDatum(base, { removeServerKey: server.keyHash })).toThrow(/last server key/);
        expect(() => nextConfigDatum(base, { removeServerKey: second })).toThrow(/not a server key/);
        expect(() => nextConfigDatum(base, { addServerKey: server.keyHash })).toThrow(/already/);
        expect(() => nextConfigDatum(base, { resume: true })).toThrow(/not paused/);
        expect(() => nextConfigDatum({ ...base, paused: true }, { pause: true })).toThrow(/already paused/);
        expect(() => nextConfigDatum(base, { addServerKey: 'ab'.repeat(27) })).toThrow(/server key/);
        expect(() => nextConfigDatum(base, {})).toThrow(/one change/);
        expect(() => nextConfigDatum(base, { pause: true, resume: true })).toThrow(/one change/);
    });

    test("refuses an admin's key hash as a server key, as deploy.js does, saying which is which", () => {
        const error = thrown(() => nextConfigDatum(base, { addServerKey: admin.keyHash }));
        expect(error?.message).toMatch(/is an admin key's hash/);
        expect(error?.message).toMatch(/preprod-server\.sk/);
        const secondAdmin = fixtureKey('admin-2').keyHash;
        expect(() => nextConfigDatum({ ...base, admins: [admin.keyHash, secondAdmin] }, { addServerKey: secondAdmin })).toThrow(/is an admin key's hash/);
    });

    test('refuses a malformed fee list', () => {
        const option = base.fees[0];
        const receiver = option.receivers[0];
        const refused = {
            'a fee option with two amounts': [{ ...option, amounts: [1_000_000, 2_000_000] }],
            'a negative amount': [{ ...option, amounts: [-1, 2_000_000, 4_000_000] }],
            'a fractional amount': [{ ...option, amounts: [1.5, 2_000_000, 4_000_000] }],
            'an amount as a string': [{ ...option, amounts: ['1000000', 2_000_000, 4_000_000] }],
            'no receivers': [{ ...option, receivers: [] }],
            'a share of 0': [{ ...option, receivers: [receiver, { address: TEAM_ADDRESS, share: 0 }] }],
            'the same receiver twice': [{ ...option, receivers: [receiver, receiver] }],
            'a receiver on mainnet': [{ ...option, receivers: [{ address: scriptAddress('7e'.repeat(28), cardano.Networks.mainnet), share: 1 }] }],
            'a receiver that is no address': [{ ...option, receivers: [{ address: 'addr_test1nonsense', share: 1 }] }],
            'an asset that is neither lovelace nor policy and name': [{ ...option, asset: 'ada' }],
            'an asset with a short policy': [{ ...option, asset: 'cc'.repeat(27) }],
            'an asset with a name over 32 bytes': [{ ...option, asset: 'cc'.repeat(28) + 'ab'.repeat(33) }],
            'an asset in upper case': [{ ...option, asset: 'CC'.repeat(28) }],
            'a misspelt field': [{ asset: 'lovelace', amounts: option.amounts, reciever: option.receivers }],
            'an unknown field': [{ ...option, note: 'x' }],
            'not a list': option,
        };
        for (const [name, fees] of Object.entries(refused)) {
            const error = thrown(() => nextConfigDatum(base, { fees }));
            expect([name, error?.message]).toEqual([name, expect.stringMatching(/^fees/)]);
        }
    });
});

describe('checkConfigDatum: the well-formedness the validator checks', () => {
    const base = plan().configDatum;

    test('accepts the deploy datum and answers it unchanged', () => {
        expect(checkConfigDatum(base, preprod)).toEqual(base);
    });

    test.each([
        ['no server key', { serverKeys: [] }, /server key/],
        ['a short server key', { serverKeys: ['ab'.repeat(27)] }, /server key/],
        ['a short admin key', { admins: ['ab'.repeat(27)] }, /admin/],
        ['threshold 0', { threshold: 0 }, /threshold/],
        ['a threshold above the distinct admins', { admins: [admin.keyHash, admin.keyHash], threshold: 2 }, /threshold/],
        ['paused that is not a boolean', { paused: 'no' }, /paused/],
    ])('refuses %s', (_name, change, message) => {
        expect(() => checkConfigDatum({ ...base, ...change }, preprod)).toThrow(message);
    });
});

describe('the scripts', () => {
    let dir;
    let adminKeyFile;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-deploy-'));
        adminKeyFile = path.join(dir, 'preprod-admin.sk');
        writeKeyFile(adminKeyFile, admin.privateKey);
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    // a stand-in for the Blockfrost project id: it must never be printed
    const PROJECT_ID = 'stand-in-for-the-blockfrost-project-id';
    const env = { CARDANO_NETWORK: 'preprod', CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0', CHAIN_PROVIDER_KEY: PROJECT_ID };
    const secrets = () => [PrivateKey.toBech32(admin.privateKey), PrivateKey.toHex(admin.privateKey), PROJECT_ID];

    // the network: the admin's wallet, the config NFT where `config()` says, a chain that takes
    // every transaction into block 3_000_001
    const fakeClient = ({ utxos = adminUtxos, config = () => undefined } = {}) => {
        const submitted = [];
        // what was asked, in order: where the index's start block was read, and the submits
        const asked = [];
        return {
            submitted,
            asked,
            params: async () => params,
            tip: async () => TIP,
            utxosAt: async address => utxos.filter(entry => Address.toBech32(entry.address) === address),
            utxoByUnit: async () => config(),
            submit: async cbor => {
                asked.push('submit');
                submitted.push(cbor);
                return txIdOf(cbor);
            },
            blockOf: async () => TIP.block + 1,
            blockAt: async height => {
                asked.push(`blockAt ${height}`);
                return blockAtHeight(height);
            },
        };
    };
    // a block of the fake chain by its height: 20 slots a block, below the tip
    const blockAtHeight = height => ({ block: height, slot: TIP.slot - (TIP.block - height) * 20, hash: crypto.createHash('sha256').update(`block ${height}`).digest('hex') });
    // the lines for the server's .env a run prints last
    const envBlock = ({ policyId = plan().policyId, configRef, configPolicyId = plan().configPolicyId, start }) => [
        `CHAIN_POLICY_ID=${policyId}`,
        `CHAIN_CONFIG_REF=${configRef}`,
        `CHAIN_CONFIG_POLICY_ID=${configPolicyId}`,
        `YACI_SYNC_START_SLOT=${start.slot}`,
        `YACI_SYNC_START_BLOCKHASH=${start.hash}`,
    ];
    const run = async (script, argv, { client = fakeClient(), environment = env, deploymentFile = path.join(dir, 'preprod.json') } = {}) => {
        const lines = [];
        const error = await failure(script.main({ argv, env: environment, client, log: line => lines.push(String(line)), deploymentFile, sleep: async () => {} }));
        return { lines, output: lines.join('\n'), error, client, deploymentFile };
    };
    const noSecretIn = text => {
        for (const secret of secrets()) {
            expect(text).not.toContain(secret);
        }
    };
    const deployArgs = ['--admin-key', null, '--server-key-hash', server.keyHash];
    const withKey = args => args.map(arg => arg ?? adminKeyFile);

    test('deploy --dry-run prints the ids and the fee, submits nothing and writes no record', async () => {
        const planned = plan();
        const { output, error, client, deploymentFile } = await run(deploy, withKey([...deployArgs, '--dry-run']));
        expect(error).toBeUndefined();
        expect(output).toContain(`config seed       ${SEED}`);
        expect(output).toContain(`config policy     ${planned.configPolicyId}`);
        expect(output).toContain(`items policy      ${planned.policyId}`);
        expect(output).toContain(`treasury address  ${planned.treasuryAddress}`);
        expect(output).toMatch(/config tx {9}[0-9a-f]{64} {2}fee \d+ lovelace/);
        // and the whole transaction: what it spends, mints and pays, and to whom
        expect(output).toContain(`inputs           ${SEED}`);
        expect(output).toContain(`mint             1 ${planned.configPolicyId}.${CONFIG_TOKEN_NAME}`);
        expect(output).toMatch(new RegExp(`output 0 {9}${scriptAddress(planned.configPolicyId, preprod)}: \\d+ lovelace \\+ 1 ${planned.configPolicyId}\\.${CONFIG_TOKEN_NAME}, inline datum`));
        expect(output).toContain(`"address": "${planned.treasuryAddress}"`);
        expect(output).toMatch(/dry run: nothing submitted/);
        expect(output).not.toMatch(/CHAIN_CONFIG_REF=/);
        expect(client.submitted).toEqual([]);
        expect(fs.existsSync(deploymentFile)).toBe(false);
        noSecretIn(output);
    });

    test('deploy submits the signed transaction, waits for its block, prints the two lines and writes the record of public data', async () => {
        const planned = plan();
        const { lines, output, error, client, deploymentFile } = await run(deploy, withKey(deployArgs));
        expect(error).toBeUndefined();
        expect(client.submitted).toHaveLength(1);
        const txId = txIdOf(client.submitted[0]);
        expect(vkeyHashesOf(client.submitted[0])).toEqual([admin.keyHash]);
        expect(output).toContain(`config tx         ${txId}  waiting for a block … in block ${TIP.block + 1}`);
        // where the index starts: 20 blocks below the tip, read right before the submit
        const start = blockAtHeight(TIP.block - 20);
        expect(client.asked).toEqual([`blockAt ${TIP.block - 20}`, 'submit']);
        expect(lines.slice(-5)).toEqual(envBlock({ policyId: planned.policyId, configRef: `${txId}#0`, configPolicyId: planned.configPolicyId, start }));
        noSecretIn(output);

        const record = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        expect(record).toEqual({
            network: 'preprod',
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            compiler: blueprint.compiler,
            blueprintSha256: crypto.createHash('sha256').update(fs.readFileSync(BLUEPRINT_FILE)).digest('hex'),
            configSeed: SEED,
            configPolicyId: planned.configPolicyId,
            policyId: planned.policyId,
            configRef: `${txId}#0`,
            treasuryAddress: planned.treasuryAddress,
            adminKeyHash: admin.keyHash,
            serverKeyHashes: [server.keyHash],
            threshold: 1,
            fees: planned.configDatum.fees,
            status: 'confirmed',
            configTx: txId,
            block: TIP.block + 1,
            indexStart: blockAtHeight(TIP.block - 20),
            confirmedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        });
        noSecretIn(fs.readFileSync(deploymentFile, 'utf8'));
    });

    // A record of the deploy of `plan()` as deploy.js writes it: `submitted`, or `confirmed` in a block
    const recordOf = status => ({
        network: 'preprod',
        date: '2026-11-01T00:00:00.000Z',
        configSeed: SEED,
        configPolicyId: plan().configPolicyId,
        policyId: plan().policyId,
        configRef: `${'e1'.repeat(32)}#0`,
        adminKeyHash: admin.keyHash,
        status,
        configTx: 'e1'.repeat(32),
        block: status === 'confirmed' ? 3_000_100 : null,
        ...(status === 'confirmed' ? { confirmedAt: '2026-11-01T00:01:00.000Z' } : {}),
    });
    const writeRecord = (record, file = path.join(dir, 'preprod.json')) => {
        const text = `${JSON.stringify(record, null, 2)}\n`;
        fs.writeFileSync(file, text);
        return text;
    };

    test('a rerun over a confirmed record refuses: deploying again makes a second config policy; --again does, keeping the old record aside', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const old = writeRecord({ ...recordOf('confirmed'), configPolicyId: 'c0'.repeat(28) });
        for (const args of [deployArgs, [...deployArgs, '--dry-run']]) {
            const existing = await run(deploy, withKey(args), { deploymentFile });
            expect(existing.error?.message).toMatch(/preprod\.json exists/);
            expect(existing.error?.message).toMatch(/confirmed in block 3000100/);
            expect(existing.error?.message).toContain('c0'.repeat(28));
            expect(existing.error?.message).toMatch(/second config policy/);
            expect(existing.error?.message).toMatch(/--again/);
            expect(existing.client.submitted).toEqual([]);
        }
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(old);

        const again = await run(deploy, withKey([...deployArgs, '--again']), { deploymentFile });
        expect(again.error).toBeUndefined();
        expect(again.client.submitted).toHaveLength(1);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ configPolicyId: plan().configPolicyId, status: 'confirmed' });
        const aside = fs.readdirSync(dir).filter(name => name.startsWith('preprod.replaced-'));
        expect(aside).toHaveLength(1);
        expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe(old);
        expect(again.output).toContain(aside[0]);
    });

    test('a rerun over a submitted record names its transaction, --confirm and --again, and does not speak of a second policy', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        const existing = await run(deploy, withKey(deployArgs), { deploymentFile });
        const message = existing.error?.message;
        expect(message).toMatch(/submitted on 2026-11-01T00:00:00.000Z and not confirmed/);
        expect(message).toContain('e1'.repeat(32));
        expect(message).toMatch(/--confirm/);
        expect(message).toMatch(/--again/);
        expect(message).toMatch(/same seed/);
        expect(message).not.toMatch(/second config policy/);
        expect(existing.client.submitted).toEqual([]);
    });

    test('--again over a submitted record retries with the recorded seed while it is unspent: the same policy ids', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        // meanwhile a larger ADA-only UTxO came: the retry still spends the recorded seed
        const richer = [...adminUtxos, utxo({ address: admin.enterpriseAddress, lovelace: ada(40), txId: 'd5'.repeat(32), index: 0 })];
        const retry = await run(deploy, withKey([...deployArgs, '--again']), { client: fakeClient({ utxos: richer }), deploymentFile });
        expect(retry.error).toBeUndefined();
        expect(retry.output).toContain(`config seed       ${SEED}`);
        expect(decoded(retry.client.submitted[0]).body.inputs.map(outRefOf)).toContain(SEED);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ configPolicyId: plan().configPolicyId, policyId: plan().policyId, status: 'confirmed' });
    });

    // The seed of the submitted record is spent: the wallet no longer holds it, and the chain has
    // the transactions of `inBlock` ({ txId: height }) in blocks, no others
    const RECORDED_TX = 'e1'.repeat(32);
    const EARLIER_TX = 'e0'.repeat(32);
    // (and what is submitted here lands in the next block)
    const seedSpent = (inBlock = {}) => {
        const client = fakeClient({ utxos: adminUtxos.filter(entry => outRefOf(entry) !== SEED) });
        return { ...client, blockOf: async txId => inBlock[txId] ?? (client.submitted.some(cbor => txIdOf(cbor) === txId) ? TIP.block + 1 : null) };
    };
    // an earlier attempt of the same deploy, set aside by a retry
    const EARLIER_FILE = 'preprod.replaced-2026-10-31T23-59-00-000Z.json';
    const writeEarlier = () => writeRecord({ ...recordOf('submitted'), date: '2026-10-31T23:50:00.000Z', configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0` }, path.join(dir, EARLIER_FILE));

    test.each([
        ['--again', () => withKey([...deployArgs, '--again'])],
        ['--confirm', () => ['--confirm']],
    ])('%s with the seed spent and the recorded transaction in a block confirms the record; nothing new is submitted', async (_name, argv) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        const result = await run(deploy, argv(), { client: seedSpent({ [RECORDED_TX]: 3_000_200 }), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(result.client.submitted).toEqual([]);
        expect(result.output).toMatch(new RegExp(`config tx ${RECORDED_TX} .*is in block 3000200`));
        expect(result.output).toMatch(/nothing new is submitted/);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ status: 'confirmed', block: 3_000_200, configTx: RECORDED_TX });
        // a record without a start point gets one below the block it landed in
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8')).indexStart).toEqual(blockAtHeight(3_000_180));
        expect(result.lines.slice(-5)).toEqual(envBlock({ configRef: `${RECORDED_TX}#0`, start: blockAtHeight(3_000_180) }));
    });

    test.each([
        ['--again', () => withKey([...deployArgs, '--again'])],
        ['--confirm', () => ['--confirm']],
    ])("%s with the seed spent by an earlier attempt adopts that attempt's record: it is the deployment", async (_name, argv) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        writeEarlier();
        const result = await run(deploy, argv(), { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(result.client.submitted).toEqual([]);
        expect(result.output).toMatch(new RegExp(`config tx ${EARLIER_TX} of ${EARLIER_FILE.replace(/\./g, '\\.')} is in block 3000150`));
        expect(result.output).toMatch(/nothing new is submitted/);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ status: 'confirmed', block: 3_000_150, configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0` });
        // the adopted record is no longer aside; the later attempt's is
        const aside = fs.readdirSync(dir).filter(name => name.startsWith('preprod.replaced-'));
        expect(aside).not.toContain(EARLIER_FILE);
        expect(aside).toHaveLength(1);
        expect(JSON.parse(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).configTx).toBe(RECORDED_TX);
        expect(result.lines.slice(-5)).toEqual(envBlock({ configRef: `${EARLIER_TX}#0`, start: blockAtHeight(3_000_130) }));
    });

    test.each([
        ['--again', () => withKey([...deployArgs, '--again'])],
        ['--confirm', () => ['--confirm']],
    ])('%s with the seed spent and nothing recorded in a block says what spent it is unknown, and names --new-seed as the one way forward', async (_name, argv) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        writeEarlier();
        const result = await run(deploy, argv(), { client: seedSpent(), deploymentFile });
        const message = result.error?.message;
        expect(message).toMatch(new RegExp(`the seed ${SEED} of the submitted deploy is spent`));
        expect(message).toMatch(/but not by its config tx/);
        expect(message).toContain(EARLIER_FILE);
        expect(message).toMatch(new RegExp(`look up ${SEED} on a preprod explorer`));
        expect(message).toMatch(/--new-seed/);
        expect(message).toMatch(/policy ids will differ/);
        expect(message).not.toMatch(/retry with --again/);
        expect(message).not.toMatch(/second config policy/);
        expect(result.client.submitted).toEqual([]);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
    });

    // Only an earlier attempt of the same deploy can have spent its seed: still submitted, with the
    // same seed, admin key and network. Each of these differs from such an attempt in one thing,
    // and its transaction is in a block all the same.
    const OTHER_SEED = 'd0'.repeat(32) + '#0';
    test.each([
        ['another seed (another collection)', { configSeed: OTHER_SEED, configPolicyId: 'c1'.repeat(28) }, `another seed (${OTHER_SEED})`],
        ['another admin key', { adminKeyHash: stranger.keyHash }, 'another admin key'],
        ['another network', { network: 'preview' }, 'another network (preview)'],
        ['a confirmed deployment, replaced on purpose', { status: 'confirmed', block: 3_000_050, confirmedAt: '2026-10-31T23:51:00.000Z' }, 'confirmed: a deployment replaced on purpose'],
    ])('a record set aside with %s is not adopted, even with its transaction in a block; the refusal names it and why', async (_name, change, why) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        const asideText = writeRecord({ ...recordOf('submitted'), date: '2026-10-31T23:50:00.000Z', configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0`, ...change }, path.join(dir, EARLIER_FILE));
        for (const argv of [withKey([...deployArgs, '--again']), ['--confirm']]) {
            const result = await run(deploy, argv, { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
            const message = result.error?.message;
            expect(message).toMatch(new RegExp(`the seed ${SEED} of the submitted deploy is spent`));
            expect(message).toMatch(/no earlier attempt of it was set aside/);
            expect(message).toContain(`${EARLIER_FILE} (${why}`);
            expect(message).toMatch(/--new-seed/);
            expect(result.output).not.toMatch(/nothing new is submitted/);
            expect(result.client.submitted).toEqual([]);
            expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
            expect(fs.readFileSync(path.join(dir, EARLIER_FILE), 'utf8')).toBe(asideText);
        }
    });

    test('a matching earlier attempt is adopted past a newer record set aside that does not match', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        writeEarlier();
        // newer, so looked at first: the deployment the owner replaced on purpose, in a block
        const REPLACED_FILE = 'preprod.replaced-2026-11-01T00-00-30-000Z.json';
        const replaced = writeRecord({ ...recordOf('confirmed'), configSeed: OTHER_SEED, configTx: 'e2'.repeat(32), configRef: `${'e2'.repeat(32)}#0` }, path.join(dir, REPLACED_FILE));
        const result = await run(deploy, ['--confirm'], { client: seedSpent({ ['e2'.repeat(32)]: 3_000_100, [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(result.output).toMatch(new RegExp(`config tx ${EARLIER_TX} of ${EARLIER_FILE.replace(/\./g, '\\.')} is in block 3000150`));
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ status: 'confirmed', block: 3_000_150, configTx: EARLIER_TX });
        expect(fs.readFileSync(path.join(dir, REPLACED_FILE), 'utf8')).toBe(replaced);
    });

    test('--again over a confirmed deployment, then a lost retry: the replaced deployment is never adopted back', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        // X: confirmed, from a seed spent long ago
        writeRecord({ ...recordOf('confirmed'), configSeed: OTHER_SEED, configPolicyId: 'c0'.repeat(28) });
        // Y replaces it on purpose, from the seed SEED, and does not reach a block
        const replacing = await run(deploy, withKey([...deployArgs, '--again']), { client: { ...fakeClient(), blockOf: async () => null }, deploymentFile });
        expect(replacing.error?.message).toMatch(/in no block yet/);
        const [asideX] = fs.readdirSync(dir).filter(name => name.startsWith('preprod.replaced-'));
        const textY = fs.readFileSync(deploymentFile, 'utf8');
        expect(JSON.parse(textY)).toMatchObject({ status: 'submitted', configSeed: SEED });
        // SEED is spent by something else; X's transaction is in its block, as it always was
        for (const argv of [withKey([...deployArgs, '--again']), ['--confirm']]) {
            const result = await run(deploy, argv, { client: seedSpent({ [RECORDED_TX]: 3_000_100 }), deploymentFile });
            expect(result.error?.message).toContain(`${asideX} (confirmed: a deployment replaced on purpose`);
            expect(result.client.submitted).toEqual([]);
            expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(textY);
        }
    });

    test('--confirm: the seed unspent before the wait, nothing in a block, the seed spent after it: refused as spent elsewhere', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        writeEarlier();
        // the first look at the wallet still finds the seed, every later one does not
        let looks = 0;
        const client = {
            ...fakeClient(),
            utxosAt: async address => adminUtxos.filter(entry => Address.toBech32(entry.address) === address && (looks === 0 || outRefOf(entry) !== SEED)),
            blockOf: async () => null,
        };
        const counted = { ...client, utxosAt: async address => client.utxosAt(address).finally(() => (looks += 1)) };
        const result = await run(deploy, ['--confirm'], { client: counted, deploymentFile });
        expect(looks).toBe(2);
        expect(result.output).toMatch(/waiting for config tx/);
        const message = result.error?.message;
        expect(message).toMatch(new RegExp(`the seed ${SEED} of the submitted deploy is spent`));
        expect(message).toContain(EARLIER_FILE);
        expect(message).toMatch(/--new-seed/);
        expect(message).not.toMatch(/retry with --again/);
        expect(message).not.toMatch(/in no block yet/);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
    });

    // An interruption between keeping the record aside and writing the new one: `fs.writeFileSync`
    // of the new record fails, as a kill there would leave it
    const interruptedWrite = async run_ => {
        const realWrite = fs.writeFileSync;
        const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...rest) => {
            if (String(file).endsWith('.partial')) {
                throw new Error('interrupted');
            }
            return realWrite(file, ...rest);
        });
        try {
            return await run_();
        } finally {
            spy.mockRestore();
        }
    };

    test('an adoption interrupted before the new record is written leaves preprod.json readable; a rerun adopts', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        writeEarlier();
        const interrupted = await interruptedWrite(() => run(deploy, ['--confirm'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile }));
        expect(interrupted.error?.message).toBe('interrupted');
        expect(fs.existsSync(deploymentFile)).toBe(true);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);

        const rerun = await run(deploy, ['--confirm'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(rerun.error).toBeUndefined();
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ status: 'confirmed', configTx: EARLIER_TX });
        // what is left aside is the later attempt's record, possibly twice; the adopted one is gone
        const aside = fs.readdirSync(dir).filter(name => name.startsWith('preprod.replaced-'));
        expect(aside).not.toContain(EARLIER_FILE);
        expect(aside.map(name => fs.readFileSync(path.join(dir, name), 'utf8'))).toEqual(aside.map(() => text));
    });

    test('a deploy interrupted before its record is written over the earlier one leaves preprod.json readable', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        const interrupted = await interruptedWrite(() => run(deploy, withKey([...deployArgs, '--again']), { deploymentFile }));
        expect(interrupted.error?.message).toBe('interrupted');
        expect(interrupted.client.submitted).toHaveLength(1);
        expect(fs.existsSync(deploymentFile)).toBe(true);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
    });

    test('--new-seed deploys anew with another seed once nothing recorded landed: other policy ids, the record kept aside', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        const fresh = await run(deploy, withKey([...deployArgs, '--new-seed']), { client: seedSpent(), deploymentFile });
        expect(fresh.error).toBeUndefined();
        expect(fresh.client.submitted).toHaveLength(1);
        expect(fresh.output).toMatch(/a fresh deployment with a new seed/);
        expect(fresh.output).toMatch(/policy ids differ from the recorded ones/);
        const record = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        expect(record.configSeed).not.toBe(SEED);
        expect(record.configPolicyId).not.toBe(plan().configPolicyId);
        expect(record.status).toBe('confirmed');
        const aside = fs.readdirSync(dir).filter(name => name.startsWith('preprod.replaced-'));
        expect(aside.map(name => fs.readFileSync(path.join(dir, name), 'utf8'))).toEqual([text]);
    });

    test('--new-seed is refused where it does not apply: the seed is unspent, something recorded landed, the record is confirmed or missing', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const args = withKey([...deployArgs, '--new-seed']);
        writeRecord(recordOf('submitted'));
        const unspent = await run(deploy, args, { deploymentFile });
        expect(unspent.error?.message).toMatch(/is unspent: retry with --again/);
        const landed = await run(deploy, args, { client: seedSpent({ [RECORDED_TX]: 3_000_200 }), deploymentFile });
        expect(landed.error).toBeUndefined();
        expect(landed.output).toMatch(/nothing new is submitted/);
        expect(landed.client.submitted).toEqual([]);
        // now confirmed
        const confirmed = await run(deploy, args, { client: seedSpent(), deploymentFile });
        expect(confirmed.error?.message).toMatch(/--new-seed is only for a submitted record/);
        fs.rmSync(deploymentFile);
        const missing = await run(deploy, args, { deploymentFile });
        expect(missing.error?.message).toMatch(/--new-seed is only for a submitted record/);
        expect([unspent, confirmed, missing].flatMap(result => result.client.submitted)).toEqual([]);
    });

    test("deploy reads the index's start block before it submits: none there, or a failure, and nothing is submitted or recorded", async () => {
        for (const blockAt of [async () => null, async () => Promise.reject(new Error('blockAt: the provider answered 503'))]) {
            const deploymentFile = path.join(dir, 'preprod.json');
            const result = await run(deploy, withKey(deployArgs), { client: { ...fakeClient(), blockAt }, deploymentFile });
            expect(result.error?.message).toMatch(/start block/);
            expect(result.error?.message).toMatch(/nothing is submitted/);
            expect(result.client.submitted).toEqual([]);
            expect(fs.existsSync(deploymentFile)).toBe(false);
        }
        // a dry run submits nothing and needs no start block
        const dry = await run(deploy, withKey([...deployArgs, '--dry-run']), { client: { ...fakeClient(), blockAt: async () => null } });
        expect(dry.error).toBeUndefined();
    });

    // a start point recorded by an earlier run, before every block of the tests' chain
    const FIRST_START = { block: 2_999_000, slot: 79_980_000, hash: 'aa'.repeat(32) };
    test.each([
        ['--again over a submitted record (the retry)', 'submitted', () => withKey([...deployArgs, '--again']), {}],
        ['--again over a confirmed record (a second config policy)', 'confirmed', () => withKey([...deployArgs, '--again']), {}],
        ['--new-seed', 'submitted', () => withKey([...deployArgs, '--new-seed']), { seedSpent: true }],
        ['--confirm', 'submitted', () => ['--confirm'], {}],
    ])('the start point is fixed once: %s keeps the one recorded first', async (_name, status, argv, { seedSpent: spent }) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord({ ...recordOf(status), indexStart: FIRST_START });
        const result = await run(deploy, argv(), { client: spent ? seedSpent() : fakeClient(), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(result.client.asked.filter(entry => entry.startsWith('blockAt'))).toEqual([]);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ status: 'confirmed', indexStart: FIRST_START });
        expect(result.lines.slice(-2)).toEqual([`YACI_SYNC_START_SLOT=${FIRST_START.slot}`, `YACI_SYNC_START_BLOCKHASH=${FIRST_START.hash}`]);
    });

    test('an adopted earlier attempt: the earliest start point of the two records is kept', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const later = { block: 3_000_010, slot: 80_000_200, hash: 'bb'.repeat(32) };
        writeRecord({ ...recordOf('submitted'), indexStart: later });
        writeRecord({ ...recordOf('submitted'), date: '2026-10-31T23:50:00.000Z', configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0`, indexStart: FIRST_START }, path.join(dir, EARLIER_FILE));
        const result = await run(deploy, ['--confirm'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ configTx: EARLIER_TX, indexStart: FIRST_START });
        // the other way round too: the earlier start of the later record wins over the adopted one's
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir);
        writeRecord({ ...recordOf('submitted'), indexStart: FIRST_START });
        writeRecord({ ...recordOf('submitted'), date: '2026-10-31T23:50:00.000Z', configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0`, indexStart: later }, path.join(dir, EARLIER_FILE));
        const again = await run(deploy, ['--confirm'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(again.error).toBeUndefined();
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ configTx: EARLIER_TX, indexStart: FIRST_START });
    });

    test('an adopted earlier attempt without a start point, beside one recorded above its block: the start goes below the block it landed in', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        // the later attempt read its start point after the earlier one had landed
        writeRecord({ ...recordOf('submitted'), indexStart: blockAtHeight(3_000_180) });
        writeRecord({ ...recordOf('submitted'), date: '2026-10-31T23:50:00.000Z', configTx: EARLIER_TX, configRef: `${EARLIER_TX}#0` }, path.join(dir, EARLIER_FILE));
        const result = await run(deploy, ['--confirm'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(result.error).toBeUndefined();
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toMatchObject({ configTx: EARLIER_TX, block: 3_000_150, indexStart: blockAtHeight(3_000_130) });
    });

    test('a start block that cannot be read while adopting: the record stays, and the message does not claim nothing was submitted', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        const client = { ...seedSpent({ [RECORDED_TX]: 3_000_200 }), blockAt: async () => null };
        const result = await run(deploy, ['--confirm'], { client, deploymentFile });
        expect(result.error?.message).toMatch(/start block 3000180/);
        expect(result.error?.message).not.toMatch(/nothing is submitted/);
        expect(result.error?.message).toMatch(/the deployment is on the chain.*--confirm/);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
    });

    test.each([
        ['a block that is no number', { block: 'x', slot: 79_980_000, hash: 'aa'.repeat(32) }],
        ['a short hash', { block: 2_999_000, slot: 79_980_000, hash: 'aa' }],
        ['no slot', { block: 2_999_000, hash: 'aa'.repeat(32) }],
        ['not an object', 'block 2999000'],
    ])('a malformed start point in a record (%s) is refused loudly, never replaced', async (_name, indexStart) => {
        const deploymentFile = path.join(dir, 'preprod.json');
        for (const [status, argv] of [
            ['submitted', withKey([...deployArgs, '--again'])],
            ['submitted', ['--confirm']],
            ['confirmed', ['--confirm']],
            ['confirmed', withKey([...deployArgs, '--again'])],
        ]) {
            const text = writeRecord({ ...recordOf(status), indexStart });
            const result = await run(deploy, argv, { deploymentFile });
            expect([status, argv.join(' '), result.error?.message]).toEqual([status, argv.join(' '), expect.stringMatching(/preprod\.json: its indexStart .*is malformed/)]);
            expect(result.client.submitted).toEqual([]);
            expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
        }
    });

    test('a record confirmed before start points were recorded: --confirm says so and prints the lines it has', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('confirmed'));
        const result = await run(deploy, ['--confirm'], { deploymentFile });
        expect(result.error).toBeUndefined();
        expect(result.output).toMatch(/no start point for the index/);
        expect(result.lines.slice(-3)).toEqual([`CHAIN_POLICY_ID=${plan().policyId}`, `CHAIN_CONFIG_REF=${'e1'.repeat(32)}#0`, `CHAIN_CONFIG_POLICY_ID=${plan().configPolicyId}`]);
    });

    test('--again refuses a record made with another admin key', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord({ ...recordOf('submitted'), adminKeyHash: stranger.keyHash });
        const other = await run(deploy, withKey([...deployArgs, '--again']), { deploymentFile });
        expect(other.error?.message).toMatch(/made with the admin key .* not with this one/);
        expect(other.client.submitted).toEqual([]);
    });

    test('deploy --confirm waits for the recorded transaction and rewrites the record as confirmed, with no key and no submit', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        const confirmed = await run(deploy, ['--confirm'], { deploymentFile });
        expect(confirmed.error).toBeUndefined();
        expect(confirmed.client.submitted).toEqual([]);
        expect(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))).toEqual({
            ...recordOf('submitted'),
            status: 'confirmed',
            block: TIP.block + 1,
            indexStart: blockAtHeight(TIP.block + 1 - 20),
            confirmedAt: expect.stringMatching(/^\d{4}-/),
        });
        expect(confirmed.lines.slice(-5)).toEqual(envBlock({ configRef: `${'e1'.repeat(32)}#0`, start: blockAtHeight(TIP.block + 1 - 20) }));

        // once more: it is confirmed already, nothing changes
        const text = fs.readFileSync(deploymentFile, 'utf8');
        const twice = await run(deploy, ['--confirm'], { deploymentFile });
        expect(twice.error).toBeUndefined();
        expect(twice.output).toMatch(/confirmed already, in block/);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
    });

    test('deploy --confirm --dry-run says what it would confirm and changes no file', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        // the recorded transaction in a block
        const text = writeRecord(recordOf('submitted'));
        const shown = await run(deploy, ['--confirm', '--dry-run'], { deploymentFile });
        expect(shown.error).toBeUndefined();
        expect(shown.output).toMatch(/is in block \d+: that deploy reached the chain/);
        expect(shown.output).toMatch(/dry run: .*preprod\.json is not changed/);
        expect(shown.client.submitted).toEqual([]);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
        // the seed spent by an earlier attempt set aside: neither file moves
        const asideText = writeEarlier();
        const earlier = await run(deploy, ['--confirm', '--dry-run'], { client: seedSpent({ [EARLIER_TX]: 3_000_150 }), deploymentFile });
        expect(earlier.error).toBeUndefined();
        expect(earlier.output).toMatch(/dry run: .*preprod\.json is not changed/);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
        expect(fs.readFileSync(path.join(dir, EARLIER_FILE), 'utf8')).toBe(asideText);
        expect(fs.readdirSync(dir).sort()).toEqual([EARLIER_FILE, 'preprod-admin.sk', 'preprod.json'].sort());
    });

    test('deploy --confirm with no block yet leaves the record submitted; without a record it has nothing to confirm', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        const text = writeRecord(recordOf('submitted'));
        const late = await run(deploy, ['--confirm'], { client: { ...fakeClient(), blockOf: async () => null }, deploymentFile });
        expect(late.error?.message).toMatch(/in no block yet/);
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(text);
        fs.rmSync(deploymentFile);
        const none = await run(deploy, ['--confirm'], { deploymentFile });
        expect(none.error?.message).toMatch(/no deployment record/);
    });

    test('update-config refuses a deployment that is only submitted: confirm it first', async () => {
        const deploymentFile = path.join(dir, 'preprod.json');
        writeRecord(recordOf('submitted'));
        const refused = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause', '--dry-run'], { deploymentFile });
        expect(refused.error?.message).toMatch(/not confirmed.*deploy\.js --confirm/);
    });

    test('deploy refuses a server key hash that is the admin key hash, saying which is which', async () => {
        const result = await run(deploy, withKey(['--admin-key', null, '--server-key-hash', admin.keyHash, '--dry-run']));
        expect(result.error?.message).toMatch(/is the admin key's hash/);
        expect(result.error?.message).toMatch(/preprod-server\.sk/);
        expect(() => planDeployment({ blueprint, adminUtxos, adminKeyHash: admin.keyHash, serverKeyHash: admin.keyHash, network: preprod })).toThrow(/admin key's hash/);
    });

    test.each([
        ['the id it answers is another', { submit: async () => 'ee'.repeat(32) }, /answered the transaction id/],
        ['no block comes', { blockOf: async () => null }, /in no block yet/],
        ['the submit fails without an answer', { submit: async () => Promise.reject(Object.assign(new Error('submit: could not reach cardano-preprod.blockfrost.io (ECONNRESET)'), { refused: false })) }, /may have reached the chain/],
    ])('deploy writes the record and prints the ids, submitted and not yet confirmed, even when %s', async (_name, override, message) => {
        const planned = plan();
        const client = { ...fakeClient(), ...override };
        const { output, error, deploymentFile } = await run(deploy, withKey(deployArgs), { client });
        expect(error?.message).toMatch(message);
        // what to do with a record that is submitted: look it up, --confirm if it is in a block,
        // --again (the same seed) if it never reached the chain; never "a second config policy"
        expect(error?.message).toMatch(/Look up config tx [0-9a-f]{64} on a preprod explorer/);
        expect(error?.message).toMatch(/if it is in a block, run deploy\.js --confirm/);
        expect(error?.message).toMatch(/if it never reached the chain, retry with --again \(the same seed, the same policy ids\)/);
        expect(error?.message).not.toMatch(/second config policy/);
        const record = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        expect(record).toMatchObject({ configPolicyId: planned.configPolicyId, status: 'submitted', block: null, configTx: record.configRef.split('#')[0] });
        expect(output).toMatch(/submitted, not yet confirmed/);
        for (const value of [planned.configPolicyId, planned.policyId, planned.treasuryAddress, record.configRef]) {
            expect(output).toContain(value);
        }
        noSecretIn(output + error.message);
    });

    test('deploy writes no record when the provider refused the transaction: nothing was deployed', async () => {
        const refused = Object.assign(new Error('submit: the provider refused the transaction (400): BadInputsUTxO'), { refused: true });
        const client = { ...fakeClient(), submit: async () => Promise.reject(refused) };
        const { error, deploymentFile } = await run(deploy, withKey(deployArgs), { client });
        expect(error?.message).toMatch(/BadInputsUTxO/);
        expect(error?.message).toMatch(/Nothing is deployed/);
        expect(fs.existsSync(deploymentFile)).toBe(false);
    });

    test.each([
        ['a bech32 key', () => PrivateKey.toBech32(admin.privateKey)],
        ['a hex key', () => PrivateKey.toHex(admin.privateKey)],
    ])('both scripts never echo %s given as --admin-key instead of a path', async (_name, keyText) => {
        const text = keyText();
        for (const [script, argv] of [
            [deploy, ['--admin-key', text, '--server-key-hash', server.keyHash, '--dry-run']],
            [updateConfig, ['--admin-key', text, '--pause', '--dry-run']],
        ]) {
            if (script === updateConfig) {
                await run(deploy, withKey(deployArgs));
            }
            const result = await run(script, argv);
            expect(result.error?.message).toMatch(/that is a key, not a file/);
            noSecretIn(result.error.message + result.output);
            fs.rmSync(path.join(dir, 'preprod.json'), { force: true });
        }
    });

    test('a key given where no argument is expected is not echoed either', async () => {
        const result = await run(deploy, [...withKey(deployArgs), PrivateKey.toBech32(admin.privateKey)]);
        expect(result.error?.message).toMatch(/that is a key/);
        noSecretIn(result.error.message);
    });

    test('deploy refuses a key file others may read', async () => {
        fs.chmodSync(adminKeyFile, 0o644);
        const open = await run(deploy, withKey(deployArgs));
        expect(open.error?.message).toMatch(/chmod 600/);
        noSecretIn(open.error.message);
    });

    test('update-config pauses: spends the config, prints the new CHAIN_CONFIG_REF; --dry-run submits nothing', async () => {
        const deployed = await build();
        const configUtxo = outputUtxo(deployed.cbor, 0);
        const deploymentFile = path.join(dir, 'preprod.json');
        const deployment = await run(deploy, withKey(deployArgs), { deploymentFile });
        expect(deployment.error).toBeUndefined();
        const recordText = fs.readFileSync(deploymentFile, 'utf8');
        const client = () => fakeClient({ config: () => configUtxo });

        const dry = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause', '--dry-run'], { client: client(), deploymentFile });
        expect(dry.error).toBeUndefined();
        expect(dry.client.submitted).toEqual([]);
        expect(dry.output).toMatch(/"paused": true/);
        expect(dry.output).not.toMatch(/CHAIN_CONFIG_REF=/);

        const real = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause'], { client: client(), deploymentFile });
        expect(real.error).toBeUndefined();
        expect(real.client.submitted).toHaveLength(1);
        const submitted = real.client.submitted[0];
        expect(decoded(submitted).body.inputs.map(outRefOf)).toContain(`${deployed.txId}#0`);
        const index = nftIndexOf(submitted, plan().configPolicyId);
        expect(decodeConfigDatum(decoded(submitted).body.outputs[index].datumOption.data, preprod).paused).toBe(true);
        expect(real.lines.at(-1)).toBe(`CHAIN_CONFIG_REF=${txIdOf(submitted)}#${index}`);
        noSecretIn(dry.output + real.output);
        // the record, its start point for the index with it, stays as the deployment wrote it
        expect(fs.readFileSync(deploymentFile, 'utf8')).toBe(recordText);
        expect(real.client.asked.filter(entry => entry.startsWith('blockAt'))).toEqual([]);
    });

    test('update-config after a submit: a refusal changed nothing; any other failure may have, and names the new CHAIN_CONFIG_REF', async () => {
        const configUtxo = outputUtxo((await build()).cbor, 0);
        const deploymentFile = path.join(dir, 'preprod.json');
        await run(deploy, withKey(deployArgs), { deploymentFile });
        const failing = refused => ({
            ...fakeClient({ config: () => configUtxo }),
            submit: async () => Promise.reject(Object.assign(new Error('submit: the provider answered 503: busy'), { refused })),
        });
        const no = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause'], { client: failing(true), deploymentFile });
        expect(no.error?.message).toMatch(/Nothing changed/);
        const maybe = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause'], { client: failing(false), deploymentFile });
        expect(maybe.error?.message).toMatch(/may have reached the chain.*CHAIN_CONFIG_REF=[0-9a-f]{64}#\d/);
        const late = await run(updateConfig, ['--admin-key', adminKeyFile, '--pause'], { client: { ...fakeClient({ config: () => configUtxo }), blockOf: async () => null }, deploymentFile });
        expect(late.output).toMatch(/config ref {8}[0-9a-f]{64}#\d \(submitted, not yet confirmed\)/);
        expect(late.error?.message).toMatch(/in no block yet.*CHAIN_CONFIG_REF=/);
    });

    test('update-config --fees reads the list from a JSON file; a malformed one is refused before anything is built', async () => {
        const configUtxo = outputUtxo((await build()).cbor, 0);
        const deploymentFile = path.join(dir, 'preprod.json');
        await run(deploy, withKey(deployArgs), { deploymentFile });
        const feesFile = path.join(dir, 'fees.json');

        fs.writeFileSync(feesFile, '[]\n');
        const none = await run(updateConfig, ['--admin-key', adminKeyFile, '--fees', feesFile], { client: fakeClient({ config: () => configUtxo }), deploymentFile });
        expect(none.error).toBeUndefined();
        const submitted = none.client.submitted[0];
        expect(decodeConfigDatum(decoded(submitted).body.outputs[nftIndexOf(submitted, plan().configPolicyId)].datumOption.data, preprod).fees).toEqual([]);

        for (const content of ['[{"asset": "lovelace", "amounts": [1, 2], "receivers": []}]', 'not json']) {
            fs.writeFileSync(feesFile, content);
            const refused = await run(updateConfig, ['--admin-key', adminKeyFile, '--fees', feesFile], { client: fakeClient({ config: () => configUtxo }), deploymentFile });
            expect(refused.error?.message).toMatch(/fees/);
            expect(refused.client.submitted).toEqual([]);
        }
    });

    test('update-config refuses a key that is not an admin of the config, and no change or two', async () => {
        const configUtxo = outputUtxo((await build()).cbor, 0);
        const deploymentFile = path.join(dir, 'preprod.json');
        await run(deploy, withKey(deployArgs), { deploymentFile });
        const strangerFile = path.join(dir, 'stranger.sk');
        writeKeyFile(strangerFile, stranger.privateKey);

        const notAdmin = await run(updateConfig, ['--admin-key', strangerFile, '--pause'], { client: fakeClient({ config: () => configUtxo }), deploymentFile });
        expect(notAdmin.error?.message).toMatch(/not an admin/);
        expect(notAdmin.client.submitted).toEqual([]);
        for (const argv of [['--admin-key', adminKeyFile], ['--admin-key', adminKeyFile, '--pause', '--resume']]) {
            const refused = await run(updateConfig, argv, { client: fakeClient({ config: () => configUtxo }), deploymentFile });
            expect(refused.error?.message).toMatch(/one of/);
        }
    });

    test.each([
        ['deploy.js', [...deployArgs, '--dry-run']],
        ['update-config.js', ['--admin-key', null, '--pause', '--dry-run']],
    ])('%s refuses CARDANO_NETWORK=mainnet, and a missing network', (script, args) => {
        for (const CARDANO_NETWORK of ['mainnet', undefined, 'preview']) {
            const environment = { ...process.env, ...env, CARDANO_NETWORK };
            if (CARDANO_NETWORK === undefined) {
                delete environment.CARDANO_NETWORK;
            }
            const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'chain', script), ...withKey(args)], { encoding: 'utf8', env: environment });
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/CARDANO_NETWORK.*preprod/);
            expect(result.stdout).toBe('');
            noSecretIn(result.stderr);
        }
    });
});

describe('the script helpers', () => {
    test('networkFromEnv answers preprod and refuses everything else', () => {
        expect(networkFromEnv({ CARDANO_NETWORK: 'preprod' })).toBe(preprod);
        for (const CARDANO_NETWORK of ['mainnet', 'preview', '', undefined]) {
            expect(() => networkFromEnv({ CARDANO_NETWORK })).toThrow(/preprod/);
        }
    });

    test('providerFromEnv needs the URL, and the project id only with Blockfrost (Koios, the default, needs no key)', () => {
        const blockfrost = { CHAIN_PROVIDER_KIND: 'blockfrost' };
        expect(() => providerFromEnv({ ...blockfrost, CHAIN_PROVIDER_URL: 'https://x' })).toThrow(/CHAIN_PROVIDER_KEY/);
        expect(() => providerFromEnv({ ...blockfrost, CHAIN_PROVIDER_KEY: 'k' })).toThrow(/CHAIN_PROVIDER_URL/);
        expect(() => providerFromEnv({ ...blockfrost, CHAIN_PROVIDER_URL: 'not a url', CHAIN_PROVIDER_KEY: 'k' })).toThrow(/CHAIN_PROVIDER_URL/);
        for (const CHAIN_PROVIDER_KIND of [undefined, '', 'koios', ' Koios ']) {
            expect(Object.keys(providerFromEnv({ CHAIN_PROVIDER_KIND, CHAIN_PROVIDER_URL: 'https://preprod.koios.rest/api/v1' })).sort()).toEqual(['blockAt', 'blockOf', 'params', 'submit', 'tip', 'utxoByUnit', 'utxosAt']);
            expect(() => providerFromEnv({ CHAIN_PROVIDER_KIND })).toThrow(/CHAIN_PROVIDER_URL/);
        }
        expect(() => providerFromEnv({ CHAIN_PROVIDER_KIND: 'BLOCKFROST', CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0', CHAIN_PROVIDER_KEY: 'k' })).not.toThrow();
        const secret = 'stand-in-for-a-key-in-the-wrong-variable';
        for (const CHAIN_PROVIDER_KIND of ['maestro', secret]) {
            // named before anything else is asked for
            for (const env of [{ CHAIN_PROVIDER_URL: 'https://x', CHAIN_PROVIDER_KEY: 'k' }, {}]) {
                const error = thrown(() => providerFromEnv({ ...env, CHAIN_PROVIDER_KIND }));
                expect(error?.message).toMatch(/CHAIN_PROVIDER_KIND is unknown: it must be koios or blockfrost/);
                expect(error?.message).not.toContain(secret);
            }
        }
    });

    test("providerFromEnv: a URL of the other kind is refused, naming CHAIN_PROVIDER_KIND (a Blockfrost project id is never sent to Blockfrost as a Koios token)", () => {
        for (const [CHAIN_PROVIDER_KIND, CHAIN_PROVIDER_URL, message] of [
            [undefined, 'https://cardano-preprod.blockfrost.io/api/v0', /CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL/],
            ['koios', 'https://cardano-preprod.blockfrost.io/api/v0', /CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL/],
            ['blockfrost', 'https://preprod.koios.rest/api/v1', /CHAIN_PROVIDER_KIND must be koios \(or not set\) for a Koios URL/],
        ]) {
            const error = thrown(() => providerFromEnv({ CHAIN_PROVIDER_KIND, CHAIN_PROVIDER_URL, CHAIN_PROVIDER_KEY: 'stand-in-key' }));
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toMatch(message);
            expect(error.message).not.toContain('stand-in-key');
        }
    });

    test('redact removes every secret from a text', () => {
        expect(redact('a secret-id b secret-id', ['secret-id', ''])).toBe('a <redacted> b <redacted>');
    });

    test('waitForBlock polls until the transaction is in a block, and gives up at the timeout', async () => {
        let polls = 0;
        const client = { blockOf: async () => (++polls < 3 ? null : 42) };
        const slept = [];
        expect(await waitForBlock({ client, txId: 'ab'.repeat(32), interval: 5, timeout: 100, sleep: async ms => slept.push(ms) })).toBe(42);
        expect(polls).toBe(3);
        expect(slept).toEqual([5, 5]);
        const never = { blockOf: async () => null };
        expect(await waitForBlock({ client: never, txId: 'ab'.repeat(32), interval: 5, timeout: 20, sleep: async () => {} })).toBeNull();
    });
});

// The provider adapter over the SDK's own BlockfrostProvider, with `fetch` stubbed (no network):
// what Blockfrost answers is turned into what the scripts need, and every failure keeps its reason
// (the operation, the status, Blockfrost's message) without the project id.
describe('the provider over Blockfrost', () => {
    const BASE = 'https://cardano-preprod.blockfrost.io/api/v0';
    const PROJECT_ID = 'stand-in-for-the-blockfrost-project-id';
    const UNIT = 'ab'.repeat(28) + CONFIG_TOKEN_NAME;
    const TX = 'ab'.repeat(32);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const notFound = () => json(404, { status_code: 404, error: 'Not Found', message: 'The requested component has not been found.' });
    // Blockfrost answers a bad project id with 403; this one even quotes the id, to prove it is taken out
    const forbidden = () => json(403, { status_code: 403, error: 'Forbidden', message: `Invalid project token: ${PROJECT_ID}` });
    const unreachable = () => {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND cardano-preprod.blockfrost.io'), { code: 'ENOTFOUND' }) });
    };

    let realFetch;
    let requests;
    // fetch answers the first route whose pattern matches the URL, else 404
    const answer = routes => {
        globalThis.fetch = async (url, init = {}) => {
            const headers = new Headers(init.headers);
            requests.push({ url: String(url), method: init.method ?? 'GET', projectId: headers.get('project_id') });
            const route = routes.find(([pattern]) => pattern.test(String(url)));
            return route ? route[1]() : notFound();
        };
    };
    beforeEach(() => {
        realFetch = globalThis.fetch;
        requests = [];
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        // the id travels as a header and nowhere else
        expect(requests.every(request => request.projectId === PROJECT_ID && !request.url.includes(PROJECT_ID))).toBe(true);
    });
    const client = () => providerFromEnv({ CHAIN_PROVIDER_KIND: 'blockfrost', CHAIN_PROVIDER_URL: BASE, CHAIN_PROVIDER_KEY: PROJECT_ID });
    const shown = error => [error?.message, error?.stack, JSON.stringify(error)].join('\n');
    const refusal = async promise => {
        const error = await failure(promise);
        expect(error).toBeInstanceOf(Error);
        expect(shown(error)).not.toContain(PROJECT_ID);
        return error;
    };

    let signed;
    beforeAll(async () => {
        signed = signWith((await build()).cbor, { privateKey: admin.privateKey });
    });

    test('reads the tip and a transaction\'s block; a transaction in no block yet is null', async () => {
        answer([
            [/\/blocks\/latest$/, () => json(200, { slot: 81_000_000, height: 3_100_000 })],
            [new RegExp(`/txs/${TX}$`), () => json(200, { block_height: 3_100_001 })],
        ]);
        expect(await client().tip()).toEqual({ slot: 81_000_000, block: 3_100_000 });
        expect(await client().blockOf(TX)).toBe(3_100_001);
        expect(await client().blockOf('cd'.repeat(32))).toBeNull();
        expect(requests.map(request => request.url)).toEqual([`${BASE}/blocks/latest`, `${BASE}/txs/${TX}`, `${BASE}/txs/${'cd'.repeat(32)}`]);
        // a block by its height (where the index starts); one the chain does not have yet is null
        answer([[/\/blocks\/3099980$/, () => json(200, { height: 3_099_980, slot: 80_999_600, hash: 'ef'.repeat(32) })]]);
        expect(await client().blockAt(3_099_980)).toEqual({ block: 3_099_980, slot: 80_999_600, hash: 'ef'.repeat(32) });
        expect(await client().blockAt(4_000_000)).toBeNull();
    });

    test('a 404 for the asset and an empty answer are no config NFT: utxoByUnit answers undefined', async () => {
        answer([[/\/assets\/.*\/addresses$/, notFound]]);
        expect(await client().utxoByUnit(UNIT)).toBeUndefined();
        answer([[/\/assets\/.*\/addresses$/, () => json(200, [])]]);
        expect(await client().utxoByUnit(UNIT)).toBeUndefined();
        answer([
            [/\/assets\/.*\/addresses$/, () => json(200, [{ address: admin.enterpriseAddress, quantity: '1' }])],
            [/\/addresses\/.*\/utxos\/.*$/, () => json(200, [])],
        ]);
        expect(await client().utxoByUnit(UNIT)).toBeUndefined();
        // and an address without UTxOs has none
        answer([]);
        expect(await client().utxosAt(admin.enterpriseAddress)).toEqual([]);
        expect(requests.length).toBeGreaterThan(0);
    });

    test('a 403 says the provider refused the project id, for every call, without printing it', async () => {
        answer([[/./, forbidden]]);
        for (const call of [c => c.utxoByUnit(UNIT), c => c.utxosAt(admin.enterpriseAddress), c => c.params(), c => c.tip(), c => c.blockOf(TX), c => c.submit(signed)]) {
            const error = await refusal(call(client()));
            expect(error.message).toMatch(/the provider refused the project id \(403/);
            expect(error.message).toMatch(/CHAIN_PROVIDER_KEY/);
        }
    });

    test("a 400 on submit carries the ledger's reason, and says the transaction was refused", async () => {
        const reason = 'transaction submit error ShelleyTxValidationError ShelleyBasedEraConway (ApplyTxError (ConwayUtxowFailure (UtxoFailure (BadInputsUTxO (fromList [TxIn (TxId {unTxId = d2d2}) (TxIx {unTxIx = 1})])))))';
        answer([[/\/tx\/submit$/, () => json(400, { status_code: 400, error: 'Bad Request', message: JSON.stringify(reason) })]]);
        const error = await refusal(client().submit(signed));
        expect(error.message).toMatch(/^submit: the provider refused the transaction \(400\)/);
        expect(error.message).toContain('BadInputsUTxO');
        expect(error.refused).toBe(true);
        expect(requests).toEqual([expect.objectContaining({ url: `${BASE}/tx/submit`, method: 'POST' })]);
    });

    test('a 500 on submit names the status and is not a refusal: the transaction may have gone through', async () => {
        answer([[/\/tx\/submit$/, () => json(500, { status_code: 500, error: 'Internal Server Error', message: 'An unexpected response was received from the backend.' })]]);
        const error = await refusal(client().submit(signed));
        expect(error.message).toMatch(/500/);
        expect(error.message).toContain('An unexpected response');
        expect(error.refused).toBe(false);
    });

    test("a network error says the URL's host could not be reached", async () => {
        answer([[/./, unreachable]]);
        for (const call of [c => c.utxoByUnit(UNIT), c => c.utxosAt(admin.enterpriseAddress), c => c.tip(), c => c.blockOf(TX), c => c.submit(signed)]) {
            const error = await refusal(call(client()));
            expect(error.message).toMatch(/could not reach cardano-preprod\.blockfrost\.io \(ENOTFOUND\)/);
            expect(error.refused).toBe(false);
        }
    });

    test('update-config through this provider: no config NFT is "in no UTxO", and a 403 stops it before anything is built', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-provider-'));
        try {
            const keyFile = path.join(dir, 'admin.sk');
            writeKeyFile(keyFile, admin.privateKey);
            const deploymentFile = path.join(dir, 'preprod.json');
            const planned = plan();
            fs.writeFileSync(deploymentFile, JSON.stringify({ network: 'preprod', configSeed: SEED, configPolicyId: planned.configPolicyId, policyId: planned.policyId, status: 'confirmed' }));
            const env = { CARDANO_NETWORK: 'preprod', CHAIN_PROVIDER_KIND: 'blockfrost', CHAIN_PROVIDER_URL: BASE, CHAIN_PROVIDER_KEY: PROJECT_ID };
            const lines = [];
            const main = () => updateConfig.main({ argv: ['--admin-key', keyFile, '--pause', '--dry-run'], env, log: line => lines.push(line), deploymentFile });

            answer([[/\/assets\/.*\/addresses$/, () => json(200, [])]]);
            expect((await refusal(main())).message).toMatch(/is in no UTxO/);
            answer([[/./, forbidden]]);
            expect((await refusal(main())).message).toMatch(/the provider refused the project id/);
            expect(lines.join('\n')).not.toContain(PROJECT_ID);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

// The provider adapter over the SDK's own Koios provider (CHAIN_PROVIDER_KIND unset or koios),
// with `fetch` stubbed (no network): Koios's answers, as preprod.koios.rest gave them, turned into
// what the scripts need; every failure keeps its reason, a token never shows.
describe('the provider over Koios', () => {
    const BASE = 'https://preprod.koios.rest/api/v1';
    const TOKEN = 'stand-in-for-a-koios-bearer-token';
    const UNIT = 'ab'.repeat(28) + CONFIG_TOKEN_NAME;
    const TX = 'ab'.repeat(32);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    // Koios answers a refused token with 401
    const unauthorized = () => json(401, { message: `invalid token ${TOKEN}` });
    const unreachable = () => {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND preprod.koios.rest'), { code: 'ENOTFOUND' }) });
    };
    const KOIOS_PARAMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'chain', 'koios-epoch-params.json'), 'utf8'));

    let realFetch;
    let requests;
    // fetch answers the first route whose pattern matches the URL; anything else is a test error
    const answer = routes => {
        globalThis.fetch = async (url, init = {}) => {
            const headers = new Headers(init.headers);
            requests.push({ url: String(url), method: init.method ?? 'GET', authorization: headers.get('authorization'), body: typeof init.body === 'string' ? init.body : undefined });
            const route = routes.find(([pattern]) => pattern.test(String(url)));
            if (!route) {
                throw new Error(`no route for ${url}`);
            }
            return route[1](init);
        };
    };
    beforeEach(() => {
        realFetch = globalThis.fetch;
        requests = [];
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        expect(requests.every(request => !request.url.includes(TOKEN) && !String(request.body ?? '').includes(TOKEN))).toBe(true);
    });
    const client = (key = TOKEN) => providerFromEnv({ CHAIN_PROVIDER_URL: BASE, ...(key ? { CHAIN_PROVIDER_KEY: key } : {}) });
    const shown = error => [error?.message, error?.stack, JSON.stringify(error)].join('\n');
    const refusal = async promise => {
        const error = await failure(promise);
        expect(error).toBeInstanceOf(Error);
        expect(shown(error)).not.toContain(TOKEN);
        return error;
    };

    let signed;
    beforeAll(async () => {
        signed = signWith((await build()).cbor, { privateKey: admin.privateKey });
    });

    test("reads the tip, a transaction's block and a block by its height; a transaction in no block yet is null; the token as a bearer token", async () => {
        answer([
            [/\/tip$/, () => json(200, [{ hash: 'bc'.repeat(32), epoch_no: 325, abs_slot: 139_066_878, epoch_slot: 1, block_height: 5_415_506, block_no: 5_415_506, block_time: 1_794_750_078 }])],
            [/\/tx_info$/, init => json(200, JSON.parse(init.body)._tx_hashes[0] === TX ? [{ tx_hash: TX, block_height: 5_415_507 }] : [])],
            [/\/blocks\?block_height=eq\.5415486&select=hash,abs_slot,block_height$/, () => json(200, [{ hash: 'cd'.repeat(32), abs_slot: 139_066_400, block_height: 5_415_486 }])],
            [/\/blocks\?block_height=eq\.9999999/, () => json(200, [])],
        ]);
        expect(await client().tip()).toEqual({ slot: 139_066_878, block: 5_415_506 });
        expect(await client().blockOf(TX)).toBe(5_415_507);
        expect(await client().blockOf('cd'.repeat(32))).toBeNull();
        expect(await client().blockAt(5_415_486)).toEqual({ block: 5_415_486, slot: 139_066_400, hash: 'cd'.repeat(32) });
        expect(await client().blockAt(9_999_999)).toBeNull();
        expect(requests.map(request => [request.method, request.url.slice(BASE.length)])).toEqual([
            ['GET', '/tip'],
            ['POST', '/tx_info'],
            ['POST', '/tx_info'],
            ['GET', '/blocks?block_height=eq.5415486&select=hash,abs_slot,block_height'],
            ['GET', '/blocks?block_height=eq.9999999&select=hash,abs_slot,block_height'],
        ]);
        expect(requests.every(request => request.authorization === `Bearer ${TOKEN}`)).toBe(true);
        expect(JSON.parse(requests[1].body)).toEqual({ _tx_hashes: [TX] });
        // the public tier: no key, no header
        requests = [];
        await client(null).tip();
        expect(requests[0].authorization).toBeNull();
    });

    test('the protocol parameters through the SDK, from what preprod.koios.rest answered: those the builder tests use', async () => {
        answer([[/\/epoch_params\?limit=1&order=epoch_no\.desc$/, () => json(200, KOIOS_PARAMS)]]);
        expect(await client().params()).toEqual(loadParams());
    });

    test('no holder of the config NFT, or no UTxO of it at its holder: utxoByUnit answers undefined; an address without UTxOs has none', async () => {
        answer([[/\/asset_addresses\?/, () => json(200, [])]]);
        expect(await client().utxoByUnit(UNIT)).toBeUndefined();
        answer([
            [/\/asset_addresses\?/, () => json(200, [{ payment_address: admin.enterpriseAddress, stake_address: null, quantity: '1' }])],
            [/\/address_info$/, () => json(200, [{ address: admin.enterpriseAddress, balance: '0', stake_address: null, script_address: false, utxo_set: [] }])],
        ]);
        expect(await client().utxoByUnit(UNIT)).toBeUndefined();
        answer([[/\/address_info$/, () => json(200, [])]]);
        expect(await client().utxosAt(admin.enterpriseAddress)).toEqual([]);
    });

    test('a 401 says the provider refused the token, for every call, without printing it', async () => {
        answer([[/./, unauthorized]]);
        for (const call of [c => c.utxoByUnit(UNIT), c => c.utxosAt(admin.enterpriseAddress), c => c.params(), c => c.tip(), c => c.blockOf(TX), c => c.blockAt(1), c => c.submit(signed)]) {
            const error = await refusal(call(client()));
            expect(error.message).toMatch(/the provider refused the token \(401/);
            expect(error.message).toMatch(/CHAIN_PROVIDER_KEY/);
        }
    });

    test("a 400 on submit carries the node's reason and says the transaction was refused; a 500 may have gone through", async () => {
        const reason = { tag: 'TxSubmitFail', contents: { tag: 'TxCmdTxSubmitValidationError', contents: { error: ['ConwayUtxowFailure (UtxoFailure (BadInputsUTxO (fromList [TxIn (TxId {unTxId = d2d2}) (TxIx {unTxIx = 1})])))'] } } };
        answer([[/\/submittx$/, () => json(400, reason)]]);
        const error = await refusal(client().submit(signed));
        expect(error.message).toMatch(/^submit: the provider refused the transaction \(400\)/);
        expect(error.message).toContain('BadInputsUTxO');
        expect(error.refused).toBe(true);
        answer([[/\/submittx$/, () => json(500, { message: 'An unexpected response was received from the backend.' })]]);
        const later = await refusal(client().submit(signed));
        expect(later.message).toMatch(/500/);
        expect(later.refused).toBe(false);
        answer([[/\/submittx$/, () => json(202, txIdOf(signed))]]);
        expect(await client().submit(signed)).toBe(txIdOf(signed));
    });

    test('a 413 on submit says what to do: a free Koios token in CHAIN_PROVIDER_KEY; nothing reached the chain', async () => {
        answer([[/\/submittx$/, () => new Response('Payload Too Large', { status: 413 })]]);
        const error = await refusal(client(null).submit(signed));
        expect(error.message).toMatch(/^submit: the provider refused the request for its size \(413\)/);
        expect(error.message).toMatch(/register a free token at koios\.rest and put it into CHAIN_PROVIDER_KEY/);
        expect(error.refused).toBe(true);
    });

    test("a 429 is the request limit; a network error says the URL's host could not be reached", async () => {
        answer([[/./, () => json(429, {})]]);
        expect((await refusal(client().tip())).message).toMatch(/request limit is reached \(429/);
        answer([[/./, unreachable]]);
        for (const call of [c => c.utxoByUnit(UNIT), c => c.utxosAt(admin.enterpriseAddress), c => c.tip(), c => c.blockOf(TX), c => c.submit(signed)]) {
            const error = await refusal(call(client()));
            expect(error.message).toMatch(/could not reach preprod\.koios\.rest \(ENOTFOUND\)/);
            expect(error.refused).toBe(false);
        }
    });
});

// Every option of every chain script, given a value shaped like a secret (a key in bech32 or hex,
// recovery words, or a path with one of them as a segment), is refused where the arguments are
// parsed: before any file is read or created and before anything is printed, and without
// repeating it. Run as the scripts run (runMain: what reaches stdout and stderr).
describe('no argument shaped like a secret is used or repeated', () => {
    let dir;
    let keyFile;
    let realFetch;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-shapes-'));
        keyFile = path.join(dir, 'admin.sk');
        writeKeyFile(keyFile, admin.privateKey);
        realFetch = globalThis.fetch;
        // nothing may reach a network from here
        globalThis.fetch = async () => {
            throw new Error('no network in this test');
        };
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const bech32 = PrivateKey.toBech32(admin.privateKey);
    const extended = PrivateKey.toBech32(PrivateKey.fromBytes(PrivateKey.generateExtended()));
    const hex = PrivateKey.toHex(admin.privateKey);
    const hex128 = Buffer.from(PrivateKey.generateExtended()).toString('hex');
    const words = PrivateKey.generateMnemonic(256);
    // [the value given, the secret in it]
    const shapes = () => ({
        'a bech32 key': [bech32, bech32],
        'an extended bech32 key': [extended, extended],
        'a hex key': [hex, hex],
        'a 64-byte hex key': [hex128, hex128],
        'recovery words': [words, words],
        'a path ending in a key': [path.join(dir, bech32), bech32],
        'a path with a hex key as a directory': [path.join(dir, hex, 'fees.json'), hex],
        'a hex key file name with an extension': [path.join(dir, `${hex}.sk`), hex],
        'a path ending in recovery words': [path.join(dir, words), words],
    });
    const env = { CARDANO_NETWORK: 'preprod', CHAIN_PROVIDER_KIND: 'blockfrost', CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0', CHAIN_PROVIDER_KEY: 'stand-in-for-the-blockfrost-project-id' };
    // a command line of each script that would otherwise go ahead, and where each option goes in it
    const scripts = () => [
        ['new-key.js', newKey, ['--kind', 'key', '--out', path.join(dir, 'new.sk'), '--network', 'preprod']],
        ['deploy.js', deploy, ['--admin-key', keyFile, '--server-key-hash', server.keyHash, '--dry-run']],
        ['update-config.js', updateConfig, ['--admin-key', keyFile, '--pause', '--dry-run']],
    ];
    const withOption = (argv, option, value, joined) => {
        const at = argv.indexOf(`--${option}`);
        const base = at === -1 ? argv.filter(arg => arg !== '--pause') : [...argv.slice(0, at), ...argv.slice(at + 2)];
        return joined ? [...base, `--${option}=${value}`] : [...base, `--${option}`, value];
    };
    const filesUnder = root => fs.readdirSync(root, { recursive: true }).map(String);
    const check = async (script, argv, secret, value) => {
        const out = [];
        const err = [];
        const code = await runMain(script.main, { argv, env, out: line => out.push(line), err: line => err.push(line), deploymentFile: path.join(dir, 'preprod.json') });
        const shown = [...out, ...err].join('\n');
        expect(code).toBe(1);
        expect(shown.includes(secret)).toBe(false);
        expect(shown.includes(secret.split(' ').slice(0, 4).join(' '))).toBe(false);
        expect(err.join('\n')).toMatch(/not repeated/);
        expect(out).toEqual([]);
        for (const file of [value, path.resolve(value), path.resolve(secret)]) {
            expect(fs.existsSync(file)).toBe(false);
        }
        expect(filesUnder(dir).filter(name => name.includes(secret.slice(0, 20)))).toEqual([]);
    };

    test('every string option of every script, each shape, as --option value and --option=value', async () => {
        let runs = 0;
        for (const [, script, base] of scripts()) {
            const options = Object.entries(script.OPTIONS)
                .filter(([, spec]) => spec.type === 'string')
                .map(([name]) => name);
            expect(options.length).toBeGreaterThan(0);
            for (const option of options) {
                for (const [value, secret] of Object.values(shapes())) {
                    for (const joined of [false, true]) {
                        await check(script, withOption(base, option, value, joined), secret, value);
                        runs++;
                    }
                }
            }
        }
        // new-key 3, deploy 2, update-config 4 string options; 9 shapes; 2 forms
        expect(runs).toBe(9 * 9 * 2);
    });

    test('each shape as an argument without an option, also after a flag', async () => {
        for (const [, script, base] of scripts()) {
            for (const [value, secret] of Object.values(shapes())) {
                await check(script, [...base, value], secret, value);
            }
        }
    });

    test('the scripts\' option lists are the ones walked here', () => {
        expect(Object.keys(newKey.OPTIONS).sort()).toEqual(['kind', 'network', 'out']);
        expect(Object.keys(deploy.OPTIONS).sort()).toEqual(['admin-key', 'again', 'confirm', 'dry-run', 'new-seed', 'server-key-hash']);
        expect(Object.keys(updateConfig.OPTIONS).sort()).toEqual(['add-server-key', 'admin-key', 'dry-run', 'fees', 'pause', 'remove-server-key', 'resume']);
    });
});
