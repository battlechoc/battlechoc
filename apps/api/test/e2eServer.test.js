// The routes of the browser tests' API (e2eServer.js) on a test app with the chain double: each
// route once, and what they refuse. The browser tests (Task 11, plans D and E) drive the chain
// through them; here they run first.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_POLICY_ID } = require('./chainDouble');
const { fixtureContracts, fixtureKey } = require('./helpers/chain');
const { testKeys } = require('./helpers/cardano');
const { chainApp, linkedPlayer, giveItem, markMinted, userName } = require('./helpers/minting');
const { loadKey } = require('../src/chain/keys');
const { withTestRoutes, environmentOf } = require('./e2eServer');

const MEMORY = { DATABASE_URL: 'memory' };

// the app of chainApp with the test routes around it, its watcher in the runtime
const setup = async ({ watcher = true } = {}) => {
    const env = await chainApp();
    const runtime = { chain: env.chain, watcher: watcher ? env.watcher : null };
    const server = withTestRoutes(env.app, { pool: env.pool, runtime, double: env.double, env: MEMORY });
    return { ...env, runtime, server, post: (path, body) => request(server).post(path).send(body) };
};

// Ann, linked by her stake key, with a LIGHT_BARREL
const annWithItem = async env => {
    const annKeys = testKeys();
    const ann = await linkedPlayer(env, 'Ann', annKeys);
    const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
    return { ann, annKeys, itemId };
};

const statsOf = async account => (await account.get('/user').expect(200)).body.stats;

test('the test policy is the policy of the fixture contracts', () => {
    expect(TEST_POLICY_ID).toBe(fixtureContracts().policyId);
});

