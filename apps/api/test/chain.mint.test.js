// The mint transaction (plan B, Task 7): buildMint builds it offline, unsigned, with the real
// `items` validator of contracts/plutus.json and the local Aiken evaluator, so every build that
// succeeds here passed the validator (the builder evaluates the scripts and fails otherwise). With
// it: the owner's address (ownerOf), the funds check (fundsCheck) and the config (readConfig).

// The datum the mint locks with the reference token, replaceable for one test: the validator must
// refuse a datum that is not CIP-68.
let mockDatum;
jest.mock('../src/chain/names', () => {
    const actual = jest.requireActual('../src/chain/names');
    return { ...actual, itemDatum: (...args) => (mockDatum ? mockDatum(...args) : actual.itemDatum(...args)) };
});

// One item more than the game has, with a tier but without an ITEM_ text: its name on chain would
// be empty, so the mint must refuse it.
jest.mock('@battlechoc/battlechoc-shared-functions', () => {
    const actual = jest.requireActual('@battlechoc/battlechoc-shared-functions');
    return { ...actual, Items: Object.freeze({ ...actual.Items, NAMELESS: { ...actual.Items.DARK_WALLS, key: 'NAMELESS' } }) };
});

const { Address, AssetName, Assets, Data, InlineDatum, KeyHash, Mint, ScriptHash, Transaction, TransactionBody, TransactionHash } = require('@evolution-sdk/evolution');
const { chain, cardano } = require('@battlechoc/battlechoc-shared-functions');
const { ChainConfigError, CONFIG_TOKEN_NAME, loadBlueprint, mintItemRedeemer } = require('../src/chain/blueprint');
const { assetNamesOf, itemDatum, outRef } = require('../src/chain/names');
const { ChainTxError, addServerWitness, buildMint, fundsCheck, ownerOf, readConfig, verifyWitness } = require('../src/chain/tx');
const { gameFeeOf } = require('../src/chain/fees');
const { TIP, TEAM_ADDRESS, loadParams, fixtureKey, fixtureContracts, utxo, walletWitness } = require('./helpers/chain');

const preprod = cardano.Networks.preprod;
const params = loadParams();
const owner = fixtureKey('owner');
const server = fixtureKey('server');
const stake = fixtureKey('owner-stake');
const ownerAddress = owner.baseAddress('owner-stake');
const ownerOfWallet = { keyHash: owner.keyHash, address: ownerAddress };

const DARK_WALLS = { key: 'DARK_WALLS', serial: 7 }; // RARE
const NUT_BRICKS = { key: 'NUT_BRICKS', serial: 1 }; // COMMON
const TURBO_CONVEYOR = { key: 'TURBO_CONVEYOR', serial: 2 }; // EPIC
const OTHER_TOKEN = 'c4'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');

const SEED_TX = 'a1'.repeat(32);
const seed = utxo({ address: ownerAddress, lovelace: 20_000_000n, txId: SEED_TX, index: 1 });
const spare = utxo({ address: ownerAddress, lovelace: 8_000_000n, txId: 'a2'.repeat(32), index: 0 });

const contracts = fixtureContracts();
// the preprod fee of a COMMON (1 ADA) and a RARE item (2 ADA), as the funds check is given it
const COMMON_FEE = gameFeeOf(contracts.config, { tier: 0, fee: 0 });
const RARE_FEE = gameFeeOf(contracts.config, { tier: 1, fee: 0 });

const mint = (overrides = {}) =>
    buildMint({ item: DARK_WALLS, fee: 0, owner: ownerOfWallet, utxos: [spare, seed], params, tip: TIP, contracts, serverKeyHash: server.keyHash, ...overrides });

const failure = promise =>
    promise.then(
        () => undefined,
        error => error
    );
const thrown = fn => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return undefined;
};
const codeOf = error => (error instanceof ChainTxError || error instanceof ChainConfigError ? error.code : error);

const decoded = ({ cbor }) => Transaction.fromCBORHex(cbor);
// the wallet with one more pure UTxO of `lovelace` at the owner's address
const toppedUp = (utxos, lovelace) => [...utxos, utxo({ address: ownerAddress, lovelace: BigInt(lovelace), txId: '99'.repeat(32), index: 0 })];
const bech32 = output => Address.toBech32(output.address);
const lovelace = output => Number(Assets.lovelaceOf(output.assets));
const holds = (output, unit) => Assets.getByUnit(output.assets, unit) === 1n;
const outputsAt = (body, address) => body.outputs.filter(output => bech32(output) === address);

