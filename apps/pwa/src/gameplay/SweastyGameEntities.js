const BoardCellTypes = Object.freeze({
    white: Symbol("white"),
    brown: Symbol("brown"),
    black: Symbol("black")
});

class Cell {
    constructor(cellType, row, col, creamed, occupied = false) {
        this.cellType = cellType;
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

export { BoardCellTypes, Cell, Board };