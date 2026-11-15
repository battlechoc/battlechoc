// The end-to-end script against preprod (plan B, Task 11): scripts/chain/e2e.js mints, has the
// node refuse a mint without the server's signature, transfers, burns with the server and burns
// by the holder alone. Its first real run is the owner's; here it runs against a fake chain that
// applies what it takes (inputs spent, outputs created, a block per transaction) and refuses what
// a node refuses in phase 1 (a missing witness, a spent input, a passed TTL), with the real
// blueprint, the fixed preprod parameters and the local evaluator under the builds. Nothing here
// reaches a network; the wallets' words are made for this run and never funded, the server key is
// derived from a fixed label, and every file lives in a temporary directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Address, Assets, Data, InlineDatum, KeyHash, PrivateKey, Transaction, TransactionHash, UTxO, VKey } = require('@evolution-sdk/evolution');
const { chain, cardano } = require('@battlechoc/battlechoc-shared-functions');
const { writeKeyFile, writeSecretFile } = require('../src/chain/keys');
const { itemDatum, outRef } = require('../src/chain/names');
const { addServerWitness, buildMint, ownerOf, verifyWitness } = require('../src/chain/tx');
const { providerFromEnv, runMain, txIdOf } = require('../scripts/chain/lib');
const e2e = require('../scripts/chain/e2e');
const { TIP, loadParams, fixtureKey, fixtureContracts, utxo } = require('./helpers/chain');

const { loadWallet, walletWitnessOf, buildTransfer, unsignedVerdict, mintSignersCheck, mintVerdict, transferVerdict, burnVerdict, backOf, fateOf, summaryOf, EXPIRY_MARGIN_SLOTS } = e2e;

const preprod = cardano.Networks.preprod;
const params = loadParams();
const contracts = fixtureContracts();
const { policyId } = contracts;
const server = fixtureKey('server');
const stranger = fixtureKey('stranger');

// The two players' wallets: recovery words made for this run (never committed, never funded)
const playerOf = words => {
    const paymentKey = PrivateKey.fromMnemonicCardano(words);
    const stakeKey = PrivateKey.fromMnemonicCardano(words, { role: 2 });
    const keyHash = KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(paymentKey)));
    const stakeKeyHash = KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(stakeKey)));
    const address = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex(keyHash), stakingCredential: KeyHash.fromHex(stakeKeyHash) }));
    return { words, paymentKey, keyHash, stakeKeyHash, address, subject: `stake:${stakeKeyHash}` };
};
const A = playerOf(PrivateKey.generateMnemonic(256));
const B = playerOf(PrivateKey.generateMnemonic(256));

// the deployment record of the fixture's contracts, as deploy.js writes it once confirmed
const DEPLOYMENT = {
    network: 'preprod',
    date: '2026-11-15T00:00:00.000Z',
    configSeed: 'aa'.repeat(32) + '#0',
    configPolicyId: contracts.configPolicyId,
    policyId,
    configRef: outRef(contracts.configUtxo),
    treasuryAddress: contracts.treasuryAddress,
    serverKeyHashes: [server.keyHash],
    status: 'confirmed',
    configTx: 'cf'.repeat(32),
    block: 3_000_000,
};

