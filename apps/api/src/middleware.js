// What a request passes around the routes: CORS, rate limits, loading the player, and the answers
// for unknown paths and for errors.

const players = require('./players');
const { HttpError, ErrorCode } = require('./errors');

// small CORS middleware for the PWA origins (custom headers included)
const cors = origins => (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, battlechoc-pwa-version, battlechoc-pwa-date');
        res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
};

// fixed window rate limit per client address
const rateLimit = ({ windowMs, max }) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip;
        const entry = hits.get(key);
        if (!entry || now - entry.since > windowMs) {
            hits.set(key, { since: now, count: 1 });
        } else if (entry.count >= max) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        } else {
            entry.count += 1;
        }
        next();
    };
};

/** After auth.requireAuth: puts the player's row into req.player, or answers 404. */
const requirePlayer = pool => async (req, res, next) => {
    req.player = await players.findPlayer(pool, req.playerId);
    if (!req.player) {
        throw new HttpError(404, ErrorCode.PLAYER_NOT_FOUND);
    }
    next();
};

// after all routes: no route took the request
const notFound = () => {
    throw new HttpError(404, ErrorCode.NOT_FOUND);
};

/** Turns what a route or a middleware threw into the response; anything unexpected is logged and answered with 500. */
const errorHandler = ({ log = console } = {}) =>
    // eslint-disable-next-line no-unused-vars
    (error, req, res, next) => {
        if (error instanceof HttpError) {
            res.status(error.status).json({ error: error.code });
        } else if (error.type === 'entity.parse.failed') {
            res.status(400).json({ error: ErrorCode.INVALID_JSON });
        } else {
            log.error(error);
            res.status(500).json({ error: ErrorCode.INTERNAL_SERVER_ERROR });
        }
    };

module.exports = { cors, rateLimit, requirePlayer, notFound, errorHandler };
