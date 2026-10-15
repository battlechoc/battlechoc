const request = require('supertest');
const { EntityType, EmptyPlayerStats, levelRefund } = require('@battlechoc/battlechoc-shared-functions');
const { createApp } = require('../src/app');
const { createAuth } = require('../src/auth');
const { migrate } = require('../src/db');
const pantry = require('../src/pantry');
const players = require('../src/players');
const { createRecipeBook } = require('../src/lab/recipes');
const { createTestPool, closeTestPools, JWT_SECRET } = require('./helper');

afterAll(closeTestPools);

const T = EntityType;
// a small, known recipe table for the tests (the real one is private)
const testRecipes = [
    { item: 'LIGHT_BARREL', ingredients: ['RUM', 'SUGAR', 'MILK'], amounts: { RUM: 2, SUGAR: 2, MILK: 1 } },
    { item: 'HEAVY_BARREL', ingredients: ['RUM', 'SUGAR', 'VANILLA'], amounts: { RUM: 3, SUGAR: 3, VANILLA: 1 } },
    { item: 'DARK_WALLS', ingredients: ['MILK', 'HAZELNUTS', 'VANILLA'], amounts: { MILK: 3, HAZELNUTS: 3, VANILLA: 1 } },
];

const setup = async (options = {}) => {
    const pool = await createTestPool();
    const auth = createAuth({ pool, secret: JWT_SECRET });
    const app = createApp({ pool, auth, accountsPerMinute: 1000, recipes: createRecipeBook(testRecipes), ...options });
    return { app, pool };
};

const account = async (app, { starter = true, name } = {}) => {
    const created = await request(app).post('/accounts').expect(201);
    const bearer = `Bearer ${created.body.accessToken}`;
    const client = {
        ...created.body,
        get: path => request(app).get(path).set('Authorization', bearer),
        post: (path, body = {}) => request(app).post(path).set('Authorization', bearer).send(body),
    };
    if (name) {
        await client.post('/user/username', { username: name }).expect(200);
    }
    if (starter) {
        await client.post('/user/tutorial/finished').expect(200);
    }
    return client;
};

const tryRecipe = (client, entityType, ingredients) => client.post('/lab/try', { entityType, ingredients });

describe('starter kit', () => {
    test('finishing the tutorial gives cocoa and the ingredients of the starter recipe, once', async () => {
        const { app } = await setup();
        const player = await account(app);
        const stats = (await player.post('/user/tutorial/finished').expect(200)).body.stats;
        expect(stats.pantry).toEqual({ COCOA: 100, RUM: 4, SUGAR: 4, MILK: 2 });
        expect(stats).toMatchObject({ items: [], equipment: {}, loadout: {} });
    });
});

