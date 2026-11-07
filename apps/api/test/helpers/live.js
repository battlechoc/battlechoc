// The live match service for tests: over real WebSockets, on a test database and with a manual
// match clock. The tests fast-forward match time; the network part (messages, heartbeats) runs in
// real time. A test file that uses `start` calls `stopAll` after each test.

const http = require('http');
const { engine, live, EntityType } = require('@battlechoc/battlechoc-shared-functions');
const { createLive } = require('../../src/live');
const { ManualClock } = require('../../src/live/clock');
const { LiveClient } = require('../../src/live/client');
const { createTestApp, createAccount } = require('./api');
const { until } = require('./wait');

const { MatchActionTypes, MatchPhase } = engine;
const { ServerMessage, ClientMessage } = live;

const silentLog = { error: () => {}, warn: () => {}, info: () => {} };

const environments = [];

/**
 * A server with the REST app and the live service: { app, pool, auth, server, live, clock, url,
 * clients }. `pool` reuses a database (a restart of the server), `config` overrides LiveDefaults.
 */
const start = async ({ pool, config = {}, log = silentLog } = {}) => {
    const env = { ...(await createTestApp({ pool })), clock: new ManualClock(), clients: [] };
    env.server = http.createServer(env.app);
    env.live = createLive({ server: env.server, pool: env.pool, auth: env.auth, clock: env.clock, config, log });
    await new Promise(resolve => env.server.listen(0, '127.0.0.1', resolve));
    env.url = `ws://127.0.0.1:${env.server.address().port}/live`;
    environments.push(env);
    return env;
};

const stop = async env => {
    env.clients.forEach(client => client.terminate());
    await env.live.close().catch(() => {});
    await new Promise(resolve => env.server.close(resolve));
};

/** Stops every server a test started (for afterEach). */
const stopAll = () => Promise.all(environments.splice(0).map(stop));

/** A device account; `score` sets the player's XP (board size and AI strength follow it). */
const account = async (env, { username, score } = {}) => {
    const created = await createAccount(env.app, { username });
    if (typeof score === 'number') {
        await env.pool.query('UPDATE players SET xp = $1 WHERE id = $2', [score, created.playerId]);
    }
    return created;
};

/** A live client; with a token it says hello and waits for the welcome. */
const connect = async (env, token, options) => {
    const client = await new LiveClient(env.url, options).connect();
    env.clients.push(client);
    if (token) {
        await client.hello(token);
    }
    return client;
};

/** A new account with a connected client (client.account is the account). */
const player = async (env, options) => {
    const created = await account(env, options);
    const client = await connect(env, created.accessToken);
    client.account = created;
    return client;
};

const room = (env, matchId) => env.live.lobby.rooms.get(matchId);

let pings = 0;

/**
 * Resolves when the server has handled everything `client` sent so far and the client has got
 * everything the server sent it until then: the server handles the messages of a connection one
 * after the other and a socket keeps their order, so the pong of a ping comes after all of it.
 */
const settled = async client => {
    pings += 1;
    // ids the tests' own pings do not use
    const id = 1000000 + pings;
    client.send({ type: ClientMessage.PING, id, clientT: 0 });
    await client.next(ServerMessage.PONG, message => message.id === id);
};

/** Resolves when the server has noticed that the connection of `client` (from `player`) is gone. */
const gone = (env, client) => until(() => !env.live.lobby.online(client.account.playerId), 'the server to notice the closed connection');

// two players through the queue; resolves when both have the match and a first view
const queueMatch = async env => {
    const a = await player(env);
    const b = await player(env);
    a.send({ type: ClientMessage.QUEUE_JOIN });
    await a.next(ServerMessage.QUEUED);
    b.send({ type: ClientMessage.QUEUE_JOIN });
    const [ma, mb] = await Promise.all([a.next(ServerMessage.MATCH), b.next(ServerMessage.MATCH)]);
    await Promise.all([a, b].map(client => client.next(ServerMessage.VIEW, message => message.matchId === ma.matchId)));
    a.index = ma.playerIndex;
    b.index = mb.playerIndex;
    return { a, b, matchId: ma.matchId };
};

// two connected players in a challenge match (the lobby's own start, as an accepted challenge does)
const challengeMatch = async env => {
    const a = await player(env);
    const b = await player(env);
    await env.live.lobby.startBetween('challenge', a.account.playerId, b.account.playerId);
    const [ma, mb] = await Promise.all([a.next(ServerMessage.MATCH), b.next(ServerMessage.MATCH)]);
    await Promise.all([a, b].map(client => client.next(ServerMessage.VIEW, message => message.matchId === ma.matchId)));
    a.index = ma.playerIndex;
    b.index = mb.playerIndex;
    return { a, b, matchId: ma.matchId, messages: [ma, mb] };
};

const nextView = (client, matchId, predicate) =>
    client.next(ServerMessage.VIEW, message => message.matchId === matchId && predicate(message.view));

const freeCell = (view, index) => view.board.fields[view.players[index].fieldIndex].grid
    .find(cell => cell.occupiedBy.every(entity => entity.type === EntityType.CREAM));

// field choice, both factories, countdown: resolves in the running phase
const toRunning = async (env, { a, b, matchId }) => {
    const chooser = room(env, matchId).match.fieldChooser;
    const chooserClient = a.index === chooser ? a : b;
    expect((await chooserClient.act(matchId, MatchActionTypes.chooseField, { fieldIndex: 0 })).ok).toBe(true);
    for (const client of [a, b]) {
        const message = await nextView(client, matchId, v => v.players[client.index].fieldIndex !== null);
        const cell = freeCell(message.view, client.index);
        expect((await client.act(matchId, MatchActionTypes.placeFactory, { row: cell.row, col: cell.col })).ok).toBe(true);
    }
    env.clock.advance(env.live.lobby.rooms.get(matchId).match.balance.match.countdownMs);
    await Promise.all([a, b].map(client => nextView(client, matchId, v => v.phase === MatchPhase.RUNNING)));
};

module.exports = {
    start, stopAll, account, connect, player, room, settled, gone, queueMatch, challengeMatch, nextView, freeCell, toRunning, silentLog,
};
