// The measured costs (plan B, Task 9): the estimates the game shows before the wallet opens
// (packages/shared/chain.js) against what buildMint and buildBurn really take, for every item in
// the wallets of scripts/chain/measure-costs.js. An estimate below any measured case fails, and so
// does one far above the largest (more than about 15 %): re-run the script and write its numbers.
// The same for what the funds check adds per input, key and change byte for a wallet larger than
// the measured ones. And the funds check that rests on them is never more optimistic than the
// build, at the boundary: a wallet it just calls enough builds, also one with many NFTs or keys.

const { Address, Assets, Effect, PrivateKey, Transaction, TransactionBody, TransactionHash, TransactionWitnessSet, UTxO } = require('@evolution-sdk/evolution');
const { calculateMinimumUtxoLovelace } = require('@evolution-sdk/evolution/sdk/builders/internal/txBuilder');
const { Items, chain } = require('@battlechoc/battlechoc-shared-functions');
const { buildBurn, buildMint, fundsCheck } = require('../src/chain/tx');
const { gameFeeOf } = require('../src/chain/fees');
const { TIP, loadParams, fixtureKey, ledgerMinimumFeeOf, utxo } = require('./helpers/chain');
const { WALLETS, SPLIT_FEE_WALLETS, SERIAL, measureCosts, outputsOfMint, preprodContracts, splitContracts, treasuryMinimumOf } = require('../scripts/chain/measure-costs');

const params = loadParams();
const server = fixtureKey('server');
const KEYS = { [fixtureKey('owner').keyHash]: fixtureKey('owner'), [fixtureKey('owner-2').keyHash]: fixtureKey('owner-2') };

// an estimate drifted too far above reality when the largest case is below this share of it
const LOWEST_SHARE = 0.85;

// `cbor` signed by every key the wallet needs and by the server, as it goes on chain
const fullySigned = (cbor, walletKeys) => {
    const message = TransactionHash.toBytes(TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cbor, 'hex'))));
    const keys = [...walletKeys.map(keyHash => KEYS[keyHash]), server];
    const witnesses = keys.map(({ privateKey }) => new TransactionWitnessSet.VKeyWitness({ vkey: PrivateKey.toPublicKey(privateKey), signature: PrivateKey.sign(privateKey, message) }));
    return Transaction.addVKeyWitnessesHex(cbor, TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses(witnesses)));
};

// a measured case, as a failure names it
const caseOf = row => `${row.kind} ${row.item} (${row.tier}), ${row.wallet}${row.fee ? `, ${row.fee} fee` : ''}`;

// The wallet `wallet` at the boundary of the funds check for a mint paying `gameFee`: its first
// UTxO (pure ADA) set to what the check finds missing (it may come out as dust: the check counts
// it all the same), the others kept from the front, as many as leave the check short without
// that UTxO and with collateral once it is there. The check says `enough` for it, with one
// lovelace less it would not.
const atTheBoundary = (wallet, gameFee) => {
    const [first, ...others] = wallet.utxos;
    const withFirst = lovelace =>
        new UTxO.UTxO({ transactionId: first.transactionId, index: first.index, address: first.address, assets: Assets.fromLovelace(BigInt(lovelace)) });
    for (let kept = others.length; kept >= 0; kept--) {
        const rest = others.slice(0, kept);
        const { missing } = fundsCheck({ utxos: [withFirst(0), ...rest], kind: 'mint', gameFee });
        const utxos = [withFirst(missing), ...rest];
        if (missing > 0 && fundsCheck({ utxos, kind: 'mint', gameFee }).enough) {
            return utxos;
        }
    }
    throw new Error(`no boundary wallet for ${wallet.name}`);
};

