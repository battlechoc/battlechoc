// Live match service over real WebSockets, with pg-mem and a manual match clock: the tests
// fast-forward match time, the network part (messages, heartbeats) runs in real time.

const http = require('http');
const request = require('supertest');
const { engine, live, EntityType, AttackType } = require('@battlechoc/battlechoc-shared-functions');
const { createApp } = require('../src/app');
const { createAuth } = require('../src/auth');
const { createPush } = require('../src/push');
const { createLive } = require('../src/live');
const { ManualClock } = require('../src/live/clock');
const { LiveClient, AgentPlayer } = require('../src/live/client');
const { createTestPool, closeTestPools, JWT_SECRET } = require('./helper');

afterAll(closeTestPools);

const { MatchActionTypes, MatchPhase } = engine;
const { ServerMessage, ClientMessage, LiveError, CloseCode } = live;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const silentLog = { error: () => {}, warn: () => {}, info: () => {} };

const environments = [];

const start = async ({ pool, config = {} } = {}) => {
    const env = { pool: pool || await createTestPool(), clock: new ManualClock(), pushed: [], clients: [] };
    env.auth = createAuth({ pool: env.pool, secret: JWT_SECRET });
    env.push = createPush({
        pool: env.pool,
        publicKey: 'public',
        privateKey: 'private',
        sender: { setVapidDetails: () => {}, sendNotification: async (subscription, payload) => { env.pushed.push(JSON.parse(payload)); } },
    });
    env.app = createApp({ pool: env.pool, auth: env.auth, push: env.push, accountsPerMinute: 1000 });
    env.server = http.createServer(env.app);
    env.live = createLive({ server: env.server, pool: env.pool, auth: env.auth, push: env.push, clock: env.clock, config, log: silentLog });
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

afterEach(async () => {
    await Promise.all(environments.splice(0).map(stop));
});

const account = async (env, { username, score } = {}) => {
    const created = (await request(env.app).post('/accounts').expect(201)).body;
    if (username) {
        await request(env.app).post('/user/username').set('Authorization', `Bearer ${created.accessToken}`).send({ username }).expect(200);
    }
    if (typeof score === 'number') {
        await env.pool.query('UPDATE players SET score = $1 WHERE id = $2', [score, created.playerId]);
    }
    return created;
};

const connect = async (env, token, options) => {
    const client = await new LiveClient(env.url, options).connect();
    env.clients.push(client);
    if (token) {
        await client.hello(token);
    }
    return client;
};

const player = async (env, options) => {
    const created = await account(env, options);
    const client = await connect(env, created.accessToken);
    client.account = created;
    return client;
};

const room = (env, matchId) => env.live.lobby.rooms.get(matchId);

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

    test('drops connections that stop answering heartbeats', async () => {
        const env = await start({ config: { pingIntervalMs: 50, offlineAfterMs: 150 } });
        const created = await account(env);
        const deaf = await connect(env, created.accessToken, { wsOptions: { autoPong: false } });
        await sleep(400);
        expect(deaf.closed).not.toBeNull();
    });
});

