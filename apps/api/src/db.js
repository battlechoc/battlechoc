// Postgres access: a pg Pool (or a compatible one in tests) plus a tiny migration runner
// that applies the numbered SQL files in src/migrations once each.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS = path.join(__dirname, 'migrations');

const createPool = (config = {}) => new Pool({
    connectionString: config.databaseUrl || process.env.DATABASE_URL,
    max: config.maxConnections || 10,
});

const migrate = async pool => {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
    const files = fs.readdirSync(MIGRATIONS).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
        if (!applied.has(file)) {
            const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
            await pool.query(sql);
            await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        }
    }
};

module.exports = { createPool, migrate };
