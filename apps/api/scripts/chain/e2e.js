// The end-to-end run against preprod, for the owner, once per release with test ADA:
//
//   CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://preprod.koios.rest/api/v1 \
//   node apps/api/scripts/chain/e2e.js \
//     --player-a <words file> --player-b <words file> --server-key <file> --run-dir <dir> [--dry-run]
//   (Koios's public tier needs no key; with CHAIN_PROVIDER_KIND=blockfrost, CHAIN_PROVIDER_URL is
//   Blockfrost's and CHAIN_PROVIDER_KEY its project id: lib.js providerFromEnv; CHAIN_K_FINAL, the
//   server's value, is the depth step 7 waits for, 10 when it is not set)
//
// It proves on the real chain what the offline tests prove locally, with tx.js used as the API
// uses it (the server builds, the player's wallet signs, verifyWitness takes its witness set, the
// server signs last); the players' wallets sign with their recovery words, in the shape of a
// CIP-30 witness set. The deployment is contracts/deployments/preprod.json (confirmed); the config
// is read from the chain by its NFT. The steps:
//
//   1  the contracts of the live config, and the mint of DARK_WALLS (RARE) for player A
//   2  that mint, whose body names the server key as a required signer, submitted with A's witness
//      and without the server's: the node must refuse it, for the server's missing signature. This
//      shows the ledger's check of a required signer on the transaction the game builds; that the
//      items validator itself refuses a mint whose body leaves the server out rests on the Aiken
//      tests, not on this run. If the node takes it, the run says to stop the release.
//   3  the server signs it, it is submitted and lands: A's stake key holds the user token, the
//      store holds the reference token with the item's datum, and the treasury a datum-less output
//      of the RARE fee from this transaction
//   4  A sends the user token to B (a plain transaction, not tx.js)
//   5  the game's burn for B: its body names the server key as a required signer, B and the server
//      sign it; both tokens gone, the store's ADA at B
//   6  a second mint for A, then a burn by A alone: no other signer required, only A's witness;
//      the validator lets the holder burn
//   7  what the server's credit step (apps/api/src/chain/credit.js, minting plan E) asks of the
//      chain before it credits a burned item, for both burns (the game's and the holder's own, which
//      the server credits the same way): once the later one is CHAIN_K_FINAL blocks deep, each burn
//      is still in a block that deep, and the provider sees its user token nowhere (the server
//      never credits on its index alone). The credit itself, the ingredients in the pantry of the
//      player then linked to the holder's stake key, needs the server and its index: the owner
//      checks it in the game
//   8  a summary to paste: each step, its transaction, the fees and deposits the chain charged
//      beside the estimates of packages/shared/chain.js, and the treasury's fee output
//
// Each step says what it is about to do, prints its transaction id once submitted ("submitted,
// not yet confirmed"), waits for its block and prints its verdict. Exit code 0 only if every step
// passed.
//
// The run is resumable: its state (public data only: transaction ids, asset names, fees, the
// verdicts) is in <run-dir>/e2e-preprod.json, written before each submit. A rerun with the same
// files continues where the last one stopped, and never builds a transaction a step submitted
// before unless the chain proves that one can no longer land (in no block, and the tip past its
// TTL), and a mint only while the seed it spent is still unspent: a spent seed means one of the
// recorded attempts landed after all (it is taken as the step's transaction) or something else
// spent it (the run stops). So it never mints a second item by accident. A refused submit (a 4xx
// of the provider) reached nothing and is built anew. The ids of the transactions a step
// replaced stay in its record (`replaced`). Step 7 waits for blocks (about 20 s each) up to a
// bound and otherwise stops; a rerun waits again. For a new run, name a new --run-dir. --dry-run
// reads the chain and builds the next transaction, shows it, and stops before the first submit; it
// writes nothing.

const fs = require('fs');
const path = require('path');
const { Address, Assets, Data, InlineDatum, KeyHash, PrivateKey, Time, Transaction, TransactionHash, TransactionWitnessSet, preprod: preprodChain } = require('@evolution-sdk/evolution');
const { Items, chain, translateIn, translationKeys } = require('@battlechoc/battlechoc-shared-functions');
const { BLUEPRINT_FILE, ChainConfigError, loadBlueprint } = require('../../src/chain/blueprint');
const { gameFeeOf } = require('../../src/chain/fees');
const { loadKey } = require('../../src/chain/keys');
const { itemDatum, outRef } = require('../../src/chain/names');
const { ChainTxError, addServerWitness, buildBurn, buildMint, minUtxoLovelace, ownerOf, readConfig, verifyWitness } = require('../../src/chain/tx');
const { ScriptError, argsOf, builderFor, describeTx, labelled, networkFromEnv, providerFromEnv, runScript, signWith, spendableOf, txIdOf, waitForBlock } = require('./lib');
const { DEPLOYMENT_FILE } = require('./deploy');
const { deploymentOf } = require('./update-config');

const OPTIONS = {
    'player-a': { type: 'string' },
    'player-b': { type: 'string' },
    'server-key': { type: 'string' },
    'run-dir': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
};
const USAGE = 'usage: e2e.js --player-a <words file> --player-b <words file> --server-key <file> --run-dir <dir> [--dry-run]';

/** The state of a run, in its --run-dir. */
const STATE_FILE = 'e2e-preprod.json';

/** The item both mints mint: a RARE item, so its fee is the middle amount. */
const ITEM = 'DARK_WALLS';

// A transaction is taken for lost only once the tip is this far past its TTL (about six blocks):
// by then a block that held it would long be known to the provider.
const EXPIRY_MARGIN_SLOTS = 120;

// The depth from which the server credits a burn (CHAIN_K_FINAL, as the API reads it: a whole
// number from 1 to K_FINAL_MAX), and the value deploy/README.md recommends on preprod, which step 7
// takes when CHAIN_K_FINAL is not set
const K_FINAL_MAX = 2160;
const K_FINAL_PREPROD = 10;

// A block every 20 s or so: step 7 looks at the tip that often, and waits at most twice the time
// its blocks take, plus two minutes, but never more than half an hour
const BLOCK_MS = 20_000;
const creditWaitMs = kFinal => Math.min((2 * kFinal + 6) * BLOCK_MS, 30 * 60_000);

const explorerUrl = txId => `https://preprod.cardanoscan.io/transaction/${txId}`;

// The steps in order: their key in the state, their label and what they do
const STEPS = [
    ['build', 'step 1', 'the contracts and the mint for player A'],
    ['unsigned', 'step 2', "the game's mint without the server's signature: the node must refuse it"],
    ['mint', 'step 3', 'the mint, signed by player A and the server'],
    ['transfer', 'step 4', 'the transfer of the user token from A to B'],
    ['burn', 'step 5', "the game's burn for B: the server a required signer, signed by B and the server"],
    ['mint2', 'step 6a', 'a second mint for player A'],
    ['holderBurn', 'step 6b', "a burn by player A alone: no other signer required, only A's witness"],
    ['credit', 'step 7', "what the server's credit asks of the chain: both burns CHAIN_K_FINAL deep, no user token left"],
];
const LABEL = Object.fromEntries(STEPS.map(([id, label]) => [id, label]));
const TITLE = Object.fromEntries(STEPS.map(([id, , title]) => [id, title]));
const line = (label, text) => `${label.padEnd(8)} ${text}`;

const lovelaceOf = entry => Assets.lovelaceOf(entry.assets);
const txIdOfUtxo = entry => TransactionHash.toHex(entry.transactionId);
const stakeKeyOf = address => (address.stakingCredential instanceof KeyHash.KeyHash ? KeyHash.toHex(address.stakingCredential) : undefined);

/** Stops a dry run before its first submit. */
class DryRunStop extends Error {}

// What the transaction `cbor` names as required signers, and whose vkey witnesses it carries
// (key hashes, sorted)
const requiredSignersOf = cbor => (Transaction.fromCBORHex(cbor).body.requiredSigners ?? []).map(signer => KeyHash.toHex(signer)).sort();
const witnessesOf = cbor => (Transaction.fromCBORHex(cbor).witnessSet.vkeyWitnesses ?? []).map(witness => KeyHash.toHex(KeyHash.fromVKey(witness.vkey))).sort();

