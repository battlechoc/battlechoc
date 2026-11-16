// The routes of the browser tests' API (e2eServer.js) on a test app with plan B's fixture
// deployment on the chain double (helpers/chainApp.js, whose deployment e2eServer.js shares):
// each route once, and what they refuse, and a mint driven through them as a browser test drives
// it. The browser tests (plans D and E) drive the chain through them; here they run first.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_POLICY_ID } = require('./chainDouble');
const { fixtureContracts, fixtureKey, walletWitness } = require('./helpers/chain');
const { testKeys } = require('./helpers/cardano');
const { createAccount } = require('./helpers/api');
const { createChainApp } = require('./helpers/chainApp');
const { linkedPlayer, giveItem, markMinted, userName } = require('./helpers/minting');
const { closeTestPools } = require('./helpers/db');
const { loadKey } = require('../src/chain/keys');
const { operationsStep } = require('../src/chain/operationsStep');
const { withTestRoutes, environmentOf, startProblemOf, appOptionsOf, freshServerKey, E2E_LIMITS } = require('./e2eServer');

afterAll(closeTestPools);

const MEMORY = { DATABASE_URL: 'memory' };

// the app of createChainApp with the test routes around it, its watcher (the chain operations,
// then the ownership sync, as server.js runs them) in the runtime
const setup = async ({ watcher = true } = {}) => {
    const env = await createChainApp({ steps: [operationsStep] });
    const runtime = { chain: env.chain, watcher: watcher ? env.watcher : null };
    const server = withTestRoutes(env.app, { pool: env.pool, runtime, deployment: env.deployment, env: MEMORY });
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

// the value of an environment variable of the API in apps/pwa/playwright.config.js
const playwrightEnv = name => {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', 'pwa', 'playwright.config.js'), 'utf8');
    const found = new RegExp(`${name}:\\s*"([0-9a-f]+)"`).exec(text);
    return found ? found[1] : undefined;
};

test('the test policy is the policy of the fixture contracts', () => {
    expect(TEST_POLICY_ID).toBe(fixtureContracts().policyId);
});

test('it starts only on the in-memory database and the deployment\'s policies, which the browser tests configure', () => {
    const chainOn = { ...MEMORY, CHAIN_POLICY_ID: TEST_POLICY_ID, CHAIN_CONFIG_POLICY_ID: fixtureContracts().configPolicyId };
    expect(startProblemOf(chainOn)).toBeNull();
    expect(startProblemOf(MEMORY)).toBeNull();
    expect(startProblemOf({ ...chainOn, DATABASE_URL: 'postgres://db/battlechoc' })).toMatch(/DATABASE_URL=memory/);
    expect(startProblemOf({ ...chainOn, CHAIN_POLICY_ID: 'ab'.repeat(28) })).toMatch(/CHAIN_POLICY_ID/);
    const { CHAIN_CONFIG_POLICY_ID, ...withoutConfigPolicy } = chainOn;
    expect(CHAIN_CONFIG_POLICY_ID).toBeDefined();
    expect(startProblemOf(withoutConfigPolicy)).toMatch(/CHAIN_CONFIG_POLICY_ID/);
    expect(startProblemOf({ ...chainOn, CHAIN_CONFIG_POLICY_ID: 'ab'.repeat(28) })).toMatch(/CHAIN_CONFIG_POLICY_ID/);
    // what playwright.config.js gives the API
    expect(startProblemOf({ ...MEMORY, CHAIN_POLICY_ID: playwrightEnv('CHAIN_POLICY_ID'), CHAIN_CONFIG_POLICY_ID: playwrightEnv('CHAIN_CONFIG_POLICY_ID') })).toBeNull();
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
        const serverKey = freshServerKey();
        const env = environmentOf({ PORT: '8091', CHAIN_SERVER_KEY_FILE: 'generate', OTHER: 'kept' }, { serverKey, tmpdir, onExit: cleanup => cleanups.push(cleanup) });
        expect(env).toEqual({ PORT: '8091', CHAIN_SERVER_KEY_FILE: path.join(left, 'server.skey'), OTHER: 'kept' });
        expect(loadKey(env.CHAIN_SERVER_KEY_FILE).keyHash).toBe(serverKey.keyHash);
        expect(fs.readdirSync(left)).toEqual(['server.skey']);
        expect(cleanups).toHaveLength(1);
        cleanups[0]();
        expect(fs.existsSync(left)).toBe(false);
    });

    test('a leftover file at the directory\'s path is replaced too; without a usable PORT the name is battlechoc-e2e-api', () => {
        fs.writeFileSync(path.join(tmpdir, 'battlechoc-e2e-api'), 'not a directory');
        const serverKey = freshServerKey();
        const env = environmentOf({ PORT: '../x', CHAIN_SERVER_KEY_FILE: 'generate' }, { serverKey, tmpdir, onExit: () => {} });
        expect(env.CHAIN_SERVER_KEY_FILE).toBe(path.join(tmpdir, 'battlechoc-e2e-api', 'server.skey'));
        expect(loadKey(env.CHAIN_SERVER_KEY_FILE).keyHash).toBe(serverKey.keyHash);
        // a fresh key each run, not the fixture's
        expect(serverKey.keyHash).not.toBe(fixtureKey('server').keyHash);
        expect(freshServerKey().keyHash).not.toBe(serverKey.keyHash);
        expect(() => environmentOf({ CHAIN_SERVER_KEY_FILE: 'generate' }, { tmpdir, onExit: () => {} })).toThrow(/serverKey/);
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
    const env = await createChainApp();
    const context = { pool: env.pool, runtime: { chain: env.chain, watcher: env.watcher }, deployment: env.deployment };
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
    expect((await request(env.server).get('/test/chain').expect(200)).body).toEqual({ tip: before, mempool: [], kFinal: env.chain.kFinal });
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
    expect((await request(env.server).get('/test/chain').expect(200)).body).toEqual({ tip: env.double.tip(), mempool: [moved.body.txHash], kFinal: env.chain.kFinal });
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
    const blocks = env.double.blocks().length;
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
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: [] }],
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: { ['ab'.repeat(28)]: 0 } }],
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: { ['ab'.repeat(28) + 'c']: 1 } }],
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: { [TEST_POLICY_ID + '00']: 1 } }],
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: { [fixtureContracts().configPolicyId]: 1 } }],
        ['/test/chain/fund', { address: to, lovelace: 1000000, assets: Object.fromEntries(Array.from({ length: 11 }, (_, i) => ['ab'.repeat(28) + i.toString(16).padStart(2, '0'), 1])) }],
        ['/test/chain/config', { paused: 'yes' }],
        ['/test/chain/config', { fees: 'free' }],
        ['/test/chain/config', { fees: [] }],
        ['/test/matches', { username: 'Ann' }],
        ['/test/matches', { username: 'Ann', count: 0 }],
        ['/test/matches', { username: 'Ann', count: 101 }],
        ['/test/matches', { username: '', count: 1 }],
    ];
    for (const [path, body] of bad) {
        const answer = await env.post(path, body);
        expect([path, body, answer.status, answer.body]).toEqual([path, body, 400, { error: 'INVALID REQUEST PARAMETERS' }]);
    }
    // a body that is no JSON object
    const broken = await request(env.server).post('/test/chain/blocks').set('Content-Type', 'application/json').send('{"count":');
    expect([broken.status, broken.body]).toEqual([400, { error: 'INVALID REQUEST PARAMETERS' }]);
    expect(env.double.mempool()).toEqual([]);
    expect(env.double.blocks()).toHaveLength(blocks);
});

