// How the process stops (SIGTERM from Docker, which kills it after 10 seconds), what the health
// check answers and how the chain features are put together at the start.

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createShutdown, main, startWatcher } = require('../src/server');
const { createChainDouble } = require('./chainDouble');
const { fixtureContracts } = require('./helpers/chain');
const { createChain } = require('../src/chain');
const { closeTestPools, counting, createTestPool, failingOn } = require('./helpers/db');
const { createTestApp } = require('./helpers/api');
const { ConfigError } = require('../src/config');

afterAll(closeTestPools);

describe('health', () => {
    // the app on a pool that counts its statements (`wrap` may break the pool first)
    const setup = async (wrap = pool => pool) => {
        let counted;
        const { app } = await createTestApp({
            wrapPool: pool => {
                counted = counting(wrap(pool));
                return counted.pool;
            },
        });
        return { app, counter: counted.counter };
    };

    test('the plain check answers as ever and asks the database nothing', async () => {
        const { app, counter } = await setup();
        for (const path of ['/health', '/health?deep=0', '/health?deep', '/health?deep=true']) {
            const response = await request(app).get(path).expect(200);
            expect(response.text).toBe('{"ok":true}');
        }
        expect(counter.statements).toBe(0);
    });

    test('the deep check asks the database and answers 503 when it is gone', async () => {
        const { app, counter } = await setup();
        const up = await request(app).get('/health?deep=1').expect(200);
        expect(up.text).toBe('{"ok":true,"database":true}');
        expect(counter.statements).toBe(1);

        const broken = await setup(pool => failingOn(pool, /^SELECT 1$/));
        const down = await request(broken.app).get('/health?deep=1').expect(503);
        expect(down.text).toBe('{"ok":false,"database":false}');
        // the plain check still says that the process is up
        await request(broken.app).get('/health').expect(200);
    });

    test('the deep check is limited per address: nobody keeps the pool busy with it', async () => {
        const { app, counter } = await setup();
        const statuses = [];
        for (let i = 0; i < 62; i++) {
            statuses.push((await request(app).get('/health?deep=1')).status);
        }
        expect(statuses.filter(status => status === 200)).toHaveLength(60);
        expect(statuses.slice(60)).toEqual([429, 429]);
        expect(counter.statements).toBe(60);
        await request(app).get('/health').expect(200);
    });
});

