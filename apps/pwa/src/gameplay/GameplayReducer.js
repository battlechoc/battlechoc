import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import { EntityType, BoardCellTypes, AttackType, Board, createEntity, getEntityDescriptor, getCheapest } from './GameEntities';
import { PlayerType } from './Player';
import { multiplayer, EmptyPlayerStats } from '../Multiplayer';
import logger from '../helper/logger';

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
    currentPlayer(gameState).attacks[AttackType.TRUFFLE] = currentPlayer(gameState).attacksPerTurn[AttackType.TRUFFLE];
    currentPlayer(gameState).attacks[AttackType.FRUIT] = currentPlayer(gameState).attacksPerTurn[AttackType.FRUIT];
    currentPlayer(gameState).attacks[AttackType.HOT_CHOCOLATE] = currentPlayer(gameState).attacksPerTurn[AttackType.HOT_CHOCOLATE];
    currentPlayer(gameState).attacks[AttackType.BUNNY] = currentPlayer(gameState).attacksPerTurn[AttackType.BUNNY];
    currentPlayer(gameState).buildings = currentPlayer(gameState).buildingsPerTurn;
    if (currentPlayer(gameState).buildings > 0 && currentPlayer(gameState).cacao >= getCheapest(currentPlayer(gameState).level).costs) {
        gameState.state = GameStateTypes.BUILD_PHASE;
    } else {
        gameState.state = GameStateTypes.ATTACK_PHASE;
    }
}

function calculateCacaoPerTurn(building, cellColor) {
    let cacaoPerTurn = building.cacaoPerTurn;
    if (cellColor === BoardCellTypes.WHITE) {
        cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
    }
    return cacaoPerTurn;
}

function calculateBuildingsPerTurn(building, cellColor) {
    let buildingsPerTurn = building.buildingsPerTurn;
    if (cellColor === BoardCellTypes.BLACK) {
        buildingsPerTurn += 1;
    }
    return buildingsPerTurn;
}