// The one result of this script that must stop a release: the node took the mint (tx `txId`)
// the server did not sign
const STOP_THE_RELEASE = 'STOP THE RELEASE: the node took a mint that the server did not sign';
const stopTheRelease = txId =>
    new ScriptError(
        `${STOP_THE_RELEASE}: tx ${txId}  ${explorerUrl(txId)}. The server's signature was not enforced, so this deployment must not be released. ` +
            'Look the transaction up on the explorer and report it with the summary. This --run-dir stops here every time; a new run needs a new --run-dir once the cause is found and fixed'
    );

// A record without the attempts it replaced, and the attempts a new one replaces: those of
// `previous` and `previous` itself
const attemptOf = ({ replaced: _replaced, ...attempt }) => attempt;
const replacedOf = previous => (previous ? [...(previous.replaced ?? []), attemptOf(previous)] : []);

// The step 2 attempts of `record` (steps.unsigned) that may be on the chain: submitted, or judged
// expired. One the node refused (passed) or the provider refused never got there; its body is
// the mint's, so the server-signed mint in a block must not count as it.
const MAY_HAVE_LANDED = ['submitted', 'expired'];
const unsignedAttemptsOf = record => [record, ...(record?.replaced ?? [])].filter(attempt => attempt && MAY_HAVE_LANDED.includes(attempt.status));

// steps.unsigned once the node took its attempt `attempt` (in `block`): that attempt, accepted,
// with the others in `replaced`, so the summary names the transaction the node took
const acceptedUnsigned = (record, attempt, block) => ({
    ...attemptOf(attempt),
    status: 'accepted',
    block,
    replaced: [record, ...(record.replaced ?? [])].filter(other => other.txId !== attempt.txId).map(attemptOf),
});

// ---------------------------------------------------------------------------------------------
// The wallets

const WORDS = /^[a-z]+(?: [a-z]+)*\n?$/;
// the mode bits of group and others
const OPEN_TO_OTHERS = 0o077;

/**
 * The wallet in `file` (the recovery words new-key.js --kind wallet writes, mode 600) on
 * `network`: { paymentKey (the SDK's PrivateKey of 1852'/1815'/0'/0/0), keyHash, stakeKeyHash,
 * address (the base address), subject ('stake:<hash>') }. A refusal names `option` and the file,
 * never what is in it.
 */
const loadWallet = (file, network, option) => {
    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        throw new ScriptError(`${option}: no wallet file at ${file}`);
    }
    if (!stat.isFile()) {
        throw new ScriptError(`${option}: ${file} is not a file`);
    }
    if ((stat.mode & OPEN_TO_OTHERS) !== 0) {
        throw new ScriptError(`${option}: ${file} is open to others (mode ${(stat.mode & 0o777).toString(8)}): chmod 600 it`);
    }
    const content = fs.readFileSync(file, 'utf8');
    let valid;
    try {
        valid = WORDS.test(content) && PrivateKey.validateMnemonic(content.trim());
    } catch {
        valid = false;
    }
    if (!valid) {
        throw new ScriptError(`${option}: ${file} is not a wallet file (the recovery words new-key.js --kind wallet writes)`);
    }
    const words = content.trim();
    const paymentKey = PrivateKey.fromMnemonicCardano(words);
    const hashOf = key => KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(key)));
    const keyHash = hashOf(paymentKey);
    const stakeKeyHash = hashOf(PrivateKey.fromMnemonicCardano(words, { role: 2 }));
    const address = Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: KeyHash.fromHex(keyHash), stakingCredential: KeyHash.fromHex(stakeKeyHash) }));
    return { paymentKey, keyHash, stakeKeyHash, address, subject: `stake:${stakeKeyHash}` };
};

/**
 * What a CIP-30 wallet answers to signTx(cbor, true): a witness set (CBOR hex) with a vkey witness
 * of each of `privateKeys` over the body hash of `cbor`, nothing else.
 */
const walletWitnessOf = (cbor, privateKeys) => {
    const message = TransactionHash.toBytes(TransactionHash.fromHex(txIdOf(cbor)));
    const witnesses = privateKeys.map(privateKey => new TransactionWitnessSet.VKeyWitness({ vkey: PrivateKey.toPublicKey(privateKey), signature: PrivateKey.sign(privateKey, message) }));
    return TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses(witnesses));
};

// `cbor` (built by tx.js) with the witness set `player`'s wallet answers spliced in by
// verifyWitness, as the API takes it: the wallet signs for the keys of `requiredWitnesses` it has
const signedByPlayer = ({ cbor, bodyHash, requiredWitnesses }, player) =>
    verifyWitness({ cbor, bodyHash, requiredWitnesses, witness: walletWitnessOf(cbor, requiredWitnesses.includes(player.keyHash) ? [player.paymentKey] : []) }).cbor;

// ---------------------------------------------------------------------------------------------
// The transfer (a plain SDK transaction)

/**
 * The unsigned transfer of the token `unit` from `from` ({ address }) to `to` ({ address }): it
 * spends the UTxO of `utxos` that holds it, pays it to `to.address` with the minimum ADA, and the
 * change to `from.address`; valid for TX_VALIDITY_MS from `tip`. { cbor, txId, fee, ttl }.
 */
const buildTransfer = async ({ from, to, utxos, unit, params, tip, network }) => {
    const spendable = spendableOf(utxos);
    const held = spendable.find(entry => Assets.getByUnit(entry.assets, unit) === 1n);
    if (!held) {
        throw new ScriptError(`${from.address} holds no ${unit}`);
    }
    const ttl = tip.slot + chain.TX_VALIDITY_MS / 1000;
    const builder = builderFor(network)
        .collectFrom({ inputs: [held] })
        .payToAddress({ address: Address.fromBech32(to.address), assets: Assets.fromRecord({ [unit]: 1n }), autoMinUtxo: true });
    builder.setValidity({ to: Time.slotToUnixTime(BigInt(ttl), preprodChain.slotConfig) });
    let cbor;
    try {
        const result = await builder.build({ availableUtxos: spendable, changeAddress: Address.fromBech32(from.address), fullProtocolParameters: params });
        cbor = Transaction.toCBORHex(await result.toTransaction());
    } catch (error) {
        throw new ScriptError(`the transfer does not build: ${error?.message ?? error}`);
    }
    const { body } = Transaction.fromCBORHex(cbor);
    return { cbor, txId: txIdOf(cbor), fee: Number(body.fee), ttl: Number(body.ttl) };
};

/** What the burn `cbor` gives back to the holder: what its inputs (among `utxos`) hold, less its fee. */
const backOf = ({ cbor, utxos }) => {
    const { body } = Transaction.fromCBORHex(cbor);
    const spent = body.inputs.map(input => utxos.find(entry => outRef(entry) === outRef(input)));
    if (spent.some(entry => entry === undefined)) {
        throw new ScriptError('an input of the transaction is not among the UTxOs it was built from');
    }
    return Number(spent.reduce((sum, entry) => sum + lovelaceOf(entry), 0n) - body.fee);
};

// ---------------------------------------------------------------------------------------------
// The verdicts: what counts as passed, from what the chain shows

const verdictOf = checks => ({ passed: checks.every(check => check.passed), checks });

// The provider's answer to a refused transaction: the ledger's reason after this
const LEDGER_REFUSAL = /^submit: the provider refused the transaction \(400\): /;
// the ledger's failure for a key whose witness is missing (required signers are among those keys)
const MISSING_SIGNER = /MissingVKeyWitnessesUTXOW|MissingRequiredSigners/;
const MAX_REASON = 600;

/**
 * Step 2's verdict on `outcome` ({ accepted: txId } or { error }, the submit of a mint without
 * the server's witness): passed only for the ledger's refusal (a 400 with its reason) for a
 * missing signature that names the server key `serverKeyHash` and not the player's
 * `playerKeyHash` (A signed). A 403, a limit, a 5xx, no answer or another ledger failure is a
 * failed step, not a refusal. { passed, text }.
 */
