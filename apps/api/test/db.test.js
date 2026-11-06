const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { createPool, migrate } = require('../src/db');
const { createTestPool, siblingPool, closeTestPools, postgresOnly, failingOn } = require('./helper');

afterAll(closeTestPools);

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

describe('migrations', () => {
    const directories = [];
    afterAll(() => directories.forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

    // a directory of migrations: { 'name.sql': text, 'name.js': source }
    const migrationsIn = files => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-migrations-'));
        directories.push(directory);
        Object.entries(files).forEach(([name, content]) => fs.writeFileSync(path.join(directory, name), content));
        return directory;
    };
    const applied = async pool => (await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(row => row.name);
    const real = fs.readdirSync(path.join(__dirname, '../src/migrations')).sort();
    const FIRST = 'CREATE TABLE one (id TEXT PRIMARY KEY);';

    test('every migration is applied once, in order; upTo stops after the named one', async () => {
        const pool = await createTestPool({ migrated: false });
        await migrate(pool, { upTo: '002_live_matches.sql' });
        expect(await applied(pool)).toEqual(real.slice(0, 2));
        await migrate(pool);
        expect(await applied(pool)).toEqual(real);
        await migrate(pool);
        expect(await applied(pool)).toEqual(real);
    });

    test('a migration in code gets the connection of its transaction, not the pool', async () => {
        const pool = await createTestPool({ migrated: false });
        const seen = [];
        const watched = new Proxy(pool, {
            get: (target, key) => {
                if (key === 'query') {
                    return (sql, ...rest) => {
                        seen.push(sql);
                        return target.query(sql, ...rest);
                    };
                }
                const value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        const directory = migrationsIn({
            '001_first.sql': FIRST,
            '002_second.js': 'module.exports = async db => { await db.query("INSERT INTO one (id) VALUES (\'code\')"); };',
        });
        await migrate(watched, { directory });
        expect((await pool.query('SELECT id FROM one')).rows).toEqual([{ id: 'code' }]);
        expect(await applied(pool)).toEqual(['001_first.sql', '002_second.js']);
        // nothing ran on the pool itself, where each statement would be a transaction of its own
        expect(seen).toEqual([]);
    });

    test('a database error is not taken for a first run', async () => {
        const pool = await createTestPool();
        await expect(migrate(failingOn(pool, /SELECT name FROM schema_migrations/))).rejects.toThrow('injected failure');
        expect(await applied(pool)).toEqual(real);
    });

    postgresOnly('a migration that throws leaves nothing behind and is retried on the next run', async () => {
        const pool = await createTestPool({ migrated: false });
        const second = end => `module.exports = async db => {
            await db.query('CREATE TABLE two (id TEXT PRIMARY KEY)');
            await db.query("INSERT INTO one (id) VALUES ('from two')");
            ${end}
        };`;
        const broken = migrationsIn({ '001_first.sql': FIRST, '002_second.js': second("throw new Error('failed halfway');") });
        await expect(migrate(pool, { directory: broken })).rejects.toThrow('failed halfway');
        expect(await applied(pool)).toEqual(['001_first.sql']);
        expect((await pool.query('SELECT id FROM one')).rows).toEqual([]);
        await expect(pool.query('SELECT id FROM two')).rejects.toThrow(/does not exist/);

        // the fixed migration of the next release starts from a clean state
        const fixed = migrationsIn({ '001_first.sql': FIRST, '002_second.js': second('') });
        await migrate(pool, { directory: fixed });
        expect(await applied(pool)).toEqual(['001_first.sql', '002_second.js']);
        expect((await pool.query('SELECT id FROM one')).rows).toEqual([{ id: 'from two' }]);
    });

    postgresOnly('a migration that cannot be recorded is undone', async () => {
        const pool = await createTestPool({ migrated: false });
        // creates schema_migrations, so that only the migration's own record fails below
        await migrate(pool, { directory: migrationsIn({}) });
        const directory = migrationsIn({ '001_first.sql': FIRST });
        await expect(migrate(failingOn(pool, /INSERT INTO schema_migrations/), { directory })).rejects.toThrow('injected failure');
        await expect(pool.query('SELECT id FROM one')).rejects.toThrow(/does not exist/);
        await migrate(pool, { directory });
        expect(await applied(pool)).toEqual(['001_first.sql']);
    });

    postgresOnly('two processes that start together apply each migration once', async () => {
        const pool = await createTestPool({ migrated: false });
        await Promise.all([pool, siblingPool(pool), siblingPool(pool)].map(each => migrate(each)));
        expect(await applied(pool)).toEqual(real);
    });
});
