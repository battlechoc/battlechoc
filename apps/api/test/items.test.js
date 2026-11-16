// The public data of a minted item (minting plan F): GET /items/:assetName, which the item page
// (battlechoc.com/item/?a=<asset name>, the URL in every token's datum) reads. No session; what the
// token is in the game: its item, tier, points, building, today's effects, serial, when it was
// minted and whether it was salvaged. Never its holder, its player or anything of the chain
// operations. One answer for every name that is not a minted item's (never existed, still
// minting, malformed), so the route cannot be used to probe; with the chain features on or off.

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { Items, cardano } = require('@battlechoc/battlechoc-shared-functions');
const players = require('../src/players');
const { closeTestPools } = require('./helpers/db');
const { createTestApp } = require('./helpers/api');

afterAll(closeTestPools);
afterEach(() => jest.restoreAllMocks());

const CONTRACT_KEYS = ['assetName', 'burnedAt', 'effects', 'entityType', 'item', 'mintedAt', 'points', 'serial', 'tier'];
const UNKNOWN = '{"error":"UNKNOWN ITEM"}';
const MINTED_AT = Date.UTC(2026, 10, 15, 9, 30, 12, 345);
const BURNED_AT = Date.UTC(2026, 10, 16, 18, 4, 5, 6);

// a user token's name (CIP-67 label 222 and a 28-byte suffix), as plan D stores it in items.asset_name
const userName = () => `000de140${crypto.randomBytes(28).toString('hex')}`;

/**
 * An item row of `playerId` as plan D leaves it once its mint is in a block (holder columns set,
 * which the answer must never carry); `assetName: null` and `mintedAt: null` for one not minted.
 */
const insertItem = async (pool, playerId, { item = 'TURBO_CONVEYOR', serial = 4, assetName = userName(), mintedAt = MINTED_AT, burnedAt = null } = {}) => {
    const id = crypto.randomUUID();
    await pool.query(
        `INSERT INTO items (id, player_id, item_key, serial, crafted_by, asset_name, minted_at, burned_at, holder_subject, holder_pay, holder_since)
         VALUES ($1, $2, $3, $4, $2, $5, $6, $7, $8, $9, $6)`,
        [id, playerId, item, serial, assetName, mintedAt === null ? null : new Date(mintedAt), burnedAt === null ? null : new Date(burnedAt),
            `stake:${'e1'.repeat(28)}`, `pay:${'f2'.repeat(28)}`]
    );
    return { id, assetName };
};

const setup = async options => {
    const env = await createTestApp(options);
    const playerId = await players.createPlayer(env.pool);
    await env.pool.query("UPDATE players SET username = 'Carolin' WHERE id = $1", [playerId]);
    // another player's minted item beside it, so the lookup must pick by name (and pg-mem finds it among several)
    await insertItem(env.pool, await players.createPlayer(env.pool), { item: 'DARK_WALLS', serial: 9 });
    return { ...env, playerId };
};

