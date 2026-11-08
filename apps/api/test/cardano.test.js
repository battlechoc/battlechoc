// Signing in with a Cardano key: the server issues a challenge, the game signs it (CIP-30
// signData with the stake key), the server verifies it and links the key to a player or signs
// that player in on another device.

const request = require('supertest');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { createTestApp, createAccount, withToken } = require('./helpers/api');
const { closeTestPools } = require('./helpers/db');
const { testKeys, signMessage, signedChallenge } = require('./helpers/cardano');

afterAll(closeTestPools);

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const setup = async (options = {}) => {
    let clock = Date.now();
    const env = await createTestApp({ cardanoNetwork: cardano.Networks.preprod, now: () => clock, ...options });
    return { ...env, advance: ms => { clock += ms; } };
};

const link = async (app, account, keys) => {
    const { verify } = await signedChallenge(app, { keys, purpose: 'link', account });
    return account.post('/auth/cardano/verify', verify);
};

const signIn = async (app, keys) => {
    const { verify } = await signedChallenge(app, { keys, purpose: 'sign-in' });
    return request(app).post('/auth/cardano/verify').send(verify);
};

describe('signing in with a Cardano key', () => {
    test('the Evolution SDK loads under Jest', () => {
        expect(testKeys().rewardAddress).toMatch(/^stake_test1/);
    });

    test('the network the server runs on', async () => {
        const { app } = await setup();
        expect((await request(app).get('/cardano/network').expect(200)).body).toEqual({ network: 'preprod' });
    });

    test('a challenge: the text to sign, a nonce and when it expires', async () => {
        const { app } = await setup();
        const keys = testKeys();
        const { body } = await request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: keys.rewardAddress }).expect(200);
        expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(body.message).toContain(keys.rewardAddress);
        expect(body.message).toContain(`Nonce: ${body.nonce}`);
        expect(body.message).toContain('Network: preprod');
        expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(CHALLENGE_TTL_MS - 60000);
    });

    test('link, then sign in on another device: a session for the same player', async () => {
        const { app } = await setup();
        const account = await createAccount(app, { username: 'Carla' });
        const keys = testKeys();
        const linked = await link(app, account, keys);
        expect(linked.status).toBe(200);
        expect(linked.body).toEqual({ identity: { provider: 'cardano', subject: `stake:${keys.stakeKeyHashHex}`, address: keys.rewardAddress } });

        const session = await signIn(app, testKeys({ words: keys.words }));
        expect(session.status).toBe(200);
        expect(session.body).toEqual({ playerId: account.playerId, refreshToken: expect.any(String), accessToken: expect.any(String), expiresIn: expect.any(Number) });
        // the new device's session works like a device account's
        expect((await withToken(app, session.body.accessToken).get('/user').expect(200)).body.stats.username).toBe('Carla');
        const refreshed = await request(app).post('/accounts/token').send({ refreshToken: session.body.refreshToken }).expect(200);
        expect(refreshed.body.playerId).toBe(account.playerId);
    });

    test('a nonce works once, and only for five minutes', async () => {
        const { app, advance } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();
        await link(app, account, keys).then(response => expect(response.status).toBe(200));

        const { verify } = await signedChallenge(app, { keys, purpose: 'sign-in' });
        await request(app).post('/auth/cardano/verify').send(verify).expect(200);
        expect((await request(app).post('/auth/cardano/verify').send(verify).expect(400)).body).toEqual({ error: 'CHALLENGE EXPIRED' });

        const late = await signedChallenge(app, { keys, purpose: 'sign-in' });
        advance(CHALLENGE_TTL_MS + 1000);
        expect((await request(app).post('/auth/cardano/verify').send(late.verify).expect(400)).body).toEqual({ error: 'CHALLENGE EXPIRED' });
        expect((await request(app).post('/auth/cardano/verify').send({ ...verify, nonce: 'f'.repeat(32) }).expect(400)).body)
            .toEqual({ error: 'CHALLENGE EXPIRED' });
    });

    test('an address of another network is refused before anything is signed', async () => {
        const { app } = await setup();
        const mainnet = testKeys({ networkId: 1 });
        const { body } = await request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: mainnet.rewardAddress }).expect(400);
        expect(body).toEqual({ error: 'WRONG NETWORK' });
    });

    test('a signature over another text, or by a key that is not the address\'s, is refused', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();

        const other = await signedChallenge(app, { keys, purpose: 'link', account });
        const overOtherText = { ...other.verify, ...signMessage(keys, other.challenge.message.replace('Link', 'Lnk')) };
        expect((await account.post('/auth/cardano/verify', overOtherText).expect(400)).body).toEqual({ error: 'INVALID SIGNATURE' });

        const stranger = await signedChallenge(app, { keys, purpose: 'link', account });
        const byAnotherKey = { ...stranger.verify, ...signMessage({ ...testKeys(), rewardAddress: keys.rewardAddress }, stranger.challenge.message) };
        expect((await account.post('/auth/cardano/verify', byAnotherKey).expect(400)).body).toEqual({ error: 'INVALID SIGNATURE' });

        const broken = await signedChallenge(app, { keys, purpose: 'link', account });
        expect((await account.post('/auth/cardano/verify', { ...broken.verify, signature: 'zz' }).expect(400)).body).toEqual({ error: 'INVALID SIGNATURE' });
        expect((await request(app).get('/user/identities').set('Authorization', `Bearer ${account.accessToken}`)).status).not.toBe(500);
    });

    test('signing in with a key nobody linked: 404, never 401', async () => {
        const { app } = await setup();
        const response = await signIn(app, testKeys());
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'UNKNOWN IDENTITY' });
    });

    test('linking the same key twice is fine; linking it to a second player is refused', async () => {
        const { app } = await setup();
        const first = await createAccount(app);
        const second = await createAccount(app);
        const keys = testKeys();
        expect((await link(app, first, keys)).status).toBe(200);
        expect((await link(app, first, keys)).status).toBe(200);
        const taken = await link(app, second, keys);
        expect(taken.status).toBe(409);
        expect(taken.body).toEqual({ error: 'IDENTITY TAKEN' });
    });

    test('a link challenge only works with the token of the player who asked for it', async () => {
        const { app } = await setup();
        const asker = await createAccount(app);
        const other = await createAccount(app);
        const { verify } = await signedChallenge(app, { keys: testKeys(), purpose: 'link', account: asker });
        expect((await other.post('/auth/cardano/verify', verify).expect(400)).body).toEqual({ error: 'CHALLENGE EXPIRED' });
        // asking for a link needs a player
        await request(app).post('/auth/cardano/challenge').send({ purpose: 'link', address: testKeys().rewardAddress }).expect(401);
    });

    test('a challenge needs a known purpose and a reward address', async () => {
        const { app } = await setup();
        const bad = [{ purpose: 'pay', address: testKeys().rewardAddress }, { purpose: 'sign-in' }, { purpose: 'sign-in', address: 'addr_test1nonsense' }];
        for (const body of bad) {
            expect((await request(app).post('/auth/cardano/challenge').send(body).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        }
    });

    test('without CARDANO_NETWORK the routes do not exist', async () => {
        const { app } = await createTestApp();
        await request(app).get('/cardano/network').expect(404);
        await request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: testKeys().rewardAddress }).expect(404);
    });
});
