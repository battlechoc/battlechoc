const path = require('path');
const { salvageReturns, salvageRule } = require('../index');

const sampleRecipes = require(path.join(__dirname, '../../../apps/api/src/lab/recipes.sample.json')).recipes;

describe('salvageReturns', () => {
    test('a light barrel gives back half of each amount, rounded down', () => {
        expect(salvageReturns({ RUM: 2, SUGAR: 2, MILK: 1 })).toEqual({ RUM: 1, SUGAR: 1 });
    });

    test('a turbo conveyor leaves out the ingredient that comes to 0', () => {
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 })).toEqual({ MILK: 2, VANILLA: 1 });
    });

    test('a recipe of single amounts gives back nothing', () => {
        expect(salvageReturns({ HAZELNUTS: 1, RUM: 1, MILK: 1 })).toEqual({});
    });

    test('cocoa as an ingredient comes back like any other', () => {
        expect(salvageReturns({ COCOA: 3, CHERRIES: 3, MARZIPAN: 1 })).toEqual({ COCOA: 1, CHERRIES: 1 });
    });

    test('never more than half of an amount for any sample recipe', () => {
        expect(sampleRecipes.length).toBeGreaterThan(0);
        for (const recipe of sampleRecipes) {
            const returns = salvageReturns(recipe.amounts);
            for (const [ingredient, amount] of Object.entries(returns)) {
                expect(recipe.amounts[ingredient]).toBeDefined();
                expect(amount).toBeGreaterThan(0);
                expect(amount).toBeLessThanOrEqual(recipe.amounts[ingredient] / 2);
            }
        }
    });

    test('the input object is not changed', () => {
        const amounts = { RUM: 2, SUGAR: 2, MILK: 1 };
        salvageReturns(amounts);
        expect(amounts).toEqual({ RUM: 2, SUGAR: 2, MILK: 1 });
    });
});

describe('salvageReturns of a minted item', () => {
    test('a turbo conveyor gives back its rare and legendary ingredients in full', () => {
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 }, { minted: true })).toEqual({ MILK: 2, VANILLA: 2, GOLDLEAF: 1 });
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 })).toEqual({ MILK: 2, VANILLA: 1 });
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 }, {})).toEqual({ MILK: 2, VANILLA: 1 });
    });

    test('uncommon ingredients still come back by half', () => {
        expect(salvageReturns({ RUM: 3, CREAM: 3, SPRINKLES: 1 }, { minted: true })).toEqual({ RUM: 1, CREAM: 1, SPRINKLES: 1 });
    });

    test('common ingredients still come back by half', () => {
        expect(salvageReturns({ COCOA: 3, CHERRIES: 3, MARZIPAN: 1 }, { minted: true })).toEqual({ COCOA: 1, CHERRIES: 1, MARZIPAN: 1 });
    });

    test('today\'s sample recipes: a minted salvage returns at most each recipe amount, at least a plain salvage', () => {
        for (const recipe of sampleRecipes) {
            const minted = salvageReturns(recipe.amounts, { minted: true });
            const plain = salvageReturns(recipe.amounts);
            for (const [ingredient, amount] of Object.entries(minted)) {
                expect(recipe.amounts[ingredient]).toBeDefined();
                expect(amount).toBeLessThanOrEqual(recipe.amounts[ingredient]);
            }
            for (const [ingredient, amount] of Object.entries(plain)) {
                expect(minted[ingredient]).toBeGreaterThanOrEqual(amount);
            }
        }
    });
});

describe('the rule for changing an existing recipe', () => {
    // the returns follow the recipe as it is at the salvage, not the amounts the craft took
    test('a rare or legendary amount raised after the craft: a minted salvage returns more than the craft took', () => {
        const crafted = { MILK: 5, VANILLA: 2, GOLDLEAF: 1 };
        const raised = { MILK: 5, VANILLA: 3, GOLDLEAF: 1 };
        expect(salvageReturns(raised, { minted: true }).VANILLA).toBeGreaterThan(crafted.VANILLA);
        // a plain salvage stays within the craft as long as no amount more than doubles
        expect(salvageReturns(raised).VANILLA).toBeLessThanOrEqual(crafted.VANILLA);
    });

    test('the others at most doubled: what comes back stays within the craft, minted or not', () => {
        const crafted = { MILK: 5, RUM: 3, CINNAMON: 1 };
        const doubled = { MILK: 10, RUM: 6, CINNAMON: 1 };
        for (const minted of [false, true]) {
            for (const [ingredient, amount] of Object.entries(salvageReturns(doubled, { minted }))) {
                expect(amount).toBeLessThanOrEqual(crafted[ingredient]);
            }
        }
    });
});

describe('options that say nothing', () => {
    test('null or undefined options are a plain salvage, never a TypeError', () => {
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 }, null)).toEqual({ MILK: 2, VANILLA: 1 });
        expect(salvageReturns({ MILK: 5, VANILLA: 2, GOLDLEAF: 1 }, undefined)).toEqual({ MILK: 2, VANILLA: 1 });
        expect(salvageRule('GOLDLEAF', null)).toBe('half');
    });
});

describe('salvageRule', () => {
    test('rare and legendary ingredients of a minted item come back in full', () => {
        expect(salvageRule('GOLDLEAF', { minted: true })).toBe('full');
        expect(salvageRule('VANILLA', { minted: true })).toBe('full');
    });

    test('everything else comes back by half', () => {
        expect(salvageRule('RUM', { minted: true })).toBe('half');
        expect(salvageRule('COCOA', { minted: true })).toBe('half');
        expect(salvageRule('GOLDLEAF', {})).toBe('half');
        expect(salvageRule('GOLDLEAF')).toBe('half');
    });
});