describe('the mint transaction', () => {
    let built;
    beforeAll(async () => {
        built = await mint();
    });

    test('a mint carries the pair, the config as reference input, the datum, both signers and the TTL', () => {
        const { body, witnessSet } = decoded(built);
        const names = assetNamesOf(`${SEED_TX}#1`);
        expect(built.kind).toBe('mint');
        expect(built.assetName).toEqual(names);

        // the pair, one each, under the items policy and nothing else minted
        expect(Mint.policyCount(body.mint)).toBe(1);
        const minted = [...Mint.getAssetsByPolicyHex(body.mint, contracts.policyId)].map(([name, quantity]) => [AssetName.toHex(name), quantity]);
        expect(minted).toEqual([
            [names.reference, 1n],
            [names.user, 1n],
        ]);

        // the items script inline, no reference script, the config read and not spent
        expect(witnessSet.plutusV3Scripts).toHaveLength(1);
        expect(ScriptHash.toHex(ScriptHash.fromScript(witnessSet.plutusV3Scripts[0]))).toBe(contracts.policyId);
        expect(body.referenceInputs.map(outRef)).toEqual([outRef(contracts.configUtxo)]);
        expect(body.inputs.map(outRef)).not.toContain(outRef(contracts.configUtxo));

        // the reference token at the items script's address with the item's datum
        const [locked] = outputsAt(body, contracts.itemsAddress);
        expect(outputsAt(body, contracts.itemsAddress)).toHaveLength(1);
        expect(holds(locked, contracts.policyId + names.reference)).toBe(true);
        expect(locked.datumOption).toBeInstanceOf(InlineDatum.InlineDatum);
        expect(Data.equals(locked.datumOption.data, itemDatum({ item: { ...DARK_WALLS, name: 'Dark chocolate walls' }, userAssetName: names.user }))).toBe(true);

        expect(body.requiredSigners.map(KeyHash.toHex).sort()).toEqual([owner.keyHash, server.keyHash].sort());
        expect(body.ttl).toBe(BigInt(TIP.slot + 1200));
        expect(built.ttl).toBe(TIP.slot + 1200);

        // the redeemer was evaluated by the real validator
        const [redeemer] = witnessSet.redeemers.toArray();
        expect(redeemer.exUnits.mem).toBeGreaterThan(0n);
        expect(redeemer.exUnits.steps).toBeGreaterThan(0n);

        // what the result reports is what the body says
        const [user] = body.outputs.filter(output => holds(output, contracts.policyId + names.user));
        expect(built.networkFee).toBe(Number(body.fee));
        expect(built.deposits).toEqual({ reference: lovelace(locked), user: lovelace(user) });
        expect(built.deposit).toBe(built.deposits.reference + built.deposits.user);
        expect(built.collateral).toEqual(body.collateralInputs.map(outRef));
        expect(Number(body.totalCollateral)).toBe(chain.COLLATERAL_LOVELACE);
        expect(built.bodyHash).toBe(TransactionHash.toHex(TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(built.cbor, 'hex')))));
        // lovelace as Numbers
        for (const value of [built.networkFee, built.deposit, built.deposits.reference, built.deposits.user, built.ttl, built.gameFee.amount, built.gameFee.paid]) {
            expect(typeof value).toBe('number');
        }
    });

    test('the cbor is exactly what the SDK wrote', () => {
        expect(Transaction.toCBORHex(decoded(built))).toBe(built.cbor);
    });

    test('the required witnesses are the owner and the keys of every spent and collateral input', () => {
        const { body } = decoded(built);
        const wallet = new Map([seed, spare].map(input => [outRef(input), input]));
        const keys = [...body.inputs, ...body.collateralInputs].map(input => KeyHash.toHex(wallet.get(outRef(input)).address.paymentCredential));
        expect(built.requiredWitnesses).toEqual([...new Set([owner.keyHash, ...keys])].sort());
        // one wallet key here: the owner's
        expect(built.requiredWitnesses).toEqual([owner.keyHash]);
    });

    test('a RARE item pays 2 ADA to the treasury in one output without a datum, and the redeemer says tier 1, fee 0', () => {
        const { body, witnessSet } = decoded(built);
        const paid = outputsAt(body, contracts.treasuryAddress);
        expect(paid).toHaveLength(1);
        expect(lovelace(paid[0])).toBe(2_000_000);
        expect(paid[0].datumOption).toBeUndefined();
        expect(Assets.hasMultiAsset(paid[0].assets)).toBe(false);
        expect(built.gameFee).toEqual({ asset: 'lovelace', amount: 2_000_000, paid: 2_000_000 });
        const [redeemer] = witnessSet.redeemers.toArray();
        expect(Data.equals(redeemer.data, mintItemRedeemer({ seed: `${SEED_TX}#1`, owner: owner.keyHash, tier: 1, fee: 0 }))).toBe(true);
    });

    test('an EPIC item pays 4 ADA and a COMMON item 1 ADA, exactly the due', async () => {
        for (const [item, tier, amount] of [
            [TURBO_CONVEYOR, 2, 4_000_000],
            [NUT_BRICKS, 0, 1_000_000],
        ]) {
            const result = await mint({ item });
            const { body, witnessSet } = decoded(result);
            expect(outputsAt(body, contracts.treasuryAddress).map(lovelace)).toEqual([amount]);
            expect(result.gameFee).toEqual({ asset: 'lovelace', amount, paid: amount });
            const [redeemer] = witnessSet.redeemers.toArray();
            expect(Data.equals(redeemer.data, mintItemRedeemer({ seed: `${SEED_TX}#1`, owner: owner.keyHash, tier, fee: 0 }))).toBe(true);
        }
    });

    test('the user token goes to the owner\'s address and the change too', () => {
        const { body } = decoded(built);
        const toOwner = outputsAt(body, ownerAddress);
        const user = toOwner.filter(output => holds(output, contracts.policyId + built.assetName.user));
        expect(user).toHaveLength(1);
        // the change: the rest of the wallet's ADA, its own output, no item token
        const change = toOwner.filter(output => !holds(output, contracts.policyId + built.assetName.user));
        expect(change).toHaveLength(1);
        expect(Assets.hasMultiAsset(change[0].assets)).toBe(false);
        // nothing else leaves the wallet: the outputs are the item, the user token, the fee and the change
        expect(body.outputs).toHaveLength(4);
    });

    test('the build is deterministic', async () => {
        expect((await mint()).cbor).toBe(built.cbor);
        // also with the wallet's UTxOs in another order
        expect((await mint({ utxos: [seed, spare] })).cbor).toBe(built.cbor);
    });

    test('the collateral covers 150 % of the network fee', () => {
        expect(params.collateralPercentage).toBe(150);
        expect(chain.COLLATERAL_LOVELACE).toBeGreaterThanOrEqual((built.networkFee * params.collateralPercentage) / 100);
    });
});

