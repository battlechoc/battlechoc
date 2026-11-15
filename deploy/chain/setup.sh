#!/bin/sh
# The one-shot service chain-setup (docker-compose.yml, profile chain): checks the chain profile's
# settings, then makes the database roles and Yaci Store's schema (roles.sql). yaci-store starts
# only after this has succeeded.
#
# The checks are here and not in docker-compose.yml: Compose checks a required variable
# (${NAME:?...}) of every service, also of a profile that is off, and a server without the chain
# profile must not need these lines in .env. Messages name a variable, never its value.
set -eu

problems=0
fail() {
    echo "chain-setup: $1" >&2
    problems=$((problems + 1))
}
matches() {
    printf '%s' "$1" | grep -Eqx "$2"
}

[ -n "${YACI_STORE_DB_PASSWORD:-}" ] || fail 'set YACI_STORE_DB_PASSWORD in .env (openssl rand -hex 24)'
matches "${CHAIN_POLICY_ID:-}" '[0-9a-f]{56}' || fail 'CHAIN_POLICY_ID must be the policy id: 56 lower-case hex characters'
matches "${YACI_SYNC_START_SLOT:-}" '[0-9]+' || fail 'YACI_SYNC_START_SLOT must be the slot of the start block: a whole number'
matches "${YACI_SYNC_START_BLOCKHASH:-}" '[0-9a-f]{64}' || fail 'YACI_SYNC_START_BLOCKHASH must be the hash of the start block: 64 lower-case hex characters'
[ "$problems" -eq 0 ] || exit 1

# psql takes PGPASSWORD and (in roles.sql) YACI_STORE_DB_PASSWORD from the environment
exec psql -h postgres -U battlechoc -d battlechoc -v ON_ERROR_STOP=1 -f /chain/roles.sql
