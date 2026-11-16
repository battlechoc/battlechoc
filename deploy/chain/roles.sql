-- The database roles of the chain index, run by the one-shot service chain-setup of
-- docker-compose.yml (profile chain) before Yaci Store starts, as the database's owner `battlechoc`
-- (the compose file's POSTGRES_USER; the postgres image makes it the superuser). Safe to run again:
-- every statement either creates what is missing or sets what is already there.
--
--   yaci_store    Yaci Store logs in as it; owns the schema yaci_store with its tables, nothing else
--   chain_reader  no login; may read Yaci Store's tables and the API's views in schema chain
--
-- The API keeps connecting as `battlechoc`: it creates the schema chain and its views
-- (apps/api/src/chain/views.sql), owns them, and reads them as chain_reader (SET LOCAL ROLE in a
-- read-only transaction, apps/api/src/chain/chainIndex.js).
--
-- The password of yaci_store comes from the environment variable YACI_STORE_DB_PASSWORD into a
-- psql variable (\getenv, psql 15 or later), so it is neither in this file nor on a command line.

\set ON_ERROR_STOP on

\getenv yaci_password YACI_STORE_DB_PASSWORD
\if :{?yaci_password}
\else
DO $$ BEGIN RAISE EXCEPTION 'chain-setup: YACI_STORE_DB_PASSWORD is not set'; END $$;
\endif

BEGIN;

-- Yaci Store's login. LOGIN and the password are set at every run, so a changed
-- YACI_STORE_DB_PASSWORD takes effect with the next start of the stack.
SELECT 'CREATE ROLE yaci_store' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'yaci_store') \gexec
ALTER ROLE yaci_store WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'yaci_password';

-- Its schema, which its Flyway fills on the first start (the JDBC URL's currentSchema). As the
-- owner it may create, change and drop its tables there.
CREATE SCHEMA IF NOT EXISTS yaci_store AUTHORIZATION yaci_store;
ALTER SCHEMA yaci_store OWNER TO yaci_store;

-- Nothing of the game for yaci_store. The game's tables are in schema public, owned by battlechoc,
-- and grant nothing to anybody, so yaci_store can neither read nor write them; it gets no right
-- on public either (PUBLIC keeps its default USAGE on public, which lets it see names but read no
-- table, and has no CREATE there on Postgres 15 and later).
REVOKE ALL ON SCHEMA public FROM yaci_store;

-- The read role.
SELECT 'CREATE ROLE chain_reader' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chain_reader') \gexec
ALTER ROLE chain_reader WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

-- battlechoc is a member of chain_reader, with both options of Postgres 16 and later spelled out:
-- SET, so the API can SET ROLE chain_reader for its reads; INHERIT, so that battlechoc itself
-- has chain_reader's rights. The views run with the rights of their owner, battlechoc, so it is
-- through this inherited membership that a view may read Yaci Store's tables (the superuser
-- would not need it, a battlechoc without superuser does). With NOINHERIT every read of the
-- index would fail with "permission denied", and the API would report the index unavailable.
GRANT chain_reader TO battlechoc WITH INHERIT TRUE, SET TRUE;

-- chain_reader may read Yaci Store's tables: USAGE to reach the schema, SELECT on the tables there
-- now, and, for the tables Yaci Store creates later (its Flyway runs after this script on the
-- first start), SELECT by default on every table yaci_store creates in its schema. Nothing to
-- write: no INSERT, UPDATE, DELETE, TRUNCATE.
GRANT USAGE ON SCHEMA yaci_store TO chain_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA yaci_store TO chain_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE yaci_store IN SCHEMA yaci_store GRANT SELECT ON TABLES TO chain_reader;

COMMIT;
