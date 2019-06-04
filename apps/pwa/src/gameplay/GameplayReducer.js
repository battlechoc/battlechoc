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
    if (currentPlayer(gameState).buildings > 0) {
        gameState.state = GameStateTypes.BUILD_PHASE;
    } else {
        gameState.state = GameStateTypes.ATTACK_PHASE;
    }
}

function calculateCacaoPerTurn(building, cellColor) {
    let cacaoPerTurn = building.cacaoPerTurn;
    if (cellColor === GameEntities.BoardCellTypes.WHITE) {
        cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
    }
    return cacaoPerTurn;
}

function calculateBuildingsPerTurn(building, cellColor) {
    let buildingsPerTurn = building.buildingsPerTurn;
    if (cellColor === GameEntities.BoardCellTypes.BLACK) {
        buildingsPerTurn += 1;
    }
    return buildingsPerTurn;
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
            state: GameStateTypes.START,
            isRunning: true,
            winners: []
        };
    },
    [GameActions.resumeGame]: (state, action) => {
        state.game = {
            players: action.payload.players,
            currentPlayerIndex: action.payload.currentPlayerIndex,
            state: action.payload.state,
            board: action.payload.board,
            isRunning: action.payload.isRunning
        };
    },
    [GameActions.joinGame]: (state, action) => {
        state.game = action.payload;
    },
    [GameActions.playerJoined]: (state, action) => {
        state.game.players = action.payload.players;
        console.log(state.game.players);
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
        currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col).occupiedBy.push(action.payload.building);
        const cellColor = currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col).type;
        if (action.payload.building.type === GameEntities.EntityType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = calculateBuildingsPerTurn(action.payload.building, cellColor);
            currentPlayer(state.game).hasFactory = true;
        } else {
            if (action.payload.building.type === GameEntities.EntityType.CACAOTREE) {
                currentPlayer(state.game).cacaoPerTurn += calculateCacaoPerTurn(action.payload.building, cellColor);
            } else if (action.payload.building.type === GameEntities.EntityType.RUM_TRUFFLE_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FRUIT_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                let cell = currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col);
                cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.RUM_TRUFFLE_CANNON);
            } else if (action.payload.building.type === GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.SPYING_EASTER_BUNNY) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FACTORY_EXTENSION) {
                currentPlayer(state.game).buildingsPerTurn += calculateBuildingsPerTurn(action.payload.building, cellColor);
            } else if (action.payload.building.type === GameEntities.EntityType.CHOCOLATE_FOUNTAIN) {
                const neighbors = getCellPatch3x3({ row: action.payload.building.position.row, col: action.payload.building.position.col }, state.game.board, currentPlayerField(state.game).grid);
                for (let i = 0; i < neighbors.length; i++) {
                    neighbors[i].shielded = true;
                }
            }
            currentPlayer(state.game).buildings -= 1;
            currentPlayer(state.game).cacao -= action.payload.building.costs;
        }
    },
    [GameActions.attack]: (state, action) => {
        currentPlayer(state.game).attacks[action.payload.attackType] -= 1;
        let attackedCell = otherPlayerBoardCell(state.game, action.payload);
        const cellColor = attackedCell.type;
        let opponent = otherPlayer(state.game);
        if (action.payload.attackType === GameEntities.AttackType.TRUFFLE || action.payload.attackType === GameEntities.AttackType.HOT_CHOCOLATE) {
            if (attackedCell.shielded === true && action.payload.attackType === GameEntities.AttackType.TRUFFLE) {
                console.log("attacked cell was shielded");
            } else {
                if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.FACTORY)) {
                    opponent.hasFactory = false;
                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY), cellColor);
                    console.log('FACTORY DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.FACTORY_EXTENSION)) {
                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY_EXTENSION), cellColor);
                    console.log('FACTORY EXTENSION DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CACAOTREE)) {
                    opponent.cacaoPerTurn -= calculateCacaoPerTurn(GameEntities.getEntityDescriptor(GameEntities.EntityType.CACAOTREE), cellColor);
                    console.log('CACAOTREE DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.RUM_TRUFFLE_CANNON)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.RUM_TRUFFLE_CANNON);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('CANNON DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('BALISTA DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.FRUIT_CANNON)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.FRUIT_CANNON);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    const rumTruffleCannon = GameEntities.getEntityDescriptor(GameEntities.EntityType.RUM_TRUFFLE_CANNON);
                    opponent.attacksPerTurn[rumTruffleCannon.attackType] -= rumTruffleCannon.attacksPerTurn;
                    console.log('FRUIT CANNON DESTROYED');
                } else if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.SPYING_EASTER_BUNNY)) {
                    const destroyedBuildingDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.SPYING_EASTER_BUNNY);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    console.log('SPYING EASTER BUNNY DESTROYED');
                } else if (action.payload.attackType === GameEntities.AttackType.HOT_CHOCOLATE && attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CHOCOLATE_FOUNTAIN)) {
                    attackedCell.shielded = false;
                    attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.CHOCOLATE_FOUNTAIN);
                    const neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
                    neighbors.forEach(neighbor => {
                        const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CHOCOLATE_FOUNTAIN));
                        if (otherFountainNearby.length === 0) {
                            neighbor.shielded = false;
                        }
                    });
                    console.log('CHOCOLATE FOUNTAIN DESTROYED');
                }
                attackedCell.occupiedBy = [];
                attackedCell.molten = action.payload.attackType === GameEntities.AttackType.HOT_CHOCOLATE;
            }
        } else if (action.payload.attackType === GameEntities.AttackType.FRUIT) {
            if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CREAM)) {
                attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.CREAM);
            }
            if (attackedCell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CHOCOLATE_FOUNTAIN)) {
                attackedCell.shielded = false;
                attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.CHOCOLATE_FOUNTAIN);
                const neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
                neighbors.forEach(neighbor => {
                    const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.CHOCOLATE_FOUNTAIN));
                    if (otherFountainNearby.length === 0) {
                        neighbor.shielded = false;
                    }
                });
                console.log('CHOCOLATE FOUNTAIN DESTROYED');
            }
        } else if (action.payload.attackType === GameEntities.AttackType.BUNNY) {
            const patch = getCellPatch3x3({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
            const xmasFactoryFiltered = patch.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.XMAS_FACTORY));
            if (xmasFactoryFiltered.length === 0) {
                console.log("Bunny reveals some secrets.");
                patch.forEach((cell) => {
                    if (cell.occupiedBy.map(entity => entity.type).indexOf(GameEntities.EntityType.CREAM) > -1) {
                        cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.CREAM);
                    }
                });
            } else {
                console.log("Bunny got captured. Bunny destroyed and xmas factory converted to ballista.");
                currentPlayer(state.game).attacksPerTurn[GameEntities.AttackType.BUNNY] = 0;
                const spyingEasterBunnyCell = currentPlayerField(state.game).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(GameEntities.EntityType.SPYING_EASTER_BUNNY))[0];                
                spyingEasterBunnyCell.occupiedBy = spyingEasterBunnyCell.occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.SPYING_EASTER_BUNNY);
                
                let ballista = GameEntities.createEntity(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                ballista.position = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type === GameEntities.EntityType.XMAS_FACTORY)[0].position;
                xmasFactoryFiltered[0].occupiedBy = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type !== GameEntities.EntityType.XMAS_FACTORY);
                xmasFactoryFiltered[0].occupiedBy.push(ballista);
                const balistaDescriptor = GameEntities.getEntityDescriptor(GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA);
                otherPlayer(state.game).attacksPerTurn[balistaDescriptor.attackType] += balistaDescriptor.attacksPerTurn;
                otherPlayer(state.game).attacks[balistaDescriptor.attackType] = otherPlayer(state.game).attacksPerTurn[balistaDescriptor.attackType];
            }
        }
    },
    [GameActions.endGame]: (state, action) => {
        state.game.isRunning = false;
        state.game.winners = action.payload;
    },
    [GameActions.finishGame]: (state, action) => {
        state.game = undefined;
    }
});

export { gameplayReducer, GameStateTypes }