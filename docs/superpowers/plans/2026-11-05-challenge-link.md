# Challenge Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player sends a link (or a code), a friend opens it, newcomer or not, and both are in a friendly 10×10 match within seconds. This replaces invite-by-name, the friends list and the random-opponent button.

**Architecture:**

- The live server's `Lobby` keeps challenges in memory beside the queue and invites. Its new match kind `challenge` is 10×10, unrated, with 45 s placement.
- An Express route renders the preview page for `play.battlechoc.com/<code>`.
- The PWA gets two dialogs: the challenger's `ChallengeDialog` and the friend's `ChallengeCard`. A match-kind flag unlocks every building in the build palette for the match.
- A shared `aiSetupScore` keeps players on the beginner AI track until their own online unlock.

**Tech Stack:**

- Node 22, Express 5, `ws`, `pg` (pg-mem in tests), Jest.
- React 19, Redux Toolkit 2, react-jss, Vite 8, Playwright, `node --test`.
- Shared CommonJS package with 4-space indentation.

**Spec:** `docs/superpowers/specs/2026-11-04-challenge-link-design.md`

## Global Constraints

- Branch: `feat/challenge-link` (from `origin/main`). When done, also merge it into local `dev` with `git merge --no-ff`. Never push.
- Commits:
  - author `Fabian Bormann <bormann.fabian@gmail.com>` (`git -c user.name="Fabian Bormann" -c user.email="bormann.fabian@gmail.com" commit …`);
  - conventional messages;
  - no `Co-Authored-By` or other trailers.
- UI text only through `translate(translationKeys.X)` (`t(tr.X)`), with every key in all 8 files of `packages/shared/translations/`.
  - A text with `{{placeholder}}` needs a predicate in `packages/shared/index.js` (`translationPredicates`, with `fmt`).
  - No em dashes in any text.
  - Text about a player is gender-neutral ("they", or the name again).
- Style:
  - Prettier 2 with `trailingComma: "es5"` in the PWA (`.jsx` for React files);
  - the shared package and the API use CommonJS and 4-space indentation.
- Never open tabs in the user's browser: dev and preview servers run with the env `BROWSER=none`.
- Run targeted tests, not the full e2e suite (the Mac gets hot). The commands:
  - `npm test` (shared);
  - `npm run test:api`;
  - `npm run test:unit`;
  - `cd apps/pwa && npx playwright test test/<file>.spec.js`. Rebuild `build-e2e` with `npx vite build --mode e2e --outDir build-e2e` after app changes.
- Every timing comes from `LiveDefaults` in `packages/shared/live/protocol.js`:

  | Key                      | Value  |
  | ------------------------ | ------ |
  | `challengeTtlMs`         | 120000 |
  | `challengeReadCapMs`     | 600000 |
  | `challengeReaderGraceMs` | 60000  |
  | `challengeAwayMs`        | 60000  |
  | `challengeKeepMs`        | 600000 |

- A challenge match:
  - `kind: 'challenge'`, board `{ rows: 10, cols: 10 }`;
  - `placementTimeoutMs` 45000, `fieldChoiceTimeoutMs` unchanged (10000), field chooser by coin toss (the engine default for two humans);
  - not rated; XP and drops as usual.

## Review Focus

1. **A friend taps Accept twice** (double tap, or a resend after a reconnect). Exactly one match starts; the second accept is ignored. Test: Task 4.
2. **The server restarts while a challenge waits.** The challenger's dialog must not wait forever: the welcome reports no challenge, and the dialog shows "This challenge has ended" with Send again, which creates a new one. Test: Task 8 (reducer unit test).
3. **The friend's device can't reach the API.** The card says "The battle server can't be reached right now" with Back after 10 s, not an endless "Loading the challenge…". Test: Task 11 (e2e with a dead API port).
4. **A code typed as `k7q2 m9xd`, `K7Q2M9XD`, or with O for 0 or I/L for 1** opens the same challenge. Test: Task 1.
5. **The challenger taps Start while the challenge waits.** The challenge is cancelled, and everyone with the card open sees "ended" instead of accepting into nothing. Test: Task 4.

---

### Task 1: Challenge codes and protocol (shared)

**Files:**

- Create: `packages/shared/live/challengeCode.js`
- Modify: `packages/shared/live/protocol.js` (header comment, `ClientMessage`, `ServerMessage`, `LiveDefaults`, new enums)
- Modify: `packages/shared/index.js:587` (export via `live`)
- Test: `packages/shared/tests/live/challengeCode.test.js`

**Interfaces:**

- Produces in `challengeCode.js`:
  - `CODE_ALPHABET`: the Crockford base32 alphabet `'0123456789ABCDEFGHJKMNPQRSTVWXYZ'`.
  - `newChallengeCode(randomInt: (max) => number) → string`: 8 characters from the alphabet, no hyphen.
  - `normalizeChallengeCode(text: unknown) → string | null`: upper-cases; drops spaces and `-`; maps `O→0` and `I`/`L→1`. Returns null unless exactly 8 alphabet characters remain.
  - `formatChallengeCode(code: string) → string`: `'K7Q2M9XD' → 'K7Q2-M9XD'`.
- Produces in `protocol.js`:
  - `ClientMessage`: `CHALLENGE_CREATE: 'challenge.create'`, `CHALLENGE_RENEW: 'challenge.renew'`, `CHALLENGE_CANCEL: 'challenge.cancel'`, `CHALLENGE_OPEN: 'challenge.open'`, `CHALLENGE_ACCEPT: 'challenge.accept'`, `CHALLENGE_DECLINE: 'challenge.decline'`, `REMATCH: 'rematch'`. All except create (`{}`) and rematch (`{ matchId }`) carry `{ code }`.
  - `ServerMessage`:
    - `CHALLENGE: 'challenge'`, payload `{ challenge: { code, state, expiresAt, readers } | null }`, sent to the challenger;
    - `CHALLENGE_VIEW: 'challenge.view'`, payload `{ view: { code, state, from?, name? } }`, sent to the friend.
  - `ChallengeState`: `WAITING 'waiting'`, `READING 'reading'`, `ACCEPTED 'accepted'` (friend accepted, challenger away), `EXPIRED 'expired'`, `DECLINED 'declined'`, `MISSED 'missed'`, `STARTED 'started'`.
  - `ChallengeViewState`: `OPEN 'open'`, `WAITING_FOR_CHALLENGER 'waiting-for-challenger'`, `CHALLENGER_AWAY 'challenger-away'`, `ENDED 'ended'`, `TAKEN 'taken'`, `OWN 'own'`, `BUSY 'busy'`.
  - `LiveError.CHALLENGE_NOT_FOUND`.
  - The five `LiveDefaults` timings from Global Constraints.
  - The welcome payload gains `challenge` (same shape as in `CHALLENGE`).
  - Everything is exported through `live` in `index.js`, along with the three code functions.
