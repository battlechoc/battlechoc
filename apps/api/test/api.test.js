const request = require('supertest');
const { EntityType } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../src/pantry');
const { createApp } = require('../src/app');
const { createAuth } = require('../src/auth');
const { createPush } = require('../src/push');
const { createTestPool, closeTestPools, JWT_SECRET } = require('./helper');

afterAll(closeTestPools);

const setup = async ({ now } = {}) => {
    const pool = await createTestPool();
    const auth = createAuth({ pool, secret: JWT_SECRET, ...(now ? { now } : {}) });
    const sent = [];
    const push = createPush({
        pool,
        publicKey: 'public',
        privateKey: 'private',
        sender: { setVapidDetails: () => {}, sendNotification: async (subscription, payload) => { sent.push({ subscription, payload }); } },
    });
    const app = createApp({ pool, auth, push, corsOrigins: ['https://battlechoc.com'], accountsPerMinute: 1000 });
    return { app, pool, sent };
};

// creates a device account and returns helpers bound to its access token
const account = async app => {
    const created = await request(app).post('/accounts').expect(201);
    const bearer = `Bearer ${created.body.accessToken}`;
    return {
        ...created.body,
        get: path => request(app).get(path).set('Authorization', bearer),
        post: (path, body = {}) => request(app).post(path).set('Authorization', bearer).send(body),
        del: (path, body = {}) => request(app).delete(path).set('Authorization', bearer).send(body),
    };
};

const named = async (app, username) => {
    const player = await account(app);
    await player.post('/user/username', { username }).expect(200);
    return player;
};

const winRecord = (id, awards = [{ key: 'WINNER', xp: 9999 }]) => ({
    id, won: true, lost: false, builtEntities: 4, attacks: 3, espionages: 0, moltenFields: 0,
    winners: [{ id: 'p', name: 'Carolin Cacao', type: 'PlayerType.HUMAN', idx: 0 }], awards,
});

describe('accounts', () => {
    test('a device account gets tokens and empty stats', async () => {
        const { app } = await setup();
        const player = await account(app);
        expect(player.refreshToken.length).toBeGreaterThan(30);
        const { body } = await player.get('/user').expect(200);
        expect(body.stats).toMatchObject({ id: player.playerId, username: 'Chocnonymous', coins: 0, score: 0, winnings: 0, drawn: 0, losses: 0 });
        expect(body.stats.level[EntityType.FACTORY]).toBe(0);
    });

    test('a refresh token yields a new access token; unknown tokens are rejected', async () => {
        const { app } = await setup();
        const player = await account(app);
        const refreshed = await request(app).post('/accounts/token').send({ refreshToken: player.refreshToken }).expect(200);
        expect(refreshed.body.playerId).toBe(player.playerId);
        await request(app).get('/user').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(200);
        await request(app).post('/accounts/token').send({ refreshToken: 'x'.repeat(40) }).expect(401);
    });

    test('requests without, with forged or with expired tokens are rejected', async () => {
        let time = Date.now();
        const { app } = await setup({ now: () => time });
        const player = await account(app);
        await request(app).get('/user').expect(401);
        await request(app).get('/user').set('Authorization', `Bearer ${player.accessToken.slice(0, -4)}abcd`).expect(401);
        time += 16 * 60 * 1000;
        await player.get('/user').expect(401);
    });

    test('creating accounts is rate limited', async () => {
        const pool = await createTestPool();
        const app = createApp({ pool, auth: createAuth({ pool, secret: JWT_SECRET }), push: createPush({ pool }), accountsPerMinute: 2 });
        await request(app).post('/accounts').expect(201);
        await request(app).post('/accounts').expect(201);
        await request(app).post('/accounts').expect(429);
    });
});

describe('names', () => {
    test('usernames are validated and unique regardless of case', async () => {
        const { app } = await setup();
        const first = await account(app);
        const second = await account(app);
        await first.post('/user/username', { username: 'x' }).expect(400);
        await first.post('/user/username', { username: 'chocnonymous' }).expect(400);
        await first.post('/user/username', { username: 'Carolin' }).expect(200);
        await second.post('/user/username', { username: 'CAROLIN' }).expect(400);
        expect((await second.get('/check/available/carolin')).body.available).toBe(false);
        expect((await second.get('/check/available/Mimi')).body.available).toBe(true);
        expect((await first.get('/user')).body.stats.username).toBe('Carolin');
    });

    test('random names are valid and free', async () => {
        const { app } = await setup();
        const player = await account(app);
        const { body } = await player.get('/generaterandomname').expect(200);
        expect(body.username).toMatch(/^[a-zA-Z][a-zA-Z0-9_]{2,24}$/);
    });
});

