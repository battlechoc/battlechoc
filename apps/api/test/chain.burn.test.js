// The burn transaction (plan B, Task 8): buildBurn salvages a minted item offline, unsigned, with
// the real `items` validator of contracts/plutus.json and the local Aiken evaluator: it spends
// the store (the reference token's UTxO at the items script) and the holder's user token, burns
// both, and returns the ADA to the holder. Every build that succeeds here passed the validator's
// mint and spend handlers.

const { Address, AssetName, Assets, Data, KeyHash, Mint, ScriptHash, Transaction } = require('@evolution-sdk/evolution');
const { chain, cardano } = require('@battlechoc/battlechoc-shared-functions');
const { ChainConfigError } = require('../src/chain/blueprint');
const { assetNamesOf, itemDatum, outRef } = require('../src/chain/names');
const { ChainTxError, addServerWitness, buildBurn, fundsCheck, verifyWitness } = require('../src/chain/tx');
const { TIP, loadParams, fixtureKey, fixtureContracts, scriptDataOf, utxo, walletWitness } = require('./helpers/chain');

const preprod = cardano.Networks.preprod;
const params = loadParams();
const holder = fixtureKey('owner');
const server = fixtureKey('server');
const holderAddress = holder.baseAddress('owner-stake');
const holderOfWallet = { keyHash: holder.keyHash, address: holderAddress };

const contracts = fixtureContracts();
const { policyId } = contracts;

// The item: minted from the seed a1…a1#1, its store at the items script with its datum and the
// deposit buildMint locks with it, its user token in the holder's wallet next to 1.2 ADA
const names = assetNamesOf(`${'a1'.repeat(32)}#1`);
const storeOf = ({ itemNames = names, address = contracts.itemsAddress, lovelace = 2_396_360n, txId = '5e'.repeat(32) } = {}) =>
    utxo({
        address,
        lovelace,
        tokens: { [policyId + itemNames.reference]: 1n },
        txId,
        index: 0,
        datum: itemDatum({ item: { key: 'DARK_WALLS', name: 'Dark chocolate walls', serial: 7 }, userAssetName: itemNames.user }),
    });
const store = storeOf();
const held = utxo({ address: holderAddress, lovelace: 1_200_000n, tokens: { [policyId + names.user]: 1n }, txId: 'b7'.repeat(32), index: 2 });
const spare = utxo({ address: holderAddress, lovelace: 5_000_000n, txId: 'b8'.repeat(32), index: 0 });

const burn = (overrides = {}) =>
    buildBurn({ assetName: names.user, holder: holderOfWallet, utxos: [spare, held], reference: store, params, tip: TIP, contracts, serverKeyHash: server.keyHash, ...overrides });

const failure = promise =>
    promise.then(
        () => undefined,
        error => error
    );
const codeOf = error => (error instanceof ChainTxError || error instanceof ChainConfigError ? error.code : error);
const decoded = ({ cbor }) => Transaction.fromCBORHex(cbor);
const lovelace = output => Number(Assets.lovelaceOf(output.assets));
// the BurnItems redeemer (ItemAction, constructor 1) and the store's spend redeemer (Constr 0 [])
const BURN_ITEMS = Data.constr(1n, []);
const STORE_SPEND = Data.constr(0n, []);

