// Measures what a mint and a burn cost, offline: for every item it builds a mint and a burn with
// buildMint and buildBurn against the test fixtures (the fixed preprod protocol parameters of
// test/fixtures/chain/preprod-params.json, the real blueprint, the local Aiken evaluator: the
// same machine the ledger's execution costs come from) and prints what each one takes, the
// maxima, and the estimate constants of packages/shared/chain.js the rule gives:
//
//   network-fee estimates = max × 1.1, rounded up to 10_000 lovelace
//   deposit estimate      = max of reference + user deposit, rounded up to 10_000 lovelace
//   per input, per key    = the largest measured step × 1.1, rounded up to 100 lovelace
//   per change byte       = the largest measured step × 1.1, rounded up to 1 lovelace
//
// It also prints the minimum UTxO of the fee output (plain ADA, no datum, at the treasury's
// enterprise script address), by the SDK's own min-UTxO function: the smallest fee (COMMON) must
// clear it. Re-run when the protocol parameters, the validators or the datum change, and when
// test/chain.costs.test.js says an estimate drifted.
//
//   node apps/api/scripts/chain/measure-costs.js [--json]
//
// The cases: every item (its English name, serial 1_000_000) in each wallet below, with the
// preprod fee (one ADA option, 1 / 2 / 4 ADA by tier, all to the treasury); and one item per tier
// with the fee split 9:1 between the treasury and a team's base address, where the team's share
// is below the minimum UTxO and the build raises it. Each burn salvages the item its mint made.
//
// And what the funds check adds for a wallet larger than those (the marginal costs): the network
// fee of the largest case's mint (an EPIC item, the split fee) as the build must spend more
// inputs (all at one key), as the same inputs sit at more of the wallet's keys, and as the
// change carries more tokens (per byte of the change output).

const { Address, Assets, Effect, Transaction, TransactionHash, TxOut, UTxO } = require('@evolution-sdk/evolution');
// a public subpath of the package (its `./*` export), not in the root index
const { calculateMinimumUtxoLovelace } = require('@evolution-sdk/evolution/sdk/builders/internal/txBuilder');
const { Items, chain } = require('@battlechoc/battlechoc-shared-functions');
const { buildBurn, buildMint } = require('../../src/chain/tx');
const { TIP, TEAM_ADDRESS, loadParams, fixtureKey, fixtureContracts, utxo } = require('../../test/helpers/chain');

const SERIAL = 1_000_000;
const ROUNDING = 10_000;
const MARGINAL_ROUNDING = 100;

// the owner's wallet: a first payment key at a base address (the longest key address) and at its
// enterprise address, and a second payment key of the same wallet (same stake key)
const ownerKey = fixtureKey('owner');
const secondKey = fixtureKey('owner-2');
const serverKey = fixtureKey('server');
const BASE = ownerKey.baseAddress('owner-stake');
const BASE_2 = secondKey.baseAddress('owner-stake');
const ENTERPRISE = ownerKey.enterpriseAddress;
// tokens of another policy the wallet holds: they ride in the change
const OTHER_TOKENS = ['c4', 'c5', 'c6'].map(policy => ({ [`${policy.repeat(28)}01`]: 5n, [`${policy.repeat(28)}02`]: 7n }));

const ada = n => BigInt(Math.round(n * 1_000_000));
const at = (address, lovelace, index, tokens = {}) => utxo({ address, lovelace: ada(lovelace), tokens, txId: 'a1'.repeat(32), index });

/**
 * The wallets of the measured mints: { name, owner ({ keyHash, address }), utxos, keys (the
 * wallet keys the mint needs), inputs (at least as many wallet inputs), tokensInChange }.
 */
