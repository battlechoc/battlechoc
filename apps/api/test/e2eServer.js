// The backend as the browser tests run it (apps/pwa/playwright.config.js): the real server plus
// routes the game never has, only against the in-memory database; the image holds src/ only
// (Dockerfile).
//
// - POST /test/pantry stocks a player's pantry the way drops of won matches would (rum is a rare
//   drop, and the starter kit alone crafts nothing).
// - POST /test/matches credits a player with server-hosted matches won against the server AI, as
//   the live lobby plays and credits a match the AI gives up at once (helpers/chainDeployment.js
//   creditMatches, pinned against real wins): the verified matches of the mint gate. For the
//   browser tests' players (apps/pwa/test/helpers/players.js labPlayer: their reported matches
//   moved the AI ladder) no such match is the prepared first game: each ends before it runs, so
//   it brings no awards, no XP and no rating, one ladder step each. After the gate's ten: 100 XP,
//   rating 1500 unrated, 14 ladder games at step 6; "Start Game" joins the queue and the server
//   AI after LIVE_AI_FALLBACK_MS is Gustav Ganache, handicap 2, on 10×10.
// - /test/chain/*: the chain is the chain double (test/chainDouble.js) on the real clock with plan
//   B's fixture deployment on it (helpers/chainDeployment.js, as the API tests' chainApp.js has
//   it): the config UTxO with the config NFT and the preprod fee, found by the NFT
//   (CHAIN_CONFIG_POLICY_ID), and real transactions read by helpers/describeTx.js. The server
//   reads it through its provider and index (main's chainOverrides) and reads the config on every
//   request (main's appOptions: no cached copy), so a mint is built, co-signed and submitted onto
//   the double for real, and a config change shows at once. A browser test mints, moves and burns
//   tokens, produces blocks and rolls them back, changes the config and the faults through these
//   routes. Each POST runs the watcher (the chain operations, the ownership sync, then the credit
//   of burned items) before it answers, so the test sees the effect at once; the watcher's own timer
//   (CHAIN_WATCH_INTERVAL_MS) is long, the tests drive the runs.
//
// CHAIN_SERVER_KEY_FILE=generate writes a server key made fresh for this run (freshServerKey: a
// random test key, never funded; the deployment's config lists it, so the server signs mints)
// into a directory of the OS temp directory named after the port (parallel runs have their own
// ports), as chain/keys.js loadKey reads it. Whatever a start finds at that path (the directory of
// an earlier run that was killed) is removed first, and the key written anew. The directory is
// removed when the process exits: after SIGTERM or SIGINT (server.js shuts down and exits;
// playwright.config.js stops this server with SIGTERM, see its gracefulShutdown) and after a
// failed start, but not after a SIGKILL, which runs no code: then it stays until the next start on
// that port replaces it.
//
// The rate limits per address are raised (E2E_LIMITS: every browser test comes from 127.0.0.1,
// all specs of a run share them); those per player, of mints and of rebuilds stay production's,
// each spec has its own player.
//
// Specs share this one server, its database and its chain for the whole run, one after the
// other (playwright.config.js workers: 1; parallel workers would share the double's faults, its
// mempool and its config). POST /test/chain/reset puts the chain back between tests.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { AddressEras, KeyHash, PrivateKey } = require('@evolution-sdk/evolution');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../src/pantry');
const { ErrorCode } = require('../src/errors');
const { writeKeyFile } = require('../src/chain/keys');
const { createConfigReader } = require('../src/chain/config');
const { matchesOf } = require('../src/chain/readiness');
const { main } = require('../src/server');
const { TEST_POLICY_ID } = require('./chainDouble');
const { TEAM_ADDRESS, fixtureContracts, preprodFees } = require('./helpers/chain');
const { createDeployedChain, creditMatches } = require('./helpers/chainDeployment');
const { markMinted } = require('./helpers/mintedItems');

