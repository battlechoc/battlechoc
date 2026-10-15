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

module.exports = { SpecialIngredient, ChoclabMilestones, choclabCost };
