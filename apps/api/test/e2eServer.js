// The backend as the browser tests run it (apps/pwa/playwright.config.js): the real server plus
// routes the game never has, only against the in-memory database; the image holds src/ only
// (Dockerfile).
//
// - POST /test/pantry stocks a player's pantry the way drops of won matches would (rum is a rare
//   drop, and the starter kit alone crafts nothing).
// - /test/chain/*: the chain is the chain double (test/chainDouble.js) on the real clock, read by
//   the server through its provider and index (main's chainOverrides). A browser test mints,
//   moves and burns tokens, produces blocks and rolls them back through these routes. Each POST
//   runs the watcher (the ownership sync) before it answers, so the test sees the effect at once;
//   the watcher's own timer (CHAIN_WATCH_INTERVAL_MS) is long, the tests drive the runs.
//
// CHAIN_SERVER_KEY_FILE=generate writes the server key of the fixture contracts (test/helpers/
// chain.js fixtureKey('server'), a test key that is never funded) into a directory of the OS temp
// directory named after the port (parallel runs have their own ports), as chain/keys.js loadKey
// reads it. Whatever a start finds at that path (the directory of an earlier run that was killed)
// is removed first, and the key written anew. The directory is removed when the process exits:
// after SIGTERM or SIGINT (server.js shuts down and exits; playwright.config.js stops this server
// with SIGTERM, see its gracefulShutdown) and after a failed start, but not after a SIGKILL, which
// runs no code: then it stays until the next start on that port replaces it.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { AddressEras } = require('@evolution-sdk/evolution');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../src/pantry');
const { ErrorCode } = require('../src/errors');
const { writeKeyFile } = require('../src/chain/keys');
const { main } = require('../src/server');
const { TEST_POLICY_ID, createChainDouble } = require('./chainDouble');
const { fixtureKey } = require('./helpers/chain');
const { markMinted } = require('./helpers/mintedItems');

// the `to` of a mint or a move that means a fresh address nobody has
const STRANGER = 'stranger';
// the most blocks one call produces or rolls back
const MAX_BLOCKS = 100;
const USER_NAME = new RegExp(`^${rules.USER_LABEL}[0-9a-f]{56}$`);
const PROVIDER_FAULTS = [null, 'unavailable', 'busy'];
const INDEX_FAULTS = [null, 'unavailable', 'stale'];

const isCount = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_BLOCKS;
const isText = value => typeof value === 'string' && value !== '';
// a payment address on a test network (the double's is preprod), in bech32
const isAddress = value => {
    if (typeof value !== 'string' || !/^addr_test1[02-9ac-hj-np-z]+$/.test(value)) {
        return false;
    }
    try {
        AddressEras.fromBech32(value);
        return true;
    } catch {
        return false;
    }
};
const isLovelace = value => (Number.isSafeInteger(value) && value >= 1) || (typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value));

/** The user token's name of the item `itemId`: the label 222 and 56 hex digits of sha256(itemId). */
const assetNameOf = itemId => rules.USER_LABEL + crypto.createHash('sha256').update(itemId).digest('hex').slice(0, 56);

// what a route answers when it cannot go on: its status and error code
class RouteError extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}
const invalid = () => new RouteError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);

/**
 * `app` with the test routes in front of it, for main's `wrap` (pool, runtime) and the chain
 * double `double`. Refused (an Error) unless `env.DATABASE_URL` is 'memory'.
 */
