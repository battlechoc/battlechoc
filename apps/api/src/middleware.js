// What a request passes around the routes: CORS, rate limits, loading the player, and the answers
// for unknown paths and for errors.

const players = require('./players');
const { fixedWindowLimit } = require('./limits');
const { HttpError, ErrorCode } = require('./errors');

// For every response: browsers take the content type as given (no sniffing of JSON as HTML), and
// a link out of a page of ours does not tell the target where the visitor came from. The page with
// a script (playPage.js) adds its content security policy itself.
const securityHeaders = (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
};

// small CORS middleware for the PWA origins (custom headers included)
const cors = origins => (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, battlechoc-pwa-version, battlechoc-pwa-date, X-Battlechoc-Confirm');
        res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
};

// fixed window rate limit per client address; `size` is the number of addresses it remembers
const rateLimit = options => {
    const limit = fixedWindowLimit(options);
    const middleware = (req, res, next) => {
        if (!limit.allow(req.ip)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_REQUESTS);
        }
        next();
    };
    Object.defineProperty(middleware, 'size', { get: () => limit.size });
    return middleware;
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

module.exports = { securityHeaders, cors, rateLimit, requirePlayer, notFound, errorHandler };
