import uuidv4 from 'uuid/v4';

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const EntityType = Object.freeze({
    EMPTY: 'EntityType.EMPTY',
    CREAM: 'EntityType.CREAM',
    FACTORY: 'EntityType.FACTORY',
    FACTORY_EXTENSION: 'EntityType.FACTORY_EXTENSION',
    CACAOTREE: 'EntityType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'EntityType.RUM_TRUFFLE_CANNON',
    FRUIT_CANNON: 'EntityType.FRUIT_CANNON',
    EASTER_FACTORY: 'EntityType.EASTER_FACTORY',
    XMAS_FACTORY: 'EntityType.XMAS_FACTORY',
    HOT_CHOCOLATE_BALLISTA: 'EntityType.HOT_CHOCOLATE_BALLISTA',
    CHOCOLATE_FOUNTAIN: 'EntityType.CHOCOLATE_FOUNTAIN',
    isInstanceOf: function (entityType) {
        if (entityType === EntityType.EMPTY ||
            entityType === EntityType.CREAM ||
            entityType === EntityType.FACTORY ||
            entityType === EntityType.CACAOTREE ||
            entityType === EntityType.RUM_TRUFFLE_CANNON ||
            entityType === EntityType.FACTORY_EXTENSION ||
            entityType === EntityType.EASTER_FACTORY ||
            entityType === EntityType.XMAS_FACTORY ||
            entityType === EntityType.HOT_CHOCOLATE_BALLISTA ||
            entityType === EntityType.CHOCOLATE_FOUNTAIN ||
            entityType === EntityType.FRUIT_CANNON)
            return true;
        else
            return false;
    }
});

class Board {
    static generate(size, seed) {
        let playerFields = [];
        for (let player = 0; player < 2; player++) {
            let field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    let fieldtype = Math.floor(Math.random() * 3);
                    let creamed = Math.floor(Math.random() * 2) === 1;
                    let cellType = BoardCellTypes.BLACK;
                    let previewStyle = 'black';

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                        previewStyle = 'white';
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BROWN;
                        previewStyle = 'brown';
                    }

                    field.grid.push({
                        type: cellType,
                        previewStyle: previewStyle,
                        row: row,
                        col: col,
                        occupiedBy: creamed ? [EntityType.CREAM] : []
                    });
                }
            }
            playerFields.push(field);
        }
        return { fields: playerFields, size: size, seed: seed };
    }
}

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.EMPTY, {
        costs: 0,
        cells: 1
    }],
    [EntityType.CREAM, {
        costs: 10,
        cells: 1
    }],
    [EntityType.FACTORY, {
        costs: 0,
        cells: 1,
        buildingsPerTurn: 2
    }],
    [EntityType.FACTORY_EXTENSION, {
        costs: 120,
        cells: 1,
        buildingsPerTurn: 2
    }],
    [EntityType.CACAOTREE, {
        costs: 20,
        cells: 1,
        cacaoPerTurn: 30
    }],
    [EntityType.RUM_TRUFFLE_CANNON, {
        costs: 60,
        cells: 1,
        attacksPerTurn: 1
    }],
    [EntityType.FRUIT_CANNON, {
        costs: 40,
        cells: 1,
        fruitAttacksPerTurn: 1
    }],
    [EntityType.EASTER_FACTORY, {
        costs: 180,
        cells: 1
    }],
    [EntityType.XMAS_FACTORY, {
        costs: 180,
        cells: 1
    }],
    [EntityType.HOT_CHOCOLATE_BALLISTA, {
        costs: 120,
        cells: 1,
        hotChocolateAttacksPerTurn: 1
    }],
    [EntityType.CHOCOLATE_FOUNTAIN, {
        costs: 120,
        cells: 1
    }]
]));

function createEntity(entityType) {
    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let entity = {
            id: uuidv4(),
            type: entityType
        };
        const descriptor = EntityDescriptors.get(entityType);
        for (var field in descriptor) {
            entity[field] = descriptor[field]
        };
        return entity;
    }
}

function getEntityDescriptor(entityType) {
    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        return EntityDescriptors.get(entityType);
    }
}

function getCheapest() {
    return getEntityDescriptor(EntityType.CREAM);
}

export { BoardCellTypes, Board, EntityType, EntityDescriptors, createEntity, getEntityDescriptor, getCheapest };