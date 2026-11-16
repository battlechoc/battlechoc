// The credit of a burned item (minting plan E, Task 3): once a burn of an item's user token is
// K_FINAL blocks deep (tip − block ≥ kFinal, plan D's rule) and the provider no longer sees the
// token, the watcher's credit step (after the ownership sync) closes the item and gives its
// ingredients (salvageReturns of the current recipe, minted: rare ones in full) to the player whose
// linked wallet held the token, once, whether the burn came from the game or not. Before that only
// derived state changes (items.burn_tx, the ownership sync's "burning"), which a rollback undoes.
// On plan C's chain double with the real tx.js; K_FINAL is 10.

const fs = require('fs');
const { Address, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { EntityType, Ingredients, chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('../src/pantry');
const players = require('../src/players');
const { operationsStep } = require('../src/chain/operationsStep');
const { ProviderError } = require('../src/chain/provider');
const { createCreditStep, creditBurns } = require('../src/chain/credit');
const { createRecipeBook, SAMPLE } = require('../src/lab/recipes');
const { createTestPool, siblingPool, closeTestPools, postgresOnly, failingOn } = require('./helpers/db');
const { createAccount } = require('./helpers/api');
const { confirmWith, removeKey, testKeys } = require('./helpers/cardano');
const { markMinted } = require('./helpers/mintedItems');
const { jsonTx } = require('./chainDouble');
const { createChainApp, K_FINAL } = require('./helpers/chainApp');
const { mintedItem, burnRequest, signBurn } = require('./helpers/burns');
const { HOUR, userName, silentLog, stake, link } = require('./helpers/minting');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());
// each test runs the watcher 12 to 40 times over the double (the first one a real mint and burn
// through tx.js too): beside the whole suite that takes longer than the default 30 s
jest.setTimeout(120_000);

const T = EntityType;
// the sample recipes without NUT_BRICKS (an item whose recipe is gone); TURBO_CONVEYOR is
// { MILK: 5, VANILLA: 2, GOLDLEAF: 1 }: minted, MILK 2 (half), VANILLA 2 and GOLDLEAF 1 (rare, in full)
const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).recipes;
const recipes = () => createRecipeBook(sample.filter(recipe => recipe.item !== 'NUT_BRICKS'));
const TURBO_RETURNS = { MILK: 2, VANILLA: 2, GOLDLEAF: 1 };

const NOTHING = { credited: [], closed: [], waiting: [], held: [], unanswered: [], failed: 0, skipped: null };

/**
 * Anna (10 matches, a wallet of 20 ADA) on an app whose watcher runs the operations step, the
 * ownership sync and the credit step (`creditStep`, default createCreditStep over the app's recipes),
 * as server.js does.
 */
const setup = async ({ creditStep } = {}) => {
    const book = recipes();
    const env = await createChainApp({ steps: [operationsStep], stepsAfter: [creditStep ?? createCreditStep({ recipes: book })], recipes: book });
    const anna = await env.player('Anna', { lovelace: [20_000_000], matches: 10 });
    return { env, anna, book };
};

/**
 * A run of the watcher: the credit step's result. A step that failed fails the test (the watcher
 * only logs it).
 */
const run = async env => {
    const report = await env.runOnce();
    Object.entries(report.steps).forEach(([name, result]) => {
        if (result && result.error) {
            throw new Error(`step ${name} failed: ${result.error.stack}`);
        }
    });
    return report.steps.credit;
};

/** `count` blocks, a watcher run after each: the credit results. */
const blocksAndRuns = async (env, count) => {
    const results = [];
    for (let i = 0; i < count; i++) {
        env.block();
        results.push(await run(env));
    }
    return results;
};

/**
 * `player`'s new item of `itemKey` minted to the base address of `keys` (default their first
 * wallet) as plan D marks it (asset name userName(n)), its token on the double, a block and a run:
 * { itemId, assetName }.
 */
const mintedTo = async (env, player, itemKey, n, keys = player.keys[0]) => {
    const itemId = await env.giveItem(player.playerId, itemKey);
    const assetName = userName(n);
    await markMinted(env.pool, itemId, assetName);
    env.double.mintToken({ assetName, to: env.double.addressOf(keys) });
    env.block();
    await run(env);
    return { itemId, assetName };
};

// a player's pantry but the cocoa (the matches a mint needs pay cocoa; no recipe here returns any)
const pantryOf = async (env, playerId) => {
    const { COCOA, ...rest } = await pantry.totals(env.pool, playerId, env.now());
    return rest;
};
const gained = (after, before) =>
    Object.fromEntries(Object.keys(after).map(ingredient => [ingredient, after[ingredient] - (before[ingredient] || 0)]).filter(([, n]) => n !== 0));
