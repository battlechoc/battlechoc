// Salvaging an item in the Choclab: a plain item gives back half of each amount of its recipe,
// rounded down; a minted item (its token burned) gives back its rare and legendary ingredients in
// full and the others as a plain item does. The COCOA crafting fee is not part of `amounts` and
// never comes back. Used by the API (the salvage itself, the credit of a burn) and the game (the
// preview on the item card, the confirmation's labels).
//
// The returns follow the recipe as it is at the salvage, not the amounts the craft took. So that a
// salvage never gives back more than the craft took, an existing recipe is changed only this way:
// never raise a rare or legendary amount (a minted item returns them in full); never more than
// double the others (they come back by half, rounded down). Nothing stored enforces it.

const { Ingredients, Rarity } = require('./ingredients');

const FULL_WHEN_MINTED = new Set([Rarity.RARE, Rarity.LEGENDARY]);

/**
 * How much of `ingredient` comes back: 'full' (a rare or legendary ingredient of a minted item,
 * `options.minted` true) or 'half' (rounded down; everything else, and every ingredient of a plain
 * item; `options` null or left out: plain).
 */
const salvageRule = (ingredient, options) => {
    // options null or left out: a plain item
    const minted = Boolean(options && options.minted === true);
    const rarity = Ingredients[ingredient] && Ingredients[ingredient].rarity;
    return minted && FULL_WHEN_MINTED.has(rarity) ? 'full' : 'half';
};

/**
 * What salvaging an item of the recipe with `amounts` ({ [ingredient]: number }) gives back:
 * { [ingredient]: number } by `salvageRule` (`options`: { minted }), ingredients that come to 0
 * left out.
 */
const salvageReturns = (amounts, options) => {
    const returns = {};
    for (const [ingredient, amount] of Object.entries(amounts)) {
        const back = salvageRule(ingredient, options) === 'full' ? amount : Math.floor(amount / 2);
        if (back > 0) {
            returns[ingredient] = back;
        }
    }
    return returns;
};

module.exports = { salvageReturns, salvageRule };
