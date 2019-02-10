import uuidv4 from 'uuid/v4';

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const EntityTypes = Object.freeze({
    FACTORY: 'EntityTypes.FACTORY',
    TREE: 'EntityTypes.TREE',
    CANNON: 'EntityTypes.CANNON',
    CREAM: 'EntityTypes.CREAM'
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
                        creamed: creamed, 
                        occupied: false
                    });
                }
            }
            playerFields.push(field);
        }
        return playerFields;
    }
}

function getEntity(type) {
    switch (type) {
        case EntityTypes.FACTORY:
            return { id: uuidv4(), type: EntityTypes.FACTORY, costs: 0, cells: 4 };
        case EntityTypes.TREE:
            return { id: uuidv4(), type: EntityTypes.TREE, costs: 4, cells: 1 };
        case EntityTypes.CANNON:
            return { id: uuidv4(), type: EntityTypes.CANNON, costs: 2, cells: 1 };
        case EntityTypes.CREAM:
            return { id: uuidv4(), type: EntityTypes.CREAM, costs: 1, cells: 1 };
        default:
            throw new Error("Invalid entity type given: " + type);
    }
}

export { BoardCellTypes, Board, EntityTypes, getEntity };