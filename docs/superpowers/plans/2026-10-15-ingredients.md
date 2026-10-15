# Ingredients, Achievements and the Start Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace coins as the match reward with ingredients that only server-verified online matches give, split private XP from a public Glicko-2 rating, and replace the Singleplayer / Play online menu with one Start button.

**Architecture:** The shared package gets the data and pure logic (ingredient catalogue, drop tables, Choclab costs, drop rolling, Glicko-2, achievements). The API stores pantries, credits drops, XP and ratings when a live match ends, and charges ingredients in the Choclab. The PWA gets a Start flow with matchmaking, an ingredient bag on the end screen, a pantry in the Choclab, and ingredient icons as SVG.

**Tech Stack:** Node 22, CommonJS + Jest 30 (shared), Express 5 + pg + pg-mem + Jest (API), React 19 + Redux Toolkit + react-jss + Vite 8 + Playwright (PWA).

**Spec:** `docs/superpowers/specs/2026-10-15-ingredients-design.md`

## Global Constraints

- Branch `feat/ingredients`; conventional commits; **no `Co-Authored-By` trailers**; commit identity `Fabian Bormann <bormann.fabian@gmail.com>` (repo config).
- Shared package: CommonJS, 4-space indentation, single quotes. PWA: `.jsx` for React files, Prettier 2 style with `trailingComma: "es5"`.
- Every UI text goes through `translate(translationKeys.X)`; every new key exists in all 8 files `packages/shared/translations/{de,en,es,fr,it,jp,pt,vn}_strings.js` (the translation test enforces it).
- Icons are SVG files in the style of `apps/pwa/public/images/*-icon.svg`: a 250×250 viewBox, a rendered-looking object (gradients, soft highlights, no outlines) on a transparent background.
- Offline matches never credit ingredients or change the rating; only the server rolls drops (`crypto.randomInt`).
- Postgres counts come back as strings: wrap them in `Number(...)`. pg-mem: write `x + $1` with a negative value instead of `x - $1`, and use generated `IN (…)` lists instead of `= ANY($1)`.
- Never open tabs in the user's browser: Playwright headless, Vite with `--open false`.

## Review Focus

1. **A match credited twice** (room recovery after a restart calls `matchEnded` again): drops, XP and rating must change only once. Test in Task 7.
2. **Two Choclab upgrades sent at the same time** with ingredients for only one: exactly one succeeds. Test in Task 6.
3. **Spoiled batches**: an expired vanilla must neither count in the pantry nor pay for an upgrade, even though the row still exists. Test in Task 5.
4. **Start while the server is slow**: the app must fall back to the local AI after 3 s and not start a second, online match when the connection comes up later. Test in Task 10.
5. **A draw**: both players count as winners for achievements, XP and drops; the rating scores it 0.5. Tests in Tasks 2 and 7.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/ingredients.js` (new) | Ingredient ids, rarity, shelf life |
| `packages/shared/progression.js` (new) | Drop tables and rules, Choclab costs, `rollDrops`, `achievementXp`, `choclabCost` |
| `packages/shared/rating.js` (new) | Glicko-2 |
| `packages/shared/engine/awards.js` | Achievements with `xp` and `who`, 14 new ones, losers included |
| `packages/shared/index.js` | Exports the new modules |
| `packages/shared/live/protocol.js` | `queue.ai` message, AI fallback 15 s |
| `packages/shared/translations/*_strings.js` | New texts in 8 languages |
| `apps/api/src/migrations/003_ingredients.sql` (new) | XP, rating, pantry, drops, rated matches, data conversion |
| `apps/api/src/db.js` | `withTransaction` |
| `apps/api/src/pantry.js` (new) | Pantry totals, adding, spending (earliest expiry first) |
| `apps/api/src/rewards.js` (new) | Crediting a verified match; rating a match |
| `apps/api/src/xp.js` (new, replaces `coins.js`) | XP of client-reported (offline) records |
| `apps/api/src/players.js`, `app.js` | Stats with XP, rating and pantry; endpoints |
| `apps/api/src/live/lobby.js`, `room.js`, `index.js` | Crediting at match end; `queue.ai` |
| `apps/pwa/public/images/ingredients/*.svg` (new) | 12 ingredient icons |
| `apps/pwa/src/ui/ingredients/IngredientIcon.jsx`, `IngredientBag.jsx` (new) | Showing ingredients |
| `apps/pwa/src/ui/dialogs/Matchmaking.jsx` (new) | Matchmaking overlay |
| `apps/pwa/src/ui/Hud.jsx`, `App.jsx`, `match/liveLobby.js` | Start flow |
| `apps/pwa/src/ui/controls/GameEndOverview.jsx` | XP and the ingredient bag |
| `apps/pwa/src/ui/pages/Choclab.jsx`, `ui/dialogs/Pantry.jsx` (new) | Costs in ingredients, pantry |

---

### Task 1: Ingredient catalogue and Choclab costs

**Files:**
- Create: `packages/shared/ingredients.js`, `packages/shared/progression.js`
- Modify: `packages/shared/index.js` (exports)
- Test: `packages/shared/tests/progression.test.js`

**Interfaces:**
- Produces: `Ingredient` (frozen map of ids), `Ingredients[id] = { id, rarity, shelfLifeMs }`, `Rarity`; `choclabCost(entityType, level) → { cocoa, ingredients: { [id]: amount } }` where `level` is the current stored level and the upgrade goes to `level + 1`; `SpecialIngredient[entityType]`.

- [ ] **Step 1: Write the failing test**

```js
// packages/shared/tests/progression.test.js
const { Ingredient, Ingredients, choclabCost, EntityType } = require('../index');

describe('ingredients', () => {
    test('twelve ingredients; only rare and legendary ones spoil', () => {
        expect(Object.keys(Ingredients)).toHaveLength(12);
        Object.values(Ingredients).forEach(ingredient => {
            const spoils = ingredient.shelfLifeMs !== null;
            expect(spoils).toBe(ingredient.rarity === 'rare' || ingredient.rarity === 'legendary');
        });
        expect(Ingredients[Ingredient.GOLDLEAF].shelfLifeMs).toBe(3 * 24 * 60 * 60 * 1000);
    });
});

describe('choclabCost', () => {
    test('a normal level costs the former coin price in cocoa only', () => {
        expect(choclabCost(EntityType.FACTORY, 0)).toEqual({ cocoa: 102, ingredients: {} });
    });

    test('milestone levels add the special ingredient, vanilla and gold leaf', () => {
        expect(choclabCost(EntityType.RUM_TRUFFLE_CANNON, 4).ingredients).toEqual({ RUM: 5 });
        expect(choclabCost(EntityType.RUM_TRUFFLE_CANNON, 9).ingredients).toEqual({ RUM: 10, VANILLA: 1 });
        expect(choclabCost(EntityType.RUM_TRUFFLE_CANNON, 14).ingredients).toEqual({ RUM: 15, VANILLA: 2 });
        expect(choclabCost(EntityType.RUM_TRUFFLE_CANNON, 19).ingredients).toEqual({ RUM: 20, VANILLA: 3, GOLDLEAF: 1 });
    });

    test('rare special ingredients are needed at a fifth, rounded up', () => {
        expect(choclabCost(EntityType.SPYING_EASTER_BUNNY, 4).ingredients).toEqual({ MARZIPAN: 1 });
        expect(choclabCost(EntityType.SPYING_EASTER_BUNNY, 19).ingredients).toEqual({ MARZIPAN: 4, VANILLA: 3, GOLDLEAF: 1 });
    });

    test('every upgradable building has a special ingredient', () => {
        const { EmptyPlayerStats } = require('../index');
        Object.keys(EmptyPlayerStats.level).forEach(entityType => {
            expect(Object.keys(choclabCost(entityType, 4).ingredients)).toHaveLength(1);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/shared -- progression`
Expected: FAIL, `choclabCost is not a function`.

- [ ] **Step 3: Write the implementation**

```js
// packages/shared/ingredients.js
// Ingredients: game items stored by the server, found after verified online matches.
// They are not tokens and cannot be traded. Rare and legendary ones spoil.

const DAY_MS = 24 * 60 * 60 * 1000;

const Rarity = Object.freeze({ COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare', LEGENDARY: 'legendary' });

const Ingredient = Object.freeze({
    COCOA: 'COCOA',
    SUGAR: 'SUGAR',
    MILK: 'MILK',
    HAZELNUTS: 'HAZELNUTS',
    RUM: 'RUM',
    CHERRIES: 'CHERRIES',
    CREAM: 'CREAM',
    MARZIPAN: 'MARZIPAN',
    CINNAMON: 'CINNAMON',
    SPRINKLES: 'SPRINKLES',
    VANILLA: 'VANILLA',
    GOLDLEAF: 'GOLDLEAF',
});

const define = (id, rarity, shelfLifeDays = null) => [id, Object.freeze({
    id,
    rarity,
    shelfLifeMs: shelfLifeDays === null ? null : shelfLifeDays * DAY_MS,
})];

const Ingredients = Object.freeze(Object.fromEntries([
    define(Ingredient.COCOA, Rarity.COMMON),
    define(Ingredient.SUGAR, Rarity.COMMON),
    define(Ingredient.MILK, Rarity.COMMON),
    define(Ingredient.HAZELNUTS, Rarity.UNCOMMON),
    define(Ingredient.RUM, Rarity.UNCOMMON),
    define(Ingredient.CHERRIES, Rarity.UNCOMMON),
    define(Ingredient.CREAM, Rarity.UNCOMMON),
    define(Ingredient.MARZIPAN, Rarity.RARE, 14),
    define(Ingredient.CINNAMON, Rarity.RARE, 14),
    define(Ingredient.SPRINKLES, Rarity.RARE, 14),
    define(Ingredient.VANILLA, Rarity.RARE, 7),
    define(Ingredient.GOLDLEAF, Rarity.LEGENDARY, 3),
]));

module.exports = { Rarity, Ingredient, Ingredients };
```

```js
// packages/shared/progression.js
// Progress outside a match: Choclab costs and (Task 3) the ingredient drops after a match.
// Kept apart from balance.js because matches snapshot the balance; none of this belongs in a match.

const { EntityType } = require('./constants');
const { DefaultBalance, valueAt } = require('./balance');
const { Ingredient, Ingredients, Rarity } = require('./ingredients');

const SpecialIngredient = Object.freeze({
    [EntityType.CREAM]: Ingredient.CREAM,
    [EntityType.FACTORY]: Ingredient.MILK,
    [EntityType.FACTORY_EXTENSION]: Ingredient.HAZELNUTS,
    [EntityType.CACAOTREE]: Ingredient.SUGAR,
    [EntityType.RUM_TRUFFLE_CANNON]: Ingredient.RUM,
    [EntityType.FRUIT_CANNON]: Ingredient.CHERRIES,
    [EntityType.SPYING_EASTER_BUNNY]: Ingredient.MARZIPAN,
    [EntityType.XMAS_FACTORY]: Ingredient.CINNAMON,
    [EntityType.HOT_CHOCOLATE_BALLISTA]: Ingredient.CINNAMON,
    [EntityType.CHOCOLATE_FOUNTAIN]: Ingredient.CREAM,
    [EntityType.DONUT_FACTORY]: Ingredient.SPRINKLES,
});

// by the level reached with the upgrade
const ChoclabMilestones = Object.freeze({
    5: { special: 5 },
    10: { special: 10, [Ingredient.VANILLA]: 1 },
    15: { special: 15, [Ingredient.VANILLA]: 2 },
    20: { special: 20, [Ingredient.VANILLA]: 3, [Ingredient.GOLDLEAF]: 1 },
});
const RARE_SPECIAL_DIVISOR = 5;

/** What upgrading `entityType` from `level` to `level + 1` costs. */
const choclabCost = (entityType, level) => {
    const spec = DefaultBalance.entities[entityType] || {};
    const cocoa = spec.coins ? valueAt(spec.coins, level) : 0;
    const milestone = ChoclabMilestones[level + 1];
    const ingredients = {};
    if (milestone) {
        const special = SpecialIngredient[entityType];
        const rare = Ingredients[special].rarity === Rarity.RARE;
        ingredients[special] = rare ? Math.ceil(milestone.special / RARE_SPECIAL_DIVISOR) : milestone.special;
        Object.entries(milestone)
            .filter(([key]) => key !== 'special')
            .forEach(([id, amount]) => { ingredients[id] = (ingredients[id] || 0) + amount; });
    }
    return { cocoa, ingredients };
};

