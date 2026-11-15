# Architecture

How the parts of battlechoc fit together. For the rules of a match see
[game-rules.md](game-rules.md); for running things, the [README](../README.md) and
[deploy/README.md](../deploy/README.md).

## The parts

| Part | Where | Runs |
| --- | --- | --- |
| The game | `apps/pwa` | in the browser, served as static files from GitHub Pages (battlechoc.com); installable, works offline |
| The rules | `packages/shared` | inside the game and inside the server: the same engine, texts and numbers |
| The server | `apps/api` | on a VPS in Docker (`api.battlechoc.com`), with Postgres; image on Docker Hub |
| Android app | `apps/android` | a Trusted Web Activity that opens battlechoc.com |

```text
 browser ──────────── battlechoc.com (GitHub Pages: HTML, JS, models, pictures)
    │
    ├── REST  https://api.battlechoc.com/...   accounts, profile, highscore, lab
    └── WebSocket  wss://api.battlechoc.com/live   live matches, challenges
                         │
                    API container ── Postgres container
```

## One engine, three hosts

`packages/shared/engine/` holds the whole rule set. It never reads a clock: every call gets the
match time, and the match object carries everything else, the random generator included. So a
match is reproducible from its seed and its actions, and the same engine can run anywhere:

- **In the game, offline** (`apps/pwa/src/match/LocalMatchHost.js`): matches against Tom
  Toffee or Gustav Ganache, the tutorial and the building demos. The AI agents run next to the
  engine in the page.
- **On the server** (`apps/api/src/live/room.js`): online matches, challenges and AI matches
  that count for ingredients and the rating. The room is the only one that changes the match;
  players send intents, the room applies them and sends each player their view.
- **In tests and simulations** (`packages/shared/tests`, `packages/shared/scripts/simulate.js`).

A player never gets the match itself, only a view of it (`engine/view.js`): their own field in
full, the opponent's as far as they can see it. The server keeps the seed, the opponent's
donuts and what lies under cream to itself.

The engine is split by concern: `enums`, `selectors` (reading a match), `entities`, `match`
(creation), `phases`, `timers`, `scenarios`, `build`, `combat`; `engine/index.js` applies an
action and gathers them. Every number lives in `packages/shared/balance.js`; each match stores
the balance it started with.

## The game (`apps/pwa`)

- **React** renders the screens and dialogs (`src/ui/`); **Redux Toolkit** holds the player's
  view of the running match, the live connection's state and the UI state.
- **Babylon.js** draws the boards (`src/3d/`). The 3D code loads after the title screen, so the
  first screen needs only React and the game's own code.
- The UI talks to one interface, the match host: `submit(type, payload)` and `now()`. Whether a
  match runs locally or on the server makes no difference to the screens.
- **Texts** come from `packages/shared/translations/` in eight languages; English is built in,
  the game loads the player's language as a chunk of its own.
- **Offline**: a Workbox service worker (`src/service-worker.js`) precaches the build, the models,
  pictures, sounds and fonts. Without the server the game plays against its local AI; accounts,
  online play and the lab wait for the connection.
- **Accounts** are device accounts: on the first start the server creates a player and hands out
  a refresh token, which the game keeps in IndexedDB. There are no passwords.
