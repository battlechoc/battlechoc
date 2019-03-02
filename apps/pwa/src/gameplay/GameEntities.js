import uuidv4 from 'uuid/v4';

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const BuildingType = Object.freeze({
    EMPTY: 'BuildingsType.EMPTY',
    CREAM: 'BuildingsType.CREAM',
    FACTORY: 'BuildingsType.FACTORY',
    FACTORY_EXTENSION: 'BuildingType.FACTORY_EXTENSION',
    CACAOTREE: 'BuildingsType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'BuildingsType.RUM_TRUFFLE_CANNON',
    isInstanceOf: function (buildingType) {
        if (buildingType === BuildingType.EMPTY ||
            buildingType === BuildingType.CREAM ||
            buildingType === BuildingType.FACTORY ||
            buildingType === BuildingType.CACAOTREE ||
            buildingType === BuildingType.RUM_TRUFFLE_CANNON ||
            buildingType === BuildingType.FACTORY_EXTENSION)
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
                    if (creamed) {
                        previewStyle = 'creamed';
                    } else {
                        if (fieldtype === 0) {
                            cellType = BoardCellTypes.WHITE;
                            previewStyle = 'white';
                        } else if (fieldtype === 1) {
                            cellType = BoardCellTypes.BROWN;
                            previewStyle = 'brown';
                        }
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

function getEntity(type) {
    switch (type) {
        case BuildingType.FACTORY:
            return {
                id: uuidv4(),
                type: BuildingType.FACTORY,
                costs: 0,
                cells: 1
            };
        case BuildingType.FACTORY_EXTENSION:
            return {
                id: uuidv4(),
                type: BuildingType.FACTORY_EXTENSION,
                costs: 150,
                cells: 1
            };
        case BuildingType.CACAOTREE:
            return {
                id: uuidv4(),
                type: BuildingType.CACAOTREE,
                costs: 20,
                cells: 1
            };
        case BuildingType.RUM_TRUFFLE_CANNON:
            return {
                id: uuidv4(),
                type: BuildingType.RUM_TRUFFLE_CANNON,
                costs: 60,
                cells: 1
            };
        case BuildingType.CREAM:
            return {
                id: uuidv4(),
                type: BuildingType.CREAM,
                costs: 10,
                cells: 1
            };
        default:
            throw new Error("Invalid entity type given: " + type);
    }
}

export { BoardCellTypes, Board, BuildingType, getEntity };