describe('the burn transaction', () => {
    let built;
    beforeAll(async () => {
        built = await burn();
    });

    test('a burn takes −1 of both, spends the store and returns the deposits to the holder', () => {
        const { body, witnessSet } = decoded(built);
        expect(built.kind).toBe('burn');
        expect(built.assetName).toBe(names.user);

        // the pair, −1 each, under the items policy and nothing else
        expect(Mint.policyCount(body.mint)).toBe(1);
        const burned = [...Mint.getAssetsByPolicyHex(body.mint, policyId)].map(([name, quantity]) => [AssetName.toHex(name), quantity]);
        expect(burned).toEqual([
            [names.reference, -1n],
            [names.user, -1n],
        ]);

        // the store and the user token are spent; no reference input (no config)
        const inputs = body.inputs.map(outRef);
        expect(inputs).toContain(outRef(store));
        expect(inputs).toContain(outRef(held));
        expect(body.referenceInputs ?? []).toEqual([]);

        // the items script inline, a mint redeemer BurnItems and a spend redeemer Constr 0 [] on the store
        expect(witnessSet.plutusV3Scripts).toHaveLength(1);
        expect(ScriptHash.toHex(ScriptHash.fromScript(witnessSet.plutusV3Scripts[0]))).toBe(policyId);
        const redeemers = witnessSet.redeemers.toArray();
        const mintRedeemer = redeemers.find(redeemer => redeemer.tag === 'mint');
        const spendRedeemer = redeemers.find(redeemer => redeemer.tag === 'spend');
        expect(redeemers).toHaveLength(2);
        expect(Data.equals(mintRedeemer.data, BURN_ITEMS)).toBe(true);
        expect(Data.equals(spendRedeemer.data, STORE_SPEND)).toBe(true);
        expect(inputs[Number(spendRedeemer.index)]).toBe(outRef(store));
        for (const redeemer of redeemers) {
            expect(redeemer.exUnits.mem).toBeGreaterThan(0n);
            expect(redeemer.exUnits.steps).toBeGreaterThan(0n);
        }

        // everything comes back to the holder: one change output with the deposits, less the network fee
        expect(body.outputs).toHaveLength(1);
        const [change] = body.outputs;
        expect(Address.toBech32(change.address)).toBe(holderAddress);
        expect(Assets.hasMultiAsset(change.assets)).toBe(false);
        const spent = [spare, held, store].filter(input => inputs.includes(outRef(input))).reduce((sum, input) => sum + lovelace(input), 0);
        expect(lovelace(change)).toBe(spent - Number(body.fee));
        expect(built.deposits).toEqual({ reference: lovelace(store), user: lovelace(held) });

        // what the result reports is what the body says
        expect(built.networkFee).toBe(Number(body.fee));
        expect(body.ttl).toBe(BigInt(TIP.slot + 1200));
        expect(built.ttl).toBe(TIP.slot + 1200);
        expect(built.collateral).toEqual(body.collateralInputs.map(outRef));
        expect(built.collateral).not.toContain(outRef(store));
        expect(Number(body.totalCollateral)).toBe(chain.COLLATERAL_LOVELACE);
        expect(built.gameFee).toBeNull();
        for (const value of [built.networkFee, built.deposits.reference, built.deposits.user, built.ttl]) {
            expect(typeof value).toBe('number');
        }
    });

    test('the required witnesses are the keys of the wallet inputs and the collateral, not the store', () => {
        expect(built.requiredWitnesses).toEqual([holder.keyHash]);
    });

    test('the cbor is exactly what the SDK wrote, and the script data hash covers the Plutus V3 cost model only', () => {
        expect(Transaction.toCBORHex(decoded(built))).toBe(built.cbor);
        // no reference input and no spent input with a reference script: the builder's language
        // views are the node's (the spike's finding 4 does not reach the burn)
        const scriptData = scriptDataOf(built.cbor, params);
        expect(scriptData.written).toBe(true);
        expect(scriptData.witnessDatums).toEqual([]);
        expect(scriptData.declared).toBe(scriptData.computed);
    });

    test('a burn ignores a paused config', async () => {
        const paused = await burn({ contracts: fixtureContracts({ paused: true }) });
        expect(paused.cbor).toBe(built.cbor);
    });

    test('a burn has no fee output although the config has fees', () => {
        expect(contracts.config.fees.length).toBeGreaterThan(0);
        const { body } = decoded(built);
        expect(body.outputs.filter(output => Address.toBech32(output.address) === contracts.treasuryAddress)).toEqual([]);
        expect(body.outputs.map(output => Address.toBech32(output.address))).toEqual([holderAddress]);
        expect(built.gameFee).toBeNull();
    });

    test("the game's burn names the server as signer", () => {
        expect(decoded(built).body.requiredSigners.map(KeyHash.toHex)).toEqual([server.keyHash]);
    });

    test('a holder-only burn passes the validator', async () => {
        // the builder evaluates both handlers: a build is a pass
        const alone = await burn({ serverKeyHash: null });
        const { body, witnessSet } = decoded(alone);
        expect(body.requiredSigners ?? []).toEqual([]);
        expect(witnessSet.redeemers.toArray().map(redeemer => redeemer.tag).sort()).toEqual(['mint', 'spend']);
        expect(alone.requiredWitnesses).toEqual([holder.keyHash]);
        // the default is the holder-only burn
        const byDefault = await buildBurn({ assetName: names.user, holder: holderOfWallet, utxos: [spare, held], reference: store, params, tip: TIP, contracts });
        expect(byDefault.cbor).toBe(alone.cbor);
    });

    test('the build is deterministic', async () => {
        expect((await burn({ utxos: [held, spare] })).cbor).toBe(built.cbor);
    });
});

