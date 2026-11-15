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

    test('confirming a change has its own first line and statement', () => {
        const text = cardano.challengeMessage({ ...input, purpose: 'confirm' }).split('\n');
        expect(text[0]).toBe('battlechoc.com wants you to confirm a change with your Cardano account:');
        expect(text[3]).toBe('Confirm a change to your battlechoc player.');
        expect(text[6]).toBe('Action: confirm');
    });

    test('connecting a wallet has its own first line and statement', () => {
        const text = cardano.challengeMessage({ ...input, purpose: 'connect' }).split('\n');
        expect(text[0]).toBe('battlechoc.com wants you to connect your Cardano wallet:');
        expect(text[3]).toBe('Connect this wallet to battlechoc.');
        expect(text[6]).toBe('Action: connect');
        expect(cardano.ChallengePurpose).toContain('connect');
    });

    test('the link page signs a text that warns it acts for the device that opened it', () => {
        const text = cardano.challengeMessage({ ...input, purpose: 'connect', onAnotherDevice: true }).split('\n');
        expect(text[3]).toBe('Connect this wallet to battlechoc on the device that opened this page. Only go on if that device is yours.');
        expect(cardano.challengeMessage({ ...input, purpose: 'link', onAnotherDevice: true }).split('\n')[3])
            .toBe('Link this wallet to the battlechoc player on the device that opened this page. Only go on if that device is yours.');
        expect(() => cardano.challengeMessage({ ...input, purpose: 'sign-in', onAnotherDevice: true })).toThrow();
    });

    test('an unknown purpose is refused', () => {
        expect(() => cardano.challengeMessage({ ...input, purpose: 'pay' })).toThrow();
    });
});

describe('SHA-256 in plain JavaScript (the address proof\'s digest)', () => {
    const crypto = require('crypto');
    const { sha256Hex } = require('../cardano/sha256');

    test('the same as Node\'s for texts of every length around the block boundaries, and for UTF-8', () => {
        for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'x'.repeat(1000), 'Schokolade: Gänseblümchen 🍫', 'ab\ncd']) {
            expect(sha256Hex(text)).toBe(crypto.createHash('sha256').update(text, 'utf8').digest('hex'));
        }
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(() => sha256Hex(42)).toThrow(TypeError);
    });
});

