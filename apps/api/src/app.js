// REST API of battlechoc. Paths and response shapes follow the legacy Cloud Functions API so
// the PWA changes stay small; authentication uses device accounts (see auth.js). This file puts
// the app together: the routes are in routes/, lab/routes.js and playPage.js, what runs around
// them in middleware.js.

const express = require('express');
const { cors, rateLimit, requirePlayer, notFound, errorHandler } = require('./middleware');
const { registerAccountRoutes } = require('./routes/accounts');
const { registerPlayerRoutes } = require('./routes/player');
const { registerSocialRoutes } = require('./routes/social');
const { registerPushRoutes } = require('./routes/push');
const { registerLabRoutes } = require('./lab/routes');
const { registerPlayRoutes } = require('./playPage');
const { loadRecipes } = require('./lab/recipes');
const { createKeyedQueue } = require('./queue');

const createApp = ({
    pool, auth, push, corsOrigins = [], accountsPerMinute = 10, recipes = loadRecipes(), labTriesPerHour = 30, challengeInfo = () => null,
}) => {
    const app = express();
    // purchases and equipment changes of one player run one at a time
    const oneAtATime = createKeyedQueue();
    app.set('trust proxy', 1);
    app.use(cors(corsOrigins));
    app.use(express.json({ limit: '256kb' }));

    // a route for a player: the access token, then the player's row in req.player
    const user = [auth.requireAuth, requirePlayer(pool)];

    app.get('/health', (req, res) => res.json({ ok: true }));

    // the link preview of a challenge (play.battlechoc.com/<code>)
    registerPlayRoutes(app, { challengeInfo, limit: rateLimit({ windowMs: 60000, max: 60 }) });
    registerAccountRoutes(app, { pool, auth, limit: rateLimit({ windowMs: 60000, max: accountsPerMinute }) });
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
