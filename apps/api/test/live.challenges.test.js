// The live match service: challenge links (see helpers/live.js for how these tests run).

const request = require('supertest');
const { live } = require('@battlechoc/battlechoc-shared-functions');
const { closeTestPools } = require('./helpers/db');
const { start, stopAll, connect, player, queueMatch, settled, gone } = require('./helpers/live');

const { ServerMessage, ClientMessage } = live;

afterAll(closeTestPools);
afterEach(stopAll);

describe('live: challenges', () => {
    const { formatChallengeCode } = live;
    const challengeIs = (client, state) => client
        .next(ServerMessage.CHALLENGE, message => message.challenge !== null && message.challenge.state === state)
        .then(message => message.challenge);
    const viewIs = (client, state) => client
        .next(ServerMessage.CHALLENGE_VIEW, message => message.view.state === state)
        .then(message => message.view);
    const create = async client => {
        client.send({ type: ClientMessage.CHALLENGE_CREATE });
        return challengeIs(client, 'waiting');
    };
    const open = (client, code, state = 'open') => {
        client.send({ type: ClientMessage.CHALLENGE_OPEN, code });
        return viewIs(client, state);
    };

    test('create, open and accept start a challenge match; the newcomer gets a random name', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code, expiresAt } = await create(anna);
        expect(code).toMatch(/^[0-9A-Z]{8}$/);
        expect(expiresAt).toBe(env.clock.now() + 120000);
        const friend = await player(env);
        // typed as a person would: lower case, with the hyphen
        const view = await open(friend, formatChallengeCode(code).toLowerCase());
        expect(view.from).toBe('Anna');
        expect(view.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]{2,24}$/);
        expect((await challengeIs(anna, 'reading')).readers).toBe(1);
        friend.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        const [ma, mf] = await Promise.all([anna.next(ServerMessage.MATCH), friend.next(ServerMessage.MATCH)]);
        expect(ma.matchId).toBe(mf.matchId);
        expect(ma.kind).toBe('challenge');
        expect(ma.opponent.name).toBe(view.name);
        const { stats } = (await request(env.app).get('/user').set('Authorization', `Bearer ${friend.account.accessToken}`)).body;
        expect(stats.username).toBe(view.name);
    });

    test('an unopened challenge expires after 2 minutes and Send again renews the same code', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        env.clock.advance(120000);
        expect((await challengeIs(anna, 'expired')).code).toBe(code);
        anna.send({ type: ClientMessage.CHALLENGE_RENEW, code });
        const renewed = await challengeIs(anna, 'waiting');
        expect(renewed.code).toBe(code);
        expect(renewed.expiresAt).toBe(env.clock.now() + 120000);
    });

    test('an open card keeps the challenge alive up to 10 minutes', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const reader = await player(env, { username: 'Ben' });
        await open(reader, code);
        await challengeIs(anna, 'reading');
        env.clock.advance(121000);
        // a second create resends the challenge as it is
        anna.send({ type: ClientMessage.CHALLENGE_CREATE });
        expect((await anna.next(ServerMessage.CHALLENGE)).challenge.state).toBe('reading');
        env.clock.advance(479000);
        await challengeIs(anna, 'expired');
        await viewIs(reader, 'ended');
    });

    test('several readers: the first accept wins, the others see taken; a decline does not end it for the others', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const [ben, carla, dora] = await Promise.all(['Ben', 'Carla', 'Dora'].map(username => player(env, { username })));
        for (const reader of [ben, carla, dora]) {
            await open(reader, code);
        }
        await anna.next(ServerMessage.CHALLENGE, message => message.challenge.readers === 3);
        carla.send({ type: ClientMessage.CHALLENGE_DECLINE, code });
        const afterDecline = (await anna.next(ServerMessage.CHALLENGE, message => message.challenge.readers === 2)).challenge;
        expect(afterDecline.state).toBe('reading');
        ben.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        await Promise.all([anna.next(ServerMessage.MATCH), ben.next(ServerMessage.MATCH)]);
        await viewIs(dora, 'taken');
        const emil = await player(env, { username: 'Emil' });
        await open(emil, code, 'taken');
        ben.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        // the server answers this after the second accept, which started nothing
        await settled(ben);
        expect(env.live.lobby.rooms.size).toBe(1);
    });

    test('the only reader declining tells the challenger', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        ben.send({ type: ClientMessage.CHALLENGE_DECLINE, code });
        expect((await challengeIs(anna, 'declined')).code).toBe(code);
    });

    test('own code, busy friend, unknown and cancelled codes', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        await open(anna, code, 'own');
        const { a } = await queueMatch(env);
        await open(a, code, 'busy');
        const ben = await player(env, { username: 'Ben' });
        await open(ben, 'ZZZZZZZZ', 'ended');
        await open(ben, code);
        anna.send({ type: ClientMessage.CHALLENGE_CANCEL, code });
        await viewIs(ben, 'ended');
        expect((await anna.next(ServerMessage.CHALLENGE, message => message.challenge === null)).challenge).toBeNull();
        await open(ben, code, 'ended');
    });

    test('the challenger away: an accept waits, the match starts when they come back', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        anna.close();
        await gone(env, anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        ben.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        await viewIs(ben, 'waiting-for-challenger');
        const back = await connect(env, anna.account.accessToken);
        expect(back.welcome.challenge).toMatchObject({ code, state: 'accepted' });
        const [ma, mb] = await Promise.all([back.next(ServerMessage.MATCH), ben.next(ServerMessage.MATCH)]);
        expect(ma.matchId).toBe(mb.matchId);
        expect(ma.kind).toBe('challenge');
    });

    test('the challenger stays away: the friend is told, the challenger sees missed on return', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        anna.close();
        await gone(env, anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        ben.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        await viewIs(ben, 'waiting-for-challenger');
        env.clock.advance(60000);
        expect((await viewIs(ben, 'challenger-away')).from).toBe('Anna');
        const back = await connect(env, anna.account.accessToken);
        expect(back.welcome.challenge).toMatchObject({ code, state: 'missed' });
        back.send({ type: ClientMessage.CHALLENGE_RENEW, code });
        expect((await challengeIs(back, 'waiting')).code).toBe(code);
        expect(env.live.lobby.rooms.size).toBe(0);
    });

    test('a friend who accepted and left is not pulled into a match when the challenger comes back', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        anna.close();
        await gone(env, anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        ben.send({ type: ClientMessage.CHALLENGE_ACCEPT, code });
        await viewIs(ben, 'waiting-for-challenger');
        ben.terminate();
        await gone(env, ben);
        const back = await connect(env, anna.account.accessToken);
        expect((await challengeIs(back, 'missed')).code).toBe(code);
        // everything the return of the challenger set off is done
        await settled(back);
        expect(env.live.lobby.rooms.size).toBe(0);
    });

    test('a reader who leaves for a minute frees the challenge again', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        await challengeIs(anna, 'reading');
        ben.terminate();
        await gone(env, ben);
        env.clock.advance(60000);
        const again = await challengeIs(anna, 'waiting');
        expect(again.expiresAt).toBe(env.clock.now() + 120000);
        expect(again.readers).toBe(0);

        // coming back within the minute keeps the place
        const carla = await player(env, { username: 'Carla' });
        await open(carla, code);
        await challengeIs(anna, 'reading');
        carla.terminate();
        await gone(env, carla);
        env.clock.advance(30000);
        const carlaBack = await connect(env, carla.account.accessToken);
        await open(carlaBack, code);
        env.clock.advance(30000);
        anna.send({ type: ClientMessage.CHALLENGE_CREATE });
        expect((await anna.next(ServerMessage.CHALLENGE, message => message.challenge.readers === 1)).challenge.state).toBe('reading');
    });

    test('the welcome reports a waiting challenge after a reload', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        anna.close();
        await gone(env, anna);
        const back = await connect(env, anna.account.accessToken);
        expect(back.welcome.challenge).toMatchObject({ code, state: 'waiting' });
        const other = await player(env, { username: 'Ben' });
        expect(other.welcome.challenge).toBeNull();
    });

    test('the link preview names the challenger only while the challenge waits', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const { challenges } = env.live.lobby;
        expect(challenges.publicInfo(code)).toEqual({ from: 'Anna', language: 'en' });
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        expect(challenges.publicInfo(code)).toEqual({ from: 'Anna', language: 'en' });
        anna.send({ type: ClientMessage.CHALLENGE_CANCEL, code });
        await viewIs(ben, 'ended');
        expect(challenges.publicInfo(code)).toBeNull();
        expect(challenges.publicInfo('ZZZZZZZZ')).toBeNull();
    });

    test('Start while challenging cancels the challenge', async () => {
        const env = await start();
        const anna = await player(env, { username: 'Anna' });
        const { code } = await create(anna);
        const ben = await player(env, { username: 'Ben' });
        await open(ben, code);
        anna.send({ type: ClientMessage.QUEUE_JOIN });
        await viewIs(ben, 'ended');
    });
});
