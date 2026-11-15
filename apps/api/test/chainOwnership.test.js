// The ownership sync (plan C, Task 7): a minted item belongs, in the game, to the player whose
// linked wallet holds its token on the chain. Each test links keys through the API, gives a player
// an item, marks it minted and mints its token on the chain double; the watcher's runOnce runs the
// sync, which moves the item between inventories and writes the notices players see.

const request = require('supertest');
const { Address, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { cardano, chain: rules, live: protocol, EntityType } = require('@battlechoc/battlechoc-shared-functions');
const { createChainDouble } = require('./chainDouble');
const { createWatcher } = require('../src/chain/watcher');
const { ownershipStep, decideOwner, candidates } = require('../src/chain/ownership');
const { noticeChange } = require('../src/chain/notices');
const { holderOf } = require('../src/chain/addresses');
const { linkIdentity } = require('../src/cardano');
const { createAccount } = require('./helpers/api');
const { closeTestPools, intercepted } = require('./helpers/db');
const { testKeys, confirmWith, removeKey } = require('./helpers/cardano');
const {
    policyId, HOUR, T0, SLOTS_PER_BLOCK, BLOCK_MS, userName, silentLog, stake, pay, markMinted, giveItem, chainApp: setup, link, linkedPlayer, annWithMintedItem,
} = require('./helpers/minting');
const live = require('./helpers/live');

const { ClientMessage, ServerMessage } = protocol;

afterAll(closeTestPools);

const { preprod } = cardano.Networks;
const T = EntityType;

const itemRow = async (pool, id) => (await pool.query('SELECT player_id, holder_subject, holder_pay, holder_since FROM items WHERE id = $1', [id])).rows[0];
const noticesOf = async (pool, itemId) =>
    (await pool.query('SELECT player_id, kind, building, seen_at FROM item_notices WHERE item_id = $1 ORDER BY created_at, kind', [itemId])).rows.map(row => ({
        playerId: row.player_id,
        kind: row.kind,
        building: row.building,
        seen: row.seen_at !== null,
    }));
const equipmentOf = async (pool, playerId) => (await pool.query('SELECT equipment FROM players WHERE id = $1', [playerId])).rows[0].equipment;
const statsOf = async account => (await account.get('/user').expect(200)).body.stats;

describe('who holds the token owns the item', () => {
    test('a minted item in its minter\'s wallet stays theirs; a second run changes nothing', async () => {
        const env = await setup();
        const { ann, annKeys, itemId } = await annWithMintedItem(env);
        const synced = await itemRow(env.pool, itemId);
        // the mint is in the tip block (depth 0): the item never left Ann
        expect(synced).toEqual({ player_id: ann.playerId, holder_subject: stake(annKeys), holder_pay: pay(annKeys), holder_since: new Date(env.now()) });
        env.advance(5000);
        expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 0, failed: 0, skipped: null });
        expect(await itemRow(env.pool, itemId)).toEqual(synced);
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        // a run that changed nothing logs nothing
        expect(env.log.info).not.toHaveBeenCalledWith(expect.stringMatching(/ownership/));
        expect(env.log.warn).not.toHaveBeenCalled();
        expect(env.log.error).not.toHaveBeenCalled();
    });

    test('a transfer to a stranger leaves at depth 0', async () => {
        const env = await setup();
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const equipment = await equipmentOf(env.pool, ann.playerId);
        const stranger = env.double.newAddress();
        env.double.moveToken({ assetName, to: stranger });
        env.block();
        expect(await env.sync()).toMatchObject({ checked: 1, changed: 1 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
        // the slot keeps the item's id (it is in it again when the item comes back), the loadout leaves it out
        expect(await equipmentOf(env.pool, ann.playerId)).toEqual(equipment);
        const stats = await statsOf(ann);
        expect(stats.items.map(item => item.id)).not.toContain(itemId);
        expect(stats.loadout).toEqual({});
        expect(env.log.info).toHaveBeenCalledTimes(1);
        expect(env.log.info.mock.calls[0][0]).toMatch(/ownership.*1/);
        // and it stays away, without a second notice
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 0 });
        expect(await noticesOf(env.pool, itemId)).toHaveLength(1);
    });

    test('a transfer to another player arrives at depth >= 1', async () => {
        const env = await setup();
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const benKeys = testKeys();
        const ben = await linkedPlayer(env, 'Ben', benKeys);
        env.double.moveToken({ assetName, to: env.double.addressOf(benKeys) });
        env.block();
        await env.sync();
        // Ann loses it at once, Ben has it only one block later
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, holder_subject: stake(benKeys), holder_pay: pay(benKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ben.playerId, holder_subject: stake(benKeys), holder_pay: pay(benKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([
            { playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false },
            { playerId: ben.playerId, kind: 'arrived', building: null, seen: false },
        ]);
        expect((await statsOf(ben)).items.map(item => item.id)).toEqual([itemId]);
        // Ben's equipment is his own: the item is in none of his slots until he puts it there
        expect((await statsOf(ben)).loadout).toEqual({});
    });

    test('a move between two keys of the same player is no departure, also at depth 0', async () => {
        const env = await setup();
        const annKeys = testKeys();
        const second = testKeys();
        const ann = await linkedPlayer(env, 'Ann', annKeys, second);
        const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
        await ann.post('/user/equipment', { entityType: T.RUM_TRUFFLE_CANNON, slot: 0, itemId }).expect(200);
        await markMinted(env.pool, itemId, userName(1));
        env.double.mintToken({ assetName: userName(1), to: env.double.addressOf(annKeys) });
        env.block();
        await env.sync();
        // to her second wallet
        env.double.moveToken({ assetName: userName(1), to: env.double.addressOf(second) });
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: stake(second) });
        // to a change address of her first wallet: another payment key, her stake key
        const change = env.double.addressOf({ paymentKeyHashHex: testKeys().paymentKeyHashHex, stakeKeyHashHex: annKeys.stakeKeyHashHex });
        env.double.moveToken({ assetName: userName(1), to: change });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
    });

    test('a listed item is away: a script address holds it, whatever its stake part', async () => {
        const env = await setup();
        const { ann, annKeys, itemId, assetName } = await annWithMintedItem(env);
        const listing = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('5c'.repeat(28)), stakingCredential: KeyHash.fromHex(annKeys.stakeKeyHashHex) }));
        env.double.moveToken({ assetName, to: listing });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, holder_subject: null, holder_pay: null });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
    });

    test('an enterprise address counts by its payment key; a base address of an unlinked stake key falls back to its linked payment key', async () => {
        const env = await setup();
        const annKeys = testKeys();
        const ann = await createAccount(env.app, { username: 'Ann' });
        expect(await link(env, ann, annKeys, { kind: 'pay' })).toMatchObject({ subject: pay(annKeys) });
        const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
        await markMinted(env.pool, itemId, userName(1));
        env.double.mintToken({ assetName: userName(1), to: env.double.addressOf(annKeys, 'enterprise') });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: pay(annKeys), holder_pay: pay(annKeys) });
        // her base address: its stake key is linked to nobody, its payment key to Ann
        env.double.moveToken({ assetName: userName(1), to: env.double.addressOf(annKeys) });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys), holder_pay: pay(annKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
    });

    test('a burned token leaves the inventory at depth 0: the index knows its burn', async () => {
        const env = await setup();
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        env.double.burnToken({ assetName });
        env.block();
        expect(await env.sync()).toEqual({ checked: 1, changed: 1, unknown: 0, failed: 0, skipped: null });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, holder_subject: null, holder_pay: null });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
    });

    test('a token minted, burned and minted again is judged by its holder', async () => {
        const env = await setup();
        const { ann, annKeys, itemId, assetName } = await annWithMintedItem(env);
        const synced = await itemRow(env.pool, itemId);
        env.double.burnToken({ assetName });
        env.double.mintToken({ assetName, to: env.double.addressOf(annKeys) });
        env.block();
        expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 0, failed: 0, skipped: null });
        expect(await itemRow(env.pool, itemId)).toEqual(synced);
        expect(synced).toMatchObject({ player_id: ann.playerId });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
    });

    test('an item owned through a payment key leaves when the token moves to another payment key under the same stake key (linked to nobody)', async () => {
        const env = await setup();
        const annKeys = testKeys();
        const ann = await createAccount(env.app, { username: 'Ann' });
        await link(env, ann, annKeys, { kind: 'pay' });
        const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
        await ann.post('/user/equipment', { entityType: T.RUM_TRUFFLE_CANNON, slot: 0, itemId }).expect(200);
        await markMinted(env.pool, itemId, userName(1));
        env.double.mintToken({ assetName: userName(1), to: env.double.addressOf(annKeys) });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys), holder_pay: pay(annKeys) });
        // the same stake key (nobody's), a payment key that is not Ann's
        const otherPay = testKeys().paymentKeyHashHex;
        env.advance(HOUR);
        env.double.moveToken({ assetName: userName(1), to: env.double.addressOf({ paymentKeyHashHex: otherPay, stakeKeyHashHex: annKeys.stakeKeyHashHex }) });
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: null, holder_subject: stake(annKeys), holder_pay: `pay:${otherPay}`, holder_since: new Date(env.now()) });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
    });

    test('a move to another payment key under the player\'s own stake key is no departure; holder_since starts again', async () => {
        const env = await setup();
        const { ann, annKeys, itemId, assetName } = await annWithMintedItem(env);
        const changePay = testKeys().paymentKeyHashHex;
        env.advance(5000);
        env.double.moveToken({ assetName, to: env.double.addressOf({ paymentKeyHashHex: changePay, stakeKeyHashHex: annKeys.stakeKeyHashHex }) });
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toEqual({ player_id: ann.playerId, holder_subject: stake(annKeys), holder_pay: `pay:${changePay}`, holder_since: new Date(env.now()) });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
    });

    test('a row whose holder_pay alone is off (set by hand here: the sync always writes it with holder_subject, from the same holder) is corrected as a move of the holder: the same owner, no notice', async () => {
        const env = await setup();
        const { ann, annKeys, itemId } = await annWithMintedItem(env);
        await env.pool.query('UPDATE items SET holder_pay = NULL WHERE id = $1', [itemId]);
        const before = await itemRow(env.pool, itemId);
        env.advance(5000);
        env.block();
        expect(await env.sync()).toMatchObject({ checked: 1, changed: 1, failed: 0 });
        expect(await itemRow(env.pool, itemId)).toEqual({ ...before, holder_pay: pay(annKeys), holder_since: new Date(env.now()) });
        expect(before).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect(await env.sync()).toMatchObject({ changed: 0 });
    });
});

