// The response bodies of the read routes, pinned key by key: installed game clients read these
// shapes, so a change of the queries behind them must not change a byte of what they answer.

const crypto = require('crypto');
const { EntityType, Ingredients } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../src/pantry');
const { closeTestPools, counting } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');

afterAll(closeTestPools);

const DAY = 24 * 60 * 60 * 1000;

// the app on a pool that counts its statements
const setup = async () => {
    let counter;
    const { app, pool } = await createTestApp({
        wrapPool: plain => {
            const counted = counting(plain);
            ({ counter } = counted);
            return counted.pool;
        },
    });
    const account = username => createAccount(app, { username });
    // the statements one request runs
    const statementsOf = async send => {
        counter.statements = 0;
        const response = await send();
        return { response, statements: counter.statements };
    };
    const records = async (playerId, results) => {
        for (const result of results) {
            await pool.query('INSERT INTO track_records (id, player_id, record, result) VALUES ($1, $2, $3, $4)',
                [crypto.randomUUID(), playerId, '{}', result]);
        }
    };
    return { app, pool, account, statementsOf, records };
};

// twelve named players and one without a name; the list order is Ida, Dora, Cleo, Fritz, Bert,
// Lars, Greta, Jon (by rating; Cleo before Fritz because she joined first), then the unrated ones
// in the order they joined: Anna, Emil, Hans, Kira
const NAMES = ['Anna', 'Bert', 'Cleo', 'Dora', 'Emil', 'Fritz', 'Greta', 'Hans', 'Ida', 'Jon', 'Kira', 'Lars'];
const RATINGS = { Bert: 1550.4, Cleo: 1600, Dora: 1700, Fritz: 1600, Greta: 1420.5, Ida: 1810, Jon: 1300, Lars: 1550 };
const RECORDS = { Ida: ['won', 'won', 'won', 'lost'], Cleo: ['draw', 'lost', 'lost', 'open'], Anna: ['won'], Kira: ['lost', 'lost'] };

const info = (name, score, rating, [winnings, drawn, losses], ranking) => ({ name, score, rating, winnings, drawn, losses, ranking });
const LIST = [
    info('Ida', 1810, 1810, [3, 0, 1], 1),
    info('Dora', 1700, 1700, [0, 0, 0], 2),
    info('Cleo', 1600, 1600, [0, 1, 2], 3),
    info('Fritz', 1600, 1600, [0, 0, 0], 4),
    info('Bert', 1550, 1550, [0, 0, 0], 5),
    info('Lars', 1550, 1550, [0, 0, 0], 6),
    info('Greta', 1421, 1421, [0, 0, 0], 7),
    info('Jon', 1300, 1300, [0, 0, 0], 8),
    info('Anna', 0, 1500, [1, 0, 0], 9),
    info('Emil', 0, 1500, [0, 0, 0], 10),
    info('Hans', 0, 1500, [0, 0, 0], 11),
    info('Kira', 0, 1500, [0, 0, 2], 12),
];
const entry = name => LIST.find(each => each.name === name);

const league = async () => {
    const env = await setup();
    env.players = {};
    for (const [index, name] of NAMES.entries()) {
        const player = await env.account(name);
        await env.pool.query('UPDATE players SET created_at = $1, xp = $2 WHERE id = $3',
            [new Date(Date.UTC(2026, 9, 1, 12, index)), 1000 - index, player.playerId]);
        if (RATINGS[name]) {
            await env.pool.query('UPDATE players SET rating = $1, rated_matches = 2 WHERE id = $2', [RATINGS[name], player.playerId]);
        }
        await env.records(player.playerId, RECORDS[name] || []);
        env.players[name] = player;
    }
    // rated and with records, but without a name: on no list, counted in no rank
    env.unnamed = await env.account();
    await env.pool.query('UPDATE players SET rating = 1900, rated_matches = 5 WHERE id = $1', [env.unnamed.playerId]);
    await env.records(env.unnamed.playerId, ['won', 'won']);
    return env;
};

// the exact text of a JSON response: keys and their order included
const textOf = body => JSON.stringify(body);