const WALLETS = [
    {
        name: 'one key, one UTxO, base address',
        owner: { keyHash: ownerKey.keyHash, address: BASE },
        utxos: [at(BASE, 20, 0)],
        keys: 1,
        inputs: 1,
        tokensInChange: false,
    },
    {
        name: 'one key, one UTxO, enterprise address',
        owner: { keyHash: ownerKey.keyHash, address: ENTERPRISE },
        utxos: [at(ENTERPRISE, 20, 0)],
        keys: 1,
        inputs: 1,
        tokensInChange: false,
    },
    {
        // neither UTxO covers even a COMMON mint alone
        name: 'two keys, two UTxOs',
        owner: { keyHash: ownerKey.keyHash, address: BASE },
        utxos: [at(BASE, 5, 0), at(BASE_2, 5, 1)],
        keys: 2,
        inputs: 2,
        tokensInChange: false,
    },
    {
        // the seed (3.5 ADA, the collateral by itself with a return above the minimum) and small
        // UTxOs at both keys, three of them next to tokens: a mint spends three to six of them
        name: 'two keys, many small UTxOs, tokens in the change',
        owner: { keyHash: ownerKey.keyHash, address: BASE },
        utxos: [
            at(BASE, 3.5, 0),
            at(BASE_2, 1.5, 1, OTHER_TOKENS[0]),
            at(BASE, 1.5, 2, OTHER_TOKENS[1]),
            at(BASE_2, 1.5, 3, OTHER_TOKENS[2]),
            at(BASE_2, 1.5, 4),
            at(BASE, 1.5, 5),
            at(BASE_2, 1.5, 6),
        ],
        keys: 2,
        inputs: 3,
        tokensInChange: true,
    },
];

// the wallets of the split fee: the simplest and the hardest
const SPLIT_FEE_WALLETS = [WALLETS[0], WALLETS[3]];

// the preprod fee, and the fee split 9:1 between the treasury and a team's base address
const preprodContracts = () => fixtureContracts();
const splitContracts = () => {
    const { treasuryAddress } = preprodContracts();
    const receivers = [
        { address: treasuryAddress, share: 9 },
        { address: TEAM_ADDRESS, share: 1 },
    ];
    return fixtureContracts({ fees: [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers }] });
};

const roundUp = lovelace => Math.ceil(lovelace / ROUNDING) * ROUNDING;
const withMargin = lovelace => Math.ceil((lovelace * 11) / 10);
/** The estimates the rule gives for these maxima (lovelace). */
const estimatesOf = ({ mintNetworkFee, deposit, burnNetworkFee, perInput, perKey, perChangeByte, inputs, walletKeys }) => ({
    MINT_NETWORK_FEE_ESTIMATE_LOVELACE: roundUp(withMargin(mintNetworkFee)),
    MINT_DEPOSIT_ESTIMATE_LOVELACE: roundUp(deposit),
    BURN_NETWORK_FEE_ESTIMATE_LOVELACE: roundUp(withMargin(burnNetworkFee)),
    MINT_NETWORK_FEE_ESTIMATE_INPUTS: inputs,
    MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS: walletKeys,
    MINT_FEE_PER_INPUT_LOVELACE: Math.ceil(withMargin(perInput) / MARGINAL_ROUNDING) * MARGINAL_ROUNDING,
    MINT_FEE_PER_WALLET_KEY_LOVELACE: Math.ceil(withMargin(perKey) / MARGINAL_ROUNDING) * MARGINAL_ROUNDING,
    MINT_FEE_PER_CHANGE_BYTE_LOVELACE: Math.ceil((perChangeByte * 11) / 10),
});

const unitOf = (contracts, name) => contracts.policyId + name;

// The UTxOs a built mint leaves: its store (the reference token at the items script, with the
// datum) and the user token's output, as a later burn spends them.
const outputsOfMint = (mint, contracts) => {
    const { body } = Transaction.fromCBORHex(mint.cbor);
    const transactionId = TransactionHash.fromHex(mint.bodyHash);
    const find = name => {
        const index = body.outputs.findIndex(output => Assets.getByUnit(output.assets, unitOf(contracts, name)) === 1n);
        const output = body.outputs[index];
        return new UTxO.UTxO({ transactionId, index: BigInt(index), address: output.address, assets: output.assets, datumOption: output.datumOption });
    };
    return { store: find(mint.assetName.reference), user: find(mint.assetName.user), body };
};