const unsignedVerdict = ({ outcome, serverKeyHash, playerKeyHash }) => {
    const failed = text => ({ passed: false, text });
    if (outcome.error === undefined) {
        return { passed: false, accepted: true, text: `${STOP_THE_RELEASE} (the provider answered tx ${outcome.accepted}): this deployment must not be released` };
    }
    const message = String(outcome.error?.message ?? outcome.error);
    if (outcome.error?.refused !== true || !LEDGER_REFUSAL.test(message)) {
        return failed(`not the ledger's refusal, so nothing is proven: ${message}`);
    }
    // judged on the whole reason, shown shortened
    const reason = message.replace(LEDGER_REFUSAL, '');
    const shown = reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON)} …` : reason;
    if (!MISSING_SIGNER.test(reason)) {
        return failed(`the node refused it, but not for a missing signature: ${shown}`);
    }
    if (!reason.includes(serverKeyHash)) {
        return failed(`the node refused it for a missing signature that does not name the server key ${serverKeyHash}: ${shown}`);
    }
    if (reason.includes(playerKeyHash)) {
        return failed(`the node refused it for a missing signature, but names player A's key as well (A's witness did not count): ${shown}`);
    }
    return { passed: true, text: `the node refused it for the missing signature of the server key ${serverKeyHash} (the ledger: ${shown})` };
};

/**
 * What makes step 2's submit the game's mint without the server: the body of `cbor` names the
 * server key `serverKeyHash` as a required signer, and it carries `player`'s witness alone.
 * { passed, text }.
 */
const mintSignersCheck = ({ cbor, serverKeyHash, player }) => {
    const required = requiredSignersOf(cbor);
    const witnesses = witnessesOf(cbor);
    if (!required.includes(serverKeyHash)) {
        return { passed: false, text: `the mint's body does not name the server key ${serverKeyHash} as a required signer (it names ${required.join(', ') || 'none'}): its submit would prove nothing of the server` };
    }
    if (witnesses.length !== 1 || witnesses[0] !== player.keyHash) {
        return { passed: false, text: `the mint carries the witnesses of ${witnesses.join(', ') || 'nobody'}, not player A's alone` };
    }
    return { passed: true, text: `the mint's body names the server key ${serverKeyHash} as a required signer and carries only player A's witness` };
};

// The English name of an item, as buildMint writes it into the datum
const englishNameOf = key => translateIn('en', translationKeys[`ITEM_${key}`]);

/**
 * Step 3's (and 6a's) verdict on the mint `record` for `player`, from `reads`: { userHolder (the
 * UTxO holding the user token), store (the one holding the reference token), treasuryOutputs (the
 * UTxOs at the treasury) }. Passed when the user token is in an output of this transaction at an
 * address of the player's stake key, the store is an output of it at the items script with the
 * item's datum inline, and the treasury holds exactly one output of it: no datum, no token, the
 * game fee of the item's tier. { passed, checks: [{ passed, text }], treasuryOutput: { lovelace,
 * minimum (its minimum UTxO at `coinsPerUtxoByte`), coinsPerUtxoByte } | undefined }.
 */
const mintVerdict = ({ record, player, contracts, reads, coinsPerUtxoByte }) => {
    const ours = entry => entry !== undefined && txIdOfUtxo(entry) === record.txId;
    const { userHolder, store } = reads;

    let user;
    if (!ours(userHolder)) {
        user = { passed: false, text: userHolder ? `the user token is in ${outRef(userHolder)}, not in an output of this transaction` : 'the user token is in no UTxO' };
    } else if (stakeKeyOf(userHolder.address) !== player.stakeKeyHash) {
        user = { passed: false, text: `the user token is at ${Address.toBech32(userHolder.address)}, not at an address of player A's stake key` };
    } else {
        user = { passed: true, text: `player A's stake key holds the user token (${outRef(userHolder)})` };
    }

    const datum = itemDatum({ item: { key: record.item, name: englishNameOf(record.item), serial: record.serial }, userAssetName: record.assetName.user });
    let held;
    if (!ours(store)) {
        held = { passed: false, text: store ? `the reference token is in ${outRef(store)}, not in an output of this transaction` : 'the reference token is in no UTxO' };
    } else if (Address.toBech32(store.address) !== contracts.itemsAddress) {
        held = { passed: false, text: `the reference token is at ${Address.toBech32(store.address)}, not at the items script ${contracts.itemsAddress}` };
    } else if (!(store.datumOption instanceof InlineDatum.InlineDatum) || !Data.equals(store.datumOption.data, datum)) {
        held = { passed: false, text: `the store ${outRef(store)} does not hold the item's datum (${record.item}, serial ${record.serial}) inline` };
    } else {
        held = { passed: true, text: `the store ${outRef(store)} holds the reference token with the item's datum (${record.item}, serial ${record.serial})` };
    }

    const outputs = reads.treasuryOutputs.filter(ours);
    const due = BigInt(record.gameFee.amount);
    let fee;
    let treasuryOutput;
    if (outputs.length !== 1) {
        fee = { passed: false, text: outputs.length === 0 ? `no output of this transaction at the treasury ${contracts.treasuryAddress}` : `${outputs.length} outputs of this transaction at the treasury, not one` };
    } else {
        const [output] = outputs;
        treasuryOutput = {
            lovelace: Number(lovelaceOf(output)),
            minimum: Number(minUtxoLovelace({ address: output.address, assets: output.assets, coinsPerUtxoByte: BigInt(coinsPerUtxoByte) })),
            coinsPerUtxoByte: Number(coinsPerUtxoByte),
        };
        if (output.datumOption !== undefined) {
            fee = { passed: false, text: `the treasury's output ${outRef(output)} has a datum` };
        } else if (Assets.hasMultiAsset(output.assets)) {
            fee = { passed: false, text: `the treasury's output ${outRef(output)} holds tokens` };
        } else if (lovelaceOf(output) !== due) {
            fee = { passed: false, text: `the treasury's output ${outRef(output)} holds ${lovelaceOf(output)} lovelace, not the fee of ${due}` };
        } else {
            fee = { passed: true, text: `the treasury holds ${due} lovelace from this transaction, without a datum (${outRef(output)})` };
        }
    }
    return { ...verdictOf([user, held, fee]), treasuryOutput };
};

/** Step 4's verdict: the user token is in an output of the transfer at an address of `to`'s stake key. */
const transferVerdict = ({ record, to, reads: { userHolder } }) => {
    let check;
    if (!userHolder || txIdOfUtxo(userHolder) !== record.txId) {
        check = { passed: false, text: userHolder ? `the user token is in ${outRef(userHolder)}, not in an output of this transaction` : 'the user token is in no UTxO' };
    } else if (stakeKeyOf(userHolder.address) !== to.stakeKeyHash) {
        check = { passed: false, text: `the user token is at ${Address.toBech32(userHolder.address)}, not at an address of the receiver's stake key` };
    } else {
        check = { passed: true, text: `player B's stake key holds the user token (${outRef(userHolder)})` };
    }
    return verdictOf([check]);
};

/**
 * Step 5's (and 6b's) verdict on the burn `record`, from `reads`: { userHolder, store (the UTxOs
 * holding the two tokens, if any), backOutputs (the UTxOs at the holder's address) }. Passed when
 * the body submitted is what the step claims (the record's `requiredSigners` and `witnesses`,
 * read from it): the game's burn (`serverSigns`) names the server key `serverKeyHash` as a
 * required signer and carries the witnesses of the holder and the server; the holder's burn
 * requires no signer but the holder and carries the holder's witness alone. And when both tokens
 * are gone and the holder's outputs of this transaction hold what it spent less its fee
 * (`record.back`), the store's deposit with it.
 */
