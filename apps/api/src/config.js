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
//
// The chain features (items as tokens, src/chain/) are on only with CARDANO_NETWORK and all of:
//   CHAIN_POLICY_ID           the policy id of the items, 56 hex characters (printed by the deploy
//                             script, like the config reference)
//   CHAIN_CONFIG_REF          the output that holds the on-chain configuration, "<64 hex>#<index>"
//   CHAIN_SERVER_KEY_FILE     the server's signing key file (one ed25519_sk1… line, mode 600),
//                             loaded at the start (server.js); a file that is none stops it
//   CHAIN_PROVIDER_URL        the provider's API, https (http only outside production): Koios's
//                             (https://preprod.koios.rest/api/v1) or a Blockfrost-compatible one
//   CHAIN_PROVIDER_KEY        a secret, never shown in a message: with Blockfrost its project id,
//                             required; with Koios a bearer token of a paid tier, optional (the
//                             public tier needs none)
//   CHAIN_K_FINAL             the depth from which a transaction counts as final, 1 to 2160
// and the kind of provider, which decides whether the key is required:
//   CHAIN_PROVIDER_KIND       "koios" or "blockfrost" (any case); not set: koios. Another value
//                             stops the start, also while other chain variables are missing; a
//                             Blockfrost URL (blockfrost.io) needs blockfrost, a Koios URL
//                             (koios.rest) koios (chain/providerKinds.js)
// Some or all of them not set: the chain features are off and the start logs the missing names.
// All set: a wrong value stops the start (the operator meant them to be on), and these count:
//   CHAIN_CONFIG_POLICY_ID    the policy id of the config NFT, 56 hex characters (printed by the
//                             deploy script): with it the API finds the config by its NFT wherever
//                             an admin update moved it, and CHAIN_CONFIG_REF is only the fallback
//   CHAIN_WATCH_INTERVAL_MS   how often the watcher reads the chain, default 20000, at least 1000
//   CHAIN_INDEX_MAX_LAG_MS    how old the chain index's tip may be to be trusted, default 600000, at
//                             least 60000

const { cardano: { networkOf } } = require('@battlechoc/battlechoc-shared-functions');
const { providerKindOf, providerKindProblem } = require('./chain/providerKinds');

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

// the variables that turn the chain features on, in the order a message names them;
// CHAIN_PROVIDER_KEY only for a provider that needs one (every kind but Koios)
const CHAIN_REQUIRED = ['CHAIN_POLICY_ID', 'CHAIN_CONFIG_REF', 'CHAIN_SERVER_KEY_FILE', 'CHAIN_PROVIDER_URL', 'CHAIN_PROVIDER_KEY', 'CHAIN_K_FINAL'];
const K_FINAL_MAX = 2160;
const CHAIN_TIMINGS = [
    ['watchIntervalMs', 'CHAIN_WATCH_INTERVAL_MS', 20000, 1000],
    ['indexMaxLagMs', 'CHAIN_INDEX_MAX_LAG_MS', 600000, 60000],
];

const isPostgresUrl = text => {
    try {
        return ['postgres:', 'postgresql:'].includes(new URL(text).protocol);
    } catch {
        return false;
    }
};

