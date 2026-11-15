// Sign codes (minting plan D): a prepared operation's code ties the sign page, open in a phone
// wallet's own browser, to that operation, as a link code ties the link page to a player
// (linkCodes.js). The code is shown once, in the answer of the mint; only its SHA-256 hash is
// stored (chain_ops.code_hash, written by ops.insertPrepared), and it is used up on the submit.

const crypto = require('crypto');
const { hashOf } = require('../linkCodes');

/** What a sign code looks like: 16 random bytes in base64url, 22 characters. */
const SIGN_CODE = /^[A-Za-z0-9_-]{22}$/;

/** A new sign code: { code, codeHash } (codeHash: its SHA-256 hex, as linkCodes.hashOf). */
const newSignCode = () => {
    const code = crypto.randomBytes(16).toString('base64url');
    return { code, codeHash: hashOf(code) };
};

module.exports = { SIGN_CODE, newSignCode };
