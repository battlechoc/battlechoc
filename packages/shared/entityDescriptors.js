// Entity stats per Choclab level: what a building has at a level, and what the level costs.
// The match itself takes its numbers from balance.js; these describe the buildings outside a
// match (info cards, the cocoa price of a Choclab level).

const {
    EntityType,
    AttackType,
    isDonut,
    EmptyPlayerStats,
    linearGrowFunction,
    exponentialGrowFunction,
} = require('./constants');

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.CREAM, () => ({
        level: { max: 1 },
        hp: 1,
        area: 1,
        costs: 10
    })],
    [EntityType.FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 52),
        cacaoPerTurn: linearGrowFunction(level, 15, 35),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 0,
        coins: exponentialGrowFunction(level, 102, 13002)
    })],
    [EntityType.FACTORY_EXTENSION, level => ({
        hp: linearGrowFunction(level, 11, 52),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 120,
        coins: exponentialGrowFunction(level, 71, 12201)
    })],
    [EntityType.CACAOTREE, level => ({
        hp: linearGrowFunction(level, 5, 19),
        cacaoPerTurn: linearGrowFunction(level, 30, 52),
        costs: 20,
        coins: exponentialGrowFunction(level, 24, 8650)
    })],
    [EntityType.RUM_TRUFFLE_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.TRUFFLE,
        attacksPerTurn: 1
    })],
    [EntityType.FRUIT_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.FRUIT,
        attacksPerTurn: 1
    })],
    [EntityType.SPYING_EASTER_BUNNY, level => ({
        hp: linearGrowFunction(level, 7, 23),
        area: 3,
        costs: 120,
        coins: exponentialGrowFunction(level, 43, 9120),
        attackType: AttackType.BUNNY,
        attacksPerTurn: 1
    })],
    [EntityType.XMAS_FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 45),
        area: 3,
        costs: 80,
        coins: exponentialGrowFunction(level, 32, 8267)
    })],
    [EntityType.HOT_CHOCOLATE_BALLISTA, level => ({
        hp: linearGrowFunction(level, 11, 46),
        costs: 0,
        coins: exponentialGrowFunction(level, 68, 10020),
        attackType: AttackType.HOT_CHOCOLATE,
        attacksPerTurn: 1
    })],
    [EntityType.CHOCOLATE_FOUNTAIN, level => ({
        hp: linearGrowFunction(level, 18, 78),
        costs: 120,
        coins: exponentialGrowFunction(level, 46, 8402)
    })],
    [EntityType.DONUT_FACTORY, level => ({
        hp: linearGrowFunction(level, 8, 31),
        donutProbability: (() => {
            if (level > 14) {
                return 0.999;
            } else if (level > 6) {
                return 0.75;
            } else {
                return 0.666;
            }
        })(),
        donutTypes: (() => {
            if (level > 16) {
                return 5;
            } else if (level > 12) {
                return 4;
            } else {
                return 3;
            }
        })(),
        costs: 240,
        coins: exponentialGrowFunction(level, 44, 10050)
    })]
]));

function getEntityDescriptor(entityType, level) {
    if (isDonut(entityType)) {
        return {
            type: entityType,
            hp: 1,
            costs: 0,
            coins: 0,
            max: { hp: 1 }
        };
    }

    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let descriptor = { type: entityType, ...EntityDescriptors.get(entityType)(level[entityType]) }
        descriptor.max = { hp: descriptor.hp }
        return descriptor;
    }
}

module.exports = { EntityDescriptors, getEntityDescriptor };
