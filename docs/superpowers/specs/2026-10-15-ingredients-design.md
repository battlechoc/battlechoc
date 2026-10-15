# Ingredients, achievements and the Start button

Design, agreed with Fabian on 2026-10-15. It replaces coins as the match reward with ingredients that only verified online matches give, splits progress (XP) from the public highscore (rating), and replaces the Singleplayer / Play online menu with one Start button.

## Goals

- One **Start** button: online it finds an opponent and falls back to a server-hosted AI; offline it plays the local AI.
- **Ingredients** replace coins as the reward. They drop per achievement, only in matches the server hosted and can therefore verify. Cocoa is the fallback ingredient and the main currency of the Choclab.
- **Nothing that others see can be faked.** Offline matches still give XP for the player's own progress, but the public highscore uses a rating that only verified online matches change.
- The ingredient model is the off-chain part of the planned season layer (whitepaper section 6.1), so nothing has to be built twice.

## Non-goals

- No token, no wallet, no tradable items, no recipes or equipment. Those come with the season layer.
- No change to the match rules or to the AIs.
- No new art: placeholder icons until Fabian draws the ingredient icons.

## Game modes

| Mode | When | Rewards |
| --- | --- | --- |
| Offline | no connection, or the server is not reachable within 3 s | XP |
| Online | connected; human opponent or the server-hosted AI | XP, ingredients, rating (human opponents only) |
| Tournaments | later, with the season layer | — |

## Start flow

- The title screen shows **Start** and **Choclab**, plus a small **Friends** button that opens the existing invite part of the online lobby (invite by name, friends list, incoming invites keep working).
- New players are unaffected: the tutorial and the prepared first match (score ≤ 100) run as today.
- **Start, connected:** the client joins the queue and shows a matchmaking overlay: "Looking for an opponent…", a countdown to the AI, **Cancel** and **Play the AI now**. A human opponent starts the match. After 15 s (`LIVE_AI_FALLBACK_MS`, default lowered from 30 s) the server starts a match against its own AI. "Play the AI now" sends a new client message that asks the server for the AI match immediately.
- **Start, not connected:** if the live connection is not up within 3 s, or the browser is offline, the local AI starts at once, as single player does today.
- Opponent and board size for AI matches follow XP, as before (`aiOpponentForScore`, `boardSizeForScore`, now fed with XP).

## Progress: XP and rating

| | XP and level | Rating |
| --- | --- | --- |
| Source | achievements of every match, offline included | verified online matches against humans |
| Used for | board size, AI strength, building unlocks, the player's level | public highscore, rank, online matchmaking |
| Can be faked | yes; it only affects the cheater | no; the server computes it |
| Visible to others | on the player's own profile | yes |

- XP replaces the old score; the existing `score` becomes XP on migration. The level is derived from XP (existing thresholds for board size and unlocks stay).
- The rating is Glicko-2 (start 1500, deviation 350). Matches against the AI do not change it. Highscore and rank sort by rating among players with at least one rated match.
- Offline match records (`POST /user/trackrecords`) credit XP only, as the client reports them; they never credit ingredients or change the rating.

## Achievements

- Each achievement has an **XP value** (its former coin value), a **who** flag (W = winner only, B = both players) and a **drop table**.
- After a match, the five most valuable achievements a player earned count, as today. Achievements marked B can now also be earned by the loser.
- **Loser:** half the XP (rounded down), half the drop chances, half the cocoa.

### Existing achievements

