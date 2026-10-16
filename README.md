# battlechoc

A chocolate-themed two-player strategy game. Each player owns a board of chocolate cells, builds a chocolate factory, cacao trees, cannons and special buildings, hides them under cream, and tries to destroy the opponent's economy. Playable against AI opponents and online, as a progressive web app.

## Repository layout

| Path | What |
| --- | --- |
| `apps/pwa` | The game client: React, Redux Toolkit, Babylon.js, Vite, Workbox |
| `packages/shared` | Shared by client and server: the real-time rules engine, AIs, balance, equipment, live protocol, translations |
| `apps/api` | The backend: REST API (accounts, profile, lab, Web Push) and the live match WebSocket, on Postgres |
| `deploy` | Docker Compose stack for the server: Postgres, the API and Caddy |
| `apps/server` | Legacy Firebase Cloud Functions backend, kept for reference until the switch to `apps/api` |
| `whitepaper` | Draft whitepaper for the planned competitive layer, with the economy simulator behind its numbers |

## Development

Requires Node `^20.19` or `>=22.12`.

```sh
npm install          # installs all workspaces
npm run dev          # Vite dev server for the PWA on port 3000
npm test             # unit tests of the shared rules engine
npm run build        # production build of the PWA into apps/pwa/build
npm run test:e2e     # Playwright end-to-end tests against the production build (run the build
                     # first, and `npx playwright install chromium` once)
npm run test:api     # tests of the API (in-memory database)
```

Without an API the game runs offline: AI opponents work, but there are no accounts, no online matches and no lab. To play with everything, run the API locally in one of the two ways below.

## Running the whole stack locally

### Quick: in-memory API and the dev server

No Docker needed. The API keeps its data in memory, so everything is gone after a restart.

```sh
# terminal 1: the API on port 8091
DATABASE_URL=memory JWT_SECRET=$(openssl rand -base64 48) PORT=8091 \
  CORS_ORIGINS=http://localhost:3000 npm run start:api

# terminal 2: the game on http://localhost:3000, using that API
VITE_API_URL=http://localhost:8091 npm run dev
```

### Production-like: everything in Docker

This runs Postgres, the API, Caddy and the game in Docker. It needs nothing but Docker with Compose v2, and ports 80, 443 and 3000 must be free.

- `deploy/docker-compose.yml` is the server stack.
- `deploy/docker-compose.local.yml` adds the game, built against the local API.
- Caddy serves the API over plain HTTP on `localhost`.

1. Create `deploy/.env` (it is git-ignored):

   ```sh
   cat > deploy/.env <<EOF
   API_DOMAIN=http://localhost
   POSTGRES_PASSWORD=$(openssl rand -hex 16)
   JWT_SECRET=$(openssl rand -base64 48)
   CORS_ORIGINS=http://localhost:3000
   RECIPES_PATH=../apps/api/src/lab/recipes.sample.json
   EOF
   ```

   - `http://` tells Caddy to serve plain HTTP instead of requesting a TLS certificate.
   - `RECIPES_PATH` is resolved from `deploy/`. Locally it points to the public sample recipes; a real server uses the private recipe table, which is never in the repository.
   - The `VAPID_*` keys from `deploy/.env.example` are optional; without them Web Push is off.

2. Build and start everything (the first build takes a few minutes):

   ```sh
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml -p battlechoc-dev up -d --build
   ```

3. Play on http://localhost:3000. The API answers on http://localhost.

4. Optional check: two bots create accounts and play a live match against each other. A match can take a few minutes.

   ```sh
   node apps/api/scripts/live-bots.js http://localhost
   ```

5. Stop everything. Add `-v` to also delete the database.

   ```sh
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml -p battlechoc-dev down
   ```

To work on the game against this API, leave out `-f deploy/docker-compose.local.yml` in step 2 (port 3000 stays free) and run `VITE_API_URL=http://localhost npm run dev`. The dev server reloads on every change; the `pwa` image only changes when you rebuild it.

Postgres applies `POSTGRES_PASSWORD` only when it creates its volume. If you change the password later, the API cannot connect ("password authentication failed"). Delete the volume with `down -v`, or keep the old password.

## License

- **Code:** [GNU Affero General Public License v3.0 or later](LICENSE). If you run a modified version of battlechoc as a network service, you must offer its source code to its users.
- **Art and music** (images, 3D models, music, sounds and their sources): [CC BY-NC-SA 4.0](LICENSE-ASSETS). They may not be used commercially. These files are source-available, not open source.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). All contributors must sign the [Contributor License Agreement](CLA.md) before a pull request can be merged; the CLA bot guides you through it.
