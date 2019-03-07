import uuidv4 from 'uuid/v4';

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const BuildingType = Object.freeze({
    EMPTY: 'BuildingType.EMPTY',
    CREAM: 'BuildingType.CREAM',
    FACTORY: 'BuildingType.FACTORY',
    FACTORY_EXTENSION: 'BuildingType.FACTORY_EXTENSION',
    CACAOTREE: 'BuildingType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'BuildingType.RUM_TRUFFLE_CANNON',
    EASTER_FACTORY: 'BuildingType.EASTER_FACTORY',
    XMAS_FACTORY: 'BuildingType.XMAS_FACTORY',
    HOT_CHOCOLATE_BALISTA: 'BuildingType.HOT_CHOCOLATE_BALISTA',
    isInstanceOf: function (buildingType) {
        if (buildingType === BuildingType.EMPTY ||
            buildingType === BuildingType.CREAM ||
            buildingType === BuildingType.FACTORY ||
            buildingType === BuildingType.CACAOTREE ||
            buildingType === BuildingType.RUM_TRUFFLE_CANNON ||
            buildingType === BuildingType.FACTORY_EXTENSION ||
            buildingType === BuildingType.EASTER_FACTORY ||
            buildingType === BuildingType.XMAS_FACTORY ||
            buildingType === BuildingType.HOT_CHOCOLATE_BALISTA)
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
                        occupiedBy: creamed ? [BuildingType.CREAM] : []
                    });
                }
            }
            playerFields.push(field);
        }
        return { fields: playerFields, size: size, seed: seed };
    }
}

function getEntity(entityType) {
    switch (entityType) {
        case BuildingType.FACTORY:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 0,
                cells: 1
            };
        case BuildingType.FACTORY_EXTENSION:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 150,
                cells: 1
            };
        case BuildingType.CACAOTREE:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 20,
                cells: 1
            };
        case BuildingType.RUM_TRUFFLE_CANNON:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 60,
                cells: 1
            };
        case BuildingType.CREAM:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 10,
                cells: 1
            };
        case BuildingType.EASTER_FACTORY:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 240,
                cells: 1
            };
        case BuildingType.XMAS_FACTORY:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 100,
                cells: 1
            };
        case BuildingType.HOT_CHOCOLATE_BALISTA:
            return {
                id: uuidv4(),
                type: entityType,
                costs: 100,
                cells: 1
            };
        default:
            throw new Error("Invalid entity type given: " + entityType);
    }
}

function getCheapest() {
    return getEntity(BuildingType.CREAM);
}

export { BoardCellTypes, Board, BuildingType, getEntity, getCheapest };