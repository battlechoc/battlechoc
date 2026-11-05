# Challenge link: play with a friend

Status: flow approved in chat on 2026-11-04, open questions answered on 2026-11-05; written up for planning.

## Why

Inviting a friend works today only if the friend has battlechoc open at that very moment:

- the app never asks for push permission (the caller went away in bcae940), so no device has a push subscription;
- an invite needs the friend's exact player name, and there is no search;
- friends are one-way and nobody is told when they are added;
- "Remove from Friends" adds the friend straight back.

The "Friends" dialog ("Play online") also offers a random opponent, which is exactly what Start already does once online play is unlocked.

A challenge link replaces all of this. The player sends a link through WhatsApp or any other channel, and the match starts as soon as the friend opens it. The chat message is the notification, so push is not needed. The friend does not need a name or even the app: battlechoc is a web app and opens straight from the link.

## Goals

- A player sends a link and is in a match with the friend within seconds of the friend opening it.
- A friend who has never played battlechoc gets from the link into the match without the tutorial and without confusion.
- The match is fair and friendly: no rating risk, and the full set of buildings for both players.
- Every dead end (expired, cancelled, already taken, server down) ends on a clear sentence and a way forward.

## Non-goals

- Push notifications. They come later, and the "Play with a friend" moment is the natural place to ask for permission then.
- A friends list, player search or presence.
- Challenges that wait longer than a few minutes, for example a day.
- Link previews that name the challenger. GitHub Pages serves fixed files, so the preview is the same general battlechoc card for every link.

## Anti-goals (a failure even if it works)

- A newcomer who opens the link lands in the tutorial, or in a match before the game has finished loading.
- The challenger's rating or rank changes because they played a friend.
- The challenger's waiting screen silently breaks when they switch to WhatsApp to send the link.
- A newcomer keeps the full set of buildings after the challenge; their own progression must stay intact.

## Constraints

- Server: `apps/api/src/live/lobby.js` owns queue and invites, in memory; challenges live there too. A server restart loses waiting challenges, the same as invites today.
- The app leaves the live connection when it goes to the background (`App.connectLive`, `visibilitychange`). So the server must keep a challenge alive without the challenger's connection.
- Building unlocks are enforced only in the app (`BuildPalette` via shared `unlocks()`); the engine and server do not check them.
- The server counts finished matches from its track records (`players.js`), so a challenge counts towards unlocks without extra work.
- The server rates every match between two humans that ran (`Lobby.matchEnded`).
- UI text only through `translate(translationKeys.X)`, with every key in all 8 files of `packages/shared/translations/`. No em dashes in UI text.
- Hosting is GitHub Pages: `404.html` is a copy of `index.html`. A query parameter on `/` gets a 200, a deep path gets a 404 status with the app.

## The flow (decided with the user)

### 1. The challenger sends the link

- The title-screen button "Friends" becomes **"Play with a friend"**. It keeps today's lock: 4 finished matches against the AI and a player name.
- Tapping it opens the challenge dialog. The server creates the challenge at once, and the dialog shows:
  - one sentence: "Send the link to a friend. The match starts as soon as they open it.";
  - a big **Share link** button, which opens the share sheet where `navigator.share` exists; otherwise it copies the link and offers WhatsApp Web;
  - a countdown from **2:00**;
  - **Cancel**.