describe('player infos', () => {
    test('the highscore pages, the own entry and the default page', async () => {
        const { players, unnamed } = await league();
        const first = await players.Ida.get('/highscore').expect(200);
        expect(first.text).toBe(textOf({ page: 1, lastPage: 2, total: 12, list: LIST.slice(0, 10), own: entry('Ida') }));
        // without a page: the one the player is on
        const own = await players.Kira.get('/highscore').expect(200);
        expect(own.text).toBe(textOf({ page: 2, lastPage: 2, total: 12, list: LIST.slice(10), own: entry('Kira') }));
        const asked = await players.Kira.get('/highscore?page=1').expect(200);
        expect(asked.text).toBe(textOf({ page: 1, lastPage: 2, total: 12, list: LIST.slice(0, 10), own: entry('Kira') }));
        // pages outside the list are the nearest one; text is the default
        expect((await players.Ida.get('/highscore?page=99').expect(200)).body).toMatchObject({ page: 2, list: LIST.slice(10) });
        expect((await players.Ida.get('/highscore?page=0').expect(200)).body).toMatchObject({ page: 1 });
        expect((await players.Hans.get('/highscore?page=x').expect(200)).body).toMatchObject({ page: 2, own: entry('Hans') });
        const anonymous = await unnamed.get('/highscore').expect(200);
        expect(anonymous.text).toBe(textOf({ page: 1, lastPage: 2, total: 12, list: LIST.slice(0, 10), own: null }));
    });

    test('ranks, lookups by name and by text, friends', async () => {
        const { players, unnamed } = await league();
        expect((await players.Fritz.get('/rank').expect(200)).text).toBe(textOf({ ranking: 4 }));
        expect((await players.Anna.get('/rank').expect(200)).text).toBe(textOf({ ranking: 9 }));
        expect((await unnamed.get('/rank').expect(200)).text).toBe(textOf({ ranking: null }));
        expect((await unnamed.get('/user/cleo').expect(200)).text).toBe(textOf([entry('Cleo')]));
        expect((await players.Anna.get('/user/KIRA').expect(200)).text).toBe(textOf([entry('Kira')]));

        for (const friend of ['Kira', 'Cleo', 'Ida', 'Anna']) {
            await players.Bert.post('/user/friend', { friend }).expect(200);
        }
        // by name
        const friends = await players.Bert.get('/user/friends').expect(200);
        expect(friends.text).toBe(textOf(['Anna', 'Cleo', 'Ida', 'Kira'].map(entry)));
        expect((await players.Anna.get('/user/friends').expect(200)).text).toBe('[]');
    });

    test('a highscore page and a list of friends take a few statements, not some per player', async () => {
        const { players, unnamed, statementsOf } = await league();
        const highscore = await statementsOf(() => players.Ida.get('/highscore').expect(200));
        expect(highscore.response.body.list).toHaveLength(10);
        // the player, the total, the own entry (results, rank), the page, its results
        expect(highscore.statements).toBeLessThanOrEqual(6);
        expect((await statementsOf(() => unnamed.get('/highscore').expect(200))).statements).toBeLessThanOrEqual(4);
        for (const friend of NAMES.slice(1)) {
            await players.Anna.post('/user/friend', { friend }).expect(200);
        }
        const friends = await statementsOf(() => players.Anna.get('/user/friends').expect(200));
        expect(friends.response.body).toHaveLength(11);
        expect(friends.statements).toBeLessThanOrEqual(4);
    });
});

