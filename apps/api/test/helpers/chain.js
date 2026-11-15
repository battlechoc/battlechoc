// Cardano chain fixtures for tests: protocol parameters, keys, UTxOs, a wallet's witnesses and the
// contracts of a preprod deployment, all offline. Keys are derived from fixed labels (sha256(label));
// they are never funded.

const fs = require('fs');
const path = require('path');
const { blake2b } = require('@noble/hashes/blake2.js');
const { sha256 } = require('@noble/hashes/sha2.js');
const {
    Address,
    Assets,
    CBOR,
    InlineDatum,
    KeyHash,
    PrivateKey,
    Redeemers,
    ScriptDataHash,
    Transaction,
    TransactionBody,
    TransactionHash,
    TransactionWitnessSet,
    UTxO,
    VKey,
} = require('@evolution-sdk/evolution');
const CostModel = require('@evolution-sdk/evolution/CostModel');
const {
    Networks: { preprod },
} = require('@battlechoc/battlechoc-shared-functions').cardano;
const { CONFIG_TOKEN_NAME, loadBlueprint, configScript, itemsScript, treasuryScript, scriptAddress, encodeConfigDatum, contractsFor } = require('../../src/chain/blueprint');

const PARAMS_FILE = path.join(__dirname, '..', 'fixtures', 'chain', 'preprod-params.json');

// the fields of Provider.ProtocolParameters that are bigints (the fixture stores them as strings)
const BIGINT_PARAMS = ['keyDeposit', 'poolDeposit', 'drepDeposit', 'govActionDeposit', 'maxTxExMem', 'maxTxExSteps', 'coinsPerUtxoByte'];

/** The chain tip the tests build against (1 slot = 1 s on preprod). */
const TIP = { slot: 80_000_000, block: 3_000_000 };

/** Preprod protocol parameters (Provider.ProtocolParameters) from the fixture. */
const loadParams = () => {
    const stored = JSON.parse(fs.readFileSync(PARAMS_FILE, 'utf8'));
    return { ...stored, ...Object.fromEntries(BIGINT_PARAMS.map(name => [name, BigInt(stored[name])])) };
};

/**
 * The key of `label` on preprod: { privateKey, keyHash (hex), enterpriseAddress (bech32),
 * baseAddress(stakeLabel) (bech32, with the key of `stakeLabel` as the stake part) }.
 */
const fixtureKey = label => {
    const privateKey = PrivateKey.fromBytes(sha256(Buffer.from(label, 'utf8')));
    const hash = KeyHash.fromVKey(PrivateKey.toPublicKey(privateKey));
    return {
        privateKey,
        keyHash: KeyHash.toHex(hash),
        enterpriseAddress: Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: hash })),
        baseAddress: stakeLabel =>
            Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: hash, stakingCredential: KeyHash.fromHex(fixtureKey(stakeLabel).keyHash) })),
    };
};

/**
 * A UTxO at `address` (bech32) holding `lovelace` and `tokens` ({ policyHex + nameHex: quantity }),
 * with an inline `datum` (Plutus data) and a `scriptRef` (a Script) if given.
 */
const utxo = ({ address, lovelace, tokens = {}, txId, index, datum, scriptRef }) =>
    new UTxO.UTxO({
        transactionId: TransactionHash.fromHex(txId),
        index: BigInt(index),
        address: Address.fromBech32(address),
        assets: Assets.fromRecord({ lovelace: BigInt(lovelace), ...tokens }),
        datumOption: datum === undefined ? undefined : new InlineDatum.InlineDatum({ data: datum }),
        scriptRef,
    });

/**
 * What a CIP-30 wallet answers to signTx(cborHex, true): a witness set (CBOR hex) with one vkey
 * witness per key over the body hash, nothing else. Wallets write the vkey witnesses in either
 * form of a CDDL set: by default as the SDK does, tagged (`a100d90102…`, tag 258), with
 * `tagged: false` as a plain array (`a10081…`).
 */
const walletWitness = (cborHex, privateKeys, { tagged = true } = {}) => {
    const bodyHash = TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cborHex, 'hex')));
    const witnesses = privateKeys.map(
        privateKey =>
            new TransactionWitnessSet.VKeyWitness({
                vkey: PrivateKey.toPublicKey(privateKey),
                signature: PrivateKey.sign(privateKey, TransactionHash.toBytes(bodyHash)),
            })
    );
    if (tagged) {
        return TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses(witnesses));
    }
    const vkeys = witnesses.map(({ vkey, signature }) => [VKey.toBytes(vkey), signature.bytes]);
    return CBOR.toCBORHex(new Map([[0n, vkeys]]), CBOR.CANONICAL_OPTIONS);
};

const hex = bytes => Buffer.from(bytes).toString('hex');

/**
 * The script data hash of a transaction (CBOR hex), recomputed as the node does: blake2b-256 of
 * the redeemers' bytes as they stand in the witness set ‖ the language views { 2: V3 costs of
 * `params` } (no witness datums: the datums are inline; no V1 or V2 view: no such script is
 * used). `redeemerBytes` are the redeemers encoded in the form they were decoded from (map or
 * array); `written` says whether exactly these bytes are in the transaction, so a re-encoding
 * shows.
 */