test('an unknown player, another player\'s item, a token nobody holds: 404; an item minted twice: 409', async () => {
    const env = await setup();
    const { annKeys, itemId } = await annWithItem(env);
    const ben = await linkedPlayer(env, 'Ben', testKeys());
    const bens = await giveItem(env.pool, ben.playerId, 'HEAVY_BARREL');
    const to = env.double.addressOf(annKeys);
    const blocks = env.double.blocks().length;
    expect((await env.post('/test/chain/minted', { username: 'Nobody', itemId, to }).expect(404)).body).toEqual({ error: 'PLAYER NOT FOUND' });
    expect((await env.post('/test/chain/minted', { username: 'Ann', itemId: bens, to }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    expect((await env.post('/test/chain/move', { assetName: userName(5), to: 'stranger' }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    expect((await env.post('/test/chain/burn', { assetName: userName(5) }).expect(404)).body).toEqual({ error: 'NOT FOUND' });
    expect((await env.post('/test/matches', { username: 'Nobody', count: 1 }).expect(404)).body).toEqual({ error: 'PLAYER NOT FOUND' });
    await markMinted(env.pool, bens, userName(6));
    expect((await env.post('/test/chain/minted', { username: 'Ben', itemId: bens, to }).expect(409)).body).toEqual({ error: 'ITEM MINTED' });
    expect(env.double.mempool()).toEqual([]);
    expect(env.double.blocks()).toHaveLength(blocks);
});

test('matches: verified matches won against the server AI, which the mint gate counts', async () => {
    const env = await setup();
    const { ann } = await annWithItem(env);
    const readiness = async () => (await ann.get('/chain/readiness').expect(200)).body;
    expect((await readiness()).matches).toEqual({ have: 0, need: rules.MINT_MIN_ONLINE_MATCHES });
    expect((await env.post('/test/matches', { username: 'ann', count: 3 }).expect(200)).body).toEqual({ matches: 3 });
    expect((await env.post('/test/matches', { username: 'Ann', count: rules.MINT_MIN_ONLINE_MATCHES }).expect(200)).body).toEqual({ matches: 3 + rules.MINT_MIN_ONLINE_MATCHES });
    expect((await readiness()).matches).toEqual({ have: 3 + rules.MINT_MIN_ONLINE_MATCHES, need: rules.MINT_MIN_ONLINE_MATCHES });
    const { rows } = await env.pool.query('SELECT COUNT(*) AS n FROM track_records WHERE player_id = $1 AND verified = TRUE', [ann.playerId]);
    expect(Number(rows[0].n)).toBe(3 + rules.MINT_MIN_ONLINE_MATCHES);
});

test('config: paused, no fee, two fee options, and back to the deployment\'s, each read on the next request', async () => {
    const env = await setup();
    const { ann } = await annWithItem(env);
    const readiness = async () => (await ann.get('/chain/readiness').expect(200)).body;
    const preprod = { fee: 0, asset: 'lovelace', label: 'ADA', amounts: ['1000000', '2000000', '4000000'] };
    expect(await readiness()).toMatchObject({ paused: false, gameFees: [preprod] });
    const blocks = env.double.blocks().length;

    const paused = await env.post('/test/chain/config', { paused: true }).expect(200);
    expect(paused.body).toEqual({ paused: true, fees: [{ asset: 'lovelace', amounts: ['1000000', '2000000', '4000000'], receivers: [{ address: env.contracts.treasuryAddress, share: 1 }] }] });
    expect(env.double.blocks()).toHaveLength(blocks + 1);
    expect(await readiness()).toMatchObject({ paused: true, gameFees: [preprod] });

    expect((await env.post('/test/chain/config', { fees: 'none' }).expect(200)).body).toEqual({ paused: false, fees: [] });
    expect(await readiness()).toMatchObject({ paused: false, gameFees: [] });

    const two = await env.post('/test/chain/config', { fees: 'two' }).expect(200);
    expect(two.body.fees).toHaveLength(2);
    expect((await readiness()).gameFees).toEqual([preprod, { fee: 1, asset: 'lovelace', label: 'ADA', amounts: ['1500000', '3000000', '6000000'] }]);

    // an empty body: the deployment's config again
    expect((await env.post('/test/chain/config', {}).expect(200)).body).toEqual({ ...paused.body, paused: false });
    expect(await readiness()).toMatchObject({ paused: false, gameFees: [preprod] });
    expect(env.double.blocks()).toHaveLength(blocks + 4);
});

test('reset: the faults cleared, the mempool let go and emptied (or kept), the config left alone when it is the deployment\'s', async () => {
    const env = await setup();
    const fund = async () => (await env.post('/test/chain/fund', { address: env.double.newAddress(), lovelace: 5000000 }).expect(200)).body.txHash;
    const lastBlock = () => env.double.blocks().at(-1).txs.map(tx => tx.txHash);
    await env.post('/test/chain/hold', { on: true }).expect(204);
    const held = await fund();
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(env.double.mempool()).toEqual([held]);
    await env.post('/test/chain/fail', { provider: 'unavailable', index: 'stale' }).expect(204);
    await expect(env.double.provider().tip()).rejects.toThrow();

    // kept: the hold is released, so what waits lands with the next block
    const blocks = env.double.blocks().length;
    expect((await env.post('/test/chain/reset', { keepMempool: true }).expect(200)).body).toEqual({ dropped: [], config: 'kept' });
    expect(env.double.blocks()).toHaveLength(blocks);
    await expect(env.double.provider().tip()).resolves.toMatchObject({ blockNo: env.double.tip().blockNo });
    expect((await env.watcher.runOnce()).fresh).toBe(true);
    expect(env.double.mempool()).toEqual([held]);
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(lastBlock()).toEqual([held]);

    // by default the waiting transactions are dropped (the next spec's first block takes none of
    // them), and the hold is released: a transaction sent afterwards lands with the next block
    await env.post('/test/chain/hold', { on: true }).expect(204);
    const dropped = await fund();
    expect((await env.post('/test/chain/reset', {}).expect(200)).body).toEqual({ dropped: [dropped], config: 'kept' });
    expect(env.double.mempool()).toEqual([]);
    const later = await fund();
    await env.post('/test/chain/blocks', {}).expect(200);
    expect(lastBlock()).toEqual([later]);
    // a reset of a double as the deployment left it adds no block
    const before = env.double.blocks().length;
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [], config: 'kept' });
    expect(env.double.blocks()).toHaveLength(before);
    expect((await env.post('/test/chain/reset', { keepMempool: 'yes' }).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
});

test('the config routes and holders are not subject to the faults they arrange; a waiting config transaction cannot be kept', async () => {
    const env = await setup();
    const { annKeys, itemId } = await annWithItem(env);
    const { assetName } = (await env.post('/test/chain/minted', { username: 'Ann', itemId, to: env.double.addressOf(annKeys) }).expect(200)).body;
    const deployed = await env.deployment.currentConfig();

    // a fault first, then the config: both work, and so does where a token is
    await env.post('/test/chain/fail', { provider: 'unavailable', index: 'unavailable' }).expect(204);
    await env.post('/test/chain/config', { paused: true }).expect(200);
    expect((await env.deployment.currentConfig()).datum).not.toBe(deployed.datum);
    expect((await request(env.server).get(`/test/chain/holders/${TEST_POLICY_ID + assetName}`).expect(200)).body.holders).toHaveLength(1);
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [], config: 'restored' });
    expect((await env.deployment.currentConfig()).datum).toBe(deployed.datum);

    // a rollback without drop puts a config change back into the mempool: kept, it would land on
    // top of the restored config; the default reset drops it and restores
    await env.post('/test/chain/config', { fees: 'none' }).expect(200);
    await env.post('/test/chain/rollback', { count: 1 }).expect(200);
    expect(env.deployment.configWaiting()).toBe(true);
    expect((await env.post('/test/chain/reset', { keepMempool: true }).expect(400)).body).toEqual({ error: 'CONFIG WAITING' });
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [expect.any(String)], config: 'kept' });
    expect(env.double.unspentHolding(env.deployment.configUnit)).toHaveLength(1);
    expect((await env.deployment.currentConfig()).datum).toBe(deployed.datum);
});

test('reset puts the deployment\'s config back: after a change, and after a rollback that dropped config changes', async () => {
    const env = await setup();
    const { ann } = await annWithItem(env);
    const readiness = async () => (await ann.get('/chain/readiness').expect(200)).body;
    const deployed = await env.deployment.currentConfig();

    await env.post('/test/chain/config', { paused: true, fees: 'none' }).expect(200);
    expect(await readiness()).toMatchObject({ paused: true, gameFees: [] });
    let blocks = env.double.blocks().length;
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [], config: 'restored' });
    expect(env.double.blocks()).toHaveLength(blocks + 1);
    expect((await env.deployment.currentConfig()).datum).toBe(deployed.datum);
    expect(await readiness()).toMatchObject({ ready: true, paused: false, gameFees: [expect.objectContaining({ fee: 0 })] });

    // a test paused it, another one changed the fees; a rollback with drop takes the second
    // change away: the paused datum is on the chain again, and no route was called since
    await env.post('/test/chain/config', { paused: true }).expect(200);
    await env.post('/test/chain/config', { fees: 'two' }).expect(200);
    await env.post('/test/chain/rollback', { count: 1, drop: true }).expect(200);
    expect(await readiness()).toMatchObject({ paused: true });
    blocks = env.double.blocks().length;
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [], config: 'restored' });
    expect(env.double.blocks()).toHaveLength(blocks + 1);
    expect(await readiness()).toMatchObject({ paused: false, gameFees: [expect.objectContaining({ fee: 0 })] });
    // and a later change works (it spends the output that holds the config now)
    await env.post('/test/chain/config', { fees: 'two' }).expect(200);
    expect((await readiness()).gameFees).toHaveLength(2);
    await env.post('/test/chain/reset').expect(200);

    // a rollback deep enough to take the first config block: a config is placed anew
    await env.post('/test/chain/rollback', { count: 100, drop: true }).expect(200);
    expect(await env.deployment.currentConfig()).toBeNull();
    expect((await env.post('/test/chain/reset').expect(200)).body).toEqual({ dropped: [], config: 'restored' });
    expect((await env.deployment.currentConfig()).datum).toBe(deployed.datum);
});