const burnVerdict = ({ record, reads: { userHolder, store, backOutputs }, serverKeyHash }) => {
    const { requiredSigners, witnesses, holder, holderKeyHash } = record;
    const named = `required signers ${requiredSigners.join(', ') || 'none'}; witnesses ${witnesses.join(', ') || 'none'}`;
    let signers;
    if (record.serverSigns) {
        signers =
            requiredSigners.includes(serverKeyHash) && witnesses.includes(serverKeyHash) && witnesses.includes(holderKeyHash)
                ? { passed: true, text: `the body names the server key ${serverKeyHash} as a required signer, and the server and player ${holder} signed it` }
                : { passed: false, text: `the game's burn is not one the server must sign and signed (${named})` };
    } else if (requiredSigners.every(hash => hash === holderKeyHash) && witnesses.length === 1 && witnesses[0] === holderKeyHash) {
        signers = { passed: true, text: `the body requires no signer${requiredSigners.length > 0 ? ' but the holder' : ''} and carries only player ${holder}'s witness: the validator let the holder burn alone` };
    } else {
        signers = { passed: false, text: `the holder's burn requires or carries another key than player ${holder}'s (${named})` };
    }
    const left = [userHolder && `the user token is still in ${outRef(userHolder)}`, store && `the reference token is still in ${outRef(store)}`].filter(Boolean);
    const gone = left.length === 0 ? { passed: true, text: 'both tokens are gone' } : { passed: false, text: left.join('; ') };
    const back = backOutputs.filter(entry => txIdOfUtxo(entry) === record.txId).reduce((sum, entry) => sum + Number(lovelaceOf(entry)), 0);
    const returned =
        back === record.back
            ? { passed: true, text: `the holder's outputs of this transaction hold ${back} lovelace, the store's ${record.deposits.reference} with them (what it spent, less the fee)` }
            : { passed: false, text: `the holder's outputs of this transaction hold ${back} lovelace, not ${record.back} (what it spent with the store's ${record.deposits.reference}, less the fee)` };
    return verdictOf([signers, gone, returned]);
};

/**
 * Step 7's verdict, once the tip `tip` ({ block }) is `kFinal` blocks past the later burn, on the
 * burns `burns` ([{ id (the burn's step), record (its state), player (whose stake key held the
 * token), block (the block the provider has it in now, null in none), userHolder (the UTxO the
 * provider names for its user token, if any) }]): what the server's credit step asks of the chain
 * before it credits a burned item. Each burn is in a block `kFinal` or more deep (one rolled back,
 * or moved into a later block, is not credited yet), and the provider sees its user token nowhere
 * (the server never credits on its index alone). The credit goes to the player linked to the
 * holder's stake key when the server makes it; that is the server's to know, so the text names the
 * key and checks nothing of it.
 */
const creditVerdict = ({ burns, tip, kFinal }) =>
    verdictOf(
        burns.flatMap(({ id, record, player, block, userHolder }) => {
            const burn = `the burn of ${LABEL[id]} (tx ${record.txId})`;
            const depth = block === null || block === undefined ? null : tip.block - block;
            let deep;
            if (depth === null) {
                deep = { passed: false, text: `${burn} is in no block now: rolled back; the server credits a burn only once it is ${kFinal} blocks deep` };
            } else {
                const where = `${depth} blocks deep in block ${block} (the tip is at block ${tip.block})`;
                deep =
                    depth >= kFinal
                        ? { passed: true, text: `${burn} is ${where}: the server credits a burn from ${kFinal} on` }
                        : { passed: false, text: `${burn} is only ${where}: the server credits it from ${kFinal} on` };
            }
            const gone = userHolder
                ? { passed: false, text: `the provider still sees the user token of ${LABEL[id]}'s item in ${outRef(userHolder)}: the server credits nothing while it does` }
                : {
                      passed: true,
                      text: `the provider sees the user token of ${LABEL[id]}'s item nowhere: the server's credit step gives its ingredients for player ${player.name}'s stake key ${player.stakeKeyHash} to the player then linked to that stake key, or to nobody when it is linked to no player`,
                  };
            return [deep, gone];
        })
    );

/**
 * What became of a submitted transaction valid until slot `ttl`: { landed: block } in a block,
 * { expired: true } in none with the tip more than EXPIRY_MARGIN_SLOTS past its TTL (it can never
 * land), else { pending: true }.
 */
const fateOf = ({ block, tip, ttl }) => {
    if (block !== null && block !== undefined) {
        return { landed: block };
    }
    return tip.slot > ttl + EXPIRY_MARGIN_SLOTS ? { expired: true } : { pending: true };
};

// ---------------------------------------------------------------------------------------------
// The summary

// the costs the summary sets beside their estimates: [step, label, estimate of the network fee]
const COSTS = [
    ['mint', 'mint', chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE],
    ['burn', 'burn by B and the server', chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE],
    ['mint2', 'second mint', chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE],
    ['holderBurn', 'burn by A alone', chain.BURN_NETWORK_FEE_ESTIMATE_LOVELACE],
];
const MINTS = [
    ['mint', 'mint'],
    ['mint2', 'second mint'],
];
const row = (label, charged, estimate, note = '') => `  ${label.padEnd(40)} ${String(charged).padStart(9)}  ${String(estimate).padStart(9)}${note ? `  ${note}` : ''}`;

/**
 * The summary of the run `state`, to paste: { lines, passed (every step passed) }. Each step with
 * its status and transaction; the network fees, deposits and game fees the chain charged (the
 * transactions landed with these bodies) beside the estimates of packages/shared/chain.js, with a
 * warning (not a failure) for each above its estimate; the treasury's fee output and its minimum
 * UTxO.
 */
const summaryOf = state => {
    const { steps } = state;
    const lines = [`summary of the end-to-end run on ${state.network}, items policy ${state.policyId}`];
    for (const [id, label, title] of STEPS) {
        const step = steps[id];
        const status =
            step?.status === 'passed' || step?.status === 'failed' ? step.status : step?.status === 'accepted' ? 'ACCEPTED' : step?.status ? `${step.status}, not passed` : 'not run';
        const tx = step?.txId && id !== 'build' && id !== 'unsigned' ? `  tx ${step.txId}  ${explorerUrl(step.txId)}` : '';
        lines.push(`  ${label.padEnd(8)} ${status.padEnd(7)} ${title}${tx}`);
        if (id === 'unsigned' && step?.text) {
            lines.push(`           ${step.text}`);
        }
    }
    const warnings = [];
    lines.push(row('costs (lovelace)', 'charged', 'estimate'));
    for (const [id, label, estimate] of COSTS) {
        const fee = steps[id]?.networkFee;
        lines.push(row(`network fee, ${label}`, fee ?? '-', estimate));
        if (fee > estimate) {
            warnings.push(`warning: the network fee of the ${label} (${fee}) is above its estimate (${estimate}): redo the measurement (Task 9) with the reason`);
        }
    }
    lines.push(row('network fee, transfer', steps.transfer?.fee ?? '-', 'none', 'a plain transaction'));
    for (const [id, label] of MINTS) {
        const step = steps[id];
        lines.push(row(`deposit, ${label}`, step?.deposit ?? '-', chain.MINT_DEPOSIT_ESTIMATE_LOVELACE, step?.deposits ? `reference ${step.deposits.reference}, user ${step.deposits.user}` : ''));
        if (step?.deposit > chain.MINT_DEPOSIT_ESTIMATE_LOVELACE) {
            warnings.push(`warning: the deposit of the ${label} (${step.deposit}) is above its estimate (${chain.MINT_DEPOSIT_ESTIMATE_LOVELACE}): redo the measurement (Task 9) with the reason`);
        }
    }
    for (const [id, label] of MINTS) {
        const step = steps[id];
        lines.push(row(`game fee, ${label}`, step?.gameFee?.paid ?? '-', step?.gameFee ? `${step.gameFee.amount} due (${step.tier})` : '-'));
    }
    const treasury = steps.mint?.treasuryOutput ?? steps.mint2?.treasuryOutput;
    lines.push(
        treasury
            ? `  ${'treasury fee output'.padEnd(40)} ${treasury.lovelace} lovelace, no datum, taken by the node; its minimum UTxO at coinsPerUtxoByte ${treasury.coinsPerUtxoByte} is ${treasury.minimum}`
            : `  ${'treasury fee output'.padEnd(40)} -`
    );
    lines.push(...warnings);
    const notPassed = STEPS.filter(([id]) => steps[id]?.status !== 'passed').length;
    if (steps.unsigned?.status === 'accepted') {
        lines.push(`result: ${STOP_THE_RELEASE} (step 2, tx ${steps.unsigned.txId}): this deployment must not be released`);
    } else {
        lines.push(notPassed === 0 ? 'result: every step passed' : `result: ${notPassed} of ${STEPS.length} steps did not pass`);
    }
    return { lines, passed: notPassed === 0 };
};

