// Whether minting is on (minting plan D, ruling D25): GET /chain/status answers { enabled } without
// a session, whether the chain features are on or off, and touches nothing (no provider, index,
// config reader or database): every web player's game asks it once per session.

const request = require('supertest');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { closeTestPools } = require('./helpers/db');
const { createTestApp } = require('./helpers/api');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

// a provider, an index, a config reader or a server key that fails the test when anything asks it
const trap = name =>
    new Proxy(
        {},
        {
            get: (target, key) => {
                throw new Error(`${name}.${String(key)} was used by GET /chain/status`);
            },
        }
    );

const chainOn = () => ({
    enabled: true,
    network: cardano.Networks.preprod,
    policyId: 'ab'.repeat(28),
    configRef: `${'cd'.repeat(32)}#0`,
    configPolicyId: null,
    kFinal: 10,
    indexMaxLagMs: 600000,
    provider: trap('provider'),
    index: trap('index'),
    serverKey: trap('serverKey'),
});

/** An app whose pool's every query is counted (the status must not ask the database). */
const setup = async options => {
    const env = await createTestApp(options);
    const query = jest.spyOn(env.pool, 'query');
    const connect = jest.spyOn(env.pool, 'connect');
    return { ...env, untouched: () => [query, connect].forEach(spy => expect(spy).not.toHaveBeenCalled()) };
};

describe('GET /chain/status', () => {
    test('the chain features on: { enabled: true }, without a session, not cached, nothing touched', async () => {
        const { app, untouched } = await setup({ chain: chainOn(), chainConfig: trap('config') });
        const response = await request(app).get('/chain/status').expect(200);
        expect(response.text).toBe('{"enabled":true}');
        expect(response.headers['cache-control']).toBe('no-store');
        untouched();
    });

    test('the chain features off: { enabled: false } (with readiness, the only /chain route that answers 200 then), nothing touched', async () => {
        const { app, untouched } = await setup({ chain: { enabled: false, missing: ['CHAIN_K_FINAL'], provider: trap('provider'), index: trap('index') }, chainConfig: trap('config') });
        const response = await request(app).get('/chain/status').expect(200);
        expect(response.text).toBe('{"enabled":false}');
        expect(response.headers['cache-control']).toBe('no-store');
        // another method is not the status
        expect((await request(app).post('/chain/status').send({})).body).toEqual({ error: 'CHAIN OFF' });
        untouched();
    });

    test('a server without any chain settings is off too', async () => {
        const { app } = await createTestApp();
        expect((await request(app).get('/chain/status').expect(200)).body).toEqual({ enabled: false });
    });

    test('a limit per address of its own: the status does not use up the sign routes\' limit, nor they its', async () => {
        const { app } = await createTestApp({ chain: { enabled: false, missing: [] }, chainStatusPerMinute: 2, chainPerMinute: 1 });
        await request(app).get('/chain/status').expect(200);
        await request(app).get('/chain/status').expect(200);
        expect((await request(app).get('/chain/status').expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
    });

    test('with the chain on, the sign routes\' limit and the status\' are apart', async () => {
        const { app } = await createTestApp({ chain: chainOn(), chainConfig: trap('config'), chainStatusPerMinute: 3, chainPerMinute: 1 });
        // the sign routes' one request (a malformed code asks nothing)
        await request(app).get('/chain/sign/x').expect(404);
        expect((await request(app).get('/chain/sign/x')).status).toBe(429);
        for (let i = 0; i < 3; i++) {
            await request(app).get('/chain/status').expect(200);
        }
        expect((await request(app).get('/chain/status')).status).toBe(429);
    });

    test('it reads no body: one the parser could not read (an unknown charset), or one far over any limit, is not looked at', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { app } = await createTestApp({ chain: chainOn(), chainConfig: trap('config') });
        const odd = await request(app).get('/chain/status').set('content-type', 'application/json; charset=klingon').send('{}');
        expect([odd.status, odd.body]).toEqual([200, { enabled: true }]);
        const large = await request(app).get('/chain/status').set('content-type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(300 * 1024) }));
        expect([large.status, large.body]).toEqual([200, { enabled: true }]);
        expect(consoleError).not.toHaveBeenCalled();
    });
});