// "https://host/path" without its trailing slash; undefined for anything but a plain http(s) URL:
// no user or password (the key goes in a header, never in the URL), no query and no fragment
// (the provider appends its paths to it), not even an empty one ("@", "?" or "#" alone)
const providerUrlOf = (text, production) => {
    let url;
    try {
        url = new URL(text);
    } catch {
        return undefined;
    }
    const allowed = production ? ['https:'] : ['https:', 'http:'];
    const plain = !url.username && !url.password && !url.search && !url.hash && !/[@?#]/.test(text);
    return allowed.includes(url.protocol) && url.hostname !== '' && plain ? text.replace(/\/+$/, '') : undefined;
};

/**
 * The chain settings: `{ chain: null, missing }` while CARDANO_NETWORK or one of the required
 * variables is not set (the provider key only for a kind other than koios), else the checked
 * settings. Its problems name the variables, never a value: one of them is the provider key, and
 * a value in the wrong variable must not show it either.
 */
const chainOf = (env, network, production, problems) => {
    if (network === null) {
        return { chain: null, missing: [] };
    }
    const providerKind = providerKindOf(read(env, 'CHAIN_PROVIDER_KIND'));
    // an unknown kind is named whatever else is missing: the operator meant to choose one
    const unknownKind = providerKindProblem(providerKind);
    if (unknownKind) {
        problems.push(unknownKind);
        return { chain: null, missing: [] };
    }
    const value = Object.fromEntries(CHAIN_REQUIRED.map(name => [name, (read(env, name) || '').trim()]));
    const required = CHAIN_REQUIRED.filter(name => name !== 'CHAIN_PROVIDER_KEY' || providerKind !== 'koios');
    const missing = required.filter(name => value[name] === '');
    if (missing.length > 0) {
        return { chain: null, missing };
    }
    const count = problems.length;
    if (!/^[0-9a-f]{56}$/.test(value.CHAIN_POLICY_ID)) {
        problems.push('CHAIN_POLICY_ID must be a policy id: 56 lower-case hex characters');
    }
    if (!/^[0-9a-f]{64}#\d+$/.test(value.CHAIN_CONFIG_REF)) {
        problems.push('CHAIN_CONFIG_REF must be an output reference: 64 lower-case hex characters, "#" and the output index');
    }
    const configPolicyId = (read(env, 'CHAIN_CONFIG_POLICY_ID') || '').trim() || null;
    if (configPolicyId !== null && !/^[0-9a-f]{56}$/.test(configPolicyId)) {
        problems.push('CHAIN_CONFIG_POLICY_ID must be a policy id: 56 lower-case hex characters (or not set)');
    }
    const providerUrl = providerUrlOf(value.CHAIN_PROVIDER_URL, production);
    if (typeof providerUrl === 'undefined') {
        problems.push(production
            ? 'CHAIN_PROVIDER_URL must be an https:// URL in production, without a user, a query or a fragment'
            : 'CHAIN_PROVIDER_URL must be an https:// (or http://) URL without a user, a query or a fragment');
    } else {
        // a Blockfrost URL with the kind koios (unset: a .env from before the kind) or the reverse
        const wrongKind = providerKindProblem(providerKind, providerUrl);
        if (wrongKind) {
            problems.push(wrongKind);
        }
    }
    const kFinal = Number(value.CHAIN_K_FINAL);
    if (!(isWholeNumber(value.CHAIN_K_FINAL) && kFinal >= 1 && kFinal <= K_FINAL_MAX)) {
        problems.push(`CHAIN_K_FINAL must be a whole number from 1 to ${K_FINAL_MAX}`);
    }
    const timings = {};
    CHAIN_TIMINGS.forEach(([key, name, fallback, minimum]) => {
        const text = (read(env, name) || '').trim();
        timings[key] = text === '' ? fallback : Number(text);
        if (text !== '' && !(isWholeNumber(text) && timings[key] >= minimum)) {
            problems.push(`${name} must be a whole number of milliseconds, at least ${minimum}`);
        }
    });
    if (problems.length > count) {
        return { chain: null, missing: [] };
    }
    return {
        chain: Object.freeze({
            network,
            policyId: value.CHAIN_POLICY_ID,
            configRef: value.CHAIN_CONFIG_REF,
            configPolicyId,
            serverKeyFile: value.CHAIN_SERVER_KEY_FILE,
            providerKind,
            providerUrl,
            providerKey: value.CHAIN_PROVIDER_KEY || null,
            kFinal,
            watchIntervalMs: timings.watchIntervalMs,
            indexMaxLagMs: timings.indexMaxLagMs,
        }),
        missing: [],
    };
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

    const { chain, missing: chainMissing } = chainOf(env, cardanoNetwork, production, problems);

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
        chain,
        chainMissing,
    });
};

module.exports = { loadConfig, ConfigError };
