// The burning state in GET /user (minting plan E, Task 4): while a minted item is being salvaged
// (its burn signed and sent, in a block, or a burn of its token the ownership sync sees, also one
// made outside the game) its mark says `burning`, it is out of the loadout and cannot be equipped;
// a prepared burn (nothing signed yet) leaves it minted and usable. A rollback or an expiry makes it
// minted, equipped where it was and in the loadout again (plan C's rule for a token that left and
// came back: its slot keeps its id); the credit takes it out of every list. On plan C's chain
// double with the real tx.js; K_FINAL is 10.

const fs = require('fs');
const request = require('supertest');
const { EntityType, cardano, live: protocol } = require('@battlechoc/battlechoc-shared-functions');
const ops = require('../src/chain/ops');
const { operationsStep } = require('../src/chain/operationsStep');
const { ownershipStep } = require('../src/chain/ownership');
const { createCreditStep } = require('../src/chain/credit');
const { createWatcher } = require('../src/chain/watcher');
const { linkIdentity } = require('../src/cardano');
const { createRecipeBook, SAMPLE } = require('../src/lab/recipes');
const { ProviderError } = require('../src/chain/provider');
const { closeTestPools } = require('./helpers/db');
const { testKeys } = require('./helpers/cardano');
const { markMinted } = require('./helpers/mintedItems');
const { createChainDouble } = require('./chainDouble');
const { createChainApp, K_FINAL } = require('./helpers/chainApp');
const { mintedItem, burnRequest, signBurn } = require('./helpers/burns');
const { policyId, HOUR, SLOTS_PER_BLOCK, BLOCK_MS, userName, silentLog, stake, giveItem } = require('./helpers/minting');
const live = require('./helpers/live');

afterAll(closeTestPools);
// the expiry test runs the watcher some 70 times over the double
jest.setTimeout(120_000);

const T = EntityType;
const { ClientMessage, ServerMessage } = protocol;
const recipes = () => createRecipeBook(JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).recipes);

/** Anna (10 matches, 20 ADA) with a TURBO_CONVEYOR minted through the API, final, in her factory's first slot; the server's three steps. */
const setup = async () => {
    const book = recipes();
    const env = await createChainApp({ steps: [operationsStep], stepsAfter: [createCreditStep({ recipes: book })], recipes: book });
    const anna = await env.player('Anna', { lovelace: [20_000_000], matches: 10 });
    const { itemId, assetName, account } = await mintedItem(env, anna);
    await account.post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId });
    return { env, anna, itemId, assetName };
};

const statsOf = async (env, player) => (await (await env.refreshed(player.account)).get('/user').expect(200)).body.stats;
const markIn = (stats, itemId) => stats.items.find(item => item.id === itemId)?.minted;
/** POST /user/equipment as `player`: the response, its status checked against `status`. */
const equip = async (env, player, body, status = 200) => {
    const response = await (await env.refreshed(player.account)).post('/user/equipment', body);
    expect(response.status).toBe(status);
    return response;
};
const IN_LOADOUT = { [T.FACTORY]: ['TURBO_CONVEYOR'] };

describe('a burn through the game', () => {
    test('prepared: minted and usable, the mark carries the operation; signed: burning, out of the loadout, not equippable, still in its slot; in a block: burning; credited: gone', async () => {
        const { env, anna, itemId, assetName } = await setup();
        const prepared = (await burnRequest(await env.refreshed(anna.account), anna, itemId).expect(201)).body;
        let stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'minted', operationId: prepared.operation.id, signing: true, kind: 'burn' });
        expect(stats.loadout).toEqual(IN_LOADOUT);
        await equip(env, anna, { entityType: T.FACTORY, slot: 1, itemId });
        await equip(env, anna, { entityType: T.FACTORY, slot: 0, itemId });

        // signed and sent, not in a block yet (depth 0 of nothing)
        await signBurn(env, anna, prepared).expect(200);
        stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'burning', operationId: prepared.operation.id });
        expect(stats.loadout).toEqual({});
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });
        expect((await equip(env, anna, { entityType: T.FACTORY, slot: 1, itemId }, 400)).body.error).toBe('NOT YOUR ITEM');

        env.block();
        await env.runOnce();
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'included' });
        stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'burning', operationId: prepared.operation.id });
        expect(stats.loadout).toEqual({});

        for (let i = 0; i < K_FINAL; i++) {
            env.block();
            await env.runOnce();
        }
        stats = await statsOf(env, anna);
        expect(stats.items.map(item => item.id)).not.toContain(itemId);
        expect(stats.equipment).toEqual({});
        expect(stats.loadout).toEqual({});
    });

    test('a burn that never lands expires: minted again, in its slot and in the loadout', async () => {
        const { env, anna, itemId, assetName } = await setup();
        const prepared = (await burnRequest(await env.refreshed(anna.account), anna, itemId).expect(201)).body;
        env.double.holdMempool(true);
        await signBurn(env, anna, prepared).expect(200);
        expect(markIn(await statsOf(env, anna), itemId)).toMatchObject({ state: 'burning' });
        for (let i = 0; i < 200 && (await ops.byId(env.pool, prepared.operation.id)).state !== 'expired'; i++) {
            env.block();
            await env.runOnce();
            if (i === 10) {
                expect((await statsOf(env, anna)).loadout).toEqual({});
            }
        }
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'expired', error: 'expired' });
        const stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'minted' });
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });
        expect(stats.loadout).toEqual(IN_LOADOUT);
        await equip(env, anna, { entityType: T.FACTORY, slot: 1, itemId });
    });

    test('included, then its block rolled back: submitted again and still burning (it may land any time until its ttl), out of the loadout; once it can no longer land it expires: minted, in its slot and the loadout', async () => {
        const { env, anna, itemId, assetName } = await setup();
        const prepared = (await burnRequest(await env.refreshed(anna.account), anna, itemId).expect(201)).body;
        await signBurn(env, anna, prepared).expect(200);
        env.block();
        await env.runOnce();
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'included' });

        // the block rolled back, the transaction dropped, and no node takes it again
        env.double.rollback(1, { drop: true });
        const submit = jest.spyOn(env.chain.provider, 'submit').mockRejectedValue(new ProviderError('unavailable', 'no answer'));
        env.block();
        await env.runOnce();
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'submitted', included_block: null });
        expect((await env.pool.query('SELECT burn_tx FROM items WHERE id = $1', [itemId])).rows[0].burn_tx).toBeNull();
        let stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'burning', operationId: prepared.operation.id });
        expect(stats.loadout).toEqual({});
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });

        for (let i = 0; i < 200 && (await ops.byId(env.pool, prepared.operation.id)).state !== 'expired'; i++) {
            env.block();
            await env.runOnce();
            if (i === 10) {
                expect(markIn(await statsOf(env, anna), itemId)).toMatchObject({ state: 'burning' });
            }
        }
        submit.mockRestore();
        expect(await ops.byId(env.pool, prepared.operation.id)).toMatchObject({ state: 'expired', error: 'expired' });
        stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'minted' });
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });
        expect(stats.loadout).toEqual(IN_LOADOUT);
    });
});

