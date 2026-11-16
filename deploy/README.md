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
address in `X-Forwarded-For` for its per-minute limits per address (new accounts, the Cardano
sign-in, the chain routes). It takes exactly one hop: keep exactly one reverse proxy in front of
it (this nginx, or Caddy). Behind a second one (a CDN, another proxy) it would see that proxy's
address and every player would share one limit; reached without a proxy it would believe a
client's own header (the compose file binds the API to `127.0.0.1` for that reason).

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
  see the privacy policy). Docker keeps at most five files of 10 MB per service. The host's
  nginx keeps its own access log (on by default), with every request's path: with minting on,
  that includes `/chain/sign/<code>`. A sign code is valid for at most 10 minutes, and alone it can
  only read its mint or carry the player's own wallet signatures (`docs/architecture.md`,
  "Minting").
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
  connects to a public preprod relay, reads every block from the start block on (the one
  `deploy.js` recorded, below the contracts' deployment) and keeps only what the game reads: the
  outputs that hold one of its user tokens, the spends of those outputs, and the mints and burns
  of user tokens. It writes them into the schema `yaci_store` of the same Postgres database. Its
  settings are the files in `chain/` (`application.properties`, `application-plugins.yml` and
  `plugins/handle-commit.js`). It publishes no port.

What it stores, exactly (Yaci Store 2.0.7; a user token is a token of `CHAIN_POLICY_ID` whose name
starts with the CIP-68 label `000de140`; the reference tokens, `000643b0`, at the items contract
are not stored: the API finds them through the provider):

| Table | Rows | Check on the running service (`psql -U battlechoc -d battlechoc -c '…'`) |
| --- | --- | --- |
| `address_utxo` | one per output that holds a user token, with all of its amounts | `select count(*) from yaci_store.address_utxo u where not exists (select 1 from jsonb_array_elements(u.amounts) a where a->>'unit' like '<policy id>000de140%')` is 0 |
| `assets` | one per mint or burn of a user token | `select count(*) from yaci_store.assets where unit is null or unit not like '<policy id>000de140%'` is 0 |
| `tx_input` | the spends of those outputs only (the commit handler deletes the others after each batch) | `select count(*) from yaci_store.tx_input t where not exists (select 1 from yaci_store.address_utxo u where u.tx_hash = t.tx_hash and u.output_index = t.output_index)` is 0 (a handful during a batch) |
| `cursor_` | the sync point: the last blocks seen (Yaci Store keeps 2160) | `select min(slot), max(slot) from yaci_store.cursor_`: the minimum is at or above `YACI_SYNC_START_SLOT` while fewer than 2160 blocks are synced, and `max(slot)` grows. This proves where the sync started and that it runs, not what the other tables hold |

Besides these, only Yaci Store's own bookkeeping has rows: `era` (one row per era it has seen,
Conway), `error` (a row for a block it could not save, for example when a filter stopped the sync)
and `flyway_schema_history` (its migrations). Every other table of the schema stays empty: only the
stores `utxo` and `assets` run, the address table is off (`store.utxo.save-address=false`) and every
other store is switched off in `chain/application.properties`. `select relname, n_live_tup from
pg_stat_user_tables where schemaname = 'yaci_store' and n_live_tup > 0` lists only those tables
(the counts are Postgres's estimate; `select count(*)` on one table is exact). Nothing before the
start block is read: `select min(slot) from yaci_store.address_utxo` and `… from
yaci_store.assets` are above `YACI_SYNC_START_SLOT`.

The API reads the index through views of its own (the schema `chain`, which it creates once the
index has made its tables), as the role `chain_reader`, which may read and never write. The
role `yaci_store` can read or write nothing of the game.

Resources: about 1 to 1.5 GB of RAM more (the container is limited to 1.5 GB), and little disk:
the index holds only the user tokens' outputs, a few rows per mint or move. It never deletes the
spent ones (the version used has a flaw there, see `chain/application.properties`), so it grows
by those few rows and needs no cleaning.

### What a player notices when the index is behind or down

Only that minting and salvaging minted items wait. The API trusts the index only while its newest
block is recent: at most `CHAIN_INDEX_MAX_LAG_MS` old (10 minutes by default). While the index is
stopped, catching up or rebuilding, the API changes no ownership: no minted item leaves its player
or arrives at a new one, and the game keeps working as before, matches included. A new mint or
salvage cannot start meanwhile (for a mint the game's checklist says "battlechoc cannot read the
Cardano network right now"), a mint already signed stays "minting" until the index sees it, and
no salvaged item's ingredients are credited. Once the index has caught up, the API applies what happened on
the chain in the meantime.

### Turning it on

The contracts must be deployed first (`apps/api/scripts/chain/deploy.js`, on the machine with
the admin key, `contracts/README.md`): it records the deployment in
`contracts/deployments/preprod.json` and prints the chain lines for `.env`.

1. The server key, next to the recipes (the API runs as the user `node`, uid 1000, in its
   container):

   ```sh
   # copy the server key file there (scp), then
   sudo chown 1000:1000 /opt/battlechoc/private/chain-server.key
   sudo chmod 600 /opt/battlechoc/private/chain-server.key
   ```

   The file is what `new-key.js --kind key` wrote: one line `ed25519_sk1…`, a regular file that
   only its owner may read. The API loads it once at the start and refuses to start otherwise
   (see [What the API checks at the start](#what-the-api-checks-at-the-start)). Its key hash must
   be one of the server keys of the on-chain config (`deploy.js --server-key-hash`, later
   `update-config.js --add-server-key`): if it is not, the API starts, but every mint answers
   503 `CHAIN UNAVAILABLE` and the log says `chain: the server key is not in the config: minting
   is off until an admin adds it`.

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

3. The start block. The index reads the chain from one block on, not from the network's
   genesis, and that block must lie before the first mint. `deploy.js` chooses it when it deploys
   (20 blocks below the tip right before its submit, so a small rollback cannot remove it),
   records it as `indexStart` (`{ block, slot, hash }`) in `contracts/deployments/preprod.json` and
   prints it with the other lines for `.env`: `YACI_SYNC_START_SLOT` and
   `YACI_SYNC_START_BLOCKHASH`. `deploy.js --confirm` prints them again. Nothing to look up.

   The value is fixed once: a retry (`--again`, `--new-seed`, `--confirm`) keeps the earliest
   recorded start point, and `update-config.js` never touches it, so a rebuilt index still starts
   before the first mint. A record from before start points were recorded gets the block 20 below
   its deployment's block when `--confirm` confirms it. From `.env` the compose file passes the two
   values to `chain-setup` (which checks them: a whole number and 64 hex characters) and to
   `yaci-store` (`STORE_CARDANO_SYNC_START_SLOT`, `STORE_CARDANO_SYNC_START_BLOCKHASH`). If the
   log of `yaci-store` says the intersection was not found, a rollback deeper than 20 blocks
   orphaned the start block: take another block that lies before the deployment (a preprod
   explorer shows its slot and hash), put it into both lines and
   [rebuild the index](#rebuilding-the-index).

4. The lines in `.env` (the commented block at the end of `.env.example` explains each one):

   | Key | Value |
   | --- | --- |
   | `CARDANO_NETWORK` | `preprod` |
   | `COMPOSE_PROFILES` | `chain` |
   | `YACI_STORE_DB_PASSWORD` | `openssl rand -hex 24` |
   | `YACI_SYNC_START_SLOT`, `YACI_SYNC_START_BLOCKHASH` | what `deploy.js` printed (step 3) |
   | `CHAIN_POLICY_ID`, `CHAIN_CONFIG_REF`, `CHAIN_CONFIG_POLICY_ID` | what `deploy.js` printed |
   | `CHAIN_SERVER_KEY_PATH` | `/opt/battlechoc/private/chain-server.key` |
   | `CHAIN_PROVIDER_KIND` | not set (or `koios`) for Koios; `blockfrost` for a Blockfrost-compatible API |
   | `CHAIN_PROVIDER_URL` | `https://preprod.koios.rest/api/v1` |
   | `CHAIN_PROVIDER_KEY` | a free koios.rest token (recommended; without one, Koios's public tier may refuse a mint for its size, see below) |
   | `CHAIN_K_FINAL` | the depth from which a transaction counts as final (1 to 2160; no default, yours to choose: see below). Set it last, once the index has caught up (step 6) |

   `YACI_CARDANO_HOST`, `YACI_CARDANO_PORT` and `YACI_PROTOCOL_MAGIC` default to preprod's public
   relay; `CHAIN_WATCH_INTERVAL_MS` and `CHAIN_INDEX_MAX_LAG_MS` have defaults too. Put the
   provider's key into `.env` with an editor, never on a command line (the shell's history keeps
   it).

   **The provider.** The API reads the chain and submits through Koios unless
   `CHAIN_PROVIDER_KIND=blockfrost`: then `CHAIN_PROVIDER_URL` is
   `https://cardano-preprod.blockfrost.io/api/v0` and `CHAIN_PROVIDER_KEY` the Blockfrost project
   id for preprod (required). The kind decides how the key is sent: Koios gets it as a bearer
   token, Blockfrost in its `project_id` header. A URL on `blockfrost.io` needs
   `CHAIN_PROVIDER_KIND=blockfrost`, a URL on `koios.rest` the kind `koios`; the API refuses to
   start otherwise. Any other host is taken as the kind says, so a Blockfrost-compatible service on
   another host needs `CHAIN_PROVIDER_KIND=blockfrost` too, or the API talks Koios to it and sends
   its key as a bearer token. At the start the log names the kind and the host:
   `chain provider: koios at preprod.koios.rest`.

   A Blockfrost-compatible service must answer `/assets/{unit}/addresses` (who holds a token) and
   `/addresses/{address}/utxos/{unit}`. Blockfrost answers 404 for an asset the chain never saw,
   and the API takes that as "nobody holds it"; a service without the first endpoint answers its
   404 for every token, and the API cannot tell the two apart. With `CHAIN_CONFIG_POLICY_ID` set
   such a service is noticed at once: the API finds no config NFT, logs that it cannot read the
   config, and every mint answers `CHAIN UNAVAILABLE`: none is prepared. Without it (the config
   found by `CHAIN_CONFIG_REF`) the worse case is a mint that landed but that the index does not
   see: before the watcher expires a mint the index does not have, it asks the provider whether
   the token is held, so that it never frees an item on the index's word alone, and such a service
   answers "nobody" for every token, so the watcher would expire that mint and free an item whose
   token exists. The credit of a salvaged item asks the provider the same question, so it would
   rest on the index alone; a salvage in the game cannot even start (the burn finds the item's
   store through the same endpoint: `CHAIN UNAVAILABLE`). Use Blockfrost itself or a service that
   has both endpoints. An answer of the second endpoint that contradicts the first (a 404, or no UTxO with
   the token at the address just named as its holder) counts as "provider unavailable": the API
   waits.

   **Koios's size limit: set the free token.** Koios's public tier limits a request's body to
   1 kB, and a mint transaction is larger (about 2 to 3 kB). Whether its submit enforces that has
   not been tried, so the recommended setting is a free token in `CHAIN_PROVIDER_KEY`; without
   one, the API's start logs `… minting may be refused for size: set CHAIN_PROVIDER_KEY …` once.
   If the public tier does enforce it, the API logs `chain provider refused a request for its size (413): …` (at most once
   an hour, naming the limit and `CHAIN_PROVIDER_KEY`), and the submit counts as "provider
   unavailable": the transaction reached no node, so nothing is spent. The player sees the item
   "minting"; the watcher tries again every minute, and once the transaction's validity is over it
   ends as expired, which does not count against the day's mints. The remedy: register a free
   token at koios.rest and put it into `CHAIN_PROVIDER_KEY` (the API sends it as a bearer token;
   the registered tier allows 5 kB). The operator scripts hit the same limit with the deploy
   transaction (about 2.9 kB) and `e2e.js`'s mints; if the deploy is still too large with the
   token, run the scripts through Blockfrost (`CHAIN_PROVIDER_KIND=blockfrost`, see
   `contracts/README.md`) or a submit endpoint of your own.

   **`CHAIN_K_FINAL`** is the owner's to set; it decides four things a player notices:
   - when a mint counts as final. A player's next mint waits until the previous one is final (an
     included mint keeps its player's operation open), so that is the wait between two mints: K
     blocks of about 20 seconds each (10: some 3 to 4 minutes);
   - when a salvaged minted item's ingredients arrive: the API credits a burn once it is K blocks
     deep, so about K × 20 seconds after the burn's block, plus up to one watcher interval
     (`CHAIN_WATCH_INTERVAL_MS`, 20 seconds); longer while the provider cannot answer or while the
     wallet's 24-hour hop wait runs. The game tells the player the ingredients come "in a few minutes":
     that holds only while K stays small (10: some 3 to 4 minutes; 30: about 10 minutes). With a
     large K the game's text is wrong;
   - how long a mint that never landed stays "minting", or a salvage that never landed "burning",
     after its validity (20 minutes) is over: K blocks more before the watcher calls it
     expired, and longer while the provider cannot answer (the expiry waits for the provider's
     word on the token: nobody holds it for a mint, it is still held for a burn);
   - how deep a rollback the server survives without a wrong decision. 2160 (the network's own
     security parameter) would mean about 12 hours for each of the above.

   Recommended: 10 on preprod (the value the tests use, and the project's research proposes it),
   20 to 30 on mainnet.

5. Start and watch:

   ```sh
   cd /opt/battlechoc
   docker compose pull
   docker compose up -d
   docker compose ps -a                   # chain-setup "Exited (0)", yaci-store "Up"
   docker compose logs chain-setup        # a problem with a .env line shows here
   docker compose logs -f yaci-store      # Yaci Store's log: its start, then the sync's progress
   ```

   Both filters must show the policy id: `docker compose logs yaci-store | grep -A14 'Created MVEL
   filter'` prints each expression with the 56 hex characters of `CHAIN_POLICY_ID` where the file
   has `${CHAIN_POLICY_ID}` (followed by `000de140`, the user tokens' label). A wrong or empty policy id does not stop the start; it stops the sync
   at the first block, with `CHAIN_POLICY_ID is not 56 hex digits` and `Stopping fetcher` in the
   log (fix `.env`, then `docker compose up -d`).

   The index starts at the start block and catches up with the chain; on preprod that takes
   minutes to hours, depending on how far back the start block is. Until then the API waits (see
   above). How far it is, in blocks (the newest one it has):

   ```sh
   docker compose exec -T postgres psql -U battlechoc -d battlechoc -c 'select block_number, slot from yaci_store.cursor_ order by slot desc limit 1'
   ```

   The API's own start shows in `docker compose logs api`: `chain provider: <kind> at <host>` when
   the chain features are on, or `chain features off: missing …` with the names of the lines it
   did not get.

6. Turn the API's minting on once the index has caught up. Until then `CHAIN_K_FINAL` stays out
   of `.env` (the index needs `CHAIN_POLICY_ID` and the `YACI_*` lines; the API turns its chain
   features on only with all of its lines), so the API says `chain features off: missing
   CHAIN_K_FINAL`. With every line set while the index is still syncing, `GET /chain/status`
   would offer Mint to every web player for the hours the first sync takes, while their
   checklist keeps saying the network cannot be read. When the newest block of the index (the
   query above) is the chain's tip, or close to it, add `CHAIN_K_FINAL` and `docker compose up
   -d` (Compose recreates the API with the new line). Pausing the on-chain config
   (`update-config.js`) until then works too, but the Mint action then shows as paused.

   **The first mint.** After the first mint on preprod, and before you open minting to players,
   check that the index has it: at least one row in `yaci_store.assets` and one in
   `yaci_store.address_utxo` for its user token. Both of these must answer 1 or more (the
   queries in [What runs](#what-runs) count the rows that should NOT be there and say 0 either
   way): `select count(*) from yaci_store.assets where unit like '<policy id>000de140%'` and
   `select count(*) from yaci_store.address_utxo u where exists (select 1 from
   jsonb_array_elements(u.amounts) a where a->>'unit' like '<policy id>000de140%')`. The game
   shows the item as minted once the index has it. If the mint landed (a
   preprod explorer shows it) and the index has neither row, its filters keep nothing of the
   mints: the watcher then logs `the index does not have a mint the provider sees: check the
   index's filters` and leaves the mint "minting", never expired. Fix the filters
   (`chain/application-plugins.yml`, from the same release as the compose file) and [rebuild the
   index](#rebuilding-the-index); the watcher then finishes the mint by itself. Never change
   `chain_ops` by hand.

### What the API checks at the start

The API reads its chain lines once when it starts (`apps/api/src/config.js`). The chain features
are on only with `CARDANO_NETWORK` and all of `CHAIN_POLICY_ID`, `CHAIN_CONFIG_REF`,
`CHAIN_SERVER_KEY_FILE` (the compose file always sets it to the mounted key), `CHAIN_PROVIDER_URL`
and `CHAIN_K_FINAL`, plus `CHAIN_PROVIDER_KEY` with `CHAIN_PROVIDER_KIND=blockfrost`. While some
are missing the API starts with the chain features off and logs `chain features off: missing …`
(only with `CARDANO_NETWORK` set). Once all are there, a wrong value stops the start: the API
exits with `invalid configuration:` and one line per problem, naming the variable and never its
value.

| Variable | Default | A wrong value stops the start with |
| --- | --- | --- |
| `CHAIN_PROVIDER_KIND` | `koios` | `CHAIN_PROVIDER_KIND is unknown: it must be koios or blockfrost (or not set: koios)`, also while other lines are missing; `CHAIN_PROVIDER_KIND must be blockfrost for a Blockfrost URL (CHAIN_PROVIDER_URL): set CHAIN_PROVIDER_KIND=blockfrost`, or `… must be koios (or not set) for a Koios URL` |
| `CHAIN_POLICY_ID` | none | `CHAIN_POLICY_ID must be a policy id: 56 lower-case hex characters` |
| `CHAIN_CONFIG_REF` | none | `CHAIN_CONFIG_REF must be an output reference: 64 lower-case hex characters, "#" and the output index` |
| `CHAIN_CONFIG_POLICY_ID` | not set: the config is found by `CHAIN_CONFIG_REF` alone | `CHAIN_CONFIG_POLICY_ID must be a policy id: 56 lower-case hex characters (or not set)` |
| `CHAIN_PROVIDER_URL` | none | `CHAIN_PROVIDER_URL must be an https:// URL in production, without a user, a query or a fragment` |
| `CHAIN_PROVIDER_KEY` | none (optional with Koios) | nothing at the start; a key the provider refuses shows in the log as `the provider refused the key` |
| `CHAIN_K_FINAL` | none | `CHAIN_K_FINAL must be a whole number from 1 to 2160` |
| `CHAIN_WATCH_INTERVAL_MS` | 20000 | `CHAIN_WATCH_INTERVAL_MS must be a whole number of milliseconds, at least 1000` |
| `CHAIN_INDEX_MAX_LAG_MS` | 600000 (10 minutes) | `CHAIN_INDEX_MAX_LAG_MS must be a whole number of milliseconds, at least 60000` |
| `CHAIN_SERVER_KEY_PATH` (the key file, mounted as `CHAIN_SERVER_KEY_FILE`) | `/dev/null` | `CHAIN_SERVER_KEY_FILE: /run/secrets/chain-server.key is not a file` (the line is not set, or names a path that did not exist, which Docker then creates as a directory); `… is open to others (mode 644): chmod 600 it`; `… is not a key file (one line ed25519_sk1…)`; `CHAIN_SERVER_KEY_FILE cannot be read` (the file is not owned by uid 1000) |

`CHAIN_K_FINAL` decides when a mint counts as final, when a burned item's ingredients are
credited, and how long the watcher waits after a transaction's validity has ended before it calls a
mint or a burn that never landed expired; it has no default, and choosing it is yours (see [step 4](#turning-it-on): 10 on preprod, 20 to 30 on
mainnet). With `CHAIN_CONFIG_POLICY_ID` the
API finds the config by its NFT wherever an admin update moved it; without it, after an update,
the API reads a spent output and minting answers `CHAIN UNAVAILABLE` until `CHAIN_CONFIG_REF` is
updated. The API keeps the config it read for a minute, so a pause or an update takes up to a
minute to show.

### Salvaging minted items

A player salvages a minted item by burning its token, in the game or with any wallet outside it.
The API gives the ingredients back once the burn is `CHAIN_K_FINAL` blocks deep, whoever made it
(`docs/architecture.md`, "Salvaging a minted item"). What that means for the server:

- **Migration 015** (`015_salvage_credits.js`) runs by itself when the API starts: the table
  `salvage_credits` (one row per credited burn: the burn's transaction and token, the player
  credited, the ingredients given back, the time; no wallet key), the column
  `items.burn_tx`, and `chain_ops.fee_option` without `NOT NULL` (a burn has no fee option).
  Nothing to do by hand.
- **The credit needs the index.** The API credits only a burn the index lists together with the
  output it spent (the view `chain.item_burns`). A burn the index does not see is not credited: the
  item waits. When the index knows a burn but not the output it spent (an index started after
  that output was made, or a filter that kept nothing of it), the log says once, as a warning,
  `watcher: ownership: the chain index knows burns of tokens but not the outputs they spent, so they cannot be credited: check the index's filters and that it synced from before the tokens' last outputs`,
  and the item leaves its player, unless the game's own burn of it is signed and not yet ended. Fix the
  filters, or [rebuild the index](#rebuilding-the-index) from a start block before the tokens'
  last outputs; the next run of the watcher then credits the burn. Never write `salvage_credits`,
  `items.burned_at` or `chain_ops` by hand.
- **The provider confirms every credit.** Before it credits, the API asks the provider whether
  anybody still holds the token. `watcher: credit: the index shows burns of tokens the provider still sees: no credit until it does not; check the index`
  (an error, logged once while the list stays the same) means the index lists a burn the chain
  does not confirm: check the index as above. A salvage of the game whose token is gone but which
  the index does not have stays "burning", and the log says
  `watcher: operations: the index does not have a burn the provider sees (the token is gone): check the index's filters; the operations stay submitted`.
- **"In a few minutes."** The game tells the player the ingredients come in a few minutes. That
  depends on `CHAIN_K_FINAL`: blocks come about every 20 seconds, so the credit comes about K × 20
  seconds after the burn's block (10: some 3 to 4 minutes). Keep K small (10 on preprod, 20 to 30
  on mainnet, as recommended in [step 4](#turning-it-on)); with a large K the text is wrong.
- **For the index's first-start checklist**, two more points:
  - the burn query on the real index, once it holds a few burns: `explain analyze select unit,
    tx_hash, block_no, address from chain.item_burns where unit = any(array['<policy id>000de140<…>'])
    order by block_no, tx_hash, unit` (with the user token of a burned item). Note how long it
    takes and whether it reads whole tables: at each run the watcher asks it about every minted
    item, 500 at a time;
  - that Yaci Store writes no `assets` row for a transaction that failed phase 2 (its script
    failed, so the chain took its collateral and applied none of its mints or burns). If it does,
    the index knows burns and mints that never happened. A burn is safe: the API still asks the
    provider before any credit or expiry, so nothing is credited from it. A mint is not: the API
    takes a mint the index shows in a block as included and, `CHAIN_K_FINAL` blocks later, as
    final without asking the provider, so the item would count as minted without a token. Report
    it at once.

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

First look for operations that are still open, mints and salvages:

```sh
docker compose exec -T postgres psql -U battlechoc -d battlechoc -c "select state, count(*) from chain_ops where state in ('prepared','submitted','included') group by state"
```

With the chain off no watcher runs, so an open mint stays open until the chain is on again: its
item shows "minting" and cannot be salvaged (`ITEM BUSY`), and the player cannot start another
mint (the Mint action is gone anyway). A `prepared` one (not signed) ends at the next read of it
once its sign window is over; a `submitted` or `included` one is in the hands of the chain: it may
land while the chain is off, and once the chain is on again the watcher finds it in the index
(minted, then final) or, past its validity, expires it. A salvage works the same way: its item
stays "burning", and no ingredients are credited while the chain is off; a burn that lands
meanwhile, the game's or one made with a wallet outside it, is credited once the chain is on
again and the index has it. So turn it off when that query answers no `submitted` and no `included` rows, or accept
that those items wait.

Then comment out `COMPOSE_PROFILES=chain` in `.env`, and `docker compose --profile chain stop
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
