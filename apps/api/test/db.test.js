const { Pool } = require('pg');
const { createPool } = require('../src/db');
const { postgresOnly } = require('./helper');

// never connected: a pg pool opens its first connection with the first query
const UNUSED_URL = 'postgres://nobody@127.0.0.1:1/none';

const until = async (condition, timeoutMs = 3000) => {
    const end = Date.now() + timeoutMs;
    while (!(await condition()) && Date.now() < end) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

describe('pool', () => {
    test('the error of an idle connection is logged instead of ending the process', async () => {
        const logged = [];
        const pool = createPool({ databaseUrl: UNUSED_URL, log: { error: (...args) => logged.push(args) } });
        try {
            expect(pool).toBeInstanceOf(Pool);
            // an "error" event nobody listens to is thrown by Node: the API would stop
            const error = new Error('terminating connection due to administrator command');
            expect(() => pool.emit('error', error)).not.toThrow();
            expect(logged).toEqual([['database connection failed while idle', error]]);
        } finally {
            await pool.end();
        }
    });

    test('connections, statements and idle clients have timeouts; the config overrides the defaults', async () => {
        const defaults = createPool({ databaseUrl: UNUSED_URL });
        const tuned = createPool({
            databaseUrl: UNUSED_URL, maxConnections: 3, connectionTimeoutMs: 700, idleTimeoutMs: 800, statementTimeoutMs: 900,
        });
        try {
            expect(defaults.options).toMatchObject({
                max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000,
            });
            expect(tuned.options).toMatchObject({
                max: 3, connectionTimeoutMillis: 700, idleTimeoutMillis: 800, statement_timeout: 900,
            });
        } finally {
            await Promise.all([defaults.end(), tuned.end()]);
        }
    });

    test('the in-memory database keeps working', async () => {
        const pool = createPool({ databaseUrl: 'memory' });
        expect((await pool.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
        await pool.end();
    });

    postgresOnly('a statement that runs too long is cancelled', async () => {
        const pool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL, statementTimeoutMs: 100 });
        try {
            await expect(pool.query('SELECT pg_sleep(2)')).rejects.toThrow(/statement timeout/);
            expect((await pool.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
        } finally {
            await pool.end();
        }
    });

    postgresOnly('a connection the server ends while it is idle is logged and replaced', async () => {
        const logged = [];
        const pool = createPool({ databaseUrl: process.env.TEST_DATABASE_URL, log: { error: (...args) => logged.push(args) } });
        const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
        try {
            const { rows } = await pool.query('SELECT pg_backend_pid() AS pid');
            // what a restart of Postgres does to the connections that wait in the pool
            await admin.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
            await until(() => logged.length > 0);
            expect(logged).toHaveLength(1);
            expect((await pool.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
        } finally {
            await Promise.all([pool.end(), admin.end()]);
        }
    });
});
