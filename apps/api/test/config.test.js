// The configuration is read from the environment once, at the start, and a mistake in it stops
// the process there with a message that names the variable (and never a secret value).

const { loadConfig, ConfigError } = require('../src/config');
const { main } = require('../src/server');

const SECRET = 'config-test-secret-config-test-secret-1';
const development = { DATABASE_URL: 'memory', JWT_SECRET: SECRET };
// what deploy/docker-compose.yml gives the API on the VPS
const production = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgres://battlechoc@postgres:5432/battlechoc',
    PGPASSWORD: 'not-part-of-the-config',
    JWT_SECRET: SECRET,
    CORS_ORIGINS: 'https://battlechoc.com',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: '',
    RECIPES_FILE: '/run/secrets/recipes.json',
};

const problemsOf = env => {
    try {
        loadConfig(env);
    } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        return error.message;
    }
    return null;
};

describe('configuration', () => {
    test('development needs a database and a secret; everything else has a default', () => {
        expect(loadConfig(development)).toEqual({
            production: false,
            nodeEnv: undefined,
            port: 8080,
            databaseUrl: 'memory',
            database: {},
            jwtSecret: SECRET,
            corsOrigins: [],
            vapid: { publicKey: undefined, privateKey: undefined, subject: undefined },
            recipesFile: undefined,
            live: {},
            cardanoNetwork: null,
        });
        expect(Object.isFrozen(loadConfig(development))).toBe(true);
    });

    test('the environment of the VPS', () => {
        expect(loadConfig(production)).toMatchObject({
            production: true,
            nodeEnv: 'production',
            port: 8080,
            databaseUrl: 'postgres://battlechoc@postgres:5432/battlechoc',
            corsOrigins: ['https://battlechoc.com'],
            vapid: { publicKey: undefined, privateKey: undefined, subject: undefined },
            recipesFile: '/run/secrets/recipes.json',
        });
    });

    test('the environment of the browser tests (apps/pwa/playwright.config.js)', () => {
        const config = loadConfig({
            PORT: '8091',
            DATABASE_URL: 'memory',
            JWT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e',
            CORS_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000',
            LIVE_DISCONNECT_GRACE_MS: '20000',
            LIVE_AI_FALLBACK_MS: '3000',
        });
        expect(config).toMatchObject({
            port: 8091,
            corsOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
            live: { disconnectGraceMs: 20000, aiFallbackMs: 3000 },
        });
    });

    test('the secret: required, at least 32 characters, never printed', () => {
        expect(problemsOf({ DATABASE_URL: 'memory' })).toMatch(/JWT_SECRET/);
        const short = problemsOf({ DATABASE_URL: 'memory', JWT_SECRET: 'too-short-to-be-a-secret' });
        expect(short).toMatch(/JWT_SECRET must have at least 32 characters/);
        expect(short).not.toContain('too-short-to-be-a-secret');
    });

    test('the database: a postgres URL or "memory", which production refuses; the URL is never printed', () => {
        expect(problemsOf({ JWT_SECRET: SECRET })).toMatch(/DATABASE_URL/);
        const wrong = problemsOf({ JWT_SECRET: SECRET, DATABASE_URL: 'mysql://user:hunter2@db/battlechoc' });
        expect(wrong).toMatch(/DATABASE_URL/);
        expect(wrong).not.toContain('hunter2');
        // a password with a slash breaks the URL (it belongs in PGPASSWORD): said without showing it
        const broken = problemsOf({ JWT_SECRET: SECRET, DATABASE_URL: 'postgres://user:pass/word@db/battlechoc' });
        expect(broken).toMatch(/DATABASE_URL/);
        expect(broken).not.toContain('pass/word');
        expect(loadConfig({ JWT_SECRET: SECRET, DATABASE_URL: 'postgresql://user:hunter2@db:5432/battlechoc' }).databaseUrl)
            .toBe('postgresql://user:hunter2@db:5432/battlechoc');
        expect(problemsOf({ ...production, DATABASE_URL: 'memory' })).toMatch(/DATABASE_URL.*memory/);
    });

    test('the port: a number a server can listen on', () => {
        expect(loadConfig({ ...development, PORT: '0' }).port).toBe(0);
        expect(loadConfig({ ...development, PORT: '65535' }).port).toBe(65535);
        ['abc', '80.5', '-1', '65536'].forEach(PORT => expect(problemsOf({ ...development, PORT })).toMatch(/PORT/));
        expect(loadConfig({ ...development, PORT: '' }).port).toBe(8080);
        expect(loadConfig({ ...development, PORT: ' 8081 ' }).port).toBe(8081);
    });

    test('the origins: a comma separated list of exact origins', () => {
        const origins = CORS_ORIGINS => loadConfig({ ...development, CORS_ORIGINS }).corsOrigins;
        expect(origins(' https://battlechoc.com , http://localhost:3000,, ')).toEqual(['https://battlechoc.com', 'http://localhost:3000']);
        // a trailing slash never matched the Origin header of a browser: it is taken off
        expect(origins('https://battlechoc.com/')).toEqual(['https://battlechoc.com']);
        expect(origins('')).toEqual([]);
        ['battlechoc.com', 'https://battlechoc.com/game', 'ftp://battlechoc.com', '*', 'https://user:pw@battlechoc.com']
            .forEach(CORS_ORIGINS => expect(problemsOf({ ...development, CORS_ORIGINS })).toMatch(/CORS_ORIGINS/));
    });

    test('production does not start without origins or without the recipe table', () => {
        // without a list the live service would let every website open a socket
        expect(problemsOf({ ...production, CORS_ORIGINS: '' })).toMatch(/CORS_ORIGINS must list the origins of the game in production/);
        const { CORS_ORIGINS, ...without } = production;
        expect(CORS_ORIGINS).toBeDefined();
        expect(problemsOf(without)).toMatch(/CORS_ORIGINS/);
        expect(problemsOf({ ...production, RECIPES_FILE: '' })).toMatch(/RECIPES_FILE must point to the private recipe table in production/);
        // elsewhere both are optional, as before
        expect(loadConfig({ ...development, NODE_ENV: 'development' }).corsOrigins).toEqual([]);
    });

    test('every problem is listed at once', () => {
        const message = problemsOf({ NODE_ENV: 'production', PORT: 'x' });
        ['JWT_SECRET', 'DATABASE_URL', 'PORT', 'CORS_ORIGINS', 'RECIPES_FILE'].forEach(name => expect(message).toContain(name));
        expect(message.split('\n').length).toBe(6);
    });

    test('overrides of the live timings and of the pool: positive whole numbers', () => {
        const config = loadConfig({
            ...development,
            LIVE_DISCONNECT_GRACE_MS: '6000',
            LIVE_AI_FALLBACK_MS: '0',
            LIVE_INVITE_TTL_MS: 'soon',
            DB_POOL_MAX: '20',
            DB_STATEMENT_TIMEOUT_MS: '60000',
        });
        // a live timing that is no positive number is ignored, as it always was
        expect(config.live).toEqual({ disconnectGraceMs: 6000 });
        expect(config.database).toEqual({ maxConnections: 20, statementTimeoutMs: 60000 });
        expect(loadConfig({ ...development, DB_CONNECTION_TIMEOUT_MS: '2000', DB_IDLE_TIMEOUT_MS: '10000' }).database)
            .toEqual({ connectionTimeoutMs: 2000, idleTimeoutMs: 10000 });
        ['0', '-5', '1.5', 'many'].forEach(DB_POOL_MAX => expect(problemsOf({ ...development, DB_POOL_MAX })).toMatch(/DB_POOL_MAX/));
    });

    test('matches are kept for ever unless a retention is set, in whole days', () => {
        expect(loadConfig(development).matchRetentionDays).toBeUndefined();
        expect(loadConfig({ ...development, MATCH_RETENTION_DAYS: '' }).matchRetentionDays).toBeUndefined();
        expect(loadConfig({ ...development, MATCH_RETENTION_DAYS: '30' }).matchRetentionDays).toBe(30);
        // a setting that deletes data is never guessed
        ['0', '-7', '1.5', 'a month', '30d'].forEach(MATCH_RETENTION_DAYS => expect(problemsOf({ ...development, MATCH_RETENTION_DAYS }))
            .toMatch(/MATCH_RETENTION_DAYS must be a positive whole number/));
    });

    test('accounts per minute and address: the default unless set, a positive whole number (browser tests)', () => {
        expect(loadConfig(development).accountsPerMinute).toBeUndefined();
        expect(loadConfig({ ...development, ACCOUNTS_PER_MINUTE: '500' }).accountsPerMinute).toBe(500);
        ['0', '-1', 'many'].forEach(ACCOUNTS_PER_MINUTE => expect(problemsOf({ ...development, ACCOUNTS_PER_MINUTE }))
            .toMatch(/ACCOUNTS_PER_MINUTE must be a positive whole number/));
    });

    test('Cardano sign-in requests per minute and address: the default unless set (browser tests)', () => {
        expect(loadConfig(development).cardanoPerMinute).toBeUndefined();
        expect(loadConfig({ ...development, CARDANO_PER_MINUTE: '500' }).cardanoPerMinute).toBe(500);
        expect(problemsOf({ ...development, CARDANO_PER_MINUTE: '0' })).toMatch(/CARDANO_PER_MINUTE must be a positive whole number/);
    });

    test('the Cardano network: off when not set, preprod or mainnet, nothing else', () => {
        expect(loadConfig({ ...development, CARDANO_NETWORK: '' }).cardanoNetwork).toBeNull();
        expect(loadConfig({ ...development, CARDANO_NETWORK: 'preprod' }).cardanoNetwork).toEqual({ name: 'preprod', networkId: 0 });
        expect(loadConfig({ ...development, CARDANO_NETWORK: 'mainnet' }).cardanoNetwork).toEqual({ name: 'mainnet', networkId: 1 });
        ['testnet', 'Preprod', '0'].forEach(CARDANO_NETWORK => expect(problemsOf({ ...development, CARDANO_NETWORK }))
            .toMatch(/CARDANO_NETWORK must be "preprod" or "mainnet"/));
    });

    test('the server reads its environment through the configuration and stops before it opens anything', async () => {
        await expect(main({ env: { NODE_ENV: 'production' } })).rejects.toThrow(ConfigError);
        await expect(main({ env: { DATABASE_URL: 'memory' } })).rejects.toThrow(/JWT_SECRET/);
    });
});