// What one mint measured: the case, its costs and what the transaction looks like.
const mintRow = ({ item, wallet, fee, contracts, result }) => {
    const { body } = outputsOfMint(result, contracts);
    const owned = new Set([BASE, BASE_2, ENTERPRISE]);
    const change = body.outputs.filter(output => owned.has(Address.toBech32(output.address)) && Assets.getByUnit(output.assets, unitOf(contracts, result.assetName.user)) === 0n);
    const gameFee = result.gameFee ? result.gameFee.paid : 0;
    return {
        kind: 'mint',
        item,
        tier: Items[item].tier,
        wallet: wallet.name,
        fee,
        networkFee: result.networkFee,
        gameFee: result.gameFee ? result.gameFee.amount : 0,
        gameFeePaid: gameFee,
        deposits: result.deposits,
        deposit: result.deposit,
        leaving: result.networkFee + result.deposit + gameFee,
        inputs: body.inputs.length,
        walletKeys: result.requiredWitnesses.length,
        tokensInChange: change.some(output => Assets.hasMultiAsset(output.assets)),
        bytes: result.cbor.length / 2,
    };
};

const mintOf = ({ item, wallet, contracts }) =>
    buildMint({ item: { key: item, serial: SERIAL }, fee: 0, owner: wallet.owner, utxos: wallet.utxos, params: loadParams(), tip: TIP, contracts, serverKeyHash: serverKey.keyHash });

/**
 * The burns of the item `mint` made (with `contracts`): the game's burn (the server signs too)
 * from the owner's wallet with the user token where the mint put it, and the same with the user
 * token at the wallet's second key next to other tokens, which ride on in the change.
 */
const burnsOf = async ({ item, mint, contracts }) => {
    const { store, user } = outputsOfMint(mint, contracts);
    const collateral = at(BASE, 5, 9);
    const elsewhere = utxo({
        address: BASE_2,
        lovelace: Assets.lovelaceOf(user.assets),
        tokens: { [unitOf(contracts, mint.assetName.user)]: 1n, ...OTHER_TOKENS[0] },
        txId: 'b1'.repeat(32),
        index: 0,
    });
    const cases = [
        { wallet: 'one key: the user token where the mint put it', holder: { keyHash: ownerKey.keyHash, address: BASE }, utxos: [user, collateral], keys: 1 },
        { wallet: 'two keys: the user token at the second key, next to tokens', holder: { keyHash: ownerKey.keyHash, address: BASE }, utxos: [elsewhere, collateral], keys: 2 },
    ];
    const rows = [];
    for (const burn of cases) {
        const result = await buildBurn({
            assetName: mint.assetName.user,
            holder: burn.holder,
            utxos: burn.utxos,
            reference: store,
            params: loadParams(),
            tip: TIP,
            contracts,
            serverKeyHash: serverKey.keyHash,
        });
        rows.push({
            kind: 'burn',
            item,
            tier: Items[item].tier,
            wallet: burn.wallet,
            networkFee: result.networkFee,
            deposits: result.deposits,
            // what comes back to the wallet less the network fee: negative, the holder gains
            leaving: result.networkFee - result.deposits.reference,
            walletKeys: result.requiredWitnesses.length,
            expectedKeys: burn.keys,
            bytes: result.cbor.length / 2,
        });
    }
    return rows;
};

// the item of each tier with the largest reference deposit in the preprod mints
const largestOfEachTier = mints =>
    chain.TIER_ORDER.map(tier => mints.filter(row => row.tier === tier).reduce((best, row) => (best && best.deposits.reference >= row.deposits.reference ? best : row), undefined).item);

// ---------------------------------------------------------------------------------------------
// The marginal costs: the largest case's mint with more inputs, keys and change tokens

const MARGINAL_ITEM = 'TURBO_CONVEYOR';
const INPUT_STEPS = [1, 6, 11, 16, 21, 26, 31];
const KEY_STEPS = [1, 2, 3, 4, 6, 12];
const KEY_STEP_INPUTS = 12;
const TOKEN_STEPS = [2, 10, 20, 40, 80];

