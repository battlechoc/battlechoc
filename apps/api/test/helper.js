// In-memory Postgres (pg-mem) with the real migrations, so the API tests need no database server.
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db');

const createTestPool = async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await migrate(pool);
    return pool;
};

module.exports = { createTestPool, JWT_SECRET: 'test-secret-test-secret-test-secret-42' };