describe('shutdown', () => {
    // the parts the server stops, recording the order; each can be made to fail or to hang
    const parts = ({ liveClose = async () => {}, serverClose = callback => callback(), poolEnd = async () => {} } = {}) => {
        const calls = [];
        return {
            calls,
            stopCleanup: () => calls.push('cleanup'),
            stopWatcher: () => calls.push('watcher'),
            live: { close: () => { calls.push('live'); return liveClose(); } },
            server: { close: callback => { calls.push('server'); serverClose(callback); } },
            pool: { end: () => { calls.push('pool'); return poolEnd(); } },
            exit: code => calls.push(`exit ${code}`),
            log: { error: jest.fn(), log: jest.fn() },
        };
    };

    test('stops the cleanup, the watcher, the live service, the server and the pool, then exits', async () => {
        const stopped = parts();
        await createShutdown(stopped)();
        expect(stopped.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 0']);
    });

    test('a watcher that fails to stop does not keep the rest open; without a watcher (chain off) nothing is missing', async () => {
        const failing = parts();
        await createShutdown({ ...failing, stopWatcher: () => { failing.calls.push('watcher'); throw new Error('stop failed'); } })();
        expect(failing.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 1']);
        const { stopWatcher, ...withoutWatcher } = parts();
        expect(stopWatcher).toEqual(expect.any(Function));
        await createShutdown(withoutWatcher)();
        expect(withoutWatcher.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 0']);
    });

    test('a second signal while it stops changes nothing', async () => {
        let finish;
        const stopped = parts({ liveClose: () => new Promise(resolve => { finish = resolve; }) });
        const shutdown = createShutdown(stopped);
        const first = shutdown();
        const second = shutdown();
        const third = shutdown();
        finish();
        await Promise.all([first, second, third]);
        expect(stopped.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 0']);
    });

    test('a failing live service does not keep the server and the pool open', async () => {
        const stopped = parts({ liveClose: async () => { throw new Error('snapshot failed'); } });
        await createShutdown(stopped)();
        expect(stopped.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 1']);
        expect(stopped.log.error).toHaveBeenCalledTimes(1);
    });

    test('a failing server or pool still ends the process, with an error code', async () => {
        const server = parts({ serverClose: callback => callback(new Error('not running')) });
        await createShutdown(server)();
        expect(server.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 1']);
        const pool = parts({ poolEnd: async () => { throw new Error('already ended'); } });
        await createShutdown(pool)();
        expect(pool.calls).toEqual(['cleanup', 'watcher', 'live', 'server', 'pool', 'exit 1']);
    });

    test('something that hangs is cut off before Docker kills the container', async () => {
        jest.useFakeTimers();
        try {
            const stopped = parts({ liveClose: () => new Promise(() => {}) });
            createShutdown(stopped)();
            jest.advanceTimersByTime(7999);
            expect(stopped.calls).toEqual(['cleanup', 'watcher', 'live']);
            jest.advanceTimersByTime(1);
            expect(stopped.calls).toEqual(['cleanup', 'watcher', 'live', 'exit 1']);
        } finally {
            jest.useRealTimers();
        }
    });

    test('the timer of the forced exit does not keep a finished process alive', async () => {
        const unref = jest.fn();
        const setTimer = jest.fn(() => ({ unref }));
        await createShutdown({ ...parts(), setTimer })();
        expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 8000);
        expect(unref).toHaveBeenCalledTimes(1);
    });
});

describe('the chain at the start', () => {
    const development = { DATABASE_URL: 'memory', JWT_SECRET: 'server-test-secret-server-test-secret-1' };
    const chainEnv = keyFile => ({
        ...development,
        CARDANO_NETWORK: 'preprod',
        CHAIN_POLICY_ID: 'ab'.repeat(28),
        CHAIN_CONFIG_REF: `${'cd'.repeat(32)}#0`,
        CHAIN_SERVER_KEY_FILE: keyFile,
        CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0',
        CHAIN_PROVIDER_KEY: 'server-test-provider-key',
        CHAIN_K_FINAL: '10',
    });
    // `wrap` is called once the app exists: it records what it gets and stops the start there,
    // before the HTTP server listens
    const stopped = new Error('stopped by the test');
    const runUntilWrap = async options => {
        let parts;
        await expect(main({ ...options, wrap: (app, given) => { parts = given; throw stopped; } })).rejects.toBe(stopped);
        await parts.pool.end();
        return parts;
    };
    let directory;
    beforeAll(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-server-test-'));
    });
    afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

    test('a server key file that cannot be read stops the start, naming the variable only', async () => {
        const keyFile = path.join(directory, 'missing.skey');
        const error = await main({ env: chainEnv(keyFile) }).catch(failure => failure);
        expect(error).toBeInstanceOf(ConfigError);
        expect(error.message).toContain('CHAIN_SERVER_KEY_FILE cannot be read');
        expect(error.message).not.toContain('server-test-provider-key');
    });

    test('a complete configuration builds the chain from the overrides and hands it to wrap', async () => {
        const keyFile = path.join(directory, 'server.skey');
        fs.writeFileSync(keyFile, 'not parsed here');
        const provider = { name: 'provider double' };
        const index = { name: 'index double' };
        const { runtime } = await runUntilWrap({ env: chainEnv(keyFile), chainOverrides: { provider, index } });
        expect(runtime.chain).toEqual({
            enabled: true, network: { name: 'preprod', networkId: 0 }, policyId: 'ab'.repeat(28), kFinal: 10, indexMaxLagMs: 600000, provider, index,
        });
        expect(runtime.watcher).toBeNull();
    });

    test('an incomplete configuration turns the chain off and logs the missing names', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const { CHAIN_POLICY_ID, CHAIN_K_FINAL, ...env } = chainEnv('/nowhere/server.skey');
            expect([CHAIN_POLICY_ID, CHAIN_K_FINAL]).toHaveLength(2);
            const { runtime } = await runUntilWrap({ env });
            expect(runtime.chain).toEqual({ enabled: false, missing: ['CHAIN_POLICY_ID', 'CHAIN_K_FINAL'] });
            expect(log).toHaveBeenCalledWith('chain features off: missing CHAIN_POLICY_ID, CHAIN_K_FINAL');
            expect(log.mock.calls.flat().join(' ')).not.toContain('server-test-provider-key');
        } finally {
            log.mockRestore();
        }
    });

    test('without a Cardano network the chain is off without a word', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const { runtime } = await runUntilWrap({ env: development });
            expect(runtime.chain).toEqual({ enabled: false, missing: [] });
            expect(log.mock.calls.flat().join(' ')).not.toContain('chain');
        } finally {
            log.mockRestore();
        }
    });
});

