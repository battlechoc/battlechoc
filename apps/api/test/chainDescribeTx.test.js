// The chain double's reader of real transactions (test/helpers/describeTx.js): what it says of a
// mint plan B's buildMint built must be what the transaction does, or every submit of a real
// transaction to the double would look like a chain rejection (the double turns any error of its
// describeTx into one) or land something else than the chain would. Checked against the
// transaction itself and through the double: submitted, in a block, its outputs where it says.

const { Address, Assets, Data, PlutusV3, ScriptHash, Transaction, preprod } = require('@evolution-sdk/evolution');
const { makeTxBuilder } = require('@evolution-sdk/evolution/sdk/builders/TransactionBuilder');
const { chain: rules, translateIn, translationKeys } = require('@battlechoc/battlechoc-shared-functions');
const { buildMint, verifyWitness } = require('../src/chain/tx');
const { gameFeeOf } = require('../src/chain/fees');
const { itemDatum } = require('../src/chain/names');
const { TEST_POLICY_ID, createChainDouble } = require('./chainDouble');
const { TIP, loadParams, fixtureKey, fixtureContracts, utxo, walletWitness } = require('./helpers/chain');
const { describeTx } = require('./helpers/describeTx');

const contracts = fixtureContracts();
const server = fixtureKey('server');
const ownerKey = fixtureKey('describe-owner');
const ownerAddress = ownerKey.baseAddress('describe-stake');
const owner = { keyHash: ownerKey.keyHash, address: ownerAddress };
const DARK_WALLS = { key: 'DARK_WALLS', serial: 7 };
const RARE = 1;
const SEED_TX = 'd1'.repeat(32);

const unit = name => contracts.policyId + name;
const sumOf = outputs => outputs.reduce((sum, output) => sum + BigInt(output.lovelace), 0n);

describe('a mint as buildMint builds it', () => {
    let built;
    let description;
    beforeAll(async () => {
        const seed = utxo({ address: ownerAddress, lovelace: 20_000_000n, txId: SEED_TX, index: 2 });
        built = await buildMint({ item: DARK_WALLS, fee: 0, owner, utxos: [seed], params: loadParams(), tip: TIP, contracts, serverKeyHash: server.keyHash });
        description = describeTx(built.cbor);
    });

    test('its hash is the body hash, its ttl the exclusive slot buildMint wrote, its input the seed (the config is only read)', () => {
        expect(description.txHash).toBe(built.bodyHash);
        expect(description.ttlSlot).toBe(built.ttl);
        expect(description.ttlSlot).toBe(TIP.slot + rules.TX_VALIDITY_MS / 1000);
        expect(description.inputs).toEqual([{ txHash: SEED_TX, index: 2 }]);
    });

    test('it mints the token pair', () => {
        expect(description.mint).toEqual({ [unit(built.assetName.reference)]: '1', [unit(built.assetName.user)]: '1' });
    });

    test('its outputs: the store with the datum as written, the user token to the owner, the fee to the treasury, the change', () => {
        const [store, user, fee, change, ...more] = description.outputs;
        expect(more).toEqual([]);
        const name = translateIn('en', translationKeys.ITEM_DARK_WALLS);
        expect(store).toEqual({
            address: contracts.itemsAddress,
            lovelace: String(built.deposits.reference),
            assets: { [unit(built.assetName.reference)]: '1' },
            inlineDatum: Data.toCBORHex(itemDatum({ item: { ...DARK_WALLS, name }, userAssetName: built.assetName.user })),
        });
        // the datum's bytes are those of the transaction, not a re-encoding of another form
        expect(built.cbor).toContain(store.inlineDatum);
        expect(user).toEqual({ address: ownerAddress, lovelace: String(built.deposits.user), assets: { [unit(built.assetName.user)]: '1' } });
        const rareFee = gameFeeOf(contracts.config, { tier: RARE, fee: 0 });
        expect(fee).toEqual({ address: contracts.treasuryAddress, lovelace: String(rareFee.amount), assets: {} });
        expect(change).toMatchObject({ address: ownerAddress, assets: {} });
        // nothing is made from nothing: the seed pays the outputs and the network fee
        expect(sumOf(description.outputs) + BigInt(built.networkFee)).toBe(20_000_000n);
    });

    test('signed, it is the same transaction', () => {
        const ownerSigned = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitness(built.cbor, [ownerKey.privateKey]), requiredWitnesses: built.requiredWitnesses });
        expect(describeTx(ownerSigned.cbor)).toEqual(description);
    });

    test('what is no transaction throws (the double then rejects it)', () => {
        expect(() => describeTx('00')).toThrow();
        expect(() => describeTx('not hex')).toThrow();
        expect(() => describeTx(built.cbor.slice(0, 100))).toThrow();
    });
});

