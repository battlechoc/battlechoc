// The chain index (plan C, Task 4): the views over Yaci Store's tables (src/chain/views.sql) and
// the functions the ownership sync reads them through (src/chain/chainIndex.js). The views, the
// read role and the read-only transactions need a real Postgres (TEST_DATABASE_URL); a fixture
// creates Yaci Store 2.0.7's four tables in a schema of its own and writes the rows Yaci Store
// would write for the blocks of a chain double. The name checks and the error mapping run on
// every suite.

const crypto = require('crypto');
const { Pool } = require('pg');
const { Address, Time } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { IndexUnavailableError, MAX_ASSET_NAMES, createChainIndex, readOnly } = require('../src/chain/chainIndex');
const { closeTestPools, createTestPool } = require('./helpers/db');
const { fixtureContracts } = require('./helpers/chain');
const { indexContract } = require('./helpers/indexContract');

const { policyId } = fixtureContracts();
const { preprod, mainnet } = cardano.Networks;
const network = preprod;
const READ_ROLE = 'chain_reader_test';
const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const userName = n => '000de140' + n.toString(16).padStart(56, '0');

const failureOf = async promise => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('resolved, but a failure was expected');
};

// a pool that must never be asked anything
const untouchedPool = () => ({ connect: jest.fn(), query: jest.fn() });

// a pool whose one client answers `answer(sql)` (or throws what it returns, if an Error)
const scriptedPool = answer => {
    const statements = [];
    const client = {
        query: async sql => {
            statements.push(sql);
            const result = answer(sql);
            if (result instanceof Error) {
                throw result;
            }
            return result || { rows: [] };
        },
        release: jest.fn(),
    };
    return { statements, client, pool: { connect: async () => client } };
};

const sqlError = (code, message = `error ${code}`) => Object.assign(new Error(message), { code });

afterAll(closeTestPools);