const gameplayReducer = createReducer({ level: EmptyPlayerStats.level }, {
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
    [GameActions.createBoard]: (state, action) => {
        state.game.board = Board.generate(action.payload.boardSize, action.payload.boardSeed);
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
        currentPlayer(state.game).statistics.builtEntities += 1;
        if (action.payload.building.type === EntityType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = calculateBuildingsPerTurn(action.payload.building, cellColor);
            currentPlayer(state.game).cacaoPerTurn += calculateCacaoPerTurn(action.payload.building, cellColor);
            currentPlayer(state.game).hasFactory = true;
        } else {
            if (action.payload.building.type === EntityType.CACAOTREE) {
                currentPlayer(state.game).cacaoPerTurn += calculateCacaoPerTurn(action.payload.building, cellColor);
            } else if (action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === EntityType.FRUIT_CANNON) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                let cell = currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col);
                cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== EntityType.RUM_TRUFFLE_CANNON);
            } else if (action.payload.building.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === EntityType.SPYING_EASTER_BUNNY) {
                currentPlayer(state.game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === EntityType.FACTORY_EXTENSION) {
                currentPlayer(state.game).buildingsPerTurn += calculateBuildingsPerTurn(action.payload.building, cellColor);
            } else if (action.payload.building.type === EntityType.CHOCOLATE_FOUNTAIN) {
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
        let attackType = action.payload.attackType;
        currentPlayer(state.game).attacks[attackType] -= 1;
        let attackedCell = otherPlayerBoardCell(state.game, action.payload);
        const cellColor = attackedCell.type;
        let opponent = otherPlayer(state.game);

        if (attackType === AttackType.BUNNY) {
            const patch = getCellPatch3x3({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
            const xmasFactoryFiltered = patch.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY));
            if (xmasFactoryFiltered.length === 0) {
                logger.info("Bunny reveals some secrets.");
                currentPlayer(state.game).statistics.espionages += 1;
                patch.forEach((cell) => {
                    if (cell.occupiedBy.map(entity => entity.type).indexOf(EntityType.CREAM) > -1) {
                        cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM);
                    }
                });
            } else {
                logger.info("Bunny got captured. Bunny destroyed and xmas factory converted to ballista.");
                currentPlayer(state.game).attacksPerTurn[AttackType.BUNNY] = 0;
                const spyingEasterBunnyCell = currentPlayerField(state.game).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY))[0];
                spyingEasterBunnyCell.occupiedBy = spyingEasterBunnyCell.occupiedBy.filter(entity => entity.type !== EntityType.SPYING_EASTER_BUNNY);

                let ballista = createEntity(EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                ballista.position = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type === EntityType.XMAS_FACTORY)[0].position;
                xmasFactoryFiltered[0].occupiedBy = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type !== EntityType.XMAS_FACTORY);
                xmasFactoryFiltered[0].occupiedBy.push(ballista);
                opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE] += 1;
                opponent.attacks[AttackType.HOT_CHOCOLATE] = opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE];
            }
        } else if (attackedCell.shielded && attackType !== AttackType.HOT_CHOCOLATE) {
            let damage = action.payload.damage;
            if (attackType === AttackType.TRUFFLE) {
                damage = 0.1 * damage;
            }

            let neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
            let cellsWithFountains = neighbors.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));

            let fountain = cellsWithFountains[0].occupiedBy.filter(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN)[0];
            fountain.hp = Math.round(fountain.hp - damage);
            if (fountain.hp < 1) {
                cellsWithFountains[0].occupiedBy = [];
                neighbors = getCellPatch3x3({ row: cellsWithFountains[0].row, col: cellsWithFountains[0].col }, state.game.board, otherPlayerField(state.game).grid);
                neighbors.forEach(neighbor => {
                    const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));
                    if (otherFountainNearby.length === 0) {
                        neighbor.shielded = false;
                    }
                });
                logger.info('CHOCOLATE FOUNTAIN DESTROYED');
            }
        } else {
            if (attackedCell.occupiedBy.length > 0) {
                currentPlayer(state.game).statistics.attacks += 1;
            }

            if (attackType === AttackType.HOT_CHOCOLATE) {
                attackedCell.molten = true;
                if (attackedCell.occupiedBy.length > 0) {
                    currentPlayer(state.game).statistics.moltenFields += 1;
                }
            }

            attackedCell.occupiedBy.forEach(entity => {
                if (attackType === AttackType.HOT_CHOCOLATE) {
                    entity.hp = 0;
                } else {
                    let damage = action.payload.damage;
                    if (attackType === AttackType.FRUIT) {
                        damage = 0.1 * damage;
                    }
                    entity.hp = Math.round(entity.hp - damage);
                }

                if (entity.hp < 1) {
                    if (entity.type === EntityType.FACTORY) {
                        opponent.hasFactory = false;
                        opponent.buildingsPerTurn -= calculateBuildingsPerTurn(getEntityDescriptor(EntityType.FACTORY, opponent.level), cellColor);
                        opponent.cacaoPerTurn -= calculateCacaoPerTurn(getEntityDescriptor(EntityType.FACTORY, opponent.level), cellColor);
                        logger.info('FACTORY DESTROYED');
                    } else if (entity.type === EntityType.FACTORY_EXTENSION) {
                        opponent.buildingsPerTurn -= calculateBuildingsPerTurn(getEntityDescriptor(EntityType.FACTORY_EXTENSION, opponent.level), cellColor);
                        logger.info('FACTORY EXTENSION DESTROYED');
                    } else if (entity.type === EntityType.CACAOTREE) {
                        opponent.cacaoPerTurn -= calculateCacaoPerTurn(getEntityDescriptor(EntityType.CACAOTREE, opponent.level), cellColor);
                        logger.info('CACAOTREE DESTROYED');
                    } else if (entity.type === EntityType.RUM_TRUFFLE_CANNON) {
                        const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                        opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                        logger.info('CANNON DESTROYED');
                    } else if (entity.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
                        const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                        opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                        logger.info('BALISTA DESTROYED');
                    } else if (entity.type === EntityType.FRUIT_CANNON) {
                        const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.FRUIT_CANNON, opponent.level);
                        opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                        const rumTruffleCannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                        opponent.attacksPerTurn[rumTruffleCannon.attackType] -= rumTruffleCannon.attacksPerTurn;
                        logger.info('FRUIT CANNON DESTROYED');
                    } else if (entity.type === EntityType.SPYING_EASTER_BUNNY) {
                        const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, opponent.level);
                        opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                        logger.info('SPYING EASTER BUNNY DESTROYED');
                    } else if (attackType === AttackType.HOT_CHOCOLATE && entity.type === EntityType.CHOCOLATE_FOUNTAIN) {
                        attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.CHOCOLATE_FOUNTAIN);
                        const neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
                        neighbors.forEach(neighbor => {
                            const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));
                            if (otherFountainNearby.length === 0) {
                                neighbor.shielded = false;
                            }
                        });
                        logger.info('CHOCOLATE FOUNTAIN DESTROYED');
                    }
                    attackedCell.occupiedBy = attackedCell.occupiedBy.filter(fieldEntity => fieldEntity.id !== entity.id);
                }
            });
        }
    },
    [GameActions.endGame]: (state, action) => {
        state.game.isRunning = false;
        state.game.winners = action.payload.winners;

        if (action.payload.winners.length === 1) {
            if (!multiplayer.isLocalPlayer(state.game.players.findIndex(player => player.id === action.payload.winners[0].id))) {
                currentPlayer(state.game).statistics.lost = true;
                currentPlayer(state.game).statistics.won = false;
            } else {
                currentPlayer(state.game).statistics.lost = false;
                currentPlayer(state.game).statistics.won = true;
            }
        } else if (action.payload.winners.length === 2) {
            currentPlayer(state.game).statistics.lost = false;
            currentPlayer(state.game).statistics.won = false;
        }
    },
    [GameActions.finishGame]: (state, action) => {
        state.game = undefined;
    }
});

export { gameplayReducer, GameStateTypes }