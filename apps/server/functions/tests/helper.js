const { Pool } = require('pg');
const EmptyPlayerStats = require('battlechoc-shared-functions').EmptyPlayerStats;

const sleep = time => new Promise(r => setTimeout(r, time))

const setupDatabasePlayground = async () => {
    console.log('Waiting for postgres to start ...')
    await sleep(3000);
    console.log('Done. Start testing');

    let pool = new Pool({
        host:  'localhost',
        user: 'postgres',
        password: 'hackersdontcare',
        database: 'postgres',
        max: 1
    });
    await pool.query('CREATE DATABASE battlechoc');
    await pool.end();

    pool = new Pool({
        host:  'localhost',
        user: 'postgres',
        password: 'hackersdontcare',
        database: 'battlechoc',
        max: 1
    });

    await pool.query(`CREATE TABLE players
    (
        name text,
        coins integer,
        score integer,
        language text,
        id text NOT NULL,
        level json,
        CONSTRAINT players_pkey PRIMARY KEY (id)
    )`);

    await pool.query(`CREATE TABLE track_records
    (
        result text NOT NULL,
        player text NOT NULL,
        winner text,
        entities_destroyed smallint,
        entities_molten smallint,
        entities_revealed smallint,
        entities_built smallint,
        winner_type text,
        id uuid NOT NULL,
        CONSTRAINT track_records_pkey PRIMARY KEY (id, player)
    )`);

    await pool.query(`CREATE TABLE multiplayer_sessions
    (
        id text NOT NULL,
        player1 text,
        player2 text,
        gamestate jsonb,
        created timestamp without time zone,
        last_updated timestamp without time zone,
        turns smallint,
        CONSTRAINT multiplayer_sessions_pkey PRIMARY KEY (id)
    )`);

    await pool.query(`CREATE TYPE public.permissiontype AS ENUM ('messaging')`);

    await pool.query(`CREATE TABLE public.permissions
    (
        type permissiontype NOT NULL,
        player text NOT NULL,
        token text NOT NULL
    )`)

    await pool.query(`CREATE TABLE friends
    (
        player text NOT NULL,
        friend text NOT NULL
    )`);

    await pool.query(`CREATE TABLE multiplayerEventQueues (
        id text NOT NULL,
        sessionEventQueue jsonb
    )`);

    await pool.query('INSERT INTO players(id, name, coins, score, language, level) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', ['1337-1337-1337-1337', 'Basti', 100, 100, 'en', EmptyPlayerStats.level]);
    await pool.query('INSERT INTO players(id, name, coins, score, language, level) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', ['rul0r-rul0r-rul0r-rul0r', 'Fabi', 120, 120, 'de', EmptyPlayerStats.level]);
    await pool.query('INSERT INTO players(id, name, coins, score, language, level) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', ['h0gwarts-9-34', 'Hairy', 900, 125, 'jp', EmptyPlayerStats.level]);
    await pool.end();
}

module.exports.setupDatabasePlayground = setupDatabasePlayground;