describe('the battlechoc fee of a mint', () => {
    test('a split fee pays both receivers, a share below the minimum UTxO is raised and reported in gameFee.paid', async () => {
        const treasury = contracts.treasuryAddress;
        const split = fixtureContracts({
            fees: [
                {
                    asset: 'lovelace',
                    amounts: [1_000_000, 2_000_000, 4_000_000],
                    receivers: [
                        { address: treasury, share: 9 },
                        { address: TEAM_ADDRESS, share: 1 },
                    ],
                },
            ],
        });
        // COMMON: 1 ADA, 0.9 to the treasury and 0.1 to the team, which is below the minimum UTxO
        const result = await mint({ item: NUT_BRICKS, contracts: split });
        const { body } = decoded(result);
        const [toTreasury] = outputsAt(body, treasury).map(lovelace);
        const [toTeam] = outputsAt(body, TEAM_ADDRESS).map(lovelace);
        expect(toTreasury).toBe(900_000);
        expect(toTeam).toBeGreaterThan(100_000);
        expect(result.gameFee).toEqual({ asset: 'lovelace', amount: 1_000_000, paid: toTreasury + toTeam });
    });

    test('empty fees: no fee output and gameFee null', async () => {
        const result = await mint({ contracts: fixtureContracts({ fees: [] }) });
        const { body } = decoded(result);
        expect(outputsAt(body, contracts.treasuryAddress)).toEqual([]);
        expect(body.outputs).toHaveLength(3);
        expect(result.gameFee).toBeNull();
    });

    test('a fee option index that does not exist → NO_SUCH_FEE', async () => {
        expect(codeOf(await failure(mint({ fee: 1 })))).toBe('NO_SUCH_FEE');
    });

    test('a CHOC-shaped option (policy and name set) → FEE_ASSET_UNSUPPORTED', async () => {
        const choc = fixtureContracts({ fees: [{ asset: OTHER_TOKEN, amounts: [10, 20, 40], receivers: [{ address: contracts.treasuryAddress, share: 1 }] }] });
        expect(codeOf(await failure(mint({ contracts: choc })))).toBe('FEE_ASSET_UNSUPPORTED');
    });

    test('an item key the game does not know → NO_SUCH_TIER', async () => {
        expect(codeOf(await failure(mint({ item: { key: 'NO_SUCH_ITEM', serial: 1 } })))).toBe('NO_SUCH_TIER');
        expect(codeOf(await failure(mint({ item: { key: 'constructor', serial: 1 } })))).toBe('NO_SUCH_TIER');
    });

    test('the game fee counts towards not enough ADA', async () => {
        // just the estimate: the funds check misses the RARE fee of 2 ADA; the build, whose exact
        // costs are a little below the estimate, misses a little less; that much more builds
        const exact = utxo({ address: ownerAddress, lovelace: chain.MINT_NEEDED_ESTIMATE_LOVELACE, txId: 'a3'.repeat(32), index: 0 });
        expect(fundsCheck({ utxos: [exact], kind: 'mint', gameFee: RARE_FEE }).missing).toBe(2_000_000);
        const error = await failure(mint({ utxos: [exact] }));
        expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
        expect(error.missing).toBeGreaterThan(1_500_000);
        expect(error.missing).toBeLessThanOrEqual(2_000_000);
        await expect(mint({ utxos: toppedUp([exact], error.missing) })).resolves.toMatchObject({ kind: 'mint' });
    });
});

