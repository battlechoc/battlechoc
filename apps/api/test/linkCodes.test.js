// Link codes (plan 3): a phone's wallet opens battlechoc's link page in its own browser, which
// shares nothing with the game. A short-lived code ties that page to the device's player: the
// page signs a challenge for the code without any token, and the game polls the code's state.

const crypto = require('crypto');
const request = require('supertest');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { createTestApp, createAccount } = require('./helpers/api');
const { closeTestPools } = require('./helpers/db');
const { testKeys, signMessage, signedChallenge, confirmWith, removeKey } = require('./helpers/cardano');

afterAll(closeTestPools);

const CODE_TTL_MS = 10 * 60 * 1000;

const setup = async () => {
    let clock = Date.now();
    const env = await createTestApp({ cardanoNetwork: cardano.Networks.preprod, now: () => clock });
    return { ...env, advance: ms => { clock += ms; } };
};

const newCode = async (account, purpose = 'connect', confirmToken) => {
    const sent = confirmToken
        ? request(account.app).post('/user/link-codes').set('Authorization', `Bearer ${account.accessToken}`)
            .set('X-Battlechoc-Confirm', confirmToken).send({ purpose })
        : account.post('/user/link-codes', { purpose });
    return (await sent.expect(201)).body;
};

// what the link page does in the wallet's browser: no token, only the code
const signOnLinkPage = async (app, code, wallet) => {
    const challenge = await request(app).post('/auth/cardano/challenge').send({ purpose: 'connect', code, address: wallet.rewardAddressHex });
    if (challenge.status !== 200) {
        return challenge;
    }
    return request(app).post('/auth/cardano/verify').send({ nonce: challenge.body.nonce, ...signMessage(wallet, challenge.body.message) });
};

const poll = (account, code) => account.get(`/user/link-codes/${code}`);

const linkKey = async (app, account, keys) => {
    const { verify } = await signedChallenge(app, { keys, purpose: 'link', account });
    return account.post('/auth/cardano/verify', verify).expect(200);
};

const accountOn = async app => ({ ...(await createAccount(app)), app });

