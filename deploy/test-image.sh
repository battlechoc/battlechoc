#!/usr/bin/env bash
# Builds the API image from this checkout and starts the server stack (docker-compose.yml)
# with it, the way a server does: in a throwaway project with its own database volume. Then
# checks that the API is healthy, has migrated its database and creates an account.
# With --match two bots also play a live match through it (a few minutes; needs `npm ci`).
# CI runs this on every pull request, so a release never publishes an image that cannot start.
#   deploy/test-image.sh [--match]
set -euo pipefail
cd "$(dirname "$0")/.."

project=battlechoc-image-test
port=${API_PORT:-18080}
env_file=$(mktemp)

compose() {
    docker compose -p "$project" --env-file "$env_file" -f deploy/docker-compose.yml "$@"
}
cleanup() {
    status=$?
    if [ "$status" -ne 0 ]; then
        compose logs --tail 80 api || true
    fi
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    rm -f "$env_file"
}
trap cleanup EXIT

docker build -f apps/api/Dockerfile -t battlechoc-api:test .

cat > "$env_file" <<EOF
API_IMAGE=battlechoc-api
API_TAG=test
API_PORT=$port
PGDATA_VOLUME=${project}_pgdata
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
CORS_ORIGINS=http://localhost:3000
RECIPES_PATH=$PWD/apps/api/src/lab/recipes.sample.json
EOF

# --wait: until Postgres and the API report healthy (the image's HEALTHCHECK)
compose up -d --wait --wait-timeout 120

base="http://127.0.0.1:$port"
curl -fsS "$base/health" | grep -q '"ok":true'
curl -fsS -X POST "$base/accounts" | grep -q '"refreshToken"'
echo "the image starts, migrates and creates accounts"

if [ "${1:-}" = "--match" ]; then
    node apps/api/scripts/live-bots.js "$base"
fi