describe('the wallet hop wait', () => {
    test('Ben\'s wallet, linked by Cara an hour after Ben removed it: nobody\'s until 24 h after Cara\'s link, then Cara\'s', async () => {
        const env = await setup();
        const wallet = testKeys();
        const other = testKeys();
        const ben = await linkedPlayer(env, 'Ben', wallet, other);
        const itemId = await giveItem(env.pool, ben.playerId, 'LIGHT_BARREL');
        await markMinted(env.pool, itemId, userName(1));
        env.double.mintToken({ assetName: userName(1), to: env.double.addressOf(wallet) });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ben.playerId });

        const { confirmToken } = (await confirmWith(env.app, ben, other)).body;
        await removeKey(env.app, ben, stake(wallet), confirmToken).expect(204);
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null, holder_subject: stake(wallet) });

        env.advance(HOUR);
        const cara = await createAccount(env.app, { username: 'Cara' });
        await link(env, cara, wallet);
        const linkedAt = env.now();
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        // a second before the wait ends
        env.advance(linkedAt + rules.WALLET_HOP_WAIT_MS - BLOCK_MS - 1000 - env.now());
        env.block();
        expect(env.now()).toBe(linkedAt + rules.WALLET_HOP_WAIT_MS - 1000);
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        env.advance(1000 - BLOCK_MS);
        env.block();
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: cara.playerId, holder_subject: stake(wallet) });
        // the token never moved: no departure for Ben, an arrival for Cara
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: cara.playerId, kind: 'arrived', building: null, seen: false }]);
    });
});