// the payment key `k` of the owner's wallet (0: the owner's own), at a base address
const walletKeyAddress = k => (k === 0 ? BASE : fixtureKey(`owner-${k + 1}`).baseAddress('owner-stake'));
// `count` NFTs with 20-byte names of count / 2 policies
const nfts = count => Object.fromEntries(Array.from({ length: count }, (_, i) => [`${(0x10 + (i % Math.max(1, count / 2))).toString(16).padStart(2, '0').repeat(28)}${Buffer.from(`nft-${String(i).padStart(16, '0')}`).toString('hex')}`, 1n]));

const mintFrom = (utxos, contracts) =>
    buildMint({ item: { key: MARGINAL_ITEM, serial: SERIAL }, fee: 0, owner: { keyHash: ownerKey.keyHash, address: BASE }, utxos, params: loadParams(), tip: TIP, contracts, serverKeyHash: serverKey.keyHash });

// The mint spending exactly `inputs` small UTxOs at `keys` of the wallet's keys (round robin),
// next to two pure UTxOs at the owner's address: 5 ADA (the collateral) and the top-up the build
// names for the rest, so that all of them must be spent. Small: 0.1 ADA each, which only a
// measurement may hold (the size of an input does not depend on its lovelace).
const forcedInputs = async ({ inputs, keys, contracts }) => {
    const small = Array.from({ length: inputs }, (_, i) => utxo({ address: walletKeyAddress(i % keys), lovelace: 100_000n, txId: (0x100 + i).toString(16).padStart(64, '0'), index: 0 }));
    const wallet = [utxo({ address: BASE, lovelace: 5_000_000n, txId: 'ed'.repeat(32), index: 0 }), ...small];
    const missing = await mintFrom(wallet, contracts).then(
        () => {
            throw new Error(`the small UTxOs alone pay for the mint (${inputs} inputs)`);
        },
        error => {
            if (error.code !== 'NOT_ENOUGH_ADA') {
                throw error;
            }
            return error.missing;
        }
    );
    const result = await mintFrom([utxo({ address: BASE, lovelace: BigInt(missing), txId: 'ee'.repeat(32), index: 0 }), ...wallet], contracts);
    const spent = Transaction.fromCBORHex(result.cbor).body.inputs.length;
    if (spent !== inputs + 2 || result.requiredWitnesses.length !== keys) {
        throw new Error(`expected ${inputs + 2} inputs at ${keys} keys, the build spent ${spent} at ${result.requiredWitnesses.length}`);
    }
    return result.networkFee;
};

// The mint from a pure UTxO of 5 ADA (the seed and the collateral, its return pure ADA) and one
// of 40 ADA next to `count` NFTs, which the build must spend too: its network fee and the size of
// its change output (the NFTs ride in it).
const withTokens = async ({ count, contracts }) => {
    const wallet = [utxo({ address: BASE, lovelace: 5_000_000n, txId: 'ed'.repeat(32), index: 0 }), utxo({ address: BASE, lovelace: 40_000_000n, tokens: nfts(count), txId: 'ef'.repeat(32), index: 0 })];
    const result = await mintFrom(wallet, contracts);
    const { body } = Transaction.fromCBORHex(result.cbor);
    const change = body.outputs.filter(output => Address.toBech32(output.address) === BASE && Assets.getByUnit(output.assets, unitOf(contracts, result.assetName.user)) === 0n);
    if (change.length !== 1 || body.collateralReturn === undefined || Assets.hasMultiAsset(body.collateralReturn.assets)) {
        throw new Error('expected one change output and a collateral return of pure ADA');
    }
    return { networkFee: result.networkFee, changeBytes: TxOut.toCBORBytes(change[0]).length };
};

// the largest step of `points` ([x, fee]): the most fee one more x costs
const largestStep = points => Math.max(...points.slice(1).map(([x, fee], i) => (fee - points[i][1]) / (x - points[i][0])));

/**
 * The marginal costs: { perInput, perKey, perChangeByte } (the largest step of each series,
 * lovelace) and the series themselves ({ inputs, keys, tokens }: [x, network fee]).
 */