describe('the item a burn salvages', () => {
    test('TOKEN_NOT_HELD when the user token is elsewhere', async () => {
        expect(codeOf(await failure(burn({ utxos: [spare] })))).toBe('TOKEN_NOT_HELD');
        // another item's user token is not this one
        const other = assetNamesOf(`${'a9'.repeat(32)}#0`);
        const otherHeld = utxo({ address: holderAddress, lovelace: 1_200_000n, tokens: { [policyId + other.user]: 1n }, txId: 'b9'.repeat(32), index: 0 });
        expect(codeOf(await failure(burn({ utxos: [spare, otherHeld] })))).toBe('TOKEN_NOT_HELD');
        // the same name under another policy is not the item
        const lookalike = utxo({ address: holderAddress, lovelace: 1_200_000n, tokens: { ['c4'.repeat(28) + names.user]: 1n }, txId: 'ba'.repeat(32), index: 0 });
        expect(codeOf(await failure(burn({ utxos: [spare, lookalike] })))).toBe('TOKEN_NOT_HELD');
        // a reference token's name is no user token's
        expect(codeOf(await failure(burn({ assetName: names.reference })))).toBe('TOKEN_NOT_HELD');
    });

    test('REFERENCE_NOT_FOUND for a store of another item', async () => {
        const other = assetNamesOf(`${'a9'.repeat(32)}#0`);
        expect(codeOf(await failure(burn({ reference: storeOf({ itemNames: other }) })))).toBe('REFERENCE_NOT_FOUND');
        // the right token, but not at the items script
        expect(codeOf(await failure(burn({ reference: storeOf({ address: holderAddress }) })))).toBe('REFERENCE_NOT_FOUND');
        // the items script's hash on another network
        const mainnetStore = Address.toBech32(new Address.Address({ networkId: 1, paymentCredential: ScriptHash.fromHex(policyId) }));
        expect(codeOf(await failure(burn({ reference: storeOf({ address: mainnetStore }) })))).toBe('REFERENCE_NOT_FOUND');
        expect(codeOf(await failure(burn({ reference: undefined })))).toBe('REFERENCE_NOT_FOUND');
    });

    test('a store at the items script with a stake part burns as well', async () => {
        const staked = Address.toBech32(
            new Address.Address({ networkId: preprod.networkId, paymentCredential: ScriptHash.fromHex(policyId), stakingCredential: KeyHash.fromHex(fixtureKey('owner-stake').keyHash) })
        );
        const reference = storeOf({ address: staked });
        const result = await burn({ reference });
        expect(decoded(result).body.inputs.map(outRef)).toContain(outRef(reference));
    });
});