const scriptDataOf = (cborHex, params) => {
    const { body, witnessSet } = Transaction.fromCBORHex(cborHex);
    const { redeemers } = witnessSet;
    const redeemerBytes = redeemers._tag === 'RedeemerMap' ? Redeemers.toCBORBytesMap(redeemers) : Redeemers.toCBORBytes(redeemers);
    const v3Costs = Object.values(params.costModels.PlutusV3).map(BigInt);
    const languageViews = CBOR.toCBORBytes(new Map([[2n, v3Costs]]), CBOR.CANONICAL_OPTIONS);
    return {
        declared: ScriptDataHash.toHex(body.scriptDataHash),
        computed: hex(blake2b(Buffer.concat([redeemerBytes, languageViews]), { dkLen: 32 })),
        redeemerBytes: hex(redeemerBytes),
        written: cborHex.includes(hex(redeemerBytes)),
        witnessDatums: witnessSet.plutusData ?? [],
    };
};

// A decimal parameter (priceMem, priceStep) as an exact fraction [numerator, denominator]
const fraction = number => {
    const text = String(number);
    if (!/^\d+(\.\d+)?$/.test(text)) {
        throw new Error(`not a plain decimal: ${text}`);
    }
    const [whole, decimals = ''] = text.split('.');
    return [BigInt(whole + decimals), 10n ** BigInt(decimals.length)];
};

/**
 * The ledger's minimum fee of a signed transaction (CBOR hex) under `params`: minFeeA × size +
 * minFeeB + ⌈priceMem × mem + priceStep × steps⌉ of its redeemers (no reference scripts), as a
 * bigint.
 */
const ledgerMinimumFeeOf = (cborHex, params) => {
    const redeemers = Transaction.fromCBORHex(cborHex).witnessSet.redeemers.toArray();
    const mem = redeemers.reduce((sum, redeemer) => sum + redeemer.exUnits.mem, 0n);
    const steps = redeemers.reduce((sum, redeemer) => sum + redeemer.exUnits.steps, 0n);
    const [memN, memD] = fraction(params.priceMem);
    const [stepN, stepD] = fraction(params.priceStep);
    const numerator = memN * mem * stepD + stepN * steps * memD;
    const denominator = memD * stepD;
    const scripts = (numerator + denominator - 1n) / denominator;
    return BigInt(params.minFeeA) * BigInt(cborHex.length / 2) + BigInt(params.minFeeB) + scripts;
};

/** The cost models of `params`, as the builder hands them to the evaluator. */
const costModelsOf = ({ costModels }) =>
    new CostModel.CostModels({
        PlutusV1: new CostModel.CostModel({ costs: Object.values(costModels.PlutusV1).map(BigInt) }),
        PlutusV2: new CostModel.CostModel({ costs: Object.values(costModels.PlutusV2).map(BigInt) }),
        PlutusV3: new CostModel.CostModel({ costs: Object.values(costModels.PlutusV3).map(BigInt) }),
    });

// The deployment of fixtureContracts: the blueprint (loaded once) with the config policy of the
// seed CONFIG_SEED, its items policy and treasury.
const CONFIG_SEED = 'aa'.repeat(32) + '#0';
let deployment;
const fixtureDeployment = () => {
    if (!deployment) {
        const blueprint = loadBlueprint();
        const configPolicyId = configScript(blueprint, CONFIG_SEED).policyId;
        deployment = {
            blueprint,
            configPolicyId,
            policyId: itemsScript(blueprint, configPolicyId).policyId,
            treasuryAddress: scriptAddress(treasuryScript(blueprint, configPolicyId).hash, preprod),
        };
    }
    return deployment;
};

/** A team's wallet on preprod (a base address), for fee options with a second receiver. */
const TEAM_ADDRESS = fixtureKey('team').baseAddress('team-stake');

/** The preprod fee: one ADA option, 1, 2 or 4 ADA by tier, all of it to the treasury. */
const preprodFees = () => [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: fixtureDeployment().treasuryAddress, share: 1 }] }];

/**
 * The contracts of a preprod deployment (contractsFor): the real blueprint, the config policy of
 * the seed 'aa…aa#0', and the config UTxO at the config address with an inline config datum. The
 * server key is fixtureKey('server')'s unless `serverKeys` says otherwise; `fees` default to the
 * preprod fee.
 */
const fixtureContracts = ({ paused = false, serverKeys = [fixtureKey('server').keyHash], fees = preprodFees() } = {}) => {
    const { blueprint, configPolicyId, policyId } = fixtureDeployment();
    const configUtxo = utxo({
        address: scriptAddress(configPolicyId, preprod),
        lovelace: 2_000_000n,
        tokens: { [configPolicyId + CONFIG_TOKEN_NAME]: 1n },
        txId: 'cf'.repeat(32),
        index: 0,
        datum: encodeConfigDatum({ serverKeys, admins: [fixtureKey('admin').keyHash], threshold: 1, paused, fees }),
    });
    return contractsFor({ blueprint, configUtxo, policyId, network: preprod });
};

module.exports = { TIP, TEAM_ADDRESS, loadParams, fixtureKey, utxo, walletWitness, scriptDataOf, costModelsOf, ledgerMinimumFeeOf, fixtureContracts };
