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
const { createChain, loadServerKey } = require('./chain');
const { createWatcher } = require('./chain/watcher');
const { operationsStep } = require('./chain/operationsStep');
const { ownershipStep } = require('./chain/ownership');
const { createCreditStep } = require('./chain/credit');

// Docker waits 10 seconds after SIGTERM, then it kills the container: the process leaves on its
// own before that, also when a part of the shutdown hangs.
const SHUTDOWN_TIMEOUT_MS = 8000;

/** The line the start logs for the chain's provider (config.js `chain`): its kind and host, never its key. */
const chainProviderLine = chainConfig => `chain provider: ${chainConfig.providerKind} at ${new URL(chainConfig.providerUrl).host}`;

/**
 * The warning the start logs for Koios without a key (its public tier): that tier limits a
 * request's body to 1 kB and a mint is 2–3 kB, so its submit may be refused. Null otherwise.
 */
const chainProviderWarning = chainConfig =>
    chainConfig.providerKind === 'koios' && !chainConfig.providerKey
        ? "chain provider: Koios's public tier (no key) limits a request to 1 kB, a mint is 2-3 kB: minting may be refused for size: set CHAIN_PROVIDER_KEY (a free Koios token)"
        : null;

/**
 * With the chain features on, the watcher of the chain (its steps: the chain operations, then the
 * ownership sync, which must see a mint that landed as a minted item, then the credit of burned
 * items over `recipes`, after the sync has seen the burn) in `runtime.watcher`, started: the
 * function that stops it. Off, no watcher: a stop that does nothing.
 */
const startWatcher = ({ chain, pool, intervalMs, runtime, recipes, log = console }) => {
    if (!chain.enabled) {
        return () => {};
    }
    const watcher = createWatcher({ chain, pool, steps: [operationsStep, ownershipStep, createCreditStep({ recipes })], intervalMs, log });
    runtime.watcher = watcher;
    return watcher.start();
};

/**
 * The handler of SIGTERM and SIGINT: stops the cleanup and the chain watcher, saves the running
 * matches (they resume after the restart, clients reconnect), then closes the HTTP server and the
 * pool, whatever failed before, and exits. A second signal while it runs changes nothing.
 */
const createShutdown = ({
    stopCleanup, stopWatcher = () => {}, live, server, pool, exit = process.exit, log = console, setTimer = setTimeout, timeoutMs = SHUTDOWN_TIMEOUT_MS,
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
            try {
                stopWatcher();
            } catch (error) {
                failed = true;
                log.error('shutdown: stopping the chain watcher failed', error);
            }
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
 * Starts the backend; `wrap(app, { pool, runtime })` may put a handler around the REST app (the
 * browser tests add routes of their own, see test/e2eServer.js); `runtime.chain` is the chain of
 * the server, `runtime.watcher` its watcher once it runs. `env` is the environment to configure it
 * from; `chainOverrides` (tests only) are doubles of the chain's provider and index (createChain);
 * `appOptions({ chain })` (tests only) answers options of createApp that win over the configured
 * ones (the browser tests' API reads the on-chain config on every request).
 */
const main = async ({ wrap = app => app, env = process.env, chainOverrides, appOptions = () => ({}) } = {}) => {
    // first of all: a mistake in the environment stops the start before anything is opened
    const config = loadConfig(env);
    // the server key, loaded once with the chain features on: a file that is no key file (none,
    // /dev/null, a directory, empty, open to others, not one ed25519_sk1… line) stops the start
    // with a message that names CHAIN_SERVER_KEY_FILE, never what is in the file
    const serverKey = config.chain ? loadServerKey(config.chain.serverKeyFile) : null;
    const recipes = loadRecipes(config.recipesFile, config.nodeEnv);
    const pool = createPool({ databaseUrl: config.databaseUrl, ...config.database });
    await migrate(pool);
    if (config.chainMissing.length > 0) {
        console.log(`chain features off: missing ${config.chainMissing.join(', ')}`);
    }
    if (config.chain) {
        console.log(chainProviderLine(config.chain));
        const warning = chainProviderWarning(config.chain);
        if (warning) {
            console.warn(warning);
        }
    }
    const chain = createChain({ config, pool, log: console, overrides: chainOverrides, serverKey });
    const runtime = { chain, watcher: null };
    const auth = createAuth({ pool, secret: config.jwtSecret });
    const push = createPush({ pool, ...config.vapid });
    // the link preview of a challenge asks the live lobby, which starts after the HTTP server exists
    let live;
    const challengeInfo = code => (live ? live.lobby.challenges.publicInfo(code) : null);
    const app = createApp({
        pool,
        auth,
        push,
        corsOrigins: config.corsOrigins,
        recipes,
        challengeInfo,
        cardanoNetwork: config.cardanoNetwork,
        chain,
        ...(config.accountsPerMinute ? { accountsPerMinute: config.accountsPerMinute } : {}),
        ...(config.cardanoPerMinute ? { cardanoPerMinute: config.cardanoPerMinute } : {}),
        ...appOptions({ chain }),
    });
    const server = http.createServer(wrap(app, { pool, runtime }));
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
    // the chain watcher starts once the server listens (its first run reads the chain at once)
    let stopWatcher = () => {};
    server.listen(config.port, () => {
        console.log(`battlechoc api listening on ${config.port}`);
        if (chain.enabled) {
            stopWatcher = startWatcher({ chain, pool, intervalMs: config.chain.watchIntervalMs, runtime, recipes });
        }
    });

    const shutdown = createShutdown({ stopCleanup, stopWatcher: () => stopWatcher(), live, server, pool });
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

module.exports = { main, chainProviderLine, createShutdown, startWatcher };