describe('the wallet a mint spends from', () => {
    test('the asset names come from the seed, and the seed is the largest ADA-only UTxO', async () => {
        const richWithToken = utxo({ address: ownerAddress, lovelace: 30_000_000n, tokens: { [OTHER_TOKEN]: 5n }, txId: 'b0'.repeat(32), index: 0 });
        const largest = utxo({ address: ownerAddress, lovelace: 12_000_000n, txId: 'b2'.repeat(32), index: 0 });
        // as large, but its out-ref is lower: the tie goes to it
        const tie = utxo({ address: ownerAddress, lovelace: 12_000_000n, txId: 'b1'.repeat(32), index: 4 });
        const result = await mint({ utxos: [spare, richWithToken, largest, tie] });
        expect(result.seed).toBe(outRef(tie));
        expect(result.assetName).toEqual(assetNamesOf(outRef(tie)));
        expect(decoded(result).body.inputs.map(outRef)).toContain(outRef(tie));
    });

    test('UTxOs with a datum or a reference script are never spent', async () => {
        const withDatum = utxo({ address: ownerAddress, lovelace: 50_000_000n, txId: 'c1'.repeat(32), index: 0, datum: 42n });
        const withScript = utxo({ address: ownerAddress, lovelace: 40_000_000n, txId: 'c2'.repeat(32), index: 0, scriptRef: contracts.items.script });
        const plain = utxo({ address: ownerAddress, lovelace: 10_000_000n, txId: 'c3'.repeat(32), index: 0 });
        const result = await mint({ utxos: [withDatum, withScript, plain] });
        const { body } = decoded(result);
        expect(body.inputs.map(outRef)).toEqual([outRef(plain)]);
        expect(body.collateralInputs.map(outRef)).toEqual([outRef(plain)]);
        expect(result.seed).toBe(outRef(plain));
    });

    test('not enough ADA says how much is missing', async () => {
        const small = utxo({ address: ownerAddress, lovelace: 2_000_000n, txId: 'd1'.repeat(32), index: 0 });
        const free = fixtureContracts({ fees: [] });
        // without a fee: the deposits, the network fee and the change, less the 2 ADA there are
        const error = await failure(mint({ utxos: [small], contracts: free }));
        expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
        expect(error.missing).toBeGreaterThan(2_000_000);
        expect(error.missing).toBeLessThanOrEqual(fundsCheck({ utxos: [small], kind: 'mint' }).missing);
        await expect(mint({ utxos: toppedUp([small], error.missing), contracts: free })).resolves.toMatchObject({ kind: 'mint' });
    });

    describe("the reviewer's wallets: a RARE item, the 2 ADA fee", () => {
        test('7 ADA in one pure UTxO: just short with the English name in the datum, and a top-up of `missing` builds', async () => {
            // the review built it with the tests' old name "Dark Walls"; "Dark chocolate walls" makes
            // the reference token's deposit 43_100 lovelace larger, more than the 1.3k it had to spare
            const utxos = [utxo({ address: ownerAddress, lovelace: 7_000_000n, txId: 'd2'.repeat(32), index: 0 })];
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE })).toEqual({ enough: false, missing: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000 - 7_000_000, needed: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000, collateral: true });
            const error = await failure(mint({ utxos }));
            expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
            await expect(mint({ utxos: toppedUp(utxos, error.missing) })).resolves.toMatchObject({ kind: 'mint' });
        });

        test('7.1 ADA in one pure UTxO builds, though the funds check (without the build) errs towards missing', async () => {
            const utxos = [utxo({ address: ownerAddress, lovelace: 7_100_000n, txId: 'd2'.repeat(32), index: 1 })];
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE })).toEqual({ enough: false, missing: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000 - 7_100_000, needed: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000, collateral: true });
            await expect(mint({ utxos })).resolves.toMatchObject({ kind: 'mint' });
        });

        test('7 ADA next to a token: NOT_ENOUGH_ADA, and a top-up of `missing` builds', async () => {
            const utxos = [utxo({ address: ownerAddress, lovelace: 7_000_000n, tokens: { [OTHER_TOKEN]: 5n }, txId: 'd3'.repeat(32), index: 0 })];
            // the change carries the token: more than the reserve, more missing than without it
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE }).missing).toBeGreaterThan(chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000 - 7_000_000);
            const error = await failure(mint({ utxos }));
            expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
            expect(error.missing).toBeGreaterThan(0);
            const result = await mint({ utxos: toppedUp(utxos, error.missing) });
            expect(outputsAt(decoded(result).body, ownerAddress).some(output => Assets.getByUnit(output.assets, OTHER_TOKEN) === 5n)).toBe(true);
        });

        test('5 ADA and 2 ADA, both pure: NOT_ENOUGH_ADA, and a top-up of `missing` builds', async () => {
            const utxos = [utxo({ address: ownerAddress, lovelace: 5_000_000n, txId: 'd4'.repeat(32), index: 0 }), utxo({ address: ownerAddress, lovelace: 2_000_000n, txId: 'd4'.repeat(32), index: 1 })];
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE })).toEqual({ enough: false, missing: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000 - 7_000_000, needed: chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000, collateral: true });
            const error = await failure(mint({ utxos }));
            expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
            // the change lacks a few hundred lovelace, but no UTxO is smaller than its minimum
            expect(error.missing).toBe(969_750);
            await expect(mint({ utxos: toppedUp(utxos, error.missing) })).resolves.toMatchObject({ kind: 'mint' });
        });
    });

    test('a top-up that would spoil the collateral is raised until it is the collateral by itself', async () => {
        // 1.5 + 0.5 ADA are the collateral exactly; 5 ADA next to a token leave the mint short by
        // less than a minimum UTxO. A top-up of 0.97 ADA would join the 1.5 ADA as collateral with
        // a return of 0.47 ADA, below its minimum; one of 2 ADA + 969_750 is the collateral alone.
        const utxos = [
            utxo({ address: ownerAddress, lovelace: 1_500_000n, txId: 'd5'.repeat(32), index: 0 }),
            utxo({ address: ownerAddress, lovelace: 500_000n, txId: 'd5'.repeat(32), index: 1 }),
            utxo({ address: ownerAddress, lovelace: 5_000_000n, tokens: { [OTHER_TOKEN]: 5n }, txId: 'd5'.repeat(32), index: 2 }),
        ];
        const error = await failure(mint({ utxos }));
        expect(codeOf(error)).toBe('NOT_ENOUGH_ADA');
        expect(error.missing).toBe(chain.COLLATERAL_LOVELACE + 969_750);
        const { body } = decoded(await mint({ utxos: toppedUp(utxos, error.missing) }));
        expect(body.collateralInputs.map(outRef)).toEqual(['99'.repeat(32) + '#0']);
    });

    test('random wallets: the funds check is never more optimistic than the build, and the build refuses for funds only with NOT_ENOUGH_ADA or NO_COLLATERAL', async () => {
        // a fixed pseudo-random sequence (Park–Miller): the same wallets every run
        let state = 11;
        const next = limit => {
            state = (state * 48_271) % 2_147_483_647;
            return state % limit;
        };
        const tokens = ['c4'.repeat(28) + '01', 'c5'.repeat(28) + '02', 'c6'.repeat(28) + '03'];
        const seen = { built: 0, enough: 0, NOT_ENOUGH_ADA: 0, NO_COLLATERAL: 0 };
        for (let run = 0; run < 30; run++) {
            const utxos = Array.from({ length: 1 + next(5) }, (_, index) => {
                const held = tokens.filter(() => next(4) === 0);
                // 1 to 6 ADA; next to tokens at least 1.2 ADA, as a real UTxO with tokens holds
                const lovelace = 1_000_000 + next(5_000_000) + (held.length > 0 ? 200_000 : 0);
                return utxo({ address: ownerAddress, lovelace: BigInt(lovelace), tokens: Object.fromEntries(held.map(unit => [unit, BigInt(1 + next(100))])), txId: 'ab'.repeat(32), index });
            });
            const funds = fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE });
            const outcome = await mint({ utxos }).then(
                () => 'built',
                error => codeOf(error)
            );
            seen[outcome] = (seen[outcome] ?? 0) + 1;
            if (funds.enough) {
                seen.enough++;
                expect(outcome).toBe('built');
            }
            expect(['built', 'NOT_ENOUGH_ADA', 'NO_COLLATERAL']).toContain(outcome);
            if (outcome === 'NOT_ENOUGH_ADA') {
                const { missing } = await failure(mint({ utxos }));
                await expect(mint({ utxos: toppedUp(utxos, missing) })).resolves.toMatchObject({ kind: 'mint' });
            }
        }
        // the wallets reach the outcomes that matter
        expect(seen.enough).toBeGreaterThan(0);
        expect(seen.NOT_ENOUGH_ADA).toBeGreaterThan(0);
    }, 120_000);

    test('ADA in many small parts means no collateral', async () => {
        const parts = Array.from({ length: 12 }, (_, index) => utxo({ address: ownerAddress, lovelace: 600_000n, txId: 'e1'.repeat(32), index }));
        expect(codeOf(await failure(mint({ utxos: parts })))).toBe('NO_COLLATERAL');
    });

    describe('a collateral return below the minimum UTxO', () => {
        // The collateral is COLLATERAL_LOVELACE of up to three UTxOs (pure ADA first, the largest
        // first, as few as cover it); what they hold beyond it goes back to the owner's address in
        // the collateral return, which must then hold the minimum UTxO: 969_750 lovelace for ADA
        // alone at a base address with the fixture's coinsPerUtxoByte (4310), as the SDK computes it.
        const RETURN_MIN = 969_750;
        const at = (lovelace, index) => utxo({ address: ownerAddress, lovelace: BigInt(lovelace), txId: 'e2'.repeat(32), index });
        // two of 999_999 and a third: the third's lovelace minus 2 is the return; six of 0.9 ADA
        // after them bring the wallet to over 8 ADA, enough for the mint and its 2 ADA fee
        const wallet = third => [at(999_999, 0), at(999_999, 1), at(third, 2), ...[3, 4, 5, 6, 7, 8].map(index => at(900_000, index))];

        test('ten UTxOs of 0.7 ADA: enough ADA in all, but a return of 0.1 ADA → NO_COLLATERAL', async () => {
            const parts = Array.from({ length: 10 }, (_, index) => at(700_000, index));
            expect(fundsCheck({ utxos: parts, kind: 'mint', gameFee: RARE_FEE }).collateral).toBe(false);
            expect(codeOf(await failure(mint({ utxos: parts })))).toBe('NO_COLLATERAL');
        });

        // nine UTxOs, three of them the collateral: three inputs and two collateral inputs more
        // than the network fee estimate covers
        const NEEDED = chain.MINT_NEEDED_ESTIMATE_LOVELACE + 2_000_000 + (3 + 2) * chain.MINT_FEE_PER_INPUT_LOVELACE;

        test('a return one lovelace below the minimum → NO_COLLATERAL', async () => {
            const utxos = wallet(RETURN_MIN + 1);
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE })).toEqual({ enough: false, missing: 0, needed: NEEDED, collateral: false });
            expect(codeOf(await failure(mint({ utxos })))).toBe('NO_COLLATERAL');
        });

        test('a return of exactly the minimum builds', async () => {
            const utxos = wallet(RETURN_MIN + 2);
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE })).toEqual({ enough: true, missing: 0, needed: NEEDED, collateral: true });
            const { body } = decoded(await mint({ utxos }));
            expect(body.collateralInputs.map(outRef)).toEqual([0, 1, 2].map(index => outRef(utxos[index])));
            expect(Number(body.collateralReturn.assets.lovelace)).toBe(RETURN_MIN);
        });

        test('no return at all builds: two UTxOs of exactly 1 ADA among many', async () => {
            const utxos = Array.from({ length: 8 }, (_, index) => at(1_000_000, index));
            expect(fundsCheck({ utxos, kind: 'mint', gameFee: RARE_FEE }).collateral).toBe(true);
            const { body } = decoded(await mint({ utxos }));
            expect(body.collateralInputs).toHaveLength(2);
            expect(body.collateralReturn).toBeUndefined();
        });

        test('the fixture parameters are the ones the funds check assumes', () => {
            expect(params.coinsPerUtxoByte).toBe(4310n);
        });
    });

    test('ADA only next to tokens still works', async () => {
        const mixed = utxo({ address: ownerAddress, lovelace: 10_000_000n, tokens: { [OTHER_TOKEN]: 5n }, txId: 'f1'.repeat(32), index: 0 });
        const result = await mint({ utxos: [mixed] });
        const { body } = decoded(result);
        expect(result.seed).toBe(outRef(mixed));
        expect(body.inputs.map(outRef)).toEqual([outRef(mixed)]);
        // the other token stays in the wallet
        expect(outputsAt(body, ownerAddress).some(output => Assets.getByUnit(output.assets, OTHER_TOKEN) === 5n)).toBe(true);
    });

    test('the keys of every wallet address spent from are required witnesses', async () => {
        // a second payment key of the same wallet (same stake key)
        const second = fixtureKey('owner-2');
        const elsewhere = utxo({ address: second.baseAddress('owner-stake'), lovelace: 30_000_000n, txId: 'f2'.repeat(32), index: 0 });
        const result = await mint({ utxos: [elsewhere] });
        expect(result.requiredWitnesses).toEqual([owner.keyHash, second.keyHash].sort());
    });

    describe('what the node takes: maxValSize and maxTxSize', () => {
        // a pure 3 ADA UTxO and three of `count` tokens each (32-byte names under one policy) on
        // 9.2 ADA: the mint spends all four, and the change carries every token
        const POLICY = 'c4'.repeat(28);
        const tokenWallet = count => [
            utxo({ address: ownerAddress, lovelace: 3_000_000n, txId: 'e0'.repeat(32), index: 0 }),
            ...[0, 1, 2].map(i =>
                utxo({
                    address: ownerAddress,
                    lovelace: 9_200_000n,
                    tokens: Object.fromEntries(Array.from({ length: count }, (_, j) => [POLICY + (i * count + j).toString(16).padStart(64, '0'), 1n])),
                    txId: `e${i + 1}`.repeat(32),
                    index: 0,
                })
            ),
        ];
        const largestValue = result => Math.max(...decoded(result).body.outputs.map(output => Assets.toCBORBytes(output.assets).length));

        test('141 tokens in the change, a value of 4974 bytes: it builds (the fixture has maxValSize 5000)', async () => {
            expect(params.maxValSize).toBe(5000);
            const result = await mint({ utxos: tokenWallet(47) });
            expect(decoded(result).body.inputs).toHaveLength(4);
            expect(largestValue(result)).toBe(4974);
        });

        test('144 tokens, a value of 5079 bytes → TOO_MANY_TOKENS; with maxValSize 5079 it would build', async () => {
            const error = await failure(mint({ utxos: tokenWallet(48) }));
            expect(codeOf(error)).toBe('TOO_MANY_TOKENS');
            expect(error.message).toBe('TOO_MANY_TOKENS');
            expect(largestValue(await mint({ utxos: tokenWallet(48), params: { ...params, maxValSize: 5079 } }))).toBe(5079);
        });

        test('the signed transaction above maxTxSize → TX_TOO_LARGE; at it, it builds', async () => {
            const built = await mint();
            const walletSigned = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitness(built.cbor, [owner.privateKey]), requiredWitnesses: built.requiredWitnesses });
            const size = addServerWitness({ cbor: walletSigned.cbor, bodyHash: built.bodyHash, key: server }).cbor.length / 2;
            expect(codeOf(await failure(mint({ params: { ...params, maxTxSize: size - 1 } })))).toBe('TX_TOO_LARGE');
            expect((await mint({ params: { ...params, maxTxSize: size } })).cbor).toBe(built.cbor);
        });
    });
});

