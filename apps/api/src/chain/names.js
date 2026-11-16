// An item's names on chain and its CIP-68 datum. Both asset names are a CIP-67 label followed by
// the same 28-byte suffix: blake2b-224 of the seed (the output reference the mint spends) as
// Aiken's cbor.serialise writes it (contracts/lib/battlechoc/names.ak), so the items validator
// recomputes exactly these names.

const { blake2b } = require('@noble/hashes/blake2.js');
const { CBOR, Data, TransactionHash } = require('@evolution-sdk/evolution');
const { chain } = require('@battlechoc/battlechoc-shared-functions');

const OUT_REF = /^([0-9a-f]{64})#(\d+)$/;

const utf8 = string => Data.bytearray(Buffer.from(string, 'utf8').toString('hex'));

/** The output reference 'txid#index' as Plutus data (Aiken's `OutputReference`). */
const outRefData = ref => {
    const match = typeof ref === 'string' ? OUT_REF.exec(ref) : null;
    if (!match) {
        throw new TypeError('not an output reference (txid#index)');
    }
    return Data.constr(0n, [Data.bytearray(match[1]), BigInt(match[2])]);
};

/** The output reference of an SDK UTxO: 'txid#index'. */
const outRef = utxo => `${TransactionHash.toHex(utxo.transactionId)}#${utxo.index}`;

/**
 * The names of the item a mint spending `seedRef` ('txid#index') creates, as hex: the suffix, the
 * reference token's name (label 100) and the user token's name (label 222). The CBOR must be
 * Aiken's (indefinite-length arrays, d8799f…ff): CBOR.PLUTUS_DATA_OPTIONS.
 */
const assetNamesOf = seedRef => {
    const seed = Data.toCBORBytes(outRefData(seedRef), CBOR.PLUTUS_DATA_OPTIONS);
    const suffix = Buffer.from(blake2b(seed, { dkLen: 28 })).toString('hex');
    return { suffix, reference: chain.REFERENCE_LABEL + suffix, user: chain.USER_LABEL + suffix };
};

/**
 * The datum of an item's reference token: CIP-68 version 1, `Constr 0 [metadata, 1, []]`. It can
 * never be updated, so these strings are permanent: `name` is the English item name, the image and
 * the item page are the URLs of shared/chain.js, `serial` the item's serial. Byte strings over 64
 * bytes (the description) are written in 64-byte chunks, as the ledger requires.
 */
const itemDatum = ({ item: { key, name, serial }, userAssetName }) =>
    Data.constr(0n, [
        Data.map([
            [utf8('name'), utf8(name)],
            [utf8('image'), utf8(chain.itemImageUrl(key))],
            [utf8('mediaType'), utf8('image/png')],
            [utf8('description'), utf8(`A battlechoc item. What it does today: ${chain.itemPageUrl(userAssetName)}`)],
            [utf8('item'), utf8(key)],
            [utf8('serial'), BigInt(serial)],
        ]),
        1n,
        Data.list([]),
    ]);

module.exports = { assetNamesOf, itemDatum, outRef, outRefData };
