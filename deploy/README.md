# Deploying the battlechoc server

The game itself is static and lives on GitHub Pages (`.github/workflows/pages.yml`). This folder
holds the server side: Postgres, the Node API with the live match WebSocket, and a reverse proxy
for TLS. Everything runs with Docker Compose on one VPS.

Two ways to terminate TLS:

- **Caddy in Docker** (`docker-compose.yml` alone): Caddy fetches the certificate itself. For a
  VPS that runs nothing else.
- **The host's nginx** (`docker-compose.yml` + `docker-compose.nginx.yml`): the API listens on
  `127.0.0.1:8080`, nginx proxies `api.battlechoc.com` to it, certbot handles TLS. For a VPS that
  already serves other sites with nginx. The steps below take this way; with Caddy, skip step 5
  and leave out the overlay file in step 4.

## 1. What the VPS needs

- Docker with Compose v2 (`docker compose version`), nginx and certbot (`apt install nginx
  certbot python3-certbot-nginx`).
- A DNS record `api.battlechoc.com` → the VPS (A, and AAAA if it has IPv6). Set it first:
  certbot needs it.
- Ports 80 and 443 open.

## 2. The private files

The API refuses to start in production without the lab's recipe table, which is never in the
repository.

```sh
sudo mkdir -p /opt/battlechoc/private
# copy recipes.json there (scp from the machine that has it), then
# the API runs as the user `node` (uid 1000) in its container: give it the file, nobody else
sudo chown 1000:1000 /opt/battlechoc/private/recipes.json
sudo chmod 600 /opt/battlechoc/private/recipes.json
```

Before copying a new table, check it on the machine it comes from:
`node apps/api/scripts/check-recipes.js <file>`.

## 3. The repository and `.env`

```sh
sudo mkdir -p /opt/battlechoc && sudo chown "$USER" /opt/battlechoc
git clone https://github.com/battlechoc/battlechoc.git /opt/battlechoc/app
cd /opt/battlechoc/app/deploy
cp .env.example .env
chmod 600 .env
```

Fill in `.env` (`.env.example` explains every line):

| Key | Value |
| --- | --- |
| `API_DOMAIN` | `api.battlechoc.com` (Caddy reads it; with nginx it must still be set) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET` | `openssl rand -base64 48` (at least 32 characters) |
| `CORS_ORIGINS` | `https://battlechoc.com` (comma separated if the game has more origins) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`; the public key also goes into the game (see below) |
| `VAPID_SUBJECT` | `mailto:hello@battlechoc.com` |
| `RECIPES_PATH` | `/opt/battlechoc/private/recipes.json` |

Postgres takes `POSTGRES_PASSWORD` only when it creates its volume. Changing it later needs
`docker compose ... down -v` (which deletes the data) or the old password.

## 4. Start the stack

```sh
cd /opt/battlechoc/app
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.nginx.yml up -d --build
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.nginx.yml ps
curl http://127.0.0.1:8080/health   # {"ok":true}
```

The first build takes a few minutes. The API runs its migrations itself (`apps/api/src/migrations`).

## 5. nginx and TLS

```sh
sudo cp deploy/nginx/api.battlechoc.com.conf /etc/nginx/sites-available/api.battlechoc.com
sudo ln -s /etc/nginx/sites-available/api.battlechoc.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.battlechoc.com
curl https://api.battlechoc.com/health
```

certbot adds the TLS server block and the redirect from port 80 to the site file, and renews
the certificate on its own (`systemctl list-timers | grep certbot`).

The site file proxies `/live` with the WebSocket upgrade headers and long timeouts (a match
keeps its connection open); the API trusts one proxy (`trust proxy`) and so sees the player's
address in `X-Forwarded-For` for its per-minute account limit.

## 6. The game

The game's default API is `https://api.battlechoc.com` (`apps/pwa/src/helper/settings.jsx`), so
the deployed game finds the server as soon as DNS and TLS work. The Web Push public key must
match the server's `VAPID_PUBLIC_KEY`: it is read from the API at runtime, nothing to build.

Test from a browser: open battlechoc.com, play four matches against the AI (or use a profile
that has them) and press Start for an online match; two browsers find each other in the queue.

## Updating

```sh
cd /opt/battlechoc/app && git pull
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.nginx.yml up -d --build
```

A running live match ends when the API restarts (players get the reconnect grace, then the
match is forfeited): update at a quiet hour.

## Looking after it

- Logs: `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.nginx.yml logs -f api`
  (the API writes no access logs and stores no IP addresses, see the privacy policy).
- Backup: `docker compose -f deploy/docker-compose.yml exec postgres pg_dump -U battlechoc battlechoc | gzip > backup-$(date +%F).sql.gz`,
  in a cron job, copied off the VPS.
- Restore: `gunzip -c backup.sql.gz | docker compose -f deploy/docker-compose.yml exec -T postgres psql -U battlechoc battlechoc`.
- Uptime: a check of `https://api.battlechoc.com/health` from outside (any free uptime service).
