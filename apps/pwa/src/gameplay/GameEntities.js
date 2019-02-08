import uuidv4 from 'uuid/v4';

const BoardCellTypes = Object.freeze({
    white: Symbol("white"),
    brown: Symbol("brown"),
    black: Symbol("black")
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
    constructor(size, playerCount, seed) {
        this.size = size;
        this.playerFields = [];
        this._initialize(seed, playerCount);
    }

    _initialize(seed, playerCount) {
        for (let p = 0; p < playerCount; p++) {
            let field = { grid: [] };
            for (let row = 0; row < this.size.rows; row++) {
                for (let col = 0; col < this.size.cols; col++) {
                    let fieldtype = Math.floor(Math.random() * 3);
                    let creamed = Math.floor(Math.random() * 2) === 1;
                    let cellType = BoardCellTypes.black;
                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.white;
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.brown;
                    }
                    field.grid.push(new Cell(cellType, row, col, creamed, false));
                }
            }
            this.playerFields.push(field);
        }
    }

    getPlayerFields() {
        return this.playerFields;
    }
}

const EntityTypes = Object.freeze({
    factory: Symbol("factory"),
    tree: Symbol("tree"),
    cannon: Symbol("cannon"),
    cream: Symbol("cream"),
});

function getEntity(type) {
    switch (type) {
        case EntityTypes.factory:
            return { id: uuidv4(), type: EntityTypes.factory, costs: 0, cells: 4 };
        case EntityTypes.tree:
            return { id: uuidv4(), type: EntityTypes.tree, costs: 4, cells: 1 };
        case EntityTypes.cannon:
            return { id: uuidv4(), type: EntityTypes.cannon, costs: 2, cells: 1 };
        case EntityTypes.cream:
            return { id: uuidv4(), type: EntityTypes.cream, costs: 1, cells: 1 };
        default:
            throw new Error("Invalid entity type given: " + type);
    }
}

export { BoardCellTypes, Cell, Board, EntityTypes, getEntity };