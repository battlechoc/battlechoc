// Cardano chain fixtures for tests: protocol parameters, keys, UTxOs and a wallet's witnesses,
// all offline. Keys are derived from fixed labels (sha256(label)); they are never funded.

const fs = require('fs');
const path = require('path');
const { sha256 } = require('@noble/hashes/sha2.js');
const {
    Address,
    Assets,
    InlineDatum,
    KeyHash,
    PrivateKey,
    Transaction,
    TransactionBody,
    TransactionHash,
    TransactionWitnessSet,
    UTxO,
} = require('@evolution-sdk/evolution');

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
 * witness per key over the body hash, nothing else.
 */
const walletWitness = (cborHex, privateKeys) => {
    const bodyHash = TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cborHex, 'hex')));
    const witnesses = privateKeys.map(
        privateKey =>
            new TransactionWitnessSet.VKeyWitness({
                vkey: PrivateKey.toPublicKey(privateKey),
                signature: PrivateKey.sign(privateKey, TransactionHash.toBytes(bodyHash)),
            })
    );
    return TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses(witnesses));
};

module.exports = { TIP, loadParams, fixtureKey, utxo, walletWitness };