const creditsOf = async (pool, assetName) => (await pool.query('SELECT * FROM salvage_credits WHERE asset_name = $1', [assetName])).rows;
const itemRow = async (pool, itemId) => (await pool.query('SELECT player_id, burned_at, burn_tx FROM items WHERE id = $1', [itemId])).rows[0];
const noticeKinds = async (pool, itemId) => (await pool.query('SELECT player_id, kind FROM item_notices WHERE item_id = $1 ORDER BY created_at, kind', [itemId])).rows;
const statsOf = async (env, account) => (await (await env.refreshed(account)).get('/user').expect(200)).body.stats;
const equipmentOf = async (pool, playerId) => (await pool.query('SELECT equipment FROM players WHERE id = $1', [playerId])).rows[0].equipment;
const userUnit = (env, assetName) => env.contracts.policyId + assetName;

describe('the credit at K_FINAL, once', () => {
    test('a burn through the game: nothing at depth 9, the ingredients at depth 10, never again; no departure, one salvaged notice; the slot is empty, the item gone', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName, account } = await mintedItem(env, anna);
        await account.post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId }).expect(200);
        const before = await pantryOf(env, anna.playerId);
        const prepared = (await burnRequest(account, anna, itemId).expect(201)).body;
        await signBurn(env, anna, prepared).expect(200);
        const burnBlock = env.block().blockNo;
        expect(await run(env)).toEqual(NOTHING);
        // burning: still Anna's, the burn noted, no departure
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: anna.playerId, burned_at: null, burn_tx: prepared.operation.txHash });

        const early = await blocksAndRuns(env, K_FINAL - 1);
        expect(env.double.tip().blockNo).toBe(burnBlock + K_FINAL - 1);
        expect(early).toEqual(early.map(() => NOTHING));
        expect(await pantryOf(env, anna.playerId)).toEqual(before);
        expect(await creditsOf(env.pool, assetName)).toEqual([]);

        const [credit] = await blocksAndRuns(env, 1);
        expect(env.double.tip().blockNo).toBe(burnBlock + K_FINAL);
        expect(credit).toEqual({ ...NOTHING, credited: [{ assetName, txHash: prepared.operation.txHash, playerId: anna.playerId, returned: TURBO_RETURNS }] });
        expect(gained(await pantryOf(env, anna.playerId), before)).toEqual(TURBO_RETURNS);
        const creditedAt = env.now();
        expect(await creditsOf(env.pool, assetName)).toEqual([
            {
                tx_hash: prepared.operation.txHash,
                asset_name: assetName,
                player_id: anna.playerId,
                returned: TURBO_RETURNS,
                credited_at: new Date(creditedAt),
            },
        ]);
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: anna.playerId, burned_at: new Date(creditedAt), burn_tx: prepared.operation.txHash });
        expect(env.log.info).toHaveBeenCalledWith(`watcher: credit: ${assetName} credited (burn ${prepared.operation.txHash})`);

        // three more runs: no second credit
        expect(await blocksAndRuns(env, 3)).toEqual([NOTHING, NOTHING, NOTHING]);
        expect(gained(await pantryOf(env, anna.playerId), before)).toEqual(TURBO_RETURNS);
        expect(await creditsOf(env.pool, assetName)).toHaveLength(1);

        // what Anna sees: the item gone, its slot empty, one salvaged notice and no departure
        const stats = await statsOf(env, account);
        expect(stats.items.map(item => item.id)).not.toContain(itemId);
        expect(stats.equipment).toEqual({});
        expect(stats.loadout).toEqual({});
        expect(await equipmentOf(env.pool, anna.playerId)).toEqual({});
        expect(stats.notices).toEqual([
            { id: expect.any(String), kind: 'salvaged', item: { id: itemId, item: 'TURBO_CONVEYOR', serial: expect.any(Number) }, building: T.FACTORY, at: new Date(creditedAt).toISOString(), returned: TURBO_RETURNS },
        ]);
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: anna.playerId, kind: 'salvaged' }]);
        // the operation only ended: final, its credit is the step's
        expect(env.log.error).not.toHaveBeenCalled();
        expect(env.log.warn).not.toHaveBeenCalled();
    });

    test('fresh: the spoiling ingredients get their whole shelf life from the credit', async () => {
        const { env, anna } = await setup();
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        // the burn is in the first of these blocks: credited at depth K_FINAL, after the last one
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL].credited).toHaveLength(1);
        const { rows } = await env.pool.query('SELECT ingredient, amount, expires_at FROM pantry WHERE player_id = $1 AND ingredient IN ($2, $3) ORDER BY ingredient', [
            anna.playerId,
            'GOLDLEAF',
            'VANILLA',
        ]);
        const [credit] = await creditsOf(env.pool, assetName);
        const at = new Date(credit.credited_at).getTime();
        expect(rows.map(row => ({ ingredient: row.ingredient, amount: Number(row.amount), expiresAt: new Date(row.expires_at).getTime() }))).toEqual([
            { ingredient: 'GOLDLEAF', amount: 1, expiresAt: at + Ingredients.GOLDLEAF.shelfLifeMs },
            { ingredient: 'VANILLA', amount: 2, expiresAt: at + Ingredients.VANILLA.shelfLifeMs },
        ]);
    });

    test('a burn made outside the game (a transaction the server never built) is credited the same way', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const before = await pantryOf(env, anna.playerId);
        const txHash = env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results.slice(0, K_FINAL)).toEqual(results.slice(0, K_FINAL).map(() => NOTHING));
        expect(results[K_FINAL]).toEqual({ ...NOTHING, credited: [{ assetName, txHash, playerId: anna.playerId, returned: TURBO_RETURNS }] });
        expect(gained(await pantryOf(env, anna.playerId), before)).toEqual(TURBO_RETURNS);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: anna.playerId, burn_tx: txHash, burned_at: expect.any(Date) });
    });

    test('the holder is no player: the item is closed, credited to nobody, in nobody\'s items', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const stranger = env.double.newAddress();
        env.double.moveToken({ assetName, to: stranger });
        await blocksAndRuns(env, 1);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        const before = await pantryOf(env, anna.playerId);
        const txHash = env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, closed: [assetName] });
        expect(await creditsOf(env.pool, assetName)).toEqual([
            { tx_hash: txHash, asset_name: assetName, player_id: null, returned: null, credited_at: new Date(env.now()) },
        ]);
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: null, burned_at: new Date(env.now()), burn_tx: txHash });
        expect(await pantryOf(env, anna.playerId)).toEqual(before);
        expect((await players.itemsOf(env.pool, anna.playerId)).map(item => item.id)).not.toContain(itemId);
        // Anna saw it leave (the sync), nothing more
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: anna.playerId, kind: 'departed' }]);
        expect(env.log.info).toHaveBeenCalledWith(`watcher: credit: ${assetName} closed, its holder is no player (burn ${txHash})`);
    });

    test('a script held it (a listing that burned it): closed, credited to nobody', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const unit = userUnit(env, assetName);
        const [held] = env.double.unspentHolding(unit);
        // Ann's stake key under a script's payment part: a script holds nothing, whatever its stake part
        const listing = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('5c'.repeat(28)), stakingCredential: KeyHash.fromHex(anna.keys[0].stakeKeyHashHex) }));
        const moved = await env.double.submit(jsonTx({ txHash: 'a1'.repeat(32), ttlSlot: null, inputs: [held], outputs: [{ address: listing, lovelace: '1500000', assets: { [unit]: '1' } }], mint: {} }));
        env.block();
        await run(env);
        const burn = await env.double.submit(jsonTx({ txHash: 'a2'.repeat(32), ttlSlot: null, inputs: [{ txHash: moved, index: 0 }], outputs: [], mint: { [unit]: '-1' } }));
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, closed: [assetName] });
        expect(await creditsOf(env.pool, assetName)).toEqual([{ tx_hash: burn, asset_name: assetName, player_id: null, returned: null, credited_at: expect.any(Date) }]);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, burned_at: expect.any(Date) });
    });

    test('hop wait: a wallet that was Ben\'s, linked by Anna an hour ago, burns: waiting at depth 10, credited to Anna once her wait is over', async () => {
        const { env } = await setup();
        const ben = await env.player('Ben', { lovelace: [0, 0] });
        const wallet = ben.keys[0];
        const { itemId, assetName } = await mintedTo(env, ben, 'TURBO_CONVEYOR', 1, wallet);
        const { confirmToken } = (await confirmWith(env.app, ben.account, ben.keys[1])).body;
        await removeKey(env.app, ben.account, stake(wallet), confirmToken).expect(204);
        env.advance(HOUR);
        const anna = await createAccount(env.app, { username: 'Ada' });
        await env.link(anna, wallet);
        const linkedAt = env.now();
        const txHash = env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 3);
        expect(results.slice(K_FINAL)).toEqual([0, 1, 2].map(() => ({ ...NOTHING, waiting: [assetName] })));
        expect(await creditsOf(env.pool, assetName)).toEqual([]);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ burned_at: null });
        expect(await pantryOf(env, anna.playerId)).toEqual({});
        // the wait is over: the next run credits Anna
        env.advance(linkedAt + rules.WALLET_HOP_WAIT_MS - env.now());
        const [credit] = await blocksAndRuns(env, 1);
        expect(credit).toEqual({ ...NOTHING, credited: [{ assetName, txHash, playerId: anna.playerId, returned: TURBO_RETURNS }] });
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
        expect(await pantryOf(env, ben.playerId)).toEqual({});
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: anna.playerId, burned_at: expect.any(Date) });
    });

    test('a holder linked only by its payment key (an enterprise address): credited to that player, holder pay:', async () => {
        const { env } = await setup();
        const ada = await createAccount(env.app, { username: 'Ada' });
        const keys = testKeys();
        await link(env, ada, keys, { kind: 'pay' });
        const itemId = await env.giveItem(ada.playerId, 'TURBO_CONVEYOR');
        await markMinted(env.pool, itemId, userName(5));
        env.double.mintToken({ assetName: userName(5), to: env.double.addressOf(keys, 'enterprise') });
        env.block();
        await run(env);
        const txHash = env.double.burnToken({ assetName: userName(5) });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, credited: [{ assetName: userName(5), txHash, playerId: ada.playerId, returned: TURBO_RETURNS }] });
        expect(await creditsOf(env.pool, userName(5))).toEqual([{ tx_hash: txHash, asset_name: userName(5), player_id: ada.playerId, returned: TURBO_RETURNS, credited_at: expect.any(Date) }]);
        expect(await pantryOf(env, ada.playerId)).toEqual(TURBO_RETURNS);
    });

    test('two items burned in one transaction: both credited, one row each', async () => {
        const { env, anna } = await setup();
        const carla = await env.player('Carla', { lovelace: [0] });
        const one = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const two = await mintedTo(env, carla, 'TURBO_CONVEYOR', 2);
        const units = [one, two].map(({ assetName }) => userUnit(env, assetName));
        const txHash = await env.double.submit(
            jsonTx({ txHash: 'b1'.repeat(32), ttlSlot: null, inputs: units.map(unit => env.double.unspentHolding(unit)[0]), outputs: [], mint: Object.fromEntries(units.map(unit => [unit, '-1'])) })
        );
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({
            ...NOTHING,
            credited: [
                { assetName: one.assetName, txHash, playerId: anna.playerId, returned: TURBO_RETURNS },
                { assetName: two.assetName, txHash, playerId: carla.playerId, returned: TURBO_RETURNS },
            ],
        });
        expect((await env.pool.query('SELECT asset_name, player_id FROM salvage_credits WHERE tx_hash = $1 ORDER BY asset_name', [txHash])).rows).toEqual([
            { asset_name: one.assetName, player_id: anna.playerId },
            { asset_name: two.assetName, player_id: carla.playerId },
        ]);
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
        expect(await pantryOf(env, carla.playerId)).toEqual(TURBO_RETURNS);
    });

    test('no recipe any more (the current table decides): credited {}, the item closed, the notice says so', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'NUT_BRICKS', 1);
        const txHash = env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, credited: [{ assetName, txHash, playerId: anna.playerId, returned: {} }] });
        expect(await pantryOf(env, anna.playerId)).toEqual({});
        expect(await itemRow(env.pool, itemId)).toMatchObject({ burned_at: expect.any(Date) });
        expect((await statsOf(env, anna.account)).notices).toEqual([expect.objectContaining({ kind: 'salvaged', item: expect.objectContaining({ id: itemId, item: 'NUT_BRICKS' }), building: null, returned: {} })]);
    });

    test('a credited item is no item of the player\'s for readiness either: its id answers as an item not given', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'NUT_BRICKS', 1);
        const account = await env.refreshed(anna.account);
        const own = (await account.get(`/chain/readiness?itemId=${itemId}`).expect(200)).body;
        const none = (await account.get('/chain/readiness').expect(200)).body;
        // a common item's fee is not the largest: the item's tier shows
        expect(own.estimate).not.toEqual(none.estimate);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, K_FINAL + 1);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ burned_at: expect.any(Date), player_id: anna.playerId });
        const after = await env.refreshed(anna.account);
        expect((await after.get(`/chain/readiness?itemId=${itemId}`).expect(200)).body).toEqual((await after.get('/chain/readiness').expect(200)).body);
    });

    test('a closed item keeps no wallet key: holder_subject, holder_pay and holder_since are null after a credit and after a close for nobody, and the credit row stores no key either (support finds the key on chain from tx_hash)', async () => {
        const { env, anna } = await setup();
        const credited = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const closed = await mintedTo(env, anna, 'TURBO_CONVEYOR', 2);
        const holderOfItem = async itemId =>
            (await env.pool.query('SELECT holder_subject, holder_pay, holder_since, asset_name, minted_at, burned_at, burn_tx FROM items WHERE id = $1', [itemId])).rows[0];
        expect(await holderOfItem(credited.itemId)).toMatchObject({ holder_subject: anna.subjects[0], holder_pay: expect.stringMatching(/^pay:/), holder_since: expect.any(Date) });
        // the second to a stranger, who burns it: closed for nobody
        env.double.moveToken({ assetName: closed.assetName, to: env.double.newAddress() });
        await blocksAndRuns(env, 1);
        const burns = [env.double.burnToken({ assetName: credited.assetName }), env.double.burnToken({ assetName: closed.assetName })];
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toMatchObject({ credited: [expect.objectContaining({ assetName: credited.assetName })], closed: [closed.assetName] });
        for (const [{ itemId, assetName }, burn] of [[credited, burns[0]], [closed, burns[1]]]) {
            expect(await holderOfItem(itemId)).toEqual({
                holder_subject: null,
                holder_pay: null,
                holder_since: null,
                asset_name: assetName,
                minted_at: expect.any(Date),
                burned_at: expect.any(Date),
                burn_tx: burn,
            });
        }
        // the credit's rows: player, item, burn and what was returned, no column and no value naming a key
        // on Postgres every test pool has a schema of its own (helpers/db.js): only this one's table
        const ownSchema = env.pool.schema ? ` AND table_schema = '${env.pool.schema}'` : '';
        const columns = (await env.pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'salvage_credits'${ownSchema}`)).rows.map(row => row.column_name);
        expect(columns.sort()).toEqual(['asset_name', 'credited_at', 'player_id', 'returned', 'tx_hash']);
        for (const assetName of [credited.assetName, closed.assetName]) {
            const [row] = await creditsOf(env.pool, assetName);
            expect(Object.keys(row).sort()).toEqual(['asset_name', 'credited_at', 'player_id', 'returned', 'tx_hash']);
            expect(JSON.stringify(row)).not.toMatch(/stake:|pay:/);
        }
        // the readers of a player's items leave burned rows out: items, loadout, the wallet's item counts
        const account = await env.refreshed(anna.account);
        const stats = (await account.get('/user').expect(200)).body.stats;
        expect(stats.items.map(item => item.id)).not.toEqual(expect.arrayContaining([credited.itemId]));
        expect(stats.items.map(item => item.id)).not.toEqual(expect.arrayContaining([closed.itemId]));
        expect((await players.identitiesOf(env.pool, anna.playerId, { now: env.now() })).map(identity => identity.items)).toEqual([0]);
    });

    test('a token the server knows no item of is ignored', async () => {
        const { env } = await setup();
        env.double.mintToken({ assetName: userName(77), to: env.double.newAddress() });
        env.block();
        env.double.burnToken({ assetName: userName(77) });
        const results = await blocksAndRuns(env, K_FINAL + 2);
        expect(results).toEqual(results.map(() => NOTHING));
        expect(Number((await env.pool.query('SELECT COUNT(*) AS n FROM salvage_credits')).rows[0].n)).toBe(0);
    });

    test('moved to Ben and burned by Ben in one block (the sync changes the row in the same run): credited to Ben; Anna, whose item it was until then, has it departed', async () => {
        const { env, anna } = await setup();
        const ben = await env.player('Ben', { lovelace: [0] });
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        await (await env.refreshed(anna.account)).post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId }).expect(200);
        env.double.moveToken({ assetName, to: env.double.addressOf(ben.keys[0]) });
        const txHash = env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, credited: [{ assetName, txHash, playerId: ben.playerId, returned: TURBO_RETURNS }] });
        expect(await pantryOf(env, ben.playerId)).toEqual(TURBO_RETURNS);
        expect(await pantryOf(env, anna.playerId)).toEqual({});
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ben.playerId, burned_at: expect.any(Date) });
        // one notice each: the departure for Anna (with the building whose slot it left), the credit for Ben
        expect(await noticeKinds(env.pool, itemId)).toEqual([
            { player_id: anna.playerId, kind: 'departed' },
            { player_id: ben.playerId, kind: 'salvaged' },
        ]);
        expect((await statsOf(env, anna.account)).notices).toEqual([expect.objectContaining({ kind: 'departed', item: expect.objectContaining({ id: itemId }), building: T.FACTORY })]);
        expect((await statsOf(env, anna.account)).notices[0]).not.toHaveProperty('returned');
        expect(await equipmentOf(env.pool, anna.playerId)).toEqual({});
        expect((await statsOf(env, ben.account)).notices).toEqual([expect.objectContaining({ kind: 'salvaged', building: null, returned: TURBO_RETURNS })]);
    });

    test('a stale index decides nothing', async () => {
        const { env, anna } = await setup();
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, K_FINAL);
        env.double.fail({ index: 'stale' });
        expect(await blocksAndRuns(env, 2)).toEqual([0, 1].map(() => ({ ...NOTHING, skipped: 'index-stale' })));
        expect(await creditsOf(env.pool, assetName)).toEqual([]);
        env.double.fail({});
        expect((await blocksAndRuns(env, 1))[0].credited).toHaveLength(1);
    });
});

describe('rollbacks: before K_FINAL nothing irreversible is written', () => {
    test('a burn at depth 3 rolled back: the item minted, in its slot and loadout, no notice; 20 blocks later still no credit; the same burn lands again: credited once at its own depth 10', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        await (await env.refreshed(anna.account)).post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId }).expect(200);
        const txHash = env.double.burnToken({ assetName });
        await blocksAndRuns(env, 4);
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: anna.playerId, burned_at: null, burn_tx: txHash });

        // the burn's block and the three after it are rolled back; the burn waits again, held
        env.double.holdMempool(true);
        env.double.rollback(4);
        expect(env.double.mempool()).toEqual([txHash]);
        expect(await run(env)).toEqual(NOTHING);
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: anna.playerId, burned_at: null, burn_tx: null });
        const stats = await statsOf(env, anna.account);
        expect(stats.items.find(item => item.id === itemId).minted).toEqual({ assetName, state: 'minted' });
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });
        expect(stats.loadout).toEqual({ [T.FACTORY]: ['TURBO_CONVEYOR'] });
        expect(stats.notices).toEqual([]);

        const held = await blocksAndRuns(env, 20);
        expect(held).toEqual(held.map(() => NOTHING));
        expect(await creditsOf(env.pool, assetName)).toEqual([]);

        env.double.holdMempool(false);
        const landed = await blocksAndRuns(env, K_FINAL + 1);
        expect(landed.slice(0, K_FINAL)).toEqual(landed.slice(0, K_FINAL).map(() => NOTHING));
        expect(landed[K_FINAL]).toEqual({ ...NOTHING, credited: [{ assetName, txHash, playerId: anna.playerId, returned: TURBO_RETURNS }] });
        expect(await creditsOf(env.pool, assetName)).toHaveLength(1);
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: anna.playerId, kind: 'salvaged' }]);
    });

    test('rolled back and dropped, then burned by another transaction: credited once, for that one', async () => {
        const { env, anna } = await setup();
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const first = env.double.burnToken({ assetName });
        await blocksAndRuns(env, 5);
        env.double.rollback(5, { drop: true });
        await run(env);
        const second = env.double.burnToken({ assetName });
        expect(second).not.toBe(first);
        const results = await blocksAndRuns(env, K_FINAL + 3);
        expect(results.flatMap(result => result.credited)).toEqual([{ assetName, txHash: second, playerId: anna.playerId, returned: TURBO_RETURNS }]);
        expect(await creditsOf(env.pool, assetName)).toMatchObject([{ tx_hash: second }]);
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
    });
});

describe('never on the index alone: the provider must no longer see the token', () => {
    /** A credit step whose provider answers `utxoByUnit` with `answer(unit)` (calls counted). */
    const providerStep = book => {
        const asked = [];
        const provider = { answer: async () => undefined };
        const step = {
            name: 'credit',
            run: context =>
                creditBurns({
                    ...context,
                    recipes: book,
                    chain: {
                        ...context.chain,
                        provider: {
                            utxoByUnit: unit => {
                                asked.push(unit);
                                return provider.answer(unit);
                            },
                        },
                    },
                }),
        };
        return { step, asked, provider };
    };

    test('the provider still sees the token: no credit, one error line (not one per run) naming the burn and the token; once it does not: credited, one line that it is over', async () => {
        const book = recipes();
        const { step, asked, provider } = providerStep(book);
        const { env, anna } = await setup({ creditStep: step });
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const txHash = env.double.burnToken({ assetName });
        const unit = userUnit(env, assetName);
        provider.answer = async () => ({ held: true });
        const results = await blocksAndRuns(env, K_FINAL + 3);
        // asked only once the burn is deep enough and Anna is the beneficiary, once a run
        expect(asked).toEqual([unit, unit, unit]);
        expect(results.slice(0, K_FINAL)).toEqual(results.slice(0, K_FINAL).map(() => NOTHING));
        expect(results.slice(K_FINAL)).toEqual([0, 1, 2].map(() => ({ ...NOTHING, held: [assetName] })));
        expect(await creditsOf(env.pool, assetName)).toEqual([]);
        expect(await pantryOf(env, anna.playerId)).toEqual({});
        expect(env.log.error).toHaveBeenCalledTimes(1);
        expect(env.log.error).toHaveBeenCalledWith(
            'watcher: credit: the index shows burns of tokens the provider still sees: no credit until it does not; check the index',
            { burns: [{ assetName, txHash, unit }] }
        );
        provider.answer = async () => undefined;
        const [credit] = await blocksAndRuns(env, 1);
        expect(credit.credited).toEqual([{ assetName, txHash, playerId: anna.playerId, returned: TURBO_RETURNS }]);
        expect(env.log.error).toHaveBeenCalledTimes(1);
        expect(env.log.info).toHaveBeenCalledWith('watcher: credit: the provider no longer sees any token the index shows burned');
    });

    test('the provider does not answer: no credit this run and no error, tried again next run; one call a run, whatever the number of burns', async () => {
        const book = recipes();
        const { step, asked, provider } = providerStep(book);
        const { env, anna } = await setup({ creditStep: step });
        const one = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        const two = await mintedTo(env, anna, 'TURBO_CONVEYOR', 2);
        env.double.burnToken({ assetName: one.assetName });
        env.double.burnToken({ assetName: two.assetName });
        // depth K_FINAL - 1
        await blocksAndRuns(env, K_FINAL);
        expect(asked).toEqual([]);
        provider.answer = async () => {
            throw new ProviderError('busy', 'over the limit', 429);
        };
        const [busy] = await blocksAndRuns(env, 1);
        expect(busy).toEqual({ ...NOTHING, unanswered: [one.assetName, two.assetName] });
        expect(asked).toHaveLength(1);
        expect(await creditsOf(env.pool, one.assetName)).toEqual([]);
        expect(env.log.error).not.toHaveBeenCalled();
        expect(env.log.warn).not.toHaveBeenCalled();
        provider.answer = async () => undefined;
        const [credit] = await blocksAndRuns(env, 1);
        expect(credit.credited.map(entry => entry.assetName)).toEqual([one.assetName, two.assetName]);
        expect(asked).toHaveLength(3);
    });

    test('a provider failing with another error (no ProviderError): counted failed, one lasting error line; the next run credits', async () => {
        const book = recipes();
        const { step, provider } = providerStep(book);
        const { env, anna } = await setup({ creditStep: step });
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, K_FINAL);
        provider.answer = async () => {
            throw new TypeError('the provider broke');
        };
        expect(await blocksAndRuns(env, 2)).toEqual([0, 1].map(() => ({ ...NOTHING, failed: 1 })));
        expect(await creditsOf(env.pool, assetName)).toEqual([]);
        expect(env.log.error).toHaveBeenCalledTimes(1);
        expect(env.log.error).toHaveBeenCalledWith('watcher: credit: 1 burned items could not be credited, the next run tries again', { reason: 'TypeError: the provider broke' });
        provider.answer = async () => undefined;
        expect((await blocksAndRuns(env, 1))[0].credited).toHaveLength(1);
        expect(env.log.info).toHaveBeenCalledWith('watcher: credit: no burned item fails any more');
    });

    test('the real provider over the double: a busy one leaves the burn for the next run', async () => {
        const { env, anna } = await setup();
        const { assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, K_FINAL);
        env.double.fail({ provider: 'busy' });
        expect(await blocksAndRuns(env, 1)).toEqual([{ ...NOTHING, unanswered: [assetName] }]);
        env.double.fail({});
        expect((await blocksAndRuns(env, 1))[0].credited).toEqual([expect.objectContaining({ assetName, playerId: anna.playerId })]);
    });
});

describe('exactly once, whatever happens around it', () => {
    test('one credit per asset name, ever: a second row for it with another transaction is refused', async () => {
        const pool = await createTestPool();
        const row = (txHash, assetName) => pool.query('INSERT INTO salvage_credits (tx_hash, asset_name, credited_at) VALUES ($1, $2, $3)', [txHash, assetName, new Date()]);
        await row('aa'.repeat(32), userName(1));
        await expect(row('bb'.repeat(32), userName(1))).rejects.toThrow();
        await expect(row('aa'.repeat(32), userName(1))).rejects.toThrow();
        await row('aa'.repeat(32), userName(2));
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM salvage_credits')).rows[0].n)).toBe(2);
    });

    postgresOnly('two API processes credit one burn at the same moment: one row, one credit', async () => {
        const { env, anna, book } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        // depth K_FINAL - 1 after the watcher's runs, then K_FINAL without one
        await blocksAndRuns(env, K_FINAL);
        env.block();
        // both get past every check before either writes: the provider answers once both have asked
        let arrived = 0;
        let release;
        const together = new Promise(resolve => {
            release = resolve;
        });
        const provider = {
            utxoByUnit: async () => {
                arrived += 1;
                if (arrived === 2) {
                    release();
                }
                await together;
                return undefined;
            },
        };
        const tip = await env.chain.index.tip();
        const context = pool => ({ pool, chain: { ...env.chain, provider }, recipes: book, now: env.now, tip, fresh: true, log: silentLog(), memory: {} });
        const results = await Promise.all([creditBurns(context(env.pool)), creditBurns(context(siblingPool(env.pool)))]);
        expect(results.flatMap(result => result.credited)).toHaveLength(1);
        expect(results.flatMap(result => result.failed)).toEqual([0, 0]);
        expect(await creditsOf(env.pool, assetName)).toHaveLength(1);
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: anna.playerId, kind: 'salvaged' }]);
    });

    postgresOnly('a failure between the statements leaves nothing behind; the next run credits', async () => {
        const book = recipes();
        let failing = true;
        const step = {
            name: 'credit',
            run: context => creditBurns({ ...context, recipes: book, pool: failing ? failingOn(context.pool, /INSERT INTO pantry/) : context.pool }),
        };
        const { env, anna } = await setup({ creditStep: step });
        const { itemId, assetName } = await mintedTo(env, anna, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        const results = await blocksAndRuns(env, K_FINAL + 1);
        expect(results[K_FINAL]).toEqual({ ...NOTHING, failed: 1 });
        expect(await creditsOf(env.pool, assetName)).toEqual([]);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ burned_at: null });
        expect(await pantryOf(env, anna.playerId)).toEqual({});
        expect(await noticeKinds(env.pool, itemId)).toEqual([]);
        expect(env.log.error).toHaveBeenCalledWith('watcher: credit: 1 burned items could not be credited, the next run tries again', { reason: expect.stringContaining('injected failure') });
        failing = false;
        const [credit] = await blocksAndRuns(env, 1);
        expect(credit.credited).toHaveLength(1);
        expect(await pantryOf(env, anna.playerId)).toEqual(TURBO_RETURNS);
        expect(env.log.info).toHaveBeenCalledWith('watcher: credit: no burned item fails any more');
    });

    test('the holder\'s wallet was unlinked before the credit: closed (nobody to credit)', async () => {
        const { env } = await setup();
        const ben = await env.player('Ben', { lovelace: [0, 0] });
        const { itemId, assetName } = await mintedTo(env, ben, 'TURBO_CONVEYOR', 1);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, 3);
        const { confirmToken } = (await confirmWith(env.app, ben.account, ben.keys[1])).body;
        await removeKey(env.app, ben.account, stake(ben.keys[0]), confirmToken).expect(204);
        const results = await blocksAndRuns(env, K_FINAL);
        expect(results.flatMap(result => result.closed)).toEqual([assetName]);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, burned_at: expect.any(Date) });
        expect(await pantryOf(env, ben.playerId)).toEqual({});
        // the item was Ben's until the credit (burning): he has it departed, and nothing else
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: ben.playerId, kind: 'departed' }]);
    });

    test('credited to the player whose item it was: one salvaged notice, no departure', async () => {
        const { env, anna } = await setup();
        const { itemId, assetName } = await mintedTo(env, anna, 'NUT_BRICKS', 1);
        env.double.burnToken({ assetName });
        await blocksAndRuns(env, K_FINAL + 1);
        expect(await noticeKinds(env.pool, itemId)).toEqual([{ player_id: anna.playerId, kind: 'salvaged' }]);
    });
});

describe('in the server', () => {
    test('the watcher of server.js runs the operations step, the ownership sync, then the credit', async () => {
        const { startWatcher } = require('../src/server');
        const env = await createChainApp();
        const runtime = { chain: env.chain, watcher: null };
        const stop = startWatcher({ chain: env.chain, pool: env.pool, intervalMs: 20000, runtime, recipes: recipes(), log: silentLog() });
        try {
            const report = await runtime.watcher.runOnce();
            expect(Object.keys(report.steps)).toEqual(['operations', 'ownership', 'credit']);
            // (this watcher reads the real clock, the double's blocks are of the test's: stale)
            expect(report.steps.credit).toEqual({ ...NOTHING, skipped: 'index-stale' });
        } finally {
            stop();
        }
    });

    test('createCreditStep needs the recipe book', () => {
        expect(() => createCreditStep({})).toThrow(TypeError);
        expect(createCreditStep({ recipes: recipes() }).name).toBe('credit');
    });
});
