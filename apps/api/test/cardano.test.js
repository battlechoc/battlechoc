// Signing in with a Cardano key: the server issues a challenge, the game signs it (CIP-30
// signData with the stake key), the server verifies it and links the key to a player or signs
// that player in on another device.

const request = require('supertest');
const { cardano, chain: rules } = require('@battlechoc/battlechoc-shared-functions');
const { createTestApp, createAccount, withToken } = require('./helpers/api');
const { closeTestPools } = require('./helpers/db');
const { testKeys, signMessage, signedChallenge, confirmWith, linkConfirmed, removeKey } = require('./helpers/cardano');
const { cleanupChallenges } = require('../src/cardano');
const { chainApp, link: linkKey, linkedPlayer, giveItem, markMinted, userName, stake, pay, HOUR } = require('./helpers/minting');

afterAll(closeTestPools);

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const setup = async (options = {}) => {
    let clock = Date.now();
    const env = await createTestApp({ cardanoNetwork: cardano.Networks.preprod, now: () => clock, ...options });
    return { ...env, advance: ms => { clock += ms; }, time: () => clock };
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

describe('the linked keys of a player and whether an account has progress', () => {
    test('lists the linked keys, not the device', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        expect((await account.get('/user/identities').expect(200)).body).toEqual([]);
        const keys = testKeys();
        await link(app, account, keys);
        expect((await account.get('/user/identities').expect(200)).body).toEqual([
            {
                provider: 'cardano', subject: `stake:${keys.stakeKeyHashHex}`, address: keys.rewardAddress, createdAt: expect.any(String),
                wallet: null, items: 0, waitUntil: null,
            },
        ]);
    });

    test('removes one of two keys, never the last; a removed key no longer signs in', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const [first, second] = [testKeys(), testKeys()];
        await link(app, account, first);
        const { confirmToken } = (await confirmWith(app, account, first)).body;
        await linkConfirmed(app, account, second, confirmToken).then(response => expect(response.status).toBe(200));
        // the game sends the subject encoded (stake%3A…)
        await removeKey(app, account, `stake:${first.stakeKeyHashHex}`, confirmToken).expect(204);
        expect((await account.get('/user/identities')).body.map(identity => identity.subject)).toEqual([`stake:${second.stakeKeyHashHex}`]);
        expect((await signIn(app, first)).status).toBe(404);
        const again = (await confirmWith(app, account, second)).body.confirmToken;
        const last = await removeKey(app, account, `stake:${second.stakeKeyHashHex}`, again).expect(409);
        expect(last.body).toEqual({ error: 'LAST IDENTITY' });
        expect((await signIn(app, second)).status).toBe(200);
    });

    test('another player\'s key or one that does not exist cannot be removed', async () => {
        const { app } = await setup();
        const owner = await createAccount(app);
        const other = await createAccount(app);
        const [keys, others] = [testKeys(), testKeys()];
        await link(app, owner, keys);
        await link(app, other, others);
        const { confirmToken } = (await confirmWith(app, other, others)).body;
        expect((await removeKey(app, other, `stake:${keys.stakeKeyHashHex}`, confirmToken).expect(404)).body).toEqual({ error: 'NOT FOUND' });
        await removeKey(app, other, 'device', confirmToken).expect(404);
        expect((await owner.get('/user/identities')).body).toHaveLength(1);
    });

    test('progress: a finished match (verified or offline), an item or a discovery; not the tutorial, its starter kit or a name', async () => {
        const { app, pool } = await setup();
        const fresh = await createAccount(app);
        expect((await fresh.get('/user/progress').expect(200)).body).toEqual({ hasProgress: false });
        const tutorial = await createAccount(app, { username: 'Tina', starter: true });
        expect((await tutorial.get('/user/progress')).body).toEqual({ hasProgress: false });

        const played = await createAccount(app);
        await pool.query('INSERT INTO track_records (id, player_id, record, result, coins, xp, verified, created_at) VALUES ($1, $2, $3, $4, 0, 10, TRUE, NOW())',
            [`${played.playerId}:m1`, played.playerId, JSON.stringify({ id: 'm1' }), 'won']);
        expect((await played.get('/user/progress')).body).toEqual({ hasProgress: true });
        // a match played offline and reported later counts too (owner, 2026-11-08): its XP and AI ladder
        // would stay behind on an account nobody can reach
        const offline = await createAccount(app);
        await pool.query('INSERT INTO track_records (id, player_id, record, result, coins, xp, verified, created_at) VALUES ($1, $2, $3, $4, 0, 10, FALSE, NOW())',
            [`${offline.playerId}:m2`, offline.playerId, JSON.stringify({ id: 'm2' }), 'lost']);
        expect((await offline.get('/user/progress')).body).toEqual({ hasProgress: true });
        // a match that never ended is none
        const open = await createAccount(app);
        await pool.query('INSERT INTO track_records (id, player_id, record, result, coins, xp, verified, created_at) VALUES ($1, $2, $3, $4, 0, 0, FALSE, NOW())',
            [`${open.playerId}:m3`, open.playerId, JSON.stringify({ id: 'm3' }), 'open']);
        expect((await open.get('/user/progress')).body).toEqual({ hasProgress: false });

        const crafter = await createAccount(app);
        await pool.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by) VALUES ($1, $2, $3, 1, $2)', ['item-1', crafter.playerId, 'LIGHT_BARREL']);
        expect((await crafter.get('/user/progress')).body).toEqual({ hasProgress: true });

        const discoverer = await createAccount(app);
        await pool.query('INSERT INTO recipe_discoveries (item_key, player_id) VALUES ($1, $2)', ['LIGHT_BARREL', discoverer.playerId]);
        expect((await discoverer.get('/user/progress')).body).toEqual({ hasProgress: true });
    });
});