describe('a mint the config does not allow', () => {
    test('a paused config → PAUSED', async () => {
        expect(codeOf(await failure(mint({ contracts: fixtureContracts({ paused: true }) })))).toBe('PAUSED');
    });

    test('a server key the config does not list → SERVER_KEY_NOT_IN_CONFIG', async () => {
        expect(codeOf(await failure(mint({ serverKeyHash: fixtureKey('another-server').keyHash })))).toBe('SERVER_KEY_NOT_IN_CONFIG');
    });

    test('a datum the validator refuses fails the build: BUILD_FAILED with the reason as cause', async () => {
        // CIP-68 version 2: the items validator wants version 1
        mockDatum = ({ item, userAssetName }) => {
            const datum = jest.requireActual('../src/chain/names').itemDatum({ item, userAssetName });
            return Data.constr(0n, [datum.fields[0], 2n, datum.fields[2]]);
        };
        try {
            const error = await failure(mint());
            expect(codeOf(error)).toBe('BUILD_FAILED');
            expect(error.message).toBe('BUILD_FAILED');
            expect(error.cause).toMatch(/Script evaluation failed/);
            expect(error.cause).toMatch(/Mint\[0\]/);
        } finally {
            mockDatum = undefined;
        }
    });
});

describe('the item a mint names', () => {
    test("the datum's name is the English name of the key; a name the caller passes is ignored", async () => {
        const result = await mint({ item: { ...DARK_WALLS, name: 'Something else' } });
        const [locked] = outputsAt(decoded(result).body, contracts.itemsAddress);
        const metadata = new Map([...locked.datumOption.data.fields[0]].map(([key, value]) => [Buffer.from(key).toString('utf8'), value]));
        expect(Buffer.from(metadata.get('name')).toString('utf8')).toBe('Dark chocolate walls');
        expect(metadata.get('serial')).toBe(7n);
        expect((await mint({ item: DARK_WALLS })).cbor).toBe(result.cbor);
    });

    test('a serial that is not a positive safe integer → BAD_ITEM', async () => {
        for (const serial of [0, -1, 1.5, '7', 2 ** 53, undefined, null]) {
            expect(codeOf(await failure(mint({ item: { key: 'DARK_WALLS', serial } })))).toBe('BAD_ITEM');
        }
    });

    test('an item without an English name → BAD_ITEM, so no empty name is ever written on chain', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(codeOf(await failure(mint({ item: { key: 'NAMELESS', serial: 1 } })))).toBe('BAD_ITEM');
            // refused without asking the translations for a text they do not have
            expect(error).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            error.mockRestore();
            warn.mockRestore();
        }
    });
});

