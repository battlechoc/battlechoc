import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import * as GameEntities from './GameEntities';
import { PlayerType } from './Player';

const GameStateTypes = Object.freeze({
    START: 'GameStateTypes.START',
    CHOOSE_FIELD_OR_START: 'GameStateTypes.CHOOSE_FIELD_OR_START',
    CHOOSE_FIELD: 'GameStateTypes.CHOOSE_FIELD',
    PLAYER_1_INITIAL_PLACEMENT: 'GameStateTypes.PLAYER_1_INITIAL_PLACEMENT',
    PLAYER_2_INITIAL_PLACEMENT: 'GameStateTypes.PLAYER_2_INITIAL_PLACEMENT',
    BUILD_PHASE: 'GameStateTypes.BUILD_PHASE',
    ATTACK_PHASE: 'GameStateTypes.ATTACK_PHASE',
    END: 'GameStateTypes.END'
});

function currentPlayer(gameState) {
    return gameState.players[gameState.currentPlayerIndex];
}

function otherPlayer(gameState) {
    return gameState.players[1 - gameState.currentPlayerIndex];
}

function playerBoardCell(gameState, playerIndex, row, col) {
    return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[row * gameState.board.size.cols + col];
}

function currentPlayerBoardCell(gameState, row, col) {
    return playerBoardCell(gameState, gameState.currentPlayerIndex, row, col);
}

function otherPlayerBoardCell(gameState, cell) {
    return playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, cell.row, cell.col);
}

function currentPlayerField(gameState) {
    return gameState.board.fields[gameState.players[gameState.currentPlayerIndex].fieldIndex];
}

function otherPlayerField(gameState) {
    return gameState.board.fields[gameState.players[1 - gameState.currentPlayerIndex].fieldIndex];
}

function boardCell(grid, size, cellIdx) {
    return grid[cellIdx.row * size.cols + cellIdx.col];
}

function getCellNeighbors3x3(cellIdx, board, grid) {
    var neighbors = [];
    for (let row = cellIdx.row - 1; row < cellIdx.row + 2; row++) {
        for (let col = cellIdx.col - 1; col < cellIdx.col + 2; col++) {
            if (row >= 0 && col >= 0 && !(row === cellIdx.row && col === cellIdx.col) && row < board.size.rows && col < board.size.cols) {
                neighbors.push(boardCell(grid, board.size, { row: row, col: col }));
            }
        }
    }
    return neighbors;
}

function getCellPatch3x3(cellIdx, board, grid) {
    var patch = [];
    for (let row = cellIdx.row - 1; row < cellIdx.row + 2; row++) {
        for (let col = cellIdx.col - 1; col < cellIdx.col + 2; col++) {
            if (row >= 0 && col >= 0 && row < board.size.rows && col < board.size.cols) {
                patch.push(boardCell(grid, board.size, { row: row, col: col }));
            }
        }
    }
    return patch;
}

function prepareBuildPhase(gameState) {
    gameState.currentPlayerIndex = 1 - gameState.currentPlayerIndex;
    currentPlayer(gameState).cacao += currentPlayer(gameState).cacaoPerTurn;
    currentPlayer(gameState).attacks[GameEntities.AttackType.TRUFFLE] = currentPlayer(gameState).attacksPerTurn[GameEntities.AttackType.TRUFFLE];
    currentPlayer(gameState).attacks[GameEntities.AttackType.FRUIT] = currentPlayer(gameState).attacksPerTurn[GameEntities.AttackType.FRUIT];
    currentPlayer(gameState).attacks[GameEntities.AttackType.HOT_CHOCOLATE] = currentPlayer(gameState).attacksPerTurn[GameEntities.AttackType.HOT_CHOCOLATE];
    currentPlayer(gameState).attacks[GameEntities.AttackType.BUNNY] = currentPlayer(gameState).attacksPerTurn[GameEntities.AttackType.BUNNY];
    currentPlayer(gameState).buildings = currentPlayer(gameState).buildingsPerTurn;
    gameState.state = GameStateTypes.BUILD_PHASE;
}