- Removes: `ClientMessage.INVITE` and `ClientMessage.PRESENCE_QUERY`, and `ServerMessage.PRESENCE_LIST` (Task 6 removes their handlers). `invite.accept/decline/cancel` and the `INVITE*` server messages stay; rematch uses them.

- [ ] **Step 1: Write the failing tests** in `packages/shared/tests/live/challengeCode.test.js`:
  - `newChallengeCode` returns 8 characters, all in `CODE_ALPHABET`, for a `randomInt` that cycles 0..31;
  - `normalizeChallengeCode`:
    - `'k7q2 m9xd'`, `'K7Q2-M9XD'` and `'K7Q2M9XD'` all give `'K7Q2M9XD'`;
    - `'O1IL-AAAA'` gives `'0111AAAA'`;
    - `'K7Q2-M9X'`, `'K7Q2-M9XDU'` (U is not in the alphabet), `''`, `null` and `42` give null;
  - `formatChallengeCode('K7Q2M9XD')` is `'K7Q2-M9XD'`;
  - `live.ChallengeState.WAITING === 'waiting'` and `live.LiveDefaults.challengeTtlMs === 120000`.
- [ ] **Step 2: Run** `npm test -- challengeCode`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `challengeCode.js` and the `protocol.js` additions above, and update the protocol header comment to list the new messages.
- [ ] **Step 4: Run** `npm test`. Expected: all shared tests PASS.
- [ ] **Step 5: Commit** with `feat(shared): challenge codes and live protocol messages`.

### Task 2: Challenge match setup and the beginner AI track (shared)

**Files:**

- Modify: `packages/shared/engine/setup.js` (new constants and function, exports)
- Modify: `packages/shared/progression.js` (new `aiSetupScore`, exports) and `packages/shared/index.js:193` (export)
- Test: `packages/shared/tests/engine/setup.test.js` (create it if missing; check `packages/shared/tests/engine/` first), `packages/shared/tests/progression.test.js`

**Interfaces:**

- Produces:
  - `engine.CHALLENGE_BOARD_SIZE = { rows: 10, cols: 10 }`;
  - `engine.CHALLENGE_PLACEMENT_MS = 45000`;
  - `engine.challengeMatchSetup({ balance } = {}) → { boardSize, balance }`: a deep copy of the base balance (default `DefaultBalance`) with `match.placementTimeoutMs = 45000`. Export it the same way `aiMatchSetup` is reachable from `engine`.
  - `aiSetupScore(stats, { early = false } = {}) → number`: `stats.score` (XP) once `unlocks(stats, { early }).online`; before that, `max(0, score − (stats.challengeXp || 0))`. Exported from the package root, like `unlocks`.

- [ ] **Step 1: Write the failing tests:**
  - `challengeMatchSetup().boardSize` equals `{ rows: 10, cols: 10 }`;
  - `.balance.match.placementTimeoutMs === 45000` and `.balance.match.fieldChoiceTimeoutMs === 10000`;
  - `DefaultBalance.match.placementTimeoutMs` stays 20000 (no mutation);
  - `aiSetupScore({ score: 900, challengeXp: 800, winnings: 1, losses: 1 })` is 100;
  - the same stats with 4 finished games give 900;
  - `{ score: 900, challengeXp: 800 }` with `{ early: true }` gives 900;
  - a missing `challengeXp` gives `score`;
  - `aiMatchSetup(aiSetupScore({ score: 600, challengeXp: 600 }))` uses the prepared first game (`scenario` defined, 6×6, Tom Toffee).