describe('after the first review', () => {
    test('the address of a linked key follows the network the server runs on (the switch to mainnet keeps it)', async () => {
        const { app, pool } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();
        await link(app, account, keys);
        const onMainnet = await createTestApp({ pool, cardanoNetwork: cardano.Networks.mainnet });
        const listed = (await withToken(onMainnet.app, account.accessToken).get('/user/identities').expect(200)).body;
        expect(listed).toEqual([expect.objectContaining({ subject: `stake:${keys.stakeKeyHashHex}`, address: testKeys({ words: keys.words, networkId: 1 }).rewardAddress })]);
    });

    test('an address in capitals is taken in its usual lower-case form', async () => {
        const { app } = await setup();
        const keys = testKeys();
        const { body } = await request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: keys.rewardAddress.toUpperCase() }).expect(200);
        expect(body.message.split('\n')[1]).toBe(keys.rewardAddress);
    });

    test('signing in is rate limited: 429, never 401', async () => {
        const { app } = await setup({ cardanoPerMinute: 2 });
        const body = { purpose: 'sign-in', address: testKeys().rewardAddress };
        await request(app).post('/auth/cardano/challenge').send(body).expect(200);
        await request(app).post('/auth/cardano/challenge').send(body).expect(200);
        expect((await request(app).post('/auth/cardano/challenge').send(body).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
    });

    test('the cleanup deletes the challenges nobody used in time', async () => {
        const { app, pool } = await setup();
        await request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: testKeys().rewardAddress }).expect(200);
        await cleanupChallenges(pool, Date.now());
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_challenges')).rows[0].n)).toBe(1);
        await cleanupChallenges(pool, Date.now() + CHALLENGE_TTL_MS + 1000);
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_challenges')).rows[0].n)).toBe(0);
    });
});

