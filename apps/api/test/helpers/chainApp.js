// An app with the chain features on, over plan C's chain double (minting plan D): the real
// createChain, provider and index of the double, plan B's fixture deployment with its config UTxO
// on the double (found by the config NFT, as with CHAIN_CONFIG_POLICY_ID), the real tx.js, a
// watcher over the same chain, and one clock for the app, the double and the watcher.
//
//   const env = await createChainApp();
//   const { account, keys } = await env.player('Ann', { lovelace: [20_000_000] });
//   await env.matches(account.playerId, 10);
//   await account.get('/chain/readiness').expect(200);
//
// The double and its config come from helpers/chainDeployment.js, which the browser tests' API
// (test/e2eServer.js) shares. The double reads the transactions of `submit` and `queue` with
// `describeTx` (default: the real CBOR reader of helpers/describeTx.js); the helper's own
// transactions (moving the config) and plan C's JSON transactions (jsonTx) are always read as
// JSON. The app's chain carries the server
// key as the server loads it (keys.loadKey of fixtureKey('server')'s key file), the key the
// fixture config lists.

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_POLICY_ID } = require('../chainDouble');
const { createChain } = require('../../src/chain');
const { createConfigReader } = require('../../src/chain/config');
const { createWatcher } = require('../../src/chain/watcher');
const { ownershipStep } = require('../../src/chain/ownership');
const { createTestApp, createAccount, withToken } = require('./api');
const { testKeys, signedChallenge, confirmWith } = require('./cardano');
const { loadKey, writeKeyFile } = require('../../src/chain/keys');
const { fixtureKey } = require('./chain');
const { createDeployedChain, creditMatches } = require('./chainDeployment');
const { describeTx: describeCborTx } = require('./describeTx');
const { T0, SLOTS_PER_BLOCK, BLOCK_MS, silentLog, stake, giveItem } = require('./minting');

const { preprod } = cardano.Networks;
const policyId = TEST_POLICY_ID;
const K_FINAL = 10;
const INDEX_MAX_LAG_MS = 600000;

const loadedKeys = new Map();
/**
 * fixtureKey(label)'s key as the server holds it: written to a key file (mode 600, in a temporary
 * directory that is removed again) and loaded with keys.loadKey, once per label.
 */
