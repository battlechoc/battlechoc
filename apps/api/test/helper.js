// Test databases with the real migrations. By default an in-memory Postgres (pg-mem), so the
// tests need no database server. With TEST_DATABASE_URL set (CI, or a local Postgres), every
// test pool gets its own fresh schema on that server instead; pg-mem does not cover all of
// Postgres, so CI runs both.
const crypto = require('crypto');
const { newDb } = require('pg-mem');
const { Pool } = require('pg');
const { migrate } = require('../src/db');

const pools = [];

const createTestPool = async () => {
    const url = process.env.TEST_DATABASE_URL;
    let pool;
    if (url) {
        const schema = `test_${crypto.randomBytes(6).toString('hex')}`;
        const admin = new Pool({ connectionString: url, max: 1 });
        await admin.query(`CREATE SCHEMA ${schema}`);
        await admin.end();
        pool = new Pool({ connectionString: url, max: 5, options: `-c search_path=${schema}` });
        pool.schema = schema;
    } else {
        const { Pool: MemoryPool } = newDb().adapters.createPg();
        pool = new MemoryPool();
    }
    pools.push(pool);
    await migrate(pool);
    return pool;
};

// drops the schemas of a real server and closes the connections
const closeTestPools = async () => {
    const url = process.env.TEST_DATABASE_URL;
    const open = pools.splice(0);
    await Promise.all(open.map(pool => pool.end().catch(() => {})));
    if (url && open.length > 0) {
        const admin = new Pool({ connectionString: url, max: 1 });
        for (const pool of open) {
            await admin.query(`DROP SCHEMA IF EXISTS ${pool.schema} CASCADE`);
        }
        await admin.end();
    }
};

module.exports = { createTestPool, closeTestPools, JWT_SECRET: 'test-secret-test-secret-test-secret-42' };
