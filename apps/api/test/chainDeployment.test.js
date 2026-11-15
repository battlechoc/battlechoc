// The fixture deployment on the chain double (helpers/chainDeployment.js), which the API tests'
// chainApp.js and the browser tests' API (e2eServer.js) share: the matches it credits are the
// lobby's for won matches against the server AI, and its config is found on the double, changed
// and put back from what the double holds, also after a rollback.

const { Data } = require('@evolution-sdk/evolution');
const { chain: rules, engine, live } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_POLICY_ID } = require('./chainDouble');
const { createDeployedChain, creditMatches } = require('./helpers/chainDeployment');
const { start, stopAll, player, room } = require('./helpers/live');
const pantry = require('../src/pantry');
const { fixtureContracts, fixtureKey } = require('./helpers/chain');
const { createTestApp, createAccount } = require('./helpers/api');
const request = require('supertest');
const { closeTestPools } = require('./helpers/db');
const { matchesOf } = require('../src/chain/readiness');

const { ClientMessage, ServerMessage } = live;

afterAll(closeTestPools);

describe('creditMatches', () => {
    afterEach(stopAll);

    // what the database holds of a player, without what names the player or a moment
    const rowOf = async (pool, playerId) => {
        const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
        const { id, username, username_lower: lower, created_at: created, last_seen_at: seen, ...rest } = rows[0];
        expect([id, username, lower, created, seen].every(value => value !== undefined)).toBe(true);
        return { ...rest, ai_ladder: typeof rest.ai_ladder === 'string' ? JSON.parse(rest.ai_ladder) : rest.ai_ladder };
    };
    // its track records: the record without the match's id (the room's id, or creditMatches' own)
    // and the row without its id and time (the lobby's ManualClock against creditMatches' now)
    const recordsOf = async (pool, playerId) => {
        const { rows } = await pool.query('SELECT record, result, coins, xp, verified FROM track_records WHERE player_id = $1', [playerId]);
        // in a fixed order (the database's is none)
        return rows
            .map(row => {
                const { id, ...record } = typeof row.record === 'string' ? JSON.parse(row.record) : row.record;
                expect(id).toEqual(expect.any(String));
                return { ...row, xp: Number(row.xp), record };
            })
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    };
    // its drops without ids, the match's id and the time; and the pantry they filled
    const dropsOf = async (pool, playerId) => {
        const { rows } = await pool.query('SELECT ingredient, amount, achievement FROM drops WHERE player_id = $1 ORDER BY achievement, ingredient', [playerId]);
        return rows.map(row => ({ ...row, amount: Number(row.amount) }));
    };
    const pantryOf = (pool, playerId) => pantry.totals(pool, playerId, Date.now());

    // One verified win against the server AI through the live lobby (the prepared first game, the
    // AI gives up at once, as live.matches.test.js plays it) against creditMatches(1) for a player
    // in the same state: the same row, records, drops and pantry, field by field. What may differ
    // is named above (ids, names, times). The rating's AI is the room's (the ladder's first step,
    // Tom Toffee on the prepared board), which creditMatches takes from the same ladder.
    test('one credited match leaves the player as one real win against the server AI does', async () => {
        const random = () => 0.5;
        const env = await start({ random });
        const real = await player(env, { username: 'Real' });
        real.send({ type: ClientMessage.QUEUE_AI });
        const { matchId } = await real.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        const action = { type: engine.MatchActionTypes.surrender, player: 1, t: r.now(), payload: {} };
        expect(engine.applyAction(r.match, action).ok).toBe(true);
        r.record(action);
        r.afterChange();
        await real.next(ServerMessage.RESULT);
        await r.writes;

        const mirrored = await createAccount(env.app, { username: 'Mirrored' });
        await creditMatches(env.pool, mirrored.playerId, 1, { random });

        const realId = real.account.playerId;
        expect((await rowOf(env.pool, realId)).rated_matches).toBe(1);
        expect(await rowOf(env.pool, mirrored.playerId)).toEqual(await rowOf(env.pool, realId));
        const realRecords = await recordsOf(env.pool, realId);
        // the winner's name is the player's
        const named = records => records.map(row => ({ ...row, record: { ...row.record, winners: row.record.winners.map(({ name, ...winner }) => winner) } }));
        expect(realRecords[0].record.winners[0].name).toBe('Real');
        expect((await recordsOf(env.pool, mirrored.playerId))[0].record.winners[0].name).toBe('Mirrored');
        expect(named(await recordsOf(env.pool, mirrored.playerId))).toEqual(named(realRecords));
        expect(await dropsOf(env.pool, mirrored.playerId)).toEqual(await dropsOf(env.pool, realId));
        expect(await pantryOf(env.pool, mirrored.playerId)).toEqual(await pantryOf(env.pool, realId));
    });

    // labPlayer's set-up of the browser tests (apps/pwa/test/helpers/players.js): the tutorial
    // finished (100 XP) and four reported losses against Tom Toffee (they move the AI ladder)
    const asLabPlayer = async (env, account) => {
        const auth = { Authorization: `Bearer ${account.accessToken}` };
        await request(env.app).post('/user/tutorial/finished').set(auth).expect(200);
        const stats = [0, 1, 2, 3].map(i => ({ id: `seed-${account.playerId}-${i}`, lost: true, winners: [{ idx: 1, name: 'Tom Toffee' }], awards: [] }));
        await request(env.app).post('/user/trackrecords').set(auth).send({ stats }).expect(200);
    };

    // A browser test's minting player (labPlayer, then verifiedMatches): its ladder has games
    // already, so no credited match is the prepared first game. The lobby starts it in the field
    // choice, the AI gives up before it runs: no awards, no XP, not rated, the ladder one step.
    test('for a player who played the AI before, one credited match leaves the player as one real win does (not the prepared game: not run, not rated)', async () => {
        const random = () => 0.5;
        const env = await start({ random });
        const real = await player(env, { username: 'Real' });
        await asLabPlayer(env, real.account);
        const before = await rowOf(env.pool, real.account.playerId);
        expect(before.ai_ladder.games).toBe(4);
        real.send({ type: ClientMessage.QUEUE_AI });
        const { matchId } = await real.next(ServerMessage.MATCH);
        const r = room(env, matchId);
        expect(r.match.phase).toBe(engine.MatchPhase.FIELD_CHOICE);
        const action = { type: engine.MatchActionTypes.surrender, player: 1, t: r.now(), payload: {} };
        expect(engine.applyAction(r.match, action).ok).toBe(true);
        r.record(action);
        r.afterChange();
        await real.next(ServerMessage.RESULT);
        await r.writes;

        const mirrored = await createAccount(env.app, { username: 'Mirrored' });
        await asLabPlayer(env, mirrored);
        await creditMatches(env.pool, mirrored.playerId, 1, { random });

        const realId = real.account.playerId;
        const realRow = await rowOf(env.pool, realId);
        expect(realRow).toMatchObject({ xp: before.xp, rated_matches: 0, rating: before.rating });
        expect(await rowOf(env.pool, mirrored.playerId)).toEqual(realRow);
        const named = records => records.map(row => ({ ...row, record: { ...row.record, winners: row.record.winners.map(({ name, ...winner }) => winner) } }));
        // the four reported records and the verified one
        expect(named(await recordsOf(env.pool, mirrored.playerId))).toEqual(named(await recordsOf(env.pool, realId)));
        expect(await dropsOf(env.pool, mirrored.playerId)).toEqual(await dropsOf(env.pool, realId));
        expect(await pantryOf(env.pool, mirrored.playerId)).toEqual(await pantryOf(env.pool, realId));
    });

    test('a browser test\'s minting player after the gate\'s matches: 100 XP, no rating, 14 ladder games, the strong AI next', async () => {
        const env = await createTestApp();
        const ann = await createAccount(env.app, { username: 'Ann' });
        await asLabPlayer(env, ann);
        const count = rules.MINT_MIN_ONLINE_MATCHES;
        await creditMatches(env.pool, ann.playerId, count);
        expect(await matchesOf(env.pool, ann.playerId)).toBe(count);
        const row = await rowOf(env.pool, ann.playerId);
        expect(row).toMatchObject({ xp: 100, rating: 1500, rated_matches: 0, ai_ladder: { step: 6, wins: 0, floor: 4, games: 14 } });
        const verified = (await recordsOf(env.pool, ann.playerId)).filter(entry => entry.verified);
        expect(verified).toHaveLength(count);
        verified.forEach(entry => expect(entry).toMatchObject({ xp: 0, record: { awards: [] } }));
        // only the day's first verified match fills a fresh batch
        expect(await dropsOf(env.pool, ann.playerId)).toEqual([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]);
        // what Start Game then plays against: Gustav Ganache, handicap 2, on 10×10
        const next = engine.aiLadderSetup(row.ai_ladder);
        expect([next.opponent.agent.kind, next.opponent.agent.options.handicap, next.boardSize]).toEqual(['GustavGanache', 2, { rows: 10, cols: 10 }]);
        expect(next.scenario).toBeUndefined();
    });

    test('a fresh player: the first credited match is the prepared game (run, rated), the others are not', async () => {
        const env = await createTestApp();
        const ben = await createAccount(env.app, { username: 'Ben' });
        await creditMatches(env.pool, ben.playerId, rules.MINT_MIN_ONLINE_MATCHES);
        const row = await rowOf(env.pool, ben.playerId);
        expect(row).toMatchObject({ rated_matches: 1, ai_ladder: { step: 8, games: 11 } });
        expect(row.xp).toBe(1180);
        expect(row.rating).toBeGreaterThan(1500);
    });
});

