// The configuration of the backend. The environment is read and checked here, once, when the
// process starts (server.js); everything else gets its settings as arguments. A mistake stops the
// start with a message that names the variables. The messages never show a value that can be a
// secret (the JWT secret, a database URL with a password).
//
//   NODE_ENV                  "production" turns on the stricter checks below
//   PORT                      the HTTP port, default 8080
//   DATABASE_URL              postgres://… (the password may come from PGPASSWORD instead), or
//                             "memory" for the in-memory database of development and tests
//   JWT_SECRET                signs the access tokens, at least 32 characters
//   CORS_ORIGINS              comma separated origins of the game; required in production
//   RECIPES_FILE              the private recipe table of the lab; required in production
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT     web push, off without the keys
//   LIVE_DISCONNECT_GRACE_MS, LIVE_AI_FALLBACK_MS, LIVE_INVITE_TTL_MS     live timings (tests)
//   ACCOUNTS_PER_MINUTE       new accounts per minute and address (default 10, app.js); the
//                             browser tests create many from one address
//   CARDANO_PER_MINUTE        Cardano sign-in requests per minute and address (default 30); the
//                             browser tests too
//   DB_POOL_MAX, DB_CONNECTION_TIMEOUT_MS, DB_IDLE_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS
//                             the connection pool, see createPool in db.js for the defaults
//   CARDANO_NETWORK           "preprod" or "mainnet": turns on signing in with a Cardano key on that
//                             network (routes/cardano.js); not set: off
//   MATCH_RETENTION_DAYS      not set (the default): matches are kept in full for ever. Set to a
//                             number of days: the logged actions and the snapshot of a match are
//                             deleted that long after it was over (cleanup.js)

const { cardano: { networkOf } } = require('@battlechoc/battlechoc-shared-functions');

class ConfigError extends Error {
    constructor(problems) {
        super(['invalid configuration:', ...problems.map(problem => `  - ${problem}`)].join('\n'));
        this.problems = problems;
    }
}

const DEFAULT_PORT = 8080;
const MIN_SECRET_LENGTH = 32;

// optional overrides of the live timings (LiveDefaults), e.g. short ones for browser tests
const LIVE_OVERRIDES = [
    ['disconnectGraceMs', 'LIVE_DISCONNECT_GRACE_MS'],
    ['aiFallbackMs', 'LIVE_AI_FALLBACK_MS'],
    ['inviteTtlMs', 'LIVE_INVITE_TTL_MS'],
];

// optional settings of the connection pool (createPool)
const DATABASE_OVERRIDES = [
    ['maxConnections', 'DB_POOL_MAX'],
    ['connectionTimeoutMs', 'DB_CONNECTION_TIMEOUT_MS'],
    ['idleTimeoutMs', 'DB_IDLE_TIMEOUT_MS'],
    ['statementTimeoutMs', 'DB_STATEMENT_TIMEOUT_MS'],
];

// an empty variable counts as not set (docker compose passes `${NAME:-}` as an empty string)
const read = (env, name) => (typeof env[name] === 'string' && env[name].trim() !== '' ? env[name] : undefined);

const isWholeNumber = text => /^\d+$/.test(text);

