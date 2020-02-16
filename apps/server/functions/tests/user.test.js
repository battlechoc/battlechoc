const request = require('supertest');
const { Pool } = require('pg');
const EmptyPlayerStats = require('battlechoc-shared-functions').EmptyPlayerStats;
const app = require('../main').app;
const dbPool = require('../main').dbPool;

beforeAll(async done => {
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

    await pool.query('INSERT INTO players(id, name, coins, score, language, level) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', ['1337-1337-1337-1337', 'Basti', 0, 0, 'en', EmptyPlayerStats.level]);
    await pool.end();
    done();
})

it('should not find Chcononymous', async done => {
    const response = await request(app).get('/user/Chocnonymous');
    expect(response.status).toBe(404);
    done();
});

it('should find Basti', async done => {
    const response = await request(app).get('/user/Basti');
    expect(response.status).toBe(200);
    expect(response.body[0].name).toBe('Basti');
    done();
});

afterAll(async () => await dbPool.end());