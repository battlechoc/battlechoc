// Every error the REST API answers with: status and the exact body. Installed game clients (also
// old cached versions) match on these, so they must not change.

const request = require('supertest');
const { EntityType } = require('@battlechoc/battlechoc-shared-functions');
const { HttpError, ErrorCode } = require('../src/errors');
const { NotEnoughIngredientsError } = require('../src/pantry');
const { closeTestPools, failingOn } = require('./helpers/db');
const { createTestApp, createAccount, withToken } = require('./helpers/api');
const { testKeys, signedChallenge, confirmWith, removeKey } = require('./helpers/cardano');

afterAll(closeTestPools);

const setup = async options => {
    const { app, pool, auth } = await createTestApp(options);
    return { app, pool, auth, as: accessToken => withToken(app, accessToken), account: () => createAccount(app) };
};

// status and body, as text: the order of the keys and every character count
const answers = async (sent, status, code) => {
    const response = await sent;
    expect({ status: response.status, text: response.text }).toEqual({ status, text: JSON.stringify({ error: code }) });
    expect(response.type).toBe('application/json');
};

describe('errors', () => {
    test('an HttpError carries status and code; the list of codes is frozen', () => {
        const error = new HttpError(404, ErrorCode.PLAYER_NOT_FOUND);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ status: 404, code: 'PLAYER NOT FOUND', message: 'PLAYER NOT FOUND' });
        expect(Object.isFrozen(ErrorCode)).toBe(true);
        // no two names for one answer
        expect(new Set(Object.values(ErrorCode)).size).toBe(Object.keys(ErrorCode).length);
        expect(new NotEnoughIngredientsError('RUM')).toMatchObject({ status: 400, code: 'NOT ENOUGH INGREDIENTS', ingredient: 'RUM' });
    });

    test('authentication: lower case, as the first clients got them', async () => {
        let time = Date.now();
        const { app, pool, account } = await setup({ now: () => time });
        const player = await account();
        await answers(request(app).get('/user'), 401, 'missing access token');
        await answers(request(app).get('/user').set('Authorization', 'Basic abc'), 401, 'missing access token');
        await answers(request(app).get('/generaterandomname'), 401, 'missing access token');
        await answers(request(app).get('/user').set('Authorization', `Bearer ${player.accessToken.slice(0, -4)}abcd`), 401, 'invalid access token');
        await answers(request(app).get('/user').set('Authorization', 'Bearer nonsense'), 401, 'invalid access token');
        await answers(request(app).post('/accounts/token'), 401, 'invalid refresh token');
        await answers(request(app).post('/accounts/token').send({ refreshToken: 'short' }), 401, 'invalid refresh token');
        await answers(request(app).post('/accounts/token').send({ refreshToken: 'x'.repeat(40) }), 401, 'invalid refresh token');
        await pool.query('UPDATE sessions SET revoked = TRUE WHERE player_id = $1', [player.playerId]);
        await answers(request(app).post('/accounts/token').send({ refreshToken: player.refreshToken }), 401, 'invalid refresh token');
        // a session that a key removal ended says so (the game then forgets that key's words)
        await pool.query("UPDATE sessions SET revoked_reason = 'key-removed' WHERE player_id = $1", [player.playerId]);
        await answers(request(app).post('/accounts/token').send({ refreshToken: player.refreshToken }), 401, 'session ended');
        time += 16 * 60 * 1000;
        await answers(player.get('/user'), 401, 'invalid access token');
    });

    test('a token of a player that does not exist', async () => {
        const { auth, as } = await setup();
        const ghost = as((await auth.issueAccessToken('ghost')).accessToken);
        await answers(ghost.get('/user'), 404, 'PLAYER NOT FOUND');
        await answers(ghost.post('/user/trackrecords', { stats: [] }), 404, 'PLAYER NOT FOUND');
        await answers(ghost.get('/highscore'), 404, 'PLAYER NOT FOUND');
    });

    test('player, names, settings, reports', async () => {
        const { account } = await setup();
        const player = await account();
        const other = await account();
        await other.post('/user/username', { username: 'Gustav' }).expect(200);
        await answers(player.post('/user/trackrecords', {}), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/user/trackrecords', { stats: 'none' }), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/user/tutorial/nope'), 404, 'UNKNOWN TUTORIAL STEP');
        await answers(player.post('/user/username', { username: 'x' }), 400, 'USERNAME NOT VALID');
        await answers(player.post('/user/username', {}), 400, 'USERNAME NOT VALID');
        await answers(player.post('/user/username', { username: 'Chocnonymous' }), 400, 'USERNAME NOT VALID');
        await answers(player.post('/user/username', { username: 'GUSTAV' }), 400, 'PLAYER WITH GIVEN NAME DOES ALREADY EXIST');
        await answers(player.post('/user/language', { language: 'xx' }), 400, 'INVALID LANGUAGE GIVEN');
        await answers(player.post('/user/language', {}), 400, 'INVALID LANGUAGE GIVEN');
        await answers(player.post('/debugging/gamestate', {}), 400, 'INVALID REPORT');
        await answers(player.post('/debugging/gamestate', { report: 'text' }), 400, 'INVALID REPORT');
        await answers(player.post('/push/subscription', { subscription: { endpoint: 'x' } }), 400, 'INVALID SUBSCRIPTION');
        await answers(player.post('/push/subscription', {}), 400, 'INVALID SUBSCRIPTION');
    });

    test('two players who take the same name at the same time: one gets it', async () => {
        const { account } = await setup();
        const players = [await account(), await account(), await account()];
        const responses = await Promise.all(players.map(player => player.post('/user/username', { username: 'Carolin' })));
        expect(responses.map(response => response.status).sort()).toEqual([200, 400, 400]);
        responses.filter(response => response.status === 400)
            .forEach(response => expect(response.text).toBe('{"error":"PLAYER WITH GIVEN NAME DOES ALREADY EXIST"}'));
        expect(responses.find(response => response.status === 200).text).toBe('{"username":"Carolin"}');
    });

    test('other players', async () => {
        const { account } = await setup();
        const player = await account();
        await player.post('/user/username', { username: 'Carolin' }).expect(200);
        await answers(player.post('/user/friend', { friend: 'Nobody' }), 404, 'PLAYER NOT FOUND');
        await answers(player.post('/user/friend', { friend: 'carolin' }), 404, 'PLAYER NOT FOUND');
        await answers(player.post('/user/friend', {}), 404, 'PLAYER NOT FOUND');
        await answers(player.del('/user/friend', { friend: 'Nobody' }), 404, 'PLAYER NOT FOUND');
        await answers(player.get('/user/nobody'), 404, 'PLAYER NOT FOUND');
    });

    test('the lab refuses what is not a building, an item or a slot', async () => {
        const { account } = await setup();
        const player = await account();
        await answers(player.post('/lab/try', {}), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/lab/try', { entityType: EntityType.RUM_TRUFFLE_CANNON, ingredients: ['SUGAR'] }), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/lab/try', { entityType: EntityType.RUM_TRUFFLE_CANNON, ingredients: ['SUGAR', 'MILK'] }), 400, 'MISSING INGREDIENTS');
        await answers(player.post('/lab/craft', { item: 'NOPE' }), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/lab/craft', { item: 'LIGHT_BARREL' }), 400, 'RECIPE NOT DISCOVERED');
        await answers(player.post('/user/equipment', { entityType: EntityType.RUM_TRUFFLE_CANNON, slot: 9, itemId: null }), 400, 'INVALID REQUEST PARAMETERS');
        await answers(player.post('/user/equipment', { entityType: EntityType.RUM_TRUFFLE_CANNON, slot: 0, itemId: 'nope' }), 400, 'NOT YOUR ITEM');
    });

    test('signing in with a Cardano key: never a 401 but for a missing token', async () => {
        const { app, account } = await setup({ cardanoNetwork: { name: 'preprod', networkId: 0 } });
        const player = await account();
        const keys = testKeys();
        await answers(request(app).post('/auth/cardano/challenge').send({ purpose: 'pay', address: keys.rewardAddress }), 400, 'INVALID REQUEST PARAMETERS');
        await answers(request(app).post('/auth/cardano/challenge').send({ purpose: 'sign-in', address: testKeys({ networkId: 1 }).rewardAddress }), 400, 'WRONG NETWORK');
        await answers(request(app).post('/auth/cardano/verify').send({ nonce: 'nope' }), 400, 'CHALLENGE EXPIRED');
        const unknown = await signedChallenge(app, { keys, purpose: 'sign-in' });
        await answers(request(app).post('/auth/cardano/verify').send({ ...unknown.verify, signature: 'ab' }), 400, 'INVALID SIGNATURE');
        const signIn = await signedChallenge(app, { keys, purpose: 'sign-in' });
        await answers(request(app).post('/auth/cardano/verify').send(signIn.verify), 404, 'UNKNOWN IDENTITY');
        const linked = await signedChallenge(app, { keys, purpose: 'link', account: player });
        await player.post('/auth/cardano/verify', linked.verify).expect(200);
        const other = await account();
        const taken = await signedChallenge(app, { keys, purpose: 'link', account: other });
        await answers(other.post('/auth/cardano/verify', taken.verify), 409, 'IDENTITY TAKEN');
        const [{ subject }] = (await player.get('/user/identities')).body;
        await answers(removeKey(app, player, subject), 403, 'CONFIRMATION REQUIRED');
        await answers(confirmWith(app, player, testKeys()), 403, 'NOT YOUR KEY');
        const { confirmToken } = (await confirmWith(app, player, keys)).body;
        await answers(removeKey(app, player, subject, confirmToken), 409, 'LAST IDENTITY');
        for (let n = 0; n < 10; n += 1) {
            await player.post('/user/passkeys', { credentialId: `c${n}`, subject, iv: 'aXY', data: 'ZA' }).expect(201);
        }
        await answers(player.post('/user/passkeys', { credentialId: 'c10', subject, iv: 'aXY', data: 'ZA' }), 409, 'TOO MANY PASSKEYS');
        await answers(player.post('/user/passkeys', { credentialId: 'c0', subject, iv: 'aXY', data: 'b3RoZXI' }), 409, 'PASSKEY TAKEN');
        // plan 3: a wallet nobody knows, for a player with keys, needs the proof as well
        const wallet = await signedChallenge(app, { keys: testKeys(), purpose: 'connect', account: player });
        await answers(player.post('/auth/cardano/verify', wallet.verify), 403, 'CONFIRMATION REQUIRED');
        const loggedOut = await request(app).post('/accounts/logout').send({ refreshToken: other.refreshToken });
        expect(loggedOut.status).toBe(204);
        expect(loggedOut.text).toBe('');
    });

    test('transport: unknown paths, broken JSON, too many requests', async () => {
        const { app, account } = await setup({ accountsPerMinute: 1 });
        const player = await account();
        await answers(request(app).get('/nope'), 404, 'NOT FOUND');
        await answers(request(app).post('/'), 404, 'NOT FOUND');
        await answers(player.del('/user'), 404, 'NOT FOUND');
        await answers(request(app).post('/accounts/token').set('Content-Type', 'application/json').send('{"refreshToken":'), 400, 'INVALID JSON');
        await answers(request(app).post('/accounts'), 429, 'TOO MANY REQUESTS');
        // routes of the old asynchronous multiplayer: no game version since the rewrite calls them
        await answers(player.get('/random/opponent'), 404, 'NOT FOUND');
        await answers(player.get('/query/user/e'), 404, 'NOT FOUND');
        // never called by a game either; their paths are lookups of a player by name now
        await answers(player.get('/user/pantry'), 404, 'PLAYER NOT FOUND');
        await answers(player.get('/user/items'), 404, 'PLAYER NOT FOUND');
        await player.post('/user/username', { username: 'Items' }).expect(200);
        expect((await player.get('/user/items').expect(200)).body).toEqual([expect.objectContaining({ name: 'Items', ranking: 1 })]);
        // a preflight is answered before any route, also for unknown paths
        const preflight = await request(app).options('/nope').expect(204);
        expect(preflight.text).toBe('');
    });

    test('anything unexpected is logged and answered without details', async () => {
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const { app, account } = await setup({ wrapPool: pool => failingOn(pool, /FROM pantry/) });
            const player = await account();
            await answers(player.get('/user'), 500, 'INTERNAL SERVER ERROR');
            expect(log).toHaveBeenCalledTimes(1);
            expect(log.mock.calls[0][0].message).toBe('injected failure');
            // a body over the limit is not a client error of its own today
            await answers(request(app).post('/accounts/token').send({ refreshToken: 'x'.repeat(300 * 1024) }), 500, 'INTERNAL SERVER ERROR');
        } finally {
            log.mockRestore();
        }
    });
});
