// Minted items for tests (minting plan C): an app with the Cardano routes and a chain double on one
// clock, a watcher with the ownership sync over both, players with linked keys, items marked minted
// as plan D marks them and their tokens minted and moved on the double.

const request = require('supertest');
const { cardano, chain: rules, EntityType } = require('@battlechoc/battlechoc-shared-functions');
const { TEST_POLICY_ID, createChainDouble } = require('../chainDouble');
const { createWatcher } = require('../../src/chain/watcher');
const { ownershipStep, syncOwnership } = require('../../src/chain/ownership');
const { createTestApp, createAccount } = require('./api');
const { testKeys, signedChallenge, confirmWith } = require('./cardano');
const { markMinted } = require('./mintedItems');

const policyId = TEST_POLICY_ID;
const { preprod } = cardano.Networks;
const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-15T12:00:00Z');
const SLOTS_PER_BLOCK = 20;
// one second per slot in the double's slot configuration
const BLOCK_MS = SLOTS_PER_BLOCK * 1000;

/** The asset name of the user token number `n` (CIP-68 label 222). */
const userName = n => rules.USER_LABEL + n.toString(16).padStart(56, '0');
const silentLog = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() });
const stake = keys => `stake:${keys.stakeKeyHashHex}`;
const pay = keys => `pay:${keys.paymentKeyHashHex}`;

let items = 0;
/** Gives `playerId` an item of `item` (its key) crafted by them at T0: its id. */
const giveItem = async (pool, playerId, item) => {
    items += 1;
    const id = `${item}-${items}`;
    await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $2, $5)', [id, playerId, item, items, new Date(T0)]);
    return id;
};

/**
 * An app with the Cardano routes on a clock of its own, a chain double on the same clock and a
 * watcher with the ownership step over both (`wrapPool`: a wrapper of the watcher's pool;
 * `wrapIndex`: of the double's index, as the watcher reads it; `batchSize`: the sync's page size).
 */
const chainApp = async ({ wrapPool = pool => pool, wrapIndex = index => index, batchSize } = {}) => {
    let clock = T0;
    const now = () => clock;
    const env = await createTestApp({ cardanoNetwork: preprod, now });
    const double = createChainDouble({ policyId, now, slotsPerBlock: SLOTS_PER_BLOCK });
    const chain = { enabled: true, network: preprod, policyId, kFinal: 10, indexMaxLagMs: 600000, provider: double.provider(), index: wrapIndex(double.index()) };
    const log = silentLog();
    const step = batchSize === undefined ? ownershipStep : { name: ownershipStep.name, run: context => syncOwnership({ ...context, batchSize }) };
    const watcher = createWatcher({ chain, pool: wrapPool(env.pool), steps: [step], intervalMs: 20000, now, log });
    return {
        ...env,
        double,
        chain,
        log,
        watcher,
        now,
        advance: ms => {
            clock += ms;
        },
        // `count` blocks, the clock moving with them
        block: (count = 1) => {
            for (let i = 0; i < count; i++) {
                clock += BLOCK_MS;
                double.produceBlocks();
            }
            return double.tip();
        },
        // one run of the watcher: the ownership step's result
        sync: async () => (await watcher.runOnce()).steps.ownership,
    };
};

/** Links `keys` to `account`: by its stake key, or (`kind: 'pay'`) by its payment key; `confirmBy`: a key the account has already. */
const link = async (env, account, keys, { kind = 'stake', confirmBy } = {}) => {
    const how = kind === 'pay' ? { address: keys.enterpriseAddress, with: 'enterprise' } : {};
    if (confirmBy) {
        const confirmed = await confirmWith(env.app, account, confirmBy);
        expect(confirmed.status).toBe(200);
        const { confirmToken } = confirmed.body;
        const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, ...how });
        const response = await request(env.app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`).set('X-Battlechoc-Confirm', confirmToken).send(verify);
        expect(response.status).toBe(200);
        return response.body.identity;
    }
    const { verify } = await signedChallenge(env.app, { keys, purpose: 'link', account, ...how });
    return (await account.post('/auth/cardano/verify', verify).expect(200)).body.identity;
};

/** A named player with `keys` linked by their stake keys (the first without, the others with a confirm). */
const linkedPlayer = async (env, username, ...keys) => {
    const account = await createAccount(env.app, { username });
    for (const [i, key] of keys.entries()) {
        await link(env, account, key, i === 0 ? {} : { confirmBy: keys[0] });
    }
    return account;
};

/**
 * Ann (linked by her stake key) with a LIGHT_BARREL in the first slot of her rum truffle cannon,
 * minted to her base address and synced once: the start of most tests.
 */
const annWithMintedItem = async (env, { n = 1 } = {}) => {
    const annKeys = testKeys();
    const ann = await linkedPlayer(env, 'Ann', annKeys);
    const itemId = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
    await ann.post('/user/equipment', { entityType: EntityType.RUM_TRUFFLE_CANNON, slot: 0, itemId }).expect(200);
    const assetName = userName(n);
    await markMinted(env.pool, itemId, assetName);
    env.double.mintToken({ assetName, to: env.double.addressOf(annKeys) });
    env.block();
    expect(await env.sync()).toEqual({ checked: 1, changed: 1, unknown: 0, failed: 0, skipped: null });
    // what the tests look for comes after this
    [env.log.info, env.log.warn, env.log.error].forEach(logged => logged.mockClear());
    return { ann, annKeys, itemId, assetName };
};

module.exports = {
    policyId, HOUR, T0, SLOTS_PER_BLOCK, BLOCK_MS, userName, silentLog, stake, pay, markMinted, giveItem, chainApp, link, linkedPlayer, annWithMintedItem,
};
