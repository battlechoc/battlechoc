// Test databases with the real migrations. By default an in-memory Postgres (pg-mem), so the
// tests need no database server. With TEST_DATABASE_URL set (CI, or a local Postgres), every
// test pool gets its own fresh schema on that server instead; pg-mem does not cover all of
// Postgres, so CI runs both.
const crypto = require('crypto');
const { newDb } = require('pg-mem');
const { Pool } = require('pg');
const { migrate } = require('../../src/db');

const pools = [];

const schemaPool = (url, schema) => {
    // idle connections close soon: every test keeps its pool until its file ends, and the test
    // files run side by side, which went past the server's 100 connections (plan 3, 2026-11-08)
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 200, options: `-c search_path=${schema}` });
    pool.schema = schema;
    pools.push(pool);
    return pool;
};

// `migrated: false` gives an empty database (for tests of the migration runner itself)
const createTestPool = async ({ migrated = true } = {}) => {
    const url = process.env.TEST_DATABASE_URL;
    let pool;
    if (url) {
        const schema = `test_${crypto.randomBytes(6).toString('hex')}`;
        const admin = new Pool({ connectionString: url, max: 1 });
        await admin.query(`CREATE SCHEMA ${schema}`);
        await admin.end();
        pool = schemaPool(url, schema);
    } else {
        const { Pool: MemoryPool } = newDb().adapters.createPg();
        pool = new MemoryPool();
        pools.push(pool);
    }
    if (migrated) {
        await migrate(pool);
    }
    return pool;
};

/** A second pool on the schema of a test pool, like a second API process (real server only). */
const siblingPool = pool => schemaPool(process.env.TEST_DATABASE_URL, pool.schema);

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

// for what pg-mem cannot show: it has no server (timeouts, locks) and its pg adapter commits every
// query on its own, so a ROLLBACK undoes nothing there
const postgresOnly = process.env.TEST_DATABASE_URL ? test : test.skip;

// a pool whose statements (also those inside transactions) pass through `intercept(sql, run)`
const intercepted = (pool, intercept) => {
    const wrap = db => new Proxy(db, {
        get: (target, key) => {
            if (key === 'query') {
                return (sql, ...rest) => intercept(sql, () => target.query(sql, ...rest));
            }
            if (key === 'connect') {
                return async () => wrap(await target.connect());
            }
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return wrap(pool);
};

/** The pool, with the statements that match `pattern` failing. */
const failingOn = (pool, pattern) => intercepted(pool,
    (sql, run) => (pattern.test(sql) ? Promise.reject(new Error('injected failure')) : run()));

/** The pool, counting the statements it runs: { pool, counter: { statements } }. */
const counting = pool => {
    const counter = { statements: 0 };
    return {
        counter,
        pool: intercepted(pool, (sql, run) => {
            counter.statements += 1;
            return run();
        }),
    };
};

module.exports = {
    createTestPool, siblingPool, closeTestPools, postgresOnly, failingOn, counting, JWT_SECRET: 'test-secret-test-secret-test-secret-42',
};
