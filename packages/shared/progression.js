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

module.exports = { SpecialIngredient, ChoclabMilestones, choclabCost, DropTables, DropRules, achievementXp, rollDrops };
