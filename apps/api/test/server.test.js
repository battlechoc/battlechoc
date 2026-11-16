// How the process stops (SIGTERM from Docker, which kills it after 10 seconds), what the health
// check answers and how the chain features are put together at the start.

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { chainProviderLine, createShutdown, main, startWatcher } = require('../src/server');
const { createChainDouble } = require('./chainDouble');
const { fixtureContracts, fixtureKey } = require('./helpers/chain');
const { loadedFixtureKey } = require('./helpers/chainApp');
const { createChain } = require('../src/chain');
const { writeKeyFile } = require('../src/chain/keys');
const { closeTestPools, counting, createTestPool, failingOn } = require('./helpers/db');
const { createTestApp } = require('./helpers/api');
const { ConfigError } = require('../src/config');
const { createRecipeBook, SAMPLE } = require('../src/lab/recipes');

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
        CHAIN_PROVIDER_KIND: 'blockfrost',
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

    test('a server key file that is no key file stops the start, naming the variable and never the content', async () => {
        const write = (name, content, mode = 0o600) => {
            const file = path.join(directory, name);
            fs.writeFileSync(file, content, { mode });
            fs.chmodSync(file, mode);
            return file;
        };
        // a key in the wrong file: open to others, or with more than its line
        const secret = 'ed25519_sk1' + 'q'.repeat(58);
        const files = {
            missing: path.join(directory, 'missing.skey'),
            'the empty /dev/null of docker-compose without CHAIN_SERVER_KEY_PATH': '/dev/null',
            'a directory': directory,
            empty: write('empty.skey', ''),
            'not a key': write('garbage.skey', `${secret} and more\n`),
            'open to others': write('open.skey', `${secret}\n`, 0o644),
        };
        for (const [what, keyFile] of Object.entries(files)) {
            const error = await main({ env: chainEnv(keyFile) }).catch(failure => failure);
            expect([what, error]).toEqual([what, expect.any(ConfigError)]);
            expect(error.message).toContain('CHAIN_SERVER_KEY_FILE');
            expect(error.message).not.toContain(secret);
            expect(error.message).not.toContain('server-test-provider-key');
        }
    });

    test('a complete configuration loads the server key once and builds the chain from the overrides, handing it to wrap', async () => {
        const keyFile = path.join(directory, 'server.skey');
        writeKeyFile(keyFile, fixtureKey('server').privateKey);
        const provider = { name: 'provider double' };
        const index = { name: 'index double' };
        const { runtime } = await runUntilWrap({ env: chainEnv(keyFile), chainOverrides: { provider, index } });
        expect(runtime.chain).toEqual({
            enabled: true, network: { name: 'preprod', networkId: 0 }, policyId: 'ab'.repeat(28), configRef: `${'cd'.repeat(32)}#0`, configPolicyId: null,
            kFinal: 10, indexMaxLagMs: 600000, provider, index, serverKey: { keyHash: fixtureKey('server').keyHash },
        });
        // the private part is on the key, not in what the chain shows of it
        expect(runtime.chain.serverKey.privateKey).toBeDefined();
        expect(JSON.stringify(runtime.chain)).not.toMatch(/ed25519_sk|privateKey/);
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

    test('appOptions gets the chain, and what it answers wins over the configured options of the app', async () => {
        const keyFile = path.join(directory, 'options.skey');
        writeKeyFile(keyFile, fixtureKey('server').privateKey);
        const appOptions = jest.fn(() => ({ chainStatusPerMinute: 1 }));
        let app;
        let parts;
        await expect(main({
            env: chainEnv(keyFile), chainOverrides: { provider: {}, index: {} }, appOptions,
            wrap: (given, context) => { app = given; parts = context; throw stopped; },
        })).rejects.toBe(stopped);
        await parts.pool.end();
        expect(appOptions).toHaveBeenCalledTimes(1);
        expect(appOptions.mock.calls[0][0]).toEqual({ chain: parts.runtime.chain });
        await request(app).get('/chain/status').expect(200);
        await request(app).get('/chain/status').expect(429);
    });

    test('Koios without a key: one line at the start that minting may be refused for size; none with a key, none for Blockfrost', async () => {
        const keyFile = path.join(directory, 'koios.skey');
        writeKeyFile(keyFile, fixtureKey('server').privateKey);
        const { CHAIN_PROVIDER_KEY, ...blockfrost } = chainEnv(keyFile);
        const koios = { ...blockfrost, CHAIN_PROVIDER_KIND: 'koios', CHAIN_PROVIDER_URL: 'https://preprod.koios.rest/api/v1' };
        const sizeLines = warn => warn.mock.calls.filter(call => /minting may be refused for size: set CHAIN_PROVIDER_KEY/.test(call[0]));
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await runUntilWrap({ env: koios, chainOverrides: { provider: {}, index: {} } });
            expect(sizeLines(warn)).toHaveLength(1);
            warn.mockClear();
            await runUntilWrap({ env: { ...koios, CHAIN_PROVIDER_KEY }, chainOverrides: { provider: {}, index: {} } });
            await runUntilWrap({ env: { ...blockfrost, CHAIN_PROVIDER_KEY }, chainOverrides: { provider: {}, index: {} } });
            expect(sizeLines(warn)).toHaveLength(0);
            expect([...log.mock.calls, ...warn.mock.calls].flat().join(' ')).not.toContain(CHAIN_PROVIDER_KEY);
        } finally {
            log.mockRestore();
            warn.mockRestore();
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
        configPolicyId: 'ef'.repeat(28),
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

    test('on: the settings the routes and the watcher need, the provider and the index from the overrides, the server key as it was loaded', () => {
        const provider = {};
        const index = {};
        const serverKey = loadedFixtureKey('server');
        const chain = createChain({ config: { chain: chainConfig, chainMissing: [] }, pool: {}, log: console, overrides: { provider, index }, serverKey });
        expect(chain).toEqual({
            enabled: true, network: chainConfig.network, policyId: chainConfig.policyId, configRef: chainConfig.configRef, configPolicyId: 'ef'.repeat(28),
            kFinal: 10, indexMaxLagMs: 600000, provider, index, serverKey,
        });
        // the very object: not spread or cloned
        expect(chain.serverKey).toBe(serverKey);
        // without a config policy the config is read by its reference alone
        const { configPolicyId, ...byRef } = chainConfig;
        expect(configPolicyId).toBeDefined();
        expect(createChain({ config: { chain: byRef, chainMissing: [] }, pool: {}, overrides: { provider, index }, serverKey }).configPolicyId).toBeNull();
        // the key file is read in one place (server.js, loadServerKey): without the loaded key the chain is not built
        expect(() => createChain({ config: { chain: chainConfig, chainMissing: [] }, pool: {}, overrides: { provider, index } })).toThrow(TypeError);
        expect(() => createChain({ config: { chain: chainConfig, chainMissing: [] }, pool: {}, overrides: { provider, index }, serverKey: { keyHash: 'ab' } })).toThrow(TypeError);
        expect(chain.provider).toBe(provider);
        expect(chain.index).toBe(index);
        // the provider key stays inside the provider
        expect(JSON.stringify(chain)).not.toContain('create-chain-provider-key');
    });

    test('the start names the provider: its kind and host, never its key', () => {
        expect(chainProviderLine({ ...chainConfig, providerKind: 'blockfrost' })).toBe('chain provider: blockfrost at cardano-preprod.blockfrost.io');
        const koios = chainProviderLine({ ...chainConfig, providerKind: 'koios', providerUrl: 'https://preprod.koios.rest/api/v1' });
        expect(koios).toBe('chain provider: koios at preprod.koios.rest');
        expect(koios).not.toContain('create-chain-provider-key');
    });

    test('without an override: the provider of the configured kind (CHAIN_PROVIDER_KIND), at the configured URL', async () => {
        const realFetch = globalThis.fetch;
        const asked = [];
        globalThis.fetch = async url => {
            asked.push(String(url));
            return { status: 503, text: async () => '' };
        };
        try {
            for (const [providerKind, path] of [['koios', '/tip'], ['blockfrost', '/blocks/latest']]) {
                const chain = createChain({ config: { chain: { ...chainConfig, providerKind }, chainMissing: [] }, pool: {}, overrides: { index: {} }, serverKey: loadedFixtureKey('server') });
                await expect(chain.provider.tip()).rejects.toMatchObject({ name: 'ProviderError', code: 'unavailable', status: 503 });
                expect(asked.pop()).toBe(`${chainConfig.providerUrl}${path}`);
            }
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

describe('the watcher of a running server', () => {
    const log = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() });

    test('chain features off: no watcher and no credit step (no recipe book needed), and a stop that does nothing', () => {
        const runtime = { chain: { enabled: false, missing: [] }, watcher: null };
        const stop = startWatcher({ chain: runtime.chain, pool: {}, intervalMs: 20000, runtime, log: log() });
        expect(runtime.watcher).toBeNull();
        expect(() => stop()).not.toThrow();
    });

    test('on: the watcher is in the runtime, runs the ownership and the credit step at once, and stops', async () => {
        const pool = await createTestPool();
        const double = createChainDouble({ policyId: fixtureContracts().policyId });
        const chain = { enabled: true, indexMaxLagMs: 600000, kFinal: 10, policyId: fixtureContracts().policyId, index: double.index(), provider: double.provider() };
        const runtime = { chain, watcher: null };
        const recipes = createRecipeBook(JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).recipes);
        const stop = startWatcher({ chain, pool, intervalMs: 20000, runtime, recipes, log: log() });
        try {
            expect(runtime.watcher).not.toBeNull();
            // the run start() began: runOnce hands out the same one
            const report = await runtime.watcher.runOnce();
            expect(report).toMatchObject({ fresh: true, steps: { ownership: { checked: 0, changed: 0, skipped: null }, credit: { credited: [], skipped: null } } });
        } finally {
            stop();
        }
    });
});
