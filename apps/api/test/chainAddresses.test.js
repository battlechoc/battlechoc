// Who holds what an address holds (the subjects of an address), and where a subject's funds are
// looked up (plan C, Task 2).

const { Address, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { holderOf, addressOfSubjectForFunds } = require('../src/chain/addresses');
const { testKeys } = require('./helpers/cardano');

const { preprod, mainnet } = cardano.Networks;
const SCRIPT = ScriptHash.fromHex('5c'.repeat(28));
const bech32Of = ({ networkId = 0, payment, stake }) => Address.toBech32(new Address.Address({ networkId, paymentCredential: payment, stakingCredential: stake }));

describe('holderOf', () => {
    const keys = testKeys();
    const payment = KeyHash.fromHex(keys.paymentKeyHashHex);
    const stake = KeyHash.fromHex(keys.stakeKeyHashHex);

    test('a base address: its stake key and its payment key', () => {
        expect(holderOf(keys.baseAddress)).toEqual({ stake: `stake:${keys.stakeKeyHashHex}`, pay: `pay:${keys.paymentKeyHashHex}` });
    });

    test('an enterprise address: its payment key only', () => {
        expect(holderOf(keys.enterpriseAddress)).toEqual({ stake: null, pay: `pay:${keys.paymentKeyHashHex}` });
    });

    test('a script payment credential is nobody, whatever its stake part (a listing with the seller\'s stake key)', () => {
        expect(holderOf(bech32Of({ payment: SCRIPT, stake }))).toEqual({ stake: null, pay: null });
        expect(holderOf(bech32Of({ payment: SCRIPT }))).toEqual({ stake: null, pay: null });
    });

    test('a key payment credential with a script stake part: the payment key only', () => {
        expect(holderOf(bech32Of({ payment, stake: SCRIPT }))).toEqual({ stake: null, pay: `pay:${keys.paymentKeyHashHex}` });
    });

    test('a mainnet address has the same subjects as on preprod', () => {
        const onMainnet = testKeys({ words: keys.words, networkId: 1 });
        expect(onMainnet.baseAddress).toMatch(/^addr1/);
        expect(holderOf(onMainnet.baseAddress)).toEqual(holderOf(keys.baseAddress));
        expect(holderOf(onMainnet.enterpriseAddress)).toEqual(holderOf(keys.enterpriseAddress));
    });

    test('a pointer address: its payment key only (a pointer is no stake key)', () => {
        // CIP-19's test vector: a payment key hash with the pointer (2498243, 27, 3)
        const pointer = 'addr_test1gz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrdw5vky';
        expect(holderOf(pointer)).toEqual({ stake: null, pay: 'pay:9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e' });
    });

    test('a reward address, a Byron address or no address at all is nobody (reward and enterprise addresses are told apart by the header)', () => {
        ['stake_test1', keys.rewardAddress, 'Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi', 'addr_test1nope', '', null, undefined, 42].forEach(address =>
            expect(holderOf(address)).toEqual({ stake: null, pay: null })
        );
    });
});

describe('addressOfSubjectForFunds', () => {
    const keys = testKeys();

    test('a stake key: its reward address; a payment key: its enterprise address', () => {
        expect(addressOfSubjectForFunds(`stake:${keys.stakeKeyHashHex}`, preprod)).toBe(keys.rewardAddress);
        expect(addressOfSubjectForFunds(`pay:${keys.paymentKeyHashHex}`, preprod)).toBe(keys.enterpriseAddress);
        const onMainnet = testKeys({ words: keys.words, networkId: 1 });
        expect(addressOfSubjectForFunds(`stake:${keys.stakeKeyHashHex}`, mainnet)).toBe(onMainnet.rewardAddress);
    });

    test('anything else is refused', () => {
        [`key:${keys.stakeKeyHashHex}`, 'stake:abc', `pay:${keys.paymentKeyHashHex.toUpperCase()}`, '', null].forEach(subject =>
            expect(() => addressOfSubjectForFunds(subject, preprod)).toThrow(TypeError)
        );
    });
});