describe('names and limits, before any SQL', () => {
    test.each([
        ['viewSchema', { viewSchema: 'chain; DROP' }],
        ['viewSchema', { viewSchema: 'Chain' }],
        ['indexSchema', { indexSchema: 'yaci_store.cursor_' }],
        ['indexSchema', { indexSchema: '' }],
        ['readRole', { readRole: 'chain_reader"; DROP ROLE postgres; --' }],
        ['readRole', { readRole: 'r'.repeat(42) }],
    ])('a %s off the pattern throws a TypeError', (name, options) => {
        const pool = untouchedPool();
        expect(() => createChainIndex({ pool, policyId, network, ...options })).toThrow(new RegExp(`${name}.*\\[a-z_\\]`));
        expect(pool.connect).not.toHaveBeenCalled();
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('the policy id is 56 hex digits', () => {
        for (const bad of [undefined, 'ab'.repeat(27), 'AB'.repeat(28), `${'ab'.repeat(27)}'x`]) {
            expect(() => createChainIndex({ pool: untouchedPool(), policyId: bad, network })).toThrow(TypeError);
        }
    });

    test('the network: its slot configuration is needed, a network without one is a TypeError', () => {
        for (const bad of [undefined, null, { name: 'nowhere', networkId: 0 }, { name: 'custom', networkId: 0, slotConfig: { zeroTime: 0n, zeroSlot: 0n, slotLength: 0 } }]) {
            const pool = untouchedPool();
            expect(() => createChainIndex({ pool, policyId, network: bad })).toThrow(/slot configuration/);
            expect(pool.connect).not.toHaveBeenCalled();
        }
    });

    test('the runner checks the role too', async () => {
        const pool = untouchedPool();
        await expect(readOnly({ pool, readRole: 'x; RESET ROLE' }, 'SELECT 1')).rejects.toThrow(TypeError);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test(`holdersOf and eventsAmong: more than ${MAX_ASSET_NAMES} names is a RangeError, anything but a list of names a TypeError`, async () => {
        const pool = untouchedPool();
        const index = createChainIndex({ pool, policyId, network });
        await expect(index.holdersOf(Array.from({ length: MAX_ASSET_NAMES + 1 }, (_, n) => userName(n)))).rejects.toThrow(RangeError);
        await expect(index.holdersOf(userName(1))).rejects.toThrow(TypeError);
        await expect(index.holdersOf([userName(1), 7])).rejects.toThrow(TypeError);
        await expect(index.tokensHeldBy('stake:' + 'ab'.repeat(28))).rejects.toThrow(TypeError);
        await expect(index.eventsAmong(Array.from({ length: MAX_ASSET_NAMES + 1 }, (_, n) => userName(n)))).rejects.toThrow(RangeError);
        await expect(index.eventsAmong(userName(1))).rejects.toThrow(TypeError);
        await expect(index.eventsAmong([userName(1), null])).rejects.toThrow(TypeError);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('asset names and subjects go in as parameters, never into the SQL', async () => {
        const { pool, statements } = scriptedPool(() => ({ rows: [] }));
        const index = createChainIndex({ pool, policyId, network });
        const sneaky = `${userName(1)}'; DROP TABLE players; --`;
        await index.holdersOf([sneaky]);
        await index.tokensHeldBy([`stake:${'ab'.repeat(28)}`]);
        await index.mintOf(sneaky);
        await index.transaction(sneaky);
        await index.eventsAmong([sneaky]);
        const sql = statements.join('\n');
        expect(sql).not.toContain('DROP');
        expect(sql).not.toContain('ab'.repeat(28));
        expect(sql).not.toContain(userName(1));
    });

    test('every read: BEGIN READ ONLY, SET LOCAL ROLE, the query, COMMIT on one client', async () => {
        const { pool, statements, client } = scriptedPool(() => ({ rows: [] }));
        expect(await createChainIndex({ pool, policyId, network }).tip()).toBeNull();
        expect(statements).toEqual(['BEGIN READ ONLY', 'SET LOCAL ROLE chain_reader', expect.stringMatching(/FROM chain\.tip\b/), 'COMMIT']);
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});

describe('tip: the time of the tip block, from its slot', () => {
    // a cursor row saved just now, whatever its slot
    const tipAt = (slot, onNetwork) => {
        const { pool } = scriptedPool(sql => (/FROM chain\.tip\b/.test(sql) ? { rows: [{ block_no: '7', slot: String(slot), block_hash: 'ab'.repeat(32), synced_at: new Date() }] } : null));
        return createChainIndex({ pool, policyId, network: onNetwork }).tip();
    };

    test.each([
        // the first Shelley slot of each network and its time (Evolution SDK's SLOT_CONFIG_NETWORK)
        ['mainnet', mainnet, 4492800, 1596059091000],
        ['preprod', preprod, 86400, 1655769600000],
        ['preview', { name: 'preview', networkId: 0 }, 0, 1666656000000],
    ])('%s', async (_, onNetwork, slot, time) => {
        expect(await tipAt(slot, onNetwork)).toEqual({ blockNo: 7, slot, hash: 'ab'.repeat(32), time });
        expect((await tipAt(slot + 3600, onNetwork)).time).toBe(time + 3_600_000);
    });

    test('a network that brings its own slot configuration (the chain double\'s)', async () => {
        const own = { name: 'double', networkId: 0, slotConfig: { zeroTime: 1_700_000_000_000n, zeroSlot: 50_000_000n, slotLength: 1000 } };
        expect((await tipAt(50_000_020, own)).time).toBe(1_700_000_020_000);
    });
});

describe('what IndexUnavailableError covers', () => {
    test.each([
        ['a missing view', '42P01'],
        ['a missing schema', '3F000'],
        ['a view of another shape', '42703'],
        ['a missing right', '42501'],
        ['a lost connection', '08006'],
        ['a server shutting down', '57P01'],
        ['too many connections', '53300'],
    ])('%s (%s)', async (what, code) => {
        const { pool } = scriptedPool(sql => (/FROM chain\./.test(sql) ? sqlError(code) : null));
        const failure = await failureOf(createChainIndex({ pool, policyId, network }).tip());
        expect(failure).toBeInstanceOf(IndexUnavailableError);
        expect(failure.cause.code).toBe(code);
    });

    test('a read role that does not exist, and a client that cannot begin', async () => {
        const noRole = scriptedPool(sql => (sql.startsWith('SET LOCAL ROLE') ? sqlError('22023', 'role "chain_reader" does not exist') : null));
        expect(await failureOf(createChainIndex({ pool: noRole.pool, policyId, network }).tip())).toBeInstanceOf(IndexUnavailableError);
        expect(noRole.statements).toContain('ROLLBACK');
        const noBegin = scriptedPool(sql => (sql === 'BEGIN READ ONLY' ? new Error('Connection terminated unexpectedly') : null));
        expect(await failureOf(createChainIndex({ pool: noBegin.pool, policyId, network }).tip())).toBeInstanceOf(IndexUnavailableError);
    });

    test('a database that cannot be reached', async () => {
        // nothing listens on port 1
        const pool = new Pool({ connectionString: 'postgres://nobody@127.0.0.1:1/none', connectionTimeoutMillis: 2000 });
        try {
            const index = createChainIndex({ pool, policyId, network });
            expect(await failureOf(index.tip())).toBeInstanceOf(IndexUnavailableError);
            expect(await failureOf(index.ensureViews())).toBeInstanceOf(IndexUnavailableError);
        } finally {
            await pool.end();
        }
    });

    test('not a bug of the query: a syntax error or a write stays what it is', async () => {
        for (const code of ['42601', '25006']) {
            const { pool } = scriptedPool(sql => (/FROM chain\./.test(sql) ? sqlError(code) : null));
            const failure = await failureOf(createChainIndex({ pool, policyId, network }).tip());
            expect(failure).not.toBeInstanceOf(IndexUnavailableError);
            expect(failure.code).toBe(code);
        }
    });
});

// -------------------------------------------------------------------------------------------------
// Yaci Store's tables on a real Postgres

// The four tables as Yaci Store 2.0.7's Flyway migrations create them on Postgres (tag v2.0.7:
// stores/utxo/…/postgresql/V0_200_1__init.sql, stores/assets/…/V0_700_1__init.sql,
// components/core/…/V0_000_1__init.sql), without their indexes.
const YACI_TABLES = {
    cursor_: `(
        id integer not null, block_hash varchar(64), slot bigint, block_number bigint, era int, prev_block_hash varchar(64),
        create_datetime timestamp, update_datetime timestamp, primary key (id, block_hash))`,
    address_utxo: `(
        tx_hash varchar(64) not null, output_index smallint not null, slot bigint, block_hash varchar(64), epoch integer,
        lovelace_amount bigint null, amounts jsonb, data_hash varchar(64), inline_datum text, owner_addr varchar(500),
        owner_addr_full text, owner_stake_addr varchar(255), owner_payment_credential varchar(56), owner_stake_credential varchar(56),
        script_ref text, reference_script_hash varchar(56) null, is_collateral_return boolean, block bigint, block_time bigint,
        update_datetime timestamp, primary key (output_index, tx_hash))`,
    tx_input: `(
        output_index smallint not null, tx_hash varchar(64) not null, spent_at_slot bigint, spent_at_block bigint,
        spent_at_block_hash varchar(64), spent_block_time bigint, spent_epoch integer, spent_tx_hash varchar(64) null,
        primary key (output_index, tx_hash))`,
    assets: `(
        id uuid not null primary key, slot bigint, tx_hash varchar(64) not null, policy varchar(56), asset_name varchar(255),
        unit varchar(255), fingerprint varchar(255), quantity bigint, mint_type varchar(4), block bigint, block_time bigint,
        update_datetime timestamp)`,
};

// what Yaci Store's UtxoProcessor stores of an address: the 28 bytes after the header as the
// payment credential, of a base address the next 28 as the stake credential (key or script alike)
const credentialsOf = bech32 => {
    const hex = Address.toHex(Address.fromBech32(bech32));
    const type = parseInt(hex[0], 16);
    return { payment: hex.slice(2, 58), stake: type <= 3 ? hex.slice(58, 114) : null };
};

/**
 * A schema `yaci_test_<random>` for Yaci Store's tables, a view schema `chain_test_<random>`, the
 * role chain_reader_test (it stays; the schemas go in drop()), and the index over them.
 */
const yaciFixture = async () => {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 3, idleTimeoutMillis: 200 });
    const suffix = crypto.randomBytes(6).toString('hex');
    const indexSchema = `yaci_test_${suffix}`;
    const viewSchema = `chain_test_${suffix}`;
    await admin.query(`CREATE SCHEMA ${indexSchema}`);
    await admin.query(`DO $$ BEGIN CREATE ROLE ${READ_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`);
    const ours = unit => unit.startsWith(policyId);

    const createTables = async (names = Object.keys(YACI_TABLES)) => {
        for (const name of names) {
            await admin.query(`CREATE TABLE ${indexSchema}.${name} ${YACI_TABLES[name]}`);
        }
    };

    // the rows Yaci Store writes for the double's blocks, filtered to the policy as plan C's
    // plugin filters keep them: outputs with a policy token, the policy's mints and burns, a cursor
    // row per block (saved now, as Yaci Store saves it: its time is no block's); and every input
    // (Yaci Store writes tx_input unfiltered)
    const write = async chain => {
        let previous = null;
        for (const block of chain.blocks()) {
            const seconds = block.time / 1000;
            await admin.query(
                `INSERT INTO ${indexSchema}.cursor_ (id, block_hash, slot, block_number, era, prev_block_hash, create_datetime, update_datetime)
                 VALUES (1, $1, $2, $3, 6, $4, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
                [block.hash, block.slot, block.blockNo, previous]
            );
            previous = block.hash;
            for (const tx of block.txs) {
                for (const [outputIndex, output] of tx.outputs.entries()) {
                    if (!Object.keys(output.assets).some(ours)) {
                        continue;
                    }
                    const amounts = [
                        { unit: 'lovelace', policy_id: null, asset_name: 'lovelace', quantity: Number(output.lovelace) },
                        ...Object.entries(output.assets).map(([unit, quantity]) => ({ unit, policy_id: unit.slice(0, 56), asset_name: unit.slice(56), quantity: Number(quantity) })),
                    ];
                    const { payment, stake } = credentialsOf(output.address);
                    await admin.query(
                        `INSERT INTO ${indexSchema}.address_utxo (tx_hash, output_index, slot, block_hash, lovelace_amount, amounts, owner_addr,
                             owner_payment_credential, owner_stake_credential, block, block_time, update_datetime)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
                        [tx.txHash, outputIndex, block.slot, block.hash, output.lovelace, JSON.stringify(amounts), output.address, payment, stake, block.blockNo, seconds]
                    );
                }
                for (const input of tx.inputs) {
                    await admin.query(
                        `INSERT INTO ${indexSchema}.tx_input (tx_hash, output_index, spent_at_slot, spent_at_block, spent_at_block_hash, spent_block_time, spent_tx_hash)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [input.txHash, input.index, block.slot, block.blockNo, block.hash, seconds, tx.txHash]
                    );
                }
                for (const [unit, quantity] of Object.entries(tx.mint).filter(([unit]) => ours(unit))) {
                    await admin.query(
                        `INSERT INTO ${indexSchema}.assets (id, slot, tx_hash, policy, asset_name, unit, quantity, mint_type, block, block_time, update_datetime)
                         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
                        [block.slot, tx.txHash, policyId, unit.slice(56), unit, quantity, BigInt(quantity) > 0n ? 'MINT' : 'BURN', block.blockNo, seconds]
                    );
                }
            }
        }
    };

    const schemaExists = async name => (await admin.query('SELECT to_regnamespace($1) IS NOT NULL AS found', [name])).rows[0].found;

    const drop = async () => {
        await admin.query(`DROP SCHEMA IF EXISTS ${viewSchema} CASCADE`);
        await admin.query(`DROP SCHEMA IF EXISTS ${indexSchema} CASCADE`);
        await admin.end();
    };

    const index = (onNetwork = network) => createChainIndex({ pool: admin, policyId, network: onNetwork, indexSchema, viewSchema, readRole: READ_ROLE });
    return { admin, indexSchema, viewSchema, createTables, write, schemaExists, drop, index };
};

describePostgres('the real index on Postgres', () => {
    let fixture;
    afterAll(async () => {
        await fixture?.drop();
    });

    indexContract('chainIndex.js over Yaci-shaped tables', async chain => {
        fixture = await yaciFixture();
        await fixture.createTables();
        await fixture.write(chain);
        // the double's slot configuration: its slots and block times agree under it
        const index = fixture.index(chain.network);
        expect(await index.ensureViews()).toBe(true);
        return index;
    });
});

describePostgres('ensureViews on Postgres', () => {
    let fixture;
    beforeEach(async () => {
        fixture = await yaciFixture();
    });
    afterEach(async () => {
        await fixture.drop();
    });

    test('false while Yaci Store has not made its tables (no view schema then), true once it has, and again', async () => {
        const index = fixture.index();
        expect(await failureOf(index.tip())).toBeInstanceOf(IndexUnavailableError);
        expect(await index.ensureViews()).toBe(false);
        expect(await fixture.schemaExists(fixture.viewSchema)).toBe(false);
        // Yaci's Flyway makes cursor_ first, the stores' tables after it
        await fixture.createTables(['cursor_']);
        expect(await index.ensureViews()).toBe(false);
        expect(await fixture.schemaExists(fixture.viewSchema)).toBe(false);
        await fixture.createTables(['address_utxo', 'tx_input', 'assets']);
        expect(await index.ensureViews()).toBe(true);
        expect(await index.ensureViews()).toBe(true);
        // before the first sync
        expect(await index.tip()).toBeNull();
        expect(await index.holdersOf([userName(1)])).toEqual([]);
        expect(await index.mintOf(userName(1))).toBeNull();
    });

    test('a cursor saved now at an old slot answers the old slot\'s time (a resync does not look fresh)', async () => {
        await fixture.createTables();
        const index = fixture.index();
        expect(await index.ensureViews()).toBe(true);
        // a block of two days ago on preprod, reached just now
        const twoDaysAgo = Date.now() - 2 * 24 * 3_600_000;
        const slot = Number(Time.unixTimeToSlot(BigInt(twoDaysAgo), { zeroTime: 1655769600000n, zeroSlot: 86400n, slotLength: 1000 }));
        await fixture.admin.query(
            `INSERT INTO ${fixture.indexSchema}.cursor_ (id, block_hash, slot, block_number, era, create_datetime, update_datetime)
             VALUES (1, $1, $2, 4100000, 6, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`,
            ['cd'.repeat(32), slot]
        );
        const tip = await index.tip();
        expect(tip).toEqual({ blockNo: 4100000, slot, hash: 'cd'.repeat(32), time: Math.floor(twoDaysAgo / 1000) * 1000 });
        const [{ synced }] = await readOnly({ pool: fixture.admin, readRole: READ_ROLE }, `SELECT extract(epoch FROM synced_at) * 1000 AS synced FROM ${fixture.viewSchema}.tip`);
        // the view still says when Yaci Store saw it (for diagnosis); nothing decides on it
        expect(Date.now() - Number(synced)).toBeLessThan(60_000);
    });

    test('two servers at once both get their views', async () => {
        await fixture.createTables();
        const [one, two] = [fixture.index(), fixture.index()];
        expect(await Promise.all([one.ensureViews(), two.ensureViews(), one.ensureViews()])).toEqual([true, true, true]);
    });

    test('the read role sees the views only: players is out of reach, a write fails, the role ends with the read', async () => {
        await fixture.createTables();
        expect(await fixture.index().ensureViews()).toBe(true);
        const pool = await createTestPool();
        // (unqualified, the search path skips a schema the role may not use: "does not exist")
        const denied = await failureOf(readOnly({ pool, readRole: READ_ROLE }, `SELECT count(*) FROM ${pool.schema}.players`));
        expect(denied).toBeInstanceOf(IndexUnavailableError);
        expect(denied.cause.code).toBe('42501');
        // the pool's own role reads it, so the read role made the difference
        expect((await pool.query(`SELECT count(*)::int AS n FROM ${pool.schema}.players`)).rows).toEqual([{ n: 0 }]);
        // a temporary table is what the role may make (PUBLIC has TEMP), so only READ ONLY stops it
        const write = await failureOf(readOnly({ pool: fixture.admin, readRole: READ_ROLE }, 'CREATE TEMP TABLE scratch (n int)'));
        expect(write.code).toBe('25006');
        expect(write).not.toBeInstanceOf(IndexUnavailableError);
        expect(await readOnly({ pool: fixture.admin, readRole: READ_ROLE }, 'SELECT current_user AS who')).toEqual([{ who: READ_ROLE }]);
        expect((await fixture.admin.query('SELECT current_user AS who')).rows).toEqual([{ who: 'postgres' }]);
    });
});