describe('the owner of a subject', () => {
    const second = fixtureKey('owner-2');
    const at = (address, lovelace, txId, index = 0) => utxo({ address, lovelace, txId, index });

    test('a stake subject: the richest base address with that stake key and a key payment part', () => {
        const utxos = [
            at(ownerAddress, 5_000_000n, '01'.repeat(32)),
            at(ownerAddress, 4_000_000n, '02'.repeat(32)),
            at(second.baseAddress('owner-stake'), 8_000_000n, '03'.repeat(32)),
            // the stake key's own enterprise address is no base address
            at(stake.enterpriseAddress, 50_000_000n, '04'.repeat(32)),
            // another stake key
            at(second.baseAddress('someone-else'), 90_000_000n, '05'.repeat(32)),
            // a script payment part with that stake key
            at(Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('7e'.repeat(28)), stakingCredential: KeyHash.fromHex(stake.keyHash) })), 70_000_000n, '06'.repeat(32)),
        ];
        // 9 ADA at the owner's address (two UTxOs) beats 8 ADA at the second one
        expect(ownerOf({ utxos, subject: `stake:${stake.keyHash}`, network: preprod })).toEqual({ keyHash: owner.keyHash, address: ownerAddress });
    });

    test('a tie goes to the address with the lowest out-ref', () => {
        const utxos = [at(ownerAddress, 5_000_000n, '09'.repeat(32)), at(second.baseAddress('owner-stake'), 5_000_000n, '08'.repeat(32), 3)];
        expect(ownerOf({ utxos, subject: `stake:${stake.keyHash}`, network: preprod }).keyHash).toBe(second.keyHash);
    });

    test('a pay subject: the addresses with that payment key, with or without a stake part', () => {
        const utxos = [at(owner.enterpriseAddress, 3_000_000n, '01'.repeat(32)), at(ownerAddress, 2_000_000n, '02'.repeat(32)), at(second.enterpriseAddress, 9_000_000n, '03'.repeat(32))];
        expect(ownerOf({ utxos, subject: `pay:${owner.keyHash}`, network: preprod })).toEqual({ keyHash: owner.keyHash, address: owner.enterpriseAddress });
    });

    test('nothing matching → NO_OWNER_ADDRESS', () => {
        const utxos = [at(second.enterpriseAddress, 9_000_000n, '03'.repeat(32))];
        for (const subject of [`stake:${stake.keyHash}`, `pay:${owner.keyHash}`]) {
            expect(codeOf(thrown(() => ownerOf({ utxos, subject, network: preprod })))).toBe('NO_OWNER_ADDRESS');
        }
        expect(codeOf(thrown(() => ownerOf({ utxos: [], subject: `pay:${owner.keyHash}`, network: preprod })))).toBe('NO_OWNER_ADDRESS');
    });

    test('a mainnet UTxO → WRONG_NETWORK', () => {
        const mainnetAddress = Address.toBech32(new Address.Address({ networkId: 1, paymentCredential: KeyHash.fromHex(owner.keyHash) }));
        const utxos = [at(ownerAddress, 5_000_000n, '01'.repeat(32)), at(mainnetAddress, 5_000_000n, '02'.repeat(32))];
        expect(codeOf(thrown(() => ownerOf({ utxos, subject: `pay:${owner.keyHash}`, network: preprod })))).toBe('WRONG_NETWORK');
    });
});

