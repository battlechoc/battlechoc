// What the API tells browsers about its responses, and the limit on refreshing tokens.

const request = require('supertest');
const { closeTestPools } = require('./helpers/db');
const { createTestApp } = require('./helpers/api');

afterAll(closeTestPools);

const setup = async options => (await createTestApp({ corsOrigins: ['https://battlechoc.com'], ...options })).app;

describe('response headers', () => {
    test('every answer forbids content sniffing, sends no referrer on and does not name the framework', async () => {
        const app = await setup();
        const created = await request(app).post('/accounts').expect(201);
        const responses = [
            created,
            await request(app).get('/health').expect(200),
            await request(app).get('/user').set('Authorization', `Bearer ${created.body.accessToken}`).expect(200),
            await request(app).get('/user').expect(401),
            await request(app).get('/nope').expect(404),
            await request(app).post('/accounts/token').set('Content-Type', 'application/json').send('{').expect(400),
            await request(app).options('/user').set('Origin', 'https://battlechoc.com').expect(204),
            await request(app).get('/play/K7Q2M9XD').expect(200),
        ];
        responses.forEach(response => {
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['referrer-policy']).toBe('no-referrer');
            expect(response.headers).not.toHaveProperty('x-powered-by');
        });
        // only the page has a content security policy: JSON is not rendered
        expect(created.headers).not.toHaveProperty('content-security-policy');
    });

    test('the play page allows its own script and style and nothing else', async () => {
        const app = await setup({ challengeInfo: () => ({ from: 'Anna', language: 'en' }) });
        const response = await request(app).get('/play/K7Q2M9XD').expect(200);
        const policy = response.headers['content-security-policy'];
        const nonce = /script-src 'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)[1];
        expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
        expect(policy.split('; ').sort()).toEqual([
            "base-uri 'none'",
            "default-src 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            `script-src 'nonce-${nonce}'`,
            `style-src 'nonce-${nonce}'`,
        ]);
        const html = response.text;
        // the one script and the one style carry the nonce; nothing inline is left without it
        expect(html.match(/<script[^>]*>/g)).toEqual([`<script nonce="${nonce}">`]);
        expect(html.match(/<style[^>]*>/g)).toEqual([`<style nonce="${nonce}">`]);
        expect(html).not.toMatch(/\sstyle="/);
        expect(html).not.toMatch(/\son[a-z]+="/);
        expect(html).toContain(`<script nonce="${nonce}">location.replace("https://battlechoc.com/?challenge=K7Q2-M9XD");</script>`);
        // the link preview is untouched by the policy: crawlers read these tags, they run nothing
        expect(html).toContain('<meta property="og:title" content="Anna challenges you to battlechoc!">');
        expect(html).toContain('<meta property="og:image" content="https://battlechoc.com/images/challenge-preview.jpg">');
        expect(html).toContain('<a href="https://battlechoc.com/?challenge=K7Q2-M9XD">Anna challenges you to battlechoc!</a>');

        // a fresh nonce for every answer
        const again = await request(app).get('/play/K7Q2M9XD').expect(200);
        expect(again.headers['content-security-policy']).not.toBe(policy);
    });
});

describe('refreshing a token', () => {
    test('is limited per address, far above what a game does, and never answers 401 for it', async () => {
        const app = await setup({ tokensPerMinute: 3 });
        const { refreshToken } = (await request(app).post('/accounts').expect(201)).body;
        for (let i = 0; i < 3; i++) {
            await request(app).post('/accounts/token').send({ refreshToken }).expect(200);
        }
        // 401 makes the game create a new account: over the limit must be told apart from it
        const limited = await request(app).post('/accounts/token').send({ refreshToken }).expect(429);
        expect(limited.text).toBe('{"error":"TOO MANY REQUESTS"}');
        await request(app).post('/accounts/token').send({ refreshToken: 'x'.repeat(40) }).expect(429);
        // a limit of its own: accounts can still be created
        await request(app).post('/accounts').expect(201);
    });

    test('the default lets a whole school class behind one address start the game within a minute', async () => {
        const app = await setup();
        const { refreshToken } = (await request(app).post('/accounts').expect(201)).body;
        const statuses = [];
        for (let i = 0; i < 121; i++) {
            statuses.push((await request(app).post('/accounts/token').send({ refreshToken })).status);
        }
        expect(statuses.slice(0, 120).every(status => status === 200)).toBe(true);
        expect(statuses[120]).toBe(429);
    });
});