// a stand-in for the Blockfrost project id: it must never be printed
const PROJECT_ID = 'stand-in-for-the-blockfrost-project-id';
const ENV = { CARDANO_NETWORK: 'preprod', CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0', CHAIN_PROVIDER_KEY: PROJECT_ID };

const ada = n => BigInt(n) * 1_000_000n;
const txIdOfUtxo = entry => TransactionHash.toHex(entry.transactionId);
const decoded = cbor => Transaction.fromCBORHex(cbor);
const vkeyHashesOf = cbor => (decoded(cbor).witnessSet.vkeyWitnesses ?? []).map(witness => KeyHash.toHex(KeyHash.fromVKey(witness.vkey)));
const requiredSignersOf = cbor => (decoded(cbor).body.requiredSigners ?? []).map(signer => KeyHash.toHex(signer));

// The UTxO the transaction `cbor` creates at output `index`
const outputUtxo = (cbor, index) => {
    const output = decoded(cbor).body.outputs[index];
    return new UTxO.UTxO({ transactionId: TransactionHash.fromHex(txIdOf(cbor)), index: BigInt(index), address: output.address, assets: output.assets, datumOption: output.datumOption });
};
const outputsOf = cbor => decoded(cbor).body.outputs.map((_output, index) => outputUtxo(cbor, index));

// What a node says when a transaction lacks a witness, as Blockfrost passes it on
const missingWitnesses = hashes =>
    `transaction submit error ShelleyTxValidationError ShelleyBasedEraConway (ApplyTxError (ConwayUtxowFailure (MissingVKeyWitnessesUTXOW (fromList [${hashes
        .map(hash => `KeyHash {unKeyHash = "${hash}"}`)
        .join(',')}])) :| []))`;
// The refusals of lib.js's provider: a 4xx of the provider (`refused`), and a failure without an answer
const refusal = (message, status = 400) =>
    Object.assign(new Error(status === 400 ? `submit: the provider refused the transaction (400): ${message}` : `submit: the provider answered ${status}: ${message}`), { refused: true });
const noAnswer = () => Object.assign(new Error('submit: could not reach cardano-preprod.blockfrost.io (ECONNRESET); check CHAIN_PROVIDER_URL and the connection'), { refused: false });

/**
 * A chain that applies what it takes: a UTxO set (the config, A's and B's wallets), one block per
 * transaction, and a node's phase-1 refusals: a spent or unknown input, a TTL the tip has passed,
 * a required signer or an input's key without a witness, a witness that does not verify. The
 * scripts were evaluated by the builds. `landed` lists what it took, `refused` why it refused.
 */
const fakeChain = ({ utxos } = {}) => {
    let set = utxos ?? [
        contracts.configUtxo,
        utxo({ address: A.address, lovelace: ada(20), txId: 'a1'.repeat(32), index: 0 }),
        utxo({ address: A.address, lovelace: ada(10), txId: 'a2'.repeat(32), index: 1 }),
        utxo({ address: B.address, lovelace: ada(30), txId: 'b1'.repeat(32), index: 0 }),
    ];
    const tip = { ...TIP };
    const blocks = new Map();
    const landed = [];
    const refused = [];
    const refuse = reason => {
        refused.push(reason);
        throw refusal(reason);
    };
    const find = input => set.find(entry => outRef(entry) === outRef(input));
    const keyOf = entry => (entry.address.paymentCredential instanceof KeyHash.KeyHash ? KeyHash.toHex(entry.address.paymentCredential) : undefined);
    const ledger = {
        landed,
        refused,
        tipNow: tip,
        set: () => set,
        params: async () => params,
        tip: async () => ({ ...tip }),
        utxosAt: async address => set.filter(entry => Address.toBech32(entry.address) === address),
        utxoByUnit: async unit => set.find(entry => Assets.getByUnit(entry.assets, unit) > 0n),
        blockOf: async txId => blocks.get(txId) ?? null,
        // takes `cbor` as a node would; `apply: false` answers its id and drops it (lost on the way),
        // `enforceSigners: false` is a node that lets a transaction through without a required witness
        take: (cbor, { apply = true, enforceSigners = true } = {}) => {
            const { body, witnessSet } = decoded(cbor);
            const txId = txIdOf(cbor);
            const inputs = body.inputs.map(find);
            const collateral = (body.collateralInputs ?? []).map(find);
            if ([...inputs, ...collateral].some(entry => entry === undefined)) {
                refuse('transaction submit error ShelleyTxValidationError ShelleyBasedEraConway (ApplyTxError (ConwayUtxowFailure (UtxoFailure (BadInputsUTxO (fromList [])))))');
            }
            if (body.ttl !== undefined && BigInt(tip.slot) >= body.ttl) {
                refuse('transaction submit error ShelleyTxValidationError ShelleyBasedEraConway (ApplyTxError (ConwayUtxowFailure (UtxoFailure (OutsideValidityIntervalUTxO))))');
            }
            const bodyHash = TransactionHash.toBytes(TransactionHash.fromHex(txId));
            const witnesses = witnessSet.vkeyWitnesses ?? [];
            if (!witnesses.every(({ vkey, signature }) => VKey.verify(vkey, bodyHash, signature.bytes))) {
                refuse('transaction submit error ShelleyTxValidationError ShelleyBasedEraConway (ApplyTxError (ConwayUtxowFailure (InvalidWitnessesUTXOW [])))');
            }
            const signed = new Set(witnesses.map(({ vkey }) => KeyHash.toHex(KeyHash.fromVKey(vkey))));
            const needed = [...new Set([...requiredSignersOf(cbor), ...[...inputs, ...collateral].map(keyOf).filter(Boolean)])].sort();
            const missing = needed.filter(hash => !signed.has(hash));
            if (missing.length > 0 && enforceSigners) {
                refuse(missingWitnesses(missing));
            }
            if (apply) {
                set = [...set.filter(entry => !inputs.includes(entry)), ...outputsOf(cbor)];
                blocks.set(txId, TIP.block + 1 + landed.length);
                landed.push({ txId, cbor });
            }
            return txId;
        },
        submit: async cbor => ledger.take(cbor),
        // the tip moves on by `slots`
        advance: slots => {
            tip.slot += slots;
        },
        // something else spends the UTxO `ref` ('txid#index')
        spend: ref => {
            set = set.filter(entry => outRef(entry) !== ref);
        },
    };
    return ledger;
};

// What a landed transaction was: a mint, a burn or a transfer (no mint field)
const kindOf = ({ cbor }) => {
    const { mint } = decoded(cbor).body;
    if (!mint) {
        return 'transfer';
    }
    const quantities = [...mint.map.values()].flatMap(names => [...names.values()]);
    return quantities.every(quantity => quantity > 0n) ? 'mint' : 'burn';
};
const kindsOf = ledger => ledger.landed.map(kindOf);
// every token of the items policy anywhere on the fake chain
const itemTokensOn = ledger => ledger.set().flatMap(entry => Assets.flatten(entry.assets).filter(([policy]) => Buffer.from(policy.hash).toString('hex') === policyId));

describe('the end-to-end script', () => {
    let dir;
    let files;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-e2e-'));
        files = {
            a: path.join(dir, 'player-a.words'),
            b: path.join(dir, 'player-b.words'),
            server: path.join(dir, 'preprod-server.sk'),
            deployment: path.join(dir, 'preprod.json'),
            runDir: path.join(dir, 'run'),
        };
        writeSecretFile(files.a, A.words);
        writeSecretFile(files.b, B.words);
        writeKeyFile(files.server, server.privateKey);
        fs.writeFileSync(files.deployment, `${JSON.stringify(DEPLOYMENT, null, 2)}\n`);
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const argvOf = ({ a = files.a, b = files.b, serverKey = files.server, runDir = files.runDir, extra = [] } = {}) => [
        '--player-a',
        a,
        '--player-b',
        b,
        '--server-key',
        serverKey,
        '--run-dir',
        runDir,
        ...extra,
    ];
    // a run as the script runs (runMain: what reaches stdout and stderr, and the exit code)
    const run = async ({ client, argv = argvOf(), env = ENV, deploymentFile = files.deployment } = {}) => {
        const out = [];
        const err = [];
        const code = await runMain(e2e.main, { argv, env, out: line => out.push(line), err: line => err.push(line), client, deploymentFile, sleep: async () => {}, now: () => new Date('2026-11-15T12:00:00Z') });
        return { code, out, err, output: out.join('\n'), error: err.join('\n') };
    };
    const stateOf = () => JSON.parse(fs.readFileSync(path.join(files.runDir, e2e.STATE_FILE), 'utf8'));
    const secrets = () => [
        A.words,
        B.words,
        ...[A.words, B.words].map(words => words.split(' ').slice(0, 4).join(' ')),
        PrivateKey.toBech32(server.privateKey),
        PrivateKey.toHex(server.privateKey),
        PrivateKey.toHex(A.paymentKey),
        PrivateKey.toHex(B.paymentKey),
        PROJECT_ID,
    ];
    const noSecretIn = text => {
        for (const secret of secrets()) {
            expect(text.includes(secret)).toBe(false);
        }
    };

    test('a whole run: each step passes on the chain, the exit code is 0, and the summary sets the fees beside the estimates', async () => {
        const ledger = fakeChain();
        const result = await run({ client: ledger });
        expect(result.error).toBe('');
        expect(result.code).toBe(0);

        // what reached the chain: the mint, the transfer, the burn, the second mint, the burn by A alone
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        const [mint, transfer, burn, mint2, holderBurn] = ledger.landed;
        // and the one it refused: the mint without the server's signature, for that signature alone
        expect(ledger.refused).toEqual([missingWitnesses([server.keyHash])]);

        // who signed what: the server signs the game's mints and burn, last; A alone burns the second item
        expect(vkeyHashesOf(mint.cbor).sort()).toEqual([A.keyHash, server.keyHash].sort());
        expect(vkeyHashesOf(transfer.cbor)).toEqual([A.keyHash]);
        expect(vkeyHashesOf(burn.cbor).sort()).toEqual([B.keyHash, server.keyHash].sort());
        expect(requiredSignersOf(burn.cbor)).toEqual([server.keyHash]);
        expect(vkeyHashesOf(holderBurn.cbor)).toEqual([A.keyHash]);
        expect(requiredSignersOf(holderBurn.cbor)).toEqual([]);
        expect(txIdOf(mint2.cbor)).not.toBe(txIdOf(mint.cbor));

        // and the state says it from the bodies submitted; the verdicts checked it
        expect(stateOf().steps.burn).toMatchObject({ requiredSigners: [server.keyHash], witnesses: [B.keyHash, server.keyHash].sort() });
        expect(stateOf().steps.holderBurn).toMatchObject({ requiredSigners: [], witnesses: [A.keyHash] });
        expect(result.output).toMatch(new RegExp(`step 5 +ok  the body names the server key ${server.keyHash} as a required signer, and the server and player B signed it`));
        expect(result.output).toMatch(/step 6b +ok {2}the body requires no signer and carries only player A's witness: the validator let the holder burn alone/);
        expect(result.output).toMatch(new RegExp(`step 2 +ok  the mint's body names the server key ${server.keyHash} as a required signer and carries only player A's witness`));

        // in the end no token of the policy is left, and the treasury holds the two RARE fees
        expect(itemTokensOn(ledger)).toEqual([]);
        const treasury = ledger.set().filter(entry => Address.toBech32(entry.address) === contracts.treasuryAddress);
        expect(treasury.map(entry => [txIdOfUtxo(entry), Assets.lovelaceOf(entry.assets), entry.datumOption])).toEqual([
            [mint.txId, 2_000_000n, undefined],
            [mint2.txId, 2_000_000n, undefined],
        ]);

        // each transaction: what is about to happen, its id once submitted, its explorer link, its verdict
        for (const { txId } of ledger.landed) {
            expect(result.output).toContain(`tx ${txId}  submitted, not yet confirmed  https://preprod.cardanoscan.io/transaction/${txId}`);
        }
        expect(result.output).toMatch(/step 2 +passed: the node refused it for the missing signature of the server key/);
        for (const step of ['3', '4', '5', '6a', '6b']) {
            expect(result.output).toMatch(new RegExp(`step ${step} +passed`));
        }

        // the summary: every step, the fees the chain charged beside the estimates, the treasury output
        const summary = result.output.slice(result.output.indexOf('summary'));
        for (const step of ['1', '2', '3', '4', '5', '6a', '6b']) {
            expect(summary).toMatch(new RegExp(`step ${step} +passed`));
        }
        const feeOf = cbor => Number(decoded(cbor).body.fee);
        expect(summary).toMatch(new RegExp(`network fee, mint +${feeOf(mint.cbor)} +${chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(new RegExp(`network fee, burn by B and the server +${feeOf(burn.cbor)} +${chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(new RegExp(`network fee, second mint +${feeOf(mint2.cbor)} +${chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(new RegExp(`network fee, burn by A alone +${feeOf(holderBurn.cbor)} +${chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(new RegExp(`network fee, transfer +${feeOf(transfer.cbor)} +none`));
        expect(summary).toMatch(new RegExp(`deposit, mint +\\d+ +${chain.MINT_DEPOSIT_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(new RegExp(`deposit, second mint +\\d+ +${chain.MINT_DEPOSIT_ESTIMATE_LOVELACE}`));
        expect(summary).toMatch(/game fee, mint +2000000 +2000000 due \(RARE\)/);
        expect(summary).toMatch(/treasury fee output +2000000 lovelace, no datum, taken by the node; its minimum UTxO at coinsPerUtxoByte 4310 is \d+/);
        expect(summary).not.toMatch(/warning/);
        expect(result.out.at(-1)).toBe('result: every step passed');

        // the state of the run: every step passed, public data only
        const state = stateOf();
        expect(Object.fromEntries(Object.entries(state.steps).map(([id, step]) => [id, step.status]))).toEqual({
            build: 'passed',
            unsigned: 'passed',
            mint: 'passed',
            transfer: 'passed',
            burn: 'passed',
            mint2: 'passed',
            holderBurn: 'passed',
        });
        noSecretIn(result.output + result.error + fs.readFileSync(path.join(files.runDir, e2e.STATE_FILE), 'utf8'));
    });

    test('--dry-run builds the mint, shows it and stops before the first submit: nothing submitted, nothing written', async () => {
        const ledger = fakeChain();
        let submits = 0;
        const result = await run({ client: { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) }, argv: argvOf({ extra: ['--dry-run'] }) });
        expect(result.code).toBe(0);
        expect(submits).toBe(0);
        expect(fs.existsSync(files.runDir)).toBe(false);
        expect(result.output).toMatch(/step 1 +the contracts and the mint for player A/);
        expect(result.output).toMatch(/mint {13}1 [0-9a-f]{56}\.000643b0/);
        expect(result.output).toMatch(/dry run: step 2 would submit tx [0-9a-f]{64} now; nothing is submitted/);
        noSecretIn(result.output + result.error);
    });

    test.each([
        ['the provider refused the project id (a 403)', () => Promise.reject(refusal('Invalid project token', 403)), /not the ledger's refusal/],
        ['the node refused it for something else', () => Promise.reject(refusal('... (BadInputsUTxO (fromList [])) ...')), /not for a missing signature/],
    ])("step 2 fails, and the run stops, when %s: only the ledger's refusal for the server's missing signature passes; the rerun runs it again", async (_name, answer, message) => {
        const ledger = fakeChain();
        let submits = 0;
        const client = { ...ledger, submit: async cbor => (submits++ === 0 ? answer() : ledger.take(cbor)) };
        const result = await run({ client });
        expect(result.code).toBe(1);
        expect(submits).toBe(1);
        expect(ledger.landed).toEqual([]);
        expect(result.output).toMatch(new RegExp(`step 2 +failed: .*${message.source}`));
        expect(result.output).toMatch(/summary/);
        expect(result.output).toMatch(/step 2 +failed/);
        expect(result.output).toMatch(/step 3 +not run/);
        expect(stateOf().steps.unsigned.status).toBe('failed');
        expect(stateOf().steps.mint).toBeUndefined();
        expect(result.error).toMatch(/step 2 failed/);

        // a 4xx reached nothing: the rerun builds the mint and runs step 2 again
        const again = await run({ client: ledger });
        expect(again.code).toBe(0);
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        expect(stateOf().steps.unsigned.replaced.map(attempt => attempt.status)).toEqual(['failed']);
    });

    // The one result that must stop a release: the node took the mint the server did not sign
    const STOP = /STOP THE RELEASE: the node took a mint that the server did not sign/;

    test("a node that takes the mint without the server's signature: the run says to stop the release, and a rerun submits nothing", async () => {
        const ledger = fakeChain();
        let submits = 0;
        const client = { ...ledger, submit: async cbor => (submits++ === 0 ? ledger.take(cbor, { enforceSigners: false }) : ledger.take(cbor)) };
        const result = await run({ client });
        expect(result.code).toBe(1);
        expect(submits).toBe(1);
        expect(kindsOf(ledger)).toEqual(['mint']);
        const [unsigned] = ledger.landed;
        expect(vkeyHashesOf(unsigned.cbor)).toEqual([A.keyHash]);
        expect(result.error).toMatch(STOP);
        expect(result.error).toContain(`https://preprod.cardanoscan.io/transaction/${unsigned.txId}`);
        expect(result.error).toMatch(/must not be released/);
        expect(result.output).toMatch(/step 2 +ACCEPTED/);
        expect(result.out.at(-1)).toMatch(/^result: STOP THE RELEASE/);
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'accepted', txId: unsigned.txId, ttl: expect.any(Number) });
        expect(stateOf().steps.mint).toBeUndefined();

        let later = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (later++, ledger.take(cbor)) } });
        expect(again.code).toBe(1);
        expect(later).toBe(0);
        expect(again.error).toMatch(STOP);
        expect(again.out.at(-1)).toMatch(/^result: STOP THE RELEASE/);
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    test("an unanswered step 2 that landed without the server's signature: the run stops, and the rerun finds it and says to stop the release", async () => {
        const ledger = fakeChain();
        let submits = 0;
        const client = {
            ...ledger,
            submit: async cbor => {
                if (submits++ === 0) {
                    ledger.take(cbor, { enforceSigners: false });
                    throw noAnswer();
                }
                return ledger.take(cbor);
            },
        };
        const first = await run({ client });
        expect(first.code).toBe(1);
        expect(first.output).toMatch(/step 2 +failed: not the ledger's refusal/);
        expect(first.error).toMatch(/it may have reached the chain/);
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'submitted', txId: ledger.landed[0].txId, ttl: expect.any(Number) });

        let later = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (later++, ledger.take(cbor)) } });
        expect(again.code).toBe(1);
        expect(later).toBe(0);
        expect(again.error).toMatch(STOP);
        expect(stateOf().steps.unsigned.status).toBe('accepted');
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    test('an unanswered step 2 that never landed: a rerun waits while it may land; once expired with its seed unspent, step 2 runs again', async () => {
        const ledger = fakeChain();
        let submits = 0;
        const client = { ...ledger, submit: async cbor => (submits++ === 0 ? Promise.reject(noAnswer()) : ledger.take(cbor)) };
        const first = await run({ client });
        expect(first.code).toBe(1);
        const { txId } = stateOf().steps.unsigned;

        let later = 0;
        const counting = { ...ledger, submit: async cbor => (later++, ledger.take(cbor)) };
        const early = await run({ client: counting });
        expect(early.code).toBe(1);
        expect(later).toBe(0);
        expect(early.error).toMatch(new RegExp(`step 2 stops: tx ${txId} is in no block yet and valid until slot \\d+: run the script again later`));

        ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
        const late = await run({ client: ledger });
        expect(late.code).toBe(0);
        expect(late.output).toMatch(new RegExp(`step 2 +tx ${txId} is in no block and expired .*its seed ${stateOf().steps.unsigned.replaced[0].seed} is unspent: it never reached the chain; step 2 runs again`));
        expect(stateOf().steps.unsigned.replaced.map(attempt => attempt.txId)).toEqual([txId]);
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
    });

    test('an unanswered step 2 whose seed something else spent: the rerun builds no mint and says so', async () => {
        const ledger = fakeChain();
        let submits = 0;
        const client = { ...ledger, submit: async cbor => (submits++ === 0 ? Promise.reject(noAnswer()) : ledger.take(cbor)) };
        expect((await run({ client })).code).toBe(1);
        const { seed } = stateOf().steps.unsigned;
        ledger.spend(seed);
        ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
        let later = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (later++, ledger.take(cbor)) } });
        expect(again.code).toBe(1);
        expect(later).toBe(0);
        expect(again.error).toMatch(new RegExp(`the seed ${seed} .* is spent, but no transaction this step recorded is in a block: something else spent it`));
        expect(again.error).toMatch(/new --run-dir/);
        expect(ledger.landed).toEqual([]);
    });

    // A provider that lags: from the first `hide(txId)` on, it shows the UTxOs as they were then
    // and the hidden transactions in no block; `onSubmit(cbor)` is what a submit does. The test
    // reads the ledger itself once the provider has caught up.
    const lagging = ledger => {
        let lag;
        const client = {
            ...ledger,
            onSubmit: cbor => ledger.take(cbor),
            utxosAt: async address => (lag ? lag.set : ledger.set()).filter(entry => Address.toBech32(entry.address) === address),
            blockOf: async txId => (lag?.hidden.has(txId) ? null : ledger.blockOf(txId)),
            submit: async cbor => client.onSubmit(cbor),
            hide: txId => {
                lag = lag ?? { set: ledger.set(), hidden: new Set() };
                lag.hidden.add(txId);
            },
        };
        return client;
    };
    const pastTtl = ledger => ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
    const serverSigned = cbor => vkeyHashesOf(cbor).includes(server.keyHash);

    test("a step 2 that passed and was replaced is not taken for one the node took: a lagging provider's server-signed mint does not stop the release", async () => {
        const ledger = fakeChain();
        // run 1: step 2 is refused as it must be; the server-signed mint lands, but the provider
        // shows it in no block and its seed unspent
        const client = lagging(ledger);
        client.onSubmit = cbor => {
            if (serverSigned(cbor)) {
                client.hide(txIdOf(cbor));
            }
            return ledger.take(cbor);
        };
        expect((await run({ client })).code).toBe(1);
        const mintTx = stateOf().steps.mint.txId;
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'passed', txId: mintTx });
        expect(kindsOf(ledger)).toEqual(['mint']);
        // run 2, still lagging: the mint looks expired with its seed unspent, so it is built anew,
        // and the new step 2 gets no answer
        pastTtl(ledger);
        client.onSubmit = () => Promise.reject(noAnswer());
        expect((await run({ client })).code).toBe(1);
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'submitted', replaced: [expect.objectContaining({ txId: mintTx, status: 'passed' })] });
        // run 3, the provider caught up: the seed is spent by the mint that passed step 2
        pastTtl(ledger);
        let submits = 0;
        const third = await run({ client: { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) } });
        expect(third.code).toBe(1);
        expect(submits).toBe(0);
        expect(third.error).not.toMatch(STOP);
        expect(third.output).not.toMatch(/result: STOP THE RELEASE/);
        expect(third.error).toMatch(/step 2 stops: the seed .* is spent, but no transaction this step recorded is in a block/);
        expect(stateOf().steps.unsigned.status).toBe('submitted');
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    test("an expired step 2 that landed after all, found by the mint's rerun: the release stops, and the summary and the state say so", async () => {
        const ledger = fakeChain();
        // run 1: the node takes step 2 without the server's signature, gives no answer, and the
        // provider shows it in no block and its seed unspent
        const client = lagging(ledger);
        client.onSubmit = cbor => {
            client.hide(txIdOf(cbor));
            ledger.take(cbor, { enforceSigners: false });
            return Promise.reject(noAnswer());
        };
        expect((await run({ client })).code).toBe(1);
        const unsignedTx = stateOf().steps.unsigned.txId;
        expect(stateOf().steps.unsigned.status).toBe('submitted');
        expect(kindsOf(ledger)).toEqual(['mint']);
        // run 2, still lagging: step 2 looks expired with its seed unspent and runs again; the node
        // refuses the new one as it must; the server-signed mint is lost on the way
        pastTtl(ledger);
        client.onSubmit = cbor => (serverSigned(cbor) ? txIdOf(cbor) : Promise.reject(refusal(missingWitnesses([server.keyHash]))));
        expect((await run({ client })).code).toBe(1);
        const { steps } = stateOf();
        expect(steps.unsigned).toMatchObject({ status: 'passed', replaced: [expect.objectContaining({ txId: unsignedTx, status: 'expired' })] });
        expect(steps.mint).toMatchObject({ status: 'submitted' });
        // run 3, the provider caught up: the mint expired, its seed spent by the first step 2
        pastTtl(ledger);
        const third = await run({ client: ledger });
        expect(third.code).toBe(1);
        expect(third.error).toMatch(STOP);
        expect(third.error).toContain(unsignedTx);
        expect(third.output).toMatch(/step 2 +ACCEPTED/);
        expect(third.out.at(-1)).toBe(`result: STOP THE RELEASE: the node took a mint that the server did not sign (step 2, tx ${unsignedTx}): this deployment must not be released`);
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'accepted', txId: unsignedTx, block: expect.any(Number) });
        // the rerun stops at once, and says it again
        let submits = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) } });
        expect(again.error).toMatch(STOP);
        expect(again.error).toContain(unsignedTx);
        expect(again.out.at(-1)).toMatch(/^result: STOP THE RELEASE/);
        expect(submits).toBe(0);
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    test("an expired step 2 that landed after all, found by the next step 2's rerun: the summary names the transaction the node took", async () => {
        const ledger = fakeChain();
        // run 1 as above: the node takes step 2 unsigned, no answer, and the provider lags
        const client = lagging(ledger);
        client.onSubmit = cbor => {
            client.hide(txIdOf(cbor));
            ledger.take(cbor, { enforceSigners: false });
            return Promise.reject(noAnswer());
        };
        expect((await run({ client })).code).toBe(1);
        const unsignedTx = stateOf().steps.unsigned.txId;
        // run 2, still lagging: step 2 runs again, and gets no answer either
        pastTtl(ledger);
        client.onSubmit = () => Promise.reject(noAnswer());
        expect((await run({ client })).code).toBe(1);
        const retry = stateOf().steps.unsigned;
        expect(retry).toMatchObject({ status: 'submitted', replaced: [expect.objectContaining({ txId: unsignedTx, status: 'expired' })] });
        // run 3, caught up: the retry expired, the seed is spent by the first step 2
        pastTtl(ledger);
        const third = await run({ client: ledger });
        expect(third.error).toMatch(STOP);
        expect(third.out.at(-1)).toContain(`(step 2, tx ${unsignedTx})`);
        expect(stateOf().steps.unsigned).toMatchObject({ status: 'accepted', txId: unsignedTx, replaced: [expect.objectContaining({ txId: retry.txId })] });
    });

    test('a run that stops once the mint is submitted resumes from the chain on the rerun: no second mint', async () => {
        const ledger = fakeChain();
        // the provider is gone right after the mint is taken
        let down = false;
        const failing = {
            ...ledger,
            submit: async cbor => {
                const txId = ledger.take(cbor);
                down = true;
                return txId;
            },
            blockOf: async txId => {
                if (down) {
                    throw new Error('blockOf: could not reach cardano-preprod.blockfrost.io (ECONNRESET)');
                }
                return ledger.blockOf(txId);
            },
        };
        const stopped = await run({ client: failing });
        expect(stopped.code).toBe(1);
        expect(kindsOf(ledger)).toEqual(['mint']);
        expect(stateOf().steps.mint).toMatchObject({ status: 'submitted', txId: ledger.landed[0].txId });
        expect(stopped.output).toContain(`tx ${ledger.landed[0].txId}  submitted, not yet confirmed`);

        const resumed = await run({ client: ledger });
        expect(resumed.code).toBe(0);
        expect(resumed.output).toMatch(new RegExp(`step 3 +resumed: tx ${ledger.landed[0].txId} was submitted .*; it is in block`));
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        // the first mint is the one of step 3: nothing minted twice
        expect(stateOf().steps.mint.txId).toBe(ledger.landed[0].txId);
        expect(ledger.refused).toHaveLength(1);
    });

    test('a submit without an answer that reached the chain is waited for, not repeated', async () => {
        const ledger = fakeChain();
        let first = true;
        const client = {
            ...ledger,
            submit: async cbor => {
                const txId = ledger.take(cbor);
                if (first && kindOf({ cbor }) === 'mint') {
                    first = false;
                    throw noAnswer();
                }
                return txId;
            },
        };
        const result = await run({ client });
        expect(result.code).toBe(0);
        expect(result.output).toMatch(/step 3 +the submit failed without a refusal \(submit: could not reach .*\): it may have reached the chain; waiting for it/);
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
    });

    test('a submitted mint that never landed: before it expires a rerun waits and builds nothing; once it has, the rerun builds anew', async () => {
        const ledger = fakeChain();
        let lost;
        // the server-signed mint is lost on the way: its id is answered, it never lands
        const losing = {
            ...ledger,
            submit: async cbor => {
                if (!lost && vkeyHashesOf(cbor).includes(server.keyHash)) {
                    lost = ledger.take(cbor, { apply: false });
                    return lost;
                }
                return ledger.take(cbor);
            },
        };
        const first = await run({ client: losing });
        expect(first.code).toBe(1);
        expect(first.error).toMatch(new RegExp(`tx ${lost} is in no block yet and valid until slot \\d+: run the script again later`));
        expect(stateOf().steps.mint).toMatchObject({ status: 'submitted', txId: lost });

        // still within its validity: the rerun only waits, it builds and submits nothing
        let submits = 0;
        const counting = { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) };
        const early = await run({ client: counting });
        expect(early.code).toBe(1);
        expect(submits).toBe(0);
        expect(early.error).toMatch(/in no block yet/);

        // past its TTL it can never land: the rerun says so and builds the mint anew
        ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
        const late = await run({ client: ledger });
        expect(late.code).toBe(0);
        expect(late.output).toMatch(new RegExp(`step 3 +tx ${lost} is in no block and expired \\(valid until slot \\d+, the tip is at slot \\d+\\): it never reached the chain; building it anew`));
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        expect(ledger.landed.map(({ txId }) => txId)).not.toContain(lost);
        expect(stateOf().steps.mint.txId).toBe(ledger.landed[0].txId);
        // the lost attempt is kept, not overwritten
        expect(stateOf().steps.mint.replaced).toEqual([expect.objectContaining({ txId: lost, status: 'expired' })]);
    });

    test('a mint judged expired whose seed is spent is not built again: a recorded attempt in a block is taken as the step', async () => {
        const ledger = fakeChain();
        // the mint lands, but the provider does not show its block yet
        let lagging = true;
        const lagged = { ...ledger, blockOf: async txId => (lagging && txId === stateOf().steps.mint?.txId ? null : ledger.blockOf(txId)) };
        const first = await run({ client: lagged });
        expect(first.code).toBe(1);
        expect(first.error).toMatch(/in no block yet/);
        const { txId, seed } = stateOf().steps.mint;
        expect(kindsOf(ledger)).toEqual(['mint']);

        // past its TTL the provider still lags once: the spent seed says it landed
        ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
        let looks = 0;
        const onceMore = { ...ledger, blockOf: async id => (id === txId && looks++ === 0 ? null : ledger.blockOf(id)) };
        const again = await run({ client: onceMore });
        expect(again.code).toBe(0);
        expect(again.output).toMatch(new RegExp(`step 3 +the seed ${seed} is spent: tx ${txId} is in block \\d+ after all; it is this step's transaction, and nothing is built anew`));
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        expect(stateOf().steps.mint).toMatchObject({ status: 'passed', txId });
        lagging = false;
    });

    test('a mint judged expired whose seed something else spent is not built again: the run says so and how to go on', async () => {
        const ledger = fakeChain();
        let lost;
        const losing = {
            ...ledger,
            submit: async cbor => {
                if (!lost && vkeyHashesOf(cbor).includes(server.keyHash)) {
                    lost = ledger.take(cbor, { apply: false });
                    return lost;
                }
                return ledger.take(cbor);
            },
        };
        expect((await run({ client: losing })).code).toBe(1);
        const { seed } = stateOf().steps.mint;
        ledger.spend(seed);
        ledger.advance(chain.TX_VALIDITY_MS / 1000 + EXPIRY_MARGIN_SLOTS + 1);
        let submits = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) } });
        expect(again.code).toBe(1);
        expect(submits).toBe(0);
        expect(again.error).toMatch(new RegExp(`step 3 stops: the seed ${seed} of tx ${lost} is spent, but no transaction this step recorded is in a block: something else spent it`));
        expect(again.error).toMatch(/Look up .* on a preprod explorer/);
        expect(again.error).toMatch(/new --run-dir/);
        expect(stateOf().steps.mint).toMatchObject({ status: 'submitted', txId: lost });
    });

    test('a submit the provider refused reached nothing: the step fails, and the rerun builds it anew', async () => {
        const ledger = fakeChain();
        let refusedOnce = false;
        const client = {
            ...ledger,
            submit: async cbor => {
                if (!refusedOnce && vkeyHashesOf(cbor).includes(server.keyHash)) {
                    refusedOnce = true;
                    throw refusal('... (FeeTooSmallUTxO (Coin 1) (Coin 2)) ...');
                }
                return ledger.take(cbor);
            },
        };
        const refused = await run({ client });
        expect(refused.code).toBe(1);
        expect(refused.output).toMatch(/step 3 +failed: submit: the provider refused the transaction \(400\): .*FeeTooSmallUTxO/);
        expect(refused.error).toMatch(/nothing of it reached the chain; a rerun builds it anew/);
        expect(stateOf().steps.mint.status).toBe('refused');
        expect(ledger.landed).toEqual([]);

        const again = await run({ client: ledger });
        expect(again.code).toBe(0);
        expect(kindsOf(ledger)).toEqual(['mint', 'transfer', 'burn', 'mint', 'burn']);
        expect(stateOf().steps.mint.replaced).toEqual([expect.objectContaining({ status: 'refused' })]);
    });

    test('a finished run is not run again: the rerun submits nothing and prints the summary', async () => {
        const ledger = fakeChain();
        expect((await run({ client: ledger })).code).toBe(0);
        const state = fs.readFileSync(path.join(files.runDir, e2e.STATE_FILE), 'utf8');
        let submits = 0;
        const again = await run({ client: { ...ledger, submit: async cbor => (submits++, ledger.take(cbor)) } });
        expect(again.code).toBe(0);
        expect(submits).toBe(0);
        expect(again.output).toMatch(/step 3 +passed already \(tx [0-9a-f]{64}\)/);
        expect(again.out.at(-1)).toBe('result: every step passed');
        expect(fs.readFileSync(path.join(files.runDir, e2e.STATE_FILE), 'utf8')).toBe(state);
    });

    test('a step whose verdict fails stops the run with exit code 1; the rerun judges it again and builds nothing new', async () => {
        const ledger = fakeChain();
        // the treasury's output of the mint is not where the config says: the chain shows none
        const client = { ...ledger, utxosAt: async address => (address === contracts.treasuryAddress ? [] : ledger.utxosAt(address)) };
        const result = await run({ client });
        expect(result.code).toBe(1);
        expect(result.output).toMatch(/step 3 +failed/);
        expect(result.output).toMatch(/no output of this transaction at the treasury/);
        expect(result.output).toMatch(/step 4 +not run/);
        expect(kindsOf(ledger)).toEqual(['mint']);
        expect(stateOf().steps.mint.status).toBe('failed');

        const again = await run({ client });
        expect(again.code).toBe(1);
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    test('the summary warns, without failing, when a fee the chain charged is above its estimate', async () => {
        const ledger = fakeChain();
        expect((await run({ client: ledger })).code).toBe(0);
        const state = stateOf();
        state.steps.mint.networkFee = chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE + 1;
        state.steps.burn.networkFee = chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE + 1;
        state.steps.mint2.deposit = chain.MINT_DEPOSIT_ESTIMATE_LOVELACE + 1;
        const { lines, passed } = summaryOf(state);
        const text = lines.join('\n');
        expect(passed).toBe(true);
        expect(text).toMatch(new RegExp(`warning: the network fee of the mint \\(${chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE + 1}\\) is above its estimate \\(${chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE}\\)`));
        expect(text).toMatch(/warning: the network fee of the burn by B and the server .* is above its estimate/);
        expect(text).toMatch(/warning: the deposit of the second mint .* is above its estimate/);
        expect(text).toMatch(/redo the measurement/);
        expect(lines.at(-1)).toBe('result: every step passed');
    });

    test('a run directory of other wallets is refused: a run resumes only with the files it began with', async () => {
        const ledger = fakeChain();
        const stopped = await run({ client: { ...ledger, blockOf: async () => Promise.reject(new Error('blockOf: down')) } });
        expect(stopped.code).toBe(1);
        const swapped = await run({ client: ledger, argv: argvOf({ a: files.b, b: files.a }) });
        expect(swapped.code).toBe(1);
        expect(swapped.error).toMatch(/is the run of other wallets, another server key or another deployment/);
        expect(swapped.error).toMatch(/name a new --run-dir/);
        expect(kindsOf(ledger)).toEqual(['mint']);
    });

    describe('refuses before anything is read from the chain', () => {
        const untouched = () => {
            const touched = () => {
                throw new Error('the chain was asked');
            };
            return { params: touched, tip: touched, utxosAt: touched, utxoByUnit: touched, blockOf: touched, submit: touched };
        };

        test.each([
            ['mainnet', 'mainnet'],
            ['no network', undefined],
            ['preview', 'preview'],
        ])('CARDANO_NETWORK %s', async (_name, CARDANO_NETWORK) => {
            const result = await run({ client: untouched(), env: { ...ENV, CARDANO_NETWORK } });
            expect(result.code).toBe(1);
            expect(result.error).toMatch(/CARDANO_NETWORK must be preprod/);
            expect(result.out).toEqual([]);
        });

        test('no deployment record, or one not confirmed', async () => {
            const missing = await run({ client: untouched(), deploymentFile: path.join(dir, 'none.json') });
            expect(missing.error).toMatch(/no deployment record at .*none\.json: deploy first \(deploy\.js\)/);
            fs.writeFileSync(files.deployment, JSON.stringify({ ...DEPLOYMENT, status: 'submitted' }));
            const submitted = await run({ client: untouched() });
            expect(submitted.error).toMatch(/is not confirmed .*deploy\.js --confirm/);
            expect([missing.code, submitted.code]).toEqual([1, 1]);
        });

        test('CHAIN_POLICY_ID of another deployment', async () => {
            const result = await run({ client: untouched(), env: { ...ENV, CHAIN_POLICY_ID: 'c0'.repeat(28) } });
            expect(result.code).toBe(1);
            expect(result.error).toMatch(new RegExp(`CHAIN_POLICY_ID is ${'c0'.repeat(28)}, but .* records the items policy ${policyId}`));
        });

        test('one wallet for both players, and a wallet file others may read or that holds no words', async () => {
            const same = await run({ client: untouched(), argv: argvOf({ b: files.a }) });
            expect(same.error).toMatch(/--player-a and --player-b are the same wallet/);
            fs.chmodSync(files.b, 0o644);
            const open = await run({ client: untouched() });
            expect(open.error).toMatch(/--player-b: .* is open to others .*chmod 600/);
            const keyFile = path.join(dir, 'not-words.sk');
            writeKeyFile(keyFile, stranger.privateKey);
            const notWords = await run({ client: untouched(), argv: argvOf({ a: keyFile }) });
            expect(notWords.error).toMatch(/--player-a: .* is not a wallet file/);
            const none = await run({ client: untouched(), argv: argvOf({ a: path.join(dir, 'nothing.words') }) });
            expect(none.error).toMatch(/--player-a: no wallet file at/);
            for (const result of [same, open, notWords, none]) {
                expect(result.code).toBe(1);
                noSecretIn(result.output + result.error);
            }
        });

        test('a missing option names the usage', async () => {
            const result = await run({ client: untouched(), argv: ['--player-a', files.a, '--player-b', files.b, '--server-key', files.server] });
            expect(result.error).toMatch(/usage: e2e\.js --player-a <words file> --player-b <words file> --server-key <file> --run-dir <dir> \[--dry-run\]/);
        });

        test('every string option given a key or recovery words: refused, not repeated, nothing created', async () => {
            const words = PrivateKey.generateMnemonic(256);
            const shapes = [PrivateKey.toBech32(server.privateKey), PrivateKey.toHex(server.privateKey), words, path.join(dir, PrivateKey.toBech32(server.privateKey))];
            const options = Object.entries(e2e.OPTIONS)
                .filter(([, spec]) => spec.type === 'string')
                .map(([name]) => name);
            expect(options.sort()).toEqual(['player-a', 'player-b', 'run-dir', 'server-key']);
            for (const option of options) {
                for (const value of shapes) {
                    const argv = argvOf();
                    argv[argv.indexOf(`--${option}`) + 1] = value;
                    const result = await run({ client: untouched(), argv });
                    expect(result.code).toBe(1);
                    expect(result.error).toMatch(/not repeated/);
                    expect(result.out).toEqual([]);
                    noSecretIn(result.error);
                    expect(result.error.includes(words.split(' ').slice(0, 4).join(' '))).toBe(false);
                }
            }
            expect(fs.existsSync(files.runDir)).toBe(false);
        });
    });

    test('a server key that is not one of the config refuses before anything is built', async () => {
        const strangerFile = path.join(dir, 'stranger.sk');
        writeKeyFile(strangerFile, stranger.privateKey);
        const ledger = fakeChain();
        const result = await run({ client: ledger, argv: argvOf({ serverKey: strangerFile }) });
        expect(result.code).toBe(1);
        expect(result.error).toMatch(new RegExp(`the server key ${stranger.keyHash} is not a server key of the config`));
        expect(ledger.landed).toEqual([]);
        expect(ledger.refused).toEqual([]);
    });
});