describe('live: matches', () => {
    test('the queue pairs two players and each gets only their own view', async () => {
        const env = await start();
        const { a, b, matchId } = await queueMatch(env);
        expect([a.index, b.index].sort()).toEqual([0, 1]);
        const message = a.views.get(matchId);
        expect(message.view.phase).toBe(MatchPhase.FIELD_CHOICE);
        expect(message.epoch).toBe(room(env, matchId).epoch);
        const json = JSON.stringify(message);
        expect(json).not.toContain(room(env, matchId).match.seed);
        expect(message.view).not.toHaveProperty('rng');
        expect(message.view).not.toHaveProperty('seed');
        expect((await request(env.app).get('/health')).body).toEqual({ ok: true });

        // already in a match: no second one
        a.send({ type: ClientMessage.QUEUE_JOIN });
        expect((await a.next(ServerMessage.ERROR)).code).toBe(LiveError.ALREADY_IN_MATCH);
    });

    test('binds actions to the connection, keeps only known fields and answers each uid once', async () => {
        const env = await start();
        const match = await queueMatch(env);
        const { a, matchId } = match;
        await toRunning(env, match);
        const r = room(env, matchId);
        const cell = freeCell(a.view(matchId), a.index);
        a.send({
            type: ClientMessage.INTENT,
            matchId,
            uid: 'same',
            player: 1 - a.index,
            action: { type: MatchActionTypes.build, player: 1 - a.index, t: 0, payload: { entityType: EntityType.CACAOTREE, row: cell.row, col: cell.col, costs: 0, hp: 99 } },
        });
        const first = await a.next(ServerMessage.ACK);
        a.send({ type: ClientMessage.INTENT, matchId, uid: 'same', action: { type: MatchActionTypes.build, payload: { entityType: EntityType.CACAOTREE, row: cell.row, col: cell.col } } });
        const second = await a.next(ServerMessage.ACK);
        expect(first).toEqual({ type: ServerMessage.ACK, matchId, uid: 'same', ok: true });
        expect(second).toEqual(first);
        await r.writes;
        const { rows } = await env.pool.query('SELECT action FROM match_actions WHERE match_id = $1 ORDER BY seq', [matchId]);
        const builds = rows.map(row => row.action).filter(action => action.type === MatchActionTypes.build);
        expect(builds).toHaveLength(1);
        expect(builds[0].player).toBe(a.index);
        expect(builds[0].payload).toEqual({ entityType: EntityType.CACAOTREE, row: cell.row, col: cell.col });
        expect(builds[0].t).toBe(r.match.t);
        const tree = r.match.board.fields[r.match.players[a.index].fieldIndex].grid[cell.row * r.match.board.size.cols + cell.col]
            .occupiedBy.find(entity => entity.type === EntityType.CACAOTREE);
        // the client's costs and hp are ignored
        expect(tree.hp).toBe(tree.maxHp);
        expect(tree.hp).not.toBe(99);

        expect((await a.act(matchId, MatchActionTypes.build, { entityType: 'EntityType.NOPE', row: 0, col: 0 })).error.code).toBe(LiveError.BAD_MESSAGE);
        expect((await a.act(matchId, MatchActionTypes.build, { entityType: EntityType.CACAOTREE, row: 99, col: 0 })).error.code).toBe(LiveError.BAD_MESSAGE);
        const rejected = await a.act(matchId, MatchActionTypes.placeFactory, { row: cell.row, col: cell.col });
        expect(rejected.error).toMatchObject({ code: LiveError.ACTION_REJECTED });
        a.send({ type: ClientMessage.INTENT, matchId: 'other', uid: 'x', action: { type: MatchActionTypes.surrender } });
        expect((await a.next(ServerMessage.ERROR)).code).toBe(LiveError.UNKNOWN_MATCH);
    });

    test('rush pricing, early shots within the tolerance and the rate limit', async () => {
        const env = await start();
        const match = await queueMatch(env);
        const { a, b, matchId } = match;
        await toRunning(env, match);
        const r = room(env, matchId);
        const cell = freeCell(a.view(matchId), a.index);
        expect((await a.act(matchId, MatchActionTypes.build, { entityType: EntityType.RUM_TRUFFLE_CANNON, row: cell.row, col: cell.col })).ok).toBe(true);
        const target = { row: 0, col: 0 };
        const shoot = allowRush => a.act(matchId, MatchActionTypes.attack, { attackType: AttackType.TRUFFLE, ...target, allowRush });

        expect((await shoot(true)).error.name).toBe('WeaponNotReadyError');
        env.clock.advance(10000);
        expect((await shoot(false)).error.name).toBe('WeaponNotReadyError');
        const cacao = r.match.players[a.index].cacao;
        expect((await shoot(true)).ok).toBe(true);
        expect(r.match.players[a.index].statistics.rushes).toBe(1);
        expect(r.match.players[a.index].cacao).toBeLessThanOrEqual(cacao - 10);

        // the cannon is charging again: a shot 100 ms early is applied when it is ready
        const { weapon } = engine.weaponsOf(r.match, a.index, AttackType.TRUFFLE)[0];
        const readyAt = engine.weaponStatus(r.match, weapon, r.match.t).readyAt;
        env.clock.advance(readyAt - r.now() - 1000);
        expect((await shoot(false)).error.name).toBe('WeaponNotReadyError');
        env.clock.advance(900);
        expect((await shoot(false)).ok).toBe(true);
        expect(r.match.t).toBe(readyAt);

        const acks = await Promise.all(Array.from({ length: 25 }, () => b.act(matchId, MatchActionTypes.surrender + '.nope')));
        expect(acks.filter(ack => ack.error && ack.error.code === LiveError.RATE_LIMITED).length).toBeGreaterThan(0);
    });

    test('two agents play a match to the end over the socket; results are credited once', async () => {
        // the test sends far more messages per real second than a person could
        const env = await start({ config: { messagesPerSecond: 100000 } });
        const match = await queueMatch(env);
        const { a, b, matchId } = match;
        const r = room(env, matchId);
        const players = [a, b].map(client => new AgentPlayer(client, matchId, engine.createAgent({ kind: 'RandomBot', playerIndex: client.index, seed: `bot-${client.index}` })));
        for (let step = 0; step < 12 * 60 && r.match.phase !== MatchPhase.ENDED; step++) {
            env.clock.advance(1000);
            await sleep(2);
            for (const agentPlayer of players) {
                await agentPlayer.step(r.now());
            }
        }
        expect(r.match.phase).toBe(MatchPhase.ENDED);
        expect(players.every(agentPlayer => agentPlayer.sent > 5)).toBe(true);
        const results = await Promise.all([a, b].map(client => client.next(ServerMessage.RESULT)));
        const outcome = r.match.outcome;
        results.forEach((message, i) => {
            const index = [a, b][i].index;
            expect(message.result.won).toBe(outcome.winners.length === 1 && outcome.winners[0] === index);
        });
        await r.writes;

        const records = (await env.pool.query('SELECT player_id, result, coins FROM track_records ORDER BY player_id')).rows;
        expect(records).toHaveLength(2);
        const winner = results.find(message => message.result.won);
        if (winner) {
            expect(winner.result.coins).toBeGreaterThan(0);
        }
        const row = (await env.pool.query('SELECT status, snapshot, outcome FROM matches WHERE id = $1', [matchId])).rows[0];
        expect(row.status).toBe('ended');
        expect(row.outcome).toEqual(outcome);

        // the action log replays to the same match
        const final = row.snapshot.match;
        const replica = engine.createMatch({
            players: final.players.map(({ id, name, type, level }) => ({ id, name, type, level })),
            boardSize: final.board.size,
            seed: final.seed,
        });
        const { rows } = await env.pool.query('SELECT action FROM match_actions WHERE match_id = $1 ORDER BY seq', [matchId]);
        rows.forEach(({ action }) => expect(engine.applyAction(replica, action).ok).toBe(true));
        engine.advanceTo(replica, final.t);
        expect(JSON.parse(JSON.stringify(replica))).toEqual(final);

        // the players are free again
        a.send({ type: ClientMessage.QUEUE_JOIN });
        await a.next(ServerMessage.QUEUED);
    }, 60000);

    test('an offline player loses after the grace period, coming back in time cancels it', async () => {
        const env = await start();
        const match = await queueMatch(env);
        const { a, b, matchId } = match;
        await toRunning(env, match);
        const r = room(env, matchId);

        a.close();
        const offline = await b.next(ServerMessage.PRESENCE);
        expect(offline).toMatchObject({ player: a.index, online: false, forfeitAt: env.clock.now() + live.LiveDefaults.disconnectGraceMs });
        env.clock.advance(30000);
        const back = await connect(env, a.account.accessToken);
        expect(back.welcome.activeMatch).toEqual({ matchId });
        back.send({ type: ClientMessage.MATCH_JOIN, matchId });
        expect((await back.next(ServerMessage.MATCH)).playerIndex).toBe(a.index);
        await back.next(ServerMessage.VIEW);
        expect(await b.next(ServerMessage.PRESENCE)).toMatchObject({ player: a.index, online: true, forfeitAt: null });
        env.clock.advance(60000);
        expect(r.match.phase).toBe(MatchPhase.RUNNING);

        b.terminate();
        await back.next(ServerMessage.PRESENCE, message => message.online === false);
        env.clock.advance(60000);
        expect(r.match.phase).toBe(MatchPhase.ENDED);
        expect(r.match.outcome.winners).toEqual([a.index]);
        const result = await back.next(ServerMessage.RESULT);
        expect(result.result.won).toBe(true);
    });

    test('matchmaking falls back to an AI after 30 s', async () => {
        const env = await start();
        const lonely = await player(env, { score: 900 });
        lonely.send({ type: ClientMessage.QUEUE_JOIN });
        await lonely.next(ServerMessage.QUEUED);
        env.clock.advance(29000);
        await sleep(20);
        expect(lonely.matches.size).toBe(0);
        env.clock.advance(1000);
        const message = await lonely.next(ServerMessage.MATCH);
        expect(message.opponent).toEqual({ name: 'Gustav Ganache', type: 'PlayerType.AI_STRONG' });
        const r = room(env, message.matchId);
        expect(r.kind).toBe('ai');
        expect(r.match.board.size).toEqual({ rows: 10, cols: 10 });
        expect(r.match.fieldChooser).toBe(message.playerIndex);
        await lonely.act(message.matchId, MatchActionTypes.chooseField, { fieldIndex: 1 });
        for (let i = 0; i < 40; i++) {
            env.clock.advance(1000);
        }
        expect(r.match.events.some(event => event.player === 1 && event.type !== undefined)).toBe(true);
        expect(r.seq).toBeGreaterThan(2);
    });

    test('invites: live, declined, expired and by push to an offline player', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const ben = await player(env, { username: 'Ben' });

        anna.send({ type: ClientMessage.INVITE, username: 'ben' });
        const sent = await anna.next(ServerMessage.INVITE_SENT);
        const incoming = await ben.next(ServerMessage.INVITE);
        expect(incoming.invite).toEqual({ id: sent.invite.id, from: 'Anna', expiresAt: sent.invite.expiresAt });
        ben.send({ type: ClientMessage.INVITE_DECLINE, inviteId: incoming.invite.id });
        expect((await anna.next(ServerMessage.INVITE_CLOSED)).reason).toBe('declined');

        anna.send({ type: ClientMessage.INVITE, username: 'Ben' });
        await ben.next(ServerMessage.INVITE);
        env.clock.advance(60000);
        expect((await anna.next(ServerMessage.INVITE_CLOSED)).reason).toBe('expired');

        anna.send({ type: ClientMessage.INVITE, username: 'Ben' });
        const second = await ben.next(ServerMessage.INVITE);
        ben.send({ type: ClientMessage.INVITE_ACCEPT, inviteId: second.invite.id });
        const [ma, mb] = await Promise.all([anna.next(ServerMessage.MATCH), ben.next(ServerMessage.MATCH)]);
        expect(ma.matchId).toBe(mb.matchId);
        expect(room(env, ma.matchId).kind).toBe('invite');
        expect(ma.opponent.name).toBe('Ben');

        const created = await account(env, { username: 'Carla' });
        await request(env.app).post('/push/subscription').set('Authorization', `Bearer ${created.accessToken}`)
            .send({ subscription: { endpoint: 'https://push.example/carla', keys: { p256dh: 'k', auth: 'a' } } }).expect(201);
        const dora = await player(env, { username: 'Dora' });
        dora.send({ type: ClientMessage.INVITE, username: 'Carla' });
        await dora.next(ServerMessage.INVITE_SENT);
        await sleep(50);
        expect(env.pushed).toHaveLength(1);
        expect(env.pushed[0]).toMatchObject({ kind: 'invite', from: 'Dora', title: 'Dora is challenging you!' });

        dora.send({ type: ClientMessage.PRESENCE_QUERY, usernames: ['anna', 'Carla', 'Nobody', 42] });
        expect((await dora.next(ServerMessage.PRESENCE_LIST)).online).toEqual(['Anna']);

        dora.send({ type: ClientMessage.INVITE, username: 'Nobody' });
        expect((await dora.next(ServerMessage.ERROR)).code).toBe(LiveError.PLAYER_NOT_FOUND);
    });

    test('running matches survive a restart of the server', async () => {
        const env = await start();
        const match = await queueMatch(env);
        const { a, matchId } = match;
        await toRunning(env, match);
        const cell = freeCell(a.view(matchId), a.index);
        expect((await a.act(matchId, MatchActionTypes.build, { entityType: EntityType.CACAOTREE, row: cell.row, col: cell.col })).ok).toBe(true);
        env.clock.advance(12000);
        const before = room(env, matchId);
        await before.writes;
        // crash: timers stop, nothing is saved anymore
        env.clock.timers.clear();
        env.clients.forEach(client => client.terminate());

        const restarted = await start({ pool: env.pool });
        restarted.clock.advance(5 * 60 * 1000);
        expect(await restarted.live.recover()).toBe(1);
        const after = room(restarted, matchId);
        // the downtime does not count, and at most a few seconds of match time are repeated
        expect(after.now()).toBeLessThanOrEqual(before.match.t);
        expect(after.now()).toBeGreaterThan(before.match.t - live.LiveDefaults.saveReachedEveryMs);
        const expected = structuredClone(before.match);
        engine.advanceTo(after.match, before.match.t);
        expect(JSON.parse(JSON.stringify(after.match))).toEqual(JSON.parse(JSON.stringify(expected)));

        const back = await connect(restarted, a.account.accessToken);
        expect(back.welcome.activeMatch).toEqual({ matchId });
        back.send({ type: ClientMessage.MATCH_JOIN, matchId });
        const view = await back.next(ServerMessage.VIEW);
        expect(view.view.phase).toBe(MatchPhase.RUNNING);
        expect((await back.act(matchId, MatchActionTypes.build, { entityType: EntityType.CREAM, row: 0, col: 0 })).matchId).toBe(matchId);

        // the other player never came back
        restarted.clock.advance(60000);
        expect(after.match.outcome.winners).toEqual([a.index]);
    });
});