| Key | XP | Who | Special drop |
| --- | --- | --- | --- |
| WINNER | 25 | W | sugar 10 % ×3 |
| PICKY | 5 | B | — |
| RANDOM | 5 | B | — |
| MULTIPLAYERBONUS | 5 | B | — |
| GREEDY | 10 | B | milk 5 % ×3 |
| STRATEGIST | 10 | B | milk 5 % ×3 |
| GREENSPOT | 20 | B | sugar 5 % ×2 |
| SMALLOFFENSIVE | 30 | B | rum 5 % ×1 |
| REFILLED | 30 | B | cream 8 % ×1 |
| NERD | 50 | B | sugar 15 % ×3 |
| RANDOMFOREST | 50 | B | sugar 10 % ×3 |
| SETTLER | 50 | B | milk 8 % ×2 |
| UPGRADE | 50 | B | cherries 15 % ×2 |
| SPY | 50 | B | marzipan 8 % ×1 |
| UNUSED | 50 | B | marzipan 3 % ×1 |
| OFFENSIVE | 70 | B | rum 12 % ×2 |
| RUSHHOUR | 100 | W | rum 20 % ×2 |
| GROUNDHOGDAY | 100 | B | marzipan 12 % ×1 |
| PERSONALCONCERN | 100 | B | cream 20 % ×2 |
| MINIMALIST | 150 | W | rum 25 % ×2 |
| FIRSTCOMEFIRSTSERVED | 200 | B | rum 20 % ×2 |
| UNBREAKABLE | 200 | B | cream 15 % ×2 |
| GOLDENMULTIPLAYERBONUS | 200 | B | cream 20 % ×2 |
| MOLTEN | 300 | B | cinnamon 25 % ×1 |
| SECRETAGENT | 500 | B | marzipan 40 % ×1 |
| DIAMONDMULTIPLAYERBONUS | 500 | B | cream 40 % ×2; vanilla 15 % ×1 |
| CONCRETEJUNGLE | 600 | W | hazelnuts 30 % ×3 |
| MRGLASS | 600 | B | cherries 30 % ×3 |
| REPEATOFFENDER | 800 | B | marzipan 50 % ×1 |
| OUVERT | 800 | W | milk 40 % ×5 |
| HINDSIGHT | 1000 | W | vanilla 40 % ×1 |
| RAINFOREST | 1000 | B | sugar 70 % ×5; vanilla 30 % ×1 |
| HORCRUXES | 1200 | B | hazelnuts 60 % ×5 |
| MAJOROFFENSIVE | 1500 | B | rum 70 % ×5; gold leaf 10 % ×1 |
| ONEHITWONDER | 1800 | B | gold leaf 15 % ×1, else vanilla 50 % ×1 |
| OMG | 2000 | W | gold leaf 25 % ×1, else vanilla 60 % ×1 |

### New achievements

| Key | Condition (from the match and its events) | XP | Who | Special drop |
| --- | --- | --- | --- | --- |
| FRESHBATCH | the player's first verified match of the UTC day (server only) | 0 | B | 100 cocoa, always |
| GOODSPORT | the player did not surrender | 30 | B | — |
| SURVIVOR | the match ended by the time limit | 150 | B | sugar 15 % ×3 |
| SWEETTOOTH | produced ≥ 1,000 cacao (`statistics.producedCacao`) | 100 | B | sugar 15 % ×3 |
| CHOCOHOLIC | produced ≥ 3,000 cacao | 400 | B | sugar 40 % ×5; vanilla 10 % ×1 |
| PATIENCE | won, ≥ 5 shots, no early shot (`statistics.rushes = 0`) | 150 | W | cream 15 % ×2 |
| CANTWAIT | ≥ 10 early shots | 50 | B | rum 10 % ×1 |
| SHARPSHOOTER | ≥ 10 shots and ≥ 90 % of them hit (`shotsHit / shotsFired`) | 300 | B | cherries 25 % ×3 |
| SHIELDWALL | ≥ 5 opponent attacks with `result.shielded` | 200 | B | cream 30 % ×3 |
| FORTRESS | ≥ 15 opponent attacks with `result.shielded` | 600 | B | cream 60 % ×5; vanilla 10 % ×1 |
| TRAPPER | the opponent's attacks triggered ≥ 3 of the player's donuts (`result.traps`) | 250 | B | sprinkles 25 % ×1 |
| SUGARRUSH | a pink donut of the player stunned the opponent | 150 | B | sprinkles 15 % ×1 |
| PORTALHOPPER | the player's portal pair swapped a hit | 200 | B | sprinkles 20 % ×1 |
| BUNNYCATCHER | the player's Xmas factory caught a bunny (`result.caught`) | 400 | B | cinnamon 40 % ×1 |
| CLOSECALL | won with the factory at ≤ 10 % of its hit points at the end | 300 | W | vanilla 15 % ×1 |
| UNTOUCHED | won and no attack ever damaged the player's factory | 250 | W | milk 25 % ×3 |

FRESHBATCH is added by the server, because it depends on the player's history; it does not count toward the five achievements.

## Ingredients

| Id | Rarity | Shelf life | Choclab use |
| --- | --- | --- | --- |
| COCOA | common | never | every level (main cost) |
| SUGAR | common | never | cacao tree milestones |
| MILK | common | never | factory milestones |
| HAZELNUTS | uncommon | never | extension milestones |
| RUM | uncommon | never | truffle cannon milestones |
| CHERRIES | uncommon | never | fruit cannon milestones |
| CREAM | uncommon | never | fountain and cream milestones |
| MARZIPAN | rare | 14 days | Easter bunny milestones |
| CINNAMON | rare | 14 days | Xmas factory milestones |
| SPRINKLES | rare | 14 days | donut factory milestones |
| VANILLA | rare | 7 days | milestones of every building |
| GOLDLEAF | legendary | 3 days | the final level of every building |

Spoiling ingredients are stored in batches, each with its own expiry. Spoiled batches stop counting at once and are deleted by a periodic cleanup.

