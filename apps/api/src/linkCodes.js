// Link codes (plan 3): a code ties battlechoc's link page, open in a phone wallet's own browser,
// to the device's player. Only the code's SHA-256 hash is stored; a code lives 10 minutes and a
// player has at most one (a new one replaces the old one). The outcome waits on the code until the
// game polls it; a known wallet's session is made then, never handed to the link page.

const crypto = require('crypto');
const { HttpError, ErrorCode } = require('./errors');

const CODE_TTL_MS = 10 * 60 * 1000;
const PURPOSES = ['connect', 'link'];
const CODE = /^[A-Za-z0-9_-]{22}$/;

const hashOf = code => crypto.createHash('sha256').update(code).digest('hex');
const unknownCode = () => new HttpError(404, ErrorCode.UNKNOWN_LINK_CODE);

/**
 * A new code for the player ({ code, expiresAt }); `confirmedUntil` (ms): a key change was proved
 * for it until then (the confirm token's own expiry, never longer).
 */
const createLinkCode = async (pool, { playerId, purpose, confirmedUntil, now }) => {
    if (!PURPOSES.includes(purpose)) {
        throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
    }
    const code = crypto.randomBytes(16).toString('base64url');
    const expiresAt = new Date(now() + CODE_TTL_MS);
    await pool.query('DELETE FROM link_codes WHERE player_id = $1', [playerId]);
    await pool.query('INSERT INTO link_codes (code_hash, player_id, purpose, confirmed_until, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [hashOf(code), playerId, purpose, typeof confirmedUntil === 'number' ? new Date(confirmedUntil) : null, expiresAt]);
    return { code, expiresAt: expiresAt.toISOString() };
};

/** The open code behind `code` or behind a challenge's `codeHash`; UNKNOWN LINK CODE otherwise. */
const openCode = async (pool, { code, codeHash }, now) => {
    if (typeof codeHash !== 'string' && !(typeof code === 'string' && CODE.test(code))) {
        throw unknownCode();
    }
    const { rows } = await pool.query("SELECT * FROM link_codes WHERE code_hash = $1 AND state = 'open'",
        [codeHash || hashOf(code)]);
    if (rows.length === 0 || new Date(rows[0].expires_at).getTime() <= now()) {
        throw unknownCode();
    }
    return rows[0];
};

/**
 * Takes the open code behind a challenge's `codeHash` for one signature (state 'busy'), so two
 * signatures for one code never both act; UNKNOWN LINK CODE when it is not open (any more).
 */
const claim = async (pool, codeHash, now) => {
    const { rows } = await pool.query(
        "UPDATE link_codes SET state = 'busy' WHERE code_hash = $1 AND state = 'open' AND expires_at > $2 RETURNING *",
        [codeHash, new Date(now())]);
    if (rows.length === 0) {
        throw unknownCode();
    }
    return rows[0];
};

/** Gives a claimed code back (handling its signature failed): it can be signed for again. */
const release = (pool, codeHash) => pool.query("UPDATE link_codes SET state = 'open' WHERE code_hash = $1 AND state = 'busy'", [codeHash]);

/** Records what the link page achieved for a claimed code (state 'linked' | 'known' | 'confirm' | 'failed'). */
const settle = (pool, codeHash, { state, subject = null, ownerId = null, error = null }) => pool.query(
    "UPDATE link_codes SET state = $2, subject = $3, owner_id = $4, error = $5 WHERE code_hash = $1 AND state = 'busy'",
    [codeHash, state, subject, ownerId, error]);

/**
 * What the game learns when it polls: the open code as it is, or its outcome, which is taken out
 * (once). UNKNOWN LINK CODE for a code that is unknown, expired, replaced or another player's.
 */
const takeOutcome = async (pool, { code, playerId, now }) => {
    if (typeof code !== 'string' || !CODE.test(code)) {
        throw unknownCode();
    }
    const live = 'code_hash = $1 AND player_id = $2 AND expires_at > $3';
    const params = [hashOf(code), playerId, new Date(now())];
    const { rows } = await pool.query(`DELETE FROM link_codes WHERE ${live} AND state NOT IN ('open', 'busy') RETURNING *`, params);
    if (rows.length > 0) {
        return rows[0];
    }
    const open = await pool.query(`SELECT state FROM link_codes WHERE ${live}`, params);
    if (open.rows.length === 0) {
        throw unknownCode();
    }
    // a signature being handled is still open for the game
    return { state: 'open' };
};

/** Deletes the codes nobody finished in time (cleanup.js). */
const cleanupLinkCodes = (pool, now) => pool.query('DELETE FROM link_codes WHERE expires_at < $1', [new Date(now)]);

module.exports = { CODE_TTL_MS, hashOf, createLinkCode, openCode, claim, release, settle, takeOutcome, cleanupLinkCodes };
