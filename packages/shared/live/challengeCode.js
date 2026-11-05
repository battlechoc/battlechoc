// Challenge codes: the part of a challenge link a player can also type into the app (an iPhone's
// home-screen app does not share its storage with Safari, where chat links open). Crockford
// base32 without the look-alike letters I, L, O and U; shown as two groups of four.

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

/** A new code; randomInt(max) gives a whole number from 0 to max - 1 (crypto.randomInt on the server). */
const newChallengeCode = randomInt => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** The code in a typed or linked text, or null: any case, spaces and hyphens, O for 0 and I or L for 1. */
const normalizeChallengeCode = text => {
    if (typeof text !== 'string') {
        return null;
    }
    const code = text
        .toUpperCase()
        .replace(/[\s-]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
    return code.length === CODE_LENGTH && [...code].every(character => CODE_ALPHABET.includes(character)) ? code : null;
};

const formatChallengeCode = code => `${code.slice(0, 4)}-${code.slice(4)}`;

module.exports = { CODE_ALPHABET, newChallengeCode, normalizeChallengeCode, formatChallengeCode };
