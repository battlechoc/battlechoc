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

class Cell {
    constructor(type, row, col, creamed, occupied = false) {
        this.type = type;
        this.row = row;
        this.col = col;
        this.occupied = occupied;
        this.creamed = creamed;
    }
}

class Board {
    static generate(size, playerCount, seed) {
        let playerFields = [];

        for (let p = 0; p < playerCount; p++) {
            let field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    let fieldtype = Math.floor(Math.random() * 3);
                    let creamed = Math.floor(Math.random() * 2) === 1;
                    let cellType = BoardCellTypes.BLACK;
                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BROWN;
                    }
                    field.grid.push({
                        type: cellType, 
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

export { BoardCellTypes, Cell, Board, EntityTypes, getEntity };