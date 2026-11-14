const path = require('path');
const { salvageReturns } = require('../index');

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
