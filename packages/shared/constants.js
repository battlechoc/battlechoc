// Shared constants of the battlechoc rules engines (turn-based and real-time).

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const EntityType = Object.freeze({
    CREAM: 'EntityType.CREAM',
    FACTORY: 'EntityType.FACTORY',
    FACTORY_EXTENSION: 'EntityType.FACTORY_EXTENSION',
    CACAOTREE: 'EntityType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'EntityType.RUM_TRUFFLE_CANNON',
    FRUIT_CANNON: 'EntityType.FRUIT_CANNON',
    SPYING_EASTER_BUNNY: 'EntityType.SPYING_EASTER_BUNNY',
    XMAS_FACTORY: 'EntityType.XMAS_FACTORY',
    HOT_CHOCOLATE_BALLISTA: 'EntityType.HOT_CHOCOLATE_BALLISTA',
    CHOCOLATE_FOUNTAIN: 'EntityType.CHOCOLATE_FOUNTAIN',
    DONUT_FACTORY: 'EntityType.DONUT_FACTORY',
    DONUT_PORTAL_BLUE: 'EntityType.DONUT_PORTAL_BLUE',
    DONUT_PORTAL_RED: 'EntityType.DONUT_PORTAL_RED',
    DONUT_SURPRISE_YELLOW: 'EntityType.DONUT_SURPRISE_YELLOW',
    DONUT_HEALTH_GREEN: 'EntityType.DONUT_HEALTH_GREEN',
    DONUT_STOP_PINK: 'EntityType.DONUT_STOP_PINK',
    DONUT_CREAM_WHITE: 'EntityType.DONUT_CREAM_WHITE',
    isInstanceOf: function (entityType) {
        if (entityType === EntityType.CREAM ||
            entityType === EntityType.FACTORY ||
            entityType === EntityType.CACAOTREE ||
            entityType === EntityType.RUM_TRUFFLE_CANNON ||
            entityType === EntityType.FACTORY_EXTENSION ||
            entityType === EntityType.SPYING_EASTER_BUNNY ||
            entityType === EntityType.XMAS_FACTORY ||
            entityType === EntityType.HOT_CHOCOLATE_BALLISTA ||
            entityType === EntityType.CHOCOLATE_FOUNTAIN ||
            entityType === EntityType.FRUIT_CANNON ||
            entityType === EntityType.DONUT_FACTORY ||
            entityType === EntityType.DONUT_PORTAL_RED ||
            entityType === EntityType.DONUT_PORTAL_BLUE ||
            entityType === EntityType.DONUT_SURPRISE_YELLOW ||
            entityType === EntityType.DONUT_HEALTH_GREEN ||
            entityType === EntityType.DONUT_STOP_PINK ||
            entityType === EntityType.DONUT_CREAM_WHITE) {
            return true;
        } else {
            return false;
        }
    }
});

const isDonut = entityType => [
    EntityType.DONUT_HEALTH_GREEN,
    EntityType.DONUT_STOP_PINK,
    EntityType.DONUT_CREAM_WHITE,
    EntityType.DONUT_PORTAL_RED,
    EntityType.DONUT_PORTAL_BLUE,
    EntityType.DONUT_SURPRISE_YELLOW
].includes(entityType)

const AttackType = Object.freeze({
    TRUFFLE: 'AttackType.TRUFFLE',
    FRUIT: 'AttackType.FRUIT',
    HOT_CHOCOLATE: 'AttackType.HOT_CHOCOLATE',
    BUNNY: 'AttackType.BUNNY',
    isInstanceOf: function (attackType) {
        if (attackType === AttackType.TRUFFLE ||
            attackType === AttackType.FRUIT ||
            attackType === AttackType.HOT_CHOCOLATE ||
            attackType === AttackType.BUNNY) {
            return true;
        }
        else {
            return false;
        }
    }
});

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AI_STRONG: 'PlayerType.AI_STRONG',
    AI_TUTORIAL: 'PlayerType.AI_TUTORIAL',
    AI_EASY: 'PlayerType.AI_EASY',
});

const EmptyPlayerStats = Object.freeze({
    username: 'Chocnonymous',
    tutorialStarted: false,
    tutorialSkipped: false,
    tutorialFinished: false,
    coins: 0,
    awards: [],
    score: 0,
    winnings: 0,
    drawn: 0,
    losses: 0,
    trackRecord: [],
    level: {
        'EntityType.CREAM': 0,
        'EntityType.FACTORY': 0,
        'EntityType.FACTORY_EXTENSION': 0,
        'EntityType.CACAOTREE': 0,
        'EntityType.RUM_TRUFFLE_CANNON': 0,
        'EntityType.FRUIT_CANNON': 0,
        'EntityType.SPYING_EASTER_BUNNY': 0,
        'EntityType.XMAS_FACTORY': 0,
        'EntityType.HOT_CHOCOLATE_BALLISTA': 0,
        'EntityType.CHOCOLATE_FOUNTAIN': 0,
        'EntityType.DONUT_FACTORY': 0
    }
});

const finalLevel = 20;
const calculateDivisor = (start, end) => (finalLevel * Math.log2(2)) / Math.log2((end - finalLevel) / start);
const linearGrowFunction = (level, start, end) => Math.round(((end - start) / (finalLevel - 1)) * level + start);
const exponentialGrowFunction = (level, start, end) => Math.round(level + start * Math.pow(2, level / calculateDivisor(start, end)));

module.exports = {
    BoardCellTypes,
    EntityType,
    isDonut,
    AttackType,
    PlayerType,
    EmptyPlayerStats,
    finalLevel,
    linearGrowFunction,
    exponentialGrowFunction,
};