describe('rollbacks', () => {
    test('a rollback corrects itself: the unseen departure is withdrawn, no arrival', async () => {
        const env = await setup();
        const { ann, annKeys, itemId, assetName } = await annWithMintedItem(env);
        env.double.moveToken({ assetName, to: env.double.newAddress() });
        env.block();
        await env.sync();
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
        env.double.rollback(1, { drop: true });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId, holder_subject: stake(annKeys) });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
    });

    test('a departure Ann has seen is followed by an arrival when the rollback brings the item back', async () => {
        const env = await setup();
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        env.double.moveToken({ assetName, to: env.double.newAddress() });
        env.block();
        await env.sync();
        await env.pool.query('UPDATE item_notices SET seen_at = $2 WHERE item_id = $1', [itemId, new Date(env.now())]);
        env.double.rollback(1, { drop: true });
        env.block();
        await env.sync();
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId });
        expect(await noticesOf(env.pool, itemId)).toEqual([
            { playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: true },
            { playerId: ann.playerId, kind: 'arrived', building: null, seen: false },
        ]);
    });
});

describe('the items the sync looks at', () => {
    test('minted, unburned items by asset name, page after page (pg-mem found no page after the first with asset_name IS NOT NULL beside asset_name > $1)', async () => {
        const env = await setup();
        const ann = await createAccount(env.app, { username: 'Ann' });
        const ids = [];
        for (const n of [3, 1, 2, 4]) {
            const id = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
            ids[n] = id;
            if (n !== 4) {
                await markMinted(env.pool, id, userName(n));
            }
        }
        await giveItem(env.pool, ann.playerId, 'HEAVY_BARREL');
        await env.pool.query('UPDATE items SET burned_at = $2 WHERE id = $1', [ids[2], new Date(env.now())]);
        expect((await candidates(env.pool, null)).map(row => row.id)).toEqual([ids[1], ids[3]]);
        expect((await candidates(env.pool, userName(1))).map(row => row.id)).toEqual([ids[3]]);
        expect(await candidates(env.pool, userName(3))).toEqual([]);
        // the page size is the caller's
        expect((await candidates(env.pool, null, 1)).map(row => row.id)).toEqual([ids[1]]);
    });

    test('a run over three pages reads and judges each page, then stops', async () => {
        const asked = [];
        const env = await setup({
            batchSize: 2,
            wrapIndex: index => ({
                ...index,
                holdersOf: async names => {
                    asked.push(names);
                    return index.holdersOf(names);
                },
            }),
        });
        const annKeys = testKeys();
        const ann = await linkedPlayer(env, 'Ann', annKeys);
        const ids = [];
        for (let n = 1; n <= 6; n++) {
            const id = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
            await markMinted(env.pool, id, userName(n));
            env.double.mintToken({ assetName: userName(n), to: env.double.addressOf(annKeys) });
            ids.push(id);
        }
        env.block();
        expect(await env.sync()).toEqual({ checked: 6, changed: 6, unknown: 0, failed: 0, skipped: null });
        expect(asked).toEqual([[userName(1), userName(2)], [userName(3), userName(4)], [userName(5), userName(6)]]);
        // a change on each page
        asked.length = 0;
        for (const n of [2, 3, 6]) {
            env.double.moveToken({ assetName: userName(n), to: env.double.newAddress() });
        }
        env.block();
        expect(await env.sync()).toEqual({ checked: 6, changed: 3, unknown: 0, failed: 0, skipped: null });
        expect(asked).toHaveLength(3);
        const owners = await Promise.all(ids.map(async id => (await itemRow(env.pool, id)).player_id));
        expect(owners).toEqual([ann.playerId, null, null, ann.playerId, ann.playerId, null]);
    });
});