// the `to` of a mint or a move that means a fresh address nobody has
const STRANGER = 'stranger';
// the most blocks one call produces or rolls back, the most matches one call credits
const MAX_BLOCKS = 100;
const MAX_MATCHES = 100;
// the most tokens one funding output holds
const MAX_FUND_ASSETS = 10;
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
const isCountUpTo = max => value => Number.isSafeInteger(value) && value >= 1 && value <= max;

// requests per minute and address of the routes that every browser test calls from 127.0.0.1:
// out of reach of a whole run (production: CHAIN_LIMITS in src/app.js)
const E2E_PER_ADDRESS = 100000;
const E2E_LIMITS = Object.freeze({ chainPerMinute: E2E_PER_ADDRESS, chainStatusPerMinute: E2E_PER_ADDRESS, chainAddressPerMinute: E2E_PER_ADDRESS });

/**
 * main's appOptions for this server: the config read on every request (a change of POST
 * /test/chain/config shows at once), readiness's wallets read on every request (a wallet the test
 * routes fund or a fault they set shows at once) and E2E_LIMITS. Nothing with the chain features off.
 */
const appOptionsOf = ({ chain }) => (chain.enabled ? { chainConfig: createConfigReader({ chain, ttlMs: 0 }), chainReadinessCacheMs: 0, ...E2E_LIMITS } : {});

/** A server key made fresh for one run: { privateKey, keyHash } as fixtureKey has them. */
const freshServerKey = () => {
    const privateKey = PrivateKey.fromBytes(crypto.randomBytes(32));
    return { privateKey, keyHash: KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(privateKey))) };
};
// a unit of a token: its policy id and a name of at most 32 bytes, in lower-case hex
const UNIT = /^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/;

/**
 * The fee options of a config the test routes write (POST /test/chain/config `fees`): 'preprod'
 * (the deployment's: one ADA option, 1, 2 and 4 ADA by tier, to the treasury), 'none' (no
 * battlechoc fee), 'two' (that option and a second ADA option, 1.5, 3 and 6 ADA, to the team's
 * wallet: the cost screen's choice).
 */
const FEE_VARIANTS = {
    preprod: () => preprodFees(),
    none: () => [],
    two: () => [...preprodFees(), { asset: 'lovelace', amounts: [1_500_000, 3_000_000, 6_000_000], receivers: [{ address: TEAM_ADDRESS, share: 1 }] }],
};

// fee options as JSON: amounts as text
const feesView = fees => fees.map(({ asset, amounts, receivers }) => ({ asset, amounts: amounts.map(String), receivers: receivers.map(({ address, share }) => ({ address, share })) }));

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

// what the routes answer when they fail: a RouteError as its status and code, a body that is no
// JSON as the test's mistake, anything else as a 500 (logged)
// eslint-disable-next-line no-unused-vars
const routeErrors = (error, req, res, next) => {
    if (error instanceof RouteError) {
        res.status(error.status).json({ error: error.code });
        return;
    }
    if (error.type === 'entity.parse.failed') {
        res.status(400).json({ error: ErrorCode.INVALID_REQUEST_PARAMETERS });
        return;
    }
    console.error('a test route failed', error);
    res.status(500).json({ error: ErrorCode.INTERNAL_SERVER_ERROR });
};

// a body that is a JSON object, or none ({})
const bodyOf = req => {
    const body = req.body;
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body))) {
        throw invalid();
    }
    return body || {};
};

/**
 * `app` with the test routes in front of it, for main's `wrap` (pool, runtime) and the deployment
 * `deployment` (helpers/chainDeployment.js createDeployedChain: its double and its setConfig).
 * Refused (an Error) unless `env.DATABASE_URL` is 'memory'.
 */