describe('stats', () => {
    const KEYS = [
        'id', 'username', 'coins', 'score', 'xp', 'challengeXp', 'aiLadder', 'rating', 'ratedMatches', 'pantry', 'spoiling', 'items',
        'equipment', 'loadout', 'tutorialStarted', 'tutorialSkipped', 'tutorialFinished', 'awards', 'trackRecord', 'winnings', 'drawn', 'losses',
    ];

    const seeded = async () => {
        const env = await setup();
        const player = await env.account('Carolin');
        const crafter = await env.account('Gustav');
        const { pool } = env;
        const now = Date.now();
        await pool.query(
            `UPDATE players SET xp = 345, challenge_xp = 45, rating = 1612.6, rated_matches = 3, ai_ladder = $1,
             tutorial_started = TRUE, tutorial_finished = TRUE WHERE id = $2`,
            [JSON.stringify({ step: 3, wins: 1, floor: 2, games: 7 }), player.playerId]);
        await pantry.add(pool, player.playerId, [{ ingredient: 'COCOA', amount: 100 }, { ingredient: 'COCOA', amount: 20 }], now);
        // two fresh batches of vanilla (the older one spoils first), a spoiled one, a used-up one
        await pantry.add(pool, player.playerId, [{ ingredient: 'VANILLA', amount: 2 }], now - DAY);
        await pantry.add(pool, player.playerId, [{ ingredient: 'VANILLA', amount: 1 }], now - 3 * DAY);
        await pantry.add(pool, player.playerId, [{ ingredient: 'GOLDLEAF', amount: 4 }], now - 4 * DAY);
        await pantry.add(pool, player.playerId, [{ ingredient: 'SUGAR', amount: 3 }], now);
        await pool.query("UPDATE pantry SET amount = 0 WHERE player_id = $1 AND ingredient = 'SUGAR'", [player.playerId]);
        const item = (id, key, serial, craftedBy, createdAt) => pool.query(
            'INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, player.playerId, key, serial, craftedBy, new Date(createdAt)]);
        await item('item-old', 'LIGHT_BARREL', 7, crafter.playerId, Date.UTC(2026, 9, 20));
        await item('item-new', 'DARK_WALLS', 2, player.playerId, Date.UTC(2026, 9, 25));
        await item('item-orphan', 'HEAVY_BARREL', 1, 'gone', Date.UTC(2026, 9, 22));
        const equipment = { [EntityType.RUM_TRUFFLE_CANNON]: ['item-old', null] };
        await pool.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify(equipment), player.playerId]);
        await env.records(player.playerId, ['won', 'won', 'draw', 'lost', 'open']);
        const expected = {
            id: player.playerId,
            username: 'Carolin',
            coins: 120,
            score: 345,
            xp: 345,
            challengeXp: 45,
            aiLadder: { step: 3, wins: 1, floor: 2, games: 7 },
            rating: 1613,
            ratedMatches: 3,
            pantry: { COCOA: 120, VANILLA: 3 },
            spoiling: [
                { ingredient: 'VANILLA', amount: 1, expiresAt: now - 3 * DAY + Ingredients.VANILLA.shelfLifeMs },
                { ingredient: 'VANILLA', amount: 2, expiresAt: now - DAY + Ingredients.VANILLA.shelfLifeMs },
            ],
            items: [
                { id: 'item-new', item: 'DARK_WALLS', serial: 2, craftedBy: 'Carolin', createdAt: Date.UTC(2026, 9, 25) },
                { id: 'item-orphan', item: 'HEAVY_BARREL', serial: 1, craftedBy: 'Chocnonymous', createdAt: Date.UTC(2026, 9, 22) },
                { id: 'item-old', item: 'LIGHT_BARREL', serial: 7, craftedBy: 'Gustav', createdAt: Date.UTC(2026, 9, 20) },
            ],
            equipment,
            loadout: { [EntityType.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] },
            tutorialStarted: true,
            tutorialSkipped: false,
            tutorialFinished: true,
            awards: [],
            trackRecord: [],
            winnings: 2,
            drawn: 1,
            losses: 1,
        };
        return { ...env, player, expected };
    };

    test('every field of the stats, in every response that carries them', async () => {
        const { player, expected } = await seeded();
        const check = stats => {
            expect(stats).toEqual(expected);
            expect(Object.keys(stats)).toEqual(KEYS);
            Object.keys(expected).filter(key => !['pantry'].includes(key))
                .forEach(key => expect(textOf(stats[key])).toBe(textOf(expected[key])));
        };
        check((await player.get('/user').expect(200)).body.stats);
        check((await player.post('/user').expect(200)).body.stats);
        check((await player.post('/user/trackrecords', { stats: [] }).expect(200)).body.stats);
        check((await player.post('/user/tutorial/finished').expect(200)).body.stats);
        check((await player.post('/user/merge', { playerInfo: {} }).expect(200)).body.mergedPlayerInfo);
    });

    test('a new player without a name', async () => {
        const { account } = await setup();
        const player = await account();
        const { stats } = (await player.get('/user').expect(200)).body;
        expect(Object.keys(stats)).toEqual(KEYS);
        expect(stats).toEqual({
            id: player.playerId, username: 'Chocnonymous', coins: 0, score: 0, xp: 0, challengeXp: 0,
            aiLadder: { step: 1, wins: 0, floor: 1, games: 0 }, rating: 1500, ratedMatches: 0, pantry: {}, spoiling: [], items: [],
            equipment: {}, loadout: {}, tutorialStarted: false, tutorialSkipped: false, tutorialFinished: false, awards: [], trackRecord: [],
            winnings: 0, drawn: 0, losses: 0,
        });
    });

    test('reading the stats takes four statements', async () => {
        const { player, statementsOf } = await seeded();
        // the player, the pantry, the items, the results
        expect((await statementsOf(() => player.get('/user').expect(200))).statements).toBeLessThanOrEqual(4);
    });
});