// the answer for every name that is not a minted item's: always this, never cached
const expectUnknown = response => {
    expect({ status: response.status, text: response.text }).toEqual({ status: 404, text: UNKNOWN });
    expect(response.type).toBe('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
};

describe('GET /items/:assetName', () => {
    test('a minted item\'s public data: exactly the contract\'s keys, cacheable for a minute, no session', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId);
        const response = await request(app).get(`/items/${assetName}`).expect(200);
        expect(Object.keys(response.body).sort()).toEqual(CONTRACT_KEYS);
        expect(response.body).toEqual({
            assetName,
            item: 'TURBO_CONVEYOR',
            entityType: Items.TURBO_CONVEYOR.entityType,
            tier: 'EPIC',
            points: 5,
            serial: 4,
            mintedAt: MINTED_AT,
            burnedAt: null,
            effects: [{ stat: 'buildIntervalMs', factor: 0.85 }, { stat: 'buildCapacity', add: -1 }],
        });
        expect(response.body.effects).toEqual(Items.TURBO_CONVEYOR.effects);
        expect(response.type).toBe('application/json');
        expect(response.headers['cache-control']).toBe('public, max-age=60');
        // a shared cache keeps one answer per origin (the CORS header differs by it)
        expect(response.headers.vary).toMatch(/\bOrigin\b/);
        // nothing of the holder, the player or the crafter, under any name
        for (const secret of [playerId, 'Carolin', 'e1'.repeat(28), 'f2'.repeat(28), 'holder', 'player', 'crafted']) {
            expect(response.text).not.toContain(secret);
        }
    });

    test('the effects are today\'s balance from the shared package, not anything stored at mint time', async () => {
        const pool = (await createTestApp()).pool;
        const playerId = await players.createPlayer(pool);
        const { assetName } = await insertItem(pool, playerId);
        const rebalanced = [{ stat: 'buildIntervalMs', factor: 0.8 }, { stat: 'buildCapacity', add: -2 }];
        // the route and the error middleware of one module registry (their HttpError is the same class)
        const app = express();
        jest.isolateModules(() => {
            jest.doMock('@battlechoc/battlechoc-shared-functions', () => {
                const actual = jest.requireActual('@battlechoc/battlechoc-shared-functions');
                return { ...actual, Items: { ...actual.Items, TURBO_CONVEYOR: { ...actual.Items.TURBO_CONVEYOR, effects: rebalanced } } };
            });
            require('../src/routes/items').registerItemRoutes(app, { pool, limit: (req, res, next) => next() });
            app.use(require('../src/middleware').errorHandler());
        });
        jest.dontMock('@battlechoc/battlechoc-shared-functions');
        expect((await request(app).get(`/items/${assetName}`).expect(200)).body.effects).toEqual(rebalanced);
    });

    test('a salvaged item still answers, with burnedAt', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId, { item: 'LIGHT_BARREL', serial: 12, burnedAt: BURNED_AT });
        // the token is gone, so is its holder
        await pool.query('UPDATE items SET player_id = NULL, holder_subject = NULL, holder_pay = NULL, holder_since = NULL WHERE asset_name = $1', [assetName]);
        const response = await request(app).get(`/items/${assetName}`).expect(200);
        expect(response.body).toEqual({
            assetName,
            item: 'LIGHT_BARREL',
            entityType: Items.LIGHT_BARREL.entityType,
            tier: 'COMMON',
            points: 2,
            serial: 12,
            mintedAt: MINTED_AT,
            burnedAt: BURNED_AT,
            effects: Items.LIGHT_BARREL.effects,
        });
        expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    test('still minting: the name is only the open operation\'s, the item has none yet → UNKNOWN ITEM', async () => {
        const { app, pool, playerId } = await setup();
        const { id: itemId } = await insertItem(pool, playerId, { assetName: null, mintedAt: null });
        const pending = userName();
        await pool.query(
            `INSERT INTO chain_ops (id, player_id, item_id, kind, state, subject, owner_key_hash, owner_address, required_keys, asset_name,
                tx_hash, tx_cbor, ttl_slot, sign_until, fee_option, network_fee, deposit, deposit_user, created_at)
             VALUES ($1, $2, $3, 'mint', 'submitted', 's', 'k', 'a', '[]', $4, $5, '84', 1, $6, 0, '1', '1', '1', $6)`,
            [crypto.randomUUID(), playerId, itemId, pending, crypto.randomBytes(32).toString('hex'), new Date(MINTED_AT)]
        );
        expectUnknown(await request(app).get(`/items/${pending}`));
        // a name without minted_at (no plan leaves an item so, the schema allows it): not minted either
        const { assetName } = await insertItem(pool, playerId, { mintedAt: null });
        expectUnknown(await request(app).get(`/items/${assetName}`));
    });

    test('a name that never existed → UNKNOWN ITEM, the same answer as a malformed one', async () => {
        const { app } = await setup();
        const unknown = await request(app).get(`/items/${userName()}`);
        expectUnknown(unknown);
        const malformed = await request(app).get('/items/XYZ');
        expect({ status: malformed.status, text: malformed.text, cache: malformed.headers['cache-control'] })
            .toEqual({ status: unknown.status, text: unknown.text, cache: unknown.headers['cache-control'] });
    });

    test('malformed names → UNKNOWN ITEM without asking the database, nothing of the name echoed', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId);
        const suffix = assetName.slice(8);
        const malformed = [
            'XYZ',
            assetName.slice(0, -1),
            `${assetName}0`,
            `${assetName}%00`,
            `${assetName}%0A`,
            `%20${assetName}`,
            assetName.toUpperCase(),
            `000DE140${suffix}`,
            // the reference token's name of the same item (label 100): not a page
            `000643b0${suffix}`,
            // the bare suffix, and the label alone
            suffix,
            '000de140',
            `000de140${'g'.repeat(56)}`,
            encodeURIComponent('../../etc/passwd'),
            encodeURIComponent(`${assetName}/..`),
            encodeURIComponent("' OR '1'='1"),
            encodeURIComponent(`${assetName}' OR asset_name <> '`),
            // not even percent-encoded right: Express cannot decode it
            '%E0%A4%A',
            `${assetName.slice(0, -2)}%G0`,
            'x'.repeat(4000),
        ];
        const query = jest.spyOn(pool, 'query');
        const connect = jest.spyOn(pool, 'connect');
        for (const name of malformed) {
            const response = await request(app).get(`/items/${name}`);
            expectUnknown(response);
        }
        expect(query).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
        // the right one still answers
        await request(app).get(`/items/${assetName}`).expect(200);
    });

    test('an item whose key is no longer in Items → UNKNOWN ITEM', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId, { item: 'MELTED_SPOON' });
        expectUnknown(await request(app).get(`/items/${assetName}`));
        // a key that only the prototype of a plain object has
        const { assetName: inherited } = await insertItem(pool, playerId, { item: 'constructor' });
        expectUnknown(await request(app).get(`/items/${inherited}`));
    });

    test('the headers: a 200 public for a minute, every error no-store; CORS for the game\'s origins', async () => {
        const { app, pool, playerId } = await setup({ corsOrigins: ['https://battlechoc.com'] });
        const { assetName } = await insertItem(pool, playerId);
        const found = await request(app).get(`/items/${assetName}`).set('Origin', 'https://battlechoc.com').expect(200);
        expect(found.headers['cache-control']).toBe('public, max-age=60');
        expect(found.headers['access-control-allow-origin']).toBe('https://battlechoc.com');
        expect(found.headers['x-content-type-options']).toBe('nosniff');
        const missing = await request(app).get(`/items/${userName()}`).set('Origin', 'https://battlechoc.com');
        expectUnknown(missing);
        expect(missing.headers['access-control-allow-origin']).toBe('https://battlechoc.com');
        // a database that fails: a 500, not cached either
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('injected failure'));
        const failed = await request(app).get(`/items/${assetName}`);
        expect({ status: failed.status, text: failed.text }).toEqual({ status: 500, text: '{"error":"INTERNAL SERVER ERROR"}' });
        expect(failed.headers['cache-control']).toBe('no-store');
    });

    test('no session needed (a token is ignored); the 61st request in a minute from one address → 429, no-store', async () => {
        let time = MINTED_AT;
        const { app, pool, playerId } = await setup({ now: () => time });
        const { assetName } = await insertItem(pool, playerId);
        await request(app).get(`/items/${assetName}`).set('Authorization', 'Bearer nonsense').expect(200);
        // found, unknown and malformed names all count
        for (let n = 1; n < 60; n += 1) {
            const name = [assetName, userName(), 'XYZ'][n % 3];
            expect((await request(app).get(`/items/${name}`)).status).toBe(name === assetName ? 200 : 404);
        }
        const limited = await request(app).get(`/items/${assetName}`);
        expect({ status: limited.status, text: limited.text }).toEqual({ status: 429, text: '{"error":"TOO MANY REQUESTS"}' });
        expect(limited.headers['cache-control']).toBe('no-store');
        // another address is not limited by it (behind the one proxy the app trusts)
        await request(app).get(`/items/${assetName}`).set('X-Forwarded-For', '203.0.113.7').expect(200);
        // nor are the other routes
        await request(app).get('/chain/status').expect(200);
        // the next minute
        time += 60001;
        await request(app).get(`/items/${assetName}`).expect(200);
    });

    test('a limit of its own: the knob itemsPerMinute', async () => {
        const { app, pool, playerId } = await setup({ itemsPerMinute: 2 });
        const { assetName } = await insertItem(pool, playerId);
        await request(app).get(`/items/${assetName}`).expect(200);
        await request(app).get(`/items/${assetName}`).expect(200);
        await request(app).get(`/items/${assetName}`).expect(429);
    });

    test('with the chain features off (a server without chain settings) the page still answers', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId);
        expect((await request(app).get('/chain/status').expect(200)).body).toEqual({ enabled: false });
        expect((await request(app).get(`/items/${assetName}`).expect(200)).body.item).toBe('TURBO_CONVEYOR');
        expectUnknown(await request(app).get(`/items/${userName()}`));
    });

    test('with the chain features on: from the database alone, never the provider, the index or the config', async () => {
        const trap = name => new Proxy({}, {
            get: (target, key) => {
                throw new Error(`${name}.${String(key)} was used by GET /items/:assetName`);
            },
        });
        const chain = {
            enabled: true,
            network: cardano.Networks.preprod,
            policyId: 'ab'.repeat(28),
            configRef: `${'cd'.repeat(32)}#0`,
            configPolicyId: null,
            kFinal: 10,
            indexMaxLagMs: 600000,
            provider: trap('provider'),
            index: trap('index'),
            serverKey: trap('serverKey'),
        };
        const { app, pool, playerId } = await setup({ chain, chainConfig: trap('config') });
        const { assetName } = await insertItem(pool, playerId);
        expect((await request(app).get(`/items/${assetName}`).expect(200)).body.serial).toBe(4);
        expectUnknown(await request(app).get(`/items/${userName()}`));
    });

    test('a GET with a body: the body is never read (no parser runs before the route)', async () => {
        const { app, pool, playerId } = await setup();
        const { assetName } = await insertItem(pool, playerId);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const bodies = [
            ['broken JSON', '{"a":'],
            ['larger than any parser takes', JSON.stringify({ a: 'x'.repeat(300 * 1024) })],
        ];
        for (const [what, body] of bodies) {
            const found = await request(app).get(`/items/${assetName}`).set('Content-Type', 'application/json').send(body);
            expect({ what, status: found.status }).toEqual({ what, status: 200 });
            expect(found.body.serial).toBe(4);
            expect(found.headers['cache-control']).toBe('public, max-age=60');
            expectUnknown(await request(app).get(`/items/${userName()}`).set('Content-Type', 'application/json').send(body));
        }
        expect(console.error).not.toHaveBeenCalled();
    });

    test('other paths under /items are no item: NOT FOUND, not cached', async () => {
        const { app } = await setup();
        for (const path of ['/items', '/items/', `/items/${userName()}/x`]) {
            const response = await request(app).get(path);
            expect({ status: response.status, text: response.text }).toEqual({ status: 404, text: '{"error":"NOT FOUND"}' });
            expect(response.headers['cache-control']).toBe('no-store');
        }
        expect((await request(app).post(`/items/${userName()}`).send({})).status).toBe(404);
    });
});
