// Progress outside a match: Choclab costs and the ingredient drops after a match.
// Kept apart from balance.js because every match stores a snapshot of the balance, and none of
// this belongs in a match.

const { EntityType, EmptyPlayerStats } = require('./constants');
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

/** What upgrading `entityType` from `level` to `level + 1` costs: cocoa plus milestone ingredients. */
const choclabCost = (entityType, level) => {
    // the cocoa price is the former coin price the Choclab page shows (lazy: index requires this module)
    const { getEntityDescriptor } = require('./index');
    const cocoa = getEntityDescriptor(entityType, { ...EmptyPlayerStats.level, [entityType]: level }).coins || 0;
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
    // by the number of verified matches of the UTC day (this one included); upTo null = no limit
    daily: [
        { upTo: 5, chance: 1, fallback: 1 },
        { upTo: 15, chance: 0.5, fallback: 1 },
        { upTo: null, chance: 0, fallback: 0.5 },
    ],
});

/** XP of a player's counted achievements: losers get half, rounded down. */
const achievementXp = (achievements, isWinner) => {
    const sum = achievements.reduce((total, achievement) => total + achievement.xp, 0);
    return isWinner ? sum : Math.floor(sum / 2);
};

/**
 * Drops of one player after a verified match. Each achievement rolls its table; without a hit it
 * gives cocoa equal to its xp. `random()` returns a number in [0, 1); the server passes a secure one.
 */
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

/**
 * What the building levels of a player cost in the Choclab (cocoa and milestone ingredients);
 * given back once when equipment replaced the levels (2026-10).
 */
const levelRefund = levels => {
    const refund = {};
    Object.entries(levels && typeof levels === 'object' ? levels : {}).forEach(([entityType, level]) => {
        if (!SpecialIngredient[entityType] || !Number.isInteger(level)) {
            return;
        }
        for (let l = 0; l < level; l++) {
            const cost = choclabCost(entityType, l);
            Object.entries({ COCOA: cost.cocoa, ...cost.ingredients }).forEach(([id, amount]) => {
                if (amount > 0) {
                    refund[id] = (refund[id] || 0) + amount;
                }
            });
        }
    });
    return refund;
};

// finishing the tutorial: cocoa and the ingredients of the starter recipe (Light barrel)
const StarterKit = Object.freeze({ COCOA: 100, RUM: 4, SUGAR: 4, MILK: 2 });

// What a player opens up by playing (2026-10-30, the user's play test: one match used to unlock
// everything; 2026-11-01: the first match still brought every building, too much at once): the
// tutorial's three buildings from the start, two more after each of the first three finished
// matches; the Choclab and online play (random opponents and Friends) after three matches
// against the AI.
const BuildingUnlocks = Object.freeze([
    Object.freeze({ games: 0, buildings: Object.freeze([EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM]) }),
    Object.freeze({ games: 1, buildings: Object.freeze([EntityType.FACTORY_EXTENSION, EntityType.CHOCOLATE_FOUNTAIN]) }),
    Object.freeze({ games: 2, buildings: Object.freeze([EntityType.SPYING_EASTER_BUNNY, EntityType.FRUIT_CANNON]) }),
    Object.freeze({ games: 3, buildings: Object.freeze([EntityType.XMAS_FACTORY, EntityType.DONUT_FACTORY]) }),
]);
const UnlockGames = Object.freeze({ buildings: BuildingUnlocks[BuildingUnlocks.length - 1].games, choclab: 3, online: 3 });

/** Finished matches of a player (won, drawn or lost), as the server or the device counts them. */
const gamesPlayed = stats => ['winnings', 'drawn', 'losses']
    .reduce((sum, key) => sum + Math.max(0, Number(stats && stats[key]) || 0), 0);

/** The buildings that come with more than `from` and up to `to` finished matches, in order. */
const buildingsUnlockedBetween = (from, to) => BuildingUnlocks
    .filter(step => step.games > from && step.games <= to)
    .flatMap(step => step.buildings);

/**
 * What a player has unlocked and how many more matches each locked part needs.
 *
 * @param {object} stats the player's stats (winnings, drawn, losses, score)
 * @param {object} [options]
 * @param {boolean} [options.early] the player had everything under the old rule (one match
 *   unlocked all), so nothing they had locks again
 * @returns {{games: number, buildings: boolean, unlockedBuildings: string[], choclab: boolean,
 *   online: boolean, gamesLeft: {buildings: number, choclab: number, online: number}}}
 *   `buildings`: every building; `unlockedBuildings`: the ones so far
 */
const unlocks = (stats, { early = false } = {}) => {
    const games = gamesPlayed(stats);
    const left = feature => (early ? 0 : Math.max(0, UnlockGames[feature] - games));
    return {
        games,
        buildings: left('buildings') === 0,
        unlockedBuildings: buildingsUnlockedBetween(-1, early ? UnlockGames.buildings : games),
        choclab: left('choclab') === 0,
        online: left('online') === 0,
        gamesLeft: { buildings: left('buildings'), choclab: left('choclab'), online: left('online') },
    };
};

// Player levels by XP. The first steps are where matches against the AI change (engine/setup.js:
// an 8x8 board from 200, 10x10 from 500, Gustav Ganache from 800, at full strength from 1000);
// afterwards each level needs a little more, and beyond the table one every LEVEL_XP_BEYOND.
const LevelXp = Object.freeze([0, 200, 500, 800, 1000, 1500, 2000, 3000, 4000, 5000, 6500, 8000, 10000]);
const LEVEL_XP_BEYOND = 2500;

/** The level of `xp`: { level (from 1), xp, from and to (the XP of this level and the next), progress (0..1) }. */
const playerLevel = xp => {
    const value = Math.max(0, Number(xp) || 0);
    let index = LevelXp.length - 1;
    while (index > 0 && LevelXp[index] > value) {
        index--;
    }
    let level = index + 1;
    let from = LevelXp[index];
    let to = LevelXp[index + 1];
    if (typeof to === 'undefined') {
        const beyond = Math.floor((value - from) / LEVEL_XP_BEYOND);
        level += beyond;
        from += beyond * LEVEL_XP_BEYOND;
        to = from + LEVEL_XP_BEYOND;
    }
    return { level, xp: value, from, to, progress: (value - from) / (to - from) };
};

module.exports = {
    SpecialIngredient, ChoclabMilestones, choclabCost, DropTables, DropRules, achievementXp, rollDrops, levelRefund, StarterKit,
    BuildingUnlocks, UnlockGames, gamesPlayed, buildingsUnlockedBetween, unlocks, LevelXp, playerLevel,
};