describe('the address proof text of a mint', () => {
    const crypto = require('crypto');
    const addresses = ['00512F86A97401A09D556B9B2B6244E748A87F61DA19A7B4624C0D60BB5C324C662685500AA2BF66546CDD58293C653505A4DBB7A1822F6E90', '6009c0bd8ab7cda4ad4ec3b2ec8fd1a5e0a5bf7a9ae4bab93e8d1e8c8f'];
    const input = {
        domain: 'battlechoc.com',
        network: cardano.Networks.preprod,
        operationId: 'd7f82642-e5c8-4876-85fe-796938dc0a50',
        item: 'DARK_WALLS',
        serial: 12,
        subjectAddress: 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
        addresses,
        expires: new Date(Date.UTC(2026, 10, 15, 12, 10, 40)),
    };
    const digest = crypto
        .createHash('sha256')
        .update(addresses.map(address => address.toLowerCase()).join('\n'))
        .digest('hex');

    test('its exact text: a first line of its own, the domain, the network, the item, the operation, the subject\'s address, the digest of the list, the expiry', () => {
        expect(cardano.addressProofMessage(input)).toBe([
            'battlechoc.com asks your wallet to vouch for its own addresses for a mint (this is not a sign-in):',
            'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
            '',
            'These addresses are this wallet\'s own; the item is minted to one of them. Signing this moves no funds.',
            '',
            'URI: https://battlechoc.com',
            'Action: mint-addresses',
            'Network: preprod',
            'Item: DARK_WALLS #12',
            'Operation: d7f82642-e5c8-4876-85fe-796938dc0a50',
            `Addresses: 2, SHA-256 ${digest}`,
            'Expiration Time: 2026-11-15T12:10:40.000Z',
        ].join('\n'));
        expect(cardano.ADDRESS_PROOF_HEADLINE).toBe('battlechoc.com asks your wallet to vouch for its own addresses for a mint (this is not a sign-in):');
        // the expiry as a Date or its ISO text
        expect(cardano.addressProofMessage({ ...input, expires: '2026-11-15T12:10:40.000Z' })).toBe(cardano.addressProofMessage(input));
    });

    test('the digest: lower-case hex, in the order sent, one per line; the case does not count, the order and every address do', () => {
        const text = cardano.addressProofMessage(input);
        expect(cardano.addressProofMessage({ ...input, addresses: addresses.map(address => address.toLowerCase()) })).toBe(text);
        expect(cardano.addressProofMessage({ ...input, addresses: [...addresses].reverse() })).not.toBe(text);
        expect(cardano.addressProofMessage({ ...input, addresses: [addresses[0]] })).not.toBe(text);
        expect(cardano.addressProofDigest(addresses)).toBe(digest);
    });

    test('its first line is no challenge\'s, and no challenge parses as an address proof', () => {
        const at = new Date(0);
        for (const purpose of cardano.ChallengePurpose) {
            for (const onAnotherDevice of [false, true]) {
                let challenge;
                try {
                    challenge = cardano.challengeMessage({ address: input.subjectAddress, purpose, network: input.network, nonce: 'n', issuedAt: at, expiresAt: at, onAnotherDevice });
                } catch {
                    continue;
                }
                expect(challenge.split('\n')[0]).not.toBe(cardano.ADDRESS_PROOF_HEADLINE);
                expect(cardano.addressProofOf(challenge)).toBeNull();
            }
        }
    });

    test('addressProofOf reads exactly that text: its fields; anything else is null', () => {
        const text = cardano.addressProofMessage(input);
        expect(cardano.addressProofOf(text)).toEqual({
            domain: 'battlechoc.com',
            network: 'preprod',
            operationId: 'd7f82642-e5c8-4876-85fe-796938dc0a50',
            item: 'DARK_WALLS',
            serial: 12,
            subjectAddress: input.subjectAddress,
            addressCount: 2,
            digest,
            expires: '2026-11-15T12:10:40.000Z',
        });
        const lines = text.split('\n');
        const variants = [
            `${text}\n`,
            ` ${text}`,
            text.replace('\n', '\r\n'),
            lines.slice(1).join('\n'),
            lines.slice(0, -1).join('\n'),
            text.replace('Network: preprod', 'Network: '),
            text.replace('Item: DARK_WALLS #12', 'Item: DARK_WALLS #012'),
            text.replace('Item: DARK_WALLS #12', 'Item: DARK_WALLS 12'),
            text.replace(`SHA-256 ${digest}`, `SHA-256 ${digest.toUpperCase()}`),
            text.replace('Addresses: 2,', 'Addresses: 0,'),
            text.replace('2026-11-15T12:10:40.000Z', '2026-11-15T12:10:40Z'),
            text.replace('2026-11-15T12:10:40.000Z', '2026-13-15T12:10:40.000Z'),
            text.replace('Action: mint-addresses', 'Action: sign-in'),
            text.replace(cardano.ADDRESS_PROOF_HEADLINE, 'battlechoc.com wants you to sign in with your Cardano account:'),
            text.replace("Signing this moves no funds.", 'Signing this moves funds.'),
            text.replace('https://battlechoc.com', 'https://battlechoc.com evil'),
            undefined,
            42,
        ];
        for (const variant of variants) {
            expect(cardano.addressProofOf(variant)).toBeNull();
        }
    });

    test('a field that cannot be written into the text is a TypeError', () => {
        for (const wrong of [
            { domain: 'battle choc.com' },
            { network: undefined },
            { operationId: 'a\nb' },
            { operationId: '' },
            { item: 'dark walls' },
            { serial: -1 },
            { serial: 1.5 },
            { subjectAddress: 'stake test' },
            { addresses: [] },
            { addresses: ['zz'] },
            { addresses: 'ab' },
            { expires: 'tomorrow' },
        ]) {
            expect(() => cardano.addressProofMessage({ ...input, ...wrong })).toThrow(TypeError);
        }
    });
});