- [ ] **Step 2: Run** `npm test -- setup progression`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions in the files above.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(shared): challenge match setup and the beginner AI track`.

### Task 3: Server: challenge matches, challenge XP, beginner track

**Files:**

- Create: `apps/api/src/migrations/005_challenge_xp.sql` with `ALTER TABLE players ADD COLUMN challenge_xp INTEGER NOT NULL DEFAULT 0;` and a one-line comment.
- Modify:
  - `apps/api/src/rewards.js` (`creditVerifiedMatch`);
  - `apps/api/src/players.js` (`stats` returns `challengeXp`);
  - `apps/api/src/live/lobby.js` (`playerSetup`, `startMatch`, `matchEnded`);
  - `apps/api/src/live/room.js:144-149` (the `match` message carries `kind`).
- Test: `apps/api/test/live.test.js`, `apps/api/test/rewards.test.js`

**Interfaces:**

- Consumes: `engine.challengeMatchSetup`, `aiSetupScore` (Task 2).
- Produces:
  - `creditVerifiedMatch(pool, { …, challenge = false })` also adds the XP to `challenge_xp` when `challenge`;
  - `stats(...)` returns `challengeXp: player.challenge_xp`;
  - the `match` message gets `kind: room.kind`;
  - `Lobby.startMatch('challenge', [setupA, setupB])` builds a match from `challengeMatchSetup()`;
  - `playerSetup` adds `aiScore`, computed with `aiSetupScore({ score: xp, challengeXp, ...results(pool, id) })`. The server cannot know the device's "early" flag. `startMatch` uses `aiScore` instead of `score` for AI matches.
  - Kind `challenge` is never rated.

- [ ] **Step 1: Write the failing tests** in `live.test.js`, using a test helper `challengeMatch(env)` that calls `env.live.lobby.startBetween('challenge', a.account.playerId, b.account.playerId)` for two connected players. Until Task 4 adds the protocol path, the helper calls the lobby directly.
  - `'a challenge match is 10×10, has a coin toss and 45 s placement, and the match message says challenge'`:
    - the room's `match.board` is 10×10;
    - `match.balance.match.placementTimeoutMs === 45000`;
    - `match.fieldChooser` is 0 or 1;
    - both `match` messages carry `kind: 'challenge'`.
  - `'a challenge is not rated but credits XP, challenge XP and a finished match'`: one player surrenders after `toRunning` plus 1000 ms.
    - `rated_matches` stays 0 for both and `rated_matches` has no rows;
    - both players' `xp` and `challenge_xp` are equal and > 0;
    - `GET /user` gives `losses: 1` for the loser and `challengeXp` equal to `xp`.
  - `'below the online unlock, challenge XP does not leave the beginner AI track'`:
    - a player with `xp = 700`, `challenge_xp = 650` and no track records sends `queue.ai`;
    - the match is 6×6 against Tom Toffee with the prepared scenario (as in the existing test "a new player (up to 100 XP)…").
- [ ] **Step 2: Run** `npm run test:api -- -t "challenge|beginner"`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration, the rewards change (`matchEnded` passes `challenge: room.kind === 'challenge'`), the `stats` field, `aiScore`, the challenge branch in `startMatch`, the rating guard (`room.kind !== 'challenge'`) and `kind` in the `match` message.
- [ ] **Step 4: Run** `npm run test:api`. Expected: all PASS.
- [ ] **Step 5: Commit** with `feat(api): challenge matches are 10x10 and unrated, challenge XP keeps the beginner AI track`.

### Task 4: Server: the challenge lifecycle

**Files:**

- Create: `apps/api/src/live/challenges.js`, holding the challenge state machine as a class the `Lobby` owns, so `lobby.js` doesn't grow by 300 lines.
- Modify:
  - `apps/api/src/live/lobby.js` (constructor creates `this.challenges = new Challenges({ lobby: this, clock, config, pool, log })`; `joinQueue`, `playAiNow` and `answerInvite` cancel the player's own challenge first);
  - `apps/api/src/live/index.js` (handlers for the six `challenge.*` messages);
  - `apps/api/src/players.js` (new `assignRandomName(pool, playerId) → string`).
  - `app.js`: `/generaterandomname` and `/user/username` share the candidate loop and the update with `assignRandomName`.
- Test: `apps/api/test/live.test.js` (`describe('live: challenges')`)

**Interfaces:**

- Consumes: the protocol of Task 1; `Lobby.startBetween(kind, a, b)`, `Lobby.busy(id)`, `Lobby.connections`, `Lobby.online(id)`.
- Produces `Challenges`:
  - `create(connection)`: one challenge per challenger. An existing WAITING/READING one is resent, an EXPIRED/DECLINED/MISSED one is renewed. The code comes from `newChallengeCode(crypto.randomInt)` and is retried on collision.
  - `renew(connection, code)`, `cancel(connection, code)`, `open(connection, code)`, `accept(connection, code)`, `decline(connection, code)`.
  - `cancelOwn(playerId)`.
  - `stateFor(playerId) → challenge payload | null`, for the welcome.
  - `publicInfo(code) → { from, language } | null`, only for WAITING/READING (Task 7 uses it).
  - Each change sends `challenge` to the challenger's connection, if connected, and `challenge.view` to the friend concerned.
- Rules from the spec, and where the timer runs:
  - **create:** WAITING, `expiresAt = now + challengeTtlMs`.
  - **open:**
    - a newcomer without a username gets `assignRandomName` first, and the view's `name` is their name;
    - the challenger opening their own code gets OWN;
    - a busy player (`lobby.busy`) gets BUSY;
    - a STARTED challenge gives TAKEN;
    - unknown codes and EXPIRED/DECLINED/MISSED challenges give ENDED;
    - otherwise the player becomes a reader and the state READING. The TTL timer stops, and `readCapAt = now + challengeReadCapMs`; at the cap, the state becomes EXPIRED and every reader gets ENDED.
  - **accept:**
    - from a non-reader, or after STARTED, the player gets TAKEN;
    - a repeat accept by the player who already accepted is ignored;
    - if the challenger is connected: state STARTED, the other readers get TAKEN, then `startBetween('challenge', from, acceptor)`;
    - otherwise: state ACCEPTED, and the acceptor gets WAITING_FOR_CHALLENGER (Task 5 handles the wait).
  - **decline:** the player stops being a reader. With no readers left, the state becomes DECLINED; otherwise nothing changes for the challenger.
  - **cancel / `cancelOwn`:** the challenge is deleted and every reader gets ENDED.
  - **Kept states:** EXPIRED/DECLINED/MISSED stay for `challengeKeepMs`, so Send again (`renew`) works. Then the challenge is deleted.
  - **STARTED:** stays until its match ends (`Lobby.matchEnded` calls `challenges.matchEnded(room.id)`), then it is deleted.

- [ ] **Step 1: Write the failing tests** (ManualClock; `newcomer(env)` is an account without a username):
  - `'create, open and accept start a challenge match; the newcomer gets a random name'`:
    - Anna creates and gets `challenge.state === 'waiting'` and an 8-character `code`;
    - a newcomer opens and gets view `open` with `from: 'Anna'` and a non-empty `name`;
    - Anna gets `reading`;
    - the newcomer accepts, and both get `match` with `kind: 'challenge'`;
    - the newcomer's `GET /user` username equals the view's `name`.
  - `'an unopened challenge expires after 2 minutes and Send again renews the same code'`: advance 120000 → `expired`; renew → `waiting` with the same code and a new `expiresAt`.
  - `'an open card keeps the challenge alive up to 10 minutes'`: open, advance 119000 → still `reading`; advance to 600000 → the challenger gets `expired` and the reader gets `ended`.
  - `'several readers: the first accept wins, the others see taken; a decline does not end it for the others'`:
    - readers B, C, D; C declines and the challenger still sees `reading`;
    - B accepts, and D gets `taken`;
    - a later opener E gets `taken`;
    - B accepting again starts no second match (`env.live.lobby.rooms.size` stays 1).
  - `'the only reader declining tells the challenger'` → `declined`.
  - `'own code, busy friend, unknown and cancelled codes'`:
    - the challenger opens their own code → `own`;
    - a player in a queue match → `busy`;
    - `'ZZZZZZZZ'` → `ended`;
    - after cancel, the reader gets `ended`.
  - `'Start while challenging cancels the challenge'`: the challenger sends `queue.join`, and the open reader gets `ended`.
- [ ] **Step 2: Run** `npm run test:api -- -t "live: challenges"`. Expected: FAIL.
- [ ] **Step 3: Implement** `challenges.js`, the handlers, `cancelOwn` in `joinQueue`/`playAiNow`/`answerInvite`, and `assignRandomName`.
- [ ] **Step 4: Run** `npm run test:api`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(api): challenges in the live lobby`.

### Task 5: Server: away players and reconnects

**Files:**

