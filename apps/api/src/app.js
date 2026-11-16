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
const { registerChainRoutes, registerChainStatus, sessionlessBodyParser } = require('./routes/chain');
const { createConfigReader } = require('./chain/config');
const { UTXO_CACHE } = require('./chain/readiness');
const { registerLabRoutes } = require('./lab/routes');
const { registerPlayRoutes } = require('./playPage');
const { registerItemRoutes } = require('./routes/items');
const { loadRecipes } = require('./lab/recipes');
const { createKeyedQueue } = require('./queue');

// A game refreshes its token when it starts and when a token ran out, so a few times an hour. The
// limit per address is far above that, also for many players behind one address (a school, a
// mobile network); it only stops a client that hammers the endpoint.
const TOKENS_PER_MINUTE = 120;
// The public data of a minted item (GET /items/:assetName), per address and minute: the item page
// asks it once per view; anyone can ask it, and each request takes a query.
const ITEMS_PER_MINUTE = 60;
// The routes of the items on the chain, per minute. The game asks for the readiness when the
// player opens the mint dialog and after a wallet change, and for an operation while it waits: a
// few times a minute per player (`perPlayer`, one bucket for a player's /chain routes; a readiness
// asks the provider for at most 8 wallets). Many players may share an address (a school, a mobile
// network): `perAddress` in front of those routes is looser and only stops a client that hammers.
// The sign routes have no session: `signPerAddress`. A player starts a mint once per try (and again
// after a refusal they fixed); each mint asks the provider and builds, a refused one two or three
// times: `mintsPerPlayer`, besides the player's bucket; a burn of a minted item (plan E) the same:
// `burnsPerPlayer`.
// GET /chain/status, which every web game asks once a session and which touches nothing, has a
// light limit per address of its own: `statusPerAddress`.
// A rebuild of a prepared mint or burn from the wallet's addresses asks the provider and builds:
// `rebuildsPerAddressAndOperation`, so a stranger with the sign code cannot use up the player's.
// A cancel (DELETE /chain/operations/:id) has a bucket of its own per player, `cancelsPerPlayer`,
// instead of the player's: two tabs polling an operation cannot starve the cancel of it.
const CHAIN_LIMITS = Object.freeze({
    perAddress: 120,
    perPlayer: 30,
    signPerAddress: 30,
    mintsPerPlayer: 5,
    burnsPerPlayer: 5,
    cancelsPerPlayer: 10,
    statusPerAddress: 60,
    rebuildsPerAddressAndOperation: 5,
});

const createApp = ({
    pool, auth, push, corsOrigins = [], accountsPerMinute = 10, tokensPerMinute = TOKENS_PER_MINUTE, recipes = loadRecipes(),
    labTriesPerHour = 30, challengeInfo = () => null, cardanoNetwork = null, cardanoPerMinute = 30, now = () => Date.now(),
    // the chain of the server (chain/index.js), off unless configured, for the routes of the items
    // on the chain; the reader of its on-chain config (chain/config.js), one per app for its cache;
    // requests per minute (CHAIN_LIMITS): per address to the sign routes, per address and per
    // player to the others, mints, burns and cancels per player, per address to the status,
    // rebuilds per address and operation; how readiness asks the provider (readiness.js
    // READINESS_FAN_OUT, for tests) and how long it keeps a wallet's UTxOs (UTXO_CACHE; 0 keeps
    // nothing); where those routes report a config they cannot read and a mint they could not build
    chain = { enabled: false, missing: [] },
    chainConfig = chain.enabled ? createConfigReader({ chain, now }) : null,
    chainPerMinute = CHAIN_LIMITS.signPerAddress,
    chainAddressPerMinute = CHAIN_LIMITS.perAddress,
    chainPlayerPerMinute = CHAIN_LIMITS.perPlayer,
    chainMintsPerMinute = CHAIN_LIMITS.mintsPerPlayer,
    chainBurnsPerMinute = CHAIN_LIMITS.burnsPerPlayer,
    chainCancelsPerMinute = CHAIN_LIMITS.cancelsPerPlayer,
    chainStatusPerMinute = CHAIN_LIMITS.statusPerAddress,
    chainRebuildsPerMinute = CHAIN_LIMITS.rebuildsPerAddressAndOperation,
    chainReadinessFanOut = {},
    chainReadinessCacheMs = UTXO_CACHE.ttlMs,
    chainLog = console,
    // requests per minute and address to the public data of a minted item
    itemsPerMinute = ITEMS_PER_MINUTE,
}) => {
    const app = express();
    // purchases and equipment changes of one player run one at a time
    const oneAtATime = createKeyedQueue();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(securityHeaders);
    app.use(cors(corsOrigins));
    // whether minting is on: before any body parser, so it reads none
    registerChainStatus(app, { chain, statusLimit: rateLimit({ windowMs: 60000, max: chainStatusPerMinute, now }) });
    // the item page's data: no session, with the chain features on or off; before any body parser,
    // so a GET with a body is never read
    registerItemRoutes(app, { pool, limit: rateLimit({ windowMs: 60000, max: itemsPerMinute, now }) });
    // the sign routes have no session: their body is bounded more tightly, before it is read, and
    // what the parser refuses is a 400 (with the chain off they are CHAIN OFF, whatever the body)
    if (chain.enabled) {
        app.use('/chain/sign', sessionlessBodyParser());
    }
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
    registerChainRoutes(app, {
        pool,
        user,
        chain,
        recipes,
        config: chainConfig,
        limit: rateLimit({ windowMs: 60000, max: chainPerMinute, now }),
        sessionLimit: rateLimit({ windowMs: 60000, max: chainAddressPerMinute, now }),
        playerPerMinute: chainPlayerPerMinute,
        mintsPerMinute: chainMintsPerMinute,
        burnsPerMinute: chainBurnsPerMinute,
        cancelsPerMinute: chainCancelsPerMinute,
        rebuildsPerMinute: chainRebuildsPerMinute,
        readinessFanOut: chainReadinessFanOut,
        readinessCacheMs: chainReadinessCacheMs,
        oneAtATime,
        now,
        log: chainLog,
    });
    registerPlayerRoutes(app, { pool, auth, user, oneAtATime, now });
    registerLabRoutes(app, { pool, user, recipes, oneAtATime, triesPerHour: labTriesPerHour, now });
    // last of the routes under /user: its GET /user/:name matches every path the others left
    registerSocialRoutes(app, { pool, auth, user });
    registerPushRoutes(app, { push, user });

    app.use(notFound);
    app.use(errorHandler());

    return app;
};

module.exports = { createApp, CHAIN_LIMITS };
