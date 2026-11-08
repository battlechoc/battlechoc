const { cardano } = require('../index');

describe('Cardano networks', () => {
    test('networkOf knows preprod and mainnet, nothing else', () => {
        expect(cardano.networkOf('preprod')).toEqual({ name: 'preprod', networkId: 0 });
        expect(cardano.networkOf('mainnet')).toEqual({ name: 'mainnet', networkId: 1 });
        expect(cardano.networkOf('testnet')).toBeNull();
        expect(cardano.networkOf(undefined)).toBeNull();
        expect(Object.isFrozen(cardano.Networks.preprod)).toBe(true);
    });
});

describe('the sign-in challenge text', () => {
    const input = {
        address: 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
        network: cardano.Networks.preprod,
        nonce: '9f3c2a7e5b1d4c6f8a0b2c4d6e8f0a1b',
        issuedAt: new Date(Date.UTC(2026, 10, 8, 10, 0, 0)),
        expiresAt: new Date(Date.UTC(2026, 10, 8, 10, 5, 0)),
    };

    test('signing in', () => {
        expect(cardano.challengeMessage({ ...input, purpose: 'sign-in' })).toBe([
            'battlechoc.com wants you to sign in with your Cardano account:',
            'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
            '',
            'Sign in to battlechoc.',
            '',
            'URI: https://battlechoc.com',
            'Action: sign-in',
            'Network: preprod',
            'Nonce: 9f3c2a7e5b1d4c6f8a0b2c4d6e8f0a1b',
            'Issued At: 2026-11-08T10:00:00.000Z',
            'Expiration Time: 2026-11-08T10:05:00.000Z',
        ].join('\n'));
    });

    test('linking a key', () => {
        const text = cardano.challengeMessage({ ...input, purpose: 'link' });
        expect(text.split('\n')[3]).toBe('Link this key to your battlechoc player.');
        expect(text.split('\n')[6]).toBe('Action: link');
    });

    test('an unknown purpose is refused', () => {
        expect(() => cardano.challengeMessage({ ...input, purpose: 'pay' })).toThrow();
    });
});