- **Saving progress** (on when the build has `VITE_CARDANO_NETWORK` and the API `CARDANO_NETWORK`,
  `preprod` for now): the game makes a Cardano key from 24 recovery words on the device
  (`src/cardano/`, the Evolution SDK, loaded only when needed), keeps the words encrypted in
  IndexedDB and links the key to the player by signing a server challenge (CIP-8, as a wallet's
  `signData`). On another device the same words sign in as that player ("I already have an
  account"). The server stores only the stake key's hash (`identities`), never the words. In the
  Android app nothing visibly crypto shows (`src/cardano/androidApp.js`).
- **Backups and key changes** (plan 2): the words can also be backed up with a passkey (WebAuthn
  PRF: the passkey's secret encrypts them, the server keeps only the ciphertext per passkey) or a
  password-protected file (`src/cardano/{passkey,backupFile}.js`), and both open "I already have
  an account" too. Adding a further key or removing one needs a fresh proof by an existing key
  (a confirm token, `X-Battlechoc-Confirm`). Paths that only real phones can check stay hidden on
  iOS until listed in `VITE_CARDANO_CONFIRMED` (`passkey-ios`, `file-ios`).
- **The wallet door** (plan 3): the Cardano Foundation's `ConnectWalletList`
  (`src/ui/account/WalletDoor.jsx`, loaded only when it opens, never precached without a network)
  lists extensions, a phone wallet by QR code (CIP-45, peer-connect) and on phones the CIP-158
  wallets. The signing is the game's own (`src/cardano/wallet.js`: CIP-30 `signData` of exactly the
  challenge text; the core's `signMessage` breaks line breaks). A wallet no player knows is linked to
  the device's player (a proof first if it has keys); a known one gives that player's session, and
  the game asks which progress to keep as with words. On a phone the door makes a link code and
  opens `web+cardano://browse/v1?uri=<origin>/link/?code=…`: the link page (`link/index.html`,
  `src/link/main.js`, a build of its own after the game's, `vite.link.config.js`) signs in the
  wallet's own browser, and the game polls the code. Hidden in the Android app; deep links only
  with `cip158` in `VITE_CARDANO_CONFIRMED`.

## The server (`apps/api`)

- **Signing in with a Cardano key** (`src/cardano.js`, `src/routes/cardano.js`): single-use
  challenges (5 minutes) with the text of `packages/shared/cardano/message.js`, verified with the
  Evolution SDK (`COSE.SignData.verifyData`: exact text, address header, key hash, network);
  `GET /cardano/network`, `POST /auth/cardano/challenge`, `POST /auth/cardano/verify`,
  `GET|DELETE /user/identities`, `GET /user/progress`; plan 2: purpose `confirm` (confirm tokens
  for key changes), `POST|GET /user/passkeys`, `GET /auth/cardano/passkeys/:credentialId`; removing
  a key also ends the sessions it signed in (except the remover's): their refresh answers 401
  `session ended`, and the game then forgets that key's words and starts a new account. Plan 3:
  purpose `connect` (a wallet: unknown → linked, known → a session for its player), wallet
  addresses as bech32 or CIP-30 hex, `pay:<hash>` subjects for wallets without a stake key, link
  codes (`POST /user/link-codes`, `GET /user/link-codes/:code`; SHA-256 hashed, 10 minutes, one per
  player, a signature claims the code atomically; a known wallet's session is made at the poll),
  `POST /accounts/logout`. Off without `CARDANO_NETWORK`.
- **Express** serves the REST routes (`src/routes/`), **ws** the live WebSocket (`src/live/`), on
  one HTTP server. `src/config.js` reads and checks the environment once at the start.
- **Postgres** stores players, sessions, matches with their actions (for recovery after a
  restart), ingredients, items and the rating. Migrations in `src/migrations/` run at the start,
  each in a transaction.
- **Live matches**: a lobby (`lobby.js`) pairs players from a queue, falls back to an AI after a
  while, and hosts challenges (`challenges.js`, shared by link or code). A room saves snapshots
  and its action log, so a restart of the server resumes the running matches; the players'
  games reconnect by themselves.
- **Trust**: what has value comes only from matches the server hosted: ingredients
  (`rewards.js`) and the public rating (matches between two humans and against the server AI). A match played
  offline gives private experience only, which decides nothing but the player's own board size
  and AI opponent, so a faked result gains nothing.

## Reading the chain

A crafted item can become a token on Cardano (minting). From then on the chain decides
who has it: a minted item belongs, in the game, to the player whose linked wallet holds its user
token. The server learns that from the chain through four parts, each built on the one before.

- **The provider** (`apps/api/src/chain/provider.js`) is the server's door to a
  Blockfrost-compatible API: a wallet's unspent outputs, protocol parameters, the tip, and
  submitting and evaluating a transaction. Minting and burning build their transactions with it.
  It is never asked who holds an item: the index answers that.
- **The index** is Yaci Store, run beside the API (the compose profile `chain`). It follows the
  Cardano network and keeps only the outputs, mints and burns of the game's policy, in schema
  `yaci_store` of the game's own Postgres. The API never reads those tables directly: it creates
  views over them in schema `chain` (`apps/api/src/chain/views.sql`, the only SQL that reads Yaci
  Store's tables; `apps/api/src/chain/chainIndex.js` applies it once Yaci Store has made them), and
  reads only the views, as the role `chain_reader`, in read-only transactions. The index sees only blocks, so a transaction still in the mempool is
  invisible to it. It is trusted only when it is **fresh**: its tip block's time, computed from
  the block's slot, is at most `CHAIN_INDEX_MAX_LAG_MS` (10 minutes by default) old. The time Yaci
  Store saved its cursor does not count, since a resyncing index saves old blocks just now. A
  stale or unreachable index changes nothing: no item leaves anybody because the indexer is down.
- **The watcher** (`apps/api/src/chain/watcher.js`) is an interval job, like the cleanup: every
  `CHAIN_WATCH_INTERVAL_MS` (20 seconds by default) it reads the index's tip, decides whether the
  index is fresh and runs its steps in order. For now it has one step, the ownership sync; the
  steps of minting and burning will run before it. Runs never overlap, and a failing step is
  logged without stopping the others. It logs what changes and when the index stops or starts
  being fresh, never an idle run; a failure that lasts is logged when it starts, again when its
  message changes and once when it ends (`apps/api/src/chain/lastingLog.js`).
- **The ownership sync** (`apps/api/src/chain/ownership.js`) looks at every minted, unburned item at each
  run and derives who holds it now. It writes the item's owner and holder columns where they
  differ, and a notice for a player whose wallet the item left or entered (`item_notices`). It
  never touches the equipment: the slot of an item that left keeps its id (a match's loadout skips
  items the player does not have), so the item is back in its slot when it returns. Since
  everything is derived again on each run, a rollback of the chain corrects itself on the next
  one. The sync judges only items the index accounts for: it knows the token's mint, and exactly
  one unspent output holds the token, or none does and the index knows a burn of it (then nobody
  has the item). An index started with another policy, or from a slot after an item's mint, holds
  no output of that token; one that lacks an output (a filter that kept none, a half-written
  block) or a spend (two outputs of one token) would otherwise take the item from its player or
  give it to the wrong one. Such items are left as they are, with a warning.

**Who holds a token.** The holder is the address of the unspent output with the token. A payment
part that is a script (a marketplace listing, the reference-token store) means nobody holds it,
whatever its stake part. Otherwise the address has a payment key and, for a base address with a
stake key, that stake key. The owner is the player linked to the stake key; when nobody has that
key, the player linked to the payment key: a wallet without a stake key, or a base address whose
stake key is linked to nobody. So a token that moves to another payment key under the same stake
key has moved too: it leaves a player who owns it only through the old payment key.

**Depth.** The depth of a block is the tip's block number minus its own; the tip itself has depth
0. A departure counts at once: as soon as the index has the transaction in any block, the item
leaves the player. An arrival counts at depth 1 or more, with one block on top. A move between
two keys of the same player never leaves them. "Final" is depth `CHAIN_K_FINAL` or more, the
measure that minting and burning use.

**The hop wait.** A wallet that was linked to another player before counts for the player who has
it now only `WALLET_HOP_WAIT_MS` (24 hours, `packages/shared/chain.js`) after their first link
since the other player's. Until then the wallet's items belong to nobody, so a wallet passed on
carries no items into a match at once. Unlinking and linking again neither restarts nor ends the
wait. The history is `identity_history`, written whenever a key is linked or removed. Account
safety shows when the wait ends.

**What the game sees.** The stats (`GET /user`) mark minted items and carry the unread notices;
`GET /user/identities` names each wallet and counts the minted items that count through it, with
the end of a hop wait. Both come from the game's own tables, which the sync keeps current: a
player's request never waits for the chain. The game shows a gold stamp on minted items, the
notices on the title screen (`POST /user/notices/seen` marks them read) and the wallets' items in
Account safety. In the Android app none of this shows, but minted items stay usable, since the
loadout is the server's.

**The chain double.** The tests use an in-memory chain (`apps/api/test/chainDouble.js`) with
blocks, a mempool, rollbacks and faults. It answers the real provider in Blockfrost's JSON, so
the provider's own code runs in every test, and it stands in for the index with the same
functions and answers; the index's SQL is tested against real views on Postgres. The browser
tests' API (`apps/api/test/e2eServer.js`) runs the real server over it and adds routes under
`/test/chain/` to add blocks, roll back, mint an item to an address, move or burn a token, fund
an address, hold the mempool and simulate a provider or index fault. Each route
that changes the chain runs the ownership sync before it answers, so the game sees the change on
its next request. Those routes exist only with `DATABASE_URL=memory` and never in the image.

**Without the chain configuration** (`CHAIN_POLICY_ID`, `CHAIN_CONFIG_REF`,
`CHAIN_SERVER_KEY_FILE`, `CHAIN_PROVIDER_URL`, `CHAIN_PROVIDER_KEY` and `CHAIN_K_FINAL`, besides
`CARDANO_NETWORK`), the chain features are off. With `CARDANO_NETWORK` set, the start logs which
of the six are missing; without it, the start says nothing about them. There is no provider, no
index and no watcher, and no item can be minted. On a server that never had them, the stats
carry no stamps and no notices and the wallets hold no items, and the game works as before.
Items minted before the configuration was removed keep their mark and stay with the player the
last sync gave them to: without a watcher, nothing moves any more, whatever happens on the chain.

## Releases and deployment

- Commits follow Conventional Commits; release-please turns them into a version and
  `CHANGELOG.md` and opens a release pull request. Merging it tags `vX.Y.Z`.
- **The game**: every green CI run on `main` deploys `apps/pwa` to GitHub Pages
  (`.github/workflows/pages.yml`).
- **The server**: every release builds the API image for amd64 and arm64 and pushes it to Docker
  Hub (`.github/workflows/api-image.yml`). The VPS runs it with `deploy/docker-compose.yml`.
- CI (`.github/workflows/ci.yml`) runs the unit tests of every package, the API tests on an
  in-memory database and on Postgres 17, starts the API image with the server's compose file,
  builds the game and runs the browser tests in four parallel groups.
