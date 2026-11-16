// Minted items to burn (minting plan E, Task 2): an item minted through the API (prepared from
// the wallet's own address, signed, landed and final) on createChainApp's chain double, so its
// store is the real one at the items script and plan B's buildBurn can spend it; and the burn of
// it as the game asks for one. The app must run the operations step (createChainApp({ steps:
// [operationsStep] })), and the player needs the matches a mint needs.

const request = require('supertest');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const ops = require('../../src/chain/ops');
const { walletWitness } = require('./chain');
const { K_FINAL } = require('./chainApp');

/**
 * `player`'s (createChainApp's player) new item of `itemKey` minted to its first wallet's base
 * address and final; the ownership sync has run. Resolves with { itemId, assetName, account (the
 * player's account with a fresh access token) }.
 */
const mintedItem = async (env, player, itemKey = 'TURBO_CONVEYOR') => {
    const itemId = await env.giveItem(player.playerId, itemKey);
    const account = await env.refreshed(player.account);
    const minted = (await account.post('/chain/mint', { itemId, subject: player.subjects[0], fee: 0, addresses: [player.keys[0].baseAddressHex] }).expect(201)).body;
    await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [player.keys[0].paymentKey]) }).expect(200);
    env.block(K_FINAL + 1);
    await env.runOnce();
    expect(await ops.byId(env.pool, minted.operation.id)).toMatchObject({ state: 'final' });
    return { itemId, assetName: minted.operation.assetName, account: await env.refreshed(player.account) };
};

/** The reference token's unit of the item whose user token is `assetName`. */
const referenceUnitOf = (policyId, assetName) => policyId + rules.REFERENCE_LABEL + assetName.slice(rules.USER_LABEL.length);

/**
 * POST /chain/burn of `itemId` by `account` from `player`'s first wallet, with its base address
 * as the game sends the wallet's addresses under the session (`body` wins).
 */
const burnRequest = (account, player, itemId, body = {}) =>
    account.post('/chain/burn', { itemId, subject: player.subjects[0], addresses: [player.keys[0].baseAddressHex], ...body });

/** `player`'s wallet signs the prepared burn `prepared` (the 201 answer) with its first payment key. */
const signBurn = (env, player, prepared) =>
    request(env.app)
        .post(`/chain/sign/${prepared.signCode}`)
        .send({ witness: walletWitness(prepared.tx, [player.keys[0].paymentKey]) });

module.exports = { mintedItem, referenceUnitOf, burnRequest, signBurn };
