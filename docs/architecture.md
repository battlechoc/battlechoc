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

## The server (`apps/api`)

- **Signing in with a Cardano key** (`src/cardano.js`, `src/routes/cardano.js`): single-use
  challenges (5 minutes) with the text of `packages/shared/cardano/message.js`, verified with the
  Evolution SDK (`COSE.SignData.verifyData`: exact text, address header, key hash, network);
  `GET /cardano/network`, `POST /auth/cardano/challenge`, `POST /auth/cardano/verify`,
  `GET|DELETE /user/identities`, `GET /user/progress`; plan 2: purpose `confirm` (confirm tokens
  for key changes), `POST|GET /user/passkeys`, `GET /auth/cardano/passkeys/:credentialId`; removing
  a key also ends the sessions it signed in (except the remover's): their refresh answers 401
  `session ended`, and the game then forgets that key's words and starts a new account. Off
  without `CARDANO_NETWORK`.
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
