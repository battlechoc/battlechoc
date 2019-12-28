import uuidv4 from 'uuid/v4';
import { EmptyPlayerStats } from '../Multiplayer';

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
            entityType === EntityType.FRUIT_CANNON)
            return true;
        else
            return false;
    }
});

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

class Board {
    static generate(size, seed) {
        let playerFields = [];
        for (let player = 0; player < 2; player++) {
            let field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    let fieldtype = Math.floor(Math.random() * 6);
                    let creamed = Math.random() < 0.7
                    let cellType = BoardCellTypes.BROWN;
                    let previewStyle = 'brown';

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                        previewStyle = 'white';
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BLACK;
                        previewStyle = 'black';
                    }

                    let cream = createEntity(EntityType.CREAM);
                    cream.position = { col: col, row: row };

                    field.grid.push({
                        type: cellType,
                        previewStyle: previewStyle,
                        row: row,
                        col: col,
                        occupiedBy: creamed ? [cream] : [],
                        molten: false,
                        shielded: false
                    });
                }
            }
            playerFields.push(field);
        }
        return { fields: playerFields, size: size, seed: seed };
    }
}

const finalLevel = 20;
const calculateDivisor = (start, end) => (finalLevel * Math.log2(2))/Math.log2((end - finalLevel)/start);
const growFunction = (level, start, end) => Math.round(level + start * Math.pow(2, level/calculateDivisor(start,end)));

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.CREAM, () => ({
        level: { max: 1 },
        hp: 1,
        area: 1,
        costs: 10
    })],
    [EntityType.FACTORY, level => ({
        hp: growFunction(level, 48, 1204),
        cacaoPerTurn: growFunction(level, 15, 490),
        buildingsPerTurn: (() => {
            if (level > 19) {
                return 5;
            } else if (level > 14) {
                return 4;
            } else if (level > 9) {
                return 3;
            } else if (level > 4) {
                return 2;
            } else {
                return 1;
            }
        })(),
        costs: 0,
        coins: growFunction(level, 102, 53201)
    })],
    [EntityType.FACTORY_EXTENSION, level => ({
        hp: growFunction(level, 48, 1204),
        buildingsPerTurn: (() => {
            if (level > 19) {
                return 5;
            } else if (level > 14) {
                return 4;
            } else if (level > 9) {
                return 3;
            } else if (level > 4) {
                return 2;
            } else {
                return 1;
            }
        })(),
        costs: growFunction(level, 120, 2300),
        coins: growFunction(level, 71, 36201)
    })],
    [EntityType.CACAOTREE, level => ({
        hp: growFunction(level, 12, 502),
        cacaoPerTurn: growFunction(level, 30, 980),
        costs: growFunction(level, 20, 306),
        coins: growFunction(level, 24, 12404)
    })],
    [EntityType.RUM_TRUFFLE_CANNON, level => ({
        hp: growFunction(level, 33, 840),
        attack: growFunction(level, 27, 926),
        costs: growFunction(level, 40, 1012),
        coins: growFunction(level, 55, 27043),
        attackType: AttackType.TRUFFLE,
        attacksPerTurn: 1
    })],
    [EntityType.FRUIT_CANNON, level => ({
        hp: growFunction(level, 33, 560),
        attack: growFunction(level, 27, 1486),
        costs: growFunction(level, 40, 755),
        coins: growFunction(level, 55, 27043),
        attackType: AttackType.FRUIT,
        attacksPerTurn: 1
    })],
    [EntityType.SPYING_EASTER_BUNNY, level => ({
        hp: growFunction(level, 46, 2198),
        area: 3,
        costs: growFunction(level, 120, 3604),
        coins: growFunction(level, 43, 19024),
        attackType: AttackType.BUNNY,
        attacksPerTurn: 1      
    })],
    [EntityType.XMAS_FACTORY, level => ({
        hp: growFunction(level, 46, 5012),
        area: 3,
        costs: growFunction(level, 80, 2663),
        coins: growFunction(level, 32, 16950)
    })],
    [EntityType.HOT_CHOCOLATE_BALLISTA, level => ({
        hp: growFunction(level, 124, 4320),
        costs: 0,
        coins: growFunction(level, 68, 32244),
        attackType: AttackType.HOT_CHOCOLATE,
        attacksPerTurn: 1
    })],
    [EntityType.CHOCOLATE_FOUNTAIN, level => ({
        hp: growFunction(level, 230, 32012),
        costs: growFunction(level, 120, 3306),
        coins: growFunction(level, 46, 20244)
    })]
]));

function createEntity(entityType, level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let entity = {
            id: uuidv4(),
            type: entityType
        };
        const descriptor = EntityDescriptors.get(entityType)(level[entityType]);
        entity.max = { hp : descriptor.hp };
        return {...entity, ...descriptor};
    }
}

function getEntityDescriptor(entityType, level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        return { type: entityType, ...EntityDescriptors.get(entityType)(level[entityType]) };
    }
}

function getCheapest(level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    return getEntityDescriptor(EntityType.CREAM, level);
}

export { BoardCellTypes, Board, EntityType, AttackType, EntityDescriptors, createEntity, getEntityDescriptor, getCheapest, finalLevel };