describe('createChain', () => {
    const chainConfig = {
        network: { name: 'preprod', networkId: 0 },
        policyId: 'ab'.repeat(28),
        configRef: `${'cd'.repeat(32)}#0`,
        serverKeyFile: '/run/secrets/chain-server.skey',
        providerUrl: 'https://cardano-preprod.blockfrost.io/api/v0',
        providerKey: 'create-chain-provider-key',
        kFinal: 10,
        watchIntervalMs: 20000,
        indexMaxLagMs: 600000,
    };

    test('off: says which variables are missing, nothing else', () => {
        expect(createChain({ config: { chain: null, chainMissing: ['CHAIN_K_FINAL'] } })).toEqual({ enabled: false, missing: ['CHAIN_K_FINAL'] });
        expect(createChain({ config: { chain: null, chainMissing: [] } })).toEqual({ enabled: false, missing: [] });
    });

    test('on: the settings the routes and the watcher need, the provider and the index from the overrides', () => {
        const provider = {};
        const index = {};
        const chain = createChain({ config: { chain: chainConfig, chainMissing: [] }, pool: {}, log: console, overrides: { provider, index } });
        expect(chain).toEqual({ enabled: true, network: chainConfig.network, policyId: chainConfig.policyId, kFinal: 10, indexMaxLagMs: 600000, provider, index });
        expect(chain.provider).toBe(provider);
        expect(chain.index).toBe(index);
        // the provider key stays inside the provider
        expect(JSON.stringify(chain)).not.toContain('create-chain-provider-key');
    });
});

describe('the watcher of a running server', () => {
    const log = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() });

    test('chain features off: no watcher, and a stop that does nothing', () => {
        const runtime = { chain: { enabled: false, missing: [] }, watcher: null };
        const stop = startWatcher({ chain: runtime.chain, pool: {}, intervalMs: 20000, runtime, log: log() });
        expect(runtime.watcher).toBeNull();
        expect(() => stop()).not.toThrow();
    });

    test('on: the watcher is in the runtime, runs the ownership step at once, and stops', async () => {
        const pool = await createTestPool();
        const double = createChainDouble({ policyId: fixtureContracts().policyId });
        const chain = { enabled: true, indexMaxLagMs: 600000, index: double.index(), provider: double.provider() };
        const runtime = { chain, watcher: null };
        const stop = startWatcher({ chain, pool, intervalMs: 20000, runtime, log: log() });
        try {
            expect(runtime.watcher).not.toBeNull();
            // the run start() began: runOnce hands out the same one
            const report = await runtime.watcher.runOnce();
            expect(report).toMatchObject({ fresh: true, steps: { ownership: { checked: 0, changed: 0, skipped: null } } });
        } finally {
            stop();
        }
    });
});
