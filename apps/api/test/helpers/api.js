// The REST app on a fresh test database, and device accounts to call it with.

const request = require('supertest');
const { createApp } = require('../../src/app');
const { createAuth } = require('../../src/auth');
const { createPush } = require('../../src/push');
const { createTestPool, JWT_SECRET } = require('./db');

/** A stand-in for web-push: `sent` collects what it was asked to deliver. */
const fakePushSender = () => {
    const sent = [];
    return {
        sent,
        sender: {
            setVapidDetails: () => {},
            sendNotification: async (subscription, payload) => {
                sent.push({ subscription, payload });
            },
        },
    };
};

/**
 * The app as the server builds it, with web push going to a fake sender. Options: `pool` (default:
 * a fresh test database), `now` (the clock of the access tokens), `wrapPool` (a wrapper of the
 * pool for the app, e.g. `counting` or `failingOn`), everything else goes to createApp.
 * Resolves with { app, pool, db, auth, push, sent }: `pool` is the plain pool, `db` the wrapped one.
 */
const createTestApp = async ({ pool: given, now, wrapPool = pool => pool, ...options } = {}) => {
    const pool = given || await createTestPool();
    const db = wrapPool(pool);
    const auth = createAuth({ pool: db, secret: JWT_SECRET, ...(now ? { now } : {}) });
    const { sender, sent } = fakePushSender();
    const push = createPush({ pool: db, publicKey: 'public', privateKey: 'private', sender });
    const app = createApp({ pool: db, auth, push, accountsPerMinute: 1000, ...(now ? { now } : {}), ...options });
    return { app, pool, db, auth, push, sent };
};

/** Requests of `app` with an access token: { get, post, del }. */
const withToken = (app, accessToken) => {
    const bearer = `Bearer ${accessToken}`;
    return {
        get: path => request(app).get(path).set('Authorization', bearer),
        post: (path, body = {}) => request(app).post(path).set('Authorization', bearer).send(body),
        del: (path, body = {}) => request(app).delete(path).set('Authorization', bearer).send(body),
    };
};

/**
 * Creates a device account: { playerId, refreshToken, accessToken, expiresIn, get, post, del }.
 * `username` gives the player a name, `starter` finishes the tutorial (100 XP and the starter kit).
 */
const createAccount = async (app, { username, starter = false } = {}) => {
    const created = (await request(app).post('/accounts').expect(201)).body;
    const account = { ...created, ...withToken(app, created.accessToken) };
    if (username) {
        await account.post('/user/username', { username }).expect(200);
    }
    if (starter) {
        await account.post('/user/tutorial/finished').expect(200);
    }
    return account;
};

module.exports = { createTestApp, createAccount, withToken, fakePushSender };