describe('the measured costs of minting and burning', () => {
    let measured;
    beforeAll(async () => {
        measured = await measureCosts();
    }, 120_000);

    test('every item was measured in every wallet, and each wallet is what its name says', () => {
        const preprod = measured.mints.filter(row => row.fee === 'preprod');
        expect(preprod).toHaveLength(Object.keys(Items).length * WALLETS.length);
        expect(measured.burns).toHaveLength(Object.keys(Items).length * 2);
        for (const row of measured.mints) {
            const wallet = WALLETS.find(candidate => candidate.name === row.wallet);
            expect(row.walletKeys).toBe(wallet.keys);
            expect(row.inputs).toBeGreaterThanOrEqual(wallet.inputs);
            expect(row.tokensInChange).toBe(wallet.tokensInChange);
            expect(row.deposits.reference + row.deposits.user).toBe(row.deposit);
        }
        for (const row of measured.burns) {
            expect(row.walletKeys).toBe(row.expectedKeys);
        }
        // the split fee raises the team's share: more is paid than is due
        const split = measured.mints.filter(row => row.fee !== 'preprod');
        expect(split.map(row => row.tier).sort()).toEqual(['COMMON', 'COMMON', 'EPIC', 'EPIC', 'RARE', 'RARE']);
        for (const row of split) {
            expect(row.gameFeePaid).toBeGreaterThan(row.gameFee);
        }
    });

    test('no mint takes more network fee or deposit than the estimates, no burn more network fee', () => {
        const above = (rows, value, name) => rows.filter(row => !(value(row) <= chain[name])).map(row => `${caseOf(row)}: ${value(row)} > ${name} ${chain[name]}`);
        expect([
            ...above(measured.mints, row => row.networkFee, 'MINT_NETWORK_FEE_ESTIMATE_LOVELACE'),
            ...above(measured.mints, row => row.deposit, 'MINT_DEPOSIT_ESTIMATE_LOVELACE'),
            ...above(measured.burns, row => row.networkFee, 'BURN_NETWORK_FEE_ESTIMATE_LOVELACE'),
        ]).toEqual([]);
    });

    test('no measured step of a larger wallet costs more than the funds check adds for it', () => {
        const steps = { MINT_FEE_PER_INPUT_LOVELACE: 'perInput', MINT_FEE_PER_WALLET_KEY_LOVELACE: 'perKey', MINT_FEE_PER_CHANGE_BYTE_LOVELACE: 'perChangeByte' };
        expect(
            Object.entries(steps)
                .filter(([name, step]) => !(measured.marginals[step] <= chain[name]))
                .map(([name, step]) => `${name} ${chain[name]} < measured ${measured.marginals[step]}`)
        ).toEqual([]);
        // the network fee estimate covers the inputs and keys of the largest measured mints, and no more
        expect(Math.max(...measured.mints.map(row => row.inputs))).toBe(chain.MINT_NETWORK_FEE_ESTIMATE_INPUTS);
        expect(Math.max(...measured.mints.map(row => row.walletKeys))).toBe(chain.MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS);
        expect(measured.maxima.mintNetworkFee.inputs).toBe(chain.MINT_NETWORK_FEE_ESTIMATE_INPUTS);
        expect(measured.maxima.mintNetworkFee.walletKeys).toBe(chain.MINT_NETWORK_FEE_ESTIMATE_WALLET_KEYS);
    });

    test('the estimates are not far above the largest case (at least 85 % of each is used)', () => {
        const largest = {
            MINT_NETWORK_FEE_ESTIMATE_LOVELACE: measured.maxima.mintNetworkFee.networkFee,
            MINT_DEPOSIT_ESTIMATE_LOVELACE: measured.maxima.deposit.deposit,
            BURN_NETWORK_FEE_ESTIMATE_LOVELACE: measured.maxima.burnNetworkFee.networkFee,
            MINT_FEE_PER_INPUT_LOVELACE: measured.marginals.perInput,
            MINT_FEE_PER_WALLET_KEY_LOVELACE: measured.marginals.perKey,
            MINT_FEE_PER_CHANGE_BYTE_LOVELACE: measured.marginals.perChangeByte,
        };
        const tooHigh = Object.entries(largest)
            .filter(([name, value]) => !(value >= LOWEST_SHARE * chain[name]))
            .map(([name, value]) => `${name} ${chain[name]}: the largest case takes ${value}, ${Math.round((100 * value) / chain[name])} %`);
        expect(tooHigh).toEqual([]);
    });

    test('the network fee covers the signed transaction, for one and for two wallet keys, mint and burn', async () => {
        const mint = (wallet, key, contracts) =>
            buildMint({ item: { key, serial: SERIAL }, fee: 0, owner: wallet.owner, utxos: wallet.utxos, params, tip: TIP, contracts, serverKeyHash: server.keyHash });
        const built = [
            // one key and one input; two keys and several inputs; the largest case (the split fee)
            await mint(WALLETS[0], 'DARK_WALLS', preprodContracts()),
            await mint(WALLETS[3], 'DARK_WALLS', preprodContracts()),
            await mint(WALLETS[3], 'TURBO_CONVEYOR', splitContracts()),
        ];
        expect(built.map(result => result.requiredWitnesses.length)).toEqual([1, 2, 2]);
        // the burn of the first mint's item with the user token at the wallet's second key
        const contracts = preprodContracts();
        const { store, user } = outputsOfMint(built[0], contracts);
        const BASE_2 = fixtureKey('owner-2').baseAddress('owner-stake');
        const elsewhere = utxo({ address: BASE_2, lovelace: Assets.lovelaceOf(user.assets), tokens: { [contracts.policyId + built[0].assetName.user]: 1n }, txId: 'b1'.repeat(32), index: 0 });
        const collateral = utxo({ address: WALLETS[0].owner.address, lovelace: 5_000_000n, txId: 'b2'.repeat(32), index: 0 });
        const burn = await buildBurn({ assetName: built[0].assetName.user, holder: WALLETS[0].owner, utxos: [elsewhere, collateral], reference: store, params, tip: TIP, contracts, serverKeyHash: server.keyHash });
        expect(burn.requiredWitnesses).toHaveLength(2);
        for (const result of [...built, burn]) {
            expect(ledgerMinimumFeeOf(fullySigned(result.cbor, result.requiredWitnesses), params)).toBeLessThanOrEqual(BigInt(result.networkFee));
        }
    });

    test('the COMMON fee clears the minimum UTxO of the fee output at the treasury', () => {
        const contracts = preprodContracts();
        const [option] = contracts.config.fees;
        expect(option.receivers.map(receiver => receiver.address)).toEqual([contracts.treasuryAddress]);
        // the treasury's address is an enterprise script address: no stake part
        expect(Address.fromBech32(contracts.treasuryAddress).stakingCredential).toBeUndefined();
        expect(treasuryMinimumOf(contracts)).toBeLessThan(option.amounts[0]);
        expect(measured.treasury.minimum).toBe(treasuryMinimumOf(contracts));
        // and so a COMMON mint pays exactly the due, nothing raised
        const common = measured.mints.filter(row => row.fee === 'preprod' && row.tier === 'COMMON');
        expect(common.length).toBeGreaterThan(0);
        for (const row of common) {
            expect(row.gameFeePaid).toBe(row.gameFee);
            expect(row.gameFee).toBe(option.amounts[0]);
        }
    });
});

