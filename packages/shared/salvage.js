// Salvaging a plain item in the Choclab: it gives back half of each amount of its recipe,
// rounded down. The COCOA crafting fee is not part of `amounts` and never comes back.
// Used by the API (the salvage itself) and the game (the preview on the item card).

/**
 * What salvaging an item of the recipe with `amounts` ({ [ingredient]: number }) gives back:
 * { [ingredient]: Math.floor(amount / 2) }, ingredients that come to 0 left out.
 * The second parameter is kept free for minted items (plan E: `{ minted }`).
 */
const salvageReturns = amounts => {
    const returns = {};
    for (const [ingredient, amount] of Object.entries(amounts)) {
        const back = Math.floor(amount / 2);
        if (back > 0) {
            returns[ingredient] = back;
        }
    }
    return returns;
};

module.exports = { salvageReturns };
