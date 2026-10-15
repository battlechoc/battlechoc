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
    return new Pool({ connectionString: url, max: config.maxConnections || 10 });
};

// `upTo` (a file name) stops after that migration; tests use it to build an older schema
const migrate = async (pool, { upTo } = {}) => {
    let applied;
    try {
        applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
    } catch (error) {
        // first run (pg-mem rejects a repeated CREATE TABLE IF NOT EXISTS, so create it only when missing)
        await pool.query('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        applied = new Set();
    }
    const files = fs.readdirSync(MIGRATIONS)
        .filter(file => /\.(sql|js)$/.test(file) && (typeof upTo === 'undefined' || file <= upTo))
        .sort();
    for (const file of files) {
        if (!applied.has(file)) {
            if (file.endsWith('.js')) {
                // a migration that needs code (e.g. the shared rules) exports async pool => {}
                await require(path.join(MIGRATIONS, file))(pool);
            } else {
                await pool.query(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
            }
            await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        }
    }
};

/** Runs fn(client) in a transaction; rolls back and rethrows when fn throws. */
const withTransaction = async (pool, fn) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { createPool, migrate, withTransaction };