module.exports = { SpecialIngredient, ChoclabMilestones, choclabCost };
```

In `packages/shared/index.js`, next to the other module exports, add:

```js
const ingredients = require('./ingredients');
const progression = require('./progression');
module.exports.Rarity = ingredients.Rarity;
module.exports.Ingredient = ingredients.Ingredient;
module.exports.Ingredients = ingredients.Ingredients;
module.exports.SpecialIngredient = progression.SpecialIngredient;
module.exports.ChoclabMilestones = progression.ChoclabMilestones;
module.exports.choclabCost = progression.choclabCost;
```

The cream has no `coins` in `balance.js`: its cocoa cost is 0, as its coin cost was. If the cream test in Step 1 shows the factory price differs from `getEntityDescriptor(EntityType.FACTORY, level).coins` (`index.js`), use `getEntityDescriptor` lazily instead (`require('./index')` inside the function, like `engine/awards.js` does for translations), because the Choclab page shows that value.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w packages/shared -- progression`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/ingredients.js packages/shared/progression.js packages/shared/index.js packages/shared/tests/progression.test.js
git commit -m "feat(shared): ingredient catalogue and Choclab costs in ingredients"
```

---

### Task 2: Achievements with XP, losers and 14 new ones

**Files:**
- Modify: `packages/shared/engine/awards.js`
- Test: `packages/shared/tests/engine/awards.test.js` (new)

**Interfaces:**
- Consumes: engine `OutcomeReason`, `DonutEffect`, `entitiesOf`, `MatchPhase`; test helpers `runningMatch`, `place`, `act`, `expectOk` from `tests/engine/helper.js`.
- Produces: each award `{ key, title, subtitle, xp, who: 'W' | 'B', coins (= xp, removed in Task 13), isFulfilled }`; `computeMatchAwards(match, playerIndex)` → the five most valuable fulfilled awards the player may earn (W only for winners; a draw makes both winners), sorted ascending by `xp`; `isMatchWinner(match, playerIndex)`.

- [ ] **Step 1: Write the failing tests**

```js
// packages/shared/tests/engine/awards.test.js
const { engine, EntityType, AttackType } = require('../../index');
const { runningMatch, place, act, expectOk } = require('./helper');

const keys = (match, player) => engine.computeMatchAwards(match, player).map(award => award.key);
const end = (match, winners, reason = engine.OutcomeReason.TIME_LIMIT) => {
    match.phase = engine.MatchPhase.ENDED;
    match.outcome = { winners, reason, t: match.t };
};