const measureMarginals = async () => {
    const contracts = splitContracts();
    const inputs = [];
    for (const n of INPUT_STEPS) {
        inputs.push([n, await forcedInputs({ inputs: n, keys: 1, contracts })]);
    }
    const keys = [];
    for (const k of KEY_STEPS) {
        keys.push([k, await forcedInputs({ inputs: KEY_STEP_INPUTS, keys: k, contracts })]);
    }
    const tokens = [];
    for (const count of TOKEN_STEPS) {
        const { networkFee, changeBytes } = await withTokens({ count, contracts });
        tokens.push([changeBytes, networkFee, count]);
    }
    return { perInput: largestStep(inputs), perKey: largestStep(keys), perChangeByte: largestStep(tokens), series: { inputs, keys, tokens } };
};

/**
 * The minimum UTxO of the battlechoc fee's output: plain ADA, no datum, no tokens, at the
 * treasury's address, by the SDK's min-UTxO function with the fixture's coinsPerUtxoByte.
 */
const treasuryMinimumOf = contracts =>
    Number(
        Effect.runSync(
            calculateMinimumUtxoLovelace({ address: Address.fromBech32(contracts.treasuryAddress), assets: Assets.zero, coinsPerUtxoByte: loadParams().coinsPerUtxoByte })
        )
    );

// the row of a column's maximum
const maxBy = (rows, value) => rows.reduce((best, row) => (best && value(best) >= value(row) ? best : row), undefined);

/**
 * Measures every case: { mints, burns (a row each), maxima: { mintNetworkFee, deposit,
 * referenceDeposit, userDeposit, burnNetworkFee } (the row of each maximum), marginals
 * (measureMarginals), estimates (the rule's constants), treasury: { address, minimum,
 * commonFee } }.
 */
const measureCosts = async () => {
    const preprod = preprodContracts();
    const mints = [];
    const burns = [];
    for (const item of Object.keys(Items)) {
        for (const wallet of WALLETS) {
            const result = await mintOf({ item, wallet, contracts: preprod });
            mints.push(mintRow({ item, wallet, fee: 'preprod', contracts: preprod, result }));
            if (wallet === WALLETS[0]) {
                burns.push(...(await burnsOf({ item, mint: result, contracts: preprod })));
            }
        }
    }
    const split = splitContracts();
    for (const item of largestOfEachTier(mints)) {
        for (const wallet of SPLIT_FEE_WALLETS) {
            mints.push(mintRow({ item, wallet, fee: 'split 9:1, team share raised', contracts: split, result: await mintOf({ item, wallet, contracts: split }) }));
        }
    }

    const maxima = {
        mintNetworkFee: maxBy(mints, row => row.networkFee),
        deposit: maxBy(mints, row => row.deposit),
        referenceDeposit: maxBy(mints, row => row.deposits.reference),
        userDeposit: maxBy(mints, row => row.deposits.user),
        burnNetworkFee: maxBy(burns, row => row.networkFee),
    };
    const marginals = await measureMarginals();
    const estimates = estimatesOf({
        mintNetworkFee: maxima.mintNetworkFee.networkFee,
        deposit: maxima.deposit.deposit,
        burnNetworkFee: maxima.burnNetworkFee.networkFee,
        perInput: marginals.perInput,
        perKey: marginals.perKey,
        perChangeByte: marginals.perChangeByte,
        // the most inputs and wallet keys a measured mint spent: the network fee estimate covers
        // a wallet of that many (the largest case had both)
        inputs: Math.max(...mints.map(row => row.inputs)),
        walletKeys: Math.max(...mints.map(row => row.walletKeys)),
    });
    return {
        mints,
        burns,
        maxima,
        marginals,
        estimates,
        treasury: { address: preprod.treasuryAddress, minimum: treasuryMinimumOf(preprod), commonFee: preprod.config.fees[0].amounts[0] },
    };
};

const formatAda = lovelace => (lovelace / 1_000_000).toFixed(6);