describe('confirmed key changes and passkey backups (plan 2)', () => {
    test('the first key needs no proof; a further key needs a confirm token signed by an existing key', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const [first, second] = [testKeys(), testKeys()];
        expect((await link(app, account, first)).status).toBe(200);
        // linking the same key again is a no-op, no proof needed
        expect((await link(app, account, first)).status).toBe(200);
        const refused = await link(app, account, second);
        expect(refused.status).toBe(403);
        expect(refused.body).toEqual({ error: 'CONFIRMATION REQUIRED' });
        const confirmed = await confirmWith(app, account, first);
        expect(confirmed.status).toBe(200);
        expect(confirmed.body).toEqual({ confirmToken: expect.any(String), expiresIn: 300 });
        expect((await linkConfirmed(app, account, second, confirmed.body.confirmToken)).status).toBe(200);
        expect((await account.get('/user/identities')).body).toHaveLength(2);
    });

    test('a confirm token is never an access token', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();
        await link(app, account, keys);
        const { confirmToken } = (await confirmWith(app, account, keys)).body;
        expect((await withToken(app, confirmToken).get('/user').expect(401)).body).toEqual({ error: 'invalid access token' });
    });

    test('a confirm must be signed by one of the player\'s own keys', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        await link(app, account, testKeys());
        const stranger = await confirmWith(app, account, testKeys());
        expect(stranger.status).toBe(403);
        expect(stranger.body).toEqual({ error: 'NOT YOUR KEY' });
    });

    test('a confirm token of another player, an expired one or none is refused', async () => {
        const { app, advance } = await setup();
        const account = await createAccount(app);
        const other = await createAccount(app);
        const [mine, theirs] = [testKeys(), testKeys()];
        await link(app, account, mine);
        await link(app, other, theirs);
        const otherToken = (await confirmWith(app, other, theirs)).body.confirmToken;
        expect((await linkConfirmed(app, account, testKeys(), otherToken)).status).toBe(403);
        expect((await removeKey(app, account, `stake:${mine.stakeKeyHashHex}`)).status).toBe(403);
        const token = (await confirmWith(app, account, mine)).body.confirmToken;
        advance(5 * 60 * 1000 + 1000);
        expect((await linkConfirmed(app, account, testKeys(), token)).status).toBe(403);
    });

    test('a passkey backup is stored for one of the player\'s keys, fetched by its credential id without a token, and goes with its key', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const [first, second] = [testKeys(), testKeys()];
        await link(app, account, first);
        const subject = `stake:${first.stakeKeyHashHex}`;
        const backup = { credentialId: 'cred-AbC_1', subject, iv: 'aXY', data: 'ZGF0YQ' };
        await account.post('/user/passkeys', backup).expect(201);
        // again with the same content: fine; with other content: refused (a token alone must not
        // swap what a passkey guards)
        await account.post('/user/passkeys', backup).expect(200);
        expect((await account.post('/user/passkeys', { ...backup, data: 'bmV3' }).expect(409)).body).toEqual({ error: 'PASSKEY TAKEN' });
        expect((await request(app).get('/auth/cardano/passkeys/cred-AbC_1')).body.data).toBe('ZGF0YQ');
        expect((await account.get('/user/passkeys').expect(200)).body).toEqual([{ credentialId: 'cred-AbC_1', subject, createdAt: expect.any(String) }]);
        // only what the passkey opens: no subject, no player
        expect((await request(app).get('/auth/cardano/passkeys/cred-AbC_1').expect(200)).body).toEqual({ iv: 'aXY', data: 'ZGF0YQ' });
        await request(app).get('/auth/cardano/passkeys/unknown').expect(404);
        // only for the player's own keys, and only plausible sizes
        await account.post('/user/passkeys', { ...backup, credentialId: 'cred-2', subject: `stake:${second.stakeKeyHashHex}` }).expect(400);
        await account.post('/user/passkeys', { ...backup, credentialId: 'x'.repeat(2000) }).expect(400);
        // removing the key removes its passkey backups
        const token = (await confirmWith(app, account, first)).body.confirmToken;
        await linkConfirmed(app, account, second, token);
        await removeKey(app, account, subject, token).expect(204);
        await request(app).get('/auth/cardano/passkeys/cred-AbC_1').expect(404);
        expect((await account.get('/user/passkeys')).body).toEqual([]);
    });

    test('two stores of one passkey at once both succeed; at most 10 passkeys per player', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();
        await link(app, account, keys);
        const subject = `stake:${keys.stakeKeyHashHex}`;
        const backup = n => ({ credentialId: `cred-${n}`, subject, iv: 'aXY', data: 'ZGF0YQ' });
        const both = await Promise.all([account.post('/user/passkeys', backup(0)), account.post('/user/passkeys', backup(0))]);
        expect(both.map(response => response.status).sort()).toEqual([200, 201]);
        for (let n = 1; n < 10; n += 1) {
            await account.post('/user/passkeys', backup(n)).expect(201);
        }
        expect((await account.post('/user/passkeys', backup(10)).expect(409)).body).toEqual({ error: 'TOO MANY PASSKEYS' });
    });

    test('removing a key ends the sessions it signed in (leaked words are locked out)', async () => {
        const { app } = await setup();
        const owner = await createAccount(app);
        const [kept, leaked] = [testKeys(), testKeys()];
        await link(app, owner, kept);
        const token = (await confirmWith(app, owner, kept)).body.confirmToken;
        await linkConfirmed(app, owner, leaked, token);
        // someone with the leaked words signs in somewhere else
        const intruder = (await signIn(app, testKeys({ words: leaked.words }))).body;
        await request(app).post('/accounts/token').send({ refreshToken: intruder.refreshToken }).expect(200);
        await removeKey(app, owner, `stake:${leaked.stakeKeyHashHex}`, token).expect(204);
        // its own answer: the game clears the removed key's words before it starts anew
        const ended = await request(app).post('/accounts/token').send({ refreshToken: intruder.refreshToken }).expect(401);
        expect(ended.body).toEqual({ error: 'session ended' });
        // the owner's own device session stays
        await request(app).post('/accounts/token').send({ refreshToken: owner.refreshToken }).expect(200);
    });

    test('a device that signed in with a key and removes that key stays signed in', async () => {
        const { app } = await setup();
        const owner = await createAccount(app);
        const [first, second] = [testKeys(), testKeys()];
        await link(app, owner, first);
        await linkConfirmed(app, owner, second, (await confirmWith(app, owner, first)).body.confirmToken);
        // another device signs in with the first key's words, then replaces that key there
        const device = (await signIn(app, testKeys({ words: first.words }))).body;
        const deviceAccount = withToken(app, device.accessToken);
        const token = (await confirmWith(app, { ...deviceAccount, accessToken: device.accessToken }, second)).body.confirmToken;
        await removeKey(app, { accessToken: device.accessToken }, `stake:${first.stakeKeyHashHex}`, token).expect(204);
        await request(app).post('/accounts/token').send({ refreshToken: device.refreshToken }).expect(200);
    });

    test('one confirm covers a replacement: link the new key, then remove the old one, within 5 minutes', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const [old, fresh] = [testKeys(), testKeys()];
        await link(app, account, old);
        const token = (await confirmWith(app, account, old)).body.confirmToken;
        expect((await linkConfirmed(app, account, fresh, token)).status).toBe(200);
        await removeKey(app, account, `stake:${old.stakeKeyHashHex}`, token).expect(204);
    });

    test('fetching passkey backups is rate limited', async () => {
        const { app } = await setup({ cardanoPerMinute: 2 });
        await request(app).get('/auth/cardano/passkeys/a').expect(404);
        await request(app).get('/auth/cardano/passkeys/b').expect(404);
        expect((await request(app).get('/auth/cardano/passkeys/c').expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
    });
});