describe('the config on the double', () => {
    const datumOf = settings => Data.toCBORHex(fixtureContracts(settings).configUtxo.datumOption.data);
    const deployed = options => createDeployedChain({ policyId: TEST_POLICY_ID, ...options });

    test('currentConfig reads the datum the double holds; restoreConfig puts the deployment\'s back with one block, and nothing when it is there', async () => {
        const deployment = deployed();
        expect(await deployment.currentConfig()).toEqual({ at: { txHash: deployment.configRef.split('#')[0], index: 0 }, datum: datumOf({}) });
        let blocks = deployment.double.blocks().length;
        expect(await deployment.restoreConfig()).toBe(false);
        expect(deployment.double.blocks()).toHaveLength(blocks);

        await deployment.setConfig({ paused: true, fees: [] });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ paused: true, fees: [] }));
        blocks = deployment.double.blocks().length;
        expect(await deployment.restoreConfig()).toBe(true);
        expect(deployment.double.blocks()).toHaveLength(blocks + 1);
        expect((await deployment.currentConfig()).datum).toBe(datumOf({}));
    });

    test('a change keeps the deployment\'s server keys unless it names others', async () => {
        const serverKeys = [fixtureKey('fresh server').keyHash];
        const deployment = deployed({ serverKeys });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ serverKeys }));
        await deployment.setConfig({ paused: true });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ serverKeys, paused: true }));
    });

    test('after a rollback that dropped config changes the double\'s config is found again, and put back', async () => {
        const deployment = deployed();
        await deployment.setConfig({ paused: true });
        await deployment.setConfig({ fees: [] });
        // the last change gone: the paused datum is back, at an output a helper that tracked its own changes would not know
        deployment.double.rollback(1, { drop: true });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ paused: true }));
        await deployment.setConfig({ fees: [] });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ fees: [] }));
        expect(await deployment.restoreConfig()).toBe(true);
        expect((await deployment.currentConfig()).datum).toBe(datumOf({}));
    });

    test('a rollback that dropped the first config block: no config, and restoreConfig places the deployment\'s again', async () => {
        const deployment = deployed();
        deployment.double.rollback(10, { drop: true });
        expect(await deployment.currentConfig()).toBeNull();
        await expect(deployment.setConfig({ paused: true })).rejects.toThrow(/no config/);
        expect(await deployment.restoreConfig()).toBe(true);
        expect((await deployment.currentConfig()).datum).toBe(datumOf({}));
        await deployment.setConfig({ paused: true });
        expect((await deployment.currentConfig()).datum).toBe(datumOf({ paused: true }));
    });
});