describe('the funds check at the boundary of the estimates', () => {
    // every item in every wallet with the preprod fee, and with the split fee the item of each
    // tier with the longest datum (as measured)
    const CASES = [
        ...Object.keys(Items).flatMap(item => WALLETS.map(wallet => ({ item, wallet, contracts: preprodContracts, fee: 'preprod' }))),
        ...['SUGAR_FERTILIZER', 'MARZIPAN_CARROTS', 'TURBO_CONVEYOR'].flatMap(item => SPLIT_FEE_WALLETS.map(wallet => ({ item, wallet, contracts: splitContracts, fee: 'split' }))),
    ];

    test('a wallet the funds check just calls enough builds the mint, in every case, and within the estimates', async () => {
        const seen = { cases: 0, tokensInChange: 0, twoKeys: 0, split: 0 };
        for (const { item, wallet, contracts: contractsOf, fee } of CASES) {
            const contracts = contractsOf();
            const gameFee = gameFeeOf(contracts.config, { tier: chain.TIER_ORDER.indexOf(Items[item].tier), fee: 0 });
            const utxos = atTheBoundary(wallet, gameFee);
            const result = await buildMint({ item: { key: item, serial: SERIAL }, fee: 0, owner: wallet.owner, utxos, params, tip: TIP, contracts, serverKeyHash: server.keyHash }).catch(error => ({
                error: `${error.code}, missing ${error.missing}`,
            }));
            expect({ item, wallet: wallet.name, fee, result: result.error ?? 'built' }).toEqual({ item, wallet: wallet.name, fee, result: 'built' });
            expect(result.networkFee).toBeLessThanOrEqual(chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE);
            expect(result.deposit).toBeLessThanOrEqual(chain.MINT_DEPOSIT_ESTIMATE_LOVELACE);
            seen.cases++;
            seen.twoKeys += result.requiredWitnesses.length === 2 ? 1 : 0;
            seen.split += fee === 'split' ? 1 : 0;
            const { body } = Transaction.fromCBORHex(result.cbor);
            seen.tokensInChange += body.outputs.some(output => Assets.hasMultiAsset(output.assets) && Assets.getByUnit(output.assets, contracts.policyId + result.assetName.user) === 0n && Address.toBech32(output.address) === wallet.owner.address) ? 1 : 0;
        }
        // the boundary wallets keep the hard parts: two keys, tokens in the change, the raised share
        expect(seen.cases).toBe(CASES.length);
        expect(seen.twoKeys).toBeGreaterThan(0);
        expect(seen.tokensInChange).toBeGreaterThan(0);
        expect(seen.split).toBe(6);
    }, 120_000);

    test('the split fee counts with its raised share: the COMMON 1 ADA split 9:1 takes 1.86975 ADA', () => {
        // the team's 0.1 ADA becomes the minimum UTxO at its base address, 969_750 lovelace; the
        // treasury's 0.9 ADA clears its own minimum and stays as it is
        const [toTreasury, toTeam] = gameFeeOf(splitContracts().config, { tier: 0, fee: 0 }).payments;
        expect([toTreasury.amount, toTeam.amount]).toEqual([900_000, 100_000]);
        const wallet = [utxo({ address: WALLETS[0].owner.address, lovelace: 1_000_000n, txId: '77'.repeat(32), index: 0 })];
        const missingWith = contracts => fundsCheck({ utxos: wallet, kind: 'mint', gameFee: gameFeeOf(contracts.config, { tier: 0, fee: 0 }) }).missing;
        expect(missingWith(splitContracts()) - missingWith(preprodContracts())).toBe(969_750 - 100_000);
        expect(missingWith(preprodContracts())).toBe(chain.MINT_NEEDED_ESTIMATE_LOVELACE + 1_000_000 - 1_000_000);
    });

    test('needed: the estimate and the tier\'s fee for a pure one-UTxO wallet; needed − missing is what a short wallet holds', () => {
        const contracts = preprodContracts();
        chain.TIER_ORDER.forEach((tier, index) => {
            const gameFee = gameFeeOf(contracts.config, { tier: index, fee: 0 });
            const rich = [utxo({ address: WALLETS[0].owner.address, lovelace: 30_000_000n, txId: '78'.repeat(32), index: 0 })];
            expect(fundsCheck({ utxos: rich, kind: 'mint', gameFee })).toEqual({ enough: true, missing: 0, needed: chain.MINT_NEEDED_ESTIMATE_LOVELACE + contracts.config.fees[0].amounts[index], collateral: true });
            for (const wallet of WALLETS) {
                const short = wallet.utxos.slice(0, 2);
                const held = short.reduce((sum, entry) => sum + Number(Assets.lovelaceOf(entry.assets)), 0);
                const funds = fundsCheck({ utxos: short, kind: 'mint', gameFee });
                if (funds.missing > 0) {
                    expect({ tier, wallet: wallet.name, held: funds.needed - funds.missing }).toEqual({ tier, wallet: wallet.name, held });
                }
            }
        });
    });

    test('a wallet larger than the measured ones needs more: per input, per key and per byte of tokens beyond', () => {
        const gameFee = gameFeeOf(preprodContracts().config, { tier: 0, fee: 0 });
        const base = chain.MINT_NEEDED_ESTIMATE_LOVELACE + 1_000_000;
        const at = (label, lovelace, index, tokens) => utxo({ address: fixtureKey(label).baseAddress('owner-stake'), lovelace, tokens, txId: '79'.repeat(32), index });
        // ten pure UTxOs at three keys, the first the collateral alone: four inputs and one key more
        const many = [at('owner', 10_000_000n, 0), ...Array.from({ length: 9 }, (_, i) => at(['owner', 'owner-2', 'owner-3'][i % 3], 1_000_000n, i + 1))];
        expect(fundsCheck({ utxos: many, kind: 'mint', gameFee }).needed).toBe(base + 4 * chain.MINT_FEE_PER_INPUT_LOVELACE + chain.MINT_FEE_PER_WALLET_KEY_LOVELACE);
        // the change carries the token: its minimum UTxO instead of the reserve, and its bytes in
        // the network fee (the minimum UTxO is coinsPerUtxoByte per byte)
        const tokens = { ['c4'.repeat(28) + '01']: 1n };
        const minimum = assets => Number(Effect.runSync(calculateMinimumUtxoLovelace({ address: Address.fromBech32(WALLETS[0].owner.address), assets, coinsPerUtxoByte: params.coinsPerUtxoByte })));
        const change = minimum(Assets.fromRecord(tokens));
        const bytes = (change - minimum(Assets.zero)) / Number(params.coinsPerUtxoByte);
        expect(bytes).toBe(36);
        const withToken = fundsCheck({ utxos: [at('owner', 10_000_000n, 0), at('owner', 2_000_000n, 1, tokens)], kind: 'mint', gameFee }).needed;
        expect(withToken).toBe(base - chain.CHANGE_RESERVE_LOVELACE + change + bytes * chain.MINT_FEE_PER_CHANGE_BYTE_LOVELACE);
    });

    test('a fee in another asset than ADA → FEE_ASSET_UNSUPPORTED, as buildMint says', () => {
        const choc = { asset: 'c4'.repeat(28) + '43484f43', amount: 10, payments: [{ address: preprodContracts().treasuryAddress, amount: 10 }] };
        const wallet = [utxo({ address: WALLETS[0].owner.address, lovelace: 20_000_000n, txId: '77'.repeat(32), index: 0 })];
        expect(() => fundsCheck({ utxos: wallet, kind: 'mint', gameFee: choc })).toThrow(expect.objectContaining({ code: 'FEE_ASSET_UNSUPPORTED' }));
        // a burn pays no fee
        expect(fundsCheck({ utxos: wallet, kind: 'burn' }).enough).toBe(true);
    });
});

