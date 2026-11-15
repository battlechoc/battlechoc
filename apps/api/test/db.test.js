const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { createPool, migrate, isPostgres } = require('../src/db');
const { createPlayer } = require('../src/players');
const { createTestPool, siblingPool, closeTestPools, postgresOnly, failingOn } = require('./helpers/db');
const { until } = require('./helpers/wait');

afterAll(closeTestPools);

// never connected: a pg pool opens its first connection with the first query
const UNUSED_URL = 'postgres://nobody@127.0.0.1:1/none';

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
            await until(() => logged.length > 0, 'the pool to report the lost connection');
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

    postgresOnly('track records are indexed by player and result', async () => {
        const pool = await createTestPool();
        const { rows } = await pool.query(
            "SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'track_records_player_result'");
        expect(rows).toHaveLength(1);
        expect(rows[0].indexdef).toMatch(/\(player_id, result\)$/);
    });

    test('chain ownership (plan C): one open history row per linked key, items that belong to nobody, asset names unique', async () => {
        const pool = await createTestPool({ migrated: false });
        await migrate(pool, { upTo: '012_link_codes.sql' });
        const [first, second] = [await createPlayer(pool), await createPlayer(pool)];
        const keys = [
            [`stake:${'aa'.repeat(28)}`, first, '2026-11-08T10:00:00.000Z'],
            [`pay:${'bb'.repeat(28)}`, first, '2026-11-09T11:00:00.000Z'],
            [`stake:${'cc'.repeat(28)}`, second, '2026-11-10T12:00:00.000Z'],
        ];
        for (const [subject, playerId, createdAt] of keys) {
            await pool.query("INSERT INTO identities (provider, subject, player_id, created_at) VALUES ('cardano', $1, $2, $3)", [subject, playerId, new Date(createdAt)]);
        }
        await migrate(pool);

        const { rows } = await pool.query('SELECT id, subject, player_id, linked_at, unlinked_at FROM identity_history ORDER BY subject');
        // the device identities of the two players are no Cardano keys
        expect(rows.map(({ subject, player_id: playerId, linked_at: linkedAt, unlinked_at: unlinkedAt }) =>
            [subject, playerId, new Date(linkedAt).toISOString(), unlinkedAt])).toEqual(
            [...keys].sort(([a], [b]) => (a < b ? -1 : 1)).map(key => [...key, null]));
        expect(new Set(rows.map(row => row.id)).size).toBe(3);
        expect((await pool.query("SELECT wallet FROM identities WHERE provider = 'cardano'")).rows).toEqual([{ wallet: null }, { wallet: null }, { wallet: null }]);

        // an item whose token is in no linked wallet belongs to nobody; asset names are unique, NULL many times
        const item = (id, playerId, assetName) => pool.query(
            "INSERT INTO items (id, player_id, item_key, serial, crafted_by, asset_name) VALUES ($1, $2, 'LIGHT_BARREL', 1, $3, $4)",
            [id, playerId, first, assetName]);
        await item('away', null, 'a1');
        await item('plain-1', first, null);
        await item('plain-2', first, null);
        await expect(item('twin', first, 'a1')).rejects.toThrow();
        const away = (await pool.query("SELECT player_id, minted_at, burned_at, holder_subject, holder_pay, holder_since FROM items WHERE id = 'away'")).rows[0];
        expect(away).toEqual({ player_id: null, minted_at: null, burned_at: null, holder_subject: null, holder_pay: null, holder_since: null });
        // an asset name is never empty, and a minted item always has one (the ownership sync pages
        // from '', the wallet's count reads minted items by asset name)
        await expect(item('empty', first, '')).rejects.toThrow(/check constraint/);
        await expect(pool.query("UPDATE items SET asset_name = '' WHERE id = 'away'")).rejects.toThrow(/check constraint/);
        await expect(pool.query("UPDATE items SET minted_at = $1 WHERE id = 'plain-1'", [new Date()])).rejects.toThrow(/check constraint/);
        await pool.query("UPDATE items SET minted_at = $1 WHERE id = 'away'", [new Date()]);
        await expect(pool.query("UPDATE items SET asset_name = NULL WHERE id = 'away'")).rejects.toThrow(/check constraint/);

        // the notices of items that arrived in or departed from a player's wallet
        await pool.query("INSERT INTO item_notices (id, player_id, item_id, kind, building, created_at) VALUES ('n1', $1, 'away', 'departed', 'FACTORY', $2)",
            [first, new Date()]);
        expect((await pool.query("SELECT kind, building, seen_at FROM item_notices WHERE player_id = $1 AND seen_at IS NULL", [first])).rows)
            .toEqual([{ kind: 'departed', building: 'FACTORY', seen_at: null }]);
    });

    test('chain operations (plan D): open operations are unique per player and per item on Postgres only, by partial indexes', async () => {
        const pool = await createTestPool();
        const client = await pool.connect();
        try {
            // a connection taken from the pool is told apart as well: a migration only gets that
            expect(isPostgres(client)).toBe(isPostgres(pool));
        } finally {
            client.release();
        }
        expect(isPostgres(pool)).toBe(Boolean(process.env.TEST_DATABASE_URL));
        if (isPostgres(pool)) {
            const { rows } = await pool.query(
                "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'chain_ops' AND indexname LIKE 'chain_ops_one_open_%' ORDER BY indexname");
            expect(rows.map(row => row.indexname)).toEqual(['chain_ops_one_open_item', 'chain_ops_one_open_player']);
            rows.forEach(row => expect(row.indexdef).toMatch(/^CREATE UNIQUE INDEX .* WHERE \(state = ANY \(ARRAY\['prepared'::text, 'submitted'::text, 'included'::text\]\)\)$/));
        }
    });

    postgresOnly('two processes that start together apply each migration once', async () => {
        const pool = await createTestPool({ migrated: false });
        await Promise.all([pool, siblingPool(pool), siblingPool(pool)].map(each => migrate(each)));
        expect(await applied(pool)).toEqual(real);
    });
});