## Drops

For each counted achievement of a player after a **verified** match:

1. Roll its drop entries in order. The first entry that hits is credited; an entry with "else" is only rolled when the one before it missed. Entries joined with ";" are rolled independently.
2. If no entry hit, credit the **cocoa fallback**: cocoa equal to the achievement's XP value.
3. Chances are halved for the loser and in matches against the server AI (both: a quarter). Cocoa fallbacks are halved for the loser.
4. **Daily limit** (per player and UTC day, counting verified matches): matches 1–5 full chances; matches 6–15 half chances; from match 16 on no special drops, only half the cocoa fallbacks.

Amounts are whole numbers; halving rounds down. The server rolls with `crypto.randomInt`; the drop function takes the random source as a parameter so tests can fix it.

## Choclab

- A level costs **cocoa** equal to the old coin price of that level (`balance.js`, same curve).
- **Milestone levels** add the building's special ingredient S (rare S — marzipan, cinnamon, sprinkles — at a fifth, rounded up):

  | Level | Extra ingredients |
  | --- | --- |
  | 5 | 5 S |
  | 10 | 10 S, 1 vanilla |
  | 15 | 15 S, 2 vanilla |
  | 20 | 20 S, 3 vanilla, 1 gold leaf |

- Upgrading needs a connection. The server charges everything in one transaction and uses the batches that spoil first. Offline the Choclab shows the cached pantry and explains that upgrades need a connection.
- Building unlocks (extension, bunny, fountain …) keep their thresholds, now on XP.

## Migration of existing players

Once, in the database migration: `xp = score`, a COCOA batch with the amount of `coins`, rating 1500 / deviation 350 / volatility 0.06, and Choclab levels unchanged. Offline profiles that merge later (`/user/merge`) are converted the same way.

## Technical design

### Shared package

- `engine/awards.js` → achievements with `xp`, `who`, the new achievements; `computeMatchAwards(match, playerIndex)` returns the counted achievements of winners and losers.
- `ingredients.js`: the ingredient catalogue (id, rarity, shelf life, translation keys).
- `balance.js`: `drops` (tables per achievement key), `dropRules` (halving, daily tiers), `choclab.milestones`, `choclab.specialIngredient` per building.
- `engine/drops.js`: `rollDrops({ achievements, won, opponentIsAi, verifiedMatchesToday, random })` → `[{ ingredient, amount, achievement }]`.
- `choclabCost(entityType, level)` → `{ cocoa, ingredients: { [id]: amount } }`.
- `rating.js`: Glicko-2 update for one match between two rated players.
- Translations (all 8 languages): ingredient names, new achievement titles and subtitles, Start flow, matchmaking overlay, end-screen bag, Choclab texts.

### API

- Migration `003_ingredients.sql`: `pantry (player_id, ingredient, amount, expires_at NULL)`, `drops (match_id, player_id, ingredient, amount, achievement)`, players `xp`, `rating`, `rating_deviation`, `rating_volatility`, `rated_matches`; data conversion as above.
- Live result crediting (`lobby.js`): achievements from the server's own match → drops (once per match and player) → XP → rating (human vs human) → `result { xp, drops, rating }` to each client.
- New client message: play against the AI now. AI fallback default 15 s.
- REST: `GET /user/pantry`; `/update/level` charges cocoa and ingredients; `/user/trackrecords` and `/user/merge` credit XP only; highscore and rank by rating; profile includes level, XP, rating.

### PWA

- `Hud.jsx`: Start, Choclab, Friends; the Start flow and the matchmaking overlay.
- `GameEndOverview.jsx`: achievements with XP; the ingredient bag (drops with their achievements), or the greyed bag with the explanation offline.
- `Choclab.jsx`: the pantry with spoil timers, costs per level (cocoa + ingredients), upgrades online only.
- Store: pantry in `ui.playerInfos`, cached in IndexedDB; coins removed from the interface.
- Placeholder ingredient icons in `public/images/ingredients/<id>.svg`.

## Tests

- **Shared:** drops with a fixed random source (fallback, "else", halving, daily tiers, rounding); every new achievement on prepared scenarios; Choclab costs; Glicko-2 against reference values.
- **API:** drops credited once per match; daily tiers; pantry totals ignore expired batches; `/update/level` charges cocoa and milestone ingredients atomically and uses the earliest-expiring batches; migration converts coins and score; offline records credit XP only.
- **e2e:** Start offline → local AI → greyed bag; Start online → AI fallback → drops on the end screen; Choclab shows costs and upgrades with ingredients.

## Open after this step

- Final ingredient icons (Fabian).
- Balancing of drop rates and milestone amounts after the first weeks of real data.
