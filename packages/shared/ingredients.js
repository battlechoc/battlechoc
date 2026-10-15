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
