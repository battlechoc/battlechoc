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

- **The provider** (`apps/api/src/chain/provider.js`) is the server's door to the chain's API:
  Koios (`koiosProvider.js`, the default; with a free Koios token, see "The provider" below) or a Blockfrost-compatible
  API, by `CHAIN_PROVIDER_KIND`. Both answer alike, as the Evolution SDK's objects
  (`test/chainProviderContract.test.js` holds them to that): a wallet's unspent outputs, protocol
  parameters, the tip, and submitting and evaluating a transaction. Minting and burning build their transactions with it.
  It is never asked who holds an item: the index answers that.
- **The index** is Yaci Store, run beside the API (the compose profile `chain`). It follows the
  Cardano network from the block `deploy.js` recorded below the contracts' deployment, and keeps
  only what holds or moves the game's user tokens (CIP-68 label `000de140` under its policy): the
  outputs with one, their spends, and their mints and burns, in schema `yaci_store` of the game's
  own Postgres (`deploy/README.md` lists every table). The reference tokens are not in it: a burn
  finds the reference output through the provider. The API never reads those tables directly: it creates
  views over them in schema `chain` (`apps/api/src/chain/views.sql`, the only SQL that reads Yaci
  Store's tables; `apps/api/src/chain/chainIndex.js` applies it once Yaci Store has made them), and
  reads only the views, as the role `chain_reader`, in read-only transactions. The index sees only blocks, so a transaction still in the mempool is
  invisible to it. It is trusted only when it is **fresh**: its tip block's time, computed from
  the block's slot, is at most `CHAIN_INDEX_MAX_LAG_MS` (10 minutes by default) old. The time Yaci
  Store saved its cursor does not count, since a resyncing index saves old blocks just now. A
  stale or unreachable index changes nothing: no item leaves anybody because the indexer is down.
- **The watcher** (`apps/api/src/chain/watcher.js`) is an interval job, like the cleanup: every
  `CHAIN_WATCH_INTERVAL_MS` (20 seconds by default) it reads the index's tip, decides whether the
  index is fresh and runs its steps in order: the operations step of minting (see
  [Minting](#minting)), then the ownership sync, then the credit of burned items (see
  [Salvaging a minted item](#salvaging-a-minted-item)). Runs never overlap, and a failing step is
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
  one unspent output holds the token, or none does and the index knows a burn of it. A token that
  no output holds because it was burned is **burning**, not gone, when the index lists that burn
  (at any depth) or an open burn operation of the item is submitted or included: the item keeps
  its player and holder, no notice is written, and `items.burn_tx` notes the burn until the credit
  closes the item or a rollback or an expiry undoes the burn (see
  [Salvaging a minted item](#salvaging-a-minted-item)). Otherwise nobody has the item. An index
  started with another policy, or from a slot after an item's mint, holds
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
`CHAIN_SERVER_KEY_FILE`, `CHAIN_PROVIDER_URL` and `CHAIN_K_FINAL`, besides `CARDANO_NETWORK`; and
`CHAIN_PROVIDER_KEY` with `CHAIN_PROVIDER_KIND=blockfrost`: with Koios, the default kind, the key is
an optional bearer token), the chain features are off. A `CHAIN_PROVIDER_KIND` other than `koios`
or `blockfrost` (in any case) stops the start, and so does a URL of the other kind: a Blockfrost URL
(`blockfrost.io`) needs `blockfrost`, so a server whose `.env` still has its Blockfrost settings and
no kind is stopped rather than switched to Koios. The start logs the provider's kind and host. With `CARDANO_NETWORK` set, the start logs which of them are
missing; without it, the start says nothing about them. There is no provider, no
index and no watcher, and no item can be minted. On a server that never had them, the stats
carry no stamps and no notices and the wallets hold no items, and the game works as before.
Items minted before the configuration was removed keep their mark and stay with the player the
last sync gave them to: without a watcher, nothing moves any more, whatever happens on the chain.

## Minting

A player turns a crafted item into a CIP-68 token pair ("Prägen" in German): the reference token
with the item's datum goes to the items contract, the user token to the player's wallet. The
server builds the transaction from the player's wallet, the wallet signs and pays in ADA, the
server signs last and submits, and the watcher follows the transaction until it is final. Nothing
in the game is spent: while a mint runs the item is only locked (no salvage, no second mint), and
it stays usable in matches. The contracts and the transaction builder are plan B's
([contracts/README.md](../contracts/README.md), `apps/api/src/chain/tx.js`); how the server reads
the chain is the section above. Salvaging a minted item (burning its token, and the credit of its
ingredients) has a section of its own ([Salvaging a minted item](#salvaging-a-minted-item)).

### The operation

Each mint is one row of `chain_ops` (migration `014_chain_ops.js`), and so is each burn of the
game (see [Salvaging a minted item](#salvaging-a-minted-item)), moved through its states by
`apps/api/src/chain/ops.js` only:

```text
prepared ──signature──▶ submitted ──in a block──▶ included ──K_FINAL deep──▶ final
   │                       ▲    │                     │
   │                       │    └─ past its ttl, not on the chain,
   │                       │      K_FINAL blocks later ──▶ expired ('expired' or 'rejected')
   │                       └──────── block rolled back ───┘
   ├── cancel, its wallet unlinked, or (a burn) its token moved ──▶ cancelled
   └── sign window over ──▶ expired ('not-signed')
```

| State | What it means | Who moves it there |
| --- | --- | --- |
| `prepared` | built, the item and the player locked, waiting for the wallet within the sign window (`SIGN_WINDOW_MS`, 10 minutes) | `POST /chain/mint`; a rebuild from the wallet's addresses keeps it prepared |
| `submitted` | the wallet's signature checked, the server's added, sent to the network | `POST /chain/sign/:code`; the watcher, when the block it was in is rolled back |
| `included` | in a block: the item is a minted item (its asset name, `minted_at` and holder are set) | the watcher |
| `final` | its block is `CHAIN_K_FINAL` deep | the watcher |
| `cancelled` | the player cancelled before signing (`cancelled`), the wallet was unlinked before signing (`wallet-unlinked`), or a burn's token left the UTxO it spends before the signature (`token-moved`) | `DELETE /chain/operations/:id`; the sign routes |
| `expired` | not signed in time (`not-signed`), or signed and provably unable to land (`expired`; `rejected` when the network refused it and took no later submit) | any read of a lapsed prepared one; the watcher for a submitted one |

Every move is one compare-and-set (`UPDATE … WHERE id = $1 AND state = <from> RETURNING *`): of
two callers that race (two tabs, the watcher, a cancel against a signature) exactly one wins, so a
move's effects happen once. `prepared`, `submitted` and `included` are open: a player and an item
have at most one open operation (checked before the insert, and on Postgres also by two partial
unique indexes), so a player's next mint waits until the last one is final. A rollback makes the
item the minter's plain item again and withdraws its unseen notices. An item whose mint ended
without landing can be salvaged (plain salvage deletes its ended operations first); one with an
open operation answers 409 `ITEM BUSY` (`apps/api/src/lab/salvage.js`). The stats show an
item with an open mint as `minted: { state: 'minting', operationId, signing }`.

An ended operation (`final`, `cancelled`, `expired`) is deleted 90 days after its `ended_at`
(`ops.cleanupEnded`, `ENDED_KEEP_MS`), by the server's hourly cleanup (`apps/api/src/cleanup.js`,
beside the notices' `cleanupNotices`); an open one is never deleted, however old. Nothing reads an
ended operation that late: the day's mints count today's, and the game follows open operations
only. With the chain features off the table is empty and the cleanup deletes nothing.

### Three signatures, in this order

1. **The wallet** signs the unsigned transaction as a partial signature (CIP-30
   `signTx(tx, true)`). The server checks the witness set against the transaction it stored: the
   body unchanged, every wallet key the transaction requires signed (`tx.verifyWitness`).
2. **The server** checks that the on-chain config lists its key and adds its own witness
   (`tx.addServerWitness`). The items contract requires that signature, so a transaction the
   server has not signed can never land: a cancel or a lapsed sign window needs no look at the
   chain.
3. **The compare-and-set** from `prepared` to `submitted` (within the window, for the very
   transaction that was signed). Only the request that wins it hands the transaction to the
   provider. A failed submit is noted on the row and the watcher sends it again.

The server key is loaded once at the start (`CHAIN_SERVER_KEY_FILE`, `apps/api/src/chain/keys.js`)
and passed on as it is, never copied or logged. The co-signed transaction is stored for the watcher
and is in no answer and no log line.

### The routes

`apps/api/src/routes/chain.js`; the error codes and their statuses are `CHAIN_STATUS` in
`apps/api/src/errors.js`. With the chain features off, `GET /chain/readiness` answers
`{ enabled: false }` and every other path under `/chain/` is 404 `CHAIN OFF`.

- `GET /chain/status` → `{ enabled }`: no session, touches nothing; the game asks it once a session.
- `GET /chain/readiness?itemId=…`: the checklist before any wallet opens: verified online matches
  (10 needed), mints left today, the player's wallets with the ADA the build can spend, whether
  each is enough, the hop wait, the fee options, the estimate, the pause and the open operation
  (`apps/api/src/chain/readiness.js`).
- `POST /chain/mint { itemId, subject, fee, addresses? }` → 201 `{ operation, tx, signCode, costs }`:
  every check in a fixed order (the chain, the item, the player, the wallet, the config, the
  funds and the build), then the prepared operation and a sign code, shown this once.
- `GET /chain/operations/:id`: the player's operation as it stands; `DELETE` cancels a prepared one.
- `GET /chain/sign/:code` (no session): what the wallet signs: the item, the costs, the unsigned
  transaction, the address the token goes to, the sign window.
- `POST /chain/sign/:code/addresses { addresses, proof? }` (no session): the address proof and the
  rebuild (below).
- `POST /chain/sign/:code { witness }` (no session): the signature, then the three steps above.

### Whose address the token goes to

A wallet is linked by its stake key (`stake:<hash>`), and the provider lists every address with
that stake key, whatever its payment key. Anyone can build an address from their own payment key
and a player's stake key and park ADA there; if the server chose the owner address from that list,
it could build the player's mint for a stranger's address. So the address must be vouched for by
the player's own wallet. `POST /chain/mint` with `addresses` (the wallet's CIP-30 addresses, at most
100) comes with the player's session: the build uses only those of them that carry the subject's
key, and the operation is `owner_confirmed`. Without addresses the server picks by plan B's rule
and the operation is not confirmed; `POST /chain/sign/:code` then answers 409 `ADDRESSES NEEDED`
and signs nothing.

Two consequences of the stake-key listing stay as they are, known and accepted for now:
- The phone path's prepare (`POST /chain/mint` without `addresses`) builds from every UTxO under
  the stake key, an outsider's parked one included. A parked UTxO with many tokens, or one that
  makes the build too large, can make that prepare itself fail (`WALLET TOO FULL` or the like), so
  that a phone player never reaches the address proof. The extension path (with `addresses`) is
  unaffected.
- Readiness counts an outsider's ADA under the stake key as the player's: the checklist may say
  "enough ADA" for a wallet whose own addresses hold less. The build from the wallet's own
  addresses then answers `NOT ENOUGH ADA`, with the true figures.

Without a session (the sign page) the wallet proves its list: `POST /chain/sign/:code/addresses`
with `{ addresses }` changes nothing and answers `{ payload }`, a text the subject's key must sign
with CIP-30 `signData`; with `{ addresses, proof }` the server checks the signature (400
`INVALID SIGNATURE` otherwise), rebuilds the transaction from those addresses and marks it
confirmed. The text is defined once, in `packages/shared/cardano/message.js`
(`addressProofMessage`, parsed by `addressProofOf`): its own first line (never a sign-in's, and the
sign-in refuses it), the domain, the network, the item and serial, the operation, the subject's
address, the number and SHA-256 digest of exactly that list, and the window's end. The game parses
it and refuses to ask the wallet unless it is this text for this operation and this list.

### The sign page

A phone wallet signs in its own browser, which shares nothing with the game. The minting dialog
opens `/sign/?code=<sign code>` there through a CIP-158 deep link; the page (`sign/index.html`,
`apps/pwa/src/sign/main.js`, no React) shows the item and the costs, lets the injected wallet sign
through `signPrepared`, posts the signature, and the game polls the operation and carries on by
itself. When the operation is not confirmed for one of the wallet's addresses, the wallet is asked
twice: first to vouch for its addresses, then to sign the mint; the page says so first.

What a sign code alone can do: read the prepared mint, ask for the proof text, and, with the
subject key's signature over that text, rebuild the mint from the wallet's own addresses, or, with
the wallet's signature, submit it. It cannot cancel (that needs the session), cannot choose the
owner address without the subject's signature, and cannot sign for the player. Only its SHA-256
is stored (`chain_ops.code_hash`); it is used up at the submit, and a code whose wallet was
unlinked meanwhile cancels its operation.

### The watcher's operations step

`apps/api/src/chain/operationsStep.js` runs before the ownership sync, at most 200 open operations
a run, oldest first:

- a **prepared** one past its sign window expires (`not-signed`), also on a stale index;
- everything else is decided only on a fresh index. A **submitted** one that the index has in a
  block becomes `included` (and `final` at once if that block is deep enough); one that is not in
  the index while the tip is before its ttl (exclusive, as the ledger reads it) is sent again at
  most once a minute;
- once the tip is at or past the ttl, the first such tip is noted (`ttl_passed_block`); `K_FINAL`
  blocks later the operation expires, since only a rollback deeper than that could bring back a
  block from before the ttl. A rollback that puts the tip before the ttl again clears the note.
  The expiry frees the item (a second mint would make a second token for it), so the index alone
  never decides it: the provider is first asked for the user token (`utxoByUnit`, once a run for
  each operation due), and only "nobody holds it" expires the operation. A provider that cannot
  answer leaves it for the next run. A token the provider sees and the index does not means the
  index misses mints: the operation stays `submitted` (the item `minting`) and the watcher logs
  once, as an error, "the index does not have a mint the provider sees: check the index's filters".
  The operator then fixes the index, never the operation: the filters in
  `deploy/chain/application-plugins.yml`, or a sync again from before the mint's block; once the
  index has the transaction, the next run includes it (and makes it final when it is deep enough);
- an **included** one whose block is `K_FINAL` deep becomes `final`; one the index no longer has in
  that block was rolled back: it is `submitted` again (the item plain again) and judged as such, so
  a re-inclusion in another block counts its depth from there.

The provider's failures are told apart. `rejected` (it refused the transaction: a 400 on submit, a
failing script) marks the operation, and an expiry then says `rejected`; an accepted submit later
clears that. `busy`, `unauthorized` and `unavailable` (5xx, no answer, an unreadable answer, a 413
for a request over the provider's size limit) say nothing about the transaction: they are noted for
diagnosis, change nothing, and stop further resubmits in that run.

### What it costs

- **The network fee**, paid to the network.
- **The battlechoc fee**, from the on-chain config (`readConfig`): its fee options, each with an
  amount per tier (COMMON, RARE, EPIC; 1, 2 and 4 ADA on preprod) and receivers (the treasury).
  `fee` in the mint is the option's index in the config; two payable options make the cost screen
  offer a choice, none means no fee. A receiver's share below the minimum an output must hold is
  raised to it, and the operation stores what the transaction pays.
- **The deposit**: the ADA the two token outputs must hold. It stays with the item: the user
  token's travels with the token, and the reference output's comes back when the item is burned.
  A built operation answers it whole (`costs.deposit`) and in its two parts (`costs.deposits:
  { reference, user }`, lovelace as Numbers like the other cost fields): the user token's ADA goes
  to the player's own address, so a wallet, which shows the net change of its balance, counts only
  the network fee, the battlechoc fee and `deposits.reference` as leaving it (ruling D38).

Before "Mint now" the game shows plan B's measured estimates (`packages/shared/chain.js`, "about");
after it the prepared operation's exact amounts. Readiness's `needed` is plan B's `fundsCheck`
(fees, deposit, change, at least the collateral); a wallet that has the ADA but no output usable as
collateral gets 400 `NO COLLATERAL`, one with too many tokens for one transaction `WALLET TOO FULL`.

### Limits

From `apps/api/src/app.js` (`CHAIN_LIMITS`), per minute: 120 requests per address in front of the
routes with a session, then 30 per player for all of them together, and 5 mints and 5 burns per
player on top;
30 per address for the sign routes; 60 per address for `GET /chain/status`; 5 rebuilds per address
and operation, so a stranger with the code cannot use up the player's. Per player: 3 mints per UTC
day (`MINTS_PER_DAY`; a mint counts once submitted, unless it expired) and 10 verified online
matches before the first. A cancel (`DELETE /chain/operations/:id`) has a bucket of its own, 10 per
player, so polling in two tabs cannot starve it. Readiness asks the provider for at most 8 of a
player's wallets, 3 at a time, within 8 seconds, and keeps each wallet's answer for 20 seconds
(`readiness.js` `createUtxoCache`: by subject, which is public chain data; a failure is not kept;
the mint and the rebuild always read afresh and drop that wallet's copy), so a player who asks
again and again cannot spend the provider's quota, which is every player's. The per-address limits read the client's address from one
`X-Forwarded-For` hop, so the API must sit behind exactly one reverse proxy.

### The provider

Koios by default, a Blockfrost-compatible API with `CHAIN_PROVIDER_KIND=blockfrost`
(`apps/api/src/chain/providerKinds.js`). A URL on `blockfrost.io` needs the kind `blockfrost`, a
URL on `koios.rest` the kind `koios`; another host is taken as the kind says. Both adapters answer
the same objects and the same `ProviderError` codes (`koiosProvider.js`, `provider.js`,
`providerCommon.js`). Koios's public tier needs no key but limits a request's body to 1 kB, and a
mint transaction is 2 to 3 kB; whether its `/submittx` enforces that limit is untried. So a free
Koios token in `CHAIN_PROVIDER_KEY` is the recommended setting, and the start logs one warning
without it ("minting may be refused for size: set CHAIN_PROVIDER_KEY"). A request the provider
refuses for its size (413) is `unavailable`, and the log names the limit (deployment:
[deploy/README.md](../deploy/README.md)).

### In the game

- **The flow** is a pure reducer, `apps/pwa/src/ui/mint/mintFlow.js`: the steps explain, check,
  costs, wallet ("your wallet opens now"), sign, minting, done, nothing happened and failed; the
  dialog (`MintDialog.jsx`, with `MintChecklist`, `MintCosts`, `MintConnect`) sends the requests
  the state asks for and reports each answer as an event. Every text is a translation key.
- **Signing** (`apps/pwa/src/cardano/signTx.js`): the wallet's network and account are checked
  before it is asked; in the extension path the game sends the wallet's addresses with "Mint
  now" (one wallet prompt); `signPrepared` is the sign page's whole signature, the proof included.
  The client does not inspect the transaction it hands to the wallet: the wallet's own prompt and
  the server's `verifyWitness` (the witness over exactly the stored body) are the check.
- **Following an operation** (`operationPoll.js`): one poller per operation, every 5 seconds at
  most, none while the page is hidden. The dialog follows the operation it shows; otherwise
  `MintWatch` (in the Hud) loads `MintWatcher`, which follows the stats' minting items and an
  included one every 30 seconds until it is final, so a rollback shows.
- **Whether minting shows** (`useChainEnabled.js`): a build with a network, not the Android app,
  online, and `GET /chain/status` on (asked once a session, again when the device comes back
  online). The Android app shows nothing of minting; minted items stay usable there.
- **The sign page** is built with the link page after the game (`vite.link.config.js`), so it is
  never in the game's precache. The minting dialog, the flow and the wallet code load when the
  dialog opens; the first load gets only the light checks.

**Browser tests.** The browser tests' API (`apps/api/test/e2eServer.js`) mints for real: plan B's
fixture deployment sits on the chain double, a fresh server key is written for each run, and the
fake wallet (`apps/pwa/test/helpers/wallet.js`) signs transactions and address proofs in the test
process. Its test routes also credit verified matches (`/test/matches`), change the on-chain
config and reset the chain between tests (`/test/chain/config`, `/test/chain/reset`).

### The item page, the pictures and the guide

Every token's datum names two addresses on battlechoc.com for good (`packages/shared/chain.js`
`itemImageUrl`, `itemPageUrl`): its picture and its page. Neither shows who holds the item.

- **`GET /items/:assetName`** (`apps/api/src/routes/items.js`, no session, 60 requests per address
  and minute): the public data of a minted item by the hex name of its user token, from the
  database and the shared `Items` alone: `{ assetName, item, entityType, tier, points, serial,
  mintedAt, burnedAt, effects }`, the effects of today's balance. It answers whether the chain
  features are on or off (a token's page must not vanish while they are off) and never asks the
  provider, the index or the config. Every name that is not a minted item's (unknown, malformed,
  still minting, a key that is not an own entry of `Items`) answers the same 404 `UNKNOWN ITEM`;
  the last case is only a safety net, because an item key is never renamed or removed once it may
  have been minted (retire an item by its recipe, never its key). A found item is
  `Cache-Control: public, max-age=60`, everything else `no-store`. It gives nothing of the player,
  the crafter, the holder columns or the operations.
- **The item page** `/item/?a=<asset name>` (`item/index.html`, `apps/pwa/src/itempage/`: `main.js`
  builds the page with `textContent`, `view.js` decides which `a` it asks for and which answers it
  trusts): the item's icon with the stamp, its name, serial, tier, building and today's effects,
  the minting date, whether it was salvaged, and how to use it. It is a third input of
  `vite.link.config.js` beside the link and sign pages, never precached (`NOT_PRECACHED`), and asks
  no host but its own and the API.
- **The pictures** `apps/pwa/public/items/<kebab key>.png`, one 512 × 512 PNG per item type: the
  game's plain item icon, drawn by headless Chromium from the same look the shelf uses
  (`npm run items:pictures -w apps/pwa`, `apps/pwa/scripts/item-pictures.mjs`, which never deletes
  a picture: a token names its picture's URL for good). The game never shows them; the service
  worker neither precaches nor caches them. `LICENSE-ASSETS` covers the folder.
- **The guide** `/guide/` (`apps/pwa/public/guide/index.html`, a static page in German and English,
  no scripts): what a wallet is, which wallet apps, how to get ADA, what minting costs, selling,
  salvaging a minted item. The game links its sections only through `apps/pwa/src/cardano/guide.js`
  `guideLink(section, language)` (`/guide/#<section>-de` for German, `-en` otherwise): the minting
  checklist, the profile's wallet row and the Info dialog, each only where minting shows.
  `apps/pwa/scripts/check-bundle.mjs` fails a build whose item page is missing or whose precache
  holds the item page or the pictures.

## Salvaging a minted item

A minted item is salvaged by burning its token pair: the user token from the player's wallet and
the reference token with the store that holds it at the items contract (the policy burns only
whole pairs). The wallet gets the store's ADA back (`deposits.reference`) and keeps the ADA that
travelled with the user token; the burn pays the network fee and no battlechoc fee. The
ingredients come back in the game once the burn is final: rare and legendary ones in full, the
others as for a plain item (half, rounded down), fresh, by the recipe table as it is at the credit
(`salvageReturns(amounts, { minted: true })`, `packages/shared/salvage.js`). Plain salvage of a
minted item stays 409 `ITEM MINTED`.

The holder can also burn the pair alone, outside the game, with any wallet: the items contract
lets the holder burn without the server. The server credits such a burn the same way, since the
credit is keyed by the burn on the chain, never by an operation of the game.

### The burn

`POST /chain/burn { itemId, subject, addresses? }` (with a session; `addresses` as for a mint) →
201 `{ operation, tx, signCode, costs, returns }`: the prepared operation of kind `burn`
(`ops.view`), the unsigned transaction (plan B's `buildBurn`), the sign code, shown this once,
`costs` with `gameFee: null` and `deposits: { reference, user }`, and `returns`, what comes back by
today's recipe table. The checks run in this order, and the first that fails answers:

1. the chain: 503 `CHAIN UNAVAILABLE` for a stale index, an unreadable config or a server key the
   config does not list; a paused config does not stop a burn;
2. the item: 400 `NOT YOUR ITEM` for an unknown item, one that is not the player's by the
   ownership sync, or one burned already; 409 `ITEM BUSY` for any open operation of the item, a
   mint or a burn; 409 `NOT MINTED` for an item whose mint is not in a block;
3. its recipe: 400 `NO RECIPE`. The game prepares no burn that would give nothing back (a burn
   outside the game is still credited, with nothing);
4. the player: 409 `OPERATION RUNNING` while an operation of another item is open;
5. the wallet that holds the token as the sync last saw it: linked to this player now (400
   `NOT YOUR WALLET`), past its hop wait (409 `WALLET WAITING`), and the request's `subject`
   (otherwise 400 `NOT YOUR WALLET` with `holder`, the player's wallet to use); `addresses` none of
   which carries the subject's key: 400 `NOT YOUR WALLET`;
6. the funds and the build: when the addresses hold no UTxO with the token, 409 `ITEM MOVED` if
   the provider sees it at an address of the subject's key all the same (an address the wallet
   did not name, or a base address of a `pay:` subject's payment key, which the game never builds
   from), else 409 `ITEM LEFT WALLET` (the same check as at the rebuild, one provider call on this
   failure path only); 400 `NOT ENOUGH ADA` (with `missing` and `needed`), `NO COLLATERAL`,
   `WALLET TOO FULL`.

The operation stores the holder as its `subject`, no fee option and no battlechoc fee (migration
`015_salvage_credits.js` made `chain_ops.fee_option` nullable for this), `deposit` as both
outputs' ADA and `deposit_user` as the user token's. **Where the burn's outputs go** (the row's
`owner_address`, the sign info's `address`): the store's ADA, the token's own ADA and the change
always go to the address of the UTxO that holds the user token, on every path (with or without
`addresses`, before and after a rebuild), never to another address under the player's stake key.
That address's payment key signs the burn anyway, since its UTxO is spent.

### Signing a burn

A burn is signed through the same sign routes as a mint, with the same three signatures in the
same order: the game's burn names the server key as a required signer, and the server signs last.
An operation no wallet vouched for answers 409 `ADDRESSES NEEDED`, as for a mint. One more check
comes before the server's signature: the provider must still see the user token in the UTxO the
burn spends. If it does not, the operation is cancelled with the error `token-moved` and nothing
is signed; the answer is 409 `ITEM MOVED` when an address of the operation's subject holds the
token now (the wallet moved it among its own UTxOs: prepare again), else 409 `ITEM LEFT WALLET`
(another wallet holds it, or nobody). A provider that cannot say answers `CHAIN UNAVAILABLE` and
leaves the operation prepared.

The phone path works as for a mint, with a proof text of its own (`addressProofMessage` with
`purpose: 'burn'` in `packages/shared/cardano/message.js`): its first line says it is "for
salvaging an item (this is not a sign-in and not a minting)", and it carries
`Action: burn-addresses`. The purpose is the operation's kind, never the request's;
`readAddressProof` reads exactly one purpose's text, so a mint's proof never passes for a burn nor
the other way round, and the sign-in refuses both. The rebuild builds the burn again from the
proved addresses alone. A token none of them holds is `ITEM MOVED` when an address of the subject
holds it (that address must be in the list), else `ITEM LEFT WALLET`; at the rebuild both leave the
operation prepared. A burn's `GET /chain/sign/:code` adds `returns`. A wallet without a stake key
(a `pay:` subject) is listed by the provider at its enterprise address only, so its token at a base
address with the same payment key cannot be burned through the game until it is moved back: the
prepare and the rebuild both answer `ITEM MOVED` for it.

### The burn on the chain

The operations step moves a burn as it moves a mint (included, final, rolled back, sent again),
but writes no item row: the item's state is derived (below), and the credit is a step of its own
(`markFinal` of a burn only ends the operation). The safe expiry is the mirror of a mint's:
`CHAIN_K_FINAL` blocks past the ttl, a submitted burn expires (`expired`, or `rejected`) when the
provider still sees the user token. When it does not, the index's burns of the token decide:
another transaction's burn at least `CHAIN_K_FINAL` deep ends ours with the error
`burned-elsewhere` (its input is spent for good, and the credit step credits the other burn); a
less deep one, or ours, decides nothing this run; none at all means the index misses ours: the
operation stays submitted, and the watcher logs once "the index does not have a burn the provider
sees".

The errors an ended operation carries (`chain_ops.error`, and `error` in `ops.view`): `cancelled`
(the player), `wallet-unlinked` (the wallet was unlinked before the signature, mints too),
`token-moved` (a burn whose token left the UTxO it spends, found at the signature), `not-signed`,
`expired`, `rejected` and `burned-elsewhere`.

### What the game sees while a burn runs

`GET /user` marks the item (`stats.items[].minted`):

- a burn prepared, nothing signed: `{ assetName, state: 'minted', operationId, signing: true, kind:
  'burn' }`; the item stays usable and can be equipped;
- a burn signed (submitted or included), or a burn of its token that the sync sees
  (`items.burn_tx`, also one made outside the game): `{ assetName, state: 'burning', operationId }`,
  with `operationId` null when no burn operation of the game is open;
- the burn expired, cancelled, or rolled back with no operation open: `{ assetName, state:
  'minted' }` again;
- credited: the item is in no list any more.

A burning item is out of the loadout (`players.isUsable`, `loadoutOf`): a match started from then
on goes without it, and a running match keeps the loadout it started with. `POST /user/equipment`
refuses it with `NOT YOUR ITEM`. Its slot keeps its id, so the item is back in its slot when the
burn is undone, unless the player filled the slot meanwhile. A game burn that was included and
then rolled back is submitted again, so its item stays burning until the burn lands again or
expires. The game offers Salvage for a minted item only where minting shows, never in the
Android app; there a minted item can still be equipped.

### The credit

The watcher's third step, `credit` (`apps/api/src/chain/credit.js`), runs after the ownership
sync, on a fresh index only. It goes through the minted, unburned items page by page, asks the
index for their burns (`burnsOf`, below) and takes each token's first burn. A burn is ready once
it is `CHAIN_K_FINAL` deep (the tip's block number minus the burn's). For a ready burn:

- **Who gets it.** The holder is the address of the output the burn spent. A script address holds
  nothing; otherwise its stake key, else its payment key, decides by plan C's rule: the player
  linked to that key **when the credit is made**, not when the burn was. A key linked to nobody
  (never linked, or unlinked between the burn and the credit) closes the item for nobody. A key
  whose hop wait for its player is not over makes the credit wait: nothing is written and the
  provider is not asked; the credit goes to that player once the wait is over.
- **The provider first.** The server never credits on its index alone: before every credit or
  close it asks the provider for the user token (`utxoByUnit`). Nobody holds it: the credit. A
  holder: no credit, and a lasting error line "the index shows burns of tokens the provider still
  sees: no credit until it does not; check the index". No answer: nothing this run, and the run
  asks no more.
- **Exactly once**, in one transaction per item: the item's row is locked (`SELECT … FOR UPDATE`,
  only while `burned_at` is null) and closed by a guarded update (`burned_at`, `burn_tx`,
  `player_id` the player credited or null, the holder columns cleared); a row goes into
  `salvage_credits`, whose primary key is the burn and the token, with a unique index on the token
  (once, ever); the item leaves the slots, the ingredients go into the pantry as new batches, and
  the notices are written. A second process waits for the lock and then finds the item closed. A
  failure anywhere rolls all of it back; the next run tries again (a lasting error line while it
  fails).
- **The notices.** The player credited gets a `salvaged` notice (in `GET /user`:
  `{ id, kind: 'salvaged', item, building, at, returned }`, `building` the slot it was in). The
  player whose item it was until then (the sync leaves a burning item with its player) gets a
  `departed` notice in the same transaction when they are not the one credited: a token moved to
  another player and burned there, or a key unlinked before the credit. Nobody gets both.
- **Burns outside the game** are credited the same way: the step reads no `chain_ops`.

Before `CHAIN_K_FINAL` nothing irreversible is written: `items.burn_tx` is the sync's derived
state, so a rollback, or the same burn landing again in another block, only moves the depth the
credit waits for.

**The data** (migration `015_salvage_credits.js`). `salvage_credits` holds one row per credited
burn: `tx_hash` and `asset_name` (the burn on the chain), `player_id` (null for nobody),
`returned` (the ingredients; `{}` without a recipe, null for nobody) and `credited_at`. It stores
no wallet key: who held the token is on the chain, from `tx_hash`. `items.burn_tx` is the burn
that holds the item: the ownership sync writes and clears it at any depth until the credit closes
the item, and the credit keeps it. A closed item's row keeps its asset name, `minted_at`,
`burned_at`, `burn_tx` and the player credited, and is in no player's lists.

**The index.** `chainIndex.burnsOf(assetNames)` (at most 500 names a call) reads the view
`chain.item_burns` (`views.sql`): a BURN row of `item_events` joined with Yaci Store's `tx_input`
(the burn's spend) and `item_outputs` (the spent output that held the token). It answers one entry
per burn and user token, by block: `{ assetName, txHash, block, holder: { stake, payment,
script } }`, the holder's keys read from the address as `addresses.keysOfAddress` reads them. A
burn whose spent output the index does not hold has no entry, so it is not credited; the ownership
sync then logs a lasting warning ("the chain index knows burns of tokens but not the outputs they
spent, so they cannot be credited") and judges the item by plan C's rule, nobody has it, unless a
submitted or included burn operation of the game holds it. The operations step reads `burnsOf`
too, for `burned-elsewhere`.

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
