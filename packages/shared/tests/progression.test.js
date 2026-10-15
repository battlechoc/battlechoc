const { Ingredient, Ingredients, choclabCost, EntityType, EmptyPlayerStats, getEntityDescriptor } = require('../index');

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

    test('the cocoa price is the price the Choclab page showed in coins', () => {
        Object.keys(EmptyPlayerStats.level).forEach(entityType => {
            [0, 7, 13].forEach(level => {
                const levels = { ...EmptyPlayerStats.level, [entityType]: level };
                // the cream has no price on the page: it costs no cocoa
                expect(choclabCost(entityType, level).cocoa).toBe(getEntityDescriptor(entityType, levels).coins || 0);
            });
        });
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
        Object.keys(EmptyPlayerStats.level).forEach(entityType => {
            expect(Object.keys(choclabCost(entityType, 4).ingredients)).toHaveLength(1);
        });
    });
});