describe('the wallet a burn spends from', () => {
    test('a wallet without collateral → NO_COLLATERAL, as the funds check says', async () => {
        // the user token's UTxO alone: 1.2 ADA, less than the collateral
        expect(fundsCheck({ utxos: [held], kind: 'burn' }).collateral).toBe(false);
        expect(codeOf(await failure(burn({ utxos: [held] })))).toBe('NO_COLLATERAL');
    });

    test('a burn short of ADA → NOT_ENOUGH_ADA, and a top-up of `missing` builds', async () => {
        // the user token sits next to many other tokens on too little ADA (no ledger would have
        // let it, but a burn must still say what is missing): the change that carries them on is
        // more than the store's deposit and the wallet's ADA together
        const others = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${(0x10 + i).toString(16).repeat(28)}01`, 1n]));
        const crowded = utxo({ address: holderAddress, lovelace: 1_200_000n, tokens: { [policyId + names.user]: 1n, ...others }, txId: 'bb'.repeat(32), index: 0 });
        const collateral = utxo({ address: holderAddress, lovelace: 2_000_000n, txId: 'bc'.repeat(32), index: 0 });
        const error = await failure(burn({ utxos: [crowded, collateral] }));
        expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
        expect(error.missing).toBeGreaterThan(0);
        const topUp = utxo({ address: holderAddress, lovelace: BigInt(error.missing), txId: '99'.repeat(32), index: 0 });
        const result = await burn({ utxos: [crowded, collateral, topUp] });
        // the other tokens ride on in the change, the user token is gone
        const [change] = decoded(result).body.outputs.filter(output => Assets.hasMultiAsset(output.assets));
        expect(Object.keys(others).every(unit => Assets.getByUnit(change.assets, unit) === 1n)).toBe(true);
        expect(Assets.getByUnit(change.assets, policyId + names.user)).toBe(0n);
    });

    test('the keys of every wallet address spent from are required witnesses', async () => {
        // the user token at a second payment key of the same wallet, the collateral at the first
        const second = fixtureKey('owner-2');
        const elsewhere = utxo({ address: second.baseAddress('owner-stake'), lovelace: 1_200_000n, tokens: { [policyId + names.user]: 1n }, txId: 'bd'.repeat(32), index: 0 });
        const result = await burn({ utxos: [spare, elsewhere] });
        expect(result.requiredWitnesses).toEqual([holder.keyHash, second.keyHash].sort());
        expect(result.deposits.user).toBe(1_200_000);
    });

    describe('what the node takes: maxValSize and maxTxSize', () => {
        // the user token next to `count` other tokens on too little ADA (as above), two more UTxOs
        // of `count` tokens on 9.2 ADA and a pure 3 ADA UTxO (the collateral): the burn spends the
        // three with tokens and the store, and the change carries every token but the burned one
        const POLICY = 'c4'.repeat(28);
        const tokensOf = (from, count) => Object.fromEntries(Array.from({ length: count }, (_, j) => [POLICY + (from + j).toString(16).padStart(64, '0'), 1n]));
        const tokenWallet = count => [
            utxo({ address: holderAddress, lovelace: 3_000_000n, tokens: { [policyId + names.user]: 1n, ...tokensOf(1000, count) }, txId: 'e0'.repeat(32), index: 0 }),
            utxo({ address: holderAddress, lovelace: 3_000_000n, txId: 'ec'.repeat(32), index: 0 }),
            ...[0, 1].map(i => utxo({ address: holderAddress, lovelace: 9_200_000n, tokens: tokensOf(i * count, count), txId: `e${i + 1}`.repeat(32), index: 0 })),
        ];
        const largestValue = result => Math.max(...decoded(result).body.outputs.map(output => Assets.toCBORBytes(output.assets).length));

        test('141 other tokens in the change, a value of 4974 bytes: it builds', async () => {
            const result = await burn({ utxos: tokenWallet(47) });
            expect(decoded(result).body.inputs).toHaveLength(4);
            expect(largestValue(result)).toBe(4974);
        });

        test('144, a value of 5079 bytes → TOO_MANY_TOKENS; with maxValSize 5079 it would build', async () => {
            expect(codeOf(await failure(burn({ utxos: tokenWallet(48) })))).toBe('TOO_MANY_TOKENS');
            expect(largestValue(await burn({ utxos: tokenWallet(48), params: { ...params, maxValSize: 5079 } }))).toBe(5079);
        });

        test('the signed transaction above maxTxSize → TX_TOO_LARGE; at it, it builds', async () => {
            const built = await burn();
            const walletSigned = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitness(built.cbor, [holder.privateKey]), requiredWitnesses: built.requiredWitnesses });
            const size = addServerWitness({ cbor: walletSigned.cbor, bodyHash: built.bodyHash, key: server }).cbor.length / 2;
            expect(codeOf(await failure(burn({ params: { ...params, maxTxSize: size - 1 } })))).toBe('TX_TOO_LARGE');
            expect((await burn({ params: { ...params, maxTxSize: size } })).cbor).toBe(built.cbor);
        });
    });
});
