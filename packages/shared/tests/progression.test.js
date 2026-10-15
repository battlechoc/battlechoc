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

const { rollDrops, achievementXp, DropTables, engine } = require('../index');

// a random source that returns the given values in order, and fails the test when asked for more
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
        // 0.08 hits 10 % but not 5 % (loser); 0.04 hits 5 % (AI); 0.03 misses 2.5 % (loser against the AI)
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
        expect(rollDrops({ ...base, verifiedMatchesToday: 15, achievements: winner, random: sequence(0.04) }))
            .toEqual([{ ingredient: 'SUGAR', amount: 3, achievement: 'WINNER' }]);
        expect(rollDrops({ ...base, verifiedMatchesToday: 16, achievements: winner, random: sequence() }))
            .toEqual([{ ingredient: 'COCOA', amount: 12, achievement: 'WINNER' }]);
    });

    test('the first verified match of the day adds a fresh batch of cocoa', () => {
        expect(rollDrops({ ...base, freshBatch: true, achievements: [], random: sequence() }))
            .toEqual([{ ingredient: 'COCOA', amount: 100, achievement: 'FRESHBATCH' }]);
    });

    test('achievements without a table give only cocoa; amounts below 1 give nothing', () => {
        expect(rollDrops({ ...base, achievements: [{ key: 'PICKY', xp: 5 }], random: sequence() }))
            .toEqual([{ ingredient: 'COCOA', amount: 5, achievement: 'PICKY' }]);
        expect(rollDrops({ ...base, isWinner: false, achievements: [{ key: 'PICKY', xp: 1 }], random: sequence() })).toEqual([]);
    });

    test('every table belongs to an achievement and references known ingredients and sane chances', () => {
        const keys = engine.matchAwards.map(award => award.key);
        Object.entries(DropTables).forEach(([key, table]) => {
            expect(keys).toContain(key);
            table.forEach(entry => {
                expect(Ingredients[entry.ingredient]).toBeDefined();
                expect(entry.chance).toBeGreaterThan(0);
                expect(entry.chance).toBeLessThanOrEqual(1);
                expect(Number.isInteger(entry.amount)).toBe(true);
            });
        });
    });
});
