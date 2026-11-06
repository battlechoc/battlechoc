// How the process stops (SIGTERM from Docker, which kills it after 10 seconds) and what the
// health check answers.

const request = require('supertest');
const { createApp } = require('../src/app');
const { createAuth } = require('../src/auth');
const { createShutdown } = require('../src/server');
const { createTestPool, closeTestPools, counting, failingOn, JWT_SECRET } = require('./helper');

afterAll(closeTestPools);

describe('health', () => {
    const setup = async (wrap = pool => pool) => {
        const { pool, counter } = counting(wrap(await createTestPool()));
        return { app: createApp({ pool, auth: createAuth({ pool, secret: JWT_SECRET }) }), counter };
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
            live: { close: () => { calls.push('live'); return liveClose(); } },
            server: { close: callback => { calls.push('server'); serverClose(callback); } },
            pool: { end: () => { calls.push('pool'); return poolEnd(); } },
            exit: code => calls.push(`exit ${code}`),
            log: { error: jest.fn(), log: jest.fn() },
        };
    };

    test('stops the cleanup, the live service, the server and the pool, then exits', async () => {
        const stopped = parts();
        await createShutdown(stopped)();
        expect(stopped.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 0']);
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
        expect(stopped.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 0']);
    });

    test('a failing live service does not keep the server and the pool open', async () => {
        const stopped = parts({ liveClose: async () => { throw new Error('snapshot failed'); } });
        await createShutdown(stopped)();
        expect(stopped.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 1']);
        expect(stopped.log.error).toHaveBeenCalledTimes(1);
    });

    test('a failing server or pool still ends the process, with an error code', async () => {
        const server = parts({ serverClose: callback => callback(new Error('not running')) });
        await createShutdown(server)();
        expect(server.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 1']);
        const pool = parts({ poolEnd: async () => { throw new Error('already ended'); } });
        await createShutdown(pool)();
        expect(pool.calls).toEqual(['cleanup', 'live', 'server', 'pool', 'exit 1']);
    });

    test('something that hangs is cut off before Docker kills the container', async () => {
        jest.useFakeTimers();
        try {
            const stopped = parts({ liveClose: () => new Promise(() => {}) });
            createShutdown(stopped)();
            jest.advanceTimersByTime(7999);
            expect(stopped.calls).toEqual(['cleanup', 'live']);
            jest.advanceTimersByTime(1);
            expect(stopped.calls).toEqual(['cleanup', 'live', 'exit 1']);
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