const loadedFixtureKey = label => {
    if (!loadedKeys.has(label)) {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-chain-app-'));
        try {
            const file = path.join(directory, 'server.skey');
            writeKeyFile(file, fixtureKey(label).privateKey);
            loadedKeys.set(label, loadKey(file));
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    }
    return loadedKeys.get(label);
};

/**
 * An app with the chain features on, over a chain double. Options:
 * - `start`: the clock's start (ms; default minting.js's T0, 2026-11-15 12:00 UTC);
 * - `fees`, `paused`: the config datum (fixtureContracts's; default the preprod fee, 1/2/4 ADA);
 *   `config: false` places no config (the config cannot be found);
 * - `configTtlMs`: how long the app keeps the config it read (default 0: every request reads it,
 *   so setConfig shows at once; production's is CONFIG_TTL_MS, a minute);
 * - `configByNft`: false finds the config by CHAIN_CONFIG_REF alone (production without
 *   CHAIN_CONFIG_POLICY_ID): the reference of the first config UTxO, which setConfig spends;
 * - `steps`: the watcher's steps before the ownership step (which runs last, as in server.js);
 * - `describeTx`: how the double reads a submitted transaction that is not JSON (default: the
 *   real CBOR reader);
 * - `serverKey`: the server's key on the chain (default loadedFixtureKey('server'), which the
 *   config lists; loadedFixtureKey('stranger') is one it does not);
 * - anything else goes to createApp (e.g. `chainPerMinute`; `chainMintsPerMinute`, default 1000).
 *
 * Resolves with createTestApp's { app, pool, db, auth, push, sent } and: `deployment`
 * (chainDeployment.js createDeployedChain's, whose double and config these are), `double`, `chain` (as
 * createChain builds it), `configReader`, `contracts` (fixtureContracts of the first settings),
 * `watcher`, `runOnce()`, `log` (the watcher's, silent; the routes' is `chainLog`, silent unless
 * given), `now()`, `advance(ms)` (access tokens last 15 minutes of it: `refreshed(account)`), `block(count)`
 * (blocks with the clock moving BLOCK_MS each), `setConfig({ fees, paused, serverKeys })` (an admin
 * update that REPLACES the datum: the config NFT moves to a new UTxO with that datum, in a block;
 * what it leaves out is the fixture's default, not the current setting), `removeConfig()` (the NFT
 * is burned: no config any more), `player(username, options)`, `link(account, keys, options)`,
 * `fund(keys, lovelace)`, `matches(playerId, count)`, `giveItem(playerId, itemKey)`.
 */
const createChainApp = async ({
    start = T0, fees, paused = false, config = true, configTtlMs = 0, configByNft = true, steps = [], describeTx = describeCborTx, serverKey = loadedFixtureKey('server'),
    chainLog = silentLog(), ...options
} = {}) => {
    let clock = start;
    const now = () => clock;
    // the deployment (helpers/chainDeployment.js) on a double of this clock, which moves BLOCK_MS a block
    const deployment = createDeployedChain({
        policyId, now, slotsPerBlock: SLOTS_PER_BLOCK, describeTx, fees, paused, config,
        beforeBlock: () => {
            clock += BLOCK_MS;
        },
    });
    const { double, contracts, block, setConfig, removeConfig } = deployment;

    const chain = createChain({
        config: {
            chain: {
                network: preprod,
                policyId,
                configRef: deployment.configRef,
                configPolicyId: configByNft ? contracts.configPolicyId : null,
                kFinal: K_FINAL,
                indexMaxLagMs: INDEX_MAX_LAG_MS,
            },
        },
        overrides: { provider: double.provider(), index: double.index() },
        serverKey,
    });
    const configReader = createConfigReader({ chain, ttlMs: configTtlMs, now });
    const env = await createTestApp({ cardanoNetwork: preprod, now, chain, chainConfig: configReader, chainPerMinute: 1000, chainAddressPerMinute: 1000, chainPlayerPerMinute: 1000, chainMintsPerMinute: 1000, chainRebuildsPerMinute: 1000, chainLog, ...options });
    const log = silentLog();
    const watcher = createWatcher({ chain, pool: env.pool, steps: [...steps, ownershipStep], intervalMs: 20000, now, log });

    /**
     * Links `keys` to `account` by its stake key, as connecting the CIP-30 wallet `wallet` does
     * (null: words); `confirmBy`: a key the account has already (needed from the second key on).
     * Resolves with the identity.
     */
    const link = async (account, keys, { wallet = null, confirmBy } = {}) => {
        const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account });
        const body = { ...verify, ...(wallet ? { wallet } : {}) };
        const sent = request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`);
        if (confirmBy) {
            const confirmed = await confirmWith(env.app, account, confirmBy);
            expect(confirmed.status).toBe(200);
            sent.set('X-Battlechoc-Confirm', confirmed.body.confirmToken);
        }
        const response = await sent.send(body);
        expect(response.status).toBe(200);
        return response.body.identity;
    };

    /** Sends `lovelace` to the base address of `keys` in one UTxO (in a block): its { txHash, index }. */
    const fund = (keys, lovelace) => {
        const at = double.fund(double.addressOf(keys), String(lovelace));
        block();
        return at;
    };

    /**
     * A named player with a wallet per entry of `lovelace` (its base address funded with that much
     * in one UTxO; 0: not funded), each linked by its stake key under the name `wallets[i]` (default
     * none), and `matches` verified matches (default none). Resolves with { account, playerId,
     * keys, subjects }.
     */
    const player = async (username, { lovelace = [20_000_000], wallets = [], matches: count = 0 } = {}) => {
        const account = await createAccount(env.app, { username });
        const keys = lovelace.map(() => testKeys());
        for (const [i, key] of keys.entries()) {
            await link(account, key, { wallet: wallets[i] ?? null, confirmBy: i === 0 ? undefined : keys[0] });
            if (lovelace[i] > 0) {
                fund(key, lovelace[i]);
            }
        }
        await matches(account.playerId, count);
        return { account, playerId: account.playerId, keys, subjects: keys.map(stake) };
    };

    /** `account` with a fresh access token (an access token lasts 15 minutes of the clock). */
    const refreshed = async account => {
        const { accessToken } = (await request(env.app).post('/accounts/token').send({ refreshToken: account.refreshToken }).expect(200)).body;
        return { ...account, accessToken, ...withToken(env.app, accessToken) };
    };

    /** `count` server-hosted matches won against the server AI, credited as the live lobby credits them. */
    const matches = (playerId, count) => creditMatches(env.pool, playerId, count, { now: clock });

    return {
        ...env,
        deployment,
        double,
        chain,
        configReader,
        contracts,
        watcher,
        runOnce: () => watcher.runOnce(),
        log,
        chainLog,
        now,
        advance: ms => {
            clock += ms;
        },
        block,
        setConfig,
        removeConfig,
        player,
        link,
        fund,
        refreshed,
        matches,
        giveItem: (playerId, itemKey) => giveItem(env.pool, playerId, itemKey),
    };
};

module.exports = { createChainApp, loadedFixtureKey, policyId, T0, K_FINAL, INDEX_MAX_LAG_MS };
