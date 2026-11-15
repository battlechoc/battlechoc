// The battlechoc fee of a mint (plan B, Task 7): the options of the config and what each receiver
// is due, rounded exactly as the items validator rounds (contracts/lib/battlechoc/rules.ak
// `fee_due`: the floor of each share, the remainder to the first receiver).

const { ChainTxError, gameFeesOf, gameFeeOf } = require('../src/chain/fees');
const { TEAM_ADDRESS } = require('./helpers/chain');

const TREASURY = 'addr_test1wpl8uln70el8uln70el8uln70el8uln70el8uln70el8ulsp0t5nh';
const CHOC = 'c4'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
const AMOUNTS = [1_000_000, 2_000_000, 4_000_000];

const configWith = fees => ({ serverKeys: ['51'.repeat(28)], admins: ['a1'.repeat(28)], threshold: 1, paused: false, fees });
const adaFee = { asset: 'lovelace', amounts: AMOUNTS, receivers: [{ address: TREASURY, share: 1 }] };
const receiversOf = shares => shares.map((share, i) => ({ address: `${TREASURY}-${i}`, share }));

const codeOf = fn => {
    try {
        fn();
    } catch (error) {
        return error instanceof ChainTxError ? error.code : error;
    }
    return undefined;
};

describe('the fee options of a config', () => {
    test('gameFeesOf lists each option with its amounts by tier, in option order', () => {
        const choc = { asset: CHOC, amounts: [10, 20, 40], receivers: [{ address: TREASURY, share: 1 }] };
        expect(gameFeesOf(configWith([adaFee, choc]))).toEqual([
            { asset: 'lovelace', amounts: AMOUNTS },
            { asset: CHOC, amounts: [10, 20, 40] },
        ]);
        expect(gameFeesOf(configWith([]))).toEqual([]);
    });
});

describe('the fee of one mint', () => {
    test('1, 2 or 4 ADA by tier, all of it to the one receiver', () => {
        const config = configWith([adaFee]);
        expect([0, 1, 2].map(tier => gameFeeOf(config, { tier, fee: 0 }))).toEqual(
            AMOUNTS.map(amount => ({ asset: 'lovelace', amount, payments: [{ address: TREASURY, amount }] }))
        );
    });

    test('a 9:1 split of 4 ADA gives 3.6 and 0.4 ADA', () => {
        const config = configWith([
            {
                asset: 'lovelace',
                amounts: AMOUNTS,
                receivers: [
                    { address: TREASURY, share: 9 },
                    { address: TEAM_ADDRESS, share: 1 },
                ],
            },
        ]);
        expect(gameFeeOf(config, { tier: 2, fee: 0 }).payments).toEqual([
            { address: TREASURY, amount: 3_600_000 },
            { address: TEAM_ADDRESS, amount: 400_000 },
        ]);
    });

    test('what the floors leave over goes to the first receiver', () => {
        const config = configWith([{ asset: 'lovelace', amounts: [1, 1, 1], receivers: receiversOf([1, 1, 1]) }]);
        expect(gameFeeOf(config, { tier: 0, fee: 0 }).payments.map(payment => payment.amount)).toEqual([1, 0, 0]);
    });

    test('the dues always add up to the amount, each the floor of its share but the first', () => {
        // a fixed pseudo-random sequence (Park–Miller): the same 50 cases every run
        let state = 7;
        const next = limit => {
            state = (state * 48_271) % 2_147_483_647;
            return state % limit;
        };
        for (let run = 0; run < 50; run++) {
            const amount = next(10_000_000_000);
            const shares = Array.from({ length: 1 + next(5) }, () => 1 + next(100));
            const total = shares.reduce((sum, share) => sum + share, 0);
            const config = configWith([{ asset: 'lovelace', amounts: [amount, 0, 0], receivers: receiversOf(shares) }]);
            const dues = gameFeeOf(config, { tier: 0, fee: 0 }).payments.map(payment => payment.amount);
            expect(dues.reduce((sum, due) => sum + due, 0)).toBe(amount);
            dues.slice(1).forEach((due, i) => expect(due).toBe(Math.floor((amount * shares[i + 1]) / total)));
        }
    });

    test('a tier outside COMMON, RARE, EPIC is NO_SUCH_TIER, with or without fees', () => {
        for (const config of [configWith([adaFee]), configWith([])]) {
            for (const tier of [3, -1, 1.5, '1', undefined]) {
                expect(codeOf(() => gameFeeOf(config, { tier, fee: 0 }))).toBe('NO_SUCH_TIER');
            }
        }
    });

    test('an option index the config does not have is NO_SUCH_FEE', () => {
        for (const fee of [1, -1, 0.5, undefined]) {
            expect(codeOf(() => gameFeeOf(configWith([adaFee]), { tier: 0, fee }))).toBe('NO_SUCH_FEE');
        }
    });

    test('no fee options: no fee, whatever option index is asked for', () => {
        expect(gameFeeOf(configWith([]), { tier: 1, fee: 0 })).toBeNull();
        expect(gameFeeOf(configWith([]), { tier: 1, fee: 3 })).toBeNull();
    });
});

describe('where the later plans find them', () => {
    test('tx.js exports gameFeesOf and gameFeeOf, the same functions, and the same ChainTxError', () => {
        const tx = require('../src/chain/tx');
        expect(tx.gameFeesOf).toBe(gameFeesOf);
        expect(tx.gameFeeOf).toBe(gameFeeOf);
        expect(tx.ChainTxError).toBe(ChainTxError);
    });
});