describe('what the sync does not act on', () => {
    test('a stale index moves nothing, nor an unavailable one; once it is back, the change happens', async () => {
        const env = await setup();
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const before = await itemRow(env.pool, itemId);
        env.double.moveToken({ assetName, to: env.double.newAddress() });
        env.block();
        const stale = { checked: 0, changed: 0, unknown: 0, failed: 0, skipped: 'index-stale' };
        env.double.fail({ index: 'stale' });
        expect(await env.sync()).toEqual(stale);
        env.double.fail({ index: 'unavailable' });
        expect(await env.sync()).toEqual(stale);
        expect(await itemRow(env.pool, itemId)).toEqual(before);
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        env.double.fail({});
        expect(await env.sync()).toMatchObject({ changed: 1, skipped: null });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ann.playerId, kind: 'departed', building: T.RUM_TRUFFLE_CANNON, seen: false }]);
    });

    test('an item whose mint the index does not know stays as it is (an index started late or with another policy), over several runs', async () => {
        const env = await setup();
        const { ann, itemId } = await annWithMintedItem(env, { n: 1 });
        // marked minted, but the double never minted its token
        const unknownId = await giveItem(env.pool, ann.playerId, 'HEAVY_BARREL');
        await markMinted(env.pool, unknownId, userName(2));
        const before = await itemRow(env.pool, unknownId);
        for (let i = 0; i < 3; i++) {
            env.block();
            expect(await env.sync()).toEqual({ checked: 2, changed: 0, unknown: 1, failed: 0, skipped: null });
        }
        expect(await itemRow(env.pool, unknownId)).toEqual(before);
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId });
        expect(await noticesOf(env.pool, unknownId)).toEqual([]);
        expect((await statsOf(ann)).items.map(item => item.id).sort()).toEqual([itemId, unknownId].sort());
        // one line for the three runs, a count, no asset name
        expect(env.log.warn).toHaveBeenCalledTimes(1);
        expect(env.log.warn.mock.calls[0].join(' ')).toMatch(/1 of 2/);
        expect(env.log.warn.mock.calls[0].join(' ')).not.toContain(userName(2));
    });

    test('a lasting condition is logged once, again when its count changes, and once when it clears', async () => {
        const env = await setup();
        const { ann } = await annWithMintedItem(env, { n: 1 });
        const second = await giveItem(env.pool, ann.playerId, 'HEAVY_BARREL');
        await markMinted(env.pool, second, userName(2));
        await env.sync();
        await env.sync();
        expect(env.log.warn).toHaveBeenCalledTimes(1);
        expect(env.log.warn.mock.calls[0][0]).toMatch(/1 of 2/);
        const third = await giveItem(env.pool, ann.playerId, 'DARK_WALLS');
        await markMinted(env.pool, third, userName(3));
        await env.sync();
        await env.sync();
        expect(env.log.warn).toHaveBeenCalledTimes(2);
        expect(env.log.warn.mock.calls[1][0]).toMatch(/2 of 3/);
        // the index learns both mints: one line that it cleared, then quiet
        env.double.mintToken({ assetName: userName(2), to: env.double.newAddress() });
        env.double.mintToken({ assetName: userName(3), to: env.double.newAddress() });
        env.block();
        env.log.info.mockClear();
        await env.sync();
        await env.sync();
        expect(env.log.warn).toHaveBeenCalledTimes(2);
        expect(env.log.info.mock.calls.filter(call => /accounts for every minted item/.test(call[0]))).toHaveLength(1);
    });

    test('a token whose mint the index knows, that no output holds and whose burn it does not know (an incomplete index), stays as it is, counted unknown, over several runs', async () => {
        const hidden = new Set();
        const env = await setup({ wrapIndex: index => ({ ...index, holdersOf: async names => (await index.holdersOf(names)).filter(holder => !hidden.has(holder.assetName)) }) });
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const before = await itemRow(env.pool, itemId);
        hidden.add(assetName);
        for (let i = 0; i < 3; i++) {
            env.block();
            expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 1, failed: 0, skipped: null });
        }
        expect(await itemRow(env.pool, itemId)).toEqual(before);
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        expect(env.log.warn).toHaveBeenCalledTimes(1);
    });

    test('two unspent outputs of one token (an index that lost a spend) leave the item as it is, counted unknown', async () => {
        let twin = null;
        const env = await setup({
            wrapIndex: index => ({
                ...index,
                holdersOf: async names => {
                    const rows = await index.holdersOf(names);
                    const held = rows.find(row => twin && row.assetName === twin.assetName);
                    // an older output at a stranger's address, listed first: "the oldest" would give it to the stranger
                    return held ? [{ ...held, address: twin.address, ...holderOf(twin.address), txHash: 'ee'.repeat(32), index: 0, blockNo: held.blockNo - 1, slot: held.slot - SLOTS_PER_BLOCK }, ...rows] : rows;
                },
            }),
        });
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const before = await itemRow(env.pool, itemId);
        twin = { assetName, address: env.double.newAddress() };
        for (let i = 0; i < 2; i++) {
            env.block();
            expect(await env.sync()).toEqual({ checked: 1, changed: 0, unknown: 1, failed: 0, skipped: null });
        }
        expect(await itemRow(env.pool, itemId)).toEqual(before);
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        expect((await statsOf(ann)).items.map(item => item.id)).toEqual([itemId]);
    });

    test('items that are not minted, or burned in the game, are not looked at', async () => {
        const env = await setup();
        const { ann } = await annWithMintedItem(env);
        const plain = await giveItem(env.pool, ann.playerId, 'HEAVY_BARREL');
        const burned = await giveItem(env.pool, ann.playerId, 'DARK_WALLS');
        await markMinted(env.pool, burned, userName(3));
        await env.pool.query('UPDATE items SET burned_at = $2 WHERE id = $1', [burned, new Date(env.now())]);
        expect(await env.sync()).toMatchObject({ checked: 1, unknown: 0 });
        expect(await itemRow(env.pool, plain)).toMatchObject({ player_id: ann.playerId, holder_subject: null });
        expect(await itemRow(env.pool, burned)).toMatchObject({ player_id: ann.playerId, holder_subject: null });
    });
});

