// Device accounts: a player gets a random refresh token on the first launch, stores it on the
// device and exchanges it for short-lived access tokens (signed JWTs). The acting player of
// every request is always taken from the access token, never from the request body.
// Later identities (a wallet) attach to the same player through the identities table.

const crypto = require('crypto');
const { HttpError, ErrorCode } = require('./errors');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// a confirm token proves a fresh signature by one of the player's keys (key changes, routes/cardano.js)
const CONFIRM_TOKEN_TTL_SECONDS = 5 * 60;
const CONFIRM = 'confirm';
const ISSUER = 'battlechoc';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

// minimal HS256 JSON Web Tokens with Node's crypto (header, payload, HMAC-SHA256 signature)
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
const signJwt = (payload, secret) => {
    const body = `${HEADER}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    return `${body}.${hmac(secret, body)}`;
};
const verifyJwt = (token, secret) => {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3 || parts[0] !== HEADER) {
        throw new Error('malformed token');
    }
    const expected = Buffer.from(hmac(secret, `${parts[0]}.${parts[1]}`));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        throw new Error('bad signature');
    }
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
};

const createAuth = ({ pool, secret, now = () => Date.now() }) => {
    if (!secret || secret.length < 32) {
        throw new Error('JWT secret must have at least 32 characters');
    }
    // `sessionId`: the session the token was issued for (sid), so a key removal can spare it
    const issueAccessToken = async (playerId, sessionId) => {
        const issuedAt = Math.floor(now() / 1000);
        const token = signJwt({
            sub: playerId, iss: ISSUER, iat: issuedAt, exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
            ...(sessionId ? { sid: sessionId } : {}),
        }, secret);
        return { accessToken: token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
    };

    // creates a session for a player: { refreshToken (the only time it exists in plain), sessionId };
    // `subject`: the Cardano key that signed in (removing the key ends the session)
    const createSession = async (playerId, { subject = null } = {}) => {
        const refreshToken = randomToken();
        const sessionId = crypto.randomUUID();
        await pool.query('INSERT INTO sessions (id, player_id, token_hash, subject) VALUES ($1, $2, $3, $4)',
            [sessionId, playerId, sha256(refreshToken), subject]);
        return { refreshToken, sessionId };
    };

    const refresh = async refreshToken => {
        if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
            throw new HttpError(401, ErrorCode.INVALID_REFRESH_TOKEN);
        }
        const { rows } = await pool.query('SELECT id, player_id, revoked, revoked_reason FROM sessions WHERE token_hash = $1',
            [sha256(refreshToken)]);
        if (rows.length === 0 || rows[0].revoked) {
            // a session that a key removal ended says so: the game forgets that key's words (still a
            // 401, so older games start anew as before)
            throw new HttpError(401, rows.length > 0 && rows[0].revoked_reason === 'key-removed'
                ? ErrorCode.SESSION_ENDED : ErrorCode.INVALID_REFRESH_TOKEN);
        }
        await pool.query('UPDATE sessions SET last_used_at = NOW() WHERE id = $1', [rows[0].id]);
        return { playerId: rows[0].player_id, ...(await issueAccessToken(rows[0].player_id, rows[0].id)) };
    };

    // ends the session of a refresh token (reason 'logout'); nothing for an unknown one
    const logout = async refreshToken => {
        if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
            return;
        }
        await pool.query("UPDATE sessions SET revoked = TRUE, revoked_reason = 'logout' WHERE token_hash = $1 AND NOT revoked",
            [sha256(refreshToken)]);
    };

    // the claims of a valid access token ({ sub, sid? })
    const verifyClaims = async accessToken => {
        let payload;
        try {
            payload = verifyJwt(accessToken, secret);
        } catch {
            throw new HttpError(401, ErrorCode.INVALID_ACCESS_TOKEN);
        }
        // a confirm token (`kind`) is never an access token
        if (payload.iss !== ISSUER || typeof payload.sub !== 'string' || typeof payload.kind !== 'undefined'
            || !(payload.exp > Math.floor(now() / 1000))) {
            throw new HttpError(401, ErrorCode.INVALID_ACCESS_TOKEN);
        }
        return payload;
    };

    const verify = async accessToken => (await verifyClaims(accessToken)).sub;

    const issueConfirmToken = playerId => {
        const issuedAt = Math.floor(now() / 1000);
        const confirmToken = signJwt({ sub: playerId, iss: ISSUER, kind: CONFIRM, iat: issuedAt, exp: issuedAt + CONFIRM_TOKEN_TTL_SECONDS }, secret);
        return { confirmToken, expiresIn: CONFIRM_TOKEN_TTL_SECONDS };
    };

    /** Whether `token` is a confirm token of `playerId` that has not expired. */
    const checkConfirmToken = (token, playerId) => {
        try {
            const payload = verifyJwt(token, secret);
            return payload.iss === ISSUER && payload.kind === CONFIRM && payload.sub === playerId
                && payload.exp > Math.floor(now() / 1000);
        } catch {
            return false;
        }
    };

    // Express middleware: sets req.playerId or fails with 401
    const requireAuth = async (req, res, next) => {
        const header = req.get('authorization') || '';
        const match = /^Bearer (.+)$/.exec(header);
        if (!match) {
            throw new HttpError(401, ErrorCode.MISSING_ACCESS_TOKEN);
        }
        const claims = await verifyClaims(match[1]);
        req.playerId = claims.sub;
        // the session the token belongs to (tokens from before have none)
        req.sessionId = claims.sid;
        next();
    };

    return { createSession, refresh, logout, verify, issueAccessToken, requireAuth, issueConfirmToken, checkConfirmToken };
};

module.exports = { createAuth, ACCESS_TOKEN_TTL_SECONDS };