describe('link codes for the phone wallet\'s browser (plan 3)', () => {
    test('a code links an unknown wallet signed on the link page; the poll says so once', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        const { code, expiresAt } = await newCode(device);
        expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(CODE_TTL_MS - 60000);
        expect((await poll(device, code).expect(200)).body).toEqual({ state: 'open' });
        const wallet = testKeys();
        const page = await signOnLinkPage(app, code, wallet);
        expect(page.status).toBe(200);
        expect(page.body).toEqual({ outcome: 'linked' });
        expect((await poll(device, code).expect(200)).body).toEqual({
            state: 'linked',
            identity: { provider: 'cardano', subject: `stake:${wallet.stakeKeyHashHex}`, address: wallet.rewardAddress },
        });
        expect((await poll(device, code).expect(404)).body).toEqual({ error: 'UNKNOWN LINK CODE' });
        expect((await device.get('/user/identities')).body).toHaveLength(1);
    });

    test('a known wallet: the link page gets no tokens, the poll a session for its player, once', async () => {
        const { app } = await setup();
        const owner = await accountOn(app);
        const wallet = testKeys();
        await linkKey(app, owner, wallet);
        const device = await accountOn(app);
        const { code } = await newCode(device);
        const page = await signOnLinkPage(app, code, wallet);
        expect(page.body).toEqual({ outcome: 'known' });
        const answer = (await poll(device, code).expect(200)).body;
        expect(answer).toEqual({
            state: 'known',
            playerId: owner.playerId,
            refreshToken: expect.any(String),
            accessToken: expect.any(String),
            expiresIn: expect.any(Number),
        });
        expect((await request(app).post('/accounts/token').send({ refreshToken: answer.refreshToken }).expect(200)).body.playerId).toBe(owner.playerId);
        await poll(device, code).expect(404);
        expect((await device.get('/user/identities')).body).toEqual([]);
    });

    test('a player with keys: an unconfirmed code links nothing and says so; a confirmed one links', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        const words = testKeys();
        await linkKey(app, device, words);
        const wallet = testKeys();
        const unconfirmed = await newCode(device);
        expect((await signOnLinkPage(app, unconfirmed.code, wallet)).body).toEqual({ outcome: 'confirm' });
        expect((await poll(device, unconfirmed.code).expect(200)).body).toEqual({ state: 'confirm' });
        expect((await device.get('/user/identities')).body).toHaveLength(1);
        const { confirmToken } = (await confirmWith(app, device, words)).body;
        const confirmed = await newCode(device, 'connect', confirmToken);
        expect((await signOnLinkPage(app, confirmed.code, wallet)).body).toEqual({ outcome: 'linked' });
        expect((await device.get('/user/identities')).body).toHaveLength(2);
    });

    test('after 10 minutes a code is gone, at the link page and at the poll', async () => {
        const { app, advance } = await setup();
        const device = await accountOn(app);
        const { code } = await newCode(device);
        advance(CODE_TTL_MS + 1000);
        const page = await signOnLinkPage(app, code, testKeys());
        expect(page.status).toBe(404);
        expect(page.body).toEqual({ error: 'UNKNOWN LINK CODE' });
        await poll(device, code).expect(404);
    });

    test('a code replaced while its challenge was out links nothing', async () => {
        const { app, advance } = await setup();
        const device = await accountOn(app);
        const { code } = await newCode(device);
        const wallet = testKeys();
        const challenge = (await request(app).post('/auth/cardano/challenge').send({ purpose: 'connect', code, address: wallet.rewardAddress }).expect(200)).body;
        advance(60 * 1000);
        const newer = await newCode(device);
        const late = await request(app).post('/auth/cardano/verify').send({ nonce: challenge.nonce, ...signMessage(wallet, challenge.message) });
        expect(late.status).toBe(404);
        expect(late.body).toEqual({ error: 'UNKNOWN LINK CODE' });
        expect((await device.get('/user/identities')).body).toEqual([]);
        expect((await poll(device, newer.code).expect(200)).body).toEqual({ state: 'open' });
    });

    test('only the code\'s player can poll it; a newer code replaces the older one', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        const stranger = await accountOn(app);
        const first = await newCode(device);
        await poll(stranger, first.code).expect(404);
        const second = await newCode(device);
        await poll(device, first.code).expect(404);
        expect((await signOnLinkPage(app, first.code, testKeys())).status).toBe(404);
        await poll(device, second.code).expect(200);
        await poll(device, 'not a code').expect(404);
    });

    test('a code is kept only as its hash', async () => {
        const { app, pool } = await setup();
        const device = await accountOn(app);
        const { code } = await newCode(device);
        const { rows } = await pool.query('SELECT code_hash FROM link_codes');
        expect(rows).toEqual([{ code_hash: crypto.createHash('sha256').update(code).digest('hex') }]);
    });

    test('a link code for a wallet another player has: failed, IDENTITY TAKEN', async () => {
        const { app } = await setup();
        const owner = await accountOn(app);
        const wallet = testKeys();
        await linkKey(app, owner, wallet);
        const device = await accountOn(app);
        const { code } = await newCode(device, 'link');
        const page = await signOnLinkPage(app, code, wallet);
        expect(page.status).toBe(409);
        expect(page.body).toEqual({ error: 'IDENTITY TAKEN' });
        expect((await poll(device, code).expect(200)).body).toEqual({ state: 'failed', error: 'IDENTITY TAKEN' });
    });

    test('a code is only for connect or link, and only for a player', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        expect((await device.post('/user/link-codes', { purpose: 'sign-in' })).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        expect((await request(app).post('/user/link-codes').send({ purpose: 'connect' })).status).toBe(401);
    });

    test('after review: a key removed between the link page and the poll gives no session', async () => {
        const { app } = await setup();
        const owner = await accountOn(app);
        const [wallet, words] = [testKeys(), testKeys()];
        await linkKey(app, owner, words);
        const { confirmToken } = (await confirmWith(app, owner, words)).body;
        const { verify } = await signedChallenge(app, { keys: wallet, purpose: 'link', account: owner });
        await request(app).post('/auth/cardano/verify').set('Authorization', `Bearer ${owner.accessToken}`)
            .set('X-Battlechoc-Confirm', confirmToken).send(verify).expect(200);
        const device = await accountOn(app);
        const { code } = await newCode(device);
        expect((await signOnLinkPage(app, code, wallet)).body).toEqual({ outcome: 'known' });
        // the owner removes that wallet (its words leaked, say) before the game polls
        await removeKey(app, owner, `stake:${wallet.stakeKeyHashHex}`, confirmToken).expect(204);
        expect((await poll(device, code).expect(200)).body).toEqual({ state: 'failed', error: 'UNKNOWN IDENTITY' });
    });

    test('after review: two signatures for one code at once link one wallet, the other gets 404', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        const { code } = await newCode(device);
        const wallets = [testKeys(), testKeys()];
        const challenges = await Promise.all(wallets.map(async wallet =>
            (await request(app).post('/auth/cardano/challenge').send({ purpose: 'connect', code, address: wallet.rewardAddress }).expect(200)).body));
        const answers = await Promise.all(wallets.map((wallet, i) => request(app).post('/auth/cardano/verify')
            .send({ nonce: challenges[i].nonce, ...signMessage(wallet, challenges[i].message) })));
        expect(answers.map(answer => answer.status).sort()).toEqual([200, 404]);
        expect((await device.get('/user/identities')).body).toHaveLength(1);
    });

    test('after review: a confirmed code counts as confirmed only as long as its confirm token', async () => {
        const { app, advance } = await setup();
        const device = await accountOn(app);
        const words = testKeys();
        await linkKey(app, device, words);
        const { confirmToken } = (await confirmWith(app, device, words)).body;
        const { code } = await newCode(device, 'connect', confirmToken);
        advance(5 * 60 * 1000 + 1000);
        expect((await signOnLinkPage(app, code, testKeys())).body).toEqual({ outcome: 'confirm' });
        expect((await device.get('/user/identities')).body).toHaveLength(1);
    });

    test('after review: the text a link page signs says it signs in the device that opened the page', async () => {
        const { app } = await setup();
        const device = await accountOn(app);
        const { code } = await newCode(device);
        const { message } = (await request(app).post('/auth/cardano/challenge')
            .send({ purpose: 'connect', code, address: testKeys().rewardAddress }).expect(200)).body;
        expect(message.split('\n')[3]).toBe(cardano.challengeMessage({
            address: 'a', purpose: 'connect', network: cardano.Networks.preprod, nonce: 'n', issuedAt: new Date(0), expiresAt: new Date(0), onAnotherDevice: true,
        }).split('\n')[3]);
        expect(message).toContain('Only go on if that device is yours.');
    });
});
