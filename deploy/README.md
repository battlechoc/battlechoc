# Deploying the battlechoc server

The game itself is static and lives on GitHub Pages (`.github/workflows/pages.yml`). This folder
holds the server side: Postgres and the Node API with the live match WebSocket, behind a reverse
proxy for TLS. Everything runs with Docker Compose on one VPS.

The API comes as an image from Docker Hub, published with every release
(`fabianbormann/battlechoc-api:<version>`, see [Publishing the image](#publishing-the-image)).
The server needs two files, `docker-compose.yml` and `.env`, and no checkout of this repository
(the optional [chain features](#chain-features-minting-preprod) add the folder `chain/`).

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
| `CARDANO_NETWORK` | optional: `preprod` (for now) turns on signing in with a Cardano key; the game's build needs `VITE_CARDANO_NETWORK` with the same value |

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
before the two commands (with the chain features on, also the folder `chain/`, see
[Updating with the chain features on](#updating-with-the-chain-features-on)). `.env` stays.

The API saves its running live matches when it stops and resumes them when it starts again;
the players' games reconnect by themselves after a few seconds. A release whose notes say
"deploy the API before the game" goes to the server first.

## Looking after it

- Logs: `docker compose logs -f api` (the API writes no access logs and stores no IP addresses,
  see the privacy policy). Docker keeps at most five files of 10 MB per service.
- Which version runs: `docker compose images api`, or
  `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$(docker compose ps -q api)"`.
- Backup: `docker compose exec -T postgres pg_dump -U battlechoc --exclude-schema=yaci_store --exclude-schema=chain battlechoc | gzip > backup-$(date +%F).sql.gz`,
  in a cron job, copied off the VPS. The two excluded schemas are the chain index and the API's
  views over it (see [Chain features](#chain-features-minting-preprod)): the index rebuilds
  itself from the chain and the API makes the views again, so neither belongs in a backup. On a
  server without the chain features they do not exist and the options change nothing.
- Restore: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U battlechoc battlechoc`.
- Uptime: a check of `https://api.battlechoc.com/health` from outside (any free uptime service).

## Chain features (minting, preprod)

Players can mint some of their items as tokens on the Cardano test network preprod. The game
still keeps every item in its own database; for a minted item, the chain decides who has it: the
player whose linked wallet holds the token. To know who holds which token, the server runs its
own small chain index next to the API. It is off unless `.env` turns it on.

### What runs

Two more services of `docker-compose.yml`, in the Compose profile `chain` (a profile is a group
of services that `docker compose` starts only when it is named; `COMPOSE_PROFILES=chain` in
`.env` names it for every command):

- **`chain-setup`** runs once at every start and exits: it checks the chain lines of `.env` (a
  missing or malformed one stops it with a message that names the line), then creates the
  database role `yaci_store` with its own password and schema, and the read-only role
  `chain_reader` (`chain/setup.sh`, `chain/roles.sql`). `yaci-store` starts only after it
  succeeded. `docker compose ps -a` shows it as "Exited (0)": that is its normal state.
- **`yaci-store`** ([Yaci Store](https://github.com/bloxbean/yaci-store), an indexer for Cardano)
  connects to a public preprod relay, reads every new block and keeps only what concerns the
  game's minting policy: the outputs that hold one of its tokens, the spends of those outputs,
  and its mints and burns. It writes them into the schema `yaci_store` of the same Postgres
  database. Its settings are the files in `chain/` (`application.properties`,
  `application-plugins.yml` and `plugins/handle-commit.js`). It publishes no port.

The API reads the index through views of its own (the schema `chain`, which it creates once the
index has made its tables), as the role `chain_reader`, which may read and never write. The
role `yaci_store` can read or write nothing of the game.

Resources: about 1 to 1.5 GB of RAM more (the container is limited to 1.5 GB), and little disk:
the index holds only the policy's outputs, a few rows per mint or move. It never deletes the
spent ones (the version used has a flaw there, see `chain/application.properties`), so it grows
by those few rows and needs no cleaning.

### What a player notices when the index is behind or down

Nothing. The API trusts the index only while its newest block is recent: at most
`CHAIN_INDEX_MAX_LAG_MS` old (10 minutes by default). While the index is stopped, catching up or
rebuilding, the API changes no ownership: no minted item leaves its player or arrives at a new
one, and the game keeps working as before, matches included. Once the index has caught up, the
API applies what happened on the chain in the meantime.

### Turning it on

The contracts must be deployed first (`apps/api/scripts/chain/deploy.js`, on the machine with
the admin key): it prints `CHAIN_POLICY_ID` and `CHAIN_CONFIG_REF` and records the deployment
in `contracts/deployments/preprod.json`.

1. The server key, next to the recipes (the API runs as the user `node`, uid 1000, in its
   container):

   ```sh
   # copy the server key file there (scp), then
   sudo chown 1000:1000 /opt/battlechoc/private/chain-server.key
   sudo chmod 600 /opt/battlechoc/private/chain-server.key
   ```

2. The folder `chain/` next to `docker-compose.yml` (take both from the same release: the
   compose file mounts these files):

   ```sh
   cd /opt/battlechoc
   files=https://raw.githubusercontent.com/battlechoc/battlechoc/main/deploy
   mkdir -p chain/plugins
   for f in setup.sh roles.sql application.properties application-plugins.yml plugins/handle-commit.js; do
     curl -fsSL "$files/chain/$f" -o "chain/$f"
   done
   ```

3. The start block. The index reads the chain from one block on, and that block must lie before
   the first mint: take the block of the deployment or any earlier one. Its height is `block` in
   `contracts/deployments/preprod.json`; Blockfrost gives its slot and hash (the same project id
   as `CHAIN_PROVIDER_KEY`). `read -rs` asks for the project id without showing it, so it stays
   out of the shell's history, and curl takes the header from its input, not from its command
   line:

   ```sh
   read -rs -p 'Blockfrost project id: ' project_id; echo
   printf 'project_id: %s\n' "$project_id" | curl -s -H @- https://cardano-preprod.blockfrost.io/api/v0/blocks/<height> | grep -Eo '"(slot|hash)":[^,]*'
   unset project_id
   ```

   A block explorer (preprod.cardanoscan.io, search the height) shows the same two values.

4. The lines in `.env` (the commented block at the end of `.env.example` explains each one):

   | Key | Value |
   | --- | --- |
   | `CARDANO_NETWORK` | `preprod` |
   | `COMPOSE_PROFILES` | `chain` |
   | `YACI_STORE_DB_PASSWORD` | `openssl rand -hex 24` |
   | `YACI_SYNC_START_SLOT`, `YACI_SYNC_START_BLOCKHASH` | the slot and the hash of step 3 |
   | `CHAIN_POLICY_ID`, `CHAIN_CONFIG_REF` | what `deploy.js` printed |
   | `CHAIN_SERVER_KEY_PATH` | `/opt/battlechoc/private/chain-server.key` |
   | `CHAIN_PROVIDER_URL` | `https://cardano-preprod.blockfrost.io/api/v0` |
   | `CHAIN_PROVIDER_KEY` | the Blockfrost project id for preprod |
   | `CHAIN_K_FINAL` | the depth from which a transaction counts as final (1 to 2160) |

   `YACI_CARDANO_HOST`, `YACI_CARDANO_PORT` and `YACI_PROTOCOL_MAGIC` default to preprod's public
   relay; `CHAIN_WATCH_INTERVAL_MS` and `CHAIN_INDEX_MAX_LAG_MS` have defaults too.

5. Start and watch:

   ```sh
   cd /opt/battlechoc
   docker compose pull
   docker compose up -d
   docker compose ps -a                   # chain-setup "Exited (0)", yaci-store "Up"
   docker compose logs chain-setup        # a problem with a .env line shows here
   docker compose logs -f yaci-store      # Yaci Store's log: its start, then the sync's progress
   ```

   Both filters must show the policy id: `docker compose logs yaci-store | grep -A6 'Created MVEL
   filter'` prints each expression with the 56 hex characters of `CHAIN_POLICY_ID` where the file
   has `${CHAIN_POLICY_ID}`. A wrong or empty policy id does not stop the start; it stops the sync
   at the first block, with `CHAIN_POLICY_ID is not 56 hex digits` and `Stopping fetcher` in the
   log (fix `.env`, then `docker compose up -d`).

   The index starts at the start block and catches up with the chain; on preprod that takes
   minutes to hours, depending on how far back the start block is. Until then the API waits (see
   above). How far it is, in blocks (the newest one it has):

   ```sh
   docker compose exec -T postgres psql -U battlechoc -d battlechoc -c 'select block_number, slot from yaci_store.cursor_ order by slot desc limit 1'
   ```

### Rebuilding the index

The index holds nothing that is not on the chain, so it can always be thrown away and read
again, for example after a change of the start block or when Yaci Store reports a broken
database. The API changes no ownership while it rebuilds: after the rebuild it waits until the
index's newest block is recent again (`CHAIN_INDEX_MAX_LAG_MS`) and only then reads it.

```sh
cd /opt/battlechoc
docker compose stop yaci-store
docker compose exec -T postgres psql -U battlechoc -d battlechoc -c 'drop schema yaci_store cascade'
docker compose up -d                   # chain-setup makes the schema again, yaci-store reads from the start block
docker compose restart api             # the API makes its views again (the drop removed them)
```

### Turning it off

Comment out `COMPOSE_PROFILES=chain` in `.env`, then `docker compose --profile chain stop
yaci-store`. The API keeps the items as they were last seen; with the `CHAIN_*` lines commented
out as well (and `docker compose up -d`), the chain features of the API are off too. The data
stays in the schema `yaci_store` until you drop it as above.

### Updating with the chain features on

When a release changes `docker-compose.yml` or anything in `deploy/chain/`, fetch both again,
from that release, before `docker compose pull && docker compose up -d`: the compose file as in
[step 3](#3-the-compose-file-and-env), the folder as in step 2 above. A new variable in `.env`
reaches the API only through the compose file that names it (on 2026-11-11 the server ran 5.4.0
with the compose file of 5.3.0, and `CARDANO_NETWORK` never arrived), and the index's settings
are the files in `chain/`.

Locally, the same works with the dev stack: the chain lines in `deploy/.env` and
`docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml -p battlechoc-dev --profile chain up -d --build`.

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