// ---------------------------------------------------------------------------------------------
// The state of a run

const readState = file => {
    if (!fs.existsSync(file)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new ScriptError(`${file} is not the state of a run (not JSON): name a new --run-dir`);
    }
};
// `state` written to `file` whole or not at all (a new file renamed over it)
const writeState = (file, state) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const partial = `${file}.partial`;
    fs.writeFileSync(partial, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(partial, file);
};
// what a run is a run of: the deployment, the server key, the two wallets (public parts)
const identityOf = ({ network, deployment, serverKey, players }) => ({
    network: network.name,
    policyId: deployment.policyId,
    configPolicyId: deployment.configPolicyId,
    serverKeyHash: serverKey.keyHash,
    players: Object.fromEntries(Object.entries(players).map(([name, { keyHash, stakeKeyHash, address }]) => [name, { keyHash, stakeKeyHash, address }])),
});
const sameRun = (state, identity) => Object.keys(identity).every(key => JSON.stringify(state[key]) === JSON.stringify(identity[key]));

// ---------------------------------------------------------------------------------------------
// The steps on the chain

// A ChainTxError of tx.js as the owner's next move
const refusalOf = (error, what, player) => {
    if (!(error instanceof ChainTxError)) {
        return error;
    }
    if (error.code === 'NOT_ENOUGH_ADA') {
        return new ScriptError(`${what}: player ${player.name}'s wallet needs ${error.missing} more lovelace in one more UTxO: send at least ${Math.ceil(error.missing / 1e6)} tADA to ${player.address}`);
    }
    if (error.code === 'NO_OWNER_ADDRESS') {
        return new ScriptError(`${what}: player ${player.name}'s wallet holds nothing at ${player.address}: send it test ADA from the faucet`);
    }
    if (error.code === 'NO_COLLATERAL') {
        return new ScriptError(`${what}: player ${player.name}'s wallet has no UTxO of pure ADA for the collateral (${chain.COLLATERAL_LOVELACE} lovelace and its return): send test ADA to ${player.address}`);
    }
    return new ScriptError(`${what} does not build: ${error.code}${error.cause ? ` (${error.cause})` : ''}`);
};

// Waits for the submitted `record` while it may still land (without `wait`: one look): its fate
const settle = async (ctx, label, record, { wait = true } = {}) => {
    const { client, log, sleep } = ctx;
    const block = await client.blockOf(record.txId);
    let tip = await client.tip();
    const fate = fateOf({ block, tip, ttl: record.ttl });
    if (!fate.pending || !wait) {
        return { ...fate, tip };
    }
    const timeout = (record.ttl + EXPIRY_MARGIN_SLOTS - tip.slot + 1) * 1000;
    log(line(label, `waiting for tx ${record.txId} to be in a block (up to ${Math.ceil(timeout / 60_000)} minutes) …`));
    const landed = await waitForBlock({ client, txId: record.txId, timeout, ...(sleep ? { sleep } : {}) });
    tip = landed === null ? await client.tip() : tip;
    return { ...fateOf({ block: landed, tip, ttl: record.ttl }), tip };
};

/**
 * What became of the mint attempts `attempts` (records with `txId` and `seed`, judged expired)
 * whose seed `seed` was in `player`'s wallet, from one look at the wallet and at each attempt:
 *   { open: true }                    the seed is unspent: none of them landed, and none can
 *   { landed: { attempt, block } }    the seed is spent, and that attempt is in that block
 *   { lost: true }                    the seed is spent by no attempt this step recorded
 */
const seedFateOf = async (ctx, player, seed, attempts) => {
    const utxos = await ctx.client.utxosAt(player.address);
    if (utxos.some(entry => outRef(entry) === seed)) {
        return { open: true };
    }
    for (const attempt of attempts.filter(candidate => candidate.seed === seed && candidate.txId)) {
        const block = await ctx.client.blockOf(attempt.txId);
        if (block !== null && block !== undefined) {
            return { landed: { attempt, block } };
        }
    }
    return { lost: true };
};
const seedSpentElsewhere = (label, seed, txId) =>
    new ScriptError(
        `${label} stops: the seed ${seed} of tx ${txId} is spent, but no transaction this step recorded is in a block: something else spent it. ` +
            `Look up ${seed} on a preprod explorer to see which transaction. Nothing is built: a new mint could be a second item. Start a new run with a new --run-dir`
    );

/**
 * One step with a transaction: `build(ctx)` → { cbor (signed, to submit), txId, ttl, facts },
 * `judge(ctx, record)` → a verdict. A step that passed is skipped. A submitted one is looked for
 * on the chain: in a block it is judged; expired it is built anew; still valid it is waited for,
 * and never built again. A new transaction is recorded before it is submitted. A submit the
 * provider refused (4xx) fails the step; nothing of it reached the chain. Throws a ScriptError
 * when the step does not pass.
 */
const txStep = async (ctx, id, { build, judge, announce = () => ctx.log(line(LABEL[id], TITLE[id])), prepare = async () => {}, onExpired }) => {
    const { client, log, state, save, now } = ctx;
    const label = LABEL[id];
    let record = state.steps[id];
    if (record?.status === 'passed') {
        log(line(label, `passed already (tx ${record.txId})`));
        return record;
    }
    const stop = message => new ScriptError(`${label} ${message}`);
    const pending = ({ tip }) =>
        stop(`stops: tx ${record.txId} is in no block yet and valid until slot ${record.ttl}: run the script again later (the same --run-dir); it then looks again (the tip is at slot ${tip.slot})`);

    if (record?.status === 'submitted') {
        const fate = await settle(ctx, label, record, { wait: !ctx.dryRun });
        if (fate.landed !== undefined) {
            log(line(label, `resumed: tx ${record.txId} was submitted at ${record.submittedAt}; it is in block ${fate.landed}`));
            record = state.steps[id] = { ...record, status: 'confirmed', block: fate.landed };
            save();
        } else if (fate.pending) {
            if (ctx.dryRun) {
                log(`dry run: ${label}'s tx ${record.txId} is in no block yet; a run waits for it`);
                throw new DryRunStop();
            }
            throw pending(fate);
        } else {
            // a mint is built anew only while its seed is unspent (onExpired, seedFateOf)
            const decision = onExpired ? await onExpired(record) : { open: true };
            const expired = `tx ${record.txId} is in no block and expired (valid until slot ${record.ttl}, the tip is at slot ${fate.tip.slot})`;
            if (decision.lost) {
                throw seedSpentElsewhere(label, record.seed, record.txId);
            }
            if (decision.landed) {
                const { attempt, block } = decision.landed;
                log(line(label, `the seed ${record.seed} is spent: tx ${attempt.txId} is in block ${block} after all; it is this step's transaction, and nothing is built anew`));
                const others = [record, ...(record.replaced ?? [])].filter(other => other.txId !== attempt.txId).map(attemptOf);
                record = state.steps[id] = { ...attemptOf(attempt), status: 'confirmed', block, replaced: others };
            } else {
                log(line(label, `${expired}: it never reached the chain; building it anew${record.seed ? ` (its seed ${record.seed} is unspent)` : ''}`));
                record = state.steps[id] = { ...record, status: 'expired' };
            }
            save();
        }
    }

    if (record?.status !== 'confirmed' && record?.status !== 'failed') {
        await prepare();
        announce();
        const built = await build(ctx);
        ctx.gate(label, built.cbor);
        record = state.steps[id] = { status: 'submitted', txId: built.txId, ttl: built.ttl, submittedAt: now().toISOString(), block: null, ...built.facts, replaced: replacedOf(record) };
        save();
        let answered;
        let failure;
        try {
            answered = await client.submit(built.cbor);
        } catch (error) {
            if (error?.refused === true) {
                record = state.steps[id] = { ...record, status: 'refused', reason: error.message };
                save();
                log(line(label, `failed: ${error.message}`));
                throw stop(`failed: ${error.message}; nothing of it reached the chain; a rerun builds it anew`);
            }
            failure = error;
        }
        if (!failure && answered !== built.txId) {
            failure = new Error(`the provider answered the transaction id ${answered}`);
        }
        if (failure) {
            log(line(label, `the submit failed without a refusal (${failure.message ?? failure}): it may have reached the chain; waiting for it (tx ${built.txId}  ${explorerUrl(built.txId)})`));
        } else {
            log(line(label, `tx ${built.txId}  submitted, not yet confirmed  ${explorerUrl(built.txId)}`));
        }
        const fate = await settle(ctx, label, record);
        if (fate.pending) {
            throw pending(fate);
        }
        if (fate.expired) {
            throw stop(`stops: tx ${record.txId} is in no block and expired (valid until slot ${record.ttl}): it never reached the chain; a rerun builds it anew`);
        }
        log(line(label, `in block ${fate.landed}`));
        record = state.steps[id] = { ...record, status: 'confirmed', block: fate.landed };
        save();
    }

    const { checks, passed, ...facts } = await judge(ctx, record);
    for (const check of checks) {
        log(line(label, `${check.passed ? 'ok' : 'NOT'}  ${check.text}`));
    }
    record = state.steps[id] = { ...record, ...facts, status: passed ? 'passed' : 'failed' };
    save();
    if (!passed) {
        const reason = checks.find(check => !check.passed).text;
        log(line(label, `failed: ${reason}`));
        throw stop(`failed: ${reason}. Its transaction is on the chain; the run stops here, and a rerun judges it again (it builds nothing new)`);
    }
    log(line(label, 'passed'));
    return record;
};