const gameplayReducer = createReducer({}, {
    [GameActions.startGame]: (state, action) => {
        let coinToss = Math.round(Math.random());
        if (action.payload[1].type === PlayerType.AUGUSTUS_GLOOP) {
            coinToss = 0;
        }
        state.game = {
            players: action.payload,
            currentPlayerIndex: coinToss,
            state: GameStateTypes.START
        };
    },
    [GameActions.resumeGame]: (state, action) => {
        state.game = {
            players: action.payload.players,
            currentPlayerIndex: action.payload.currentPlayerIndex,
            state: action.payload.state,
            board: action.payload.board
        };
    },
    [GameActions.createBoard]: (state, action) => {
        state.game.board = GameEntities.Board.generate(action.payload.boardSize, action.payload.boardSeed);
        state.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    },
    [GameActions.chooseField]: (state, action) => {
        currentPlayer(state.game).fieldIndex = action.payload.fieldIdx;
        otherPlayer(state.game).fieldIndex = 1 - action.payload.fieldIdx;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
        state.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
    },
    [GameActions.chooseStart]: (state, action) => {
        state.game.state = GameStateTypes.CHOOSE_FIELD;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
    },
    [GameActions.finishTurn]: (state, action) => {
        if (state.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            state.game.state = GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
        } else if (state.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT ||
            state.game.state === GameStateTypes.ATTACK_PHASE ||
            state.game.state === GameStateTypes.BUILD_PHASE) {
            prepareBuildPhase(state.game);
        }
    },
    [GameActions.finishBuildPhase]: (state, action) => {
        state.game.state = GameStateTypes.ATTACK_PHASE;
    },
    [GameActions.build]: (state, action) => {
        currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col).occupiedBy.push(action.payload.building.type);
        if (action.payload.building.type === GameEntities.EntityType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = action.payload.building.buildingsPerTurn;
            currentPlayer(state.game).hasFactory = true;
        } else {
            if (action.payload.building.type === GameEntities.EntityType.CACAOTREE) {
                currentPlayer(state.game).cacaoPerTurn += action.payload.building.cacaoPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.RUM_TRUFFLE_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FRUIT_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                let cell = currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col);
                cell.occupiedBy.splice(cell.occupiedBy.indexOf(GameEntities.EntityType.RUM_TRUFFLE_CANNON, 1));
            } else if (action.payload.building.type === GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.SPYING_EASTER_BUNNY) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FACTORY_EXTENSION) {
                currentPlayer(state.game).buildingsPerTurn += action.payload.building.buildingsPerTurn;
            }
            currentPlayer(state.game).buildings -= 1;
            currentPlayer(state.game).cacao -= action.payload.building.costs;
        }
    },
    [GameActions.attack]: (state, action) => {
        currentPlayer(state.game).attacks[action.payload.attackType] -= 1;
        let attackedCell = otherPlayerBoardCell(state.game, action.payload);
        let opponent = otherPlayer(state.game);
        if (action.payload.attackType === GameEntities.AttackType.TRUFFLE || action.payload.attackType === GameEntities.AttackType.HOT_CHOCOLATE) {
            if (attackedCell.shielded === true && action.payload.attackType === GameEntities.AttackType.TRUFFLE) {
                console.log("attacked cell was shielded");
            } else {
                if (attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY) || attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY_EXTENSION)) {
                    opponent.buildingsPerTurn -= (attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY)) ?
                        GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY).buildingsPerTurn :
                        GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY_EXTENSION).buildingsPerTurn;
                    if (opponent.buildingsPerTurn === 0) {
                        opponent.hasFactory = false;
                        console.log('FACTORY DESTROYED');
                    }
                } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.CACAOTREE)) {
                    opponent.cacaoPerTurn -= GameEntities.getEntityDescriptor(GameEntities.EntityType.CACAOTREE).cacaoPerTurn;
                    console.log('CACAOTREE DESTROYED');
                } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.RUM_TRUFFLE_CANNON)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.RUM_TRUFFLE_CANNON);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('CANNON DESTROYED');
                } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('BALISTA DESTROYED');
                } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.FRUIT_CANNON)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.FRUIT_CANNON);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('FRUIT CANNON DESTROYED');
                } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.SPYING_EASTER_BUNNY)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.SPYING_EASTER_BUNNY);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('SPYING EASTER BUNNY DESTROYED');
                }
                attackedCell.occupiedBy = [];
                attackedCell.molten = action.payload.attackType === GameEntities.AttackType.HOT_CHOCOLATE;
            }
        } else if (action.payload.attackType === GameEntities.AttackType.FRUIT) {
            attackedCell.shielded = false;
            if (attackedCell.occupiedBy.includes(GameEntities.EntityType.CREAM) === true) {
                attackedCell.occupiedBy.splice(attackedCell.occupiedBy.indexOf(GameEntities.EntityType.CREAM), 1);
            }
            if (attackedCell.occupiedBy.includes(GameEntities.EntityType.CHOCOLATE_FOUNTAIN) === true) {
                attackedCell.occupiedBy.splice(attackedCell.occupiedBy.indexOf(GameEntities.EntityType.CHOCOLATE_FOUNTAIN), 1);
                getCellNeighbors3x3({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game)).map(cell => {
                    let unshieldedCell = {};
                    Object.assign(unshieldedCell, cell);
                    unshieldedCell.shielded = false;
                    return unshieldedCell;
                });
            }
        } else if (action.payload.attackType === GameEntities.AttackType.BUNNY) {
            const patch = getCellPatch3x3({ row: action.payload.row, col: action.payload.col }, state.game.board,  otherPlayerField(state.game).grid);
            const xmasFactoryFiltered = patch.filter(cell => cell.occupiedBy.includes(GameEntities.EntityType.XMAS_FACTORY));
            if (xmasFactoryFiltered.length === 0) {
                console.log("Bunny reveals some secrets.");
                patch.forEach((cell) => {
                    if (cell.occupiedBy.indexOf(GameEntities.EntityType.CREAM) > -1) {
                        cell.occupiedBy.splice(cell.occupiedBy.indexOf(GameEntities.EntityType.CREAM), 1);
                    }
                });
            } else {
                console.log("Bunny got captured. Bunny destroyed and xmas factory converted to ballista.");
                currentPlayer(state.game).attacksPerTurn[GameEntities.AttackType.BUNNY] = 0;
                const spyingEasterBunnyCell = currentPlayerField(state.game).grid.filter(cell => cell.occupiedBy.includes(GameEntities.EntityType.SPYING_EASTER_BUNNY))[0];
                
                spyingEasterBunnyCell.occupiedBy.splice(spyingEasterBunnyCell.occupiedBy.indexOf(GameEntities.EntityType.SPYING_EASTER_BUNNY), 1);
                xmasFactoryFiltered[0].occupiedBy.splice(xmasFactoryFiltered[0].occupiedBy.indexOf(GameEntities.EntityType.XMAS_FACTORY), 1);
                xmasFactoryFiltered[0].occupiedBy.push(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                const balistaDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                otherPlayer(state.game).attacksPerTurn[balistaDescriptor.attackType] += balistaDescriptor.attacksPerTurn;
                otherPlayer(state.game).attacks[balistaDescriptor.attackType] = otherPlayer(state.game).attacksPerTurn[balistaDescriptor.attackType];
            }
        }
    },
    [GameActions.finishGame]: (state, action) => {
        state.game = undefined;
    }
});

export { gameplayReducer, GameStateTypes }