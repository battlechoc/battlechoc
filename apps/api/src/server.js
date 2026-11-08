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

// Docker waits 10 seconds after SIGTERM, then it kills the container: the process leaves on its
// own before that, also when a part of the shutdown hangs.
const SHUTDOWN_TIMEOUT_MS = 8000;

/**
 * The handler of SIGTERM and SIGINT: saves the running matches (they resume after the restart,
 * clients reconnect), then closes the HTTP server and the pool, whatever failed before, and exits.
 * A second signal while it runs changes nothing.
 */
const createShutdown = ({
    stopCleanup, live, server, pool, exit = process.exit, log = console, setTimer = setTimeout, timeoutMs = SHUTDOWN_TIMEOUT_MS,
}) => {
    let stopping = null;
    const stop = async () => {
        const forced = setTimer(() => {
            log.error(`shutdown not finished after ${timeoutMs} ms, exiting`);
            exit(1);
        }, timeoutMs);
        // the timer alone must not keep a process alive that has nothing else left to do
        forced.unref();
        let failed = false;
        // each step runs, also after an earlier one failed
        const step = async (name, run) => {
            try {
                await run();
            } catch (error) {
                failed = true;
                log.error(`shutdown: ${name} failed`, error);
            }
        };
        try {
            stopCleanup();
            await step('closing the live service', () => live.close());
        } finally {
            await step('closing the HTTP server', () => new Promise((resolve, reject) => {
                server.close(error => (error ? reject(error) : resolve()));
            }));
            await step('closing the database pool', () => pool.end());
            exit(failed ? 1 : 0);
        }
    };
    return () => {
        if (stopping === null) {
            stopping = stop();
        }
        return stopping;
    };
};

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
    const app = createApp({ pool, auth, push, corsOrigins: config.corsOrigins, recipes, challengeInfo, cardanoNetwork: config.cardanoNetwork });
    const server = http.createServer(wrap(app, { pool }));
    live = createLive({ server, pool, auth, origins: config.corsOrigins, config: config.live });
    const recovered = await live.recover();
    if (recovered > 0) {
        console.log(`recovered ${recovered} running matches`);
    }
    // spoiled and used-up ingredient batches and old problem reports are deleted once an hour;
    // matches only when the operator set a retention
    if (config.matchRetentionDays) {
        console.log(`match retention: actions and snapshots are deleted ${config.matchRetentionDays} days after a match is over`);
    }
    const stopCleanup = scheduleCleanup(pool, { matchRetentionDays: config.matchRetentionDays });
    server.listen(config.port, () => console.log(`battlechoc api listening on ${config.port}`));

    const shutdown = createShutdown({ stopCleanup, live, server, pool });
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

module.exports = { main, createShutdown };
