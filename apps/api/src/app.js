// REST API of battlechoc. Paths and response shapes follow the legacy Cloud Functions API so
// the PWA changes stay small; authentication uses device accounts (see auth.js). This file puts
// the app together: the routes are in routes/, lab/routes.js and playPage.js, what runs around
// them in middleware.js.

const express = require('express');
const { securityHeaders, cors, rateLimit, requirePlayer, notFound, errorHandler } = require('./middleware');
const { registerAccountRoutes } = require('./routes/accounts');
const { registerPlayerRoutes } = require('./routes/player');
const { registerSocialRoutes } = require('./routes/social');
const { registerPushRoutes } = require('./routes/push');
const { registerCardanoRoutes } = require('./routes/cardano');
const { registerLabRoutes } = require('./lab/routes');
const { registerPlayRoutes } = require('./playPage');
const { loadRecipes } = require('./lab/recipes');
const { createKeyedQueue } = require('./queue');

// A game refreshes its token when it starts and when a token ran out, so a few times an hour. The
// limit per address is far above that, also for many players behind one address (a school, a
// mobile network); it only stops a client that hammers the endpoint.
const TOKENS_PER_MINUTE = 120;

const createApp = ({
    pool, auth, push, corsOrigins = [], accountsPerMinute = 10, tokensPerMinute = TOKENS_PER_MINUTE, recipes = loadRecipes(),
    labTriesPerHour = 30, challengeInfo = () => null, cardanoNetwork = null, cardanoPerMinute = 30, now = () => Date.now(),
}) => {
    const app = express();
    // purchases and equipment changes of one player run one at a time
    const oneAtATime = createKeyedQueue();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(securityHeaders);
    app.use(cors(corsOrigins));
    app.use(express.json({ limit: '256kb' }));

    // a route for a player: the access token, then the player's row in req.player
    const user = [auth.requireAuth, requirePlayer(pool)];

    // Cheap by default: the process answers (what a proxy or Docker asks every few seconds).
    // ?deep=1 also asks the database, for a monitor that wants to know whether the API can work;
    // limited per address, because it is open to everyone and takes a connection of the pool.
    const deepLimit = rateLimit({ windowMs: 60000, max: 60 });
    app.get('/health', (req, res, next) => {
        if (req.query.deep !== '1') {
            res.json({ ok: true });
            return;
        }
        deepLimit(req, res, next);
    }, async (req, res) => {
        const database = await pool.query('SELECT 1').then(() => true, () => false);
        res.status(database ? 200 : 503).json({ ok: database, database });
    });

    // the link preview of a challenge (play.battlechoc.com/<code>)
    registerPlayRoutes(app, { challengeInfo, limit: rateLimit({ windowMs: 60000, max: 60 }) });
    registerAccountRoutes(app, {
        pool,
        auth,
        limit: rateLimit({ windowMs: 60000, max: accountsPerMinute }),
        tokenLimit: rateLimit({ windowMs: 60000, max: tokensPerMinute }),
    });
    // signing in with a Cardano key, only on a server with CARDANO_NETWORK
    if (cardanoNetwork) {
        registerCardanoRoutes(app, {
            pool, auth, user, network: cardanoNetwork, limit: rateLimit({ windowMs: 60000, max: cardanoPerMinute }), oneAtATime, now,
        });
    }
    registerPlayerRoutes(app, { pool, auth, user });
    registerLabRoutes(app, { pool, user, recipes, oneAtATime, triesPerHour: labTriesPerHour });
    // last of the routes under /user: its GET /user/:name matches every path the others left
    registerSocialRoutes(app, { pool, auth, user });
    registerPushRoutes(app, { push, user });

    app.use(notFound);
    app.use(errorHandler());

    return app;
};

module.exports = { createApp };