describe('the wallet files', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-e2e-wallet-'));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('loadWallet reads the words new-key.js --kind wallet writes: the base address and the subject it printed', async () => {
        const file = path.join(dir, 'player.words');
        const lines = [];
        await require('../scripts/chain/new-key').main({ argv: ['--kind', 'wallet', '--out', file], log: line => lines.push(line) });
        const wallet = loadWallet(file, preprod, '--player-a');
        expect(lines).toContain(`wallet addr: ${wallet.address}`);
        expect(lines).toContain(wallet.subject);
        const words = fs.readFileSync(file, 'utf8').trim();
        expect(wallet.keyHash).toBe(KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(PrivateKey.fromMnemonicCardano(words)))));
        expect(JSON.stringify(wallet)).not.toContain(words);
    });

    test('walletWitnessOf answers what a CIP-30 wallet answers: verifyWitness takes it', async () => {
        const owner = ownerOf({ utxos: [utxo({ address: A.address, lovelace: ada(20), txId: 'a1'.repeat(32), index: 0 })], subject: A.subject, network: preprod });
        const built = await buildMint({
            item: { key: 'DARK_WALLS', serial: 7 },
            fee: 0,
            owner,
            utxos: [utxo({ address: A.address, lovelace: ada(20), txId: 'a1'.repeat(32), index: 0 })],
            params,
            tip: TIP,
            contracts,
            serverKeyHash: server.keyHash,
        });
        const witness = walletWitnessOf(built.cbor, [A.paymentKey]);
        const { signers } = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness, requiredWitnesses: built.requiredWitnesses });
        expect(signers).toEqual([A.keyHash]);
    });
});

