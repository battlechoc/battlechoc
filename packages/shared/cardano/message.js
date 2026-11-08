// The text a player signs to sign in or to link a key (CIP-30 signData, CIP-8). The server builds
// it when it issues a challenge and compares the signed payload with it byte for byte; the game
// shows the same text in a wallet. SIWE-style, with the fields of CIP-93.

// the first line: what the wallet or the game asks the player to do
const HEADLINES = Object.freeze({
    'sign-in': 'battlechoc.com wants you to sign in with your Cardano account:',
    link: 'battlechoc.com wants you to sign in with your Cardano account:',
    confirm: 'battlechoc.com wants you to confirm a change with your Cardano account:',
});

const STATEMENTS = Object.freeze({
    'sign-in': 'Sign in to battlechoc.',
    link: 'Link this key to your battlechoc player.',
    confirm: 'Confirm a change to your battlechoc player.',
});

/**
 * @param {object} challenge
 * @param {string} challenge.address the bech32 reward address that signs
 * @param {'sign-in'|'link'|'confirm'} challenge.purpose
 * @param {{name: string}} challenge.network see network.js
 * @param {string} challenge.nonce issued by the server, used once
 * @param {Date} challenge.issuedAt
 * @param {Date} challenge.expiresAt
 */
const challengeMessage = ({ address, purpose, network, nonce, issuedAt, expiresAt }) => {
    if (!Object.prototype.hasOwnProperty.call(STATEMENTS, purpose)) {
        throw new Error(`unknown purpose of a challenge: ${purpose}`);
    }
    return [
        HEADLINES[purpose],
        address,
        '',
        STATEMENTS[purpose],
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
