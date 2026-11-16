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
            chain: null,
            chainMissing: [],
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

describe('the chain configuration', () => {
    const PROVIDER_KEY = 'secret-key-value-123';
    // the variables that turn the chain features on, in the order the messages name them, for
    // Blockfrost (the key is optional with Koios, the default kind; see `koiosOn`)
    const complete = {
        CHAIN_PROVIDER_KIND: 'blockfrost',
        CHAIN_POLICY_ID: 'ab'.repeat(28),
        CHAIN_CONFIG_REF: `${'cd'.repeat(32)}#0`,
        CHAIN_SERVER_KEY_FILE: '/run/secrets/chain-server.skey',
        CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io/api/v0/',
        CHAIN_PROVIDER_KEY: PROVIDER_KEY,
        CHAIN_K_FINAL: '10',
    };
    const preprod = { ...development, CARDANO_NETWORK: 'preprod' };
    const on = { ...preprod, ...complete };
    // the same on Koios, the default: no kind, Koios's URL, no key
    const { CHAIN_PROVIDER_KIND: _kind, CHAIN_PROVIDER_KEY: _key, ...koiosOn } = { ...on, CHAIN_PROVIDER_URL: 'https://preprod.koios.rest/api/v1' };

    test('without a Cardano network the chain is off and nothing is missing', () => {
        const config = loadConfig({ ...development, ...complete });
        expect(config.chain).toBeNull();
        expect(config.chainMissing).toEqual([]);
        expect(loadConfig(development).chainMissing).toEqual([]);
    });

    test('with a network but without the chain variables: off, and every missing one is named (Koios needs no key)', () => {
        const config = loadConfig(preprod);
        expect(config.chain).toBeNull();
        expect(config.chainMissing).toEqual(['CHAIN_POLICY_ID', 'CHAIN_CONFIG_REF', 'CHAIN_SERVER_KEY_FILE', 'CHAIN_PROVIDER_URL', 'CHAIN_K_FINAL']);
        expect(loadConfig({ ...preprod, CHAIN_PROVIDER_KIND: 'blockfrost' }).chainMissing).toEqual([
            'CHAIN_POLICY_ID', 'CHAIN_CONFIG_REF', 'CHAIN_SERVER_KEY_FILE', 'CHAIN_PROVIDER_URL', 'CHAIN_PROVIDER_KEY', 'CHAIN_K_FINAL',
        ]);
        // an empty variable counts as not set (docker compose passes `${NAME:-}`)
        expect(loadConfig({ ...on, CHAIN_PROVIDER_KIND: 'blockfrost', CHAIN_PROVIDER_KEY: '' }).chainMissing).toEqual(['CHAIN_PROVIDER_KEY']);
    });

    test('the provider kind: unset or empty is koios, whose key is optional (a bearer token); blockfrost needs its project id', () => {
        expect(_kind).toBe('blockfrost');
        expect(_key).toBe(PROVIDER_KEY);
        for (const CHAIN_PROVIDER_KIND of [undefined, '', 'koios', ' Koios ', 'KOIOS']) {
            expect(loadConfig({ ...koiosOn, CHAIN_PROVIDER_KIND }).chain).toMatchObject({ providerKind: 'koios', providerKey: null, providerUrl: 'https://preprod.koios.rest/api/v1' });
            expect(loadConfig({ ...koiosOn, CHAIN_PROVIDER_KIND, CHAIN_PROVIDER_KEY: '' }).chain).toMatchObject({ providerKind: 'koios', providerKey: null });
            expect(loadConfig({ ...koiosOn, CHAIN_PROVIDER_KIND, CHAIN_PROVIDER_KEY: PROVIDER_KEY }).chain).toMatchObject({ providerKind: 'koios', providerKey: PROVIDER_KEY });
        }
        expect(loadConfig({ ...on, CHAIN_PROVIDER_KIND: 'Blockfrost' }).chain).toMatchObject({ providerKind: 'blockfrost', providerKey: PROVIDER_KEY });
        const blockfrostWithoutKey = loadConfig({ ...on, CHAIN_PROVIDER_KEY: '' });
        expect(blockfrostWithoutKey.chain).toBeNull();
        expect(blockfrostWithoutKey.chainMissing).toEqual(['CHAIN_PROVIDER_KEY']);
    });

    test("a provider URL of the other kind stops the start, naming CHAIN_PROVIDER_KIND: a server that had Blockfrost's settings and no kind is not quietly switched to Koios", () => {
        // the six Blockfrost variables of before CHAIN_PROVIDER_KIND, the kind unset (or koios)
        const { CHAIN_PROVIDER_KIND, ...before } = on;
        expect(CHAIN_PROVIDER_KIND).toBe('blockfrost');
        for (const [kind, url] of [
            [undefined, 'https://cardano-preprod.blockfrost.io/api/v0'],
            ['', 'https://blockfrost.io/api/v0'],
            ['koios', 'https://cardano-mainnet.blockfrost.io/api/v0'],
        ]) {
            const message = problemsOf({ ...before, CHAIN_PROVIDER_KIND: kind, CHAIN_PROVIDER_URL: url });
            expect(message).toMatch(/CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL/);
            expect(message).not.toContain(PROVIDER_KEY);
            expect(message).not.toContain('blockfrost.io');
        }
        const koiosWithBlockfrost = problemsOf({ ...on, CHAIN_PROVIDER_URL: 'https://preprod.koios.rest/api/v1' });
        expect(koiosWithBlockfrost).toMatch(/CHAIN_PROVIDER_KIND must be koios \(or not set\) for a Koios URL/);
        expect(koiosWithBlockfrost).not.toContain('koios.rest');
        // a fully qualified host (one trailing dot) is the same host
        expect(problemsOf({ ...before, CHAIN_PROVIDER_URL: 'https://cardano-preprod.blockfrost.io./api/v0' })).toMatch(/CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL/);
        expect(problemsOf({ ...on, CHAIN_PROVIDER_URL: 'https://preprod.koios.rest./api/v1' })).toMatch(/CHAIN_PROVIDER_KIND must be koios \(or not set\) for a Koios URL/);
        // a host that only ends in the name is no Blockfrost or Koios host
        expect(loadConfig({ ...koiosOn, CHAIN_PROVIDER_URL: 'https://notblockfrost.io/api' }).chain).toMatchObject({ providerKind: 'koios' });
        expect(loadConfig({ ...on, CHAIN_PROVIDER_URL: 'http://localhost:3001' }).chain).toMatchObject({ providerKind: 'blockfrost' });
    });

    test('an unknown provider kind stops the start, whatever else is missing, naming the variable and never its value', () => {
        for (const CHAIN_PROVIDER_KIND of ['maestro', 'koio', PROVIDER_KEY]) {
            for (const env of [on, preprod, koiosOn]) {
                const message = problemsOf({ ...env, CHAIN_PROVIDER_KIND });
                expect(message).toMatch(/CHAIN_PROVIDER_KIND is unknown: it must be koios or blockfrost \(or not set: koios\)/);
                expect(message).not.toContain(PROVIDER_KEY);
                expect(message).not.toContain('maestro');
            }
        }
        // without a Cardano network nothing of the chain is read
        expect(loadConfig({ ...development, CHAIN_PROVIDER_KIND: 'maestro' }).chain).toBeNull();
    });

    test('all but one: still off, the missing one is named', () => {
        const { CHAIN_K_FINAL, ...five } = on;
        expect(CHAIN_K_FINAL).toBeDefined();
        const config = loadConfig(five);
        expect(config.chain).toBeNull();
        expect(config.chainMissing).toEqual(['CHAIN_K_FINAL']);
        // values of an incomplete configuration are not checked: the operator has not turned it on
        expect(loadConfig({ ...five, CHAIN_POLICY_ID: 'nope' }).chain).toBeNull();
    });

    test('all of them: on, with the defaults of the optional timings and the provider kind', () => {
        const config = loadConfig(on);
        expect(config.chainMissing).toEqual([]);
        expect(config.chain).toEqual({
            network: { name: 'preprod', networkId: 0 },
            policyId: 'ab'.repeat(28),
            configRef: `${'cd'.repeat(32)}#0`,
            configPolicyId: null,
            serverKeyFile: '/run/secrets/chain-server.skey',
            providerKind: 'blockfrost',
            providerUrl: 'https://cardano-preprod.blockfrost.io/api/v0',
            providerKey: PROVIDER_KEY,
            kFinal: 10,
            watchIntervalMs: 20000,
            indexMaxLagMs: 600000,
        });
        expect(config.chain.kFinal).toBe(10);
        expect(config.chain.network.name).toBe('preprod');
        expect(Object.isFrozen(config.chain)).toBe(true);
        expect(loadConfig({ ...on, CARDANO_NETWORK: 'mainnet' }).chain.network).toEqual({ name: 'mainnet', networkId: 1 });
        expect(loadConfig({ ...on, CHAIN_WATCH_INTERVAL_MS: '1000', CHAIN_INDEX_MAX_LAG_MS: '60000' }).chain)
            .toMatchObject({ watchIntervalMs: 1000, indexMaxLagMs: 60000 });
    });

    test('the policy id: 56 lower-case hex characters', () => {
        ['ab'.repeat(27) + 'a', 'AB'.repeat(28), 'ab'.repeat(29), 'zz'.repeat(28)]
            .forEach(CHAIN_POLICY_ID => expect(problemsOf({ ...on, CHAIN_POLICY_ID })).toMatch(/CHAIN_POLICY_ID/));
    });

    test('the config reference: a transaction id and an output index', () => {
        expect(loadConfig({ ...on, CHAIN_CONFIG_REF: `${'cd'.repeat(32)}#12` }).chain.configRef).toBe(`${'cd'.repeat(32)}#12`);
        ['cd'.repeat(32), `${'cd'.repeat(31)}#0`, `${'cd'.repeat(32)}#x`, `${'cd'.repeat(32)}:0`]
            .forEach(CHAIN_CONFIG_REF => expect(problemsOf({ ...on, CHAIN_CONFIG_REF })).toMatch(/CHAIN_CONFIG_REF/));
    });

    test('the config policy: optional, 56 lower-case hex characters when set', () => {
        expect(loadConfig({ ...on, CHAIN_CONFIG_POLICY_ID: 'ef'.repeat(28) }).chain.configPolicyId).toBe('ef'.repeat(28));
        // docker compose passes `${CHAIN_CONFIG_POLICY_ID:-}`: empty is not set
        expect(loadConfig({ ...on, CHAIN_CONFIG_POLICY_ID: '' }).chain.configPolicyId).toBeNull();
        ['ef'.repeat(27) + 'e', 'EF'.repeat(28), 'ef'.repeat(29), 'zz'.repeat(28)]
            .forEach(CHAIN_CONFIG_POLICY_ID => expect(problemsOf({ ...on, CHAIN_CONFIG_POLICY_ID })).toMatch(/CHAIN_CONFIG_POLICY_ID/));
        // not checked while the chain is off: neither without a network nor with a variable missing
        const { CHAIN_K_FINAL, ...five } = on;
        expect(CHAIN_K_FINAL).toBeDefined();
        expect(loadConfig({ ...five, CHAIN_CONFIG_POLICY_ID: 'nope' }).chain).toBeNull();
        expect(loadConfig({ ...development, ...complete, CHAIN_CONFIG_POLICY_ID: 'nope' }).chain).toBeNull();
    });

    test('the finality depth: a whole number from 1 to 2160', () => {
        expect(loadConfig({ ...on, CHAIN_K_FINAL: '1' }).chain.kFinal).toBe(1);
        expect(loadConfig({ ...on, CHAIN_K_FINAL: '2160' }).chain.kFinal).toBe(2160);
        ['0', 'abc', '2161', '-1', '2.5'].forEach(CHAIN_K_FINAL => expect(problemsOf({ ...on, CHAIN_K_FINAL })).toMatch(/CHAIN_K_FINAL/));
    });

    test('the provider: https, plain http only outside production', () => {
        expect(loadConfig({ ...on, CHAIN_PROVIDER_URL: 'http://localhost:3001' }).chain.providerUrl).toBe('http://localhost:3001');
        const productionOn = { ...production, CARDANO_NETWORK: 'preprod', ...complete };
        expect(loadConfig(productionOn).chain.providerUrl).toBe('https://cardano-preprod.blockfrost.io/api/v0');
        expect(problemsOf({ ...productionOn, CHAIN_PROVIDER_URL: 'http://cardano-preprod.blockfrost.io/api/v0' })).toMatch(/CHAIN_PROVIDER_URL/);
        ['cardano-preprod.blockfrost.io', 'ftp://cardano-preprod.blockfrost.io', 'https://']
            .forEach(CHAIN_PROVIDER_URL => expect(problemsOf({ ...on, CHAIN_PROVIDER_URL })).toMatch(/CHAIN_PROVIDER_URL/));
    });

    test('the provider URL: no user, no query, no fragment, and the message does not repeat it', () => {
        [
            'https://user:secret-in-url@cardano-preprod.blockfrost.io/api/v0',
            'https://secret-in-url@cardano-preprod.blockfrost.io/api/v0',
            'https://@cardano-preprod.blockfrost.io/api/v0',
            'https://cardano-preprod.blockfrost.io/api/v0?project_id=secret-in-url',
            'https://cardano-preprod.blockfrost.io/api/v0?',
            'https://cardano-preprod.blockfrost.io/api/v0#secret-in-url',
            'https://cardano-preprod.blockfrost.io/api/v0#',
        ].forEach(CHAIN_PROVIDER_URL => {
            const message = problemsOf({ ...on, CHAIN_PROVIDER_URL });
            expect(message).toMatch(/CHAIN_PROVIDER_URL/);
            expect(message).not.toContain('secret-in-url');
            expect(message).not.toContain('cardano-preprod.blockfrost.io');
        });
    });

    test('the optional timings: whole numbers above their minimum', () => {
        ['999', 'often', '1500.5'].forEach(CHAIN_WATCH_INTERVAL_MS => expect(problemsOf({ ...on, CHAIN_WATCH_INTERVAL_MS }))
            .toMatch(/CHAIN_WATCH_INTERVAL_MS/));
        ['59999', 'long'].forEach(CHAIN_INDEX_MAX_LAG_MS => expect(problemsOf({ ...on, CHAIN_INDEX_MAX_LAG_MS }))
            .toMatch(/CHAIN_INDEX_MAX_LAG_MS/));
    });

    test('no message shows the provider key, every problem is listed at once', () => {
        const message = problemsOf({
            ...on, CHAIN_POLICY_ID: 'x', CHAIN_CONFIG_REF: 'y', CHAIN_PROVIDER_URL: 'z', CHAIN_K_FINAL: '0', CHAIN_WATCH_INTERVAL_MS: '1', CHAIN_INDEX_MAX_LAG_MS: '1',
        });
        ['CHAIN_POLICY_ID', 'CHAIN_CONFIG_REF', 'CHAIN_PROVIDER_URL', 'CHAIN_K_FINAL', 'CHAIN_WATCH_INTERVAL_MS', 'CHAIN_INDEX_MAX_LAG_MS']
            .forEach(name => expect(message).toContain(name));
        expect(message).not.toContain(PROVIDER_KEY);
        // also when the key landed in the wrong variable
        expect(problemsOf({ ...on, CHAIN_PROVIDER_URL: PROVIDER_KEY })).not.toContain(PROVIDER_KEY);
        expect(problemsOf({ ...on, CHAIN_K_FINAL: PROVIDER_KEY })).not.toContain(PROVIDER_KEY);
    });
});
