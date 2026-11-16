// The transaction library (plan B, Task 5): proves that the Evolution SDK builds, evaluates and
// co-signs the mint of an item offline, with the real `items` validator of contracts/plutus.json.
// These tests are the reference for how src/chain/ calls the SDK: one concern per test.
//
// The mint: the owner spends a seed from their wallet, reads the config NFT from a reference
// input, mints the item's CIP-68 pair (the reference token to the items script with an inline
// datum, the user token to the owner), pays the battlechoc fee to the treasury, and is signed by
// the owner (their wallet, CIP-30) and the server.

const path = require('path');
const { execFileSync } = require('child_process');
const { blake2b } = require('@noble/hashes/blake2.js');
const {
    Address,
    AssetName,
    Assets,
    CBOR,
    Data,
    Effect,
    InlineDatum,
    KeyHash,
    Mint,
    PlutusV3,
    ScriptHash,
    Time,
    Transaction,
    TransactionBody,
    TransactionHash,
    UPLC,
    VKey,
    preprod,
} = require('@evolution-sdk/evolution');
// public subpaths of the package (its `./*` export), not in the root index
const { makeTxBuilder } = require('@evolution-sdk/evolution/sdk/builders/TransactionBuilder');
const { createAikenEvaluator } = require('@evolution-sdk/aiken-uplc');
const blueprint = require('../../../contracts/plutus.json');
const { loadParams, TIP, fixtureKey, utxo, walletWitness, scriptDataOf: scriptDataOfParams, costModelsOf } = require('./helpers/chain');

const hex = bytes => Buffer.from(bytes).toString('hex');
const text = string => Data.bytearray(Buffer.from(string, 'utf8').toString('hex'));
const outRef = input => `${TransactionHash.toHex(input.transactionId)}#${input.index}`;

// Stand-ins for the config policy and the treasury script (28 bytes each); the items policy is
// the real validator applied to the config policy.
const CONFIG_POLICY = 'c0'.repeat(28);
const TREASURY_HASH = '7e'.repeat(28);
const CONFIG_TOKEN = Buffer.from('config', 'utf8').toString('hex');
const RARE = 1n;
const FEES = [1_000_000n, 2_000_000n, 4_000_000n];
const SEED_TX = 'a1'.repeat(32);
const CONFIG_TX = 'b1'.repeat(32);

const owner = fixtureKey('owner');
const server = fixtureKey('server');
const admin = fixtureKey('admin');
const ownerAddress = owner.baseAddress('owner-stake');

const scriptAddress = hash => Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex(hash) }));

// Aiken's `Address` as Plutus data: a script credential (constructor 1) without a stake part (None)
const scriptAddressData = hash => Data.constr(0n, [Data.constr(1n, [Data.bytearray(hash)]), Data.constr(1n, [])]);

// `ConfigDatum` (contracts/lib/battlechoc/types.ak): one server key, one admin, threshold 1, not
// paused, one ADA fee option paid in full to the treasury
const configDatum = Data.constr(0n, [
    Data.list([Data.bytearray(server.keyHash)]),
    Data.list([Data.bytearray(admin.keyHash)]),
    1n,
    Data.constr(0n, []),
    Data.list([Data.constr(0n, [Data.bytearray(''), Data.bytearray(''), Data.list(FEES), Data.list([Data.list([scriptAddressData(TREASURY_HASH), 1n])])])]),
]);

// The items validator with its parameter applied. applyParamsToScript answers double CBOR; the
// ledger hashes a Plutus script in single CBOR (as the blueprint's compiledCode is).
const itemsCode = blueprint.validators.find(validator => validator.title === 'items.items.mint').compiledCode;
const appliedItems = UPLC.applyParamsToScript(itemsCode, [Data.bytearray(CONFIG_POLICY)], CBOR.PLUTUS_DATA_OPTIONS);
const itemsScript = new PlutusV3.PlutusV3({ bytes: Buffer.from(UPLC.applySingleCborEncoding(appliedItems), 'hex') });
const ITEMS_POLICY = ScriptHash.toHex(ScriptHash.fromScript(itemsScript));

// The owner's wallet: the seed (it names the item) and one more UTxO; the config NFT.
const seed = utxo({ address: ownerAddress, lovelace: 20_000_000n, txId: SEED_TX, index: 1 });
const spare = utxo({ address: ownerAddress, lovelace: 8_000_000n, txId: 'a2'.repeat(32), index: 0 });
const configUtxo = utxo({
    address: scriptAddress(CONFIG_POLICY),
    lovelace: 2_000_000n,
    tokens: { [CONFIG_POLICY + CONFIG_TOKEN]: 1n },
    txId: CONFIG_TX,
    index: 0,
    datum: configDatum,
});