const print = ({ mints, burns, maxima, marginals, estimates, treasury }) => {
    const params = loadParams();
    console.log(`Measured ${new Date().toISOString().slice(0, 10)} against test/fixtures/chain/preprod-params.json`);
    console.log(
        `  minFeeA ${params.minFeeA}, minFeeB ${params.minFeeB}, coinsPerUtxoByte ${params.coinsPerUtxoByte}, priceMem ${params.priceMem}, priceStep ${params.priceStep}, minFeeRefScriptCostPerByte ${params.minFeeRefScriptCostPerByte}`
    );
    console.log('\nmints: item, tier, wallet, fee, mint network fee, game fee (paid), reference deposit, user deposit, leaving the wallet, inputs, wallet keys');
    for (const row of mints) {
        console.log(
            [row.item, row.tier, row.wallet, row.fee, row.networkFee, `${row.gameFee} (${row.gameFeePaid})`, row.deposits.reference, row.deposits.user, row.leaving, row.inputs, row.walletKeys].join(', ')
        );
    }
    console.log('\nburns: item, tier, wallet, burn network fee, store deposit back, user token UTxO, wallet keys');
    for (const row of burns) {
        console.log([row.item, row.tier, row.wallet, row.networkFee, row.deposits.reference, row.deposits.user, row.walletKeys].join(', '));
    }
    console.log('\nmaxima:');
    console.log(`  mint network fee ${maxima.mintNetworkFee.networkFee} (${maxima.mintNetworkFee.item}, ${maxima.mintNetworkFee.wallet}, ${maxima.mintNetworkFee.fee})`);
    console.log(`  deposit          ${maxima.deposit.deposit} (${maxima.deposit.item}, ${maxima.deposit.wallet}): reference ${maxima.deposit.deposits.reference}, user ${maxima.deposit.deposits.user}`);
    console.log(`  burn network fee ${maxima.burnNetworkFee.networkFee} (${maxima.burnNetworkFee.item}, ${maxima.burnNetworkFee.wallet})`);
    console.log('\nmarginal costs of the largest case (network fee by inputs, by wallet keys at 12 inputs, by change bytes):');
    console.log(`  inputs: ${marginals.series.inputs.map(([n, fee]) => `${n} → ${fee}`).join(', ')}; largest step ${marginals.perInput.toFixed(1)}`);
    console.log(`  keys:   ${marginals.series.keys.map(([k, fee]) => `${k} → ${fee}`).join(', ')}; largest step ${marginals.perKey.toFixed(1)}`);
    console.log(`  change: ${marginals.series.tokens.map(([bytes, fee, count]) => `${count} NFTs ${bytes} B → ${fee}`).join(', ')}; largest step ${marginals.perChangeByte.toFixed(2)} per byte`);
    console.log('\nestimates (the rule) and packages/shared/chain.js today:');
    for (const [name, value] of Object.entries(estimates)) {
        console.log(`  ${name} = ${value}${name.endsWith('_LOVELACE') ? ` (${formatAda(value)} ADA)` : ''}; chain.js: ${chain[name]}`);
    }
    const needed = Math.max(chain.COLLATERAL_LOVELACE, estimates.MINT_NETWORK_FEE_ESTIMATE_LOVELACE + estimates.MINT_DEPOSIT_ESTIMATE_LOVELACE + chain.CHANGE_RESERVE_LOVELACE);
    console.log(`  MINT_NEEDED_ESTIMATE_LOVELACE = ${needed} (${formatAda(needed)} ADA); chain.js: ${chain.MINT_NEEDED_ESTIMATE_LOVELACE}`);
    console.log('\nthe fee output at the treasury (plain ADA, no datum):');
    console.log(`  ${treasury.address}: minimum ${treasury.minimum} (${formatAda(treasury.minimum)} ADA); the COMMON fee ${treasury.commonFee} ${treasury.commonFee > treasury.minimum ? 'clears it' : 'DOES NOT clear it'}`);
};

if (require.main === module) {
    measureCosts()
        .then(measured => {
            if (process.argv.includes('--json')) {
                console.log(JSON.stringify(measured, null, 2));
            } else {
                print(measured);
            }
        })
        .catch(error => {
            console.error(error.message);
            process.exit(1);
        });
}

module.exports = { WALLETS, SPLIT_FEE_WALLETS, SERIAL, estimatesOf, measureCosts, outputsOfMint, preprodContracts, splitContracts, treasuryMinimumOf };