// Step 2: the mint `walletSigned` (A's witness, not the server's) submitted; the node must
// refuse it. It is recorded before the submit like any transaction: unless the provider refused
// it (a 4xx), it may be on the chain, and a rerun looks for it before it builds a mint
// (settleUnsigned). If the node took it, the release must stop.
const unsignedStep = async (ctx, walletSigned, built, player) => {
    const { client, log, state, save, serverKey, now } = ctx;
    const label = LABEL.unsigned;
    log(line(label, TITLE.unsigned));
    const base = { txId: built.bodyHash, ttl: built.ttl, seed: built.seed, replaced: replacedOf(state.steps.unsigned) };
    const signers = mintSignersCheck({ cbor: walletSigned, serverKeyHash: serverKey.keyHash, player });
    log(line(label, `${signers.passed ? 'ok' : 'NOT'}  ${signers.text}`));
    if (!signers.passed) {
        state.steps.unsigned = { ...base, status: 'failed', text: signers.text };
        save();
        throw new ScriptError(`${label} failed: ${signers.text}; nothing is submitted`);
    }
    ctx.gate(label, walletSigned);
    state.steps.unsigned = { ...base, status: 'submitted', submittedAt: now().toISOString() };
    save();
    let outcome;
    try {
        outcome = { accepted: await client.submit(walletSigned) };
    } catch (error) {
        outcome = { error };
    }
    const verdict = unsignedVerdict({ outcome, serverKeyHash: serverKey.keyHash, playerKeyHash: player.keyHash });
    if (verdict.accepted) {
        state.steps.unsigned = { ...state.steps.unsigned, status: 'accepted', text: verdict.text };
        save();
        log(line(label, `ACCEPTED: ${verdict.text}`));
        throw stopTheRelease(built.bodyHash);
    }
    // a refusal (a 4xx) reached nothing; any other failure may have reached the chain
    const reachedNothing = verdict.passed || outcome.error?.refused === true;
    state.steps.unsigned = { ...state.steps.unsigned, status: verdict.passed ? 'passed' : reachedNothing ? 'failed' : 'submitted', text: verdict.text };
    save();
    log(line(label, `${verdict.passed ? 'passed' : 'failed'}: ${verdict.text}`));
    if (!verdict.passed) {
        throw new ScriptError(
            reachedNothing
                ? `${label} failed: ${verdict.text}`
                : `${label} failed: ${verdict.text}. As no refusal came, it may have reached the chain without the server's signature (tx ${built.bodyHash}  ${explorerUrl(built.bodyHash)}): run the script again later (the same --run-dir); the rerun looks for it before it builds anything`
        );
    }
};

// Before the first mint is built: a step 2 that may be on the chain is looked for. In a block (or
// taken by the node) it stops the release; still valid, the run waits or stops; expired with its
// seed unspent, step 2 runs again; with its seed spent, the run stops (a new mint could be a
// second item).
const settleUnsigned = async (ctx, player) => {
    const { log, state, save } = ctx;
    const label = LABEL.unsigned;
    const record = state.steps.unsigned;
    if (record?.status === 'accepted') {
        throw stopTheRelease(record.txId);
    }
    if (record?.status !== 'submitted') {
        return;
    }
    const fate = await settle(ctx, label, record, { wait: !ctx.dryRun });
    const accepted = () => {
        state.steps.unsigned = { ...record, status: 'accepted', block: fate.landed ?? null };
        save();
        log(line(label, `ACCEPTED: tx ${record.txId} is in block ${fate.landed}`));
        return stopTheRelease(record.txId);
    };
    if (fate.landed !== undefined) {
        throw accepted();
    }
    if (fate.pending) {
        if (ctx.dryRun) {
            log(`dry run: ${label}'s tx ${record.txId} is in no block yet; a run waits for it`);
            throw new DryRunStop();
        }
        throw new ScriptError(`${label} stops: tx ${record.txId} is in no block yet and valid until slot ${record.ttl}: run the script again later (the same --run-dir); it then looks again`);
    }
    const decision = await seedFateOf(ctx, player, record.seed, unsignedAttemptsOf(record));
    if (decision.landed) {
        state.steps.unsigned = acceptedUnsigned(record, decision.landed.attempt, decision.landed.block);
        save();
        throw stopTheRelease(decision.landed.attempt.txId);
    }
    if (decision.lost) {
        throw seedSpentElsewhere(label, record.seed, record.txId);
    }
    log(line(label, `tx ${record.txId} is in no block and expired (valid until slot ${record.ttl}, the tip is at slot ${fate.tip.slot}); its seed ${record.seed} is unspent: it never reached the chain; step 2 runs again`));
    state.steps.unsigned = { ...record, status: 'expired' };
    save();
};

// The mint of ITEM for `player` (steps 1 to 3 with `unsigned`, else step 6a)
const mintStep = (ctx, id, player, { unsigned }) =>
    txStep(ctx, id, {
        // the first mint is announced as step 1, and as step 3 once step 2 has passed
        announce: () => ctx.log(line(LABEL[unsigned ? 'build' : id], TITLE[unsigned ? 'build' : id])),
        prepare: () => (unsigned ? settleUnsigned(ctx, player) : undefined),
        // an expired mint is built anew only while its seed is unspent; the step 2 attempts that may
        // have reached the chain count among those that may have spent it (the one that did stops
        // the release)
        onExpired: async record => {
            const steps = ctx.state.steps;
            // a step 2 the node took stops this run directory for good
            if (unsigned && steps.unsigned?.status === 'accepted') {
                throw stopTheRelease(steps.unsigned.txId);
            }
            const mayHaveLanded = unsigned ? unsignedAttemptsOf(steps.unsigned) : [];
            const ours = [record, ...(record.replaced ?? [])];
            const decision = await seedFateOf(ctx, player, record.seed, [...ours, ...mayHaveLanded.filter(attempt => !ours.some(other => other.txId === attempt.txId))]);
            if (decision.landed && !ours.includes(decision.landed.attempt)) {
                steps.unsigned = acceptedUnsigned(steps.unsigned, decision.landed.attempt, decision.landed.block);
                ctx.save();
                throw stopTheRelease(decision.landed.attempt.txId);
            }
            return decision;
        },
        build: async () => {
            const { client, log, state, save, contracts, params, serverKey, network, now } = ctx;
            const [utxos, tip] = await Promise.all([client.utxosAt(player.address), client.tip()]);
            const serial = Math.floor(now().getTime() / 1000);
            let built;
            try {
                const owner = ownerOf({ utxos, subject: player.subject, network });
                built = await buildMint({ item: { key: ITEM, serial }, fee: 0, owner, utxos, params, tip, contracts, serverKeyHash: serverKey.keyHash });
            } catch (error) {
                const refusal = refusalOf(error, `the mint for player ${player.name}`, player);
                if (unsigned) {
                    state.steps.build = { status: 'failed', reason: refusal.message };
                    save();
                }
                throw refusal;
            }
            log(
                line(
                    LABEL[unsigned ? 'build' : id],
                    `built tx ${built.bodyHash}: ${ITEM} serial ${serial}, network fee ${built.networkFee} (estimate ${chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE}), deposit ${built.deposit} (estimate ${chain.MINT_DEPOSIT_ESTIMATE_LOVELACE}), game fee ${built.gameFee.paid}, valid until slot ${built.ttl}`
                )
            );
            const walletSigned = signedByPlayer(built, player);
            if (unsigned) {
                state.steps.build = { status: 'passed', txId: built.bodyHash };
                save();
                await unsignedStep(ctx, walletSigned, built, player);
                log(line(LABEL[id], TITLE[id]));
            }
            return {
                cbor: addServerWitness({ cbor: walletSigned, bodyHash: built.bodyHash, key: serverKey }).cbor,
                txId: built.bodyHash,
                ttl: built.ttl,
                facts: {
                    item: ITEM,
                    tier: Items[ITEM].tier,
                    serial,
                    seed: built.seed,
                    assetName: built.assetName,
                    networkFee: built.networkFee,
                    deposit: built.deposit,
                    deposits: built.deposits,
                    gameFee: built.gameFee,
                },
            };
        },
        judge: async (_ctx, record) => {
            const { client, contracts, params } = ctx;
            const [userHolder, store, treasuryOutputs] = await Promise.all([
                client.utxoByUnit(contracts.policyId + record.assetName.user),
                client.utxoByUnit(contracts.policyId + record.assetName.reference),
                client.utxosAt(contracts.treasuryAddress),
            ]);
            return mintVerdict({ record, player, contracts, reads: { userHolder, store, treasuryOutputs }, coinsPerUtxoByte: params.coinsPerUtxoByte });
        },
    });

