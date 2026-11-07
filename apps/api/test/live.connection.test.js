// The live match service: connections, the hello, heartbeats and the shutdown (see helpers/live.js for how these tests run).

const { engine, live } = require('@battlechoc/battlechoc-shared-functions');
const { closeTestPools } = require('./helpers/db');
const { start, stopAll, account, connect, player, queueMatch } = require('./helpers/live');
const { until } = require('./helpers/wait');

const { MatchActionTypes } = engine;
const { ServerMessage, ClientMessage, LiveError, CloseCode } = live;

afterAll(closeTestPools);
afterEach(stopAll);

describe('live: connection', () => {
    test('needs a valid token in the first message', async () => {
        const env = await start();
        const anonymous = await connect(env);
        anonymous.send({ type: ClientMessage.HELLO, token: 'nope' });
        await expect(anonymous.next(ServerMessage.WELCOME)).rejects.toThrow('closed (4401)');

        const early = await connect(env);
        early.send({ type: ClientMessage.QUEUE_JOIN });
        await expect(early.next(ServerMessage.WELCOME)).rejects.toThrow(`closed (${CloseCode.PROTOCOL})`);

        const created = await account(env);
        const client = await connect(env, created.accessToken);
        expect(client.welcome).toMatchObject({ playerId: created.playerId, activeMatch: null, protocol: live.LIVE_PROTOCOL_VERSION });
        client.send('garbage');
        expect((await client.next(ServerMessage.ERROR)).code).toBe(LiveError.BAD_MESSAGE);
    });

    // a page that is busy while it loads sends its hello late: that is no rejection, it may retry
    test('closes a socket without a hello in time with its own code, not as unauthorized', async () => {
        const env = await start({ config: { helloTimeoutMs: 50 } });
        const busy = await connect(env);
        await expect(busy.next(ServerMessage.WELCOME, () => true, 1000)).rejects.toThrow(`closed (${CloseCode.HELLO_TIMEOUT})`);
        expect(CloseCode.HELLO_TIMEOUT).not.toBe(CloseCode.UNAUTHORIZED);
    });

    test('answers pings with the server time for the clock sync', async () => {
        const env = await start();
        const client = await player(env);
        client.send({ type: ClientMessage.PING, id: 7, clientT: 123 });
        expect(await client.next(ServerMessage.PONG)).toEqual({ type: ServerMessage.PONG, id: 7, clientT: 123, serverT: env.clock.now() });
    });

    test('a second connection of the same account replaces the first', async () => {
        const env = await start();
        const created = await account(env);
        const first = await connect(env, created.accessToken);
        await connect(env, created.accessToken);
        await expect(first.next(ServerMessage.WELCOME, () => true, 1000)).rejects.toThrow(`closed (${CloseCode.REPLACED})`);
    });

    test('closing the service leaves no timer behind', async () => {
        const env = await start();
        // a waiting challenge, a match that ended (its room lingers) and a running one
        const anna = await player(env, { username: 'Anna' });
        anna.send({ type: ClientMessage.CHALLENGE_CREATE });
        await anna.next(ServerMessage.CHALLENGE);
        const ended = await queueMatch(env);
        expect((await ended.a.act(ended.matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await Promise.all([ended.a, ended.b].map(client => client.next(ServerMessage.RESULT)));
        await queueMatch(env);
        expect(env.clock.timers.size).toBeGreaterThanOrEqual(3);

        await env.live.close();
        // the sockets close after the service: a player leaving then must not start a forfeit timer
        await until(() => env.live.lobby.connections.size === 0, 'the sockets to close');
        expect(env.clock.timers.size).toBe(0);
    });

    test('a client that never answers the close does not hold up the shutdown', async () => {
        const env = await start({ config: { closeGraceMs: 100 } });
        const gone = await player(env);
        const present = await player(env);
        // a phone that lost its network: nothing it was sent is read any more
        gone.ws._socket.pause();
        const started = Date.now();
        await env.live.close();
        // the HTTP server can only close once every socket is gone
        await new Promise(resolve => env.server.close(resolve));
        expect(Date.now() - started).toBeLessThan(2000);
        expect(env.live.wss.clients.size).toBe(0);
        await expect(present.next(ServerMessage.WELCOME, () => true, 1000)).rejects.toThrow(`closed (${CloseCode.RESTART})`);
    });

    test('drops connections that stop answering heartbeats', async () => {
        const env = await start({ config: { pingIntervalMs: 50, offlineAfterMs: 150 } });
        const created = await account(env);
        const deaf = await connect(env, created.accessToken, { wsOptions: { autoPong: false } });
        await until(() => deaf.closed !== null, 'the server to drop the silent connection');
        // dropped without a closing handshake
        expect(deaf.closed.code).toBe(1006);
    });
});
