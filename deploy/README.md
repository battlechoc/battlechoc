# Deploying the battlechoc server

The game itself is static and lives on GitHub Pages (`.github/workflows/pages.yml`). This folder
holds the server side: Postgres and the Node API with the live match WebSocket, behind a reverse
proxy for TLS. Everything runs with Docker Compose on one VPS.

The API comes as an image from Docker Hub, published with every release
(`fabianbormann/battlechoc-api:<version>`, see [Publishing the image](#publishing-the-image)).
The server needs two files, `docker-compose.yml` and `.env`, and no checkout of this repository.

Two ways to terminate TLS:

- **The host's nginx** (`docker-compose.yml` alone): the API listens on `127.0.0.1:8080`, nginx
  proxies `api.battlechoc.com` to it, certbot handles TLS. For a VPS that already serves other
  sites with nginx. The steps below take this way.
- **Caddy in Docker** (`docker-compose.yml` + `docker-compose.caddy.yml`): Caddy fetches the
  certificate itself. For a VPS that runs nothing else: also fetch `docker-compose.caddy.yml`
  and `Caddyfile`, set `API_DOMAIN` in `.env`, add `-f docker-compose.yml -f
  docker-compose.caddy.yml` to every `docker compose` command below and skip step 5.

A server that still runs from a checkout (`/opt/battlechoc/app`): see
[Moving from the checkout to the image](#moving-from-the-checkout-to-the-image) first. It keeps
its database, but only if `.env` names the old volume.

## 1. What the VPS needs

- Docker with Compose v2 (`docker compose version`), nginx and certbot (`apt install nginx
  certbot python3-certbot-nginx`).
- A DNS record `api.battlechoc.com` → the VPS (A, and AAAA if it has IPv6). Set it first:
  certbot needs it.
- Ports 80 and 443 open.

## 2. The private files

The API refuses to start in production without the lab's recipe table, which is never in the
repository or the image.

```sh
sudo mkdir -p /opt/battlechoc/private
# copy recipes.json there (scp from the machine that has it), then
# the API runs as the user `node` (uid 1000) in its container: give it the file, nobody else
sudo chown 1000:1000 /opt/battlechoc/private/recipes.json
sudo chmod 600 /opt/battlechoc/private/recipes.json
```

Before copying a new table, check it on the machine it comes from:
`node apps/api/scripts/check-recipes.js <file>`.

## 3. The compose file and `.env`

```sh
sudo mkdir -p /opt/battlechoc && sudo chown "$USER" /opt/battlechoc
cd /opt/battlechoc
files=https://raw.githubusercontent.com/battlechoc/battlechoc/main/deploy
curl -fsSLO "$files/docker-compose.yml"
curl -fsSL "$files/.env.example" -o .env
chmod 600 .env
```

Fill in `.env` (`.env.example` explains every line):

| Key | Value |
| --- | --- |
| `API_IMAGE` | `fabianbormann/battlechoc-api` |
| `API_TAG` | a release such as `5.3.0` (stays on it until you change the line), or `latest` |
| `PGDATA_VOLUME` | the Docker volume of the database: `battlechoc_pgdata`; on a server that ran from a checkout before, `deploy_pgdata` (Compose refuses to start without this line) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET` | `openssl rand -base64 48` (at least 32 characters) |
| `CORS_ORIGINS` | `https://battlechoc.com` (comma separated if the game has more origins) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`; the game reads the public key from the API |
| `VAPID_SUBJECT` | `mailto:hello@battlechoc.com` |
| `RECIPES_PATH` | `/opt/battlechoc/private/recipes.json` |
| `API_DOMAIN` | only with Caddy: `api.battlechoc.com` |

Postgres takes `POSTGRES_PASSWORD` only when it creates its volume. Changing it later needs
`docker compose down -v` (which deletes the data) or the old password.

## 4. Start the stack

```sh
cd /opt/battlechoc
docker compose pull
docker compose up -d
docker compose ps                    # both services "healthy"
curl http://127.0.0.1:8080/health    # {"ok":true}
```

The API runs its database migrations itself when it starts.

## 5. nginx and TLS

```sh
files=https://raw.githubusercontent.com/battlechoc/battlechoc/main/deploy
curl -fsSL "$files/nginx/api.battlechoc.com.conf" | sudo tee /etc/nginx/sites-available/api.battlechoc.com > /dev/null
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

### Challenge links (play.battlechoc.com)

A shared challenge link is `https://play.battlechoc.com/<code>`: a small page of the API whose link
preview names the challenger, and which sends a browser on to `battlechoc.com/?challenge=<code>`.

1. DNS at OVH: an `A` record (and `AAAA` if the VPS has IPv6) for `play.battlechoc.com` with the
   VPS address, like `api.battlechoc.com`.
2. nginx and TLS:

   ```sh
   files=https://raw.githubusercontent.com/battlechoc/battlechoc/main/deploy
   curl -fsSL "$files/nginx/play.battlechoc.com.conf" | sudo tee /etc/nginx/sites-available/play.battlechoc.com > /dev/null
   sudo ln -s /etc/nginx/sites-available/play.battlechoc.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d play.battlechoc.com
   curl -s https://play.battlechoc.com/ | grep og:title
   ```

3. The game shares these links once `apps/pwa/.env` has
   `VITE_CHALLENGE_LINK_BASE=https://play.battlechoc.com/` (a new build and deploy). Until then it
   shares `https://battlechoc.com/?challenge=<code>` with the general preview.

## 6. The game

The game's default API is `https://api.battlechoc.com` (`apps/pwa/src/helper/settings.jsx`), so
the deployed game finds the server as soon as DNS and TLS work. The Web Push public key must
match the server's `VAPID_PUBLIC_KEY`: it is read from the API at runtime, nothing to build.

Test from a browser: open battlechoc.com, play four matches against the AI (or use a profile
that has them) and press Start for an online match; two browsers find each other in the queue.

## Updating

With `API_TAG=latest`:

```sh
cd /opt/battlechoc
docker compose pull api && docker compose up -d
```

With a version in `API_TAG`, change the line in `.env` to the new release first (the releases:
<https://github.com/battlechoc/battlechoc/releases>), then run the same two commands. Going back
is the same with the older version; a migration the newer version ran stays in the database.

When `deploy/docker-compose.yml` changed in a release, fetch the file again as in step 3
before the two commands. `.env` stays.

The API saves its running live matches when it stops and resumes them when it starts again;
the players' games reconnect by themselves after a few seconds. A release whose notes say
"deploy the API before the game" goes to the server first.

## Looking after it

- Logs: `docker compose logs -f api` (the API writes no access logs and stores no IP addresses,
  see the privacy policy). Docker keeps at most five files of 10 MB per service.
- Which version runs: `docker compose images api`, or
  `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$(docker compose ps -q api)"`.
- Backup: `docker compose exec -T postgres pg_dump -U battlechoc battlechoc | gzip > backup-$(date +%F).sql.gz`,
  in a cron job, copied off the VPS.
- Restore: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U battlechoc battlechoc`.
- Uptime: a check of `https://api.battlechoc.com/health` from outside (any free uptime service).

## Moving from the checkout to the image

For a server set up when the stack was built from a checkout in `/opt/battlechoc/app`
(`docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.nginx.yml up -d --build`).
Its database lies in the Docker volume `deploy_pgdata`, named after the folder `deploy`. The
new compose file names its volume in `.env`, so the data stays where it is.

1. Back up first, and note the volume's name:

   ```sh
   cd /opt/battlechoc/app/deploy
   docker compose exec -T postgres pg_dump -U battlechoc battlechoc | gzip > ~/backup-$(date +%F).sql.gz
   docker volume ls | grep pgdata        # deploy_pgdata
   ```

2. Put the new files next to the old folder and keep the old settings:

   ```sh
   cd /opt/battlechoc
   curl -fsSLO https://raw.githubusercontent.com/battlechoc/battlechoc/main/deploy/docker-compose.yml
   cp app/deploy/.env .env && chmod 600 .env
   printf '%s\n' "API_IMAGE=fabianbormann/battlechoc-api" "API_TAG=latest" "PGDATA_VOLUME=deploy_pgdata" >> .env
   ```

   `PGDATA_VOLUME=deploy_pgdata` is the line that matters: with another name the stack starts
   with a new, empty database (the old one stays in its volume, nothing is deleted). Without
   the line Compose refuses to start.

3. Stop the old stack (never with `-v`, that would delete the volume) and start the new one:

   ```sh
   docker compose -p deploy down
   docker compose pull && docker compose up -d
   ```

   Compose warns that the volume "already exists but was created for project deploy". That is
   expected; it uses the volume.

4. Check that the players are there, then remove the checkout:

   ```sh
   curl http://127.0.0.1:8080/health
   docker compose exec -T postgres psql -U battlechoc -d battlechoc -tc 'select count(*) from players'
   rm -rf /opt/battlechoc/app
   ```

nginx stays as it is: the API is on `127.0.0.1:8080` as before.

Why the volume's name matters this much: a game whose account the server does not know starts
a new account on its device and forgets the old one. An API that answers with an empty
database, even for minutes, makes every player who opens the game in that time lose their
profile for good. The same holds for a restore: stop the API (`docker compose stop api`)
while the database is not complete.

## Publishing the image

`.github/workflows/api-image.yml` builds `apps/api/Dockerfile` for amd64 and arm64 and pushes
`<image>:<version>`, `:<major>.<minor>`, `:<major>` and `:latest`. The Release workflow runs it
for every release it creates (merging the release pull request). It needs, once, in the
repository's Settings → Secrets and variables → Actions:

- the secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (Docker Hub → Account settings →
  Personal access tokens, with read and write access);
- optionally the variable `DOCKERHUB_IMAGE`, when the image is not
  `fabianbormann/battlechoc-api` (then change `API_IMAGE` on the server too).

The first push creates the repository on Docker Hub. Make it public there, or run
`docker login` on the server, so the server can pull it.

To publish a release again, or one from before this workflow existed: Actions → API image →
Run workflow, with the tag (`v5.2.2`). Untick "latest" for an older release. Without the two
secrets the job fails; the release itself is made before it and is not affected.

To build the image without Docker Hub: `docker build -f apps/api/Dockerfile -t battlechoc-api .`
at the root of a checkout, then `API_IMAGE=battlechoc-api` and `API_TAG=latest` in `.env`.
`deploy/test-image.sh` builds it and starts this stack with it in a throwaway project, as CI does.