describe('progress', () => {
    test('finishing the tutorial gives 100 xp and 100 cocoa once and returns the updated stats', async () => {
        const { app } = await setup();
        const player = await account(app);
        expect((await player.post('/user/tutorial/started')).body.stats.tutorialStarted).toBe(true);
        const finished = await player.post('/user/tutorial/finished').expect(200);
        expect(finished.body.stats).toMatchObject({ tutorialFinished: true, xp: 100, score: 100, coins: 100, pantry: { COCOA: 100, RUM: 4, SUGAR: 4, MILK: 2 } });
        const again = await player.post('/user/tutorial/finished');
        expect(again.body.stats).toMatchObject({ xp: 100, pantry: { COCOA: 100 } });
    });

    test('offline match records credit server-computed xp once per record, never ingredients', async () => {
        const { app } = await setup();
        const player = await account(app);
        const win = winRecord('match-1', [{ key: 'WINNER', xp: 9999 }, { key: 'GREENSPOT' }, 'SETTLER', { key: 'UNKNOWN' }]);
        const first = await player.post('/user/trackrecords', { stats: [win] }).expect(200);
        // WINNER 25 + GREENSPOT 20 + SETTLER 50, the client's xp values are ignored
        expect(first.body.stats).toMatchObject({ xp: 95, score: 95, winnings: 1, pantry: {} });
        const again = await player.post('/user/trackrecords', { stats: [win] }).expect(200);
        expect(again.body.stats.xp).toBe(95);
        // losers get half (NERD 50 → 25), a draw counts like a win
        const loss = { id: 'match-2', won: false, lost: true, winners: [{ id: 'ai' }], awards: ['NERD'] };
        const draw = { id: 'match-3', won: false, lost: false, builtEntities: 3, winners: [{ id: 'a' }, { id: 'b' }], awards: ['WINNER'] };
        const after = await player.post('/user/trackrecords', { stats: [loss, draw] }).expect(200);
        expect(after.body.stats).toMatchObject({ xp: 95 + 25 + 25, losses: 1, drawn: 1, winnings: 1, pantry: {} });
        await player.post('/user/trackrecords', {}).expect(400);
    });

    test('an offline profile is imported once without trusting its coins', async () => {
        const { app } = await setup();
        const player = await account(app);
        const playerInfo = {
            username: 'OfflineHero', coins: 99999, score: 99999, tutorialFinished: true,
            trackRecord: [winRecord('offline-1')],
        };
        const merged = await player.post('/user/merge', { playerInfo }).expect(200);
        expect(merged.body.mergedPlayerInfo).toMatchObject({ username: 'OfflineHero', xp: 25, coins: 0, pantry: {}, tutorialFinished: true });
        const again = await player.post('/user/merge', { playerInfo }).expect(200);
        expect(again.body.mergedPlayerInfo.xp).toBe(25);
    });

    test('the pantry endpoint lists totals and spoiling batches', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        await pantry.add(pool, player.playerId, [{ ingredient: 'VANILLA', amount: 2 }, { ingredient: 'SUGAR', amount: 4 }], Date.now());
        const response = await player.get('/user/pantry').expect(200);
        expect(response.body.pantry).toEqual({ VANILLA: 2, SUGAR: 4 });
        expect(response.body.spoiling).toEqual([expect.objectContaining({ ingredient: 'VANILLA', amount: 2 })]);
    });

    test('language and reports', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        expect((await player.post('/user/language', { language: 'de' }).expect(200)).body.language).toBe('de');
        await player.post('/user/language', { language: 'xx' }).expect(400);
        await player.post('/debugging/gamestate', { report: { message: 'hi', reported: Date.now() } }).expect(201);
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM reports')).rows[0].n)).toBe(1);
    });
});