describe('achievements', () => {
    test('every achievement has an xp value and a who flag', () => {
        engine.matchAwards.forEach(award => {
            expect(Number.isInteger(award.xp)).toBe(true);
            expect(['W', 'B']).toContain(award.who);
        });
        expect(engine.matchAwards.map(award => award.key)).toEqual(expect.arrayContaining([
            'GOODSPORT', 'SURVIVOR', 'SWEETTOOTH', 'CHOCOHOLIC', 'PATIENCE', 'CANTWAIT', 'SHARPSHOOTER',
            'SHIELDWALL', 'FORTRESS', 'TRAPPER', 'SUGARRUSH', 'PORTALHOPPER', 'BUNNYCATCHER', 'CLOSECALL', 'UNTOUCHED',
        ]));
    });

    test('losers earn the achievements open to both players, never the winner ones', () => {
        const match = runningMatch();
        end(match, [0]);
        expect(keys(match, 0)).toEqual(expect.arrayContaining(['WINNER', 'SURVIVOR', 'GOODSPORT']));
        expect(keys(match, 1)).toEqual(expect.arrayContaining(['SURVIVOR', 'GOODSPORT']));
        expect(keys(match, 1)).not.toContain('WINNER');
    });

    test('a draw makes both players winners', () => {
        const match = runningMatch();
        end(match, [0, 1]);
        expect(keys(match, 0)).toContain('WINNER');
        expect(keys(match, 1)).toContain('WINNER');
        expect(engine.isMatchWinner(match, 1)).toBe(true);
    });

    test('a player who surrendered is no good sport', () => {
        const match = runningMatch();
        end(match, [0], engine.OutcomeReason.SURRENDER);
        expect(keys(match, 1)).not.toContain('GOODSPORT');
        expect(keys(match, 0)).toContain('GOODSPORT');
    });

    test('statistics achievements', () => {
        const match = runningMatch();
        Object.assign(match.players[0].statistics, { producedCacao: 3200, shotsFired: 12, shotsHit: 11, rushes: 0 });
        Object.assign(match.players[1].statistics, { producedCacao: 1100, shotsFired: 12, shotsHit: 2, rushes: 10 });
        end(match, [0]);
        const all = player => engine.matchAwards.filter(a => a.isFulfilled(match, player)).map(a => a.key);
        expect(all(0)).toEqual(expect.arrayContaining(['CHOCOHOLIC', 'SWEETTOOTH', 'SHARPSHOOTER', 'PATIENCE']));
        expect(all(1)).toEqual(expect.arrayContaining(['SWEETTOOTH', 'CANTWAIT']));
        expect(all(1)).not.toContain('SHARPSHOOTER');
    });

    test('defence achievements read the opponent attacks', () => {
        const match = runningMatch();
        const attack = (traps, extra = {}) => match.events.push({
            seq: match.eventSeq++, t: match.t, type: 'attack', player: 1, visibleTo: [0, 1],
            data: { attackType: AttackType.TRUFFLE, row: 1, col: 1, rushCost: 0,
                result: { shielded: false, traps, hits: [], destroyed: [], revealed: [], caught: false, ...extra } },
            secret: { targetBefore: [], oneShot: false },
        });
        for (let i = 0; i < 15; i++) {
            attack([], { shielded: true });
        }
        attack([engine.DonutEffect.PINK, engine.DonutEffect.PORTAL, engine.DonutEffect.GREEN]);
        end(match, [0]);
        const all = engine.matchAwards.filter(a => a.isFulfilled(match, 0)).map(a => a.key);
        expect(all).toEqual(expect.arrayContaining(['SHIELDWALL', 'FORTRESS', 'TRAPPER', 'SUGARRUSH', 'PORTALHOPPER', 'UNTOUCHED']));
    });

    test('close call and untouched look at the own factory', () => {
        const match = runningMatch();
        const factory = engine.entitiesOf(match, 0).find(entity => entity.type === EntityType.FACTORY);
        factory.hp = Math.floor(factory.maxHp * 0.1);
        match.events.push({
            seq: match.eventSeq++, t: match.t, type: 'attack', player: 1, visibleTo: [0, 1],
            data: { attackType: AttackType.TRUFFLE, row: 0, col: 0, rushCost: 0,
                result: { shielded: false, traps: [], hits: [{ entityType: EntityType.FACTORY, hpBefore: factory.maxHp, hpAfter: factory.hp }],
                    destroyed: [], revealed: [], caught: false } },
            secret: { targetBefore: [EntityType.FACTORY], oneShot: false },
        });
        end(match, [0]);
        const all = engine.matchAwards.filter(a => a.isFulfilled(match, 0)).map(a => a.key);
        expect(all).toContain('CLOSECALL');
        expect(all).not.toContain('UNTOUCHED');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/shared -- awards`
Expected: FAIL (`award.xp` undefined, new keys missing).

- [ ] **Step 3: Implement**

In `packages/shared/engine/awards.js`:

1. Import `OutcomeReason` and `DonutEffect`: `const { MatchPhase, OutcomeReason, DonutEffect, entitiesOf } = require('./index');`.
2. Replace the `award` helper:

```js
const award = (key, xp, who, isFulfilled) => ({
    key,
    title: tr(`AWARDS_${key}_TITLE`),
    subtitle: tr(`AWARDS_${key}_SUBTITLE`),
    xp,
    who,
    // the former name of the value; removed once every consumer reads xp
    coins: xp,
    isFulfilled,
});
const W = 'W';
const B = 'B';
```

3. Give every existing award its `who` from the spec table (`award('WINNER', 25, W, …)`, `award('NERD', 50, B, …)`, …). W: WINNER, RUSHHOUR, MINIMALIST, HINDSIGHT, OMG, CONCRETEJUNGLE, OUVERT. All others B.
4. Add helpers and the new awards at the end of the list:

```js
const stats = (m, p) => m.players[p].statistics;
const opponentAttacks = (m, p) => attacksOf(m, 1 - p);
const trapsTriggered = (m, p) => opponentAttacks(m, p).flatMap(event => event.data.result.traps);
const ownFactory = (m, p) => entitiesOf(m, p).find(entity => entity.type === EntityType.FACTORY);
const surrendered = (m, p) => m.outcome.reason === OutcomeReason.SURRENDER && !m.outcome.winners.includes(p);

// new in the ingredient update (2026-10)
award('GOODSPORT', 30, B, (m, p) => !surrendered(m, p)),
award('SURVIVOR', 150, B, m => m.outcome.reason === OutcomeReason.TIME_LIMIT),
award('SWEETTOOTH', 100, B, (m, p) => stats(m, p).producedCacao >= 1000),
award('CHOCOHOLIC', 400, B, (m, p) => stats(m, p).producedCacao >= 3000),
award('PATIENCE', 150, W, (m, p) => stats(m, p).shotsFired >= 5 && stats(m, p).rushes === 0),
award('CANTWAIT', 50, B, (m, p) => stats(m, p).rushes >= 10),
award('SHARPSHOOTER', 300, B, (m, p) => stats(m, p).shotsFired >= 10 && stats(m, p).shotsHit / stats(m, p).shotsFired >= 0.9),
award('SHIELDWALL', 200, B, (m, p) => opponentAttacks(m, p).filter(event => event.data.result.shielded).length >= 5),
award('FORTRESS', 600, B, (m, p) => opponentAttacks(m, p).filter(event => event.data.result.shielded).length >= 15),
award('TRAPPER', 250, B, (m, p) => trapsTriggered(m, p).length >= 3),
award('SUGARRUSH', 150, B, (m, p) => trapsTriggered(m, p).includes(DonutEffect.PINK)),
award('PORTALHOPPER', 200, B, (m, p) => trapsTriggered(m, p).includes(DonutEffect.PORTAL)),
award('BUNNYCATCHER', 400, B, (m, p) => attacksOf(m, 1 - p, AttackType.BUNNY).some(event => event.data.result.caught)),
award('CLOSECALL', 300, W, (m, p) => {
    const factory = ownFactory(m, p);
    return typeof factory !== 'undefined' && factory.hp <= 0.1 * factory.maxHp;
}),
award('UNTOUCHED', 250, W, (m, p) => !opponentAttacks(m, p).some(event =>
    event.data.result.hits.some(hit => hit.entityType === EntityType.FACTORY && hit.hpAfter < hit.hpBefore))),
```

(`stats`, `opponentAttacks`, `trapsTriggered`, `ownFactory`, `surrendered` go above the `awards` array.)

5. Replace `computeMatchAwards` and export `isMatchWinner`:

```js
const isMatchWinner = (match, playerIndex) => Boolean(match.outcome) && match.outcome.winners.includes(playerIndex);

/**
 * The achievements of player `playerIndex` in an ended match: the five most valuable ones the
 * player earned (winner-only ones need a win or a draw), sorted ascending by xp.
 */
const computeMatchAwards = (match, playerIndex) => {
    if (match.phase !== MatchPhase.ENDED || !match.outcome) {
        return [];
    }
    const winner = isMatchWinner(match, playerIndex);
    return awards
        .filter(candidate => (candidate.who === B || winner) && candidate.isFulfilled(match, playerIndex))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 5)
        .sort((a, b) => a.xp - b.xp);
};

module.exports = { matchAwards: awards, computeMatchAwards, isMatchWinner };
```

6. In `packages/shared/engine/index.js`, re-export `isMatchWinner` where `computeMatchAwards` is re-exported (search `computeMatchAwards`).
7. The translation keys `AWARDS_<KEY>_TITLE/SUBTITLE` for the new achievements are added in Task 4; until then the titles resolve to the key, which is fine for these tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/shared`
Expected: PASS, including the existing engine tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/engine/awards.js packages/shared/engine/index.js packages/shared/tests/engine/awards.test.js
git commit -m "feat(shared): achievements give xp, losers earn some, 14 new achievements"
```

---

### Task 3: Drop tables and rolling drops

**Files:**
- Modify: `packages/shared/progression.js`, `packages/shared/index.js`
- Test: `packages/shared/tests/progression.test.js`

**Interfaces:**
- Consumes: `Ingredient` (Task 1); achievements `{ key, xp }` (Task 2).
- Produces: `DropTables`, `DropRules`; `achievementXp(achievements, isWinner) → number`; `rollDrops({ achievements, isWinner, opponentIsAi, verifiedMatchesToday, freshBatch, random }) → [{ ingredient, amount, achievement }]` where `random()` returns a number in [0, 1) and `verifiedMatchesToday` counts this match (1 = first of the day).

- [ ] **Step 1: Write the failing tests** (append to `tests/progression.test.js`)

```js
const { rollDrops, achievementXp, DropTables } = require('../index');

// a random source that returns the given values in order, then fails the test
const sequence = (...values) => () => {
    if (values.length === 0) {
        throw new Error('rolled more often than expected');
    }
    return values.shift();
};
const base = { isWinner: true, opponentIsAi: false, verifiedMatchesToday: 1, freshBatch: false };

describe('achievementXp', () => {
    test('losers get half, rounded down', () => {
        const achievements = [{ key: 'A', xp: 25 }, { key: 'B', xp: 50 }];
        expect(achievementXp(achievements, true)).toBe(75);
        expect(achievementXp(achievements, false)).toBe(37);
    });
});

describe('rollDrops', () => {
    test('a hit gives the special ingredient, a miss the cocoa fallback', () => {
        const winner = [{ key: 'WINNER', xp: 25 }];
        expect(rollDrops({ ...base, achievements: winner, random: sequence(0.05) }))
            .toEqual([{ ingredient: 'SUGAR', amount: 3, achievement: 'WINNER' }]);
        expect(rollDrops({ ...base, achievements: winner, random: sequence(0.5) }))
            .toEqual([{ ingredient: 'COCOA', amount: 25, achievement: 'WINNER' }]);
    });

    test('an else entry is only rolled when the one before missed', () => {
        const one = [{ key: 'ONEHITWONDER', xp: 1800 }];
        expect(rollDrops({ ...base, achievements: one, random: sequence(0.1) }))
            .toEqual([{ ingredient: 'GOLDLEAF', amount: 1, achievement: 'ONEHITWONDER' }]);
        expect(rollDrops({ ...base, achievements: one, random: sequence(0.9, 0.2) }))
            .toEqual([{ ingredient: 'VANILLA', amount: 1, achievement: 'ONEHITWONDER' }]);
    });

    test('entries without else are rolled independently', () => {
        const rain = [{ key: 'RAINFOREST', xp: 1000 }];
        expect(rollDrops({ ...base, achievements: rain, random: sequence(0.1, 0.1) })).toEqual([
            { ingredient: 'SUGAR', amount: 5, achievement: 'RAINFOREST' },
            { ingredient: 'VANILLA', amount: 1, achievement: 'RAINFOREST' },
        ]);
    });

    test('losers and AI opponents halve the chances; losers halve the cocoa', () => {
        const winner = [{ key: 'WINNER', xp: 25 }];
        // 0.08 hits 10 % but not 5 % (loser) and not 2.5 % (loser against the AI)
        expect(rollDrops({ ...base, isWinner: false, achievements: winner, random: sequence(0.08) }))
            .toEqual([{ ingredient: 'COCOA', amount: 12, achievement: 'WINNER' }]);
        expect(rollDrops({ ...base, opponentIsAi: true, achievements: winner, random: sequence(0.04) }))
            .toEqual([{ ingredient: 'SUGAR', amount: 3, achievement: 'WINNER' }]);
        expect(rollDrops({ ...base, opponentIsAi: true, isWinner: false, achievements: winner, random: sequence(0.03) }))
            .toEqual([{ ingredient: 'COCOA', amount: 12, achievement: 'WINNER' }]);
    });

    test('daily tiers: full, then half chances, then only half the cocoa', () => {
        const winner = [{ key: 'WINNER', xp: 25 }];
        expect(rollDrops({ ...base, verifiedMatchesToday: 6, achievements: winner, random: sequence(0.07) }))
            .toEqual([{ ingredient: 'COCOA', amount: 25, achievement: 'WINNER' }]);
        expect(rollDrops({ ...base, verifiedMatchesToday: 16, achievements: winner, random: sequence() }))
            .toEqual([{ ingredient: 'COCOA', amount: 12, achievement: 'WINNER' }]);
    });

    test('the first verified match of the day adds a fresh batch of cocoa', () => {
        expect(rollDrops({ ...base, freshBatch: true, achievements: [], random: sequence() }))
            .toEqual([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]);
    });

    test('achievements without a table give only cocoa; amounts below 1 give nothing', () => {
        expect(rollDrops({ ...base, isWinner: false, achievements: [{ key: 'PICKY', xp: 1 }], random: sequence() })).toEqual([]);
    });

    test('every table references known ingredients and sane chances', () => {
        const { Ingredients } = require('../index');
        Object.values(DropTables).flat().forEach(entry => {
            expect(Ingredients[entry.ingredient]).toBeDefined();
            expect(entry.chance).toBeGreaterThan(0);
            expect(entry.chance).toBeLessThanOrEqual(1);
            expect(Number.isInteger(entry.amount)).toBe(true);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/shared -- progression`
Expected: FAIL, `rollDrops is not a function`.

- [ ] **Step 3: Implement** (append to `progression.js`, export the new names, re-export them in `index.js` like Task 1)

```js
const entry = (ingredient, chance, amount = 1, orElse = false) => Object.freeze({ ingredient, chance, amount, else: orElse });
const I = Ingredient;

// per achievement key: entries in order; `else` entries are rolled only when the one before missed
const DropTables = Object.freeze({
    WINNER: [entry(I.SUGAR, 0.10, 3)],
    GREEDY: [entry(I.MILK, 0.05, 3)],
    STRATEGIST: [entry(I.MILK, 0.05, 3)],
    GREENSPOT: [entry(I.SUGAR, 0.05, 2)],
    SMALLOFFENSIVE: [entry(I.RUM, 0.05, 1)],
    REFILLED: [entry(I.CREAM, 0.08, 1)],
    NERD: [entry(I.SUGAR, 0.15, 3)],
    RANDOMFOREST: [entry(I.SUGAR, 0.10, 3)],
    SETTLER: [entry(I.MILK, 0.08, 2)],
    UPGRADE: [entry(I.CHERRIES, 0.15, 2)],
    SPY: [entry(I.MARZIPAN, 0.08, 1)],
    UNUSED: [entry(I.MARZIPAN, 0.03, 1)],
    OFFENSIVE: [entry(I.RUM, 0.12, 2)],
    RUSHHOUR: [entry(I.RUM, 0.20, 2)],
    GROUNDHOGDAY: [entry(I.MARZIPAN, 0.12, 1)],
    PERSONALCONCERN: [entry(I.CREAM, 0.20, 2)],
    MINIMALIST: [entry(I.RUM, 0.25, 2)],
    FIRSTCOMEFIRSTSERVED: [entry(I.RUM, 0.20, 2)],
    UNBREAKABLE: [entry(I.CREAM, 0.15, 2)],
    GOLDENMULTIPLAYERBONUS: [entry(I.CREAM, 0.20, 2)],
    MOLTEN: [entry(I.CINNAMON, 0.25, 1)],
    SECRETAGENT: [entry(I.MARZIPAN, 0.40, 1)],
    DIAMONDMULTIPLAYERBONUS: [entry(I.CREAM, 0.40, 2), entry(I.VANILLA, 0.15, 1)],
    CONCRETEJUNGLE: [entry(I.HAZELNUTS, 0.30, 3)],
    MRGLASS: [entry(I.CHERRIES, 0.30, 3)],
    REPEATOFFENDER: [entry(I.MARZIPAN, 0.50, 1)],
    OUVERT: [entry(I.MILK, 0.40, 5)],
    HINDSIGHT: [entry(I.VANILLA, 0.40, 1)],
    RAINFOREST: [entry(I.SUGAR, 0.70, 5), entry(I.VANILLA, 0.30, 1)],
    HORCRUXES: [entry(I.HAZELNUTS, 0.60, 5)],
    MAJOROFFENSIVE: [entry(I.RUM, 0.70, 5), entry(I.GOLDLEAF, 0.10, 1)],
    ONEHITWONDER: [entry(I.GOLDLEAF, 0.15, 1), entry(I.VANILLA, 0.50, 1, true)],
    OMG: [entry(I.GOLDLEAF, 0.25, 1), entry(I.VANILLA, 0.60, 1, true)],
    SURVIVOR: [entry(I.SUGAR, 0.15, 3)],
    SWEETTOOTH: [entry(I.SUGAR, 0.15, 3)],
    CHOCOHOLIC: [entry(I.SUGAR, 0.40, 5), entry(I.VANILLA, 0.10, 1)],
    PATIENCE: [entry(I.CREAM, 0.15, 2)],
    CANTWAIT: [entry(I.RUM, 0.10, 1)],
    SHARPSHOOTER: [entry(I.CHERRIES, 0.25, 3)],
    SHIELDWALL: [entry(I.CREAM, 0.30, 3)],
    FORTRESS: [entry(I.CREAM, 0.60, 5), entry(I.VANILLA, 0.10, 1)],
    TRAPPER: [entry(I.SPRINKLES, 0.25, 1)],
    SUGARRUSH: [entry(I.SPRINKLES, 0.15, 1)],
    PORTALHOPPER: [entry(I.SPRINKLES, 0.20, 1)],
    BUNNYCATCHER: [entry(I.CINNAMON, 0.40, 1)],
    CLOSECALL: [entry(I.VANILLA, 0.15, 1)],
    UNTOUCHED: [entry(I.MILK, 0.25, 3)],
});

const DropRules = Object.freeze({
    fallback: I.COCOA,
    loserChance: 0.5,
    loserFallback: 0.5,
    aiChance: 0.5,
    freshBatchCocoa: 100,
    // by the number of verified matches of the day (this one included); upTo null = no limit
    daily: [
        { upTo: 5, chance: 1, fallback: 1 },
        { upTo: 15, chance: 0.5, fallback: 1 },
        { upTo: null, chance: 0, fallback: 0.5 },
    ],
});

const achievementXp = (achievements, isWinner) => {
    const sum = achievements.reduce((total, achievement) => total + achievement.xp, 0);
    return isWinner ? sum : Math.floor(sum / 2);
};

const rollDrops = ({ achievements, isWinner, opponentIsAi, verifiedMatchesToday, freshBatch, random }) => {
    const tier = DropRules.daily.find(t => t.upTo === null || verifiedMatchesToday <= t.upTo);
    const chanceFactor = tier.chance * (isWinner ? 1 : DropRules.loserChance) * (opponentIsAi ? DropRules.aiChance : 1);
    const fallbackFactor = tier.fallback * (isWinner ? 1 : DropRules.loserFallback);
    const drops = [];
    achievements.forEach(({ key, xp }) => {
        let hit = false;
        let previousHit = false;
        (DropTables[key] || []).forEach(candidate => {
            if (candidate.else && previousHit) {
                return;
            }
            const chance = candidate.chance * chanceFactor;
            previousHit = chance > 0 && random() < chance;
            if (previousHit) {
                hit = true;
                drops.push({ ingredient: candidate.ingredient, amount: candidate.amount, achievement: key });
            }
        });
        const cocoa = Math.floor(xp * fallbackFactor);
        if (!hit && cocoa > 0) {
            drops.push({ ingredient: DropRules.fallback, amount: cocoa, achievement: key });
        }
    });
    if (freshBatch) {
        drops.push({ ingredient: DropRules.fallback, amount: DropRules.freshBatchCocoa, achievement: 'FRESHBATCH' });
    }
    return drops;
};
```

Exports: `module.exports = { SpecialIngredient, ChoclabMilestones, choclabCost, DropTables, DropRules, achievementXp, rollDrops };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/shared -- progression`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/progression.js packages/shared/index.js packages/shared/tests/progression.test.js
git commit -m "feat(shared): drop tables per achievement with cocoa fallback and daily tiers"
```

---

### Task 4: Glicko-2, protocol and translations

**Files:**
- Create: `packages/shared/rating.js`, `packages/shared/tests/rating.test.js`
- Modify: `packages/shared/live/protocol.js`, `packages/shared/index.js`, `packages/shared/translations/*_strings.js` (8 files)
- Test: `packages/shared/tests/translations.test.js` (existing, must keep passing)

**Interfaces:**
- Produces: `updateRating(player, results, tau = 0.5)` with `player = { rating, deviation, volatility }`, `results = [{ opponent: { rating, deviation }, score }]`; `rateMatch(a, b, scoreA) → [newA, newB]`; `ClientMessage.QUEUE_AI = 'queue.ai'`; `LiveDefaults.aiFallbackMs = 15000`; translation keys listed in Step 5.

- [ ] **Step 1: Write the failing rating test**

```js
// packages/shared/tests/rating.test.js
const { updateRating, rateMatch } = require('../index');

test('Glicko-2 matches the example in Glickman (2012)', () => {
    const result = updateRating({ rating: 1500, deviation: 200, volatility: 0.06 }, [
        { opponent: { rating: 1400, deviation: 30 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300 }, score: 0 },
    ]);
    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.deviation).toBeCloseTo(151.52, 1);
    expect(result.volatility).toBeCloseTo(0.05999, 4);
});

test('rateMatch: the winner gains what is fair, a draw between equals changes little', () => {
    const fresh = { rating: 1500, deviation: 350, volatility: 0.06 };
    const [winner, loser] = rateMatch(fresh, fresh, 1);
    expect(winner.rating).toBeGreaterThan(1500);
    expect(loser.rating).toBeLessThan(1500);
    const [a, b] = rateMatch(fresh, fresh, 0.5);
    expect(a.rating).toBeCloseTo(1500, 5);
    expect(b.rating).toBeCloseTo(1500, 5);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w packages/shared -- rating`
Expected: FAIL, `updateRating is not a function`.

- [ ] **Step 3: Implement**

```js
// packages/shared/rating.js
// Glicko-2 (Glickman 2012): a rating, its deviation (how uncertain it is) and the volatility.

const SCALE = 173.7178;
const EPSILON = 0.000001;

const g = phi => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muOpponent, phiOpponent) => 1 / (1 + Math.exp(-g(phiOpponent) * (mu - muOpponent)));

const updateRating = ({ rating, deviation, volatility }, results, tau = 0.5) => {
    const mu = (rating - 1500) / SCALE;
    const phi = deviation / SCALE;
    if (results.length === 0) {
        return { rating, deviation: Math.min(350, Math.sqrt(phi * phi + volatility * volatility) * SCALE), volatility };
    }
    const opponents = results.map(result => ({
        mu: (result.opponent.rating - 1500) / SCALE,
        phi: result.opponent.deviation / SCALE,
        score: result.score,
    }));
    const v = 1 / opponents.reduce((sum, o) => {
        const e = expected(mu, o.mu, o.phi);
        return sum + g(o.phi) ** 2 * e * (1 - e);
    }, 0);
    const improvement = opponents.reduce((sum, o) => sum + g(o.phi) * (o.score - expected(mu, o.mu, o.phi)), 0);
    const delta = v * improvement;

    const a = Math.log(volatility ** 2);
    const f = x => {
        const ex = Math.exp(x);
        return (ex * (delta ** 2 - phi ** 2 - v - ex)) / (2 * (phi ** 2 + v + ex) ** 2) - (x - a) / tau ** 2;
    };
    let A = a;
    let B;
    if (delta ** 2 > phi ** 2 + v) {
        B = Math.log(delta ** 2 - phi ** 2 - v);
    } else {
        let k = 1;
        while (f(a - k * tau) < 0) {
            k += 1;
        }
        B = a - k * tau;
    }
    let fA = f(A);
    let fB = f(B);
    while (Math.abs(B - A) > EPSILON) {
        const C = A + ((A - B) * fA) / (fB - fA);
        const fC = f(C);
        if (fC * fB <= 0) {
            A = B;
            fA = fB;
        } else {
            fA /= 2;
        }
        B = C;
        fB = fC;
    }
    const sigma = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi ** 2 + sigma ** 2);
    const phiNew = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v);
    const muNew = mu + phiNew ** 2 * improvement;
    return { rating: muNew * SCALE + 1500, deviation: phiNew * SCALE, volatility: sigma };
};

/** New ratings of two players after one match; scoreA is 1, 0.5 or 0. */
const rateMatch = (a, b, scoreA) => [
    updateRating(a, [{ opponent: b, score: scoreA }]),
    updateRating(b, [{ opponent: a, score: 1 - scoreA }]),
];

module.exports = { updateRating, rateMatch };
```

Export `updateRating` and `rateMatch` from `index.js`. In `live/protocol.js`: add `QUEUE_AI: 'queue.ai',` after `QUEUE_LEAVE`, document it in the header comment (`queue.ai {} play against the server AI now (queued or not)`), set `aiFallbackMs: 15000` and update the comment above it, and change the `result` comment to `own outcome, achievements, xp, drops and rating`.

- [ ] **Step 4: Run tests**

Run: `npm test -w packages/shared`
Expected: PASS.

- [ ] **Step 5: Add translations**

Add these keys to `en_strings.js` (English shown) and translate them into `de`, `es`, `fr`, `it`, `jp`, `pt`, `vn` with the same keys. Keep the game's tone (short, playful). `{{…}}` placeholders stay untranslated.

```js
    "START_GAME": "Start",
    "FRIENDS": "Friends",
    "MATCHMAKING_TITLE": "Looking for an opponent…",
    "MATCHMAKING_AI_IN": "An AI joins in {{seconds}} s",
    "MATCHMAKING_PLAY_AI_NOW": "Play the AI now",
    "MATCHMAKING_CANCEL": "Cancel",
    "END_XP": "XP",
    "END_BAG_TITLE": "Your bag",
    "END_BAG_WAITING": "The server is checking the match…",
    "END_BAG_OFFLINE": "Ingredients only drop in online matches, where the server can verify them.",
    "END_BAG_FROM": "from {{achievement}}",
    "PANTRY_TITLE": "Pantry",
    "PANTRY_SPOILS_IN": "spoils in {{time}}",
    "PANTRY_EMPTY": "Play online matches to find ingredients.",
    "CHOCLAB_NEEDS_CONNECTION": "Upgrades need a connection to the server.",
    "CHOCLAB_NOT_ENOUGH": "Not enough ingredients yet.",
    "INGREDIENT_COCOA": "Cocoa beans",
    "INGREDIENT_SUGAR": "Sugar",
    "INGREDIENT_MILK": "Milk",
    "INGREDIENT_HAZELNUTS": "Hazelnuts",
    "INGREDIENT_RUM": "Rum",
    "INGREDIENT_CHERRIES": "Cherries",
    "INGREDIENT_CREAM": "Cream",
    "INGREDIENT_MARZIPAN": "Marzipan",
    "INGREDIENT_CINNAMON": "Cinnamon",
    "INGREDIENT_SPRINKLES": "Sprinkles",
    "INGREDIENT_VANILLA": "Vanilla",
    "INGREDIENT_GOLDLEAF": "Gold leaf",
    "AWARDS_FRESHBATCH_TITLE": "Fresh batch",
    "AWARDS_FRESHBATCH_SUBTITLE": "Your first online match today",
    "AWARDS_GOODSPORT_TITLE": "Good sport",
    "AWARDS_GOODSPORT_SUBTITLE": "You played the match to its end",
    "AWARDS_SURVIVOR_TITLE": "Survivor",
    "AWARDS_SURVIVOR_SUBTITLE": "The match went the full ten minutes",
    "AWARDS_SWEETTOOTH_TITLE": "Sweet tooth",
    "AWARDS_SWEETTOOTH_SUBTITLE": "You produced 1,000 cacao",
    "AWARDS_CHOCOHOLIC_TITLE": "Chocoholic",
    "AWARDS_CHOCOHOLIC_SUBTITLE": "You produced 3,000 cacao",
    "AWARDS_PATIENCE_TITLE": "Patience",
    "AWARDS_PATIENCE_SUBTITLE": "You won without a single early shot",
    "AWARDS_CANTWAIT_TITLE": "Can't wait",
    "AWARDS_CANTWAIT_SUBTITLE": "You fired ten shots early",
    "AWARDS_SHARPSHOOTER_TITLE": "Sharpshooter",
    "AWARDS_SHARPSHOOTER_SUBTITLE": "Nine out of ten shots hit",
    "AWARDS_SHIELDWALL_TITLE": "Shield wall",
    "AWARDS_SHIELDWALL_SUBTITLE": "Your fountains blocked five hits",
    "AWARDS_FORTRESS_TITLE": "Fortress",
    "AWARDS_FORTRESS_SUBTITLE": "Your fountains blocked fifteen hits",
    "AWARDS_TRAPPER_TITLE": "Trapper",
    "AWARDS_TRAPPER_SUBTITLE": "Your opponent stepped into three donut traps",
    "AWARDS_SUGARRUSH_TITLE": "Sugar rush",
    "AWARDS_SUGARRUSH_SUBTITLE": "A pink donut stunned your opponent",
    "AWARDS_PORTALHOPPER_TITLE": "Portal hopper",
    "AWARDS_PORTALHOPPER_SUBTITLE": "Your portal swapped a hit",
    "AWARDS_BUNNYCATCHER_TITLE": "Bunny catcher",
    "AWARDS_BUNNYCATCHER_SUBTITLE": "Your Xmas factory caught a bunny",
    "AWARDS_CLOSECALL_TITLE": "Close call",
    "AWARDS_CLOSECALL_SUBTITLE": "You won with your factory almost gone",
    "AWARDS_UNTOUCHED_TITLE": "Untouched",
    "AWARDS_UNTOUCHED_SUBTITLE": "Nobody scratched your factory",
```

Also change the existing `COINS_FOR_NEXT_FEATURE_BODY` in all 8 files to say "Win a match to unlock “{{feature}}”." (no coins), keeping the `{{feature}}` placeholder.

- [ ] **Step 6: Run the translation test**

Run: `npm test -w packages/shared -- translations`
Expected: PASS (every key in every language).

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): Glicko-2 rating, queue.ai message and texts for ingredients"
```

---

### Task 5: Database, pantry and transactions

**Files:**
- Create: `apps/api/src/migrations/003_ingredients.sql`, `apps/api/src/pantry.js`, `apps/api/test/pantry.test.js`
- Modify: `apps/api/src/db.js`

**Interfaces:**
- Produces: `withTransaction(pool, fn)` (runs `fn(client)` between BEGIN and COMMIT, ROLLBACK on error); `pantry.add(db, playerId, items, now)`, `pantry.totals(db, playerId, now) → { [ingredient]: amount }`, `pantry.spoiling(db, playerId, now) → [{ ingredient, amount, expiresAt }]`, `pantry.spend(client, playerId, cost, now)` (throws `NotEnoughIngredientsError`), `pantry.NotEnoughIngredientsError`. `db` is a pool or a transaction client; `now` is a millisecond timestamp.

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/test/pantry.test.js
const { createTestPool, closeTestPools } = require('./helper');
const { withTransaction } = require('../src/db');
const pantry = require('../src/pantry');
const players = require('../src/players');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12);
let pool;
let playerId;

beforeEach(async () => {
    pool = await createTestPool();
    playerId = await players.createPlayer(pool);
});
afterAll(closeTestPools);

test('totals add up batches and ignore spoiled ones', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: 100 }, { ingredient: 'COCOA', amount: 20 }], NOW);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 1 }], NOW - 8 * DAY);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 2 }], NOW - DAY);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ COCOA: 120, VANILLA: 2 });
    expect(await pantry.spoiling(pool, playerId, NOW)).toEqual([{ ingredient: 'VANILLA', amount: 2, expiresAt: NOW + 6 * DAY }]);
});

test('spending uses the batches that spoil first and refuses what is missing', async () => {
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 1 }], NOW - 5 * DAY);
    await pantry.add(pool, playerId, [{ ingredient: 'VANILLA', amount: 2 }], NOW - DAY);
    await withTransaction(pool, client => pantry.spend(client, playerId, { VANILLA: 2 }, NOW));
    expect(await pantry.spoiling(pool, playerId, NOW)).toEqual([{ ingredient: 'VANILLA', amount: 1, expiresAt: NOW + 6 * DAY }]);
    await expect(withTransaction(pool, client => pantry.spend(client, playerId, { VANILLA: 2 }, NOW)))
        .rejects.toThrow(pantry.NotEnoughIngredientsError);
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ VANILLA: 1 });
});

test('the migration converts coins into cocoa and score into xp', async () => {
    const { rows } = await pool.query('SELECT xp, rating, rating_deviation, rated_matches, coins FROM players WHERE id = $1', [playerId]);
    expect(rows[0]).toMatchObject({ xp: 0, rating: 1500, rating_deviation: 350, rated_matches: 0, coins: 0 });
});
```

Add a second migration test that creates a player with `coins = 300, score = 450` **before** migration 003 runs. In `apps/api/src/db.js`, check how `migrate` applies files; if it accepts a list or a stop point, use it. Otherwise test the conversion SQL directly: run `UPDATE players SET coins = 300, score = 450`, then execute the conversion statements from `003_ingredients.sql` (the part after `-- conversion`) a second time and assert `xp = 450` and a `COCOA` batch of 300.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/api -- pantry`
Expected: FAIL, `Cannot find module '../src/pantry'`.

- [ ] **Step 3: Write the migration**

```sql
-- apps/api/src/migrations/003_ingredients.sql
-- Ingredients replace coins (2026-10): private XP for progress, a public Glicko-2 rating from
-- verified online matches, and a pantry of ingredient batches (rare ones spoil).

ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN rating DOUBLE PRECISION NOT NULL DEFAULT 1500;
ALTER TABLE players ADD COLUMN rating_deviation DOUBLE PRECISION NOT NULL DEFAULT 350;
ALTER TABLE players ADD COLUMN rating_volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06;
ALTER TABLE players ADD COLUMN rated_matches INTEGER NOT NULL DEFAULT 0;

ALTER TABLE track_records ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE track_records ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

-- one row per batch; expires_at NULL = never spoils
CREATE TABLE pantry (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    ingredient TEXT NOT NULL,
    amount INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX pantry_player ON pantry (player_id);

-- what each verified match gave (for support and balancing)
CREATE TABLE drops (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(id),
    ingredient TEXT NOT NULL,
    amount INTEGER NOT NULL,
    achievement TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- matches whose rating change was applied (once per match)
CREATE TABLE rated_matches (
    match_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- conversion
UPDATE players SET xp = score;
INSERT INTO pantry (id, player_id, ingredient, amount)
    SELECT 'coins:' || id, id, 'COCOA', coins FROM players WHERE coins > 0;
UPDATE players SET coins = 0;
```

If pg-mem rejects any statement, run the test, read the error, and rewrite only that statement (for example `CREATE INDEX` without a name). Keep Postgres semantics identical.

- [ ] **Step 4: Implement `withTransaction` and the pantry**

Append to `apps/api/src/db.js` and export it:

```js
/** Runs fn(client) in a transaction; rolls back and rethrows when fn throws. */
const withTransaction = async (pool, fn) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};
```

```js
// apps/api/src/pantry.js
// A player's ingredients, stored as batches. Spoiling batches carry expires_at; spoiled ones
// stop counting at once and are deleted by `cleanup`.

const crypto = require('crypto');
const { Ingredients } = require('@battlechoc/battlechoc-shared-functions');

class NotEnoughIngredientsError extends Error {
    constructor(ingredient) {
        super(`not enough ${ingredient}`);
        this.ingredient = ingredient;
    }
}

const fresh = 'player_id = $1 AND (expires_at IS NULL OR expires_at > $2)';

const add = async (db, playerId, items, now) => {
    for (const { ingredient, amount } of items) {
        const definition = Ingredients[ingredient];
        if (!definition || !(amount > 0)) {
            continue;
        }
        const expiresAt = definition.shelfLifeMs === null ? null : new Date(now + definition.shelfLifeMs);
        await db.query('INSERT INTO pantry (id, player_id, ingredient, amount, expires_at) VALUES ($1, $2, $3, $4, $5)',
            [crypto.randomUUID(), playerId, ingredient, amount, expiresAt]);
    }
};

const totals = async (db, playerId, now) => {
    const { rows } = await db.query(
        `SELECT ingredient, SUM(amount) AS n FROM pantry WHERE ${fresh} GROUP BY ingredient`, [playerId, new Date(now)]);
    return Object.fromEntries(rows.map(row => [row.ingredient, Number(row.n)]).filter(([, n]) => n > 0));
};

const spoiling = async (db, playerId, now) => {
    const { rows } = await db.query(
        'SELECT ingredient, amount, expires_at FROM pantry WHERE player_id = $1 AND expires_at > $2 AND amount > 0 ORDER BY expires_at',
        [playerId, new Date(now)]);
    return rows.map(row => ({ ingredient: row.ingredient, amount: Number(row.amount), expiresAt: new Date(row.expires_at).getTime() }));
};

/** Takes `cost` ({ ingredient: amount }) from the batches that spoil first; call inside a transaction. */
const spend = async (client, playerId, cost, now) => {
    for (const [ingredient, needed] of Object.entries(cost)) {
        if (!(needed > 0)) {
            continue;
        }
        const { rows } = await client.query(
            `SELECT id, amount, expires_at FROM pantry WHERE ${fresh} AND ingredient = $3 AND amount > 0`,
            [playerId, new Date(now), ingredient]);
        // earliest expiry first, batches that never spoil last
        rows.sort((a, b) => (a.expires_at === null) - (b.expires_at === null) ||
            new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
        let missing = needed;
        for (const row of rows) {
            if (missing === 0) {
                break;
            }
            const take = Math.min(missing, Number(row.amount));
            await client.query('UPDATE pantry SET amount = amount + $1 WHERE id = $2', [-take, row.id]);
            missing -= take;
        }
        if (missing > 0) {
            throw new NotEnoughIngredientsError(ingredient);
        }
    }
};

const cleanup = async (db, now) => {
    await db.query('DELETE FROM pantry WHERE amount <= 0 OR expires_at <= $1', [new Date(now)]);
};

module.exports = { add, totals, spoiling, spend, cleanup, NotEnoughIngredientsError };
```

- [ ] **Step 5: Run tests**

Run: `npm test -w apps/api -- pantry` and `TEST_DATABASE_URL=… npm test -w apps/api -- pantry` if a local Postgres is available (CI runs both).
Expected: PASS. If pg-mem's transactions do not roll back the partial `UPDATE` in the "refuses what is missing" case, check the totals in the test against Postgres and make `spend` check all ingredients first (sum the fresh amounts per ingredient, throw before any update).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/migrations/003_ingredients.sql apps/api/src/db.js apps/api/src/pantry.js apps/api/test/pantry.test.js
git commit -m "feat(api): pantry of ingredient batches, xp and rating columns, coins converted"
```

---

### Task 6: XP for offline records, stats, Choclab and highscore

**Files:**
- Create: `apps/api/src/xp.js`
- Delete: `apps/api/src/coins.js`
- Modify: `apps/api/src/players.js`, `apps/api/src/app.js`
- Test: `apps/api/test/api.test.js`

**Interfaces:**
- Consumes: `pantry.*`, `withTransaction` (Task 5); `choclabCost` (Task 1); `engine.matchAwards[].xp` (Task 2).
- Produces: `xpOf(record, result)` and `resultOf(record)` in `xp.js`; `players.addTrackRecords(pool, playerId, records)` credits XP only and returns the credited XP; stats `{ …, score: xp, xp, rating, ratedMatches, coins: pantry.COCOA || 0, pantry, spoiling }`; `POST /update/level` → `{ level, pantry, spoiling }`; `GET /user/pantry` → `{ pantry, spoiling }`.

- [ ] **Step 1: Update the tests first**

In `apps/api/test/api.test.js`, describe block `progress`:

1. "finishing the tutorial gives 100 coins once" → expect `stats.xp` +100 and `stats.pantry.COCOA` +100, once.
2. "match results credit server-computed coins once per record" → rename to "offline match records credit xp once per record, never ingredients": post a won record with awards `['WINNER', 'NERD']` and a lost one with `['NERD']`; expect `xp` = 75 + 25 = 100; expect `pantry` unchanged; posting the same records again changes nothing.
3. "an offline profile is imported once without trusting its coins" → keep, assert `xp` instead of coins and that `pantry` is `{}`.
4. "the Choclab upgrades levels for coins" → "the Choclab charges cocoa and milestone ingredients":

```js
test('the Choclab charges cocoa and milestone ingredients', async () => {
    const { token, playerId } = await newAccount();
    const pantry = require('../src/pantry');
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: 1000 }], Date.now());
    const up = () => request(app).post('/update/level').set(auth(token)).send({ entityType: 'EntityType.RUM_TRUFFLE_CANNON', upgrade: true });
    for (let level = 0; level < 4; level++) {
        expect((await up()).status).toBe(200);
    }
    // the 5th level needs 5 rum
    const refused = await up();
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('NOT ENOUGH INGREDIENTS');
    await pantry.add(pool, playerId, [{ ingredient: 'RUM', amount: 5 }], Date.now());
    const ok = await up();
    expect(ok.status).toBe(200);
    expect(ok.body.level['EntityType.RUM_TRUFFLE_CANNON']).toBe(5);
    expect(ok.body.pantry.RUM).toBeUndefined();
});

test('two upgrades at once with ingredients for one: exactly one succeeds', async () => {
    const { token, playerId } = await newAccount();
    const pantry = require('../src/pantry');
    const { choclabCost } = require('@battlechoc/battlechoc-shared-functions');
    await pantry.add(pool, playerId, [{ ingredient: 'COCOA', amount: choclabCost('EntityType.FACTORY', 0).cocoa }], Date.now());
    const up = () => request(app).post('/update/level').set(auth(token)).send({ entityType: 'EntityType.FACTORY', upgrade: true });
    const statuses = (await Promise.all([up(), up()])).map(response => response.status).sort();
    expect(statuses).toEqual([200, 400]);
});
```

(`newAccount`, `auth`, `request`, `app` and `pool` are the helpers already used in this file; if their names differ, use the existing ones.)

5. "ranks, highscore pages…" → players without rated matches are not listed; give two players `rated_matches = 1` and ratings 1600 / 1550 via SQL and expect them in that order and `ranking` 1 and 2.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/api -- api`
Expected: FAIL on the changed expectations.

- [ ] **Step 3: Implement**

`apps/api/src/xp.js` (replaces `coins.js`; same structure, XP instead of coins, losers half):

```js
// XP of a match record the client reports (offline matches): the client says which achievements
// it earned (by key), the server takes their xp from the shared list. Open matches give nothing,
// losers half, a win without any own building (the opponent gave up right away) the surrender XP.

const { engine, SurrenderCosts } = require('@battlechoc/battlechoc-shared-functions');

const achievementXp = new Map(engine.matchAwards.map(award => [award.key, award.xp]));
const MAX_ACHIEVEMENTS = 5;

const resultOf = record => {
    const winners = Array.isArray(record.winners) ? record.winners : [];
    if (record.won === true) {
        return 'won';
    } else if (record.lost === true) {
        return 'lost';
    } else if (winners.length === 2) {
        return 'draw';
    }
    return 'open';
};

const xpOf = (record, result = resultOf(record)) => {
    if (result === 'open') {
        return 0;
    }
    if (result === 'won' && record.builtEntities === 0) {
        return SurrenderCosts;
    }
    const keys = [...new Set((Array.isArray(record.awards) ? record.awards : [])
        .map(award => (typeof award === 'string' ? award : award && award.key))
        .filter(key => achievementXp.has(key)))];
    const xp = keys.map(key => achievementXp.get(key)).sort((a, b) => b - a).slice(0, MAX_ACHIEVEMENTS).reduce((sum, value) => sum + value, 0);
    return result === 'lost' ? Math.floor(xp / 2) : xp;
};

module.exports = { resultOf, xpOf };
```

`apps/api/src/players.js`:
- `require('./xp')` instead of `./coins`; `require('./pantry')`.
- `addTrackRecords`: compute `xpOf`, insert `(id, player_id, record, result, coins, xp)` with `coins = 0`, and at the end `UPDATE players SET xp = xp + $1 WHERE id = $2`. Return the credited XP.
- `stats`: add

```js
        score: player.xp,
        xp: player.xp,
        rating: Math.round(player.rating),
        ratedMatches: player.rated_matches,
        coins: (pantryTotals.COCOA || 0),
        pantry: pantryTotals,
        spoiling: await pantry.spoiling(pool, playerId, Date.now()),
```

with `const pantryTotals = await pantry.totals(pool, playerId, Date.now());` before the return. Keep `coins` = cocoa so the PWA keeps working until Task 12.
- `ranking(pool, rating)`: `SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL AND rated_matches > 0 AND rating > $1`.
- `playerInfo`: `score: player.xp, rating: Math.round(player.rating), ranking: await ranking(pool, player.rating)`.

`apps/api/src/app.js`:
- Tutorial finished: `UPDATE players SET xp = xp + 100 WHERE id = $1 AND tutorial_finished = FALSE` (returning a flag) and, only when that row was updated, `pantry.add(pool, id, [{ ingredient: 'COCOA', amount: 100 }], Date.now())`.
- `/rank`: `players.ranking(pool, req.player.rating)`.
- `/highscore`: filter `rated_matches > 0`, order `rating DESC, username_lower ASC`, page from `ranking(pool, req.player.rating)`.
- `/query/user/:text` order by `rating DESC`; `/random/opponent` filter `xp > 0`.
- `GET /user/pantry`: `res.json({ pantry: await pantry.totals(pool, req.playerId, Date.now()), spoiling: await pantry.spoiling(pool, req.playerId, Date.now()) })`.
- `/update/level`:

```js
    // upgrades run one at a time per player (one API process), each in a transaction
    const upgradeQueues = new Map();
    const oneAtATime = (playerId, task) => {
        const previous = upgradeQueues.get(playerId) || Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        upgradeQueues.set(playerId, next);
        next.finally(() => {
            if (upgradeQueues.get(playerId) === next) {
                upgradeQueues.delete(playerId);
            }
        }).catch(() => {});
        return next;
    };

    app.post('/update/level', ...user, handle(async (req, res) => {
        const { entityType, upgrade } = req.body || {};
        if (!EntityType.isInstanceOf(entityType) || !(entityType in EmptyPlayerStats.level)) {
            res.status(400).json({ error: 'INVALID ENTITY TYPE' });
            return;
        }
        if (upgrade !== true) {
            res.status(400).json({ error: 'ONLY UPGRADES ARE SUPPORTED' });
            return;
        }
        const outcome = await oneAtATime(req.playerId, () => withTransaction(pool, async client => {
            const player = await players.findPlayer(client, req.playerId);
            const level = players.levelOf(player);
            const descriptor = getEntityDescriptor(entityType, level);
            const limit = descriptor.level ? descriptor.level.max - 1 : finalLevel;
            if (level[entityType] + 1 > limit) {
                return { error: 'LEVEL LIMIT REACHED' };
            }
            const cost = choclabCost(entityType, level[entityType]);
            try {
                await pantry.spend(client, req.playerId, { COCOA: cost.cocoa, ...cost.ingredients }, Date.now());
            } catch (error) {
                if (error instanceof pantry.NotEnoughIngredientsError) {
                    return { error: 'NOT ENOUGH INGREDIENTS' };
                }
                throw error;
            }
            const nextLevel = { ...level, [entityType]: level[entityType] + 1 };
            await client.query('UPDATE players SET level = $1 WHERE id = $2', [JSON.stringify(nextLevel), req.playerId]);
            return { level: nextLevel };
        }));
        if (outcome.error) {
            res.status(400).json({ error: outcome.error });
            return;
        }
        res.json({
            level: outcome.level,
            pantry: await pantry.totals(pool, req.playerId, Date.now()),
            spoiling: await pantry.spoiling(pool, req.playerId, Date.now()),
        });
    }));
```

Note: returning `{ error }` from inside the transaction commits nothing harmful because nothing was written before the check that failed; when `spend` fails half-way, throwing would roll back, so instead of returning inside the `catch`, rethrow a marker error and map it outside the transaction:

```js
        let outcome;
        try {
            outcome = await oneAtATime(/* … as above, but let NotEnoughIngredientsError propagate … */);
        } catch (error) {
            if (error instanceof pantry.NotEnoughIngredientsError) {
                res.status(400).json({ error: 'NOT ENOUGH INGREDIENTS' });
                return;
            }
            throw error;
        }
```

Use this second form (the rollback matters). Delete `apps/api/src/coins.js` and fix every `require('./coins')` (`players.js` only; check with `grep -rn "coins')" apps/api/src`).

- [ ] **Step 4: Run tests**

Run: `npm test -w apps/api`
Expected: PASS (all API tests; the live tests may still reference coins — fix in Task 7 if they fail here, by asserting `result.xp` instead).

- [ ] **Step 5: Commit**

```bash
git add -A apps/api
git commit -m "feat(api)!: xp for offline records, Choclab paid in ingredients, highscore by rating"
```

---

### Task 7: Crediting verified matches, rating, and playing the AI now

**Files:**
- Create: `apps/api/src/rewards.js`
- Modify: `apps/api/src/live/room.js` (`resultFor`), `apps/api/src/live/lobby.js`, `apps/api/src/live/index.js`, `apps/api/src/server.js` (only if `liveConfig` hard-codes the AI fallback)
- Test: `apps/api/test/live.test.js`, `apps/api/test/rewards.test.js` (new)

**Interfaces:**
- Consumes: `rollDrops`, `achievementXp`, `rateMatch` (shared); `pantry.add`; track records with `verified`, `xp` (Task 5).
- Produces: `rewards.creditVerifiedMatch(pool, { playerId, record, isWinner, opponentIsAi, now, random }) → { xp, drops } | null` (null when already credited); `rewards.rateMatch(pool, matchId, [playerIdA, playerIdB], scoreA) → { [playerId]: { before, after } } | null`; the live `result` message `{ won, draw, lost, reason, awards: [{ key, xp }], xp, drops, rating }`; `lobby.playAiNow(connection)`.

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/test/rewards.test.js
const { createTestPool, closeTestPools } = require('./helper');
const players = require('../src/players');
const pantry = require('../src/pantry');
const rewards = require('../src/rewards');

const NOW = Date.UTC(2026, 9, 15, 12);
let pool;
beforeEach(async () => { pool = await createTestPool(); });
afterAll(closeTestPools);

const record = (id, awards, won = true) => ({ id, won, lost: !won, online: true, builtEntities: 3, awards,
    opponent: { ai: false }, winners: [] });

test('a verified match is credited once: xp, drops, fresh batch', async () => {
    const playerId = await players.createPlayer(pool);
    const args = { playerId, isWinner: true, opponentIsAi: false, now: NOW, random: () => 0.99 };
    const first = await rewards.creditVerifiedMatch(pool, { ...args, record: record('m1', [{ key: 'WINNER', xp: 25 }]) });
    expect(first.xp).toBe(25);
    expect(first.drops).toEqual([
        { ingredient: 'COCOA', amount: 25, achievement: 'WINNER' },
        { ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' },
    ]);
    expect(await rewards.creditVerifiedMatch(pool, { ...args, record: record('m1', [{ key: 'WINNER', xp: 25 }]) })).toBeNull();
    expect(await pantry.totals(pool, playerId, NOW)).toEqual({ COCOA: 125 });
    const second = await rewards.creditVerifiedMatch(pool, { ...args, record: record('m2', [{ key: 'WINNER', xp: 25 }]) });
    expect(second.drops.map(drop => drop.achievement)).not.toContain('FRESHBATCH');
});

test('the sixth verified match of a day rolls with half the chance', async () => {
    const playerId = await players.createPlayer(pool);
    for (let i = 0; i < 5; i++) {
        await rewards.creditVerifiedMatch(pool, { playerId, isWinner: true, opponentIsAi: false, now: NOW, random: () => 0.99, record: record(`m${i}`, []) });
    }
    // 0.07 hits WINNER's 10 % but not 5 %
    const sixth = await rewards.creditVerifiedMatch(pool, { playerId, isWinner: true, opponentIsAi: false, now: NOW, random: () => 0.07,
        record: record('m6', [{ key: 'WINNER', xp: 25 }]) });
    expect(sixth.drops).toEqual([{ ingredient: 'COCOA', amount: 25, achievement: 'WINNER' }]);
});

test('a match is rated once', async () => {
    const a = await players.createPlayer(pool);
    const b = await players.createPlayer(pool);
    const change = await rewards.rateMatch(pool, 'm1', [a, b], 1);
    expect(change[a].after).toBeGreaterThan(1500);
    expect(change[b].after).toBeLessThan(1500);
    expect(await rewards.rateMatch(pool, 'm1', [a, b], 1)).toBeNull();
    const { rows } = await pool.query('SELECT id, rated_matches FROM players');
    rows.forEach(row => expect(row.rated_matches).toBe(1));
});
```

In `apps/api/test/live.test.js`, adapt the tests that read `result.coins` to `result.xp` and `result.drops`, and add:

```js
test('queue.ai starts a match against the server AI right away', async () => {
    // follow the pattern of the existing "AI fallback" test in this file: one LiveClient joins the
    // queue, then sends { type: 'queue.ai' } and receives a `match` message without advancing the
    // ManualClock to the fallback time
});
test('the result of a verified match carries xp and drops, and a second end credits nothing', async () => {
    // follow the existing "results are credited once" test: end a match (surrender), read the
    // result message (xp > 0, drops with COCOA), call lobby.matchEnded(room) again and assert the
    // player's pantry total did not change
});
```

Write both tests out fully using the helpers already in `live.test.js` (`LiveClient`, `ManualClock`, `createLive`); the comments say what to assert.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w apps/api -- rewards live`
Expected: FAIL.

- [ ] **Step 3: Implement `rewards.js`**

```js
// apps/api/src/rewards.js
// What a verified (server-hosted) match gives: XP, ingredient drops, and for matches between two
// humans a rating change. Everything is credited once per match and player.

const crypto = require('crypto');
const { achievementXp, rollDrops, rateMatch: rate } = require('@battlechoc/battlechoc-shared-functions');
const pantry = require('./pantry');
const { withTransaction } = require('./db');
const { count } = require('./players');

const startOfUtcDay = now => {
    const date = new Date(now);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const secureRandom = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

const creditVerifiedMatch = (pool, { playerId, record, isWinner, opponentIsAi, now, random = secureRandom }) =>
    withTransaction(pool, async client => {
        const id = `${playerId}:${record.id}`;
        if (await count(client, 'SELECT COUNT(*) AS n FROM track_records WHERE id = $1', [id]) > 0) {
            return null;
        }
        const earlierToday = await count(client,
            'SELECT COUNT(*) AS n FROM track_records WHERE player_id = $1 AND verified = TRUE AND created_at >= $2',
            [playerId, startOfUtcDay(now)]);
        const achievements = (record.awards || []).map(({ key, xp }) => ({ key, xp }));
        const xp = achievementXp(achievements, isWinner);
        const drops = rollDrops({
            achievements, isWinner, opponentIsAi, verifiedMatchesToday: earlierToday + 1, freshBatch: earlierToday === 0, random,
        });
        const result = record.won ? 'won' : record.lost ? 'lost' : 'draw';
        await client.query(
            'INSERT INTO track_records (id, player_id, record, result, coins, xp, verified, created_at) VALUES ($1, $2, $3, $4, 0, $5, TRUE, $6)',
            [id, playerId, JSON.stringify(record), result, xp, new Date(now)]);
        await pantry.add(client, playerId, drops, now);
        for (const drop of drops) {
            await client.query('INSERT INTO drops (id, match_id, player_id, ingredient, amount, achievement) VALUES ($1, $2, $3, $4, $5, $6)',
                [crypto.randomUUID(), record.id, playerId, drop.ingredient, drop.amount, drop.achievement]);
        }
        await client.query('UPDATE players SET xp = xp + $1 WHERE id = $2', [xp, playerId]);
        return { xp, drops };
    });

const rateMatch = (pool, matchId, [a, b], scoreA) => withTransaction(pool, async client => {
    if (await count(client, 'SELECT COUNT(*) AS n FROM rated_matches WHERE match_id = $1', [matchId]) > 0) {
        return null;
    }
    await client.query('INSERT INTO rated_matches (match_id) VALUES ($1)', [matchId]);
    const load = async id => {
        const { rows } = await client.query('SELECT rating, rating_deviation, rating_volatility FROM players WHERE id = $1', [id]);
        return { rating: Number(rows[0].rating), deviation: Number(rows[0].rating_deviation), volatility: Number(rows[0].rating_volatility) };
    };
    const before = [await load(a), await load(b)];
    const after = rate(before[0], before[1], scoreA);
    const change = {};
    for (const [index, id] of [a, b].entries()) {
        await client.query(
            'UPDATE players SET rating = $1, rating_deviation = $2, rating_volatility = $3, rated_matches = rated_matches + 1 WHERE id = $4',
            [after[index].rating, after[index].deviation, after[index].volatility, id]);
        change[id] = { before: Math.round(before[index].rating), after: Math.round(after[index].rating) };
    }
    return change;
});

module.exports = { creditVerifiedMatch, rateMatch, startOfUtcDay };
```

`players.count` must accept a client as well as a pool (it only calls `.query`); no change needed.

- [ ] **Step 4: Wire it into the live service**

`room.js` `resultFor`: map awards to `{ key: award.key, xp: award.xp }`.

`lobby.js` `matchEnded(room)`:

```js
    matchEnded(room) {
        const humans = room.humanIndexes();
        humans.forEach(index => {
            const playerId = room.playerIds[index];
            if (this.activeMatch.get(playerId) === room.id) {
                this.activeMatch.delete(playerId);
            }
        });
        room.write(async () => {
            const { winners } = room.match.outcome;
            let ratings = {};
            if (humans.length === 2) {
                const scoreA = winners.length === 2 ? 0.5 : winners[0] === 0 ? 1 : 0;
                ratings = (await rewards.rateMatch(this.pool, room.id, room.playerIds, scoreA)) || {};
            }
            for (const index of humans) {
                const playerId = room.playerIds[index];
                const { record, ...result } = room.resultFor(index);
                const credit = await rewards.creditVerifiedMatch(this.pool, {
                    playerId,
                    record,
                    isWinner: winners.includes(index),
                    opponentIsAi: record.opponent.ai,
                    now: this.clock.now(),
                    random: this.random,
                });
                room.sendTo(index, {
                    type: ServerMessage.RESULT,
                    matchId: room.id,
                    result: { ...result, xp: credit ? credit.xp : 0, drops: credit ? credit.drops : [], rating: ratings[playerId] },
                });
            }
        });
        this.clock.setTimer(() => {
            if (this.rooms.get(room.id) === room) {
                this.rooms.delete(room.id);
            }
        }, this.config.endedRoomLingerMs);
    }
```

Add `this.random = deps.random || undefined;` in the Lobby constructor (undefined → `rewards` uses the secure default) and pass `random` through `createLive` deps for tests. `require('../rewards')` at the top; remove the `players.addTrackRecords` call here.

`playerSetup`: `score: row.xp`.

`playAiNow(connection)`:

```js
    async playAiNow(connection) {
        const { playerId } = connection;
        if (this.queue.has(playerId)) {
            await this.aiFallback(playerId);
            return;
        }
        if (this.busy(playerId)) {
            connection.sendError(LiveError.ALREADY_IN_MATCH);
            return;
        }
        this.queue.set(playerId, { since: this.clock.now(), timer: null });
        await this.aiFallback(playerId);
    }
```

(`leaveQueue` must tolerate `timer: null`: guard `if (entry.timer !== null) this.clock.clearTimer(entry.timer);`.)

`live/index.js`: `[ClientMessage.QUEUE_AI]: connection => lobby.playAiNow(connection),`.

If `server.js` `liveConfig` sets the AI fallback from `LiveDefaults`, nothing to change; the env override `LIVE_AI_FALLBACK_MS` keeps working.

- [ ] **Step 5: Run tests**

Run: `npm test -w apps/api`
Expected: PASS, with pg-mem; then with `TEST_DATABASE_URL` against Postgres 17 if available.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api
git commit -m "feat(api): verified matches give xp, ingredient drops and rating changes once"
```

---

### Task 8: Ingredient icons and display components

**Files:**
- Create: `apps/pwa/public/images/ingredients/{cocoa,sugar,milk,hazelnuts,rum,cherries,cream,marzipan,cinnamon,sprinkles,vanilla,goldleaf}.svg`
- Create: `apps/pwa/src/ui/ingredients/IngredientIcon.jsx`, `apps/pwa/src/ui/ingredients/IngredientBag.jsx`
- Modify: `apps/pwa/src/service-worker.js` (precache list)

**Interfaces:**
- Produces: `<IngredientIcon id="VANILLA" size="2em" />`; `<IngredientBag items={[{ ingredient, amount, achievement? }]} greyed={bool} message={string?} />` (merges equal ingredients when `achievement` is absent; shows "from …" when present).

- [ ] **Step 1: Draw the icons**

Each file: `viewBox="0 0 250 250"`, transparent background, the object about 180–200 px wide and centred, soft 3D look like `cacao-icon.svg` (render it next to the new icon to compare): radial/linear gradients for volume, one soft highlight, a darker underside, no strokes. Subjects: a cracked cacao pod with beans (cocoa — reuse the look of `cacao-icon.svg`, smaller variation), a sugar cube pile, a milk bottle, three hazelnuts, a rum bottle with a red label, two cherries on a stem, a cream swirl in a small cup, a pink marzipan pig, two cinnamon sticks, a heap of colourful sprinkles, two vanilla pods with a flower, a crumpled gold leaf with shine. Keep files small (no embedded bitmaps).

Render all twelve side by side at 120 px on the light-blue game background (`#9DD5E9`) with a headless Playwright script in the scratchpad (never a visible browser) and check that each reads clearly at 40 px.

- [ ] **Step 2: Components**

```jsx
// apps/pwa/src/ui/ingredients/IngredientIcon.jsx
import React from "react";
import { translate, translationKeys } from "@battlechoc/battlechoc-shared-functions";

const IngredientIcon = ({ id, size = "2em", style }) => (
  <img
    src={`/images/ingredients/${id.toLowerCase()}.svg`}
    alt={translate(translationKeys[`INGREDIENT_${id}`])}
    title={translate(translationKeys[`INGREDIENT_${id}`])}
    style={{ width: size, height: size, ...style }}
    draggable={false}
  />
);

export default IngredientIcon;
```

```jsx
// apps/pwa/src/ui/ingredients/IngredientBag.jsx
import React from "react";
import { createUseStyles } from "react-jss";
import { translate as t, translationKeys as tr } from "@battlechoc/battlechoc-shared-functions";
import IngredientIcon from "./IngredientIcon";

const useStyles = createUseStyles((theme) => ({
  bag: { display: "flex", flexWrap: "wrap", gap: "0.6em", justifyContent: "center", alignItems: "flex-start" },
  greyed: { filter: "grayscale(100%) opacity(50%)" },
  item: {
    display: "flex", flexDirection: "column", alignItems: "center", minWidth: "4.5em",
    fontFamily: "Bangers", color: "white", "-webkit-text-stroke": `1px ${theme.color.secondary.dark}`,
    "& small": { fontFamily: "inherit", fontSize: "0.7em", opacity: 0.9 },
  },
  message: { textAlign: "center", color: "white", maxWidth: "24em", margin: "0.5em auto 0" },
}));

const merge = (items) => {
  const byIngredient = new Map();
  items.forEach(({ ingredient, amount }) => byIngredient.set(ingredient, (byIngredient.get(ingredient) || 0) + amount));
  return [...byIngredient].map(([ingredient, amount]) => ({ ingredient, amount }));
};

const IngredientBag = ({ items = [], greyed = false, message, showSources = true }) => {
  const classes = useStyles();
  const shown = showSources ? items : merge(items);
  return (
    <div data-testid="ingredient-bag">
      <div className={`${classes.bag} ${greyed ? classes.greyed : ""}`}>
        {shown.map((item, index) => (
          <div key={index} className={classes.item} data-ingredient={item.ingredient}>
            <IngredientIcon id={item.ingredient} size="3em" />
            <span>{`×${item.amount}`}</span>
            {item.achievement ? (
              <small>{t(tr.END_BAG_FROM, t(tr[`AWARDS_${item.achievement}_TITLE`]))}</small>
            ) : null}
          </div>
        ))}
      </div>
      {message ? <p className={classes.message}>{message}</p> : null}
    </div>
  );
};

export default IngredientBag;
```

`END_BAG_FROM` takes the achievement as its `{{achievement}}` parameter: add a predicate for it in `packages/shared/index.js` `translationPredicates`, following the pattern of the existing entries with parameters (for example `SURRENDER_GAME_TEXT`), and use the same for `MATCHMAKING_AI_IN` (`{{seconds}}`) and `PANTRY_SPOILS_IN` (`{{time}}`).

- [ ] **Step 3: Precache**

Add the twelve files to the hand-kept list in `apps/pwa/src/service-worker.js` (`{ url: "/images/ingredients/cocoa.svg", revision: "1" }`, …).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/public/images/ingredients apps/pwa/src/ui/ingredients apps/pwa/src/service-worker.js packages/shared/index.js
git commit -m "feat(pwa): ingredient icons and bag component"
```

---

### Task 9: Start button and matchmaking

**Files:**
- Create: `apps/pwa/src/ui/dialogs/Matchmaking.jsx`, `apps/pwa/test/start.spec.js`
- Modify: `apps/pwa/src/match/liveLobby.js`, `apps/pwa/src/App.jsx`, `apps/pwa/src/ui/Hud.jsx`, existing specs that click "Singleplayer" or "Play online"

**Interfaces:**
- Consumes: `ClientMessage.QUEUE_AI` (Task 4); `state.live.status` (`"online"` when connected), `state.live` queue state set by `queueJoined(since)` / `queueLeft()`.
- Produces: `liveLobby.playAiNow()`; `App.startGame()` (passed to Hud as `startGameCallback`); the Hud shows **Start**, **Choclab** and a **Friends** button; `Matchmaking` overlay with `data-testid="matchmaking"`.

- [ ] **Step 1: Write the failing e2e test**

```js
// apps/pwa/test/start.spec.js
import { test, expect } from "@playwright/test";

const seed = (page, stats) =>
  page.evaluate((stats) => new Promise((resolve) => {
    const open = indexedDB.open("battlechoc");
    open.onsuccess = () => {
      const tx = open.result.transaction("player", "readwrite");
      const store = tx.objectStore("player");
      const get = store.get("stats");
      get.onsuccess = () => store.put(Object.assign({}, get.result || {}, stats), "stats");
      tx.oncomplete = () => resolve();
    };
  }), stats);

test("Start without a server plays the local AI within a few seconds", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await expect(page.getByText("Singleplayer", { exact: true })).toHaveCount(0);
  await page.getByText("Start", { exact: true }).first().click();
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host && !window.__battlechoc.host.online, null, { timeout: 8000 });
  await expect(page.getByTestId("matchmaking")).toHaveCount(0);
});
```

and in `online.spec.js` (which runs against the local API on port 8091):

```js
test("Start with a server queues, and 'Play the AI now' starts a server-hosted AI match", async ({ page }) => {
  // set up a player through the public API like the other tests in this file, open the app with
  // battlechoc.apiUrl pointing at the local API, click Start, expect the matchmaking overlay,
  // click "Play the AI now", then wait for window.__battlechoc.host.online === true
});
```

Write the second test out with the helpers already in `online.spec.js`.

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test start.spec.js` (in `apps/pwa`)
Expected: FAIL ("Singleplayer" still exists).

- [ ] **Step 3: Implement**

`liveLobby.js`: add

```js
  playAiNow() {
    this.connection.send({ type: ClientMessage.QUEUE_AI });
  }
```

(match the way `joinQueue` sends; use the same connection field name.)

`App.jsx`, a new method next to `prepareNewGame`:

```js
  // Start: an online match when the live service is reachable (a human or the server AI),
  // otherwise the local AI. New players keep the tutorial and the prepared first match.
  startGame = () => {
    const stats = this.props.playerInfos.stats;
    const newPlayer = !stats.tutorialFinished && !stats.tutorialSkipped;
    if (newPlayer || stats.score <= 100 || !navigator.onLine) {
      this.prepareNewGame(false);
      return;
    }
    const online = () => store.getState().live.status === "online";
    const queue = () => {
      this.setState({ matchmaking: true });
      liveLobby.joinQueue();
    };
    if (online()) {
      queue();
      return;
    }
    let settled = false;
    const unsubscribe = store.subscribe(() => {
      if (!settled && online()) {
        settled = true;
        unsubscribe();
        clearTimeout(timeout);
        queue();
      }
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        this.prepareNewGame(false);
      }
    }, 3000);
  };
```

Use the store the app already has (`matchSession.dispatch` comes from it; import the store module the same way `index.jsx` exposes it, or pass `getState` through `matchSession`). In `startOnlineMatch`, set `this.setState({ matchmaking: false })`. Render `<Matchmaking open={this.state.matchmaking} cancel={() => { liveLobby.leaveQueue(); this.setState({ matchmaking: false }); }} playAiNow={() => liveLobby.playAiNow()} />` next to the Hud. Pass `startGameCallback={this.startGame}` to the Hud.

`Matchmaking.jsx`:

```jsx
import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { translate as t, translationKeys as tr, LiveDefaults } from "@battlechoc/battlechoc-shared-functions";
import { Dialog, Button } from "../misc";

const Matchmaking = ({ open, since, cancel, playAiNow }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [open]);
  const started = typeof since === "number" ? since : now;
  const seconds = Math.max(0, Math.ceil((started + LiveDefaults.aiFallbackMs - now) / 1000));
  return (
    <Dialog open={open} close={cancel} title={t(tr.MATCHMAKING_TITLE)}>
      <div data-testid="matchmaking" style={{ textAlign: "center" }}>
        <p>{t(tr.MATCHMAKING_AI_IN, seconds)}</p>
        <Button onClick={playAiNow}>{t(tr.MATCHMAKING_PLAY_AI_NOW)}</Button>
        <Button color="accent" onClick={cancel}>{t(tr.MATCHMAKING_CANCEL)}</Button>
      </div>
    </Dialog>
  );
};

export default connect((state) => ({ since: state.live.queuedSince }))(Matchmaking);
```

Use the actual field name the `live` slice stores for `queueJoined(since)` (read `match/liveSlice.js`), and the real import path of `Dialog`/`Button` (as `Hud.jsx` imports them). The server's `since` is server time; if it is not comparable with `Date.now()`, count down from when the dialog opened instead.

`Hud.jsx` title screen (non-first-play branch): replace the Singleplayer and Play online buttons with

```jsx
            controls.push(
              <Button className={classes.menuButton} key="0" size="huge" onClick={() => (resumeGamePossible ? setOpen(true) : props.startGameCallback())}>
                {t(tr.START_GAME)}
              </Button>
            );
```

keep the Choclab button, and add a small Friends button (size `"small"`, color `"secondary"`, `locked={unnamed}`, `onLockedClick={() => notifyLocked(t(tr.FRIENDS))}`) that opens the existing `OnlineLobby` dialog. The resume dialog's "New game" button calls `props.startGameCallback()` instead of `prepareNewGameCallback(false)`. Add `startGameCallback: PropTypes.func.isRequired`.

Update existing specs that click `"Singleplayer"` (`realtime.spec.js` `startMatch`, `iphone.spec.js`, `dev.spec.js`, `locked.spec.js` …) to click `"Start"`; those run without a server, so the local AI starts after at most 3 s. Specs that open the online lobby with "Play online" use the Friends button or the Start flow.

- [ ] **Step 4: Run tests**

Run: `npm run build && npm test -w apps/pwa`
Expected: PASS (the known flaky `locked.spec.js` test may need a rerun).

- [ ] **Step 5: Commit**

```bash
git add -A apps/pwa
git commit -m "feat(pwa)!: one Start button with matchmaking, the server AI and an offline fallback"
```

---

### Task 10: End screen with XP and the ingredient bag

**Files:**
- Modify: `apps/pwa/src/ui/controls/GameEndOverview.jsx`, `apps/pwa/src/App.jsx` (`showRealtimeOverview`, `endGame`), the component that renders `GameEndOverview` (find with `grep -rn "GameEndOverview" apps/pwa/src`), `apps/pwa/src/match/matchSlice.js` if the online result is stored there
- Test: `apps/pwa/test/realtime.spec.js`, `apps/pwa/test/online.spec.js`

**Interfaces:**
- Consumes: online `result { xp, drops, awards: [{ key, xp }] }` (Task 7); local awards from `engine.computeMatchAwards` with `xp`; `IngredientBag` (Task 8).
- Produces: `GameEndOverview` props `{ outcome, awards, verified, drops, finishGame(xp) }` where `drops` is `undefined` while the online result is pending.

- [ ] **Step 1: Write the failing tests**

In `realtime.spec.js`, extend the test that ends a single player match: after the end screen appears, expect `page.getByTestId("ingredient-bag")` to contain the text of `END_BAG_OFFLINE` ("Ingredients only drop in online matches") and the counter to show XP (no coin icon: `page.locator('[class*="coins"]')` has count 0 inside the overview).

In `online.spec.js`, extend the AI-fallback test: after the match ends (surrender), expect the bag to list at least one item with `data-ingredient="COCOA"` and the text "from".

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test realtime.spec.js online.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `GameEndOverview.jsx`: rename the `coins` sum to `xp` (`awards.reduce((sum, a) => sum + a.xp, 0)`; losers see half: pass `isWinner` and use `Math.floor(sum / 2)` when false), show `+${entry.xp}` and the title `${title} +${xp}`, replace the coin icon next to the counter with the text `t(tr.END_XP)`. Below the award table, once all awards are shown (`award >= awards.length`), render:

```jsx
        {verified ? (
          <IngredientBag
            items={drops || []}
            message={typeof drops === "undefined" ? t(tr.END_BAG_WAITING) : undefined}
          />
        ) : (
          <IngredientBag items={[{ ingredient: "COCOA", amount: 0 }]} greyed message={t(tr.END_BAG_OFFLINE)} />
        )}
```

and call `props.finishGame(xp)` on done.
- Where the overview gets its props: pass `verified={online}` and `drops={onlineResult ? onlineResult.drops : undefined}`. The online result arrives in `RemoteMatchHost`'s `onEnded(result)` → `App.showRealtimeOverview(result)`; store it (component state or the `match` slice's `result`, whichever the overview already reads) so the bag updates when it arrives.
- `App.endGame(xp)`: the "first coins" check becomes "first XP": `if (xp > 0 && score - xp === 0)` (unchanged logic, renamed variable).

- [ ] **Step 4: Run tests**

Run: `npm run build && npm test -w apps/pwa`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/pwa
git commit -m "feat(pwa): the end screen shows xp and the ingredient bag"
```

---

### Task 11: Choclab paid in ingredients, pantry, no more coins in the interface

**Files:**
- Create: `apps/pwa/src/ui/dialogs/Pantry.jsx`, `apps/pwa/test/choclab.spec.js`
- Modify: `apps/pwa/src/ui/pages/Choclab.jsx`, `apps/pwa/src/ui/Hud.jsx` (title screen coin display), `apps/pwa/src/Multiplayer.jsx` (offline XP estimate)

**Interfaces:**
- Consumes: stats `pantry`, `spoiling`, `xp` (Task 6); `choclabCost` (Task 1); `/update/level` → `{ level, pantry, spoiling }`; `IngredientIcon`, `IngredientBag`.
- Produces: the Choclab shows the cost of the next level as cocoa plus ingredients, disables the upgrade when the pantry lacks something or the app is offline (with `CHOCLAB_NOT_ENOUGH` / `CHOCLAB_NEEDS_CONNECTION`), and a pantry button opens `Pantry` (all ingredients, spoiling batches with "spoils in …").

- [ ] **Step 1: Write the failing e2e test**

```js
// apps/pwa/test/choclab.spec.js — runs against the local API (see online.spec.js for the setup)
test("the Choclab shows ingredient costs and upgrades with ingredients", async ({ page, request }) => {
  // create a player through the public API, finish the tutorial (100 cocoa), open the app with
  // battlechoc.apiUrl, open the Choclab, select the factory, expect the cost "102" next to the
  // cocoa icon and the upgrade button disabled (100 < 102), then credit cocoa through a finished
  // online match against the server AI (as in online.spec.js) and expect the button to enable;
  // click it and expect the level to rise
});
```

Write it out with the `online.spec.js` helpers; if crediting cocoa through a match is too slow, insert pantry rows through a test-only route is **not** allowed — use the match.

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && npx playwright test choclab.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `Choclab.jsx`: `const cost = choclabCost(entityType, props.level[entityType]);` and `const pantry = props.playerInfos.stats.pantry || {};`. `affordable = pantry.COCOA >= cost.cocoa && Object.entries(cost.ingredients).every(([id, n]) => (pantry[id] || 0) >= n)`. `const online = navigator.onLine && props.liveStatus === "online";` (map `state.live.status`). The button is disabled when `!upgradePossible || updateRunning || !affordable || !online`. Inside the button, replace the coin display with `IngredientIcon id="COCOA"` + `cost.cocoa`, then one `IngredientIcon` + amount per milestone ingredient (red text when missing). Under the button show `t(tr.CHOCLAB_NEEDS_CONNECTION)` when offline, else `t(tr.CHOCLAB_NOT_ENOUGH)` when not affordable. On success: `props.updatePlayerStats({ pantry: response.data.pantry, spoiling: response.data.spoiling, coins: response.data.pantry.COCOA || 0 })` and persist the same fields to `OfflineStore.playerStore` `stats` (as the coins were). Replace the top-left coin counter with a pantry button: `IngredientIcon id="COCOA"` + cocoa amount, `onClick` opens `Pantry`. Remove the dead `downgradePossible` code.
- `Pantry.jsx`: a `Dialog` titled `t(tr.PANTRY_TITLE)` with `IngredientBag items={Object.entries(pantry).map(([ingredient, amount]) => ({ ingredient, amount }))} showSources={false}` (or `PANTRY_EMPTY` when empty), and below it the spoiling batches: icon, amount, `t(tr.PANTRY_SPOILS_IN, formatDuration(expiresAt - Date.now()))` where `formatDuration` gives "3 d", "5 h" or "40 min".
- `Hud.jsx` title screen: the coin counter becomes the cocoa counter (`IngredientIcon id="COCOA"`, `stats.pantry.COCOA || 0`).
- `Multiplayer.jsx`: `calculateCoinsFromTrackRecord` becomes `calculateXpFromTrackRecord` using `award.xp` and halving for losses, and updates `stats.score` only (no coins).

- [ ] **Step 4: Run tests**

Run: `npm run build && npm test -w apps/pwa`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/pwa
git commit -m "feat(pwa): Choclab paid in ingredients, pantry dialog, cocoa replaces coins"
```

---

### Task 12: Cleanup, notes and full verification

**Files:**
- Modify: `packages/shared/engine/awards.js` (drop the `coins` alias), any remaining `.coins` readers of awards (`grep -rn "\.coins" apps packages --include=*.js --include=*.jsx | grep -v node_modules`), `.claude/memory/game/rules.md`, `.claude/memory/architecture/api-and-live.md`, `.claude/memory/architecture/pwa.md`, `.claude/memory/security/anti-cheat.md`, `.claude/memory/project/status.md`

- [ ] **Step 1:** Remove `coins: xp` from `award(...)` and fix every reader the grep finds (they must read `xp`).
- [ ] **Step 2:** Run everything:

```bash
npm test && npm run test:api && npm run test:unit && npm run test:whitepaper && npm run build && npm run test:e2e
```

Expected: all pass (rerun the known flaky `locked.spec.js` test once if it times out).
- [ ] **Step 3:** Update the memory notes: achievements with XP/who and the new list (rules), pantry/rewards/rating/queue.ai (api-and-live), Start flow, end screen, Choclab, pantry (pwa), D14 status: the highscore is now verified-only (anti-cheat), branch state (status).
- [ ] **Step 4: Commit**

```bash
git add -A packages apps
git commit -m "refactor: achievements carry only xp"
```

(The memory folder is gitignored and is not committed.)