- Modify:
  - `apps/api/src/live/challenges.js`;
  - `apps/api/src/live/index.js` (`hello`: put `challenge: lobby.challenges.stateFor(playerId)` into the welcome, then call `lobby.challenges.afterWelcome(connection)`);
  - `apps/api/src/live/lobby.js` (`unregister` calls `challenges.readerLeft(connection)`).
- Test: `apps/api/test/live.test.js`

**Interfaces:**

- Produces:
  - `afterWelcome(connection)`: if the player's own challenge is ACCEPTED, it starts the match with the acceptor;
  - `readerLeft(connection)`: starts a `challengeReaderGraceMs` timer for that reader. A new `open` from the same player cancels it. When it fires, the reader is removed; with no readers left, the state goes back to WAITING with a fresh `challengeTtlMs`.
  - **ACCEPTED** starts a `challengeAwayMs` timer. When it fires, the state becomes MISSED and the acceptor gets CHALLENGER_AWAY.
  - **The challenger disconnecting never cancels the challenge.**

- [ ] **Step 1: Write the failing tests:**
  - `'the challenger away: an accept waits, the match starts when they come back'`:
    - the challenger's client closes, and the friend accepts → `waiting-for-challenger`;
    - the challenger reconnects within 60 s → the welcome carries `challenge.state === 'accepted'` and both get `match`.
  - `'the challenger stays away: the friend is told, the challenger sees missed on return'`: advance 60000 → the friend gets `challenger-away`; the challenger reconnects → the welcome has `state: 'missed'`; renew → `waiting`.
  - `'a reader who leaves for a minute frees the challenge again'`: the reader terminates, advance 60000 → the challenger gets `waiting` with a fresh `expiresAt`; a reader who reconnects and re-opens within the grace keeps `reading`.
  - `'the welcome reports a waiting challenge after a reload'`: the challenger reconnects → the welcome has `challenge.state === 'waiting'` and the same code.