// Step 4: A sends the user token of the first mint to B
const transferStep = ctx =>
    txStep(ctx, 'transfer', {
        build: async () => {
            const { client, state, contracts, params, network, players } = ctx;
            const unit = contracts.policyId + state.steps.mint.assetName.user;
            const [utxos, tip] = await Promise.all([client.utxosAt(players.a.address), client.tip()]);
            const built = await buildTransfer({ from: players.a, to: players.b, utxos, unit, params, tip, network });
            return { cbor: signWith(built.cbor, { privateKey: players.a.paymentKey }), txId: built.txId, ttl: built.ttl, facts: { fee: built.fee, unit } };
        },
        judge: async (_ctx, record) => transferVerdict({ record, to: ctx.players.b, reads: { userHolder: await ctx.client.utxoByUnit(record.unit) } }),
    });

// Steps 5 and 6b: `holder` burns the item of the mint step `from`, with the server or alone
const burnStep = (ctx, id, holder, { from, serverSigns }) =>
    txStep(ctx, id, {
        build: async () => {
            const { client, state, contracts, params, serverKey, network } = ctx;
            const { assetName } = state.steps[from];
            const [utxos, tip, store] = await Promise.all([client.utxosAt(holder.address), client.tip(), client.utxoByUnit(contracts.policyId + assetName.reference)]);
            if (!store) {
                throw new ScriptError(`${LABEL[id]}: the reference token of the item is in no UTxO`);
            }
            let built;
            let owner;
            try {
                owner = ownerOf({ utxos, subject: holder.subject, network });
                built = await buildBurn({ assetName: assetName.user, holder: owner, utxos, reference: store, params, tip, contracts, serverKeyHash: serverSigns ? serverKey.keyHash : null });
            } catch (error) {
                throw refusalOf(error, `the burn for player ${holder.name}`, holder);
            }
            const signed = signedByPlayer(built, holder);
            const cbor = serverSigns ? addServerWitness({ cbor: signed, bodyHash: built.bodyHash, key: serverKey }).cbor : signed;
            return {
                cbor,
                txId: built.bodyHash,
                ttl: built.ttl,
                facts: {
                    assetName,
                    holder: holder.name,
                    holderKeyHash: owner.keyHash,
                    holderAddress: owner.address,
                    serverSigns,
                    networkFee: built.networkFee,
                    deposits: built.deposits,
                    back: backOf({ cbor: built.cbor, utxos: [...utxos, store] }),
                    // what the body submitted names and carries: what the verdict holds it to
                    requiredSigners: requiredSignersOf(cbor),
                    witnesses: witnessesOf(cbor),
                },
            };
        },
        judge: async (_ctx, record) => {
            const { client, contracts } = ctx;
            const [userHolder, store, backOutputs] = await Promise.all([
                client.utxoByUnit(contracts.policyId + record.assetName.user),
                client.utxoByUnit(contracts.policyId + record.assetName.reference),
                client.utxosAt(record.holderAddress),
            ]);
            return burnVerdict({ record, reads: { userHolder, store, backOutputs }, serverKeyHash: ctx.serverKey.keyHash });
        },
    });