describe('a burn outside the game (the sync sees it: items.burn_tx)', () => {
    test('burning at depth 0 with no operation; rolled back: minted, in its slot and loadout again', async () => {
        const { env, anna, itemId, assetName } = await setup();
        const burn = env.double.burnToken({ assetName });
        env.block();
        await env.runOnce();
        expect((await env.pool.query('SELECT burn_tx FROM items WHERE id = $1', [itemId])).rows[0].burn_tx).toBe(burn);
        let stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'burning', operationId: null });
        expect(stats.loadout).toEqual({});
        // a block deeper, the same
        env.block();
        await env.runOnce();
        expect(markIn(await statsOf(env, anna), itemId)).toMatchObject({ state: 'burning' });

        env.double.rollback(2, { drop: true });
        env.block();
        await env.runOnce();
        stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'minted' });
        expect(stats.equipment).toEqual({ [T.FACTORY]: [itemId, null] });
        expect(stats.loadout).toEqual(IN_LOADOUT);
        expect(stats.notices).toEqual([]);
    });

    test('a slot refilled while the item burned keeps what was put there: after the rollback the item is minted, not in a slot', async () => {
        const { env, anna, itemId, assetName } = await setup();
        const other = await env.giveItem(anna.playerId, 'TURBO_CONVEYOR');
        env.double.burnToken({ assetName });
        env.block();
        await env.runOnce();
        await equip(env, anna, { entityType: T.FACTORY, slot: 0, itemId: other });
        env.double.rollback(1, { drop: true });
        env.block();
        await env.runOnce();
        const stats = await statsOf(env, anna);
        expect(markIn(stats, itemId)).toEqual({ assetName, state: 'minted' });
        expect(stats.equipment).toEqual({ [T.FACTORY]: [other, null] });
        expect(stats.loadout).toEqual(IN_LOADOUT);
    });
});

describe('matches', () => {
    afterEach(live.stopAll);

    // a live server and a player with a minted LIGHT_BARREL in the first slot of their rum truffle
    // cannon, on a double whose watcher runs the ownership sync
    const equippedPlayer = async () => {
        let clock = Date.now();
        const now = () => clock;
        const env = await live.start();
        const double = createChainDouble({ policyId, now, slotsPerBlock: SLOTS_PER_BLOCK });
        const chain = { enabled: true, network: cardano.Networks.preprod, policyId, kFinal: 10, indexMaxLagMs: 600000, provider: double.provider(), index: double.index() };
        const watcher = createWatcher({ chain, pool: env.pool, steps: [ownershipStep], intervalMs: 20000, now, log: silentLog() });
        const block = () => {
            clock += BLOCK_MS;
            double.produceBlocks();
        };
        const client = await live.player(env, { score: 150 });
        const keys = testKeys();
        await linkIdentity(env.pool, { playerId: client.account.playerId, subject: stake(keys), address: keys.rewardAddress, linkedAt: new Date(clock - HOUR) });
        const itemId = await giveItem(env.pool, client.account.playerId, 'LIGHT_BARREL');
        await env.pool.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify({ [T.RUM_TRUFFLE_CANNON]: [itemId, null] }), client.account.playerId]);
        await markMinted(env.pool, itemId, userName(1));
        double.mintToken({ assetName: userName(1), to: double.addressOf(keys) });
        block();
        await watcher.runOnce();
        const burn = async () => {
            double.burnToken({ assetName: userName(1) });
            block();
            await watcher.runOnce();
        };
        return { env, client, burn };
    };

    test('a match that starts while the item burns does not carry it', async () => {
        const { env, client, burn } = await equippedPlayer();
        await burn();
        client.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, playerIndex } = await client.next(ServerMessage.MATCH);
        expect(live.room(env, matchId).match.players[playerIndex].loadout).toEqual({});
    });

    test('a running match keeps what it started with (as for a token that left, plan C)', async () => {
        const { env, client, burn } = await equippedPlayer();
        client.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, playerIndex } = await client.next(ServerMessage.MATCH);
        await burn();
        expect(live.room(env, matchId).match.players[playerIndex].loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        const stats = (await request(env.app).get('/user').set('Authorization', `Bearer ${client.account.accessToken}`).expect(200)).body.stats;
        expect(stats.items[0].minted).toMatchObject({ state: 'burning' });
        expect(stats.loadout).toEqual({});
    });
});