- [ ] **Step 2: Run** `npm run test:api -- -t "challenger|reader|welcome"`. Expected: FAIL.
- [ ] **Step 3: Implement** as described above.
- [ ] **Step 4: Run** `npm run test:api`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(api): challenges survive the challenger in WhatsApp and reloads`.

### Task 6: Server: rematch, and invite-by-name, push invites and presence removed

**Files:**

- Modify:
  - `apps/api/src/live/lobby.js`: new `rematch(connection, matchId)`. `answerInvite` starts `invite.kind`. Delete `invite(connection, username)`, `presence`, the push-invite branch and `textFor`, if nothing else uses them.
  - `apps/api/src/live/index.js`: the handlers.
  - `apps/api/src/server.js`: drop `inviteTtlMs` from `liveConfig` only if the tests no longer need it; otherwise keep it.
- Test: `apps/api/test/live.test.js` (replace the test `'invites: live, declined, expired and by push to an offline player'`)

**Interfaces:**

- Produces `rematch(connection, matchId)`:
  - The match must be a room of kind `challenge` that has ended (rooms linger `endedRoomLingerMs`), with the requester as a player. Otherwise: `UNKNOWN_MATCH`.
  - The opponent not connected: `PLAYER_OFFLINE`. Either player busy: `ALREADY_IN_MATCH`.
  - Otherwise it creates an invite `{ id, from, to, kind: 'challenge', expiresAt: now + inviteTtlMs }`:
    - the requester gets `invite.sent { invite: { id, to: name, expiresAt } }`;
    - the opponent gets `invite { invite: { id, from: name, expiresAt, rematch: true } }`.
  - Accept starts `startBetween('challenge', from, to)`; decline, cancel and expiry close it as today.

- [ ] **Step 1: Write the failing test** `'rematch after a challenge: offered, declined, expired, accepted'`:
  - after a finished challenge match, A sends `rematch` and B gets `invite` with `rematch: true`;
  - B declines → A gets `invite.closed` with `declined`;
  - a second rematch expires after 60000 → `expired`;
  - a third is accepted → both get `match` with `kind: 'challenge'` and a 10×10 room;
  - `rematch` for a queue match → `UNKNOWN_MATCH`;
  - B offline → `PLAYER_OFFLINE`.
- [ ] **Step 2: Run** `npm run test:api -- -t rematch`. Expected: FAIL.
- [ ] **Step 3: Implement** `rematch`, and remove the old invite-by-name, push-invite and presence code and their handlers. Keep `push.js` and the `/push/*` routes; they are for later. The friends routes (`/user/friends`, `/user/friend`), the `friends` table and its line in the privacy policy also stay for a follow-up: the app stops calling them in Task 10.
- [ ] **Step 4: Run** `npm run test:api`. Expected: PASS. The old invite test is gone, the rematch test passes, and nothing else changed.
- [ ] **Step 5: Commit** with `feat(api)!: rematch by match id; invites by name, push invites and presence removed`.

### Task 7: Server: the play.battlechoc.com preview page

**Files:**

- Create: `apps/api/src/playPage.js`, with `registerPlayRoutes(app, { challengeInfo, rateLimit })` and `renderPlayPage({ code, from, language }) → string`.
- Modify:
  - `apps/api/src/app.js`: `createApp` takes `challengeInfo = () => null` and calls `registerPlayRoutes`; export `rateLimit` or pass it in.
  - `apps/api/src/server.js`: `let live; createApp({ …, challengeInfo: code => (live ? live.lobby.challenges.publicInfo(code) : null) })`.
  - New files `deploy/nginx/play.battlechoc.com.conf` and a section in `deploy/README.md` (DNS record at OVH → VPS, certbot, reload).
- Test: `apps/api/test/api.test.js` (`describe('play page')`)

**Interfaces:**

- Consumes: `Challenges.publicInfo(code)` (Task 4), `normalizeChallengeCode`/`formatChallengeCode` (Task 1), and `CHALLENGE_PREVIEW_TITLE`/`CHALLENGE_PREVIEW_TEXT` (Task 9; this task adds the two keys in all 8 languages itself).
- Produces:
  - `GET /play/:code` and `GET /play/` respond `200 text/html`, rate limited at 60 per minute per IP.
  - **Waiting challenge:** `og:title` is `CHALLENGE_PREVIEW_TITLE` in the challenger's language with their name, HTML-escaped.
  - **Unknown code or no code:** the general title `battlechoc` and the general description.
  - **Every page:**
    - `og:description` is `CHALLENGE_PREVIEW_TEXT`;
    - `og:image` is `https://battlechoc.com/images/challenge-preview.png`;
    - `og:url` is `https://play.battlechoc.com/<FORMATTED-CODE>`;
    - the body has a script `location.replace("https://battlechoc.com/?challenge=<FORMATTED-CODE>")` and a visible `<a>` to the same URL (to `https://battlechoc.com/` without a valid code);
    - no HTTP redirect.
- nginx: `server_name play.battlechoc.com; location / { rewrite ^/(.*)$ /play/$1 break; proxy_pass http://127.0.0.1:8080; }`, in the style of the api conf.

- [ ] **Step 1: Write the failing tests:**
  - with a fake `challengeInfo` returning `{ from: 'Anna', language: 'de' }` for `K7Q2M9XD`:
    - `GET /play/k7q2-m9xd` is 200 html;
    - `og:title` contains `Anna`, in German;
    - `og:url` ends `/K7Q2-M9XD`;
    - the body contains `location.replace("https://battlechoc.com/?challenge=K7Q2-M9XD")`;
  - `GET /play/nonsense` → the general title, and the fallback link to `https://battlechoc.com/`;
  - a name containing `<` (fake info) comes out escaped;
  - the 61st request in a minute → 429.
- [ ] **Step 2: Run** `npm run test:api -- -t "play page"`. Expected: FAIL.
- [ ] **Step 3: Implement** the page, the route, the wiring, the nginx conf and the README section.
- [ ] **Step 4: Run** `npm run test:api`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(api): challenge preview page for play.battlechoc.com`.

### Task 8: PWA: live state, lobby client, match kind, beginner track

**Files:**

- Create: `apps/pwa/src/challengeLink.js`, with:
  - `CHALLENGE_LINK_BASE = import.meta.env.VITE_CHALLENGE_LINK_BASE || "https://battlechoc.com/?challenge="`;
  - `challengeLink(code) → string`, which uses the formatted code.
- Modify:
  - `apps/pwa/src/match/liveSlice.js`:
    - state `challenge: null` (the challenger's own challenge) and `challengeView: null` (the friend's view; client-only states `"connecting"` and `"unreachable"`);
    - actions `challengeUpdated(payload | null)` and `challengeViewed(payload | null)`;
    - `liveMatchStarted` clears both; remove `onlinePlayers`.
  - `apps/pwa/src/match/liveLobby.js`:
    - methods `createChallenge()`, `renewChallenge(code)`, `cancelChallenge(code)`, `openChallenge(code)`, `acceptChallenge(code)`, `declineChallenge(code)`, `requestRematch(matchId)`;
    - wiring for `CHALLENGE`, `CHALLENGE_VIEW` and `WELCOME.challenge`;
    - remove `invite` and `queryPresence`.
  - `apps/pwa/src/match/matchSlice.js`: `kind: undefined`, set by `matchHosted({ online, kind })`.
  - `apps/pwa/src/match/RemoteMatchHost.js`: dispatch `matchHosted({ online: true, kind: message.kind })` on its `MATCH` message.
  - `apps/pwa/src/ui/match/BuildPalette.jsx:149`: `unlocked = (type) => tutorial || matchKind === "challenge" || unlockedBuildings.includes(type)`, with `matchKind` from `state.match.kind`.
  - `apps/pwa/src/App.jsx`: `startGame` and `startRealtimeMatch` use `aiSetupScore(stats, { early: this.props.earlyUnlock })` instead of `stats.score`.
- Test: `apps/pwa/test/unit/liveSlice.test.js` (`node --test`)

**Interfaces:**

- Consumes: Task 1 messages and states; `aiSetupScore` (Task 2).
- Produces for Tasks 10–12:
  - `state.live.challenge`, `state.live.challengeView`, `state.match.kind`;
  - the `liveLobby` methods above;
  - `challengeLink(code)`.
- Welcome rule: a welcome with `challenge: null` while `state.live.challenge` holds a WAITING/READING/ACCEPTED challenge sets the challenge to `{ ...old, state: "lost" }`. Task 10 shows "lost" as "This challenge has ended" with Send again, which calls `createChallenge()`.

- [ ] **Step 1: Write the failing reducer tests:**
  - `challengeUpdated` stores the payload;
  - `challengeUpdated(null)` on a waiting, reading or accepted challenge gives `state: "lost"`, and on any other state clears it to `null`;
  - `challengeViewed` stores the view;
  - `liveMatchStarted` clears both;
  - `matchHosted({ online: true, kind: "challenge" })` sets `kind`.
- [ ] **Step 2: Run** `cd apps/pwa && node --test test/unit/liveSlice.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the slice, the lobby client, the match kind, the palette rule, `challengeLink.js` and `aiSetupScore` in App.
- [ ] **Step 4: Run** `npm run test:unit` and `cd apps/pwa && npx vite build --mode e2e --outDir build-e2e`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with `feat(pwa): challenge state, lobby client and the match kind`.

### Task 9: Texts in 8 languages

**Files:**

- Modify: all 8 `packages/shared/translations/*_strings.js`, and `packages/shared/index.js` (predicates for the placeholder keys)
- Test: `packages/shared/tests/translations.test.js` (the existing every-key test, plus one predicate test)

**Interfaces:** the keys Tasks 10–12 use. English is fixed below; the other 7 languages are translated by the implementer, gender-neutral, without em dashes.

| Key                                          | English                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CHALLENGE_BUTTON`                           | Play with a friend                                                                                               |
| `CHALLENGE_SEND_HINT`                        | Send the link to a friend. The match starts as soon as they open it.                                             |
| `CHALLENGE_SHARE`                            | Share link                                                                                                       |
| `CHALLENGE_COPIED`                           | Link copied                                                                                                      |
| `CHALLENGE_WHATSAPP`                         | Send with WhatsApp                                                                                               |
| `CHALLENGE_CODE` (predicate `code`)          | Code: {{code}}                                                                                                   |
| `CHALLENGE_WAITING`                          | Waiting for your friend…                                                                                         |
| `CHALLENGE_READING`                          | Your friend is reading the challenge…                                                                            |
| `CHALLENGE_EXPIRED`                          | Nobody opened your link yet.                                                                                     |
| `CHALLENGE_DECLINED`                         | Your friend isn't up for it right now.                                                                           |
| `CHALLENGE_MISSED`                           | Your friend was ready but you were away.                                                                         |
| `CHALLENGE_LOST`                             | This challenge has ended.                                                                                        |
| `CHALLENGE_SEND_AGAIN`                       | Send again                                                                                                       |
| `CHALLENGE_BACK_HOME`                        | Back to home                                                                                                     |
| `CHALLENGE_CANCEL`                           | Cancel                                                                                                           |
| `CHALLENGE_HEADLINE` (predicate `name`)      | {{name}} challenges you to a chocolate battle!                                                                   |
| `CHALLENGE_PRIMER` (predicate `name`)        | Grow cacao, build cannons, hide everything under cream and destroy {{name}}'s factory before yours falls.        |
| `CHALLENGE_YOU_PLAY_AS` (predicate `name`)   | You play as {{name}}                                                                                             |
| `CHALLENGE_ACCEPT`                           | Accept                                                                                                           |
| `CHALLENGE_NOT_NOW`                          | Not now                                                                                                          |
| `CHALLENGE_PREPARING`                        | Preparing the battlefield…                                                                                       |
| `CHALLENGE_APP_HINT` (predicate `code`)      | Already playing in the battlechoc app? Open it and enter {{code}}                                                |
| `CHALLENGE_CONNECTING`                       | Loading the challenge…                                                                                           |
| `CHALLENGE_UNREACHABLE`                      | The battle server can't be reached right now.                                                                    |
| `CHALLENGE_ENDED`                            | This challenge has ended, ask for a new one.                                                                     |
| `CHALLENGE_TAKEN`                            | This match is already on.                                                                                        |
| `CHALLENGE_OWN`                              | That's your own challenge.                                                                                       |
| `CHALLENGE_BUSY`                             | Finish your match first.                                                                                         |
| `CHALLENGE_ON_THE_WAY` (predicate `name`)    | {{name}} is on the way… let them know you're ready.                                                              |
| `CHALLENGE_AWAY` (predicate `name`)          | {{name}} didn't make it back in time.                                                                            |
| `CHALLENGE_LEARN`                            | Learn to play                                                                                                    |
| `CHALLENGE_START_MATCH`                      | Start a match                                                                                                    |
| `CHALLENGE_ENTER_CODE`                       | Got a code from a friend?                                                                                        |
| `CHALLENGE_CODE_GO`                          | Go                                                                                                               |
| `CHALLENGE_CODE_INVALID`                     | That code doesn't look right.                                                                                    |
| `CHALLENGE_PREVIEW_TITLE` (predicate `name`) | {{name}} challenges you to battlechoc!                                                                           |
| `CHALLENGE_PREVIEW_TEXT`                     | A real-time chocolate battle: grow cacao, build cannons, hide them under cream. Tap to play, nothing to install. |
| `REMATCH`                                    | Rematch                                                                                                          |
| `REMATCH_OFFER` (predicate `name`)           | {{name}} wants a rematch                                                                                         |
| `REMATCH_WAITING` (predicate `name`)         | Waiting for {{name}}…                                                                                            |
| `REMATCH_DECLINED` (predicate `name`)        | {{name}} doesn't want a rematch right now.                                                                       |
| `REMATCH_GONE` (predicate `name`)            | {{name}} has left.                                                                                               |
| `SECONDS_LEFT` (predicate `seconds`)         | {{seconds}} s left                                                                                               |

- Reworded:
  - `UNLOCK_ONLINE_HINT`: "In the Choclab you craft equipment for your buildings. Start Game now also finds opponents online, and with Play with a friend you challenge anyone with a link."
  - `UNLOCK_NEEDS_NAME`: "Online play needs a player name. You get one as soon as battlechoc reaches its server, or you choose one in your profile."
  - `INVITATION`: "Play battlechoc with me!" (the profile share text).
- Removed once Tasks 10–12 no longer use them (each task greps and deletes in all 8 files): `ONLINE_RANDOM`, `ONLINE_SEARCHING`, `ONLINE_AI_HINT`, `ONLINE_INVITE_*`, `ONLINE_ONLINE`, `ONLINE_PLAYER_NOT_FOUND`, `NO_ACCOUNT_INFO`, `ADD_FRIEND`, `REMOVE_FRIEND`, `FRIENDS`.

- [ ] **Step 1: Write the failing test:**
  - `translate(keys.CHALLENGE_HEADLINE, 'Anna')` is `'Anna challenges you to a chocolate battle!'` in English;
  - `translate(keys.SECONDS_LEFT, 42)` is `'42 s left'`.
- [ ] **Step 2: Run** `npm test -- translations`. Expected: FAIL.
- [ ] **Step 3: Add** the keys and predicates in all 8 files, and reword the three texts.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including "every language has every key of the reference language".
- [ ] **Step 5: Commit** with `feat(shared): texts for challenges and rematches in 8 languages`.

### Task 10: PWA: Carolin's side

**Files:**

- Create: `apps/pwa/src/ui/dialogs/ChallengeDialog.jsx`
- Modify:
  - `apps/pwa/src/ui/Hud.jsx:520-535` and `:610-616`: the title button becomes `CHALLENGE_BUTTON` and opens `ChallengeDialog`. Locked, it opens the dialog in `locked` mode instead of the notification. Remove `OnlineLobby`, and the `challengePlayer`/`addFriend`/`removeFriend` props.
  - `apps/pwa/src/ui/dialogs/AccountOverview.jsx`: remove the Invite, Add and Remove friend buttons. The share button stays (text `INVITATION`).
  - `apps/pwa/src/Multiplayer.jsx`: remove `fetchFriendsList`, `addFriend` and `removeFriend`; remove `loadFriendsList` from `UiActions.jsx` and `UiReducer.jsx`.
- Delete: `apps/pwa/src/ui/dialogs/OnlineLobby.jsx`
- Test: `apps/pwa/test/online.spec.js`. Its queue test goes through Start and the `matchmaking` dialog instead of `openLobby`. Its invite test is deleted (Task 11 covers challenges).

**Interfaces:**

- Consumes: `state.live.challenge`, `liveLobby.createChallenge/renewChallenge/cancelChallenge`, `challengeLink`, `formatChallengeCode`, `normalizeChallengeCode`, `liveLobby.openChallenge`.
- Produces: `ChallengeDialog({ open, close, locked, lockText })`. Testids:

  | Testid                 | What               |
  | ---------------------- | ------------------ |
  | `challenge-dialog`     | the dialog         |
  | `challenge-share`      | Share link button  |
  | `challenge-code`       | the formatted code |
  | `challenge-countdown`  | the countdown      |
  | `challenge-status`     | the status text    |
  | `challenge-send-again` | Send again         |
  | `challenge-back`       | Back to home       |
  | `challenge-code-input` | the code field     |
  | `challenge-code-go`    | Go                 |

- Behaviour:
  - opening (not locked) calls `createChallenge()`;
  - Hud opens the dialog by itself on the title screen whenever `state.live.challenge` is set, for example when the welcome restores it after a reload;
  - Share uses `navigator.share({ title, text: CHALLENGE_PREVIEW_TITLE(name), url: challengeLink(code) })`. Without it, it copies with `navigator.clipboard.writeText`, shows `CHALLENGE_COPIED`, and offers a WhatsApp Web link;
  - the countdown is from `expiresAt` with `liveConnection.clock.serverNow()`, shown only in WAITING;
  - closing or Cancel calls `cancelChallenge(code)`;
  - EXPIRED/DECLINED/MISSED/"lost" show their text, Send again (`renewChallenge`, or `createChallenge` for "lost") and Back to home;
  - a valid entered code calls `openChallenge(normalized)` and closes the dialog; Task 11's card takes over. An invalid one shows `CHALLENGE_CODE_INVALID`.

- [ ] **Step 1: Write the failing e2e** `apps/pwa/test/challenge.spec.js`, test `'the challenger shares a link with a code and a countdown; cancelling ends it'`:
  - an unlocked player (copy `createPlayer` from `online.spec.js` into a shared `test/helpers/players.js` and use it from both specs) clicks "Play with a friend";
  - `challenge-code` matches `/^[0-9A-Z]{4}-[0-9A-Z]{4}$/` and `challenge-countdown` shows `2:00` or `1:5x`;
  - Cancel closes the dialog.
  - A second test, `'a locked player gets the code field'`: a player with no matches clicks the button and sees `challenge-code-input` and no `challenge-share`.
- [ ] **Step 2: Run** `cd apps/pwa && npx vite build --mode e2e --outDir build-e2e && npx playwright test test/challenge.spec.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the dialog (plain layout; Task 13 styles it), the Hud changes, and the removals; grep for leftover `friends`/`OnlineLobby`/`queryPresence` uses.
- [ ] **Step 4: Run** `npx playwright test test/challenge.spec.js test/online.spec.js test/locked.spec.js`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(pwa)!: Play with a friend replaces the Friends dialog`.

### Task 11: PWA: the friend's side

**Files:**

- Create: `apps/pwa/src/ui/dialogs/ChallengeCard.jsx`
- Modify:
  - `apps/pwa/src/App.jsx:68-82`: read `query.get("challenge")` through `normalizeChallengeCode` into `this.challengeCode`, and include `challenge` in the history reset. Replace the `?invite=` handling.
  - `App.connectLive`:
    - with `this.challengeCode` set, dispatch `challengeViewed({ code, state: "connecting" })` at once;
    - after the welcome, call `liveLobby.openChallenge(code)`;
    - if no view arrived within 10000 ms, dispatch `{ state: "unreachable" }`;
    - re-send `openChallenge` after a reconnect while a card is open.
  - Mount `<ChallengeCard />` beside `<IncomingInvite />`.
  - When the view carries `name` and the local stats have none, call `multiplayer.usernameSynced(name)`.
- Test: `apps/pwa/test/challenge.spec.js`

**Interfaces:**

- Consumes: `state.live.challengeView`, `state.ui.assetsReady`, `state.ui.playerInfos.stats` (newcomer = neither `tutorialFinished` nor `tutorialSkipped`), `liveLobby.acceptChallenge/declineChallenge`, and App's `startTutorial()`/`startGame()` (passed as props, the way `Unlocked` gets `showDemos`).
- Produces: `ChallengeCard`. Testids:

  | Testid                  | What                                                               |
  | ----------------------- | ------------------------------------------------------------------ |
  | `challenge-card`        | the card                                                           |
  | `challenge-headline`    | the headline                                                       |
  | `challenge-accept`      | Accept, disabled until `assetsReady` (shows `CHALLENGE_PREPARING`) |
  | `challenge-not-now`     | Not now                                                            |
  | `challenge-learn`       | Learn to play                                                      |
  | `challenge-start`       | Start a match                                                      |
  | `challenge-card-status` | the status text                                                    |

- What the card shows per state:

  | State                  | Shows                                                                              |
  | ---------------------- | ---------------------------------------------------------------------------------- |
  | OPEN, newcomer         | headline, primer, "You play as", app hint with the formatted code, Accept, Not now |
  | OPEN, existing player  | headline, Accept, Not now                                                          |
  | WAITING_FOR_CHALLENGER | `CHALLENGE_ON_THE_WAY`                                                             |
  | CHALLENGER_AWAY        | its text and Back to home                                                          |
  | TAKEN                  | Learn to play (newcomer) or Start a match (others)                                 |
  | ENDED                  | its text, plus Learn to play for a newcomer, and Back to home                      |
  | OWN, BUSY, unreachable | their text and Back to home                                                        |
  | connecting             | `CHALLENGE_CONNECTING`                                                             |
  - Not now calls `declineChallenge`, then closes the card (`challengeViewed(null)`).
  - Learn to play calls `multiplayer.tutorialStarted()` and `startTutorial()`.
  - Start a match calls `startGame()`.

- [ ] **Step 1: Write the failing e2e tests:**
  - `'a newcomer opens the link, skips the tutorial and plays a 10×10 match with every building'`:
    - Carolin (unlocked) creates a challenge and reads `challenge-code`;
    - a fresh context goes to `/?challenge=<code>`;
    - `challenge-headline` contains Carolin's name, and no tutorial coach card is visible;
    - `challenge-accept` becomes enabled and is clicked;
    - both pages reach a match whose view (`window.__battlechoc`) has a 10×10 board;
    - after placement and the countdown, the newcomer's `build-palette` has no locked item;
    - the newcomer leaving with Done afterwards returns to the title screen with "Start Tutorial".
  - `'a second opener after the start gets the already-on card with Start a match'`: an unlocked third player opens the same link → `challenge-card-status` shows "This match is already on" and `challenge-start` is visible.
  - `'an expired link shows the ended card'`: a code that never existed → "This challenge has ended".
  - `'without the battle server the card says so'`: a context with `battlechoc.apiUrl` pointing at an unused port → "can't be reached" within 15 s.
- [ ] **Step 2: Run** `npx playwright test test/challenge.spec.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the card and the App changes.
- [ ] **Step 4: Run** `npx playwright test test/challenge.spec.js test/tutorial.spec.js test/start.spec.js`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(pwa): challenge card for friends and newcomers`.

### Task 12: PWA: rematch

**Files:**

- Modify:
  - `apps/pwa/src/ui/controls/GameEndOverview.jsx`: an optional `rematch` prop. With it, a `REMATCH` button sits beside Done (`data-testid="rematch"`), with the waiting, declined and gone text from `state.live.outgoingInvite`/`inviteClosed`/`error`.
  - `apps/pwa/src/ui/Hud.jsx:647-665`: pass `rematch={() => liveLobby.requestRematch(matchId)}` when `state.match.kind === "challenge"` and the match is online.
  - `apps/pwa/src/ui/dialogs/IncomingInvite.jsx`:
    - shown when there is no match view or the view's phase is `ENDED`;
    - text `REMATCH_OFFER(from)`, and the countdown labelled with `SECONDS_LEFT`;
    - buttons Play (`ONLINE_ACCEPT`) and Not now (`ONLINE_DECLINE`).
  - `apps/pwa/src/App.jsx` `startOnlineMatch`: when a previous online host's view has ENDED, do the cleanup part of `endGame` first (`host.stop`, `matchCleared`, `liveLobby.matchLeft`, `this.scene.clear()`), without the surrender and without the one-second delay, so the new board renders.
- Test: `apps/pwa/test/challenge.spec.js`

**Interfaces:**

- Consumes: `liveLobby.requestRematch(matchId)` (Task 8), the server rematch (Task 6), and the match id from `matchSession.host.matchId`.

- [ ] **Step 1: Write the failing e2e** `'rematch from the end screen starts a new challenge match'`:
  - after a challenge match ends (one player surrenders through the menu), player A clicks `rematch`;
  - B sees `incoming-invite` containing "wants a rematch" and clicks Play;
  - both reach a new match with a different match id and a 10×10 board.
- [ ] **Step 2: Run** `npx playwright test test/challenge.spec.js -g rematch`. Expected: FAIL.
- [ ] **Step 3: Implement** the three changes.
- [ ] **Step 4: Run** `npx playwright test test/challenge.spec.js test/realtime.spec.js`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(pwa): rematch after a challenge`.

### Task 13: Layout variants for the user (checkpoint), then the picked layout

Tasks 10–12 build the screens in a plain `Dialog` `mode="info"` layout. How they look is the user's decision (visual-variants rule).

**Files:**

- Create (throwaway, deleted after the pick): `apps/pwa/test/zz-challenge-variants.spec.js`, and a temporary `variant` prop on `ChallengeDialog`, `ChallengeCard` and `IncomingInvite`.
- Output: `apps/pwa/test/output/challenge-variants/*.png`
- Modify after the pick: the three components' styles.

What to render, in three labelled variants (A, B, C):

- Carolin's dialog: waiting, reading, expired, and locked with the code field;
- the newcomer card: preparing and ready;
- the existing-player card;
- "already on";
- the rematch offer.

Render each at 1920×1080, 844×390 landscape and 390×844 portrait, through test hooks that dispatch `challengeUpdated`/`challengeViewed`. Use a long name (`Bartholomew_Butterscotch`) in at least one shot.

- [ ] **Step 1:** Add the `variant` prop and the spec.
- [ ] **Step 2:** Run `cd apps/pwa && npx playwright test test/zz-challenge-variants.spec.js`. Expected: one labelled sheet per state in `test/output/challenge-variants/`.
- [ ] **Step 3: Stop.** Send the sheets to the user and wait for the pick. Record the pick in `.claude/memory/project/decisions.md`.
- [ ] **Step 4:** Apply the picked variant, then remove the `variant` prop and the throwaway spec.
- [ ] **Step 5:** Run `npx playwright test test/challenge.spec.js`. Expected: PASS (the testids are unchanged).
- [ ] **Step 6: Commit** with `style(pwa): challenge dialogs in the picked layout`.

### Task 14: General link previews and the preview picture

**Files:**

- Modify: `apps/pwa/index.html`: `og:title` "battlechoc", `og:description` (the existing meta description), `og:image` `https://battlechoc.com/images/challenge-preview.png`, `og:url` `https://battlechoc.com/`, `og:type` website, `twitter:card` summary_large_image.
- Create: `apps/pwa/public/images/challenge-preview.png`. This is a stand-in until the user's art: 1200×630, under 300 KB, made from existing game art (logo and title-screen decoration on the deep blue background) by screenshotting a small HTML page with Playwright. Keep the generator in the session scratchpad, not in the repo.
- Test: `apps/pwa/test/title.spec.js` (one assertion)

- [ ] **Step 1: Write the failing assertion** in `title.spec.js`: `page.locator('meta[property="og:image"]')` has `content` `https://battlechoc.com/images/challenge-preview.png`, and `GET /images/challenge-preview.png` is 200 with a body under 300000 bytes.
- [ ] **Step 2: Run** `npx playwright test test/title.spec.js`. Expected: FAIL.
- [ ] **Step 3: Add** the tags and make the picture; check it visually (Read the PNG).
- [ ] **Step 4: Run** `npx playwright test test/title.spec.js`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(pwa): link previews and a challenge preview picture`.

### Task 15: Wrap-up

**Files:**

- Modify:
  - `.claude/memory/architecture/api-and-live.md`: challenges, rematch, the play page, invites and presence removed;
  - `.claude/memory/architecture/pwa.md`: the dialogs, the match kind, the beginner track;
  - `.claude/memory/deployment/infrastructure.md`: play.battlechoc.com, the user's to-dos;
  - `.claude/memory/project/status.md`.
- No product code.

- [ ] **Step 1:** Run `npm test`, `npm run test:api` and `npm run test:unit`, and `npx playwright test test/challenge.spec.js test/online.spec.js test/locked.spec.js test/title.spec.js test/tutorial.spec.js`. Expected: all PASS. Write down any failure with its output; don't hide it.
- [ ] **Step 2:** Update the memory files above.
- [ ] **Step 3:** `git switch dev && git merge --no-ff feat/challenge-link`, resolve any conflicts (dev has the ranking and dialog-title changes), and run `npm run test:api` and `npx playwright test test/challenge.spec.js` on dev.
- [ ] **Step 4:** Tell the user:
  - dev is ready to push, with a conventional PR title such as `feat: play with a friend through a challenge link`;
  - the to-dos for play.battlechoc.com: the DNS record, nginx plus certbot, and `VITE_CHALLENGE_LINK_BASE=https://play.battlechoc.com/` in `apps/pwa/.env` once it answers;
  - the preview picture is a stand-in for their art.
