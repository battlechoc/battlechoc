// The chain double's reader of real transactions: describeTx(cborHex) → the double's
// TxDescription (test/chainDouble.js) of a Cardano transaction as plan B's tx.js builds it, signed
// or not, read with the Evolution SDK. Hand it to createChainDouble({ describeTx }) or
// createChainApp({ describeTx }) (whose default it is for what is not the helper's JSON). Plain
// node, no Jest: the browser tests' API (test/e2eServer.js) may use it too.
//
// What it says, and what it leaves out (the double does not need it):
// - `txHash`: the hash of the body's bytes as written (what the node and the wallet sign);
// - `ttlSlot`: the body's ttl (invalid_hereafter, exclusive), null without one; a validity start
//   is not read;
// - `inputs`: the spent inputs, in the body's order. Reference inputs are only read and the
//   collateral is only spent when a script fails, so neither is an input here (a transaction
//   whose scripts fail, is_valid false, is described as if they passed);
// - `outputs`, in order: { address (bech32), lovelace, assets: { unit: quantity }, inlineDatum
//   (CBOR hex of the Plutus data) when it has one, referenceScript: { type, cbor } when it has
//   one }. A datum hash is not described;
// - `mint`: { unit: quantity } of every policy, negative for a burn.
// Anything that is no transaction throws (the double then rejects the submit).

const { Address, AssetName, Assets, Data, InlineDatum, NativeScripts, PolicyId, Script, Transaction, TransactionBody, TransactionHash } = require('@evolution-sdk/evolution');

const HEX = /^(?:[0-9a-fA-F]{2})+$/;
const hex = bytes => Buffer.from(bytes).toString('hex');

// the tokens of `assets` as { policy hex + name hex: quantity as text }
const unitsOf = assets => Object.fromEntries(Assets.flatten(assets).map(([policy, name, quantity]) => [PolicyId.toHex(policy) + AssetName.toHex(name), quantity.toString()]));

// a reference script as the double's provider reads one back: Blockfrost's type and the bytes
// the SDK holds (the flat script of a Plutus script, the CBOR of a native one)
const PLUTUS_TYPES = { PlutusV1: 'plutusV1', PlutusV2: 'plutusV2', PlutusV3: 'plutusV3' };
const referenceScriptOf = scriptRef => {
    const script = Script.fromCBOR(scriptRef.bytes);
    if (script._tag === 'NativeScript') {
        return { type: 'timelock', cbor: NativeScripts.toCBORHex(script) };
    }
    if (!PLUTUS_TYPES[script._tag]) {
        throw new TypeError(`a reference script of an unknown kind: ${script._tag}`);
    }
    return { type: PLUTUS_TYPES[script._tag], cbor: hex(script.bytes) };
};

const outputOf = output => ({
    address: Address.toBech32(output.address),
    lovelace: Assets.lovelaceOf(output.assets).toString(),
    assets: unitsOf(output.assets),
    ...(output.datumOption instanceof InlineDatum.InlineDatum ? { inlineDatum: Data.toCBORHex(output.datumOption.data) } : {}),
    ...(output.scriptRef ? { referenceScript: referenceScriptOf(output.scriptRef) } : {}),
});

const mintOf = mint =>
    mint
        ? Object.fromEntries(
              [...mint.map.entries()].flatMap(([policy, names]) => [...names.entries()].map(([name, quantity]) => [PolicyId.toHex(policy) + AssetName.toHex(name), quantity.toString()]))
          )
        : {};

/** The TxDescription of the transaction `cborHex` (signed or not); throws for anything else. */
const describeTx = cborHex => {
    if (typeof cborHex !== 'string' || !HEX.test(cborHex)) {
        throw new TypeError('a transaction is CBOR in hex');
    }
    const { body } = Transaction.fromCBORHex(cborHex);
    return {
        txHash: TransactionHash.toHex(TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cborHex, 'hex')))),
        ttlSlot: body.ttl === undefined ? null : Number(body.ttl),
        inputs: body.inputs.map(input => ({ txHash: TransactionHash.toHex(input.transactionId), index: Number(input.index) })),
        outputs: body.outputs.map(outputOf),
        mint: mintOf(body.mint),
    };
};

module.exports = { describeTx };
