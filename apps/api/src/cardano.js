// Signing in with a Cardano key: challenges and their signatures (CIP-30 signData, CIP-8).
//
// A challenge is the text of shared/cardano/message.js for one reward address, with a random
// nonce; it is stored until it is used once or expires. The signature must be the stake key's of
// exactly that address, over exactly that text, on the network the server runs on. The Evolution
// SDK is an ES module: Node 22 loads it with require(), Jest through babel-jest (package.json).

const crypto = require('crypto');
const { KeyHash, RewardAccount, COSE } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { HttpError, ErrorCode } = require('./errors');
const { count } = require('./db');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const IDENTITY_PROVIDER = 'cardano';
const HEX = /^(?:[0-9a-f]{2})+$/i;

const invalidRequest = () => new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
const invalidSignature = () => new HttpError(400, ErrorCode.INVALID_SIGNATURE);

/**
 * The reward account of a bech32 reward address on `network`, with a key (not a script) as its
 * stake credential. Refuses anything else.
 */
const rewardAccountOf = (address, network) => {
    let account;
    try {
        account = RewardAccount.fromBech32(address);
    } catch {
        throw invalidRequest();
    }
    if (!(account.stakeCredential instanceof KeyHash.KeyHash)) {
        throw invalidRequest();
    }
    if (account.networkId !== network.networkId) {
        throw new HttpError(400, ErrorCode.WRONG_NETWORK);
    }
    return account;
};

/** The subject of a key in the identities table. */
const subjectOf = account => `stake:${KeyHash.toHex(account.stakeCredential)}`;

/**
 * The reward address of a subject on `network`: the same key has another address on mainnet than
 * on preprod, so it is built when it is shown, never stored.
 */
const addressOfSubject = (subject, network) => RewardAccount.toBech32(new RewardAccount.RewardAccount({
    networkId: network.networkId,
    stakeCredential: KeyHash.fromHex(subject.replace(/^stake:/, '')),
}));

/**
 * Checks a CIP-30 DataSignature ({ signature, key }, hex) of `message` by the stake key of
 * `address`; returns the identity subject ("stake:<key hash>"), throws INVALID SIGNATURE otherwise.
 */
const verifySignature = ({ signature, key, message, address, network }) => {
    const account = rewardAccountOf(address, network);
    if (typeof signature !== 'string' || typeof key !== 'string' || !HEX.test(signature) || !HEX.test(key)) {
        throw invalidSignature();
    }
    let valid;
    try {
        valid = COSE.SignData.verifyData(
            RewardAccount.toHex(account),
            KeyHash.toHex(account.stakeCredential),
            COSE.Utils.fromText(message),
            { signature: Uint8Array.from(Buffer.from(signature, 'hex')), key: Uint8Array.from(Buffer.from(key, 'hex')) },
        );
    } catch {
        valid = false;
    }
    if (!valid) {
        throw invalidSignature();
    }
    return subjectOf(account);
};