describe('the pure parts', () => {
    const ownerA = { keyHash: A.keyHash, address: A.address };
    const walletA = [utxo({ address: A.address, lovelace: ada(20), txId: 'a1'.repeat(32), index: 0 }), utxo({ address: A.address, lovelace: ada(10), txId: 'a2'.repeat(32), index: 1 })];
    let built;
    let signed;
    beforeAll(async () => {
        built = await buildMint({ item: { key: 'DARK_WALLS', serial: 7 }, fee: 0, owner: ownerA, utxos: walletA, params, tip: TIP, contracts, serverKeyHash: server.keyHash });
        const withA = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitnessOf(built.cbor, [A.paymentKey]), requiredWitnesses: built.requiredWitnesses }).cbor;
        signed = addServerWitness({ cbor: withA, bodyHash: built.bodyHash, key: { privateKey: server.privateKey } }).cbor;
    });
    // the record e2e.js keeps of the mint, and what the chain shows after it
    const mintRecord = () => ({
        status: 'confirmed',
        txId: built.bodyHash,
        ttl: built.ttl,
        item: 'DARK_WALLS',
        serial: 7,
        assetName: built.assetName,
        networkFee: built.networkFee,
        deposit: built.deposit,
        deposits: built.deposits,
        gameFee: built.gameFee,
    });
    const after = () => {
        const outputs = outputsOf(signed);
        const holding = unit => outputs.find(entry => Assets.getByUnit(entry.assets, unit) === 1n);
        return {
            userHolder: holding(policyId + built.assetName.user),
            store: holding(policyId + built.assetName.reference),
            treasuryOutputs: outputs.filter(entry => Address.toBech32(entry.address) === contracts.treasuryAddress),
        };
    };
    const judgeMint = reads => mintVerdict({ record: mintRecord(), player: A, contracts, reads, coinsPerUtxoByte: params.coinsPerUtxoByte });

    test('mintVerdict passes on what the mint created: the user token at A, the store with its datum, 2 ADA at the treasury', () => {
        const verdict = judgeMint(after());
        expect(verdict.checks.map(check => check.passed)).toEqual([true, true, true]);
        expect(verdict.passed).toBe(true);
        expect(verdict.treasuryOutput).toEqual({ lovelace: 2_000_000, minimum: expect.any(Number), coinsPerUtxoByte: 4310 });
        expect(verdict.treasuryOutput.minimum).toBeGreaterThan(800_000);
        expect(verdict.treasuryOutput.minimum).toBeLessThan(2_000_000);
    });

    test('mintVerdict fails when any of it is not so', () => {
        const reads = after();
        const restamped = (entry, change) => new UTxO.UTxO({ transactionId: entry.transactionId, index: entry.index, address: entry.address, assets: entry.assets, datumOption: entry.datumOption, ...change });
        const failing = {
            'the user token at B': { ...reads, userHolder: restamped(reads.userHolder, { address: Address.fromBech32(B.address) }) },
            'the user token in no UTxO': { ...reads, userHolder: undefined },
            'the user token from another transaction': { ...reads, userHolder: restamped(reads.userHolder, { transactionId: TransactionHash.fromHex('ee'.repeat(32)) }) },
            'the store with another serial': {
                ...reads,
                store: restamped(reads.store, {
                    datumOption: new InlineDatum.InlineDatum({ data: itemDatum({ item: { key: 'DARK_WALLS', name: 'Dark chocolate walls', serial: 8 }, userAssetName: built.assetName.user }) }),
                }),
            },
            'the store without a datum': { ...reads, store: restamped(reads.store, { datumOption: undefined }) },
            'the store at a key address': { ...reads, store: restamped(reads.store, { address: Address.fromBech32(A.address) }) },
            'no treasury output': { ...reads, treasuryOutputs: [] },
            'a treasury output with a datum': { ...reads, treasuryOutputs: [restamped(reads.treasuryOutputs[0], { datumOption: new InlineDatum.InlineDatum({ data: Data.constr(0n, []) }) })] },
            'a treasury output of 1 ADA': { ...reads, treasuryOutputs: [restamped(reads.treasuryOutputs[0], { assets: Assets.fromLovelace(1_000_000n) })] },
        };
        for (const [name, changed] of Object.entries(failing)) {
            expect([name, judgeMint(changed).passed]).toEqual([name, false]);
        }
        expect(judgeMint(failing['no treasury output']).checks[2].text).toMatch(/no output of this transaction at the treasury/);
    });

    test('unsignedVerdict passes only for the ledger refusing the missing server signature, through the real provider', async () => {
        const realFetch = globalThis.fetch;
        const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        const outcomeFor = async answer => {
            globalThis.fetch = async () => answer();
            try {
                const client = providerFromEnv(ENV);
                return { accepted: await client.submit(signed) };
            } catch (error) {
                return { error };
            } finally {
                globalThis.fetch = realFetch;
            }
        };
        const judge = outcome => unsignedVerdict({ outcome, serverKeyHash: server.keyHash, playerKeyHash: A.keyHash });
        const submitError = reason => () => json(400, { status_code: 400, error: 'Bad Request', message: JSON.stringify(reason) });

        const missingServer = judge(await outcomeFor(submitError(missingWitnesses([server.keyHash]))));
        expect(missingServer).toEqual({ passed: true, text: expect.stringMatching(new RegExp(`the node refused it for the missing signature of the server key ${server.keyHash}`)) });
        // a long reason is judged whole and shown shortened
        const long = judge({ error: refusal(`${'x'.repeat(1_000)} ${missingWitnesses([server.keyHash])}`) });
        expect(long.passed).toBe(true);
        expect(long.text.length).toBeLessThan(1_000);

        const cases = {
            'a 403 for the project id': [() => json(403, { status_code: 403, error: 'Forbidden', message: 'Invalid project token.' }), /not the ledger's refusal/],
            'a 429': [() => json(429, { status_code: 429, error: 'Too Many Requests', message: 'Usage is over limit.' }), /not the ledger's refusal/],
            'a 500': [() => json(500, { status_code: 500, error: 'Internal Server Error', message: 'An unexpected response was received from the backend.' }), /not the ledger's refusal/],
            'no answer': [
                () => {
                    throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND cardano-preprod.blockfrost.io'), { code: 'ENOTFOUND' }) });
                },
                /not the ledger's refusal/,
            ],
            'another ledger failure': [submitError('... (UtxoFailure (BadInputsUTxO (fromList []))) ...'), /not for a missing signature/],
            'a missing witness of another key': [submitError(missingWitnesses([stranger.keyHash])), /does not name the server key/],
            "A's witness missing as well": [submitError(missingWitnesses([A.keyHash, server.keyHash])), /names player A's key as well/],
            'an accepted submit': [() => json(200, built.bodyHash), /STOP THE RELEASE: the node took a mint that the server did not sign/],
        };
        for (const [name, [answer, message]] of Object.entries(cases)) {
            const verdict = judge(await outcomeFor(answer));
            expect([name, verdict.passed]).toEqual([name, false]);
            expect([name, verdict.text]).toEqual([name, expect.stringMatching(message)]);
            expect(verdict.text).not.toContain(PROJECT_ID);
        }
    });

    test('buildTransfer: a plain transaction, A pays the user token to B, the change to A, signed by A alone', async () => {
        const unit = policyId + built.assetName.user;
        const walletAfter = outputsOf(signed).filter(entry => Address.toBech32(entry.address) === A.address);
        const transfer = await buildTransfer({ from: { address: A.address }, to: { address: B.address }, utxos: walletAfter, unit, params, tip: TIP, network: preprod });
        const { body, witnessSet } = decoded(transfer.cbor);
        expect(transfer.txId).toBe(txIdOf(transfer.cbor));
        expect(transfer.fee).toBe(Number(body.fee));
        expect(transfer.ttl).toBe(TIP.slot + chain.TX_VALIDITY_MS / 1000);
        const toB = body.outputs.filter(output => Address.toBech32(output.address) === B.address);
        expect(toB).toHaveLength(1);
        expect(Assets.getByUnit(toB[0].assets, unit)).toBe(1n);
        expect(body.outputs.filter(output => Address.toBech32(output.address) !== B.address).every(output => Address.toBech32(output.address) === A.address)).toBe(true);
        expect(body.mint).toBeUndefined();
        expect(body.collateralInputs ?? []).toEqual([]);
        expect(witnessSet.plutusV3Scripts ?? []).toEqual([]);
        await expect(buildTransfer({ from: { address: B.address }, to: { address: A.address }, utxos: [], unit, params, tip: TIP, network: preprod })).rejects.toThrow(/holds no/);
    });

    test('transferVerdict and burnVerdict', () => {
        const unit = policyId + built.assetName.user;
        const atB = utxo({ address: B.address, lovelace: 1_300_000n, tokens: { [unit]: 1n }, txId: 'e4'.repeat(32), index: 0 });
        const record = { txId: 'e4'.repeat(32) };
        expect(transferVerdict({ record, to: B, reads: { userHolder: atB } }).passed).toBe(true);
        expect(transferVerdict({ record, to: A, reads: { userHolder: atB } }).passed).toBe(false);
        expect(transferVerdict({ record: { txId: 'e5'.repeat(32) }, to: B, reads: { userHolder: atB } }).passed).toBe(false);
        expect(transferVerdict({ record, to: B, reads: { userHolder: undefined } }).passed).toBe(false);

        // the game's burn by B: the server a required signer, B and the server signed
        const burnRecord = {
            txId: 'e6'.repeat(32),
            back: 5_000_000,
            deposits: { reference: 2_400_000, user: 1_300_000 },
            serverSigns: true,
            holder: 'B',
            holderKeyHash: B.keyHash,
            requiredSigners: [server.keyHash],
            witnesses: [B.keyHash, server.keyHash].sort(),
        };
        const back = utxo({ address: B.address, lovelace: 5_000_000n, txId: 'e6'.repeat(32), index: 0 });
        const judgeBurn = (record, reads = {}) => burnVerdict({ record, reads: { userHolder: undefined, store: undefined, backOutputs: [back], ...reads }, serverKeyHash: server.keyHash });
        expect(judgeBurn(burnRecord).passed).toBe(true);
        expect(judgeBurn(burnRecord, { userHolder: atB }).passed).toBe(false);
        expect(judgeBurn(burnRecord, { store: after().store }).passed).toBe(false);
        expect(judgeBurn(burnRecord, { backOutputs: [] }).passed).toBe(false);
        const short = utxo({ address: B.address, lovelace: 4_999_999n, txId: 'e6'.repeat(32), index: 0 });
        expect(judgeBurn(burnRecord, { backOutputs: [short] }).passed).toBe(false);
        // a game's burn without the server as a required signer, or without its witness, proves nothing of the game
        expect(judgeBurn({ ...burnRecord, requiredSigners: [] }).passed).toBe(false);
        expect(judgeBurn({ ...burnRecord, witnesses: [B.keyHash] }).passed).toBe(false);

        // the holder's burn: nobody else required, only the holder's witness
        const holderRecord = { ...burnRecord, serverSigns: false, requiredSigners: [], witnesses: [B.keyHash] };
        expect(judgeBurn(holderRecord).passed).toBe(true);
        expect(judgeBurn({ ...holderRecord, requiredSigners: [server.keyHash] }).passed).toBe(false);
        expect(judgeBurn({ ...holderRecord, witnesses: [B.keyHash, server.keyHash].sort() }).passed).toBe(false);
        expect(judgeBurn({ ...holderRecord, requiredSigners: [B.keyHash] }).passed).toBe(true);
    });

    test("mintSignersCheck: the game's mint names the server key as a required signer and carries the player's witness alone", () => {
        const withA = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitnessOf(built.cbor, [A.paymentKey]), requiredWitnesses: built.requiredWitnesses }).cbor;
        const check = cbor => mintSignersCheck({ cbor, serverKeyHash: server.keyHash, player: A });
        expect(check(withA).passed).toBe(true);
        // signed by the server too, it is no submit without the server's signature
        expect(check(signed).passed).toBe(false);
        // a server key the body does not name
        expect(mintSignersCheck({ cbor: withA, serverKeyHash: stranger.keyHash, player: A }).passed).toBe(false);
    });

    test('backOf: what a burn gives back, its inputs less its fee', () => {
        const spent = decoded(signed).body.inputs.map(input => walletA.find(entry => outRef(entry) === outRef(input)));
        const total = spent.reduce((sum, entry) => sum + Number(Assets.lovelaceOf(entry.assets)), 0);
        expect(backOf({ cbor: signed, utxos: walletA })).toBe(total - built.networkFee);
        expect(() => backOf({ cbor: signed, utxos: [] })).toThrow(/an input of the transaction is not among/);
    });

    test('fateOf: landed in a block, expired once the tip is past its TTL and the margin, else pending', () => {
        expect(fateOf({ block: 3_000_001, tip: TIP, ttl: TIP.slot })).toEqual({ landed: 3_000_001 });
        expect(fateOf({ block: null, tip: TIP, ttl: TIP.slot })).toEqual({ pending: true });
        expect(fateOf({ block: null, tip: { ...TIP, slot: TIP.slot + EXPIRY_MARGIN_SLOTS }, ttl: TIP.slot })).toEqual({ pending: true });
        expect(fateOf({ block: null, tip: { ...TIP, slot: TIP.slot + EXPIRY_MARGIN_SLOTS + 1 }, ttl: TIP.slot })).toEqual({ expired: true });
    });
});
