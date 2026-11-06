// Entry point of the battlechoc backend: REST API and the live match WebSocket (/live) on one
// HTTP server (see deploy/docker-compose.yml for the environment, config.js for what is read from it).

const http = require('http');
const { loadConfig, ConfigError } = require('./config');
const { createPool, migrate } = require('./db');
const { createAuth } = require('./auth');
const { createPush } = require('./push');
const { createApp } = require('./app');
const { createLive } = require('./live');
const { loadRecipes } = require('./lab/recipes');
const { scheduleCleanup } = require('./cleanup');

/**
 * Starts the backend; `wrap(app, { pool })` may put a handler around the REST app (the browser
 * tests add a route of their own, see test/e2eServer.js). `env` is the environment to configure
 * it from.
 */
const main = async ({ wrap = app => app, env = process.env } = {}) => {
    // first of all: a mistake in the environment stops the start before anything is opened
    const config = loadConfig(env);
    const recipes = loadRecipes(config.recipesFile, config.nodeEnv);
    const pool = createPool({ databaseUrl: config.databaseUrl, ...config.database });
    await migrate(pool);
    const auth = createAuth({ pool, secret: config.jwtSecret });
    const push = createPush({ pool, ...config.vapid });
    // the link preview of a challenge asks the live lobby, which starts after the HTTP server exists
    let live;
    const challengeInfo = code => (live ? live.lobby.challenges.publicInfo(code) : null);
    const app = createApp({ pool, auth, push, corsOrigins: config.corsOrigins, recipes, challengeInfo });
    const server = http.createServer(wrap(app, { pool }));
    live = createLive({ server, pool, auth, origins: config.corsOrigins, config: config.live });
    const recovered = await live.recover();
    if (recovered > 0) {
        console.log(`recovered ${recovered} running matches`);
    }
    // spoiled and used-up ingredient batches and old problem reports are deleted once an hour
    const stopCleanup = scheduleCleanup(pool);
    server.listen(config.port, () => console.log(`battlechoc api listening on ${config.port}`));

    // running matches are saved and resume after the restart (clients reconnect)
    const shutdown = async () => {
        stopCleanup();
        await live.close();
        server.close(() => pool.end().then(() => process.exit(0)));
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

if (require.main === module) {
    main().catch(error => {
        // a configuration problem is its message; anything else is shown with its stack
        console.error(error instanceof ConfigError ? error.message : error);
        process.exit(1);
    });
}

module.exports = { main };