describe('the funds check', () => {
    const ada = (lovelace, index, extra = {}) => utxo({ address: ownerAddress, lovelace, txId: '77'.repeat(32), index, ...extra });

    test('a mint needs the estimate (the change reserve in it) and the game fee, and collateral', () => {
        const needed = chain.MINT_NEEDED_ESTIMATE_LOVELACE;
        expect(fundsCheck({ utxos: [ada(needed + 1_000_000, 0)], kind: 'mint', gameFee: COMMON_FEE })).toEqual({ enough: true, missing: 0, needed: needed + 1_000_000, collateral: true });
        expect(fundsCheck({ utxos: [ada(needed, 0)], kind: 'mint', gameFee: COMMON_FEE })).toEqual({ enough: false, missing: 1_000_000, needed: needed + 1_000_000, collateral: true });
        expect(fundsCheck({ utxos: [ada(needed, 0)], kind: 'mint' })).toEqual({ enough: true, missing: 0, needed, collateral: true });
    });

    test("the change must carry the wallet's tokens: more than the reserve when they need it", () => {
        const many = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`${'c7'.repeat(28)}0${i}`, 1n]));
        const needed = chain.MINT_NEEDED_ESTIMATE_LOVELACE;
        const { missing } = fundsCheck({ utxos: [ada(needed, 0, { tokens: many })], kind: 'mint' });
        expect(missing).toBeGreaterThan(0);
    });

    test('only spendable UTxOs count: not those with a datum or a reference script, nor script addresses', () => {
        const script = utxo({ address: contracts.itemsAddress, lovelace: 50_000_000n, txId: '78'.repeat(32), index: 0 });
        const utxos = [ada(50_000_000, 1, { datum: 42n }), ada(50_000_000, 2, { scriptRef: contracts.items.script }), script];
        expect(fundsCheck({ utxos, kind: 'mint' })).toEqual({ enough: false, missing: chain.MINT_NEEDED_ESTIMATE_LOVELACE, needed: chain.MINT_NEEDED_ESTIMATE_LOVELACE, collateral: false });
    });

    test('collateral: the three largest UTxOs, pure ADA first, hold the collateral', () => {
        const small = Array.from({ length: 12 }, (_, index) => ada(600_000, index));
        expect(fundsCheck({ utxos: small, kind: 'mint' }).collateral).toBe(false);
        // pure ADA comes before a 10 ADA UTxO with a token: two of 1 ADA are the collateral exactly,
        // three of 0.6 ADA are too little, and the 10 ADA are never reached
        const withToken = ada(10_000_000, 20, { tokens: { [OTHER_TOKEN]: 1n } });
        expect(fundsCheck({ utxos: [...[0, 1].map(index => ada(1_000_000, index)), withToken], kind: 'mint' }).collateral).toBe(true);
        expect(fundsCheck({ utxos: [...[0, 1, 2].map(index => ada(600_000, index)), withToken], kind: 'mint' }).collateral).toBe(false);
    });

    test('a burn needs only collateral', () => {
        expect(fundsCheck({ utxos: [ada(2_000_000, 0)], kind: 'burn' })).toEqual({ enough: true, missing: 0, needed: 0, collateral: true });
        expect(fundsCheck({ utxos: [ada(1_900_000, 0)], kind: 'burn' })).toEqual({ enough: false, missing: 0, needed: 0, collateral: false });
    });
});