describe('lab table', () => {
    test('a hit discovers the recipe, publicly, with the first discoverer', async () => {
        const { app } = await setup();
        const anna = await account(app, { name: 'Anna' });
        const found = (await tryRecipe(anna, T.RUM_TRUFFLE_CANNON, ['MILK', 'SUGAR']).expect(200)).body;
        expect(found).toMatchObject({
            result: 'found',
            first: true,
            recipe: { item: 'LIGHT_BARREL', entityType: T.RUM_TRUFFLE_CANNON, amounts: { RUM: 2, SUGAR: 2, MILK: 1 }, fee: 50, discoveredBy: 'Anna' },
        });
        const ben = await account(app, { name: 'Ben' });
        const again = (await tryRecipe(ben, T.RUM_TRUFFLE_CANNON, ['SUGAR', 'MILK']).expect(200)).body;
        expect(again).toMatchObject({ result: 'found', first: false, recipe: { discoveredBy: 'Anna' } });
        const book = (await ben.get('/lab/recipes').expect(200)).body;
        expect(book.recipes).toEqual([expect.objectContaining({ item: 'LIGHT_BARREL', discoveredBy: 'Anna', ingredients: ['MILK', 'RUM', 'SUGAR'] })]);
        expect(book.undiscovered).toEqual({ [T.RUM_TRUFFLE_CANNON]: 1, [T.FACTORY]: 1 });
    });

    test('near misses smell, everything else is nothing; nothing is revealed', async () => {
        const { app } = await setup();
        const player = await account(app);
        // rum, rum, sugar shares rum and sugar with undiscovered recipes
        expect((await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['RUM', 'SUGAR']).expect(200)).body).toEqual({ result: 'smell' });
        expect((await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['RUM', 'RUM']).expect(200)).body).toEqual({ result: 'nothing' });
        // the factory's special ingredient is milk; milk, milk, sugar shares only milk with dark walls
        expect((await tryRecipe(player, T.FACTORY, ['MILK', 'SUGAR']).expect(200)).body).toEqual({ result: 'nothing' });
    });

    test('only owned ingredients, known buildings and two ingredients are accepted', async () => {
        const { app } = await setup();
        const player = await account(app);
        expect((await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['VANILLA', 'SUGAR']).expect(400)).body.error).toBe('MISSING INGREDIENTS');
        // the bunny's marzipan is missing too
        expect((await tryRecipe(player, T.SPYING_EASTER_BUNNY, ['SUGAR', 'MILK']).expect(400)).body.error).toBe('MISSING INGREDIENTS');
        await tryRecipe(player, 'EntityType.NOPE', ['SUGAR', 'MILK']).expect(400);
        await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['SUGAR']).expect(400);
        await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['SUGAR', 'GOLD']).expect(400);
    });

    test('tries are limited per hour', async () => {
        const { app } = await setup({ labTriesPerHour: 3 });
        const player = await account(app);
        for (let i = 0; i < 3; i++) {
            await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['RUM', 'RUM']).expect(200);
        }
        expect((await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['RUM', 'RUM']).expect(429)).body.error).toBe('TOO MANY TRIES');
    });
});

describe('crafting', () => {
    test('needs a discovered recipe, takes amounts and fee, numbers the items', async () => {
        const { app } = await setup();
        const anna = await account(app, { name: 'Anna' });
        expect((await anna.post('/lab/craft', { item: 'LIGHT_BARREL' }).expect(400)).body.error).toBe('RECIPE NOT DISCOVERED');
        await tryRecipe(anna, T.RUM_TRUFFLE_CANNON, ['SUGAR', 'MILK']).expect(200);
        const crafted = (await anna.post('/lab/craft', { item: 'LIGHT_BARREL' }).expect(200)).body;
        expect(crafted.item).toMatchObject({ item: 'LIGHT_BARREL', serial: 1, craftedBy: 'Anna' });
        expect(crafted.pantry).toEqual({ COCOA: 50, RUM: 2, SUGAR: 2, MILK: 1 });
        const ben = await account(app, { name: 'Ben' });
        expect((await ben.post('/lab/craft', { item: 'LIGHT_BARREL' }).expect(200)).body.item.serial).toBe(2);
        // the starter kit holds exactly enough for a second one, then it is used up
        expect((await anna.post('/lab/craft', { item: 'LIGHT_BARREL' }).expect(200)).body.item.serial).toBe(3);
        expect((await anna.post('/lab/craft', { item: 'LIGHT_BARREL' }).expect(400)).body.error).toBe('NOT ENOUGH INGREDIENTS');
        await anna.post('/lab/craft', { item: 'NOPE' }).expect(400);
        expect((await anna.get('/user/items').expect(200)).body.map(entry => entry.serial).sort()).toEqual([1, 3]);
    });

    test('two crafts at once with ingredients for one: exactly one item', async () => {
        const { app } = await setup();
        const player = await account(app);
        await tryRecipe(player, T.RUM_TRUFFLE_CANNON, ['SUGAR', 'MILK']).expect(200);
        const statuses = (await Promise.all([1, 2, 3].map(() => player.post('/lab/craft', { item: 'LIGHT_BARREL' }))))
            .map(response => response.status).sort();
        // the starter kit holds milk for two light barrels but cocoa for two as well; a third fails
        expect(statuses).toEqual([200, 200, 400]);
        expect((await player.get('/user/items')).body).toHaveLength(2);
    });
});