const withTestRoutes = (app, { pool, runtime, deployment, env = process.env }) => {
    if (env.DATABASE_URL !== 'memory') {
        throw new Error('the test routes run only with DATABASE_URL=memory');
    }
    const { double } = deployment;
    const playerIdOf = async username => {
        const { rows } = await pool.query('SELECT id FROM players WHERE username_lower = $1', [username.toLowerCase()]);
        if (rows.length === 0) {
            throw new RouteError(404, ErrorCode.PLAYER_NOT_FOUND);
        }
        return rows[0].id;
    };
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

    // { username, count }: `count` verified matches more (won against the server AI, credited and
    // laddered as the lobby does): { matches }, how many count now
    const matchRoutes = express.Router();
    matchRoutes.post('/', express.json(), async (req, res) => {
        const { username, count } = bodyOf(req);
        if (!isText(username) || !isCountUpTo(MAX_MATCHES)(count)) {
            throw invalid();
        }
        const playerId = await playerIdOf(username);
        await creditMatches(pool, playerId, count);
        res.json({ matches: await matchesOf(pool, playerId) });
    });
    matchRoutes.use(routeErrors);
    outer.use('/test/matches', matchRoutes);

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
            const answer = await change(bodyOf(req));
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

    // `assets` ({ unit: quantity }, optional): tokens of other policies in the same output (the
    // items policy's and the config's are the deployment's own)
    const isAssets = assets =>
        typeof assets === 'object' && assets !== null && !Array.isArray(assets) && Object.keys(assets).length <= MAX_FUND_ASSETS
        && Object.entries(assets).every(([unit, quantity]) => UNIT.test(unit) && !unit.startsWith(TEST_POLICY_ID) && !unit.startsWith(deployment.configPolicyId) && isLovelace(quantity));
    changing('/fund', ({ address, lovelace, assets = {} }) => {
        if (!isAddress(address) || !isLovelace(lovelace) || !isAssets(assets)) {
            throw invalid();
        }
        const tokens = Object.fromEntries(Object.entries(assets).map(([unit, quantity]) => [unit, String(quantity)]));
        return { txHash: double.fund(address, String(lovelace), tokens).txHash };
    });

    // the item marked minted as plan D marks it, its token minted to `to`, one block
    changing('/minted', async ({ username, itemId, to }) => {
        if (!isText(username) || !isText(itemId) || !(to === STRANGER || isAddress(to))) {
            throw invalid();
        }
        const playerId = await playerIdOf(username);
        const items = await pool.query('SELECT asset_name FROM items WHERE id = $1 AND player_id = $2', [itemId, playerId]);
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

    // The chain as the next test should find it (`fail`, `hold`, waiting transactions and the
    // config otherwise stay for every spec after the one that left them): the faults cleared, the
    // mempool let go and emptied (unless `keepMempool`: then what waits lands with the next
    // block; 400 CONFIG WAITING when a waiting transaction moves or makes the config NFT, as a
    // rollback without drop leaves it), the deployment's config datum back when the double holds another one or none (read
    // from the double, so also after a rollback; one block then, none when it is there).
    // { dropped: [hashes of the transactions dropped], config: 'kept' | 'restored' }.
    changing('/reset', async ({ keepMempool = false }) => {
        if (typeof keepMempool !== 'boolean') {
            throw invalid();
        }
        // a config transaction that waits would land on top of the config restored below (two NFTs,
        // or a refused spend): keeping the mempool then is no state a test can want
        if (keepMempool && deployment.configWaiting()) {
            throw new RouteError(400, 'CONFIG WAITING');
        }
        double.fail({});
        double.holdMempool(false);
        const dropped = keepMempool ? [] : double.dropMempool();
        return { dropped, config: (await deployment.restoreConfig()) ? 'restored' : 'kept' };
    });

    // the config datum replaced, as an admin update does (the config NFT moves, in a block):
    // `paused` (default false) and `fees` (FEE_VARIANTS, default 'preprod'); {} puts the
    // deployment's config back. The server reads it on its next request.
    changing('/config', async ({ paused = false, fees = 'preprod' }) => {
        if (typeof paused !== 'boolean' || typeof fees !== 'string' || !Object.prototype.hasOwnProperty.call(FEE_VARIANTS, fees)) {
            throw invalid();
        }
        const options = FEE_VARIANTS[fees]();
        await deployment.setConfig({ paused, fees: options });
        return { paused, fees: feesView(options) };
    });

    // `kFinal`: the server's CHAIN_K_FINAL, the blocks on top of a mint's block that make it final
    chainRoutes.get('/', (req, res) => {
        res.json({ tip: double.tip(), mempool: double.mempool(), kFinal: runtime.chain.kFinal });
    });

    // where the token `unit` (policy id and name, hex) is in the blocks: { holders: [{ address,
    // quantity }] } (none for a unit nobody holds). Read only; the waiting transactions do not count.
    chainRoutes.get('/holders/:unit', (req, res) => {
        const { unit } = req.params;
        if (!UNIT.test(unit) || unit.length <= 56) {
            throw invalid();
        }
        // from the double's ledger: a fault of /fail does not hide where a token is
        const quantities = new Map();
        for (const { output } of double.unspentHolding(unit)) {
            quantities.set(output.address, (quantities.get(output.address) ?? 0n) + BigInt(output.assets[unit]));
        }
        res.json({ holders: [...quantities].map(([address, quantity]) => ({ address, quantity: quantity.toString() })) });
    });

    chainRoutes.use(routeErrors);

    outer.use('/test/chain', chainRoutes);
    outer.use(app);
    return outer;
};

/**
 * The environment the server starts with: CHAIN_SERVER_KEY_FILE=generate replaced by the path of
 * a key file of `serverKey` (freshServerKey's) written for this process in `tmpdir`, after
 * removing whatever an earlier run left at that path; `onExit(cleanup)` registers its removal (by
 * default when the process exits).
 */
const environmentOf = (env, { serverKey, tmpdir = os.tmpdir(), onExit = cleanup => process.on('exit', cleanup) } = {}) => {
    if (env.CHAIN_SERVER_KEY_FILE !== 'generate') {
        return env;
    }
    const dir = path.join(tmpdir, `battlechoc-e2e-${/^\d+$/.test(env.PORT || '') ? env.PORT : 'api'}`);
    const remove = () => fs.rmSync(dir, { recursive: true, force: true });
    remove();
    onExit(remove);
    const file = path.join(dir, 'server.skey');
    if (!serverKey) {
        throw new TypeError('environmentOf: CHAIN_SERVER_KEY_FILE=generate needs the serverKey to write');
    }
    writeKeyFile(file, serverKey.privateKey);
    return { ...env, CHAIN_SERVER_KEY_FILE: file };
};

/**
 * Why the environment `env` cannot start this server (a text), null when it can: the in-memory
 * database, and with the chain features on the deployment's policies (the double holds the test
 * policy's tokens and the fixture's config NFT: a server on other policies would see none of them).
 */
const startProblemOf = env => {
    if (env.DATABASE_URL !== 'memory') {
        return 'the test server runs only with DATABASE_URL=memory';
    }
    if (env.CHAIN_POLICY_ID && env.CHAIN_POLICY_ID !== TEST_POLICY_ID) {
        return 'the test server needs CHAIN_POLICY_ID to be the test policy (test/chainDouble.js TEST_POLICY_ID)';
    }
    const { configPolicyId } = fixtureContracts();
    if (env.CHAIN_POLICY_ID && env.CHAIN_CONFIG_POLICY_ID !== configPolicyId) {
        return `the test server needs CHAIN_CONFIG_POLICY_ID to be the fixture's config policy (${configPolicyId}, test/helpers/chain.js fixtureContracts)`;
    }
    return null;
};

if (require.main === module) {
    const problem = startProblemOf(process.env);
    if (problem) {
        console.error(problem);
        process.exit(1);
    }
    const serverKey = freshServerKey();
    const deployment = createDeployedChain({ policyId: TEST_POLICY_ID, serverKeys: [serverKey.keyHash] });
    main({
        env: environmentOf(process.env, { serverKey }),
        chainOverrides: { provider: deployment.double.provider(), index: deployment.double.index() },
        appOptions: appOptionsOf,
        wrap: (app, context) => withTestRoutes(app, { ...context, deployment }),
    }).catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { withTestRoutes, assetNameOf, environmentOf, startProblemOf, appOptionsOf, freshServerKey, E2E_LIMITS, FEE_VARIANTS };