test('an output with a reference script: its type and its bytes as the double hashes them', async () => {
    const wallet = utxo({ address: ownerAddress, lovelace: 50_000_000n, txId: 'd2'.repeat(32), index: 0 });
    const result = await makeTxBuilder({ chain: preprod })
        .payToAddress({ address: Address.fromBech32(ownerAddress), assets: Assets.fromLovelace(20_000_000n), script: contracts.items.script })
        .build({ availableUtxos: [wallet], changeAddress: Address.fromBech32(ownerAddress), fullProtocolParameters: loadParams() });
    const { referenceScript, ...output } = describeTx(Transaction.toCBORHex(await result.toTransaction())).outputs[0];
    expect(output).toEqual({ address: ownerAddress, lovelace: '20000000', assets: {} });
    expect(referenceScript.type).toBe('plutusV3');
    expect(ScriptHash.toHex(ScriptHash.fromScript(new PlutusV3.PlutusV3({ bytes: Buffer.from(referenceScript.cbor, 'hex') })))).toBe(contracts.policyId);
});

test('through the double: a built mint is taken, lands in a block with its tokens where it says, and is refused once the tip reaches its ttl', async () => {
    const double = createChainDouble({ policyId: TEST_POLICY_ID, describeTx });
    const provider = double.provider();
    const index = double.index();
    double.fund(ownerAddress, '20000000');
    double.produceBlocks();
    const build = async () =>
        buildMint({
            item: DARK_WALLS,
            fee: 0,
            owner,
            utxos: await provider.utxosAt(ownerAddress),
            params: await provider.protocolParameters(),
            tip: await provider.tip(),
            contracts,
            serverKeyHash: server.keyHash,
        });

    const built = await build();
    expect(await double.submit(built.cbor)).toBe(built.bodyHash);
    double.produceBlocks();
    expect(await index.mintOf(built.assetName.user)).toMatchObject({ txHash: built.bodyHash });
    const [store] = await provider.utxosAt(contracts.itemsAddress);
    expect(Data.toCBORHex(store.datumOption.data)).toBe(describeTx(built.cbor).outputs[0].inlineDatum);
    const fees = await provider.utxosAt(contracts.treasuryAddress);
    expect(fees.map(output => Assets.lovelaceOf(output.assets))).toEqual([2_000_000n]);
    expect(await index.transaction(built.bodyHash)).toEqual({ blockNo: (await provider.tip()).blockNo, slot: (await provider.tip()).slot });
    expect(await provider.utxosAt(ownerAddress, { asset: unit(built.assetName.user) })).toHaveLength(1);

    // a second mint from the change, held back until the tip is at its ttl
    const late = await build();
    const blocksToTtl = Math.ceil((late.ttl - (await provider.tip()).slot) / 20);
    double.produceBlocks(blocksToTtl);
    expect((await provider.tip()).slot).toBeGreaterThanOrEqual(late.ttl);
    await expect(double.submit(late.cbor)).rejects.toMatchObject({ code: 'rejected', message: expect.stringContaining('OutsideValidityIntervalUTxO') });
});