/** Issues a challenge for `address` (checked against `network`); `playerId` binds a link to a player. */
const createChallenge = async (pool, { purpose, address, playerId = null, network, now }) => {
    if (!cardano.ChallengePurpose.includes(purpose) || typeof address !== 'string') {
        throw invalidRequest();
    }
    // the usual (lower case) form of the address, whatever the game sent
    const canonical = RewardAccount.toBech32(rewardAccountOf(address, network));
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date(now());
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const message = cardano.challengeMessage({ address: canonical, purpose, network, nonce, issuedAt, expiresAt });
    await pool.query(
        'INSERT INTO auth_challenges (nonce, purpose, address, player_id, message, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [nonce, purpose, canonical, playerId, message, expiresAt]);
    return { nonce, message, expiresAt: expiresAt.toISOString() };
};

/** Takes a challenge out (it works once); CHALLENGE EXPIRED when it is unknown, used or too old. */
const consumeChallenge = async (pool, nonce, now) => {
    if (typeof nonce !== 'string') {
        throw new HttpError(400, ErrorCode.CHALLENGE_EXPIRED);
    }
    const { rows } = await pool.query('DELETE FROM auth_challenges WHERE nonce = $1 RETURNING *', [nonce]);
    if (rows.length === 0 || new Date(rows[0].expires_at).getTime() <= now()) {
        throw new HttpError(400, ErrorCode.CHALLENGE_EXPIRED);
    }
    return rows[0];
};

/** The player a key is linked to, undefined when it is linked to nobody. */
const playerOfSubject = async (pool, subject) => {
    const { rows } = await pool.query('SELECT player_id FROM identities WHERE provider = $1 AND subject = $2', [IDENTITY_PROVIDER, subject]);
    return rows.length > 0 ? rows[0].player_id : undefined;
};

/** Links a key to a player; again for the same player is fine, for another one IDENTITY TAKEN. */
const linkIdentity = async (pool, { playerId, subject, address }) => {
    const owner = await playerOfSubject(pool, subject);
    if (typeof owner === 'undefined') {
        try {
            await pool.query('INSERT INTO identities (provider, subject, player_id) VALUES ($1, $2, $3)',
                [IDENTITY_PROVIDER, subject, playerId]);
            return { provider: IDENTITY_PROVIDER, subject, address };
        } catch (error) {
            // linked at the same moment by another request: decided below by who has it now
            if (typeof (await playerOfSubject(pool, subject)) === 'undefined') {
                throw error;
            }
            return linkIdentity(pool, { playerId, subject, address });
        }
    }
    if (owner !== playerId) {
        throw new HttpError(409, ErrorCode.IDENTITY_TAKEN);
    }
    return { provider: IDENTITY_PROVIDER, subject, address };
};

/** How many Cardano keys a player has. */
const keyCount = (pool, playerId) => count(pool,
    'SELECT COUNT(*) AS n FROM identities WHERE player_id = $1 AND provider = $2', [playerId, IDENTITY_PROVIDER]);

// passkey backups: base64url text of plausible sizes (a credential id is at most 1023 bytes)
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const plausible = (text, max) => typeof text === 'string' && text.length > 0 && text.length <= max && BASE64URL.test(text);

// passkeys per player: a few devices and password managers, not a storage
const MAX_PASSKEYS = 10;

/**
 * Stores a passkey backup of the words of one of the player's keys: true when it is new, false
 * when that passkey has the same one already (another one for it: PASSKEY TAKEN). INVALID
 * REQUEST PARAMETERS for anything else, TOO MANY PASSKEYS over the cap. The caller runs it one at
 * a time per player.
 */
const storePasskey = async (pool, playerId, { credentialId, subject, iv, data } = {}) => {
    if (!plausible(credentialId, 1400) || !plausible(iv, 64) || !plausible(data, 4096) || typeof subject !== 'string') {
        throw invalidRequest();
    }
    if (await playerOfSubject(pool, subject) !== playerId) {
        throw invalidRequest();
    }
    const { rows } = await pool.query('SELECT player_id, subject, iv, data FROM passkey_backups WHERE credential_id = $1', [credentialId]);
    if (rows.length > 0) {
        const [row] = rows;
        if (row.player_id !== playerId) {
            throw invalidRequest();
        }
        // the same backup again is fine; another one must not replace what a passkey guards
        if (row.subject !== subject || row.iv !== iv || row.data !== data) {
            throw new HttpError(409, ErrorCode.PASSKEY_TAKEN);
        }
        return false;
    }
    if (await count(pool, 'SELECT COUNT(*) AS n FROM passkey_backups WHERE player_id = $1', [playerId]) >= MAX_PASSKEYS) {
        throw new HttpError(409, ErrorCode.TOO_MANY_PASSKEYS);
    }
    await pool.query('INSERT INTO passkey_backups (credential_id, player_id, subject, iv, data) VALUES ($1, $2, $3, $4, $5)',
        [credentialId, playerId, subject, iv, data]);
    return true;
};

/** The player's passkey backups: [{ credentialId, subject, createdAt }]. */
const passkeysOf = async (pool, playerId) => {
    const { rows } = await pool.query(
        'SELECT credential_id, subject, created_at FROM passkey_backups WHERE player_id = $1 ORDER BY created_at ASC, credential_id ASC',
        [playerId]);
    return rows.map(row => ({ credentialId: row.credential_id, subject: row.subject, createdAt: new Date(row.created_at).toISOString() }));
};

/**
 * The encrypted words of a passkey ({ iv, data }: only what the passkey opens, not whose they
 * are); undefined when there are none.
 */
const passkeyBackup = async (pool, credentialId) => {
    const { rows } = await pool.query('SELECT iv, data FROM passkey_backups WHERE credential_id = $1', [String(credentialId)]);
    return rows.length > 0 ? { iv: rows[0].iv, data: rows[0].data } : undefined;
};

/** Deletes the challenges nobody used in time (cleanup.js). */
const cleanupChallenges = (pool, now) => pool.query('DELETE FROM auth_challenges WHERE expires_at < $1', [new Date(now)]);

module.exports = {
    CHALLENGE_TTL_MS,
    IDENTITY_PROVIDER,
    addressOfSubject,
    verifySignature,
    createChallenge,
    consumeChallenge,
    playerOfSubject,
    linkIdentity,
    keyCount,
    storePasskey,
    passkeysOf,
    passkeyBackup,
    cleanupChallenges,
};
