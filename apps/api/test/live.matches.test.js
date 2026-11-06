// The live match service: matches, from the queue to the result, and what survives a restart (see helpers/live.js for how these tests run).

const request = require('supertest');
const WebSocket = require('ws');
const { engine, live, EntityType, AttackType } = require('@battlechoc/battlechoc-shared-functions');
const { AgentPlayer } = require('../src/live/client');
const { closeTestPools, failingOn } = require('./helpers/db');
const {
    start, stopAll, account, connect, player, room, settled, gone, queueMatch, challengeMatch, nextView, freeCell, toRunning, silentLog,
} = require('./helpers/live');
const { sleep } = require('./helpers/wait');

const { MatchActionTypes, MatchPhase } = engine;
const { ServerMessage, ClientMessage, LiveError } = live;

afterAll(closeTestPools);
afterEach(stopAll);

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
        // targets with nothing but cream: a hit on b's factory could end the match (random damage)
        const creamOnly = r.match.board.fields[r.match.players[b.index].fieldIndex].grid
            .filter(target => target.occupiedBy.length > 0 && target.occupiedBy.every(entity => entity.type === EntityType.CREAM));
        let target = creamOnly[0];
        const shoot = allowRush => a.act(matchId, MatchActionTypes.attack, { attackType: AttackType.TRUFFLE, row: target.row, col: target.col, allowRush });

        expect((await shoot(true)).error.name).toBe('WeaponNotReadyError');
        env.clock.advance(10000);
        expect((await shoot(false)).error.name).toBe('WeaponNotReadyError');
        const cacao = r.match.players[a.index].cacao;
        expect((await shoot(true)).ok).toBe(true);
        expect(r.match.players[a.index].statistics.rushes).toBe(1);
        expect(r.match.players[a.index].cacao).toBeLessThanOrEqual(cacao - 10);

        // the cannon is charging again: a shot 100 ms early is applied when it is ready
        // (the first target's cream is gone, so aim at another one)
        target = creamOnly[1];
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
            // both have every view of that second before they decide
            await Promise.all([a, b].map(settled));
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

        const records = (await env.pool.query('SELECT player_id, result, xp, verified FROM track_records ORDER BY player_id')).rows;
        expect(records).toHaveLength(2);
        records.forEach(record => expect(record.verified).toBe(true));
        const winner = results.find(message => message.result.won);
        if (winner) {
            expect(winner.result.xp).toBeGreaterThan(0);
        }
        // verified: the first match of the day brings a fresh batch; two humans are rated
        results.forEach(message => {
            expect(message.result.drops).toEqual(expect.arrayContaining([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]));
            expect(message.result.rating).toEqual({ before: 1500, after: expect.any(Number) });
            message.result.awards.forEach(award => expect(award).toEqual({ key: expect.any(String), xp: expect.any(Number) }));
        });
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

    test('matchmaking falls back to an AI after 15 s', async () => {
        const env = await start();
        const lonely = await player(env, { score: 900 });
        lonely.send({ type: ClientMessage.QUEUE_JOIN });
        await lonely.next(ServerMessage.QUEUED);
        env.clock.advance(14000);
        // the fallback has not fired: the player still waits in the queue and no match is being set up
        expect(env.live.lobby.queue.has(lonely.account.playerId)).toBe(true);
        expect(env.live.lobby.busy(lonely.account.playerId)).toBe(false);
        await settled(lonely);
        expect(lonely.matches.size).toBe(0);
        env.clock.advance(1000);
        const message = await lonely.next(ServerMessage.MATCH);
        expect(message.opponent).toEqual({ name: 'Gustav Ganache', type: 'PlayerType.AI_STRONG' });
        const r = room(env, message.matchId);
        expect(r.kind).toBe('ai');
        expect(r.match.board.size).toEqual({ rows: 10, cols: 10 });
        expect(r.match.fieldChooser).toBe(message.playerIndex);
        await lonely.act(message.matchId, MatchActionTypes.chooseField, { fieldIndex: 1 });
        // against the AI the placement waits for the player
        expect(r.match.phaseEndsAt).toBe(engine.AI_MATCH_DEADLINE_MS);
        const placed = await nextView(lonely, message.matchId, v => v.players[message.playerIndex].fieldIndex !== null);
        const cell = freeCell(placed.view, message.playerIndex);
        expect((await lonely.act(message.matchId, MatchActionTypes.placeFactory, { row: cell.row, col: cell.col })).ok).toBe(true);
        for (let i = 0; i < 40; i++) {
            env.clock.advance(1000);
        }
        expect(r.match.events.some(event => event.player === 1 && event.type !== undefined)).toBe(true);
        expect(r.seq).toBeGreaterThan(2);
    });

    test('queue.ai starts a match against the server AI right away, queued or not', async () => {
        const env = await start();
        const waiting = await player(env, { score: 150 });
        waiting.send({ type: ClientMessage.QUEUE_JOIN });
        await waiting.next(ServerMessage.QUEUED);
        waiting.send({ type: ClientMessage.QUEUE_AI });
        const first = await waiting.next(ServerMessage.MATCH);
        expect(room(env, first.matchId).kind).toBe('ai');
        expect(env.live.lobby.queue.size).toBe(0);

        const direct = await player(env, { score: 150 });
        direct.send({ type: ClientMessage.QUEUE_AI });
        const second = await direct.next(ServerMessage.MATCH);
        expect(room(env, second.matchId).kind).toBe('ai');
        direct.send({ type: ClientMessage.QUEUE_AI });
        expect((await direct.next(ServerMessage.ERROR)).code).toBe(LiveError.ALREADY_IN_MATCH);
    });

    test('a verified match against the AI gives xp and drops, credited only once', async () => {
        const env = await start();
        const lonely = await player(env, { score: 150 });
        lonely.send({ type: ClientMessage.QUEUE_AI });
        const { matchId } = await lonely.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        // surrendering during field choice: the match never ran, so no achievements, but it is the
        // first verified match of the day
        expect((await lonely.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        const { result } = await lonely.next(ServerMessage.RESULT);
        expect(result.lost).toBe(true);
        expect(result.drops).toEqual(expect.arrayContaining([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]));
        expect(result.rating).toBeUndefined();
        await r.writes;
        const totals = async () => (await request(env.app).get('/user')
            .set('Authorization', `Bearer ${lonely.account.accessToken}`)).body.stats.pantry;
        const before = await totals();
        expect(before.COCOA).toBeGreaterThanOrEqual(100);
        // the end of the match is processed again (as after a restart): nothing more is credited
        env.live.lobby.matchEnded(r);
        await r.writes;
        expect(await totals()).toEqual(before);
    });

    test('a new player (up to 100 XP) gets the prepared first game against Tom Toffee on the server', async () => {
        const env = await start();
        const rookie = await player(env, { score: 100 });
        rookie.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, playerIndex, opponent } = await rookie.next(ServerMessage.MATCH);
        expect(playerIndex).toBe(0);
        expect(opponent).toEqual({ name: 'Tom Toffee', type: 'PlayerType.AI_EASY' });
        const r = room(env, matchId);
        expect(r.kind).toBe('ai');
        expect(r.match.board.size).toEqual({ rows: 6, cols: 6 });
        expect(r.match.phase).toBe(MatchPhase.RUNNING);
        expect(r.match.players.map(p => p.cacao)).toEqual([200, 50]);
        expect(engine.cellAt(r.match, 0, 0, 0).occupiedBy.map(entity => entity.type)).toContain(EntityType.FACTORY);
        expect(engine.cellAt(r.match, 1, 3, 0).occupiedBy.map(entity => entity.type)).toContain(EntityType.FACTORY);
        expect(r.match.balance.match.placementTimeoutMs).toBe(engine.AI_MATCH_DEADLINE_MS);
        // the prepared board is part of the stored match (it survives a restart)
        const stored = (await env.pool.query('SELECT snapshot FROM matches WHERE id = $1', [matchId])).rows[0].snapshot;
        expect((typeof stored === 'string' ? JSON.parse(stored) : stored).match.phase).toBe(MatchPhase.RUNNING);

        // the AI gives up: a verified win with xp and drops
        const action = { type: MatchActionTypes.surrender, player: 1, t: r.now(), payload: {} };
        expect(engine.applyAction(r.match, action).ok).toBe(true);
        r.record(action);
        r.afterChange();
        const { result } = await rookie.next(ServerMessage.RESULT);
        expect(result.won).toBe(true);
        expect(result.xp).toBeGreaterThan(0);
        expect(result.drops.length).toBeGreaterThan(0);
        await r.writes;
        const records = (await env.pool.query('SELECT verified FROM track_records WHERE player_id = $1', [rookie.account.playerId])).rows;
        expect(records).toEqual([{ verified: true }]);
    });

    test('later matches against the AI start with the field choice, without hurry', async () => {
        const env = await start();
        const regular = await player(env, { score: 101 });
        regular.send({ type: ClientMessage.QUEUE_AI });
        const { matchId } = await regular.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        expect(r.match.phase).toBe(MatchPhase.FIELD_CHOICE);
        expect(r.match.phaseEndsAt).toBe(engine.AI_MATCH_DEADLINE_MS);
        // a client cannot ask for the first game: the score comes from the database
        expect(r.match.board.size).toEqual({ rows: 6, cols: 6 });
        expect(r.match.players.map(p => p.cacao)).toEqual([r.match.balance.match.startCacao, r.match.balance.match.startCacao]);
    });

    test('an online match uses the loadout from the database; the server AI has none', async () => {
        const env = await start();
        const equipped = await player(env, { score: 150 });
        const itemId = 'item-light';
        await env.pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ($1, $2, $3, 1, $2)',
            [itemId, equipped.account.playerId, 'LIGHT_BARREL']);
        await env.pool.query('UPDATE players SET equipment = $1 WHERE id = $2',
            [JSON.stringify({ [EntityType.RUM_TRUFFLE_CANNON]: [itemId, null] }), equipped.account.playerId]);
        equipped.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, playerIndex } = await equipped.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        expect(r.match.players[playerIndex].loadout).toEqual({ [EntityType.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        expect(r.match.players[1 - playerIndex].loadout).toEqual({});
    });

    test('a match between two players that never ran changes no rating', async () => {
        const env = await start();
        const { a, b, matchId } = await queueMatch(env);
        expect((await a.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await Promise.all([a, b].map(client => client.next(ServerMessage.RESULT)));
        await room(env, matchId).writes;
        const { rows } = await env.pool.query('SELECT rated_matches, rating FROM players');
        rows.forEach(row => expect(row).toMatchObject({ rated_matches: 0, rating: 1500 }));
        expect(Number((await env.pool.query('SELECT COUNT(*) AS n FROM rated_matches')).rows[0].n)).toBe(0);
    });

    test('a challenge match is 10x10, has a coin toss and 45 s placement, and the match message says challenge', async () => {
        const env = await start();
        const { matchId, messages } = await challengeMatch(env);
        const r = room(env, matchId);
        expect(r.kind).toBe('challenge');
        expect(r.match.board.size).toEqual({ rows: 10, cols: 10 });
        expect(r.match.balance.match.placementTimeoutMs).toBe(45000);
        expect(r.match.balance.match.fieldChoiceTimeoutMs).toBe(10000);
        expect([0, 1]).toContain(r.match.fieldChooser);
        messages.forEach(message => expect(message.kind).toBe('challenge'));
    });

    test('a challenge is not rated but credits XP, challenge XP and a finished match', async () => {
        const env = await start();
        const match = await challengeMatch(env);
        const { a, b, matchId } = match;
        await toRunning(env, match);
        env.clock.advance(1000);
        expect((await a.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await Promise.all([a, b].map(client => client.next(ServerMessage.RESULT)));
        await room(env, matchId).writes;
        const { rows } = await env.pool.query('SELECT id, xp, challenge_xp, rated_matches, rating FROM players');
        rows.forEach(row => {
            expect(row).toMatchObject({ rated_matches: 0, rating: 1500 });
            expect(row.challenge_xp).toBe(row.xp);
        });
        expect(rows.find(row => row.id === b.account.playerId).xp).toBeGreaterThan(0);
        expect(Number((await env.pool.query('SELECT COUNT(*) AS n FROM rated_matches')).rows[0].n)).toBe(0);
        const { stats } = (await request(env.app).get('/user').set('Authorization', `Bearer ${a.account.accessToken}`)).body;
        expect(stats.losses).toBe(1);
        expect(stats.challengeXp).toBe(stats.xp);
    });

    test('the AI ladder sets up the server AI: step 4 is a very easy Gustav on the 10x10 board', async () => {
        const env = await start();
        const climber = await player(env, { score: 150 });
        await env.pool.query('UPDATE players SET ai_ladder = $1 WHERE id = $2',
            [JSON.stringify({ step: 4, wins: 0, floor: 4, games: 9 }), climber.account.playerId]);
        climber.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, opponent } = await climber.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        expect(opponent.name).toBe('Gustav Ganache');
        expect(r.match.board.size).toEqual({ rows: 10, cols: 10 });
        expect(JSON.stringify(r.snapshot().agents)).toContain('"handicap":4');
    });

    test('matches against the server AI move the ladder: two wins up, a loss down', async () => {
        const env = await start();
        const climber = await player(env, { score: 150 });
        const { playerId } = climber.account;
        await env.pool.query('UPDATE players SET ai_ladder = $1 WHERE id = $2',
            [JSON.stringify({ step: 2, wins: 0, floor: 1, games: 3 }), playerId]);
        const ladder = async () => (await request(env.app).get('/user')
            .set('Authorization', `Bearer ${climber.account.accessToken}`)).body.stats.aiLadder;
        // one match: the AI gives up (a win) or the player does (a loss)
        const play = async aiGivesUp => {
            climber.send({ type: ClientMessage.QUEUE_AI });
            const { matchId } = await climber.next(ServerMessage.MATCH);
            const r = room(env, matchId);
            if (aiGivesUp) {
                const action = { type: MatchActionTypes.surrender, player: 1, t: r.now(), payload: {} };
                expect(engine.applyAction(r.match, action).ok).toBe(true);
                r.record(action);
                r.afterChange();
            } else {
                expect((await climber.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
            }
            await climber.next(ServerMessage.RESULT, message => message.matchId === matchId);
            await r.writes;
        };
        await play(true);
        expect(await ladder()).toMatchObject({ step: 2, wins: 1, games: 4 });
        await play(true);
        expect(await ladder()).toMatchObject({ step: 3, wins: 0, games: 5 });
        await play(false);
        expect(await ladder()).toMatchObject({ step: 2, wins: 0, games: 6 });
    });

    test('rematch after a challenge: offered, declined, expired, accepted', async () => {
        const env = await start();
        const { a, b, matchId } = await challengeMatch(env);
        expect((await a.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await Promise.all([a, b].map(client => client.next(ServerMessage.RESULT)));

        a.send({ type: ClientMessage.REMATCH, matchId });
        const sent = await a.next(ServerMessage.INVITE_SENT);
        const offer = await b.next(ServerMessage.INVITE);
        expect(offer.invite).toMatchObject({ id: sent.invite.id, rematch: true, expiresAt: sent.invite.expiresAt });
        b.send({ type: ClientMessage.INVITE_DECLINE, inviteId: offer.invite.id });
        expect((await a.next(ServerMessage.INVITE_CLOSED)).reason).toBe('declined');

        a.send({ type: ClientMessage.REMATCH, matchId });
        await b.next(ServerMessage.INVITE);
        env.clock.advance(60000);
        expect((await a.next(ServerMessage.INVITE_CLOSED)).reason).toBe('expired');

        a.send({ type: ClientMessage.REMATCH, matchId });
        const third = await b.next(ServerMessage.INVITE);
        b.send({ type: ClientMessage.INVITE_ACCEPT, inviteId: third.invite.id });
        const [ma, mb] = await Promise.all([a.next(ServerMessage.MATCH), b.next(ServerMessage.MATCH)]);
        expect(ma.matchId).toBe(mb.matchId);
        expect(ma.matchId).not.toBe(matchId);
        expect(ma.kind).toBe('challenge');
        expect(room(env, ma.matchId).match.board.size).toEqual({ rows: 10, cols: 10 });
    });

    test('rematch only after a finished challenge, and only with the opponent still there', async () => {
        const env = await start();
        const queued = await queueMatch(env);
        expect((await queued.a.act(queued.matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await queued.a.next(ServerMessage.RESULT);
        queued.a.send({ type: ClientMessage.REMATCH, matchId: queued.matchId });
        expect((await queued.a.next(ServerMessage.ERROR)).code).toBe(LiveError.UNKNOWN_MATCH);

        const { a, b, matchId } = await challengeMatch(env);
        expect((await a.act(matchId, MatchActionTypes.surrender, {})).ok).toBe(true);
        await Promise.all([a, b].map(client => client.next(ServerMessage.RESULT)));
        b.close();
        await gone(env, b);
        a.send({ type: ClientMessage.REMATCH, matchId });
        expect((await a.next(ServerMessage.ERROR)).code).toBe(LiveError.PLAYER_OFFLINE);
    });

    test('views are compressed for clients that take the extension; small messages and other clients get plain text', async () => {
        // no heartbeat ping while the bytes are counted
        const env = await start({ config: { pingIntervalMs: 60000 } });
        const a = await player(env);
        const b = await connect(env, (await account(env)).accessToken, { wsOptions: { perMessageDeflate: false } });
        a.send({ type: ClientMessage.QUEUE_JOIN });
        await a.next(ServerMessage.QUEUED);
        b.send({ type: ClientMessage.QUEUE_JOIN });
        const [{ matchId }] = await Promise.all([a.next(ServerMessage.MATCH), b.next(ServerMessage.MATCH)]);
        await Promise.all([a, b].map(client => client.next(ServerMessage.VIEW)));
        expect(a.ws.extensions).toBe('permessage-deflate');
        expect(b.ws.extensions).toBe('');
        // what the server answers a client that offers the extension: each message is compressed on
        // its own, in both directions, so no compression state stays with a socket
        const agreed = await new Promise((resolve, reject) => {
            const ws = new WebSocket(env.url);
            ws.on('upgrade', response => resolve(response.headers['sec-websocket-extensions']));
            ws.on('error', reject);
            ws.on('open', () => ws.terminate());
        });
        expect(agreed).toBe('permessage-deflate; server_no_context_takeover; client_no_context_takeover');

        // the bytes each client's socket reads for one message of the server (the match is quiet:
        // nothing else is on its way)
        const received = async (clients, type, trigger) => {
            const before = clients.map(client => client.ws._socket.bytesRead);
            trigger();
            const messages = await Promise.all(clients.map(client => client.next(type)));
            return clients.map((client, i) => ({
                bytes: client.ws._socket.bytesRead - before[i],
                json: Buffer.byteLength(JSON.stringify(messages[i])),
            }));
        };
        const [compressed, plain] = await received([a, b], ServerMessage.VIEW, () => room(env, matchId).publish());
        expect(compressed.json).toBeGreaterThan(10000);
        // a frame is its payload plus a header of 4 bytes (up to 64 KB)
        expect(plain.bytes).toBe(plain.json + 4);
        expect(compressed.bytes).toBeLessThan(compressed.json / 5);

        // under the threshold a message is not worth compressing
        const [pong] = await received([a], ServerMessage.PONG, () => a.send({ type: ClientMessage.PING, id: 1, clientT: 1 }));
        expect(pong.bytes).toBe(pong.json + 2);
    });

    test('a client that falls far behind is dropped; it comes back and gets every event it missed', async () => {
        const env = await start({ config: { pingIntervalMs: 30, maxBufferedBytes: 64 * 1024 } });
        const match = await queueMatch(env);
        const { a, b, matchId } = match;
        const r = room(env, matchId);
        const lastSeq = events => (events.length > 0 ? events[events.length - 1].seq : -1);
        const seen = Math.max(-1, ...a.buffer.filter(message => message.type === ServerMessage.VIEW).map(message => lastSeq(message.view.events)),
            lastSeq(a.view(matchId).events));

        // a's phone still talks but takes nothing in any more
        a.ws._socket.pause();
        const chooser = r.match.fieldChooser === a.index ? a : b;
        chooser.send({ type: ClientMessage.INTENT, matchId, uid: 'choose', action: { type: MatchActionTypes.chooseField, payload: { fieldIndex: 0 } } });
        await nextView(b, matchId, view => view.players[b.index].fieldIndex !== null);
        // the server keeps writing to a (more than any socket buffer of the system holds)
        const connection = env.live.lobby.connections.get(a.account.playerId);
        const filler = require('crypto').randomBytes(192 * 1024).toString('base64');
        for (let i = 0; i < 200 && env.live.lobby.connections.get(a.account.playerId) === connection; i++) {
            connection.send({ type: 'filler', filler });
            // the heartbeat, which looks at what is unsent, gets its turn between the writes
            await sleep(5);
        }
        expect(env.live.lobby.connections.has(a.account.playerId)).toBe(false);
        // b is not touched, and a's place in the match waits for them
        expect(env.live.lobby.connections.has(b.account.playerId)).toBe(true);
        expect(r.forfeitAt[a.index]).not.toBeNull();

        const back = await connect(env, a.account.accessToken);
        expect(back.welcome.activeMatch).toEqual({ matchId });
        back.send({ type: ClientMessage.MATCH_JOIN, matchId, lastSeq: seen });
        const { view } = await back.next(ServerMessage.VIEW);
        expect(view.players[a.index].fieldIndex).not.toBeNull();
        // the events since the last one a had seen, without a gap
        expect(view.events.length).toBeGreaterThan(0);
        expect(view.events.map(event => event.seq)).toEqual(view.events.map((event, i) => seen + 1 + i));
    }, 20000);

    test('a match that cannot be replayed is marked as failed once and left alone on the next start', async () => {
        const env = await start();
        const { a, matchId } = await queueMatch(env);
        const before = room(env, matchId);
        await before.writes;
        // an action in the log that the engine refuses, as after a change of the rules
        await env.pool.query('INSERT INTO match_actions (match_id, seq, t, action) VALUES ($1, $2, 0, $3)',
            [matchId, before.seq + 1, JSON.stringify({ type: 'MatchActionTypes.nope', player: 0, t: 0, payload: {} })]);
        // crash: timers stop, nothing is saved anymore
        env.clock.timers.clear();
        env.clients.forEach(client => client.terminate());

        const errors = [];
        const restarted = await start({ pool: env.pool, log: { ...silentLog, error: (...args) => errors.push(args) } });
        expect(await restarted.live.recover()).toBe(0);
        expect(room(restarted, matchId)).toBeUndefined();
        const stored = async () => (await env.pool.query('SELECT status, ended_at, recovery_error FROM matches WHERE id = $1', [matchId])).rows[0];
        expect(await stored()).toMatchObject({ status: 'failed', ended_at: expect.any(Date), recovery_error: expect.stringMatching(/^replay of match/) });
        expect(errors).toHaveLength(1);

        // the start after that does not try it again
        const later = await start({ pool: env.pool, log: { ...silentLog, error: (...args) => errors.push(args) } });
        expect(await later.live.recover()).toBe(0);
        expect(errors).toHaveLength(1);
        // its players are free for a new match
        const back = await connect(later, a.account.accessToken);
        expect(back.welcome.activeMatch).toBeNull();
        back.send({ type: ClientMessage.QUEUE_JOIN });
        await back.next(ServerMessage.QUEUED);
    });

    test('a match whose log cannot be read stays running and is recovered by a later start', async () => {
        const env = await start();
        const { matchId } = await queueMatch(env);
        await room(env, matchId).writes;
        env.clock.timers.clear();
        env.clients.forEach(client => client.terminate());

        // the database fails while the actions are loaded: nothing says that the match is broken
        const unlucky = await start({ pool: failingOn(env.pool, /FROM match_actions/) });
        expect(await unlucky.live.recover()).toBe(0);
        expect((await env.pool.query('SELECT status FROM matches WHERE id = $1', [matchId])).rows[0].status).toBe('running');

        const restarted = await start({ pool: env.pool });
        expect(await restarted.live.recover()).toBe(1);
        expect(room(restarted, matchId).match.phase).toBe(MatchPhase.FIELD_CHOICE);
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