describe('beside the players\' own requests', () => {
    test('a concurrent change wins: the guarded update matches nothing, no notice; the next run decides again', async () => {
        let interfere = null;
        const env = await setup({
            wrapPool: pool =>
                intercepted(pool, async (sql, run) => {
                    if (interfere && /^UPDATE items SET player_id/.test(sql)) {
                        const change = interfere;
                        interfere = null;
                        await change(pool);
                    }
                    return run();
                }),
        });
        const { ann, itemId, assetName } = await annWithMintedItem(env);
        const benKeys = testKeys();
        const ben = await linkedPlayer(env, 'Ben', benKeys);
        env.double.moveToken({ assetName, to: env.double.newAddress() });
        env.block();
        // between the sync's read and its update, the row changes (here: by hand, to Ben)
        interfere = pool => pool.query('UPDATE items SET player_id = $2 WHERE id = $1', [itemId, ben.playerId]);
        expect(await env.sync()).toMatchObject({ checked: 1, changed: 0, failed: 0 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ben.playerId });
        expect(await noticesOf(env.pool, itemId)).toEqual([]);
        // the next run starts from what is there now
        expect(await env.sync()).toMatchObject({ changed: 1 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        expect(await noticesOf(env.pool, itemId)).toEqual([{ playerId: ben.playerId, kind: 'departed', building: null, seen: false }]);
        expect(ann.playerId).not.toBe(ben.playerId);
    });

    test('one item\'s failure does not stop the others: it is logged and counted', async () => {
        let broken = null;
        const env = await setup({
            wrapPool: pool => intercepted(pool, (sql, run, params) => (broken && /^UPDATE items SET player_id/.test(sql) && params?.[0] === broken ? Promise.reject(new Error('injected failure')) : run())),
        });
        const { ann, itemId, assetName } = await annWithMintedItem(env, { n: 1 });
        const secondId = await giveItem(env.pool, ann.playerId, 'HEAVY_BARREL');
        await markMinted(env.pool, secondId, userName(2));
        env.double.mintToken({ assetName: userName(2), to: env.double.addressOf(testKeys()) });
        env.double.moveToken({ assetName, to: env.double.newAddress() });
        env.block();
        broken = itemId;
        expect(await env.sync()).toEqual({ checked: 2, changed: 1, unknown: 0, failed: 1, skipped: null });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: ann.playerId });
        expect(await itemRow(env.pool, secondId)).toMatchObject({ player_id: null });
        expect(env.log.error).toHaveBeenCalledTimes(1);
        expect(env.log.error.mock.calls[0][0]).toMatch(/ownership.*1/);
        expect(env.log.error.mock.calls[0][1]).toMatchObject({ message: 'injected failure' });
        // the same failure again: no second line
        expect(await env.sync()).toMatchObject({ changed: 0, failed: 1 });
        expect(env.log.error).toHaveBeenCalledTimes(1);
        broken = null;
        env.log.info.mockClear();
        expect(await env.sync()).toMatchObject({ changed: 1, failed: 0 });
        expect(await itemRow(env.pool, itemId)).toMatchObject({ player_id: null });
        // one line that it cleared
        expect(env.log.info.mock.calls.filter(call => /no item fails/.test(call[0]))).toHaveLength(1);
        await env.sync();
        expect(env.log.info.mock.calls.filter(call => /no item fails/.test(call[0]))).toHaveLength(1);
        expect(env.log.error).toHaveBeenCalledTimes(1);
    });

    test('the sync never writes players.equipment; an equipped item that left does not break the next equipment change', async () => {
        const env = await setup();
        const annKeys = testKeys();
        const ann = await linkedPlayer(env, 'Ann', annKeys);
        const turbo = await giveItem(env.pool, ann.playerId, 'TURBO_CONVEYOR');
        const ears = await giveItem(env.pool, ann.playerId, 'LONG_EARS');
        const boiler = await giveItem(env.pool, ann.playerId, 'HOT_BOILER');
        await ann.post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId: turbo }).expect(200);
        await ann.post('/user/equipment', { entityType: T.SPYING_EASTER_BUNNY, slot: 0, itemId: ears }).expect(200);
        // 5 + 5 points: the budget of 10 is full
        expect((await ann.post('/user/equipment', { entityType: T.HOT_CHOCOLATE_BALLISTA, slot: 0, itemId: boiler }).expect(400)).body.error).toBe('OVER BUDGET');
        await markMinted(env.pool, turbo, userName(1));
        env.double.mintToken({ assetName: userName(1), to: env.double.newAddress() });
        env.block();
        const equipment = await equipmentOf(env.pool, ann.playerId);
        await env.sync();
        expect(await itemRow(env.pool, turbo)).toMatchObject({ player_id: null });
        expect(await equipmentOf(env.pool, ann.playerId)).toEqual(equipment);
        // the away item still sits in its slot, but counts for nothing
        const answer = (await ann.post('/user/equipment', { entityType: T.HOT_CHOCOLATE_BALLISTA, slot: 0, itemId: boiler }).expect(200)).body;
        expect(answer.equipment[T.FACTORY]).toEqual([turbo, null]);
        expect(answer.loadout).toEqual({ [T.SPYING_EASTER_BUNNY]: ['LONG_EARS'], [T.HOT_CHOCOLATE_BALLISTA]: ['HOT_BOILER'] });
        // taking it out of its slot works as well
        await ann.post('/user/equipment', { entityType: T.FACTORY, slot: 0, itemId: null }).expect(200);
    });
});