describe('equipment', () => {
    const giveItem = async (pool, playerId, item) => {
        const id = `${item}-${Math.random()}`;
        await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ($1, $2, $3, 1, $2)', [id, playerId, item]);
        return id;
    };

    test('equips owned items of the building, within the budget, without duplicates', async () => {
        const { app, pool } = await setup();
        const player = await account(app);
        const other = await account(app);
        const light = await giveItem(pool, player.playerId, 'LIGHT_BARREL');
        const light2 = await giveItem(pool, player.playerId, 'LIGHT_BARREL');
        const heavy = await giveItem(pool, player.playerId, 'HEAVY_BARREL');
        const theirs = await giveItem(pool, other.playerId, 'HEAVY_BARREL');
        const equip = (entityType, slot, itemId) => player.post('/user/equipment', { entityType, slot, itemId });

        const done = (await equip(T.RUM_TRUFFLE_CANNON, 0, light).expect(200)).body;
        expect(done.loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        expect((await equip(T.RUM_TRUFFLE_CANNON, 1, light2).expect(400)).body.error).toBe('ALREADY ON THIS BUILDING');
        expect((await equip(T.FACTORY, 0, heavy).expect(400)).body.error).toBe('WRONG BUILDING');
        expect((await equip(T.RUM_TRUFFLE_CANNON, 1, theirs).expect(400)).body.error).toBe('NOT YOUR ITEM');
        await equip(T.RUM_TRUFFLE_CANNON, 2, heavy).expect(400);
        expect((await equip(T.RUM_TRUFFLE_CANNON, 1, heavy).expect(200)).body.loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL', 'HEAVY_BARREL'] });
        // the same item moves to the other slot instead of being in two
        expect((await equip(T.RUM_TRUFFLE_CANNON, 1, light).expect(200)).body.equipment).toEqual({ [T.RUM_TRUFFLE_CANNON]: [null, light] });

        // light barrel 2 + turbo conveyor 5 = 7 points; a second epic (12) does not fit
        await equip(T.FACTORY, 0, await giveItem(pool, player.playerId, 'TURBO_CONVEYOR')).expect(200);
        const spray = await giveItem(pool, player.playerId, 'WIDE_SPRAY');
        expect((await equip(T.CHOCOLATE_FOUNTAIN, 0, spray).expect(400)).body.error).toBe('OVER BUDGET');
        const emptied = (await equip(T.FACTORY, 0, null).expect(200)).body;
        expect(emptied.loadout[T.FACTORY]).toBeUndefined();
        expect(emptied.equipment[T.FACTORY]).toBeUndefined();
        await equip(T.CHOCOLATE_FOUNTAIN, 0, spray).expect(200);
        const stats = (await player.get('/user')).body.stats;
        expect(stats.loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'], [T.CHOCOLATE_FOUNTAIN]: ['WIDE_SPRAY'] });
        expect(stats.items).toHaveLength(5);
    });
});

describe('migration', () => {
    test('levels are refunded into the pantry and reset', async () => {
        const { newDb } = require('pg-mem');
        const { Pool: MemoryPool } = newDb().adapters.createPg();
        const old = new MemoryPool();
        await migrate(old, { upTo: '003_ingredients.sql' });
        const id = await players.createPlayer(old);
        const levels = { ...EmptyPlayerStats.level, [T.RUM_TRUFFLE_CANNON]: 5, [T.FACTORY]: 2 };
        await old.query('UPDATE players SET level = $1 WHERE id = $2', [JSON.stringify(levels), id]);
        await migrate(old);
        expect(await pantry.totals(old, id, Date.now())).toEqual(levelRefund(levels));
        const row = await players.findPlayer(old, id);
        expect(players.levelOf(row)).toEqual(EmptyPlayerStats.level);
        await old.end();
    });
});