describe('the wallet door (plan 3)', () => {
    // a wallet connects as the device's player: unknown → linked to it, known → that player's session
    const connect = async (app, account, keys, { address, with: kind, confirmToken } = {}) => {
        const { verify } = await signedChallenge(app, { keys, purpose: 'connect', account, address, with: kind });
        const sent = request(app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`);
        return (confirmToken ? sent.set('X-Battlechoc-Confirm', confirmToken) : sent).send(verify);
    };
    const sessionsOf = async (pool, playerId) =>
        Number((await pool.query('SELECT COUNT(*) AS n FROM sessions WHERE player_id = $1', [playerId])).rows[0].n);

    test('a wallet no player knows is linked to the player of the device', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        const answer = await connect(app, account, wallet);
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({
            outcome: 'linked',
            identity: { provider: 'cardano', subject: `stake:${wallet.stakeKeyHashHex}`, address: wallet.rewardAddress },
        });
        expect((await account.get('/user/identities')).body.map(identity => identity.subject)).toEqual([`stake:${wallet.stakeKeyHashHex}`]);
    });

    test('a player who has keys needs a proof before an unknown wallet is linked', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const words = testKeys();
        await link(app, account, words);
        const wallet = testKeys();
        const refused = await connect(app, account, wallet);
        expect(refused.status).toBe(403);
        expect(refused.body).toEqual({ error: 'CONFIRMATION REQUIRED' });
        expect((await account.get('/user/identities')).body).toHaveLength(1);
        const { confirmToken } = (await confirmWith(app, account, words)).body;
        const linked = await connect(app, account, wallet, { confirmToken });
        expect(linked.status).toBe(200);
        expect(linked.body.outcome).toBe('linked');
        expect((await account.get('/user/identities')).body).toHaveLength(2);
    });

    test('a wallet another player knows answers with a session for that player', async () => {
        const { app } = await setup();
        const owner = await createAccount(app, { username: 'Wanda' });
        const wallet = testKeys();
        await link(app, owner, wallet);
        const device = await createAccount(app);
        const answer = await connect(app, device, wallet);
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({
            outcome: 'known',
            playerId: owner.playerId,
            refreshToken: expect.any(String),
            accessToken: expect.any(String),
            expiresIn: expect.any(Number),
        });
        const refreshed = await request(app).post('/accounts/token').send({ refreshToken: answer.body.refreshToken }).expect(200);
        expect(refreshed.body.playerId).toBe(owner.playerId);
        // nothing is linked to the device's own player
        expect((await device.get('/user/identities')).body).toEqual([]);
    });

    test('the player\'s own wallet again: linked, no new session', async () => {
        const { app, pool } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        await link(app, account, wallet);
        const before = await sessionsOf(pool, account.playerId);
        const answer = await connect(app, account, wallet);
        expect(answer.status).toBe(200);
        expect(answer.body.outcome).toBe('linked');
        expect(await sessionsOf(pool, account.playerId)).toBe(before);
    });

    test('connecting is for the device\'s player: without a token a 401 for the missing token', async () => {
        const { app } = await setup();
        const answer = await request(app).post('/auth/cardano/challenge').send({ purpose: 'connect', address: testKeys().rewardAddress });
        expect(answer.status).toBe(401);
        expect(answer.body).toEqual({ error: 'missing access token' });
    });

    test('a wallet sends its address as hex (CIP-30): the text to sign carries the bech32 form', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        const { challenge, verify } = await signedChallenge(app, { keys: wallet, purpose: 'connect', account, address: wallet.rewardAddressHex });
        expect(challenge.message.split('\n')[1]).toBe(wallet.rewardAddress);
        expect((await account.post('/auth/cardano/verify', verify)).body.outcome).toBe('linked');
    });

    test('a wallet without a stake key signs with its payment key: identity pay:<hash>, signs in again', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        const answer = await connect(app, account, wallet, { address: wallet.enterpriseAddressHex, with: 'enterprise' });
        expect(answer.status).toBe(200);
        expect(answer.body.identity).toEqual({ provider: 'cardano', subject: `pay:${wallet.paymentKeyHashHex}`, address: wallet.enterpriseAddress });
        const { verify } = await signedChallenge(app, { keys: wallet, purpose: 'sign-in', address: wallet.enterpriseAddress, with: 'enterprise' });
        const session = await request(app).post('/auth/cardano/verify').send(verify);
        expect(session.status).toBe(200);
        expect(session.body.playerId).toBe(account.playerId);
    });

    test('a base address signs with its payment key too; the player\'s keys show the enterprise address', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        const answer = await connect(app, account, wallet, { address: wallet.baseAddress, with: 'base' });
        expect(answer.status).toBe(200);
        expect(answer.body.identity).toEqual({ provider: 'cardano', subject: `pay:${wallet.paymentKeyHashHex}`, address: wallet.enterpriseAddress });
        const [identity] = (await account.get('/user/identities')).body;
        expect(identity).toMatchObject({ subject: `pay:${wallet.paymentKeyHashHex}`, address: wallet.enterpriseAddress });
    });

    test('a script address, a mainnet payment address or a signature by the wrong key are refused', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const { Address, ScriptHash } = require('@evolution-sdk/evolution');
        const script = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('ab'.repeat(28)) }));
        expect((await account.post('/auth/cardano/challenge', { purpose: 'connect', address: script })).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        expect((await account.post('/auth/cardano/challenge', { purpose: 'connect', address: 'addr_test1nonsense' })).status).toBe(400);
        const mainnet = testKeys({ networkId: 1 });
        expect((await account.post('/auth/cardano/challenge', { purpose: 'connect', address: mainnet.enterpriseAddress })).body).toEqual({ error: 'WRONG NETWORK' });
        // the stake key cannot sign for the payment key's address
        const wallet = testKeys();
        const { challenge } = await signedChallenge(app, { keys: wallet, purpose: 'connect', account, address: wallet.enterpriseAddress, with: 'enterprise' });
        const forged = { nonce: challenge.nonce, ...signMessage({ ...wallet, enterpriseAddressHex: wallet.enterpriseAddressHex, paymentKey: wallet.stakeKey }, challenge.message, { with: 'enterprise' }) };
        expect((await account.post('/auth/cardano/verify', forged)).body).toEqual({ error: 'INVALID SIGNATURE' });
    });

    test('an enterprise address is never read as a reward address (the SDK would parse both 29-byte forms)', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        for (const address of [wallet.enterpriseAddress, wallet.enterpriseAddressHex]) {
            const { challenge } = await signedChallenge(app, { keys: wallet, purpose: 'connect', account, address, with: 'enterprise' });
            expect(challenge.message.split('\n')[1]).toBe(wallet.enterpriseAddress);
        }
    });

    test('logout ends one session; again or with an unknown token it still answers 204', async () => {
        const { app } = await setup();
        const account = await createAccount(app);
        const wallet = testKeys();
        await link(app, account, wallet);
        const other = (await signIn(app, wallet)).body;
        await request(app).post('/accounts/logout').send({ refreshToken: other.refreshToken }).expect(204);
        expect((await request(app).post('/accounts/token').send({ refreshToken: other.refreshToken }).expect(401)).body).toEqual({ error: 'invalid refresh token' });
        await request(app).post('/accounts/token').send({ refreshToken: account.refreshToken }).expect(200);
        await request(app).post('/accounts/logout').send({ refreshToken: other.refreshToken }).expect(204);
        await request(app).post('/accounts/logout').send({ refreshToken: 'x'.repeat(40) }).expect(204);
        await request(app).post('/accounts/logout').send({}).expect(204);
    });
});

describe('identity history (plan C)', () => {
    const historyOf = async (pool, subject) => (await pool.query(
        'SELECT player_id, linked_at, unlinked_at FROM identity_history WHERE subject = $1 ORDER BY linked_at', [subject])).rows
        .map(row => ({ playerId: row.player_id, linkedAt: new Date(row.linked_at).getTime(), unlinkedAt: row.unlinked_at === null ? null : new Date(row.unlinked_at).getTime() }));
    const walletOf = async (pool, subject) => (await pool.query("SELECT wallet FROM identities WHERE provider = 'cardano' AND subject = $1", [subject])).rows[0].wallet;
    const connect = async (app, account, keys, wallet) => {
        const { verify } = await signedChallenge(app, { keys, purpose: 'connect', account });
        return account.post('/auth/cardano/verify', { ...verify, wallet }).expect(200);
    };

    test('linking words writes one open row at the app\'s clock; linking them again writes none', async () => {
        const { app, pool, advance, time } = await setup();
        const account = await createAccount(app);
        const keys = testKeys();
        const subject = `stake:${keys.stakeKeyHashHex}`;
        advance(1234);
        const linkedAt = time();
        expect((await link(app, account, keys)).status).toBe(200);
        expect(await historyOf(pool, subject)).toEqual([{ playerId: account.playerId, linkedAt, unlinkedAt: null }]);
        advance(60000);
        expect((await link(app, account, keys)).status).toBe(200);
        expect(await historyOf(pool, subject)).toEqual([{ playerId: account.playerId, linkedAt, unlinkedAt: null }]);
    });

    test('connecting a wallet stores its CIP-30 name, if it is one; connecting it again changes nothing', async () => {
        const { app, pool, advance, time } = await setup();
        const account = await createAccount(app);
        const eternl = testKeys();
        const subject = `stake:${eternl.stakeKeyHashHex}`;
        const linkedAt = time();
        await connect(app, account, eternl, 'eternl');
        expect(await walletOf(pool, subject)).toBe('eternl');
        advance(60000);
        await connect(app, account, eternl, 'nami');
        expect(await walletOf(pool, subject)).toBe('eternl');
        expect(await historyOf(pool, subject)).toEqual([{ playerId: account.playerId, linkedAt, unlinkedAt: null }]);

        const other = await createAccount(app);
        for (const [name, keys] of [['Eternl!', testKeys()], ['x'.repeat(25), testKeys()], [42, testKeys()]]) {
            const fresh = await createAccount(app);
            await connect(app, fresh, keys, name);
            expect(await walletOf(pool, `stake:${keys.stakeKeyHashHex}`)).toBeNull();
        }
        // a link with words names no wallet unless the game sends one
        const words = testKeys();
        await link(app, other, words);
        expect(await walletOf(pool, `stake:${words.stakeKeyHashHex}`)).toBeNull();
    });

    test('removing a key closes its row at the removal; the other key\'s row stays open', async () => {
        const { app, pool, advance, time } = await setup();
        const account = await createAccount(app);
        const [first, second] = [testKeys(), testKeys()];
        const firstAt = time();
        await link(app, account, first);
        const { confirmToken } = (await confirmWith(app, account, first)).body;
        advance(1000);
        const secondAt = time();
        await linkConfirmed(app, account, second, confirmToken).then(response => expect(response.status).toBe(200));
        advance(1000);
        const removedAt = time();
        await removeKey(app, account, `stake:${first.stakeKeyHashHex}`, confirmToken).expect(204);
        expect(await historyOf(pool, `stake:${first.stakeKeyHashHex}`)).toEqual([{ playerId: account.playerId, linkedAt: firstAt, unlinkedAt: removedAt }]);
        expect(await historyOf(pool, `stake:${second.stakeKeyHashHex}`)).toEqual([{ playerId: account.playerId, linkedAt: secondAt, unlinkedAt: null }]);
        // a removal that is refused (the last key) closes nothing
        const again = (await confirmWith(app, account, second)).body.confirmToken;
        await removeKey(app, account, `stake:${second.stakeKeyHashHex}`, again).expect(409);
        expect((await historyOf(pool, `stake:${second.stakeKeyHashHex}`))[0].unlinkedAt).toBeNull();
    });

    test('a key that moves to another player: the first player\'s row closes at the removal, the second one\'s opens at the link', async () => {
        const { app, pool, advance, time } = await setup();
        const [q, p] = [await createAccount(app), await createAccount(app)];
        const [moving, kept] = [testKeys(), testKeys()];
        const subject = `stake:${moving.stakeKeyHashHex}`;
        const qAt = time();
        await link(app, q, moving);
        const { confirmToken } = (await confirmWith(app, q, moving)).body;
        await linkConfirmed(app, q, kept, confirmToken);
        // while Q has it, P cannot take it (and no row is written for P)
        expect((await link(app, p, moving)).status).toBe(409);
        advance(1000);
        const removedAt = time();
        await removeKey(app, q, subject, confirmToken).expect(204);
        advance(1000);
        const pAt = time();
        expect((await link(app, p, moving)).status).toBe(200);
        expect(await historyOf(pool, subject)).toEqual([
            { playerId: q.playerId, linkedAt: qAt, unlinkedAt: removedAt },
            { playerId: p.playerId, linkedAt: pAt, unlinkedAt: null },
        ]);
    });

    test('a link closes a row a key linked to nobody was left open with, so a key never has two', async () => {
        const { app, pool, advance, time } = await setup();
        const [gone, p] = [await createAccount(app), await createAccount(app)];
        const keys = testKeys();
        const subject = `stake:${keys.stakeKeyHashHex}`;
        await pool.query('INSERT INTO identity_history (id, subject, player_id, linked_at) VALUES ($1, $2, $3, $4)',
            ['left-open', subject, gone.playerId, new Date(time() - 1000)]);
        advance(1000);
        const linkedAt = time();
        await link(app, p, keys);
        expect(await historyOf(pool, subject)).toEqual([
            { playerId: gone.playerId, linkedAt: linkedAt - 2000, unlinkedAt: linkedAt },
            { playerId: p.playerId, linkedAt, unlinkedAt: null },
        ]);
    });

    test('a new device account writes no history row', async () => {
        const { app, pool } = await setup();
        await createAccount(app);
        expect(Number((await pool.query('SELECT COUNT(*) AS n FROM identity_history')).rows[0].n)).toBe(0);
    });
});

describe('what the wallet row shows (plan C)', () => {
    const identitiesOf = async account => (await account.get('/user/identities').expect(200)).body;
    // a minted item of `account`'s with its token at `address`, synced
    const mintedAt = async (env, account, address, n) => {
        const itemId = await giveItem(env.pool, account.playerId, 'LIGHT_BARREL');
        await markMinted(env.pool, itemId, userName(n));
        env.double.mintToken({ assetName: userName(n), to: address });
        env.block();
        await env.sync();
        return itemId;
    };

    test('a connected wallet with a minted item: its name, one item, no wait; a server without chain features says the same', async () => {
        const env = await chainApp();
        const account = await createAccount(env.app, { username: 'Ann' });
        const eternl = testKeys();
        const { verify } = await signedChallenge(env.app, { keys: eternl, purpose: 'connect', account });
        await account.post('/auth/cardano/verify', { ...verify, wallet: 'eternl' }).expect(200);
        const createdAt = expect.any(String);
        await mintedAt(env, account, env.double.addressOf(eternl), 1);
        const expected = [{ provider: 'cardano', subject: stake(eternl), address: eternl.rewardAddress, createdAt, wallet: 'eternl', items: 1, waitUntil: null }];
        expect(await identitiesOf(account)).toEqual(expected);
        const offChain = await createTestApp({ pool: env.pool, cardanoNetwork: cardano.Networks.preprod, now: env.now });
        expect(await identitiesOf(withToken(offChain.app, account.accessToken))).toEqual(expected);
    });

    test('the count does not depend on other players\' items (pg-mem: asset_name IS NOT NULL beside the player index found nothing)', async () => {
        const env = await chainApp();
        const [annKeys, benKeys] = [testKeys(), testKeys()];
        const ann = await linkedPlayer(env, 'Ann', annKeys);
        const ben = await linkedPlayer(env, 'Ben', benKeys);
        // Ann's item, then two of Ben's; Ann's and Ben's second one minted, Ben's first one plain
        const annItem = await giveItem(env.pool, ann.playerId, 'LIGHT_BARREL');
        await giveItem(env.pool, ben.playerId, 'LIGHT_BARREL');
        const benItem = await giveItem(env.pool, ben.playerId, 'HEAVY_BARREL');
        await markMinted(env.pool, annItem, userName(1));
        await markMinted(env.pool, benItem, userName(2));
        env.double.mintToken({ assetName: userName(1), to: env.double.addressOf(annKeys) });
        env.double.mintToken({ assetName: userName(2), to: env.double.addressOf(benKeys) });
        env.block();
        expect(await env.sync()).toMatchObject({ checked: 2, changed: 2 });
        expect((await identitiesOf(ann)).map(entry => [entry.subject, entry.items])).toEqual([[stake(annKeys), 1]]);
        expect((await identitiesOf(ben)).map(entry => [entry.subject, entry.items])).toEqual([[stake(benKeys), 1]]);
    });

    test('a wallet that was another player\'s: waitUntil is the link plus 24 hours, then null and the item counts', async () => {
        const env = await chainApp();
        const [wallet, other] = [testKeys(), testKeys()];
        const ben = await linkedPlayer(env, 'Ben', wallet, other);
        await mintedAt(env, ben, env.double.addressOf(wallet), 1);
        expect(Object.fromEntries((await identitiesOf(ben)).map(entry => [entry.subject, entry.items]))).toEqual({ [stake(wallet)]: 1, [stake(other)]: 0 });
        const { confirmToken } = (await confirmWith(env.app, ben, other)).body;
        await removeKey(env.app, ben, stake(wallet), confirmToken).expect(204);
        env.advance(HOUR);
        const cara = await createAccount(env.app, { username: 'Cara' });
        await linkKey(env, cara, wallet);
        const linkedAt = env.now();
        env.block();
        await env.sync();
        expect(await identitiesOf(cara)).toEqual([expect.objectContaining({
            subject: stake(wallet), items: 0, waitUntil: new Date(linkedAt + rules.WALLET_HOP_WAIT_MS).toISOString(),
        })]);
        env.advance(rules.WALLET_HOP_WAIT_MS);
        env.block();
        await env.sync();
        // a day later: new access tokens
        const again = async account => withToken(env.app, (await request(env.app).post('/accounts/token').send({ refreshToken: account.refreshToken }).expect(200)).body.accessToken);
        expect(await identitiesOf(await again(cara))).toEqual([expect.objectContaining({ subject: stake(wallet), items: 1, waitUntil: null })]);
        expect(await identitiesOf(await again(ben))).toEqual([expect.objectContaining({ subject: stake(other), items: 0, waitUntil: null })]);
    });

    test('an item held through the payment key (its address\'s stake key is nobody\'s) counts for that key', async () => {
        const env = await chainApp();
        const [keys, second] = [testKeys(), testKeys()];
        const account = await createAccount(env.app, { username: 'Ann' });
        await linkKey(env, account, second);
        await linkKey(env, account, keys, { kind: 'pay', confirmBy: second });
        // her base address: the stake key is linked to nobody, the payment key to Ann
        await mintedAt(env, account, env.double.addressOf(keys), 1);
        await mintedAt(env, account, env.double.addressOf(keys, 'enterprise'), 2);
        // an item at the address of her stake key counts there
        await mintedAt(env, account, env.double.addressOf(second), 3);
        expect(Object.fromEntries((await identitiesOf(account)).map(entry => [entry.subject, entry.items]))).toEqual({ [stake(second)]: 1, [pay(keys)]: 2 });
    });

    test('with two payment keys, an item at a base address of a stake key nobody has counts for the payment key that holds it, on no other row', async () => {
        const env = await chainApp();
        const [words, first, other] = [testKeys(), testKeys(), testKeys()];
        const account = await createAccount(env.app, { username: 'Ann' });
        await linkKey(env, account, words);
        await linkKey(env, account, first, { kind: 'pay', confirmBy: words });
        await linkKey(env, account, other, { kind: 'pay', confirmBy: words });
        await mintedAt(env, account, env.double.addressOf(first), 1);
        expect(Object.fromEntries((await identitiesOf(account)).map(entry => [entry.subject, entry.items])))
            .toEqual({ [stake(words)]: 0, [pay(first)]: 1, [pay(other)]: 0 });
        await mintedAt(env, account, env.double.addressOf(other), 2);
        expect(Object.fromEntries((await identitiesOf(account)).map(entry => [entry.subject, entry.items])))
            .toEqual({ [stake(words)]: 0, [pay(first)]: 1, [pay(other)]: 1 });
    });

    test('an item under a stake key of the player counts on that key\'s row only, also when the address\'s payment key is linked too', async () => {
        const env = await chainApp();
        const keys = testKeys();
        const account = await createAccount(env.app, { username: 'Ann' });
        await linkKey(env, account, keys);
        await linkKey(env, account, keys, { kind: 'pay', confirmBy: keys });
        await mintedAt(env, account, env.double.addressOf(keys), 1);
        expect(Object.fromEntries((await identitiesOf(account)).map(entry => [entry.subject, entry.items]))).toEqual({ [stake(keys)]: 1, [pay(keys)]: 0 });
    });
});