// The item's names: label ‖ blake2b-224 of the seed's Plutus data CBOR (Aiken's cbor.serialise,
// indefinite constructor fields: d8799f…ff). The validator checks them, so test 7 proves it.
const seedData = Data.constr(0n, [Data.bytearray(SEED_TX), 1n]);
const SUFFIX = hex(blake2b(Data.toCBORBytes(seedData, CBOR.PLUTUS_DATA_OPTIONS), { dkLen: 28 }));
const REFERENCE_NAME = '000643b0' + SUFFIX;
const USER_NAME = '000de140' + SUFFIX;

// The reference token's CIP-68 datum: Constr 0 [metadata, 1, []]
const itemDatum = Data.constr(0n, [
    Data.map([
        [text('name'), text('Darker Walls')],
        [text('image'), text('https://battlechoc.com/items/darker-walls.png')],
        [text('mediaType'), text('image/png')],
        [text('description'), text(`A battlechoc item. What it does today: https://battlechoc.com/item/${USER_NAME}`)],
        [text('item'), text('DARKER_WALLS')],
        [text('serial'), 7n],
    ]),
    1n,
    Data.list([]),
]);

// MintItem { seed, owner, tier, fee } (types.ak `ItemAction`, constructor 0): RARE, fee option 0
const mintRedeemer = Data.constr(0n, [seedData, Data.bytearray(owner.keyHash), RARE, 0n]);

const params = loadParams();
// despite its name, `createAikenEvaluator` is the evaluator itself (an object with `evaluate`)
const evaluator = createAikenEvaluator;

// The mint, required to be signed by `signers` (the owner and the server unless told otherwise)
const buildMint = async ({ signers = [owner, server] } = {}) => {
    const builder = makeTxBuilder({ chain: preprod })
        .collectFrom({ inputs: [seed] })
        .readFrom({ referenceInputs: [configUtxo] })
        .attachScript({ script: itemsScript })
        .mintAssets({ assets: Assets.fromRecord({ [ITEMS_POLICY + REFERENCE_NAME]: 1n, [ITEMS_POLICY + USER_NAME]: 1n }), redeemer: mintRedeemer })
        .payToAddress({
            address: Address.fromBech32(scriptAddress(ITEMS_POLICY)),
            assets: Assets.fromHexStrings(ITEMS_POLICY, REFERENCE_NAME, 1n),
            datum: new InlineDatum.InlineDatum({ data: itemDatum }),
            autoMinUtxo: true,
        })
        .payToAddress({ address: Address.fromBech32(ownerAddress), assets: Assets.fromHexStrings(ITEMS_POLICY, USER_NAME, 1n), autoMinUtxo: true })
        .payToAddress({ address: Address.fromBech32(scriptAddress(TREASURY_HASH)), assets: Assets.fromLovelace(FEES[RARE]) })
        .setValidity({ to: Time.slotToUnixTime(BigInt(TIP.slot + 1200), preprod.slotConfig) });
    for (const signer of signers) {
        builder.addSigner({ keyHash: KeyHash.fromHex(signer.keyHash) });
    }
    const result = await builder.build({ availableUtxos: [seed, spare], changeAddress: Address.fromBech32(ownerAddress), fullProtocolParameters: params, evaluator });
    return Transaction.toCBORHex(await result.toTransaction());
};

const bodyBytesOf = cborHex => Transaction.extractBodyBytes(Buffer.from(cborHex, 'hex'));
const bodyHashOf = cborHex => TransactionHash.toBytes(TransactionBody.toHashFromBytes(bodyBytesOf(cborHex)));

const scriptDataOf = cborHex => scriptDataOfParams(cborHex, params);

let unsigned;
let walletSigned;
let fullySigned;

beforeAll(async () => {
    unsigned = await buildMint();
    // the owner's wallet answers CIP-30 signTx(tx, true) with a witness set; the server merges it
    walletSigned = Transaction.addVKeyWitnessesHex(unsigned, walletWitness(unsigned, [owner.privateKey]));
    // then the server's own signature, merged the same way
    fullySigned = Transaction.addVKeyWitnessesHex(walletSigned, walletWitness(walletSigned, [server.privateKey]));
});