// "https://battlechoc.com" for an origin, also when it was written with a slash at its end
// (which never matched the Origin header of a browser); undefined for anything else
const originOf = text => {
    let url;
    try {
        url = new URL(text);
    } catch {
        return undefined;
    }
    const plain = ['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    return plain ? url.origin : undefined;
};

const isPostgresUrl = text => {
    try {
        return ['postgres:', 'postgresql:'].includes(new URL(text).protocol);
    } catch {
        return false;
    }
};

/**
 * The checked configuration from an environment (default: the process's). Throws a ConfigError
 * that lists every problem.
 */
const loadConfig = (env = process.env) => {
    const problems = [];
    const nodeEnv = read(env, 'NODE_ENV');
    const production = nodeEnv === 'production';

    const portText = (read(env, 'PORT') || '').trim() || undefined;
    const port = typeof portText === 'undefined' ? DEFAULT_PORT : Number(portText);
    if (typeof portText !== 'undefined' && !(isWholeNumber(portText) && port <= 65535)) {
        problems.push(`PORT must be a port number (0 to 65535), not "${portText}"`);
    }

    const databaseUrl = read(env, 'DATABASE_URL');
    if (typeof databaseUrl === 'undefined') {
        problems.push('DATABASE_URL must be set: a postgres:// URL, or "memory" for the in-memory database');
    } else if (databaseUrl === 'memory') {
        if (production) {
            problems.push('DATABASE_URL must not be "memory" in production: the in-memory database is for development and tests');
        }
    } else if (!isPostgresUrl(databaseUrl)) {
        // a password with a slash or another reserved character breaks the URL: pg takes it from PGPASSWORD
        problems.push('DATABASE_URL must be a valid postgres:// URL (a password with special characters belongs in PGPASSWORD)');
    }

    const jwtSecret = read(env, 'JWT_SECRET');
    if (typeof jwtSecret === 'undefined') {
        problems.push(`JWT_SECRET must be set (at least ${MIN_SECRET_LENGTH} random characters)`);
    } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
        problems.push(`JWT_SECRET must have at least ${MIN_SECRET_LENGTH} characters`);
    }

    const corsOrigins = [];
    (read(env, 'CORS_ORIGINS') || '').split(',').map(entry => entry.trim()).filter(Boolean).forEach(entry => {
        const origin = originOf(entry);
        if (typeof origin === 'undefined') {
            problems.push(`CORS_ORIGINS: "${entry}" is not an origin like https://battlechoc.com`);
        } else {
            corsOrigins.push(origin);
        }
    });
    if (production && corsOrigins.length === 0) {
        // without a list the live service lets a page of any website open a socket (live/index.js)
        problems.push('CORS_ORIGINS must list the origins of the game in production');
    }

    const recipesFile = read(env, 'RECIPES_FILE');
    if (production && typeof recipesFile === 'undefined') {
        problems.push('RECIPES_FILE must point to the private recipe table in production');
    }

    // a live timing that is no positive number is ignored
    const live = Object.fromEntries(LIVE_OVERRIDES
        .filter(([, name]) => Number(env[name]) > 0)
        .map(([key, name]) => [key, Number(env[name])]));

    const database = {};
    DATABASE_OVERRIDES.forEach(([key, name]) => {
        const text = read(env, name);
        if (typeof text === 'undefined') {
            return;
        }
        if (isWholeNumber(text) && Number(text) > 0) {
            database[key] = Number(text);
        } else {
            problems.push(`${name} must be a positive whole number, not "${text}"`);
        }
    });

    // deleting is opt-in, and a value that is not clearly a number of days is an error, never a guess
    const retentionText = read(env, 'MATCH_RETENTION_DAYS');
    const matchRetentionDays = typeof retentionText === 'undefined' ? undefined : Number(retentionText);
    if (typeof retentionText !== 'undefined' && !(isWholeNumber(retentionText) && matchRetentionDays > 0)) {
        problems.push(`MATCH_RETENTION_DAYS must be a positive whole number of days, not "${retentionText}" (leave it out to keep matches)`);
    }

    const accountsText = read(env, 'ACCOUNTS_PER_MINUTE');
    const accountsPerMinute = typeof accountsText === 'undefined' ? undefined : Number(accountsText);
    if (typeof accountsText !== 'undefined' && !(isWholeNumber(accountsText) && accountsPerMinute > 0)) {
        problems.push(`ACCOUNTS_PER_MINUTE must be a positive whole number, not "${accountsText}"`);
    }

    const cardanoLimitText = read(env, 'CARDANO_PER_MINUTE');
    const cardanoPerMinute = typeof cardanoLimitText === 'undefined' ? undefined : Number(cardanoLimitText);
    if (typeof cardanoLimitText !== 'undefined' && !(isWholeNumber(cardanoLimitText) && cardanoPerMinute > 0)) {
        problems.push(`CARDANO_PER_MINUTE must be a positive whole number, not "${cardanoLimitText}"`);
    }

    const cardanoNetworkText = read(env, 'CARDANO_NETWORK');
    const cardanoNetwork = typeof cardanoNetworkText === 'undefined' ? null : networkOf(cardanoNetworkText);
    if (typeof cardanoNetworkText !== 'undefined' && cardanoNetwork === null) {
        problems.push(`CARDANO_NETWORK must be "preprod" or "mainnet" (or not set: no Cardano sign-in), not "${cardanoNetworkText}"`);
    }

    if (problems.length > 0) {
        throw new ConfigError(problems);
    }
    return Object.freeze({
        production,
        nodeEnv,
        port,
        databaseUrl,
        database,
        jwtSecret,
        corsOrigins,
        vapid: {
            publicKey: read(env, 'VAPID_PUBLIC_KEY'),
            privateKey: read(env, 'VAPID_PRIVATE_KEY'),
            subject: read(env, 'VAPID_SUBJECT'),
        },
        recipesFile,
        live,
        matchRetentionDays,
        cardanoNetwork,
        accountsPerMinute,
        cardanoPerMinute,
    });
};

module.exports = { loadConfig, ConfigError };