- When the friend opens the link, the dialog changes to "Your friend is reading the challenge…" without a countdown. _(Claude's call, from the builder check:)_ The challenge does not expire while a friend's card is open (their live connection is up), up to a cap of 10 minutes, so a newcomer reading the card or waiting for the game to load never runs into "ended". If every friend who opened it leaves (connection gone for 60 s), the dialog goes back to waiting with a fresh 2:00.
- Several people may open the same link (group chats). The first Accept wins; "Not now" from one of them does not end the challenge for the others. The challenger only sees "Your friend isn't up for it right now" when nobody else has the card open.
- Everyone else who has the card open, or opens the link later, gets "This match is already on" (the user, 2026-11-05) with one way forward:
  - a newcomer: **Learn to play** (starts the tutorial);
  - anyone else: **Start a match** (the normal Start: someone else online, or the AI before online play is unlocked).
- At 0:00 the dialog shows "Nobody opened your link yet." with:
  - **Send again**: the same link, timer restarted, the share sheet is not opened again;
  - **Back to home**.
- Cancelling, closing the dialog or starting anything else (Start, Choclab, …) cancels the challenge.
- If the app reloads or is killed in the background while a challenge waits, the server's welcome message tells it about the challenge, and the dialog opens again in the right state.

### 2. The friend opens the link

The link is `https://battlechoc.com/?challenge=<code>`. The parameter is read and removed from the address bar the same way `?invite=` is today.

- **Newcomer** (tutorial neither finished nor skipped): a challenge card replaces the first-play screen. It appears as soon as the app's code runs, before the 3D assets finish loading:
  - "**Carolin Cacao challenges you to a chocolate battle!**"
  - one short primer: grow cacao, build cannons, hide everything under cream, destroy her factory before she destroys yours;
  - "You play as Hazel Nougat": a random name, assigned before the card shows, changeable later in the profile, with no extra "a name was chosen for you" dialog;
  - **Accept**: greyed with "Preparing the battlefield…" until the game is ready;
  - **Not now**: leads to the normal first-play screen (Start Tutorial / Skip Tutorial). The challenger sees "Your friend isn't up for it right now" with Send again and Back to home.
- **Existing player**: the same card without the primer and the name line, whatever their unlock progress.
- The friend sees no countdown, to avoid pressuring a newcomer.

### 2a. The challenge code (the user, 2026-11-05)

On an iPhone the home-screen app has its own storage, separate from Safari, and links from WhatsApp always open in Safari; in-app browsers (Instagram and others) are fresh too. Opened there, an existing player would play as a throwaway newcomer account. So every challenge also has a short code:

- The code is the link's code, shown in a readable form, for example `K7Q2-M9XD`: case-insensitive, without look-alike characters (Crockford base32 or similar).
- The challenger's dialog shows the code under the Share link button.
- The newcomer card says "Already playing in the battlechoc app? Open it and enter K7Q2-M9XD". A newcomer can ignore it and accept right there.
- The app gets an **Enter a code** field. It works even while "Play with a friend" is still locked: a player who has not unlocked it can still accept a friend's challenge. Where it sits (in the "Play with a friend" dialog, on the locked button's notice, or both) is decided with the layout variants.
- Entering a code behaves exactly like opening the link: the same card (without the primer), the same special cases.
- Special cases on opening:
  - the friend is in a match: "Finish your match first";
  - the challenge already ended (cancelled or expired): "This challenge has ended, ask for a new one", plus "Try the tutorial" for a newcomer;
  - someone else already accepted: "This match is already on", with Learn to play or Start a match (see section 1);
  - the challenger opened their own link: "That's your own challenge";
  - the server can't be reached: "The battle server can't be reached right now", with Back.

### 3. Accept

- If the challenger is connected, the match starts at once.
- If the challenger is away (in WhatsApp), the friend sees "Carolin is on her way… tell her you're ready". The server starts the match as soon as the challenger's app connects again.
- If the challenger doesn't come back within 60 s, the friend sees "Carolin didn't make it back in time" with Back to home. When the challenger returns, they see "Your friend was ready but you were away" with Send again.

### 4. The match

