// Postgres access: a pg Pool (or a compatible one in tests) plus a tiny migration runner
// that applies the numbered SQL files in src/migrations once each.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS = path.join(__dirname, 'migrations');

// DATABASE_URL=memory runs on an in-memory database (pg-mem, a dev dependency) for local
// development and browser tests without a Postgres server
const createPool = (config = {}) => {
    const url = config.databaseUrl || process.env.DATABASE_URL;
    if (url === 'memory') {
        const { newDb } = require('pg-mem');
        const { Pool: MemoryPool } = newDb().adapters.createPg();
        return new MemoryPool();
    }
    const { log = console } = config;
    const pool = new Pool({
        connectionString: url,
        max: config.maxConnections || 10,
        // a request waits this long for a free connection or a new one, then fails instead of hanging
        connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
        idleTimeoutMillis: config.idleTimeoutMs || 30000,
        // the server cancels a statement that runs longer (migrations lift it, see migrate)
        statement_timeout: config.statementTimeoutMs || 15000,
    });
    // A connection that waits in the pool breaks when Postgres restarts. The pool drops it and
    // reports it here; without a listener Node throws the event and the process ends.
    pool.on('error', error => log.error('database connection failed while idle', error));
    return pool;
};

/** The number a `SELECT COUNT(*) AS n …` gives (Postgres sends a bigint as a string). */
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].n);

// a transaction on a connection the caller holds
const inTransaction = async (client, fn) => {
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
};

/** Runs fn(client) in a transaction; rolls back and rethrows when fn throws. */
const withTransaction = async (pool, fn) => {
    const client = await pool.connect();
    try {
        return await inTransaction(client, fn);
    } finally {
        client.release();
    }
};

// pg-mem knows neither advisory locks nor statement timeouts
const isPostgres = pool => pool instanceof Pool;

// the first key of the advisory lock that migrate takes ("bcmg"); the second one is the schema
const MIGRATION_LOCK = 0x62636d67;

// Postgres reports a missing table as 42P01; pg-mem has no error codes, only the message
const isMissingTable = error => error.code === '42P01' ||
    (typeof error.code === 'undefined' && /relation "schema_migrations" does not exist/.test(error.message));

const appliedMigrations = async db => {
    try {
        return new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
    } catch (error) {
        // any other error (no connection, no permission) is not a first run
        if (!isMissingTable(error)) {
            throw error;
        }
        // first run (pg-mem rejects a repeated CREATE TABLE IF NOT EXISTS, so create it only when missing)
        await db.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        return new Set();
    }
};

/**
 * Applies the migrations that are not recorded yet, each in a transaction together with its
 * record: one that fails leaves nothing behind and runs again next time. `upTo` (a file name) stops
 * after that migration (tests build an older schema with it), `directory` holds the files.
 */
const migrate = async (pool, { upTo, directory = MIGRATIONS } = {}) => {
    const locking = isPostgres(pool);
    const client = await pool.connect();
    let broken;
    try {
        if (locking) {
            // Two processes that start together take turns: the second one waits here and then finds
            // the migrations recorded. The lock belongs to the connection, so it is also free again
            // when the process dies. The wait ends with the pool's statement timeout.
            await client.query('SELECT pg_advisory_lock($1::int, hashtext(current_schema()))', [MIGRATION_LOCK]);
        }
        const applied = await appliedMigrations(client);
        const files = fs.readdirSync(directory)
            .filter(file => /\.(sql|js)$/.test(file) && (typeof upTo === 'undefined' || file <= upTo))
            .sort();
        for (const file of files) {
            if (applied.has(file)) {
                continue;
            }
            await inTransaction(client, async () => {
                if (locking) {
                    // a migration may take longer than a request is allowed to (until the commit)
                    await client.query('SET LOCAL statement_timeout = 0');
                }
                if (file.endsWith('.js')) {
                    // a migration that needs code (e.g. the shared rules) exports async db => {} and
                    // gets the connection of the transaction
                    await require(path.join(directory, file))(client);
                } else {
                    await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
                }
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
            });
        }
    } finally {
        if (locking) {
            broken = await client.query('SELECT pg_advisory_unlock($1::int, hashtext(current_schema()))', [MIGRATION_LOCK])
                .then(() => undefined, error => error);
        }
        // a connection that could not give the lock back is closed (which frees the lock), not reused
        client.release(broken);
    }
};

module.exports = { createPool, migrate, withTransaction, count };
