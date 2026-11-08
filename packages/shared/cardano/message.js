// The text a player signs to sign in or to link a key (CIP-30 signData, CIP-8). The server builds
// it when it issues a challenge and compares the signed payload with it byte for byte; the game
// shows the same text in a wallet. SIWE-style, with the fields of CIP-93.

// the first line: what the wallet or the game asks the player to do
const HEADLINES = Object.freeze({
    'sign-in': 'battlechoc.com wants you to sign in with your Cardano account:',
    link: 'battlechoc.com wants you to sign in with your Cardano account:',
    confirm: 'battlechoc.com wants you to confirm a change with your Cardano account:',
    connect: 'battlechoc.com wants you to connect your Cardano wallet:',
});

// the link page (plan 3) signs in or links the device that opened it, which may be someone else's:
// the text says so (a phishing guard: a link sent by a stranger signs the stranger in)
const ANOTHER_DEVICE = Object.freeze({
    connect: 'Connect this wallet to battlechoc on the device that opened this page. Only go on if that device is yours.',
    link: 'Link this wallet to the battlechoc player on the device that opened this page. Only go on if that device is yours.',
});

const STATEMENTS = Object.freeze({
    'sign-in': 'Sign in to battlechoc.',
    link: 'Link this key to your battlechoc player.',
    confirm: 'Confirm a change to your battlechoc player.',
    connect: 'Connect this wallet to battlechoc.',
});

/**
 * @param {object} challenge
 * @param {string} challenge.address the bech32 address that signs (a reward address, or a
 *   wallet's payment address when it has no stake key)
 * @param {'sign-in'|'link'|'confirm'|'connect'} challenge.purpose
 * @param {{name: string}} challenge.network see network.js
 * @param {string} challenge.nonce issued by the server, used once
 * @param {Date} challenge.issuedAt
 * @param {Date} challenge.expiresAt
 * @param {boolean} [challenge.onAnotherDevice] signed on the link page for a link code (connect, link)
 */
const challengeMessage = ({ address, purpose, network, nonce, issuedAt, expiresAt, onAnotherDevice = false }) => {
    if (!Object.prototype.hasOwnProperty.call(STATEMENTS, purpose)
        || (onAnotherDevice && !Object.prototype.hasOwnProperty.call(ANOTHER_DEVICE, purpose))) {
        throw new Error(`unknown purpose of a challenge: ${purpose}`);
    }
    return [
        HEADLINES[purpose],
        address,
        '',
        onAnotherDevice ? ANOTHER_DEVICE[purpose] : STATEMENTS[purpose],
        '',
        'URI: https://battlechoc.com',
        `Action: ${purpose}`,
        `Network: ${network.name}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
    ].join('\n');
};

module.exports = { challengeMessage, ChallengePurpose: Object.freeze(Object.keys(STATEMENTS)) };