- New match kind `challenge` (beside `queue`, `invite`, `ai`).
- **Always a 10×10 board** (the user's decision), whatever the players' XP.
- **Not rated**: no rating or highscore change for either player.
- **Every building unlocked for both players**, for this match only. The app needs to know the match kind (for example from the `match` message) to lift the build-palette lock.
- Each player plays with their own equipment. Items are side-grades with a built-in downside, so this stays fair.
- Placement phase 45 s instead of 20 s, so a first-timer is not placed automatically.
- Field choice stays a coin toss with the usual 10 s, as in every match between two humans (the user: anything else feels unfair). A newcomer who wins it gets the normal "Choose your field" prompt; without a choice the deadline picks, as today.
- XP and ingredient drops as in every server match. The existing daily tiers limit farming between friends.
- **Beginner track for AI matches (the user, 2026-11-05).** A match against a human gives big XP bonuses (200 after 3 minutes, 500 after 8, half for the loser), and XP decides the AI matches: the prepared first game only up to 100 XP, 8×8 from 200, 10×10 from 500, Gustav from 800 (`engine/setup.js`). So one or two challenges would send a newcomer's first AI match to 10×10 against Gustav.
  - The XP stays credited.
  - Until a player has unlocked online play themselves (4 finished matches), their AI matches stay on the beginner track:
    - the prepared first game for their first AI match;
    - Tom Toffee;
    - the board size their AI matches alone would give.
  - This applies to the server AI (`Lobby.startMatch` via `aiMatchSetup`) and the local AI (`App.startRealtimeMatch`) alike. How the beginner track is measured (finished AI matches, or the XP from matches other than challenges) is left to the builder.

### 5. After the match

- The end screen gets **Rematch** next to Done.
- Rematch only works while both players are still in the app. The opponent gets "Hazel Nougat wants a rematch" with Play / Not now and a labelled countdown.
- A rematch is again a `challenge` match: 10×10, not rated, everything unlocked.
- A locked newcomer may use Rematch too, because it continues the same challenge.
- For the newcomer:
  - the match counts as one finished match, so the existing Unlocked dialog announces factory extension and fountain;
  - then the title screen shows Start Tutorial / Skip Tutorial as for any new player;
  - "Play with a friend" stays locked until their own 4 matches, but every link from a friend gives them the full board again.

## What goes

- From the online dialog: random opponent, invite by name, the friends list with presence.
- From the profile: the Invite button and Add/Remove friend. The profile keeps stats and the share button.
- The texts that become unused or wrong:
  - `ONLINE_AI_HINT` (says 30 s, the server waits 15 s);
  - `NO_ACCOUNT_INFO` ("score of at least 1000");
  - `UNLOCK_NEEDS_NAME` ("in the settings").
- `UNLOCK_ONLINE_HINT` mentions inviting with Friends and needs rewording for "Play with a friend".

## Left to the builder

- The protocol messages for creating, opening, accepting, declining, cancelling and renewing a challenge, and how the welcome message reports a waiting challenge.
- The challenge code: short and unguessable, for example 8 characters of random base32, lifetime 2 minutes.
- Whether the server-side invite by username stays as the rematch transport or rematch goes by match id. By match id is preferred, since names can change.
- How the random name is assigned for a newcomer: the existing `setRandomPlayerName` without its notification, or the server on opening.
- Open Graph tags in `index.html` for a general link preview (title, description, an absolute image URL).
- The layout of the dialog and the card. These are shown to the user as labelled variant screenshots before building (`apps/pwa/test/output/`).
- Whether the server's friends endpoints, the `friends` table and its line in the privacy policy go in this project or a follow-up.

## Tests

- **API (Jest, pg-mem):**
  - create, open (timer restart), accept, decline, cancel, expire;
  - challenger away at accept: start on reconnect, and give up after 60 s;
  - several openers: the first Accept wins, the others get "already on"; one "Not now" does not end it for the others;
  - the challenge does not expire while a friend's card is open, and falls back to a fresh 2:00 when every friend left;
  - own link;
  - entering the code works like the link, and while "Play with a friend" is locked;
  - a `challenge` match is 10×10, has a coin toss for the field, is not rated, but credits XP and counts as a finished match;
  - after challenges, a player below the online unlock still gets beginner AI matches (server AI and `aiMatchSetup` unit tests in the shared package);
  - rematch.
- **e2e (Playwright, targeted):**
  - two browser contexts: the challenger creates a link, a fresh context (newcomer) opens it, sees the card without the tutorial, accepts, both are in a 10×10 match with every building in the palette;
  - an expired link shows the ended card.