const withTestRoutes = (app, { pool, runtime, double, env = process.env }) => {
    if (env.DATABASE_URL !== 'memory') {
        throw new Error('the test routes run only with DATABASE_URL=memory');
    }
    const outer = express();
    outer.post('/test/pantry', express.json(), async (req, res) => {
        const { username, items } = req.body || {};
        const { rows } = await pool.query('SELECT id FROM players WHERE username_lower = $1', [String(username).toLowerCase()]);
        if (rows.length === 0 || !Array.isArray(items)) {
            res.status(400).json({ error: 'INVALID REQUEST PARAMETERS' });
            return;
        }
        await pantry.add(pool, rows[0].id, items, Date.now());
        res.json({ pantry: await pantry.totals(pool, rows[0].id, Date.now()) });
    });

    const chainRoutes = express.Router();
    chainRoutes.use(express.json());

    // A route that changes the chain: refused while the watcher is not there (chain features off,
    // or the server does not listen yet), else `change(body)`, then a run of the watcher, then the
    // answer. A run the timer started before the change may be going (runOnce hands it out), so
    // the second run is one that starts after it.
    const changing = (route, change, { status = 200 } = {}) =>
        chainRoutes.post(route, async (req, res) => {
            const watcher = runtime.watcher;
            if (!watcher) {
                throw new RouteError(503, 'CHAIN NOT WATCHED');
            }
            const body = req.body;
            if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body))) {
                throw invalid();
            }
            const answer = await change(body || {});
            await watcher.runOnce();
            await watcher.runOnce();
            if (status === 204) {
                res.status(204).end();
            } else {
                res.status(status).json(answer);
            }
        });

    const destination = to => {
        if (to === STRANGER) {
            return double.newAddress();
        }
        if (!isAddress(to)) {
            throw invalid();
        }
        return to;
    };
    // the double's own transactions throw for a token nobody holds
    const holding = run => {
        try {
            return run();
        } catch (error) {
            if (/nobody holds/.test(error.message)) {
                throw new RouteError(404, ErrorCode.NOT_FOUND);
            }
            throw error;
        }
    };

    changing('/blocks', ({ count = 1 }) => {
        if (!isCount(count)) {
            throw invalid();
        }
        return { tip: double.produceBlocks(count) };
    });

    changing('/rollback', ({ count, drop = false }) => {
        if (!isCount(count) || typeof drop !== 'boolean') {
            throw invalid();
        }
        return { tip: double.rollback(count, { drop }) };
    });

    changing('/fund', ({ address, lovelace }) => {
        if (!isAddress(address) || !isLovelace(lovelace)) {
            throw invalid();
        }
        return { txHash: double.fund(address, String(lovelace)).txHash };
    });

    // the item marked minted as plan D marks it, its token minted to `to`, one block
    changing('/minted', async ({ username, itemId, to }) => {
        if (!isText(username) || !isText(itemId) || !(to === STRANGER || isAddress(to))) {
            throw invalid();
        }
        const players = await pool.query('SELECT id FROM players WHERE username_lower = $1', [username.toLowerCase()]);
        if (players.rows.length === 0) {
            throw new RouteError(404, ErrorCode.PLAYER_NOT_FOUND);
        }
        const items = await pool.query('SELECT asset_name FROM items WHERE id = $1 AND player_id = $2', [itemId, players.rows[0].id]);
        if (items.rows.length === 0) {
            throw new RouteError(404, ErrorCode.NOT_FOUND);
        }
        if (items.rows[0].asset_name !== null) {
            throw new RouteError(409, ErrorCode.ITEM_MINTED);
        }
        const assetName = assetNameOf(itemId);
        await markMinted(pool, itemId, assetName);
        double.mintToken({ assetName, to: destination(to) });
        double.produceBlocks(1);
        return { assetName };
    });

    changing('/move', ({ assetName, to }) => {
        if (typeof assetName !== 'string' || !USER_NAME.test(assetName)) {
            throw invalid();
        }
        const address = destination(to);
        return { txHash: holding(() => double.moveToken({ assetName, to: address })) };
    });

    changing('/burn', ({ assetName }) => {
        if (typeof assetName !== 'string' || !USER_NAME.test(assetName)) {
            throw invalid();
        }
        return { txHash: holding(() => double.burnToken({ assetName })) };
    });

    changing('/hold', ({ on }) => {
        if (typeof on !== 'boolean') {
            throw invalid();
        }
        double.holdMempool(on);
    }, { status: 204 });

    changing('/fail', ({ provider = null, index = null }) => {
        if (!PROVIDER_FAULTS.includes(provider) || !INDEX_FAULTS.includes(index)) {
            throw invalid();
        }
        double.fail({ provider, index });
    }, { status: 204 });

    chainRoutes.get('/', (req, res) => {
        res.json({ tip: double.tip(), mempool: double.mempool() });
    });

    // a body that is no JSON (express.json) is the test's mistake too
    // eslint-disable-next-line no-unused-vars
    chainRoutes.use((error, req, res, next) => {
        if (error instanceof RouteError) {
            res.status(error.status).json({ error: error.code });
            return;
        }
        if (error.type === 'entity.parse.failed') {
            res.status(400).json({ error: ErrorCode.INVALID_REQUEST_PARAMETERS });
            return;
        }
        console.error('a test route of the chain failed', error);
        res.status(500).json({ error: ErrorCode.INTERNAL_SERVER_ERROR });
    });

    outer.use('/test/chain', chainRoutes);
    outer.use(app);
    return outer;
};

/**
 * The environment the server starts with: CHAIN_SERVER_KEY_FILE=generate replaced by the path of
 * a key file written for this process in `tmpdir`, after removing whatever an earlier run left at
 * that path; `onExit(cleanup)` registers its removal (by default when the process exits).
 */
const environmentOf = (env, { tmpdir = os.tmpdir(), onExit = cleanup => process.on('exit', cleanup) } = {}) => {
    if (env.CHAIN_SERVER_KEY_FILE !== 'generate') {
        return env;
    }
    const dir = path.join(tmpdir, `battlechoc-e2e-${/^\d+$/.test(env.PORT || '') ? env.PORT : 'api'}`);
    const remove = () => fs.rmSync(dir, { recursive: true, force: true });
    remove();
    onExit(remove);
    const file = path.join(dir, 'server.skey');
    writeKeyFile(file, fixtureKey('server').privateKey);
    return { ...env, CHAIN_SERVER_KEY_FILE: file };
};

if (require.main === module) {
    if (process.env.DATABASE_URL !== 'memory') {
        console.error('the test server runs only with DATABASE_URL=memory');
        process.exit(1);
    }
    // the double holds the test policy's tokens: a server on another policy would see none of them
    if (process.env.CHAIN_POLICY_ID && process.env.CHAIN_POLICY_ID !== TEST_POLICY_ID) {
        console.error('the test server needs CHAIN_POLICY_ID to be the test policy (test/chainDouble.js TEST_POLICY_ID)');
        process.exit(1);
    }
    const double = createChainDouble({ policyId: TEST_POLICY_ID });
    main({
        env: environmentOf(process.env),
        chainOverrides: { provider: double.provider(), index: double.index() },
        wrap: (app, context) => withTestRoutes(app, { ...context, double }),
    }).catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { withTestRoutes, assetNameOf, environmentOf };
