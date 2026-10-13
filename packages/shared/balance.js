// Central balance config of the real-time engine: every timing and amount lives here.
//
// Values are one of:
// - a number,
// - a linear range [start, end] over the Choclab levels 0..19 (like linearGrowFunction),
// - { tiers: [[minLevel, value], ...] } for step-wise values,
// - { exp: [start, end] } for the exponential Choclab coin prices.
//
// Every match stores a snapshot of the balance it was created with (match.balance),
// so changing the defaults never alters a running or resumed match.

const { EntityType, AttackType, linearGrowFunction, exponentialGrowFunction } = require('./constants');

const valueAt = (spec, level = 0) => {
    if (typeof spec === 'number' || spec === null || typeof spec === 'undefined') {
        return spec;
    } else if (Array.isArray(spec)) {
        return linearGrowFunction(level, spec[0], spec[1]);
    } else if (Array.isArray(spec.tiers)) {
        let value = spec.tiers[0][1];
        for (const [minLevel, tierValue] of spec.tiers) {
            if (level >= minLevel) {
                value = tierValue;
            }
        }
        return value;
    } else if (Array.isArray(spec.exp)) {
        return exponentialGrowFunction(level, spec.exp[0], spec.exp[1]);
    }
    throw new Error('Invalid balance value: ' + JSON.stringify(spec));
};

const capacityTiers = { tiers: [[0, 2], [7, 3], [15, 4]] };

const DefaultBalance = Object.freeze({
    version: 1,
    match: {
        startCacao: 100,
        fieldChoiceTimeoutMs: 10000,
        placementTimeoutMs: 20000,
        countdownMs: 3000,
        timeLimitMs: 10 * 60 * 1000,
        // value of the factory in the board-value tiebreak at the time limit (its build cost is 0)
        factoryBoardValue: 100,
        // hosts may accept actions this much earlier than a cooldown allows (network jitter)
        earlyActionToleranceMs: 150,
        cacaoCap: null,
        buildTokens: { startFull: true, clampOnCapacityLoss: true },
    },
    board: {
        creamProbability: 0.7,
        cellTypeWeights: { WHITE: 1, BLACK: 1, BROWN: 4 },
    },
    cells: {
        white: { cacaoFactor: 1.5 },
        black: { buildCapacityBonus: 1, buildIntervalFactor: 0.75 },
    },
    entities: {
        [EntityType.CREAM]: { hp: 1, costs: 0, footprint: 2 },
        [EntityType.FACTORY]: {
            hp: [11, 52], costs: 0, coins: { exp: [102, 13002] },
            build: { capacity: capacityTiers, intervalMs: [15000, 10000] },
            cacao: { intervalMs: 10000, amount: [5, 12] },
        },
        [EntityType.FACTORY_EXTENSION]: {
            hp: [11, 52], costs: 120, coins: { exp: [71, 12201] },
            build: { capacity: capacityTiers, intervalMs: [20000, 13000] },
        },
        [EntityType.CACAOTREE]: {
            hp: [5, 19], costs: 20, coins: { exp: [24, 8650] },
            cacao: { intervalMs: 10000, amount: [10, 17] },
        },
        [EntityType.RUM_TRUFFLE_CANNON]: {
            hp: [12, 42], costs: 40, coins: { exp: [55, 11203] },
            weapons: [{
                attackType: AttackType.TRUFFLE, damage: [9, 53], spread: 0.2, cooldownMs: 20000,
                rush: { enabled: true, fromProgress: 0.5, cost: 10 },
            }],
        },
        [EntityType.FRUIT_CANNON]: {
            hp: [12, 42], costs: 40, coins: { exp: [55, 11203] },
            // the fruit cannon replaces a truffle cannon and keeps its truffle weapon and timer
            keepsTruffleWeapon: true,
            weapons: [{
                attackType: AttackType.FRUIT, damage: [9, 53], spread: 0.2, entityFactor: 0.1, cooldownMs: 30000,
                rush: { enabled: true, fromProgress: 0.5, cost: 15 },
            }],
        },
        [EntityType.SPYING_EASTER_BUNNY]: {
            hp: [7, 23], costs: 120, coins: { exp: [43, 9120] }, maxPerField: 1, area: 3,
            weapons: [{
                attackType: AttackType.BUNNY, cooldownMs: 60000,
                rush: { enabled: true, fromProgress: 0.5, cost: 30 },
            }],
        },
        [EntityType.XMAS_FACTORY]: { hp: [11, 45], costs: 80, coins: { exp: [32, 8267] } },
        [EntityType.HOT_CHOCOLATE_BALLISTA]: {
            hp: [11, 46], costs: 0, coins: { exp: [68, 10020] },
            weapons: [{ attackType: AttackType.HOT_CHOCOLATE, cooldownMs: 30000, startReady: true, rush: { enabled: false } }],
        },
        [EntityType.CHOCOLATE_FOUNTAIN]: { hp: [18, 78], costs: 120, coins: { exp: [46, 8402] }, area: 3, truffleFactor: 0.1 },
        [EntityType.DONUT_FACTORY]: {
            hp: [8, 31], costs: 240, coins: { exp: [44, 10050] }, maxPerField: 1,
            donuts: {
                intervalMs: 30000,
                probability: { tiers: [[0, 0.666], [7, 0.75], [15, 0.999]] },
                types: { tiers: [[0, 3], [13, 4], [17, 5]] },
            },
        },
    },
    donuts: {
        green: { area: 5 },
        white: { area: 5 },
        pink: { stunMs: 15000 },
        yellow: { weights: { PINK: 1, WHITE: 1, GREEN: 1, XMAS_TO_BALLISTA: 1, XMAS_TO_FOUNTAIN: 1 } },
    },
    ai: {
        [`AI_EASY`]: { reactionTimeMs: [2500, 4000] },
        [`AI_STRONG`]: { reactionTimeMsByHandicap: [800, 1000, 1300, 1600, 2000], rageWindowMs: 30000 },
    },
    awards: { rushHourMs: 3 * 60 * 1000, goldenMultiplayerMs: 3 * 60 * 1000, diamondMultiplayerMs: 8 * 60 * 1000 },
});

module.exports = { DefaultBalance, valueAt };
