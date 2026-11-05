const { live } = require('../../index');

const { CODE_ALPHABET, newChallengeCode, normalizeChallengeCode, formatChallengeCode } = live;

describe('challenge codes', () => {
    test('a new code has 8 characters of the alphabet', () => {
        let next = 0;
        const code = newChallengeCode(max => next++ % max);
        expect(code).toHaveLength(8);
        expect([...code].every(character => CODE_ALPHABET.includes(character))).toBe(true);
        expect(CODE_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    });

    test('typed codes are normalized: case, spaces, hyphens and look-alike letters', () => {
        expect(normalizeChallengeCode('k7q2 m9xd')).toBe('K7Q2M9XD');
        expect(normalizeChallengeCode('K7Q2-M9XD')).toBe('K7Q2M9XD');
        expect(normalizeChallengeCode('K7Q2M9XD')).toBe('K7Q2M9XD');
        expect(normalizeChallengeCode('O1IL-AAAA')).toBe('0111AAAA');
    });

    test('anything else is no code', () => {
        ['K7Q2-M9X', 'K7Q2-M9XDU', 'K7Q2M9XU', '', null, undefined, 42].forEach(text => {
            expect(normalizeChallengeCode(text)).toBeNull();
        });
    });

    test('codes are shown in two groups of four', () => {
        expect(formatChallengeCode('K7Q2M9XD')).toBe('K7Q2-M9XD');
    });

    test('the protocol knows challenges and their timings', () => {
        expect(live.ChallengeState.WAITING).toBe('waiting');
        expect(live.ChallengeViewState.TAKEN).toBe('taken');
        expect(live.ClientMessage.CHALLENGE_OPEN).toBe('challenge.open');
        expect(live.ServerMessage.CHALLENGE_VIEW).toBe('challenge.view');
        expect(live.LiveDefaults.challengeTtlMs).toBe(120000);
        expect(live.LiveDefaults.challengeReadCapMs).toBe(600000);
    });
});