describe('a running match', () => {
    afterEach(live.stopAll);

    test('keeps its loadout when an item leaves: the room took it at the start', async () => {
        let clock = Date.now();
        const now = () => clock;
        const env = await live.start();
        const double = createChainDouble({ policyId, now, slotsPerBlock: SLOTS_PER_BLOCK });
        const chain = { enabled: true, network: preprod, policyId, kFinal: 10, indexMaxLagMs: 600000, provider: double.provider(), index: double.index() };
        const watcher = createWatcher({ chain, pool: env.pool, steps: [ownershipStep], intervalMs: 20000, now, log: silentLog() });
        const block = () => {
            clock += BLOCK_MS;
            double.produceBlocks();
        };
        const equipped = await live.player(env, { score: 150 });
        const annKeys = testKeys();
        await linkIdentity(env.pool, { playerId: equipped.account.playerId, subject: stake(annKeys), address: annKeys.rewardAddress, linkedAt: new Date(clock - HOUR) });
        const itemId = await giveItem(env.pool, equipped.account.playerId, 'LIGHT_BARREL');
        await env.pool.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify({ [T.RUM_TRUFFLE_CANNON]: [itemId, null] }), equipped.account.playerId]);
        await markMinted(env.pool, itemId, userName(1));
        double.mintToken({ assetName: userName(1), to: double.addressOf(annKeys) });
        block();
        await watcher.runOnce();
        equipped.send({ type: ClientMessage.QUEUE_AI });
        const { matchId, playerIndex } = await equipped.next(ServerMessage.MATCH);
        double.moveToken({ assetName: userName(1), to: double.newAddress() });
        block();
        expect((await watcher.runOnce()).steps.ownership).toMatchObject({ changed: 1 });
        expect(live.room(env, matchId).match.players[playerIndex].loadout).toEqual({ [T.RUM_TRUFFLE_CANNON]: ['LIGHT_BARREL'] });
        const stats = (await request(env.app).get('/user').set('Authorization', `Bearer ${equipped.account.accessToken}`).expect(200)).body.stats;
        expect(stats.loadout).toEqual({});
    });
});

