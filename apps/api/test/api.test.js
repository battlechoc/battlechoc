const request = require('supertest');
const pantry = require('../src/pantry');
const players = require('../src/players');
const { createPush } = require('../src/push');
const { closeTestPools } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');

afterAll(closeTestPools);

const setup = options => createTestApp({ corsOrigins: ['https://battlechoc.com'], ...options });
const account = app => createAccount(app);
const named = (app, username) => createAccount(app, { username });

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
        // levels were replaced by equipment
        expect(body.stats).not.toHaveProperty('level');
        expect(body.stats).toMatchObject({ items: [], equipment: {}, loadout: {} });
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
        const { app } = await setup({ accountsPerMinute: 2 });
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
        expect(finished.body.stats).toMatchObject({ tutorialFinished: true, xp: 100, score: 100, coins: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 } });
        const again = await player.post('/user/tutorial/finished');
        expect(again.body.stats).toMatchObject({ xp: 100, pantry: { COCOA: 100 } });
    });

    test('the tutorial reward is paid once when several requests arrive together', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        // the game reports the finished tutorial and syncs the offline profile at the same time
        const responses = await Promise.all([
            player.post('/user/tutorial/finished'),
            player.post('/user/merge', { playerInfo: { tutorialFinished: true } }),
            player.post('/user/tutorial/finished'),
            player.post('/user/merge', { playerInfo: { tutorialFinished: true } }),
        ]);
        responses.forEach(response => expect(response.status).toBe(200));
        const { stats } = (await player.get('/user').expect(200)).body;
        expect(stats).toMatchObject({ tutorialFinished: true, xp: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 } });

        const other = await account(app);
        await Promise.all(Array.from({ length: 8 }, () => players.finishTutorial(pool, other.playerId)));
        expect((await other.get('/user').expect(200)).body.stats).toMatchObject({
            tutorialStarted: true, tutorialSkipped: false, tutorialFinished: true, xp: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 },
        });
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
        // the claimed coins and score count for nothing; the tutorial finished on the device brings
        // its reward (100 XP and the starter kit), the record its XP
        expect(merged.body.mergedPlayerInfo).toMatchObject({
            username: 'OfflineHero', xp: 125, coins: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 }, tutorialFinished: true,
        });
        const again = await player.post('/user/merge', { playerInfo }).expect(200);
        expect(again.body.mergedPlayerInfo).toMatchObject({ xp: 125, coins: 100 });
    });

    test('the stats list the pantry totals and the spoiling batches', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        await pantry.add(pool, player.playerId, [{ ingredient: 'VANILLA', amount: 2 }, { ingredient: 'SUGAR', amount: 4 }], Date.now());
        const { stats } = (await player.get('/user').expect(200)).body;
        expect(stats.pantry).toEqual({ VANILLA: 2, SUGAR: 4 });
        expect(stats.spoiling).toEqual([expect.objectContaining({ ingredient: 'VANILLA', amount: 2 })]);
    });

    test('language and reports', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        expect((await player.post('/user/language', { language: 'de' }).expect(200)).body.language).toBe('de');
        // a device that still holds the old country code, and a browser tag with a region
        expect((await player.post('/user/language', { language: 'jp' }).expect(200)).body.language).toBe('ja');
        expect((await player.post('/user/language', { language: 'vi-VN' }).expect(200)).body.language).toBe('vi');
        expect((await pool.query('SELECT language FROM players')).rows.map(row => row.language)).toEqual(['vi']);
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
        expect(friends.body).toEqual([expect.objectContaining({ name: 'Gustav', score: 0 })]);
        expect(friends.body[0]).not.toHaveProperty('level');
        await me.del('/user/friend', { friend: 'Gustav' }).expect(200);
        expect((await me.get('/user/friends')).body).toEqual([]);
    });

    test('ranks and highscore: rated players by rating, then the unrated ones; lookups by name', async () => {
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
        // an unrated player shows 0 and comes after every rated one
        expect((await accounts[0].get('/rank')).body).toEqual({ ranking: 4 });
        const highscore = await accounts[0].get('/highscore').expect(200);
        expect(highscore.body).toMatchObject({ page: 1, lastPage: 1, total: 4 });
        // the own entry of an unrated player: name, rank and score 0, never the XP
        expect(highscore.body.own).toMatchObject({ name: 'Anna', ranking: 4, score: 0 });
        expect(highscore.body.own).not.toHaveProperty('xp');
        expect((await accounts[1].get('/highscore')).body.own).toMatchObject({ name: 'Bert', ranking: 3, rating: 1550 });
        expect(highscore.body.list.map(entry => [entry.name, entry.ranking, entry.rating])).toEqual([
            ['Dora', 1, 1700], ['Cleo', 2, 1600], ['Bert', 3, 1550], ['Anna', 4, 1500],
        ]);
        // the public score is the rating (XP can be faked offline); unrated players show 0
        expect((await accounts[0].get('/user/cleo').expect(200)).body[0]).toMatchObject({ name: 'Cleo', score: 1600, rating: 1600, ranking: 2 });
        expect((await accounts[3].get('/user/anna').expect(200)).body[0]).toMatchObject({ name: 'Anna', score: 0, ranking: 4 });
        highscore.body.list.slice(0, 3).forEach(entry => expect(entry.score).toBe(entry.rating));
        await accounts[0].get('/user/nobody').expect(404);
    });

    test('the only player is first; unnamed players are not listed and have no rank', async () => {
        const { app } = await setup();
        const anna = await named(app, 'Anna');
        const highscore = await anna.get('/highscore').expect(200);
        expect(highscore.body).toMatchObject({ page: 1, lastPage: 1, total: 1 });
        expect(highscore.body.list.map(entry => [entry.name, entry.ranking, entry.score])).toEqual([['Anna', 1, 0]]);
        expect(highscore.body.own).toMatchObject({ name: 'Anna', ranking: 1 });
        // a later page of an empty list is still page 1
        expect((await anna.get('/highscore?page=3')).body.page).toBe(1);

        const unnamed = await account(app);
        expect((await unnamed.get('/highscore').expect(200)).body).toMatchObject({ total: 1, own: null });
        expect((await unnamed.get('/rank').expect(200)).body).toEqual({ ranking: null });
    });

    test('players with the same score are ranked by who joined first', async () => {
        const { app, pool } = await setup();
        const accounts = [];
        for (const [index, name] of ['Emil', 'Fritz', 'Greta'].entries()) {
            const player = await named(app, name);
            // Fritz joined first, then Greta, then Emil
            await pool.query('UPDATE players SET created_at = $1 WHERE id = $2', [new Date(Date.UTC(2026, 0, [3, 1, 2][index])), player.playerId]);
            accounts.push(player);
        }
        const highscore = await accounts[0].get('/highscore').expect(200);
        expect(highscore.body.list.map(entry => [entry.name, entry.ranking])).toEqual([['Fritz', 1], ['Greta', 2], ['Emil', 3]]);
        expect((await accounts[0].get('/rank')).body).toEqual({ ranking: 3 });
        expect((await accounts[1].get('/rank')).body).toEqual({ ranking: 1 });
    });

    test('a rated player without a name is not on the list and has no rank', async () => {
        const { app, pool } = await setup();
        const unnamed = await account(app);
        await pool.query('UPDATE players SET rating = 1800, rated_matches = 2 WHERE id = $1', [unnamed.playerId]);
        expect((await unnamed.get('/rank')).body).toEqual({ ranking: null });
        expect((await unnamed.get('/highscore')).body).toMatchObject({ total: 0, list: [], own: null });
    });
});

