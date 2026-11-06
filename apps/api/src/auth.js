// Device accounts: a player gets a random refresh token on the first launch, stores it on the
// device and exchanges it for short-lived access tokens (signed JWTs). The acting player of
// every request is always taken from the access token, never from the request body.
// Later identities (a wallet) attach to the same player through the identities table.

const crypto = require('crypto');
const { HttpError, ErrorCode } = require('./errors');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
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
    const issueAccessToken = async playerId => {
        const issuedAt = Math.floor(now() / 1000);
        const token = signJwt({ sub: playerId, iss: ISSUER, iat: issuedAt, exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS }, secret);
        return { accessToken: token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
    };

    // creates a session for a player and returns the plain refresh token (only time it exists)
    const createSession = async playerId => {
        const refreshToken = randomToken();
        await pool.query('INSERT INTO sessions (id, player_id, token_hash) VALUES ($1, $2, $3)',
            [crypto.randomUUID(), playerId, sha256(refreshToken)]);
        return refreshToken;
    };

    const refresh = async refreshToken => {
        if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
            throw new HttpError(401, ErrorCode.INVALID_REFRESH_TOKEN);
        }
        const { rows } = await pool.query('SELECT id, player_id, revoked FROM sessions WHERE token_hash = $1', [sha256(refreshToken)]);
        if (rows.length === 0 || rows[0].revoked) {
            throw new HttpError(401, ErrorCode.INVALID_REFRESH_TOKEN);
        }
        await pool.query('UPDATE sessions SET last_used_at = NOW() WHERE id = $1', [rows[0].id]);
        return { playerId: rows[0].player_id, ...(await issueAccessToken(rows[0].player_id)) };
    };

    const verify = async accessToken => {
        let payload;
        try {
            payload = verifyJwt(accessToken, secret);
        } catch (error) {
            throw new HttpError(401, ErrorCode.INVALID_ACCESS_TOKEN);
        }
        if (payload.iss !== ISSUER || typeof payload.sub !== 'string' || !(payload.exp > Math.floor(now() / 1000))) {
            throw new HttpError(401, ErrorCode.INVALID_ACCESS_TOKEN);
        }
        return payload.sub;
    };

    // Express middleware: sets req.playerId or fails with 401
    const requireAuth = async (req, res, next) => {
        const header = req.get('authorization') || '';
        const match = /^Bearer (.+)$/.exec(header);
        if (!match) {
            throw new HttpError(401, ErrorCode.MISSING_ACCESS_TOKEN);
        }
        req.playerId = await verify(match[1]);
        next();
    };

    return { createSession, refresh, verify, issueAccessToken, requireAuth };
};

module.exports = { createAuth, ACCESS_TOKEN_TTL_SECONDS };
