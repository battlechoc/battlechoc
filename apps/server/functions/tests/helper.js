const { Pool } = require("pg");
const EmptyPlayerStats =
  require("@battlechoc/battlechoc-shared-functions").EmptyPlayerStats;

const sleep = (time) => new Promise((r) => setTimeout(r, time));

const setupDatabasePlayground = async () => {
  console.log("Waiting for postgres to start ...");
  await sleep(3000);
  console.log("Done. Start testing");

  let pool = new Pool({
    host: "localhost",
    user: "postgres",
    password: "hackersdontcare",
    database: "postgres",
    max: 1,
  });
  await pool.query("CREATE DATABASE battlechoc");
  await pool.end();

  pool = new Pool({
    host: "localhost",
    user: "postgres",
    password: "hackersdontcare",
    database: "battlechoc",
    max: 1,
  });

  await pool.query(
    `CREATE TYPE public.gameresultreason AS ENUM('timeout', 'surrendered', 'normal', 'system')`
  );

  await pool.query(`CREATE TABLE players
    (
        name text,
        coins integer,
        score integer,
        language text,
        id text NOT NULL,
        level json,
        tutorial_started boolean,
        tutorial_skipped boolean,
        tutorial_finished boolean,
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
        reported timestamp without time zone,
        resultreason gameresultreason,
        awards json,
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
        last_notification timestamp without time zone,
        last_action timestamp without time zone,
        turns smallint,
        CONSTRAINT multiplayer_sessions_pkey PRIMARY KEY (id)
    )`);

  await pool.query(`CREATE TYPE public.permissiontype AS ENUM ('messaging')`);

  await pool.query(`CREATE TABLE public.permissions
    (
        type permissiontype NOT NULL,
        player text NOT NULL,
        token text NOT NULL
    )`);

  await pool.query(`CREATE TABLE friends
    (
        player text NOT NULL,
        friend text NOT NULL
    )`);

  await pool.query(`CREATE TABLE multiplayerEventQueues (
        id text NOT NULL,
        sessionEventQueue jsonb
    )`);

  await pool.query(
    "INSERT INTO players(id, name, coins, score, language, level, tutorial_started, tutorial_skipped, tutorial_finished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    [
      "1337-1337-1337-1337",
      "Basti",
      10,
      1100,
      "en",
      EmptyPlayerStats.level,
      false,
      false,
      false,
    ]
  );
  await pool.query(
    "INSERT INTO players(id, name, coins, score, language, level, tutorial_started, tutorial_skipped, tutorial_finished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    [
      "rul0r-rul0r-rul0r-rul0r",
      "Fabi",
      10,
      1120,
      "de",
      EmptyPlayerStats.level,
      true,
      false,
      false,
    ]
  );
  await pool.query(
    "INSERT INTO players(id, name, coins, score, language, level, tutorial_started, tutorial_skipped, tutorial_finished) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    [
      "h0gwarts-9-34",
      "Hairy",
      900,
      1125,
      "ja",
      EmptyPlayerStats.level,
      true,
      false,
      true,
    ]
  );
  await pool.query(
    "INSERT INTO multiplayer_sessions(id, player1, player2, gamestate, created, last_updated, last_notification, last_action) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), NOW()) RETURNING *",
    ["alive", "notreallyaplayer", "iamnotreal", { isRunning: true }]
  );
  await pool.query(
    "INSERT INTO multiplayer_sessions(id, player1, player2, gamestate, created, last_updated, last_notification, last_action) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days') RETURNING *",
    ["deadgame", "hoax", "hagrid", { isRunning: true }]
  );
  await pool.end();
};

module.exports.setupDatabasePlayground = setupDatabasePlayground;