describe('the config of a deployment', () => {
    const blueprint = loadBlueprint();
    const configNft = contracts.configPolicyId + CONFIG_TOKEN_NAME;
    const configRef = outRef(contracts.configUtxo);
    const providerOf = ({ byUnit, byRef }) => ({
        utxoByUnit: jest.fn(async unit => (unit === configNft ? byUnit : undefined)),
        utxoByRef: jest.fn(async ref => (ref === configRef ? byRef : undefined)),
    });
    const read = (provider, extra) => readConfig({ provider, blueprint, policyId: contracts.policyId, network: preprod, ...extra });

    test('found by its NFT, wherever it is', async () => {
        const provider = providerOf({ byUnit: contracts.configUtxo });
        expect(await read(provider, { configPolicyId: contracts.configPolicyId })).toEqual(contracts);
        expect(provider.utxoByUnit).toHaveBeenCalledWith(configNft);
    });

    test('found by its out-ref', async () => {
        const provider = providerOf({ byRef: contracts.configUtxo });
        expect(await read(provider, { configRef })).toEqual(contracts);
        expect(provider.utxoByRef).toHaveBeenCalledWith(configRef);
    });

    test('a spent out-ref → CONFIG_NOT_FOUND', async () => {
        expect(codeOf(await failure(read(providerOf({}), { configRef })))).toBe('CONFIG_NOT_FOUND');
        expect(codeOf(await failure(read(providerOf({}), { configPolicyId: contracts.configPolicyId })))).toBe('CONFIG_NOT_FOUND');
    });

    test('with both, the NFT wins', async () => {
        const stale = utxo({ address: ownerAddress, lovelace: 2_000_000n, txId: 'ee'.repeat(32), index: 0 });
        const provider = providerOf({ byUnit: contracts.configUtxo, byRef: stale });
        expect(await read(provider, { configRef, configPolicyId: contracts.configPolicyId })).toEqual(contracts);
        expect(provider.utxoByRef).not.toHaveBeenCalled();
    });

    test("contractsFor's errors pass through unchanged", async () => {
        const noNft = utxo({ address: ownerAddress, lovelace: 2_000_000n, txId: 'ee'.repeat(32), index: 0 });
        const error = await failure(read(providerOf({ byRef: noNft }), { configRef }));
        expect(error).toBeInstanceOf(ChainConfigError);
        expect(error.code).toBe('CONFIG_NOT_FOUND');
        const mismatch = await failure(readConfig({ provider: providerOf({ byRef: contracts.configUtxo }), blueprint, policyId: 'ff'.repeat(28), network: preprod, configRef }));
        expect(mismatch).toBeInstanceOf(ChainConfigError);
        expect(mismatch.code).toBe('POLICY_MISMATCH');
    });
});

describe('a ChainTxError', () => {
    test('names its code and nothing else', () => {
        const error = new ChainTxError('NOT_ENOUGH_ADA', { missing: 1_000_000 });
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ChainTxError');
        expect(error.message).toBe('NOT_ENOUGH_ADA');
        expect(error.code).toBe('NOT_ENOUGH_ADA');
        expect(error.missing).toBe(1_000_000);
    });
});