describe('players', () => {
    test('friends are added by name, listed with infos and removed', async () => {
        const { app } = await setup();
        const me = await named(app, 'Carolin');
        await named(app, 'Gustav');
        await me.post('/user/friend', { friend: 'gustav' }).expect(200);
        await me.post('/user/friend', { friend: 'Gustav' }).expect(200);
        await me.post('/user/friend', { friend: 'Carolin' }).expect(404);
        await me.post('/user/friend', { friend: 'Nobody' }).expect(404);
        const friends = await me.get('/user/friends').expect(200);
        expect(friends.body).toEqual([expect.objectContaining({ name: 'Gustav', score: 0, level: 0 })]);
        await me.del('/user/friend', { friend: 'Gustav' }).expect(200);
        expect((await me.get('/user/friends')).body).toEqual([]);
    });

    test('ranks and highscore come from the rating of rated players; lookups and random opponents', async () => {
        const { app, pool } = await setup();
        const names = ['Anna', 'Bert', 'Cleo', 'Dora'];
        // Anna never played a rated match; the others did
        const ratings = [null, 1550, 1600, 1700];
        const accounts = [];
        for (const [index, name] of names.entries()) {
            const player = await named(app, name);
            await pool.query('UPDATE players SET xp = $1 WHERE id = $2', [(index + 1) * 100, player.playerId]);
            if (ratings[index] !== null) {
                await pool.query('UPDATE players SET rating = $1, rated_matches = 1 WHERE id = $2', [ratings[index], player.playerId]);
            }
            accounts.push(player);
        }
        expect((await accounts[3].get('/rank')).body.ranking).toBe(1);
        expect((await accounts[1].get('/rank')).body.ranking).toBe(3);
        const highscore = await accounts[0].get('/highscore').expect(200);
        expect(highscore.body).toMatchObject({ page: 1, lastPage: 1 });
        expect(highscore.body.list.map(entry => [entry.name, entry.ranking, entry.rating])).toEqual([
            ['Dora', 1, 1700], ['Cleo', 2, 1600], ['Bert', 3, 1550],
        ]);
        // the public score is the rating (XP can be faked offline); unrated players show 0
        expect((await accounts[0].get('/user/cleo').expect(200)).body[0]).toMatchObject({ name: 'Cleo', score: 1600, rating: 1600, ranking: 2 });
        expect((await accounts[3].get('/user/anna').expect(200)).body[0]).toMatchObject({ name: 'Anna', score: 0 });
        highscore.body.list.forEach(entry => expect(entry.score).toBe(entry.rating));
        await accounts[0].get('/user/nobody').expect(404);
        expect((await accounts[0].get('/query/user/e')).body.map(entry => entry.name)).toEqual(['Cleo', 'Bert']);
        const opponent = await accounts[0].get('/random/opponent').expect(200);
        expect(['Bert', 'Cleo', 'Dora']).toContain(opponent.body.name);
    });
});

describe('web push and transport', () => {
    test('subscriptions are stored per player and receive notifications', async () => {
        const { app, pool, sent } = await setup();
        const player = await account(app);
        expect((await request(app).get('/push/key')).body.publicKey).toBe('public');
        const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'key', auth: 'secret' } };
        await player.post('/push/subscription', { subscription }).expect(201);
        await player.post('/push/subscription', { subscription: { endpoint: 'x' } }).expect(400);
        const push = createPush({ pool, publicKey: 'p', privateKey: 'q', sender: { setVapidDetails: () => {}, sendNotification: async (...args) => sent.push(args) } });
        expect(await push.sendToPlayer(player.playerId, { title: 'Invite' })).toBe(1);
        await player.del('/push/subscription', { endpoint: subscription.endpoint }).expect(200);
        expect(await push.sendToPlayer(player.playerId, { title: 'Invite' })).toBe(0);
    });

    test('gone subscriptions are removed', async () => {
        const pool = await createTestPool();
        const app = createApp({ pool, auth: createAuth({ pool, secret: JWT_SECRET }), push: createPush({ pool }) });
        const player = await account(app);
        const gone = createPush({ pool, publicKey: 'p', privateKey: 'q', sender: { setVapidDetails: () => {}, sendNotification: async () => { const error = new Error('gone'); error.statusCode = 410; throw error; } } });
        await gone.subscribe(player.playerId, { endpoint: 'https://push.example/gone', keys: { p256dh: 'a', auth: 'b' } });
        expect(await gone.sendToPlayer(player.playerId, {})).toBe(0);
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM push_subscriptions')).rows[0].n)).toBe(0);
    });

    test('CORS answers the PWA origin only', async () => {
        const { app } = await setup();
        const preflight = await request(app).options('/user').set('Origin', 'https://battlechoc.com').expect(204);
        expect(preflight.headers['access-control-allow-origin']).toBe('https://battlechoc.com');
        expect(preflight.headers['access-control-allow-headers']).toContain('battlechoc-pwa-version');
        const foreign = await request(app).options('/user').set('Origin', 'https://evil.example');
        expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
});