// The tip, asked of `client` every `interval` ms until it is at block `block` or `timeout` ms have
// passed (then the last one)
const waitForTip = async ({ client, block, timeout, interval = BLOCK_MS, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) => {
    for (let waited = 0; ; waited += interval) {
        const tip = await client.tip();
        if (tip.block >= block || waited + interval > timeout) {
            return tip;
        }
        await sleep(interval);
    }
};

// Step 7: the burns of steps 5 and 6b as the server's credit step judges them (creditVerdict),
// once the later one is CHAIN_K_FINAL blocks deep. It submits nothing; a step that did not pass is
// judged again by a rerun. A tip that does not get there within creditWaitMs stops the run (a
// rerun waits again).
const CREDITED = [
    ['burn', 'b'],
    ['holderBurn', 'a'],
];
const creditStep = async ctx => {
    const { client, contracts, log, state, save, sleep, kFinal, players } = ctx;
    const label = LABEL.credit;
    if (state.steps.credit?.status === 'passed') {
        log(line(label, 'passed already'));
        return;
    }
    log(line(label, `${TITLE.credit} (CHAIN_K_FINAL ${kFinal})`));
    const burns = CREDITED.map(([id, player]) => ({ id, record: state.steps[id], player: players[player] }));
    const due = Math.max(...burns.map(({ record }) => record.block)) + kFinal;
    let tip = await client.tip();
    if (tip.block < due) {
        if (ctx.dryRun) {
            log(`dry run: ${label} waits until the tip reaches block ${due} (it is at block ${tip.block}); a run waits for it`);
            throw new DryRunStop();
        }
        const timeout = creditWaitMs(kFinal);
        log(line(label, `waiting until the tip reaches block ${due}, ${kFinal} blocks past the later burn (it is at block ${tip.block}; up to ${Math.ceil(timeout / 60_000)} minutes) …`));
        tip = await waitForTip({ client, block: due, timeout, ...(sleep ? { sleep } : {}) });
        if (tip.block < due) {
            state.steps.credit = { status: 'waiting', kFinal, due };
            save();
            throw new ScriptError(
                `${label} stops: the tip is at block ${tip.block}, and both burns are ${kFinal} blocks deep at block ${due}: run the script again later (the same --run-dir); it builds nothing new`
            );
        }
    }
    const reads = await Promise.all(
        burns.map(async burn => ({
            ...burn,
            block: await client.blockOf(burn.record.txId),
            userHolder: await client.utxoByUnit(contracts.policyId + burn.record.assetName.user),
        }))
    );
    const { checks, passed } = creditVerdict({ burns: reads, tip, kFinal });
    for (const check of checks) {
        log(line(label, `${check.passed ? 'ok' : 'NOT'}  ${check.text}`));
    }
    state.steps.credit = {
        status: passed ? 'passed' : 'failed',
        kFinal,
        tip: tip.block,
        burns: reads.map(({ id, record, block }) => ({ step: id, txId: record.txId, block: block ?? null, depth: block === null || block === undefined ? null : tip.block - block })),
    };
    save();
    if (!passed) {
        const reason = checks.find(check => !check.passed).text;
        log(line(label, `failed: ${reason}`));
        throw new ScriptError(`${label} failed: ${reason}. A rerun judges it again (it builds nothing new)`);
    }
    log(line(label, "the credit itself (the ingredients in the player's pantry) needs the server and its index: check it in the game"));
    log(line(label, 'passed'));
};

const runSteps = async ctx => {
    const { players } = ctx;
    await mintStep(ctx, 'mint', players.a, { unsigned: true });
    await transferStep(ctx);
    await burnStep(ctx, 'burn', players.b, { from: 'mint', serverSigns: true });
    await mintStep(ctx, 'mint2', players.a, { unsigned: false });
    await burnStep(ctx, 'holderBurn', players.a, { from: 'mint2', serverSigns: false });
    await creditStep(ctx);
};

// ---------------------------------------------------------------------------------------------
// The script

// The contracts of the live config, checked for what the run proves: the server key is one of
// the config's, minting is not paused, and the RARE fee goes to the treasury.
const liveContracts = async ({ client, blueprint, deployment, deploymentFile, network, serverKey }) => {
    let contracts;
    try {
        contracts = await readConfig({ provider: client, blueprint, policyId: deployment.policyId, network, configPolicyId: deployment.configPolicyId });
    } catch (error) {
        if (error instanceof ChainConfigError) {
            throw new ScriptError(`the config of the deployment in ${deploymentFile} cannot be read from the chain: ${error.code}`);
        }
        throw error;
    }
    const { config } = contracts;
    if (!config.serverKeys.includes(serverKey.keyHash)) {
        throw new ScriptError(`the server key ${serverKey.keyHash} is not a server key of the config (its server keys: ${config.serverKeys.join(', ')}): give the key whose hash deploy.js was given`);
    }
    if (config.paused) {
        throw new ScriptError('the config is paused: resume it first (update-config.js --resume)');
    }
    const fee = gameFeeOf(config, { tier: chain.TIER_ORDER.indexOf(Items[ITEM].tier), fee: 0 });
    if (!fee || fee.asset !== 'lovelace' || !fee.payments.some(payment => payment.address === contracts.treasuryAddress && payment.amount > 0)) {
        throw new ScriptError(`the config's first fee option pays no ADA to the treasury ${contracts.treasuryAddress} for a ${Items[ITEM].tier} item: the run proves that fee output`);
    }
    return contracts;
};

// CHAIN_K_FINAL as the API reads it (a whole number from 1 to K_FINAL_MAX), K_FINAL_PREPROD when
// it is not set
const kFinalOf = env => {
    const value = env.CHAIN_K_FINAL;
    if (value === undefined || value === '') {
        return K_FINAL_PREPROD;
    }
    const kFinal = Number(value);
    if (!/^\d+$/.test(value) || kFinal < 1 || kFinal > K_FINAL_MAX) {
        throw new ScriptError(`CHAIN_K_FINAL must be a whole number from 1 to ${K_FINAL_MAX} (the server's value), or not set (${K_FINAL_PREPROD})`);
    }
    return kFinal;
};

/**
 * The script: `argv` and `env` as above; `client` (providerFromEnv's shape) and the other
 * arguments are for the tests.
 */
const main = async ({ argv, env, log, client, deploymentFile = DEPLOYMENT_FILE, blueprintFile = BLUEPRINT_FILE, now = () => new Date(), sleep }) => {
    const network = networkFromEnv(env);
    const args = argsOf(argv, OPTIONS);
    if (!args['player-a'] || !args['player-b'] || !args['server-key'] || !args['run-dir']) {
        throw new ScriptError(USAGE);
    }
    const dryRun = args['dry-run'];
    const kFinal = kFinalOf(env);
    if (!fs.existsSync(deploymentFile)) {
        throw new ScriptError(`no deployment record at ${deploymentFile}: deploy first (deploy.js), and confirm it`);
    }
    const blueprint = loadBlueprint(blueprintFile);
    const deployment = deploymentOf(deploymentFile, blueprint, network);
    if (env.CHAIN_POLICY_ID && env.CHAIN_POLICY_ID !== deployment.policyId) {
        throw new ScriptError(`CHAIN_POLICY_ID is ${env.CHAIN_POLICY_ID}, but ${deploymentFile} records the items policy ${deployment.policyId}: the run tests the recorded deployment; unset CHAIN_POLICY_ID or make it match`);
    }
    const serverKey = loadKey(args['server-key']);
    const players = {
        a: { ...loadWallet(args['player-a'], network, '--player-a'), name: 'A' },
        b: { ...loadWallet(args['player-b'], network, '--player-b'), name: 'B' },
    };
    if (players.a.keyHash === players.b.keyHash || players.a.stakeKeyHash === players.b.stakeKeyHash) {
        throw new ScriptError('--player-a and --player-b are the same wallet: give two wallets');
    }
    if ([players.a.keyHash, players.b.keyHash].includes(serverKey.keyHash)) {
        throw new ScriptError("--server-key is a player's key: give the server key (preprod-server.sk)");
    }

    const stateFile = path.join(args['run-dir'], STATE_FILE);
    const identity = identityOf({ network, deployment, serverKey, players });
    const earlier = readState(stateFile);
    if (earlier && !sameRun(earlier, identity)) {
        throw new ScriptError(`${stateFile} is the run of other wallets, another server key or another deployment: give the files it began with, or name a new --run-dir for a new run`);
    }
    const state = earlier ?? { version: 1, ...identity, createdAt: now().toISOString(), steps: {} };
    const save = dryRun ? () => {} : () => writeState(stateFile, state);

    const chainClient = client ?? providerFromEnv(env);
    const contracts = await liveContracts({ client: chainClient, blueprint, deployment, deploymentFile, network, serverKey });
    const configRef = outRef(contracts.configUtxo);
    log(labelled('items policy', `${contracts.policyId}  (${deploymentFile})`));
    log(labelled('config', `${configRef}  (where the config NFT is)`));
    if (env.CHAIN_CONFIG_REF && env.CHAIN_CONFIG_REF !== configRef) {
        log(`note: CHAIN_CONFIG_REF=${env.CHAIN_CONFIG_REF} is out of date; the config is at ${configRef}`);
    }
    log(labelled('treasury', contracts.treasuryAddress));
    log(labelled('server key', serverKey.keyHash));
    for (const player of Object.values(players)) {
        const utxos = await chainClient.utxosAt(player.address);
        const lovelace = utxos.reduce((sum, entry) => sum + lovelaceOf(entry), 0n);
        log(labelled(`player ${player.name}`, `${player.address}  ${player.subject}  ${lovelace} lovelace in ${utxos.length} UTxO(s)`));
    }
    log(labelled('run state', earlier ? `${stateFile} (resumed)` : dryRun ? `${stateFile} (a dry run writes nothing)` : stateFile));

    const ctx = {
        client: chainClient,
        log,
        sleep,
        now,
        network,
        contracts,
        params: await chainClient.params(),
        serverKey,
        players,
        state,
        save,
        dryRun,
        kFinal,
        // a dry run stops before the first submit, with the transaction shown
        gate: (label, cbor) => {
            if (dryRun) {
                describeTx(cbor).forEach(text => log(text));
                log(`dry run: ${label} would submit tx ${txIdOf(cbor)} now; nothing is submitted`);
                throw new DryRunStop();
            }
        },
    };
    try {
        await runSteps(ctx);
    } catch (error) {
        if (error instanceof DryRunStop) {
            const next = STEPS.filter(([id]) => state.steps[id]?.status !== 'passed').map(([, label, title]) => `${label} ${title}`);
            log(`dry run: a run goes on from here: ${next.join('; ')}`);
            return;
        }
        summaryOf(state).lines.forEach(text => log(text));
        throw error;
    }
    const summary = summaryOf(state);
    summary.lines.forEach(text => log(text));
    if (!summary.passed) {
        throw new ScriptError('not every step passed: see the summary');
    }
};

module.exports = {
    OPTIONS,
    STATE_FILE,
    EXPIRY_MARGIN_SLOTS,
    loadWallet,
    walletWitnessOf,
    buildTransfer,
    backOf,
    unsignedVerdict,
    mintSignersCheck,
    mintVerdict,
    transferVerdict,
    burnVerdict,
    creditVerdict,
    fateOf,
    summaryOf,
    main,
};

if (require.main === module) {
    runScript(main);
}