test('it loads with plain node, as the browser tests start it (no Jest-only helper), and starts nothing when required', () => {
    const loaded = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(require.resolve('./e2eServer'))})`], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    expect([loaded.status, loaded.stdout, loaded.stderr]).toEqual([0, '', '']);
});

describe('the generated server key file', () => {
    let tmpdir;
    beforeEach(() => {
        tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-e2e-test-'));
    });
    afterEach(() => fs.rmSync(tmpdir, { recursive: true, force: true }));

    test('a start replaces what a killed run left behind, and its exit removes the directory', () => {
        // a killed run's directory: an old key file (writeKeyFile never overwrites one) and more
        const left = path.join(tmpdir, 'battlechoc-e2e-8091');
        fs.mkdirSync(left, { mode: 0o700 });
        fs.writeFileSync(path.join(left, 'server.skey'), 'left behind\n', { mode: 0o600 });
        fs.writeFileSync(path.join(left, 'other'), 'x');
        const cleanups = [];
        const env = environmentOf({ PORT: '8091', CHAIN_SERVER_KEY_FILE: 'generate', OTHER: 'kept' }, { tmpdir, onExit: cleanup => cleanups.push(cleanup) });
        expect(env).toEqual({ PORT: '8091', CHAIN_SERVER_KEY_FILE: path.join(left, 'server.skey'), OTHER: 'kept' });
        expect(loadKey(env.CHAIN_SERVER_KEY_FILE).keyHash).toBe(fixtureKey('server').keyHash);
        expect(fs.readdirSync(left)).toEqual(['server.skey']);
        expect(cleanups).toHaveLength(1);
        cleanups[0]();
        expect(fs.existsSync(left)).toBe(false);
    });

    test('a leftover file at the directory\'s path is replaced too; without a usable PORT the name is battlechoc-e2e-api', () => {
        fs.writeFileSync(path.join(tmpdir, 'battlechoc-e2e-api'), 'not a directory');
        const env = environmentOf({ PORT: '../x', CHAIN_SERVER_KEY_FILE: 'generate' }, { tmpdir, onExit: () => {} });
        expect(env.CHAIN_SERVER_KEY_FILE).toBe(path.join(tmpdir, 'battlechoc-e2e-api', 'server.skey'));
        expect(loadKey(env.CHAIN_SERVER_KEY_FILE).keyHash).toBe(fixtureKey('server').keyHash);
    });

    test('without generate the environment is used as it is and nothing is written', () => {
        const given = { CHAIN_SERVER_KEY_FILE: '/run/secrets/server.skey' };
        const onExit = jest.fn();
        expect(environmentOf(given, { tmpdir, onExit })).toBe(given);
        expect(onExit).not.toHaveBeenCalled();
        expect(fs.readdirSync(tmpdir)).toEqual([]);
    });
});

test('the routes are refused unless the database is the in-memory one', async () => {
    const env = await chainApp();
    const context = { pool: env.pool, runtime: { chain: env.chain, watcher: env.watcher }, double: env.double };
    expect(() => withTestRoutes(env.app, { ...context, env: {} })).toThrow('DATABASE_URL=memory');
    expect(() => withTestRoutes(env.app, { ...context, env: { DATABASE_URL: 'postgres://db/battlechoc' } })).toThrow('DATABASE_URL=memory');
});

test('without a running watcher the routes that change the chain answer 503 and change nothing', async () => {
    const env = await setup({ watcher: false });
    const before = env.double.tip();
    const answer = await env.post('/test/chain/blocks', {}).expect(503);
    expect(answer.body).toEqual({ error: 'CHAIN NOT WATCHED' });
    expect(env.double.tip()).toEqual(before);
    // reading it still works
    expect((await request(env.server).get('/test/chain').expect(200)).body).toEqual({ tip: before, mempool: [] });
});

test('blocks, a mint to Ann\'s wallet, a move to a stranger, the notice, a rollback, a burn', async () => {
    const env = await setup();
    const { ann, annKeys, itemId } = await annWithItem(env);
    const start = env.double.tip();

    // blocks: one by default, then `count`
    expect((await env.post('/test/chain/blocks', {}).expect(200)).body).toEqual({ tip: env.double.tip() });
    expect((await env.post('/test/chain/blocks', { count: 2 }).expect(200)).body.tip.blockNo).toBe(start.blockNo + 3);

    // minted: the item marked with its asset name, the token in Ann's wallet, one block, synced
    const minted = await env.post('/test/chain/minted', { username: 'ann', itemId, to: env.double.addressOf(annKeys) }).expect(200);
    const assetName = rules.USER_LABEL + crypto.createHash('sha256').update(itemId).digest('hex').slice(0, 56);
    expect(minted.body).toEqual({ assetName });
    expect(env.double.tip().blockNo).toBe(start.blockNo + 4);
    const { rows } = await env.pool.query('SELECT asset_name, minted_at, holder_subject FROM items WHERE id = $1', [itemId]);
    expect(rows[0]).toMatchObject({ asset_name: assetName, minted_at: expect.any(Date), holder_subject: `stake:${annKeys.stakeKeyHashHex}` });
    expect((await statsOf(ann)).items.find(entry => entry.id === itemId).minted).toEqual({ assetName, state: 'minted' });

    // move to a stranger: waits in the mempool until a block, then Ann has a departure notice
    const moved = await env.post('/test/chain/move', { assetName, to: 'stranger' }).expect(200);
    expect(moved.body).toEqual({ txHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect((await request(env.server).get('/test/chain').expect(200)).body).toEqual({ tip: env.double.tip(), mempool: [moved.body.txHash] });
    await env.post('/test/chain/blocks', { count: 1 }).expect(200);
    const away = await statsOf(ann);
    expect(away.items.some(entry => entry.id === itemId)).toBe(false);
    expect(away.notices).toEqual([expect.objectContaining({ kind: 'departed', item: expect.objectContaining({ id: itemId }) })]);

    // the rollback takes the move's block away and drops the move: the token is in Ann's wallet
    // again, in the tip block (depth 0), so the item is hers again one block later (an arrival)
    const rolledBack = await env.post('/test/chain/rollback', { count: 1, drop: true }).expect(200);
    expect(rolledBack.body).toEqual({ tip: env.double.tip() });
    expect(rolledBack.body.tip.blockNo).toBe(start.blockNo + 4);
    expect(env.double.mempool()).toEqual([]);
    expect((await statsOf(ann)).items.some(entry => entry.id === itemId)).toBe(false);
    await env.post('/test/chain/blocks', {}).expect(200);
    expect((await statsOf(ann)).items.some(entry => entry.id === itemId)).toBe(true);

    // burn: the pair goes with the next block
    const burned = await env.post('/test/chain/burn', { assetName }).expect(200);
    expect(env.double.mempool()).toEqual([burned.body.txHash]);
});

test('a rollback without drop puts the transactions back into the mempool', async () => {
    const env = await setup();
    env.double.fund(env.double.newAddress(), '5000000');
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(env.double.mempool()).toEqual([]);
    await env.post('/test/chain/rollback', { count: 1 }).expect(200);
    expect(env.double.mempool()).toHaveLength(1);
});

test('fund, hold and fail', async () => {
    const env = await setup();
    const funded = await env.post('/test/chain/fund', { address: env.double.newAddress(), lovelace: 5000000 }).expect(200);
    expect(funded.body).toEqual({ txHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await env.post('/test/chain/fund', { address: env.double.newAddress(), lovelace: '7000000' }).expect(200);

    // held, a block takes nothing; let go, the next one takes both
    await env.post('/test/chain/hold', { on: true }).expect(204);
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(env.double.mempool()).toHaveLength(2);
    await env.post('/test/chain/hold', { on: false }).expect(204);
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(env.double.mempool()).toEqual([]);

    // a stale index: the watcher's run right after it already skips
    await env.post('/test/chain/fail', { index: 'stale' }).expect(204);
    expect((await env.watcher.runOnce()).fresh).toBe(false);
    await env.post('/test/chain/fail', { provider: 'busy' }).expect(204);
    await expect(env.double.provider().tip()).rejects.toThrow();
    // an empty body clears the faults
    await env.post('/test/chain/fail', {}).expect(204);
    expect((await env.watcher.runOnce()).fresh).toBe(true);
    await expect(env.double.provider().tip()).resolves.toMatchObject({ blockNo: env.double.tip().blockNo });
});

test('a route refuses a body it cannot use with 400, before it changes anything', async () => {
    const env = await setup();
    const { annKeys, itemId } = await annWithItem(env);
    const to = env.double.addressOf(annKeys);
    const bad = [
        ['/test/chain/blocks', { count: 0 }],
        ['/test/chain/blocks', { count: 1.5 }],
        ['/test/chain/blocks', { count: '2' }],
        ['/test/chain/blocks', { count: 101 }],
        ['/test/chain/rollback', {}],
        ['/test/chain/rollback', { count: -1 }],
        ['/test/chain/rollback', { count: 1, drop: 'yes' }],
        ['/test/chain/fund', { address: to }],
        ['/test/chain/fund', { address: to, lovelace: 0 }],
        ['/test/chain/fund', { address: to, lovelace: '1.5' }],
        ['/test/chain/fund', { address: 'stranger', lovelace: 1000000 }],
        ['/test/chain/fund', { address: 'addr1nothing', lovelace: 1000000 }],
        ['/test/chain/minted', { username: 'Ann', itemId }],
        ['/test/chain/minted', { username: 'Ann', itemId, to: 'addr_test1notanaddress' }],
        ['/test/chain/minted', { username: 'Ann', itemId: 7, to }],
        ['/test/chain/minted', { username: '', itemId, to }],
        ['/test/chain/move', { assetName: 'abc', to }],
        ['/test/chain/move', { assetName: userName(1) }],
        ['/test/chain/move', { assetName: userName(1), to: 'Stranger' }],
        ['/test/chain/burn', {}],
        ['/test/chain/burn', { assetName: userName(1).toUpperCase() }],
        ['/test/chain/hold', {}],
        ['/test/chain/hold', { on: 'true' }],
        ['/test/chain/fail', { provider: 'down' }],
        ['/test/chain/fail', { index: 'busy' }],
    ];
    for (const [path, body] of bad) {
        const answer = await env.post(path, body);
        expect([path, body, answer.status, answer.body]).toEqual([path, body, 400, { error: 'INVALID REQUEST PARAMETERS' }]);
    }
    // a body that is no JSON object
    const broken = await request(env.server).post('/test/chain/blocks').set('Content-Type', 'application/json').send('{"count":');
    expect([broken.status, broken.body]).toEqual([400, { error: 'INVALID REQUEST PARAMETERS' }]);
    expect(env.double.mempool()).toEqual([]);
    expect(env.double.blocks()).toHaveLength(1);
});

test('an unknown player, another player\'s item, a token nobody holds: 404; an item minted twice: 409', async () => {
    const env = await setup();
    const { annKeys, itemId } = await annWithItem(env);
    const ben = await linkedPlayer(env, 'Ben', testKeys());
    const bens = await giveItem(env.pool, ben.playerId, 'HEAVY_BARREL');
    const to = env.double.addressOf(annKeys);
    expect((await env.post('/test/chain/minted', { username: 'Nobody', itemId, to }).expect(404)).body).toEqual({ error: 'PLAYER NOT FOUND' });
    expect((await env.post('/test/chain/minted', { username: 'Ann', itemId: bens, to }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    expect((await env.post('/test/chain/move', { assetName: userName(5), to: 'stranger' }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    expect((await env.post('/test/chain/burn', { assetName: userName(5) }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    await markMinted(env.pool, bens, userName(6));
    expect((await env.post('/test/chain/minted', { username: 'Ben', itemId: bens, to }).expect(409)).body).toEqual({ error: 'ITEM MINTED' });
    expect(env.double.mempool()).toEqual([]);
    expect(env.double.blocks()).toHaveLength(1);
});