describe('the transaction library (spike)', () => {
    test('the SDK and the evaluator load under Jest', () => {
        expect(typeof evaluator.evaluate).toBe('function');
        // and outside Jest, with Node's require() of both ES modules (the WASM initialised)
        const script =
            "const { createAikenEvaluator } = require('@evolution-sdk/aiken-uplc'); require('@evolution-sdk/evolution'); " +
            "if (typeof createAikenEvaluator.evaluate !== 'function') process.exit(1)";
        expect(() => execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), stdio: 'pipe' })).not.toThrow();
    });

    test('a Plutus V3 mint with a reference input, an inline datum, two required signers and a TTL builds offline', () => {
        const { body, witnessSet } = Transaction.fromCBORHex(unsigned);
        expect(Mint.policyCount(body.mint)).toBe(1);
        const minted = Mint.getAssetsByPolicyHex(body.mint, ITEMS_POLICY);
        expect([...minted].map(([name, quantity]) => [AssetName.toHex(name), quantity])).toEqual([
            [REFERENCE_NAME, 1n],
            [USER_NAME, 1n],
        ]);
        expect(body.inputs.map(outRef)).toContain(`${SEED_TX}#1`);
        expect(body.referenceInputs.map(outRef)).toEqual([`${CONFIG_TX}#0`]);
        const locked = body.outputs.find(output => Address.toBech32(output.address) === scriptAddress(ITEMS_POLICY));
        expect(locked.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(Data.equals(locked.datumOption.data, itemDatum)).toBe(true);
        expect(body.requiredSigners.map(KeyHash.toHex).sort()).toEqual([owner.keyHash, server.keyHash].sort());
        expect(body.ttl).toBe(BigInt(TIP.slot + 1200));
        expect(body.collateralInputs.length).toBeGreaterThan(0);
        expect(body.totalCollateral).toBeGreaterThan(0n);
        expect(body.scriptDataHash).toBeDefined();
        const redeemers = witnessSet.redeemers.toArray();
        expect(redeemers.map(redeemer => redeemer.tag)).toEqual(['mint']);
        expect(redeemers[0].exUnits.mem).toBeGreaterThan(0n);
        expect(redeemers[0].exUnits.steps).toBeGreaterThan(0n);
        expect(witnessSet.plutusV3Scripts).toHaveLength(1);
    });

    test('the script data hash covers the redeemers as written and the Plutus V3 cost model only', () => {
        const scriptData = scriptDataOf(unsigned);
        expect(scriptData.written).toBe(true);
        expect(scriptData.witnessDatums).toEqual([]);
        expect(scriptData.declared).toBe(scriptData.computed);
    });

    test('the body hash is blake2b-256 of the exact body bytes', () => {
        const bodyBytes = bodyBytesOf(unsigned);
        expect(unsigned).toContain(hex(bodyBytes));
        expect(hex(bodyHashOf(unsigned))).toBe(hex(blake2b(bodyBytes, { dkLen: 32 })));
    });

    test("a wallet's witness set merges and the body bytes stay the same", () => {
        expect(hex(bodyBytesOf(walletSigned))).toBe(hex(bodyBytesOf(unsigned)));
        expect(Transaction.fromCBORHex(walletSigned).witnessSet.vkeyWitnesses).toHaveLength(1);
    });

    test("the server's witness merges after it and the body bytes still stay the same", () => {
        expect(hex(bodyBytesOf(fullySigned))).toBe(hex(bodyBytesOf(unsigned)));
        expect(Transaction.fromCBORHex(fullySigned).witnessSet.vkeyWitnesses).toHaveLength(2);
    });

    test('after both merges the redeemers are the same bytes and still match the script data hash', () => {
        // the merges re-encode the witness set: the node would refuse a changed redeemer encoding
        // (PPViewHashesDontMatch), and the evaluator does not check the hash
        const before = scriptDataOf(unsigned);
        const after = scriptDataOf(fullySigned);
        expect(fullySigned).toContain(before.redeemerBytes);
        expect(after.written).toBe(true);
        expect(after.redeemerBytes).toBe(before.redeemerBytes);
        expect(after.declared).toBe(after.computed);
    });

    test('both signatures verify over the body hash', () => {
        const witnesses = Transaction.fromCBORHex(fullySigned).witnessSet.vkeyWitnesses;
        const signers = witnesses.map(witness => KeyHash.toHex(KeyHash.fromVKey(witness.vkey)));
        expect(signers.sort()).toEqual([owner.keyHash, server.keyHash].sort());
        for (const witness of witnesses) {
            expect(VKey.verify(witness.vkey, bodyHashOf(unsigned), witness.signature.bytes)).toBe(true);
        }
    });

    test('the signed transaction still passes the scripts', async () => {
        const context = { costModels: costModelsOf(params), maxTxExSteps: params.maxTxExSteps, maxTxExMem: params.maxTxExMem, slotConfig: preprod.slotConfig };
        const evaluated = await Effect.runPromise(evaluator.evaluate(Transaction.fromCBORHex(fullySigned), [seed, spare, configUtxo], context));
        expect(evaluated.map(result => result.redeemer_tag)).toEqual(['mint']);
        // the same budget the builder put into the redeemer
        const [redeemer] = Transaction.fromCBORHex(fullySigned).witnessSet.redeemers.toArray();
        expect(evaluated[0].ex_units.mem).toBe(redeemer.exUnits.mem);
        expect(evaluated[0].ex_units.steps).toBe(redeemer.exUnits.steps);
    });

    test('a mint the validator refuses fails in evaluation and says where', async () => {
        // without the server among the required signers (IM5), the items policy fails
        const failure = await buildMint({ signers: [owner] }).then(
            () => undefined,
            error => error
        );
        expect(failure).toBeDefined();
        expect(failure.message).toMatch(/Script evaluation failed/);
        expect(failure.cause.failures.length).toBeGreaterThan(0);
        expect(failure.cause.failures[0].validationError).toMatch(/Mint\[0\]/);
    });
});