test('holders: where a token is in the blocks, read only', async () => {
    const env = await setup();
    const { ann, annKeys, itemId } = await annWithItem(env);
    expect(ann).toBeDefined();
    const assetName = (await env.post('/test/chain/minted', { username: 'Ann', itemId, to: env.double.addressOf(annKeys) }).expect(200)).body.assetName;
    const user = TEST_POLICY_ID + assetName;
    const reference = TEST_POLICY_ID + rules.REFERENCE_LABEL + assetName.slice(rules.USER_LABEL.length);
    const holders = async unit => (await request(env.server).get(`/test/chain/holders/${unit}`).expect(200)).body;
    expect(await holders(user)).toEqual({ holders: [{ address: env.double.addressOf(annKeys), quantity: '1' }] });
    expect(await holders(reference)).toEqual({ holders: [{ address: env.double.scriptAddress, quantity: '1' }] });
    expect(await holders(TEST_POLICY_ID + userName(77))).toEqual({ holders: [] });
    const blocks = env.double.blocks().length;
    for (const bad of ['abc', TEST_POLICY_ID, TEST_POLICY_ID.toUpperCase() + '00']) {
        expect((await request(env.server).get(`/test/chain/holders/${bad}`).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
    }
    expect(env.double.blocks()).toHaveLength(blocks);
});

test('the limits per address are out of reach of a run; those per player, of mints and of rebuilds stay production\'s', async () => {
    const env = await createChainApp();
    expect(appOptionsOf({ chain: { enabled: false } })).toEqual({});
    const options = appOptionsOf({ chain: env.chain });
    expect(Object.keys(options).sort()).toEqual(['chainAddressPerMinute', 'chainConfig', 'chainPerMinute', 'chainReadinessCacheMs', 'chainStatusPerMinute']);
    // readiness reads the wallets afresh: a wallet the test routes fund, or a fault, shows at once
    expect(options.chainReadinessCacheMs).toBe(0);
    expect(E2E_LIMITS).toEqual({ chainPerMinute: 100000, chainStatusPerMinute: 100000, chainAddressPerMinute: 100000 });
    // an app as the e2e server builds it: the status route (production: 60 a minute per address) answers more often
    const { createTestApp } = require('./helpers/api');
    const app = (await createTestApp({ chain: env.chain, ...options })).app;
    for (let i = 0; i < 70; i++) {
        await request(app).get('/chain/status').expect(200);
    }
});

test('fund with tokens: the ADA and the tokens in one output', async () => {
    const env = await setup();
    const address = env.double.newAddress();
    const unit = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
    const { txHash } = (await env.post('/test/chain/fund', { address, lovelace: 3000000, assets: { [unit]: '25' } }).expect(200)).body;
    await env.post('/test/chain/blocks', {}).expect(200);
    const funded = env.double.blocks().at(-1).txs.find(entry => entry.txHash === txHash);
    expect(funded.outputs).toEqual([{ address, lovelace: '3000000', assets: { [unit]: '25' } }]);
});

test('a mint as a browser test drives it: ready, prepared with the wallet\'s addresses, a foreign witness refused, the wallet\'s submitted, minted with one block', async () => {
    const env = await setup();
    const keys = testKeys();
    const account = await createAccount(env.app, { username: 'Pia' });
    await env.link(account, keys, { wallet: 'eternl' });
    await env.post('/test/matches', { username: 'Pia', count: rules.MINT_MIN_ONLINE_MATCHES }).expect(200);
    await env.post('/test/chain/fund', { address: keys.baseAddress, lovelace: 20000000 }).expect(200);
    await env.post('/test/chain/blocks', {}).expect(200);
    const itemId = await giveItem(env.pool, account.playerId, 'HEAVY_BARREL');
    const subject = `stake:${keys.stakeKeyHashHex}`;

    const readiness = (await account.get(`/chain/readiness?itemId=${itemId}`).expect(200)).body;
    expect(readiness).toMatchObject({ ready: true, paused: false, matches: { have: rules.MINT_MIN_ONLINE_MATCHES }, wallets: [{ subject, name: 'eternl', lovelace: '20000000', enough: true }] });

    const minted = (await account.post('/chain/mint', { itemId, subject, fee: 0, addresses: [keys.baseAddressHex] }).expect(201)).body;
    expect(minted.operation).toMatchObject({ state: 'prepared', itemId, subject });
    // signed by another wallet's key: refused, and nothing changes
    const foreign = await request(env.server).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [testKeys().paymentKey]) });
    expect([foreign.status, foreign.body]).toEqual([400, { error: 'INVALID WITNESS' }]);
    expect(env.double.mempool()).toEqual([]);

    const signed = await request(env.server).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [keys.paymentKey]) }).expect(200);
    expect(signed.body).toMatchObject({ state: 'submitted', operation: { id: minted.operation.id, state: 'submitted' } });
    expect((await request(env.server).get('/test/chain').expect(200)).body.mempool).toEqual([minted.operation.txHash]);
    expect((await statsOf(account)).items.find(entry => entry.id === itemId).minted).toMatchObject({ state: 'minting', operationId: minted.operation.id });

    await env.post('/test/chain/blocks', {}).expect(200);
    expect(env.double.mempool()).toEqual([]);
    expect((await statsOf(account)).items.find(entry => entry.id === itemId).minted).toEqual({ assetName: minted.operation.assetName, state: 'minted' });
    // in a block, not yet K_FINAL deep
    expect((await account.get(`/chain/operations/${minted.operation.id}`).expect(200)).body).toMatchObject({ state: 'included' });
    const { rows } = await env.pool.query('SELECT asset_name, holder_subject FROM items WHERE id = $1', [itemId]);
    expect(rows[0]).toEqual({ asset_name: minted.operation.assetName, holder_subject: subject });
});