describe('web push and transport', () => {
    test('subscriptions are stored per player and receive notifications', async () => {
        const { app, push, sent } = await setup();
        const player = await account(app);
        expect((await request(app).get('/push/key')).body.publicKey).toBe('public');
        const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'key', auth: 'secret' } };
        await player.post('/push/subscription', { subscription }).expect(201);
        await player.post('/push/subscription', { subscription: { endpoint: 'x' } }).expect(400);
        expect(await push.sendToPlayer(player.playerId, { title: 'Invite' })).toBe(1);
        expect(sent).toEqual([{ subscription, payload: JSON.stringify({ title: 'Invite' }) }]);
        await player.del('/push/subscription', { endpoint: subscription.endpoint }).expect(200);
        expect(await push.sendToPlayer(player.playerId, { title: 'Invite' })).toBe(0);
    });

    test('gone subscriptions are removed', async () => {
        const { app, pool } = await setup();
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

describe('play page', () => {
    // the preview page behind play.battlechoc.com/<code> (nginx rewrites it to /play/<code>)
    const playApp = async (challengeInfo = () => null) => {
        return (await setup({ challengeInfo })).app;
    };
    const meta = (html, property) => {
        const match = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`));
        return match ? match[1] : null;
    };

    test('a waiting challenge names the challenger in their language and sends browsers on to the game', async () => {
        const app = await playApp(code => (code === 'K7Q2M9XD' ? { from: 'Anna', language: 'de' } : null));
        const response = await request(app).get('/play/k7q2-m9xd').expect(200);
        expect(response.type).toBe('text/html');
        expect(meta(response.text, 'og:title')).toBe('Anna fordert dich zu battlechoc heraus!');
        expect(meta(response.text, 'og:url')).toBe('https://play.battlechoc.com/K7Q2-M9XD');
        expect(meta(response.text, 'og:image')).toBe('https://battlechoc.com/images/challenge-preview.jpg');
        expect(meta(response.text, 'og:description')).toMatch(/Schokoladenschlacht/);
        expect(response.text).toContain('location.replace("https://battlechoc.com/?challenge=K7Q2-M9XD")');
        expect(response.text).toContain('href="https://battlechoc.com/?challenge=K7Q2-M9XD"');
    });

    test('a challenger with the old Japanese code gets a Japanese page', async () => {
        const app = await playApp(() => ({ from: 'Yuki', language: 'jp' }));
        const response = await request(app).get('/play/k7q2-m9xd').expect(200);
        expect(response.text).toContain('<html lang="ja">');
        expect(meta(response.text, 'og:title')).toContain('Yuki');
        expect(meta(response.text, 'og:title')).not.toContain('challenges');
    });

    test('an unknown or missing code gets the general preview and the plain game link', async () => {
        const app = await playApp();
        for (const path of ['/play/nope', '/play/', '/play/ZZZZZZZZ']) {
            const response = await request(app).get(path).expect(200);
            expect(meta(response.text, 'og:title')).toBe('battlechoc');
            expect(meta(response.text, 'og:description')).toMatch(/real-time chocolate battle/);
        }
        const invalid = await request(app).get('/play/nope');
        expect(invalid.text).toContain('href="https://battlechoc.com/"');
        const unknown = await request(app).get('/play/ZZZZZZZZ');
        // a valid code that ended still opens the game, which shows the ended card
        expect(unknown.text).toContain('location.replace("https://battlechoc.com/?challenge=ZZZZ-ZZZZ")');
    });

    test('the name is escaped in the page', async () => {
        const app = await playApp(() => ({ from: 'Eve<script>"', language: 'en' }));
        const response = await request(app).get('/play/K7Q2M9XD').expect(200);
        expect(response.text).not.toContain('Eve<script>');
        expect(meta(response.text, 'og:title')).toBe('Eve&lt;script&gt;&quot; challenges you to battlechoc!');
    });

    test('the page is rate limited', async () => {
        const app = await playApp();
        for (let i = 0; i < 60; i++) {
            await request(app).get('/play/K7Q2M9XD').expect(200);
        }
        await request(app).get('/play/K7Q2M9XD').expect(429);
    });
});

describe('the tutorial and the AI ladder from the device', () => {
    test('a tutorial finished without the server brings the starter kit when the device syncs, once', async () => {
        const { app } = await setup();
        const player = await account(app);
        const merged = (await player.post('/user/merge', { playerInfo: { tutorialFinished: true } }).expect(200)).body.mergedPlayerInfo;
        expect(merged).toMatchObject({ tutorialFinished: true, xp: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 } });
        await player.post('/user/merge', { playerInfo: { tutorialFinished: true } }).expect(200);
        const finished = (await player.post('/user/tutorial/finished').expect(200)).body.stats;
        expect(finished).toMatchObject({ xp: 100, pantry: { COCOA: 100, RUM: 1, SUGAR: 2, MILK: 2 } });
    });

    test('matches against the AI played without the server move the ladder too', async () => {
        const { app } = await setup();
        const player = await account(app);
        expect((await player.get('/user').expect(200)).body.stats.aiLadder).toEqual({ step: 1, wins: 0, floor: 1, games: 0 });
        const win = i => ({ id: `w${i}`, won: true, winners: [{ idx: 0 }], awards: [] });
        const loss = i => ({ id: `l${i}`, lost: true, winners: [{ idx: 1 }], awards: [] });
        await player.post('/user/trackrecords', { stats: [win(1), win(2), win(3), win(4)] }).expect(200);
        expect((await player.get('/user').expect(200)).body.stats.aiLadder).toMatchObject({ step: 3, wins: 0, games: 4 });
        // the same records again change nothing
        await player.post('/user/trackrecords', { stats: [win(1), win(2)] }).expect(200);
        await player.post('/user/trackrecords', { stats: [loss(1)] }).expect(200);
        expect((await player.get('/user').expect(200)).body.stats.aiLadder).toMatchObject({ step: 2, games: 5 });
    });
});