describe('decideOwner', () => {
    const P = 'player-p';
    const Q = 'player-q';
    const holder = (fields, blockNo = 100) => ({ stake: null, pay: null, blockNo, ...fields });
    const players = new Map([
        ['stake:p', { playerId: P, waitUntil: null }],
        ['pay:p', { playerId: P, waitUntil: null }],
        ['stake:q', { playerId: Q, waitUntil: null }],
        ['pay:q', { playerId: Q, waitUntil: null }],
        ['stake:waiting', { playerId: Q, waitUntil: T0 + HOUR }],
    ]);
    const decide = (fields, { current = P, tipBlockNo = 101, now = T0 } = {}) => decideOwner({ current, holder: fields, tipBlockNo, players, now });

    test('no output holds the token: nobody', () => {
        expect(decide(undefined)).toEqual({ playerId: null, holderSubject: null, holderPay: null });
        expect(decide(null)).toEqual({ playerId: null, holderSubject: null, holderPay: null });
    });

    test('the holder is the stake key, else the payment key; a script is nobody', () => {
        expect(decide(holder({ stake: 'stake:q', pay: 'pay:p' }))).toEqual({ playerId: Q, holderSubject: 'stake:q', holderPay: 'pay:p' });
        expect(decide(holder({ stake: 'stake:nobody', pay: 'pay:p' }))).toEqual({ playerId: P, holderSubject: 'stake:nobody', holderPay: 'pay:p' });
        expect(decide(holder({ pay: 'pay:q' }))).toEqual({ playerId: Q, holderSubject: 'pay:q', holderPay: 'pay:q' });
        expect(decide(holder({}))).toEqual({ playerId: null, holderSubject: null, holderPay: null });
        expect(decide(holder({ stake: 'stake:nobody' }))).toEqual({ playerId: null, holderSubject: 'stake:nobody', holderPay: null });
    });

    test('a wallet under the hop wait counts for nobody until the wait ends', () => {
        expect(decide(holder({ stake: 'stake:waiting' }), { current: null })).toEqual({ playerId: null, holderSubject: 'stake:waiting', holderPay: null });
        expect(decide(holder({ stake: 'stake:waiting' }), { current: null, now: T0 + HOUR })).toEqual({ playerId: Q, holderSubject: 'stake:waiting', holderPay: null });
    });

    test('depth 0: the current player keeps it, anyone else waits a block; depth >= 1: the holder\'s player', () => {
        expect(decide(holder({ stake: 'stake:p' }, 101))).toEqual({ playerId: P, holderSubject: 'stake:p', holderPay: null });
        expect(decide(holder({ stake: 'stake:q' }, 101))).toEqual({ playerId: null, holderSubject: 'stake:q', holderPay: null });
        expect(decide(holder({ stake: 'stake:q' }, 101), { current: null })).toEqual({ playerId: null, holderSubject: 'stake:q', holderPay: null });
        expect(decide(holder({ stake: 'stake:q' }, 100))).toEqual({ playerId: Q, holderSubject: 'stake:q', holderPay: null });
    });
});

describe('noticeChange', () => {
    test('nothing for nobody, nothing when nothing changed', async () => {
        const db = { query: jest.fn() };
        const item = { id: 'item-1' };
        await noticeChange(db, { item, from: null, to: null, holderMoved: true, building: null, now: T0 });
        await noticeChange(db, { item, from: 'p', to: 'p', holderMoved: true, building: null, now: T0 });
        // left without a move of the token (a removed key, a hop wait): no departure
        await noticeChange(db, { item, from: 'p', to: null, holderMoved: false, building: null, now: T0 });
        expect(db.query).not.toHaveBeenCalled();
    });
});