describe('the funds check at the boundary, for wallets larger than the measured ones', () => {
    const OWNER = WALLETS[0].owner;
    const BASE_2 = fixtureKey('owner-2').baseAddress('owner-stake');
    // a UTxO at `address` holding `tokens` and just its minimum ADA, as wallets keep NFTs
    const atMinimum = (address, tokens, index) => {
        const assets = Assets.fromRecord(tokens);
        const lovelace = Effect.runSync(calculateMinimumUtxoLovelace({ address: Address.fromBech32(address), assets, coinsPerUtxoByte: params.coinsPerUtxoByte }));
        return utxo({ address, lovelace, tokens, txId: (index + 1).toString(16).padStart(64, '0'), index: 0 });
    };
    // `count` NFTs (20-byte names) of `policies` policies, spread over `parts` UTxOs at the
    // wallet's two keys, each UTxO with its minimum ADA; the wallet's first UTxO is pure ADA
    const nftWallet = ({ count, policies, parts }) => {
        const units = Array.from({ length: count }, (_, i) => (0x10 + (i % policies)).toString(16).repeat(28) + Buffer.from(`nft-${String(i).padStart(16, '0')}`).toString('hex'));
        const holders = Array.from({ length: parts }, (_, part) =>
            atMinimum(part % 2 ? BASE_2 : OWNER.address, Object.fromEntries(units.filter((_, i) => i % parts === part).map(unit => [unit, 1n])), part)
        );
        return { name: `${count} NFTs of ${policies} policies in ${parts} UTxOs`, owner: OWNER, utxos: [utxo({ address: OWNER.address, lovelace: 5_000_000n, txId: 'f0'.repeat(32), index: 0 }), ...holders] };
    };
    // many small pure UTxOs at six keys of the wallet
    const manyKeys = {
        name: '14 UTxOs of 1 ADA at six keys',
        owner: OWNER,
        utxos: [
            utxo({ address: OWNER.address, lovelace: 5_000_000n, txId: 'f1'.repeat(32), index: 0 }),
            ...Array.from({ length: 14 }, (_, i) => utxo({ address: fixtureKey(i % 6 === 0 ? 'owner' : `owner-${(i % 6) + 1}`).baseAddress('owner-stake'), lovelace: 1_000_000n, txId: 'f2'.repeat(32), index: i })),
        ],
    };
    const LARGE_WALLETS = [
        // the review's wallet, and NFTs bundled in few UTxOs: the change carries them all
        nftWallet({ count: 40, policies: 15, parts: 20 }),
        nftWallet({ count: 40, policies: 15, parts: 2 }),
        nftWallet({ count: 60, policies: 30, parts: 2 }),
        nftWallet({ count: 60, policies: 30, parts: 3 }),
        nftWallet({ count: 90, policies: 40, parts: 6 }),
        manyKeys,
    ];

    test.each(LARGE_WALLETS.map(wallet => [wallet.name, wallet]))('%s: a wallet the funds check just calls enough builds the mint', async (name, wallet) => {
        const outcomes = [];
        for (const item of ['SUGAR_FERTILIZER', 'TURBO_CONVEYOR']) {
            for (const [fee, contractsOf] of [
                ['preprod', preprodContracts],
                ['split', splitContracts],
            ]) {
                const contracts = contractsOf();
                const gameFee = gameFeeOf(contracts.config, { tier: chain.TIER_ORDER.indexOf(Items[item].tier), fee: 0 });
                const utxos = atTheBoundary(wallet, gameFee);
                const outcome = await buildMint({ item: { key: item, serial: SERIAL }, fee: 0, owner: wallet.owner, utxos, params, tip: TIP, contracts, serverKeyHash: server.keyHash }).then(
                    () => 'built',
                    error => `${error.code}${error.missing === undefined ? '' : `, missing ${error.missing}`}`
                );
                outcomes.push(`${item}, ${fee} fee: ${outcome}`);
            }
        }
        expect(outcomes.filter(outcome => !outcome.endsWith(': built'))).toEqual([]);
    }, 60_000);
});

