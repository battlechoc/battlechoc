const entities = require('./entities.js');

const GameActionTypes = Object.freeze({
    finishGame: 'battlechoc/gameplay/finishGame',
    chooseField: 'battlechoc/gameplay/chooseField',
    chooseStart: 'battlechoc/gameplay/chooseStart',
    finishTurn: 'battlechoc/gameplay/finishTurn',
    finishBuildPhase: 'battlechoc/gameplay/finishBuildPhase',
    build: 'battlechoc/gameplay/build',
    attack: 'battlechoc/gameplay/attack',
    endGame: 'battlechoc/gameplay/endGame'
});

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

function playerHasHarmfulAttacksPerTurn(player, playerGrid, otherPlayerGrid) {
    if (player.attacksPerTurn[entities.AttackType.HOT_CHOCOLATE] > 0 ||
        (player.attacksPerTurn[entities.AttackType.TRUFFLE] > 0 && player.attacksPerTurn[entities.AttackType.FRUIT] > 0) ||
        (player.attacksPerTurn[entities.AttackType.TRUFFLE] > 0)) {
        return true;
    } else {
        return false;
    }
}

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
    currentPlayer(gameState).attacks[entities.AttackType.TRUFFLE] = currentPlayer(gameState).attacksPerTurn[entities.AttackType.TRUFFLE];
    currentPlayer(gameState).attacks[entities.AttackType.FRUIT] = currentPlayer(gameState).attacksPerTurn[entities.AttackType.FRUIT];
    currentPlayer(gameState).attacks[entities.AttackType.HOT_CHOCOLATE] = currentPlayer(gameState).attacksPerTurn[entities.AttackType.HOT_CHOCOLATE];
    currentPlayer(gameState).attacks[entities.AttackType.BUNNY] = currentPlayer(gameState).attacksPerTurn[entities.AttackType.BUNNY];
    currentPlayer(gameState).buildings = currentPlayer(gameState).buildingsPerTurn;
    if (currentPlayer(gameState).buildings > 0) {
        gameState.state = GameStateTypes.BUILD_PHASE;
    } else {
        gameState.state = GameStateTypes.ATTACK_PHASE;
    }
}

function calculateCacaoPerTurn(building, cellColor) {
    let cacaoPerTurn = building.cacaoPerTurn;
    if (typeof cacaoPerTurn === 'function') {
        cacaoPerTurn = building.cacaoPerTurn()[0];
    }
    if (cellColor === entities.BoardCellTypes.WHITE) {
        cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
    }
    return cacaoPerTurn;
}

function calculateBuildingsPerTurn(building, cellColor) {
    let buildingsPerTurn = building.buildingsPerTurn;
    if (typeof buildingsPerTurn === 'function') {
        buildingsPerTurn = building.buildingsPerTurn()[0];
    }
    if (cellColor === entities.BoardCellTypes.BLACK) {
        buildingsPerTurn += 1;
    }
    return buildingsPerTurn;
}

class Rules {
    static isGameAction(action) {
        return action.type.includes('battlechoc/gameplay/');
    }

    static playerBoardCell(gameState, playerIndex, cellIdx) {
        return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[cellIdx.row * gameState.board.size.cols + cellIdx.col];
    }

    static currentPlayerBoardCell(gameState, cellIdx) {
        return this.playerBoardCell(gameState, gameState.currentPlayerIndex, cellIdx);
    }

    static currentPlayerField(gameState) {
        return gameState.board.fields[gameState.players[gameState.currentPlayerIndex].fieldIndex];
    }

    static otherPlayerBoardCell(gameState, cellIdx) {
        return this.playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, cellIdx);
    }

    static getCellNeighbors(cellIdx, gameState) {
        let neighbors = [];

        const idxLeftOf = { row: cellIdx.row, col: cellIdx.col - 1 };
        if (idxLeftOf.col >= 0) {
            neighbors.push(this.currentPlayerBoardCell(gameState, idxLeftOf));
        }

        const idxRightOf = { row: cellIdx.row, col: cellIdx.col + 1 };
        if (idxRightOf.col < gameState.board.size.cols) {
            neighbors.push(this.currentPlayerBoardCell(gameState, idxRightOf));
        }

        const idxTopOf = { row: cellIdx.row - 1, col: cellIdx.col };
        if (idxTopOf.row >= 0) {
            neighbors.push(this.currentPlayerBoardCell(gameState, idxTopOf));
        }

        const idxBelowOf = { row: cellIdx.row + 1, col: cellIdx.col };
        if (idxBelowOf.row < gameState.board.size.rows) {
            neighbors.push(this.currentPlayerBoardCell(gameState, idxBelowOf));
        }

        return neighbors;
    }

    static canBuildFactoryExtensionOnCell(cellIdx, gameState) {
        return this.getCellNeighbors(cellIdx, gameState).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.FACTORY)).length > 0;
    }

    static canBuildOnCell(cellIdx, entityType, gameState) {
        let cell = this.currentPlayerBoardCell(gameState, cellIdx);
        if (entityType === entities.EntityType.SPYING_EASTER_BUNNY && currentPlayerField(gameState).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.SPYING_EASTER_BUNNY)).length > 0) {
            return false;
        } else if (cell.molten) {
            return false;
        } else if (entityType === entities.EntityType.FRUIT_CANNON && cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.RUM_TRUFFLE_CANNON)) {
            return true;
        } else if (entityType !== entities.EntityType.FRUIT_CANNON &&
            ((entityType !== entities.EntityType.FACTORY_EXTENSION && cell.occupiedBy.length === 0) ||
                (entityType === entities.EntityType.CREAM && !cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CREAM)) ||
                (entityType === entities.EntityType.FACTORY_EXTENSION && ((cell.occupiedBy.length === 1 && cell.occupiedBy[0].type === entities.EntityType.CREAM) || cell.occupiedBy.length === 0) && this.canBuildFactoryExtensionOnCell(cellIdx, gameState)) ||
                (entityType !== entities.EntityType.CREAM && entityType !== entities.EntityType.FACTORY_EXTENSION && cell.occupiedBy.length === 1 && cell.occupiedBy[0].type === entities.EntityType.CREAM))) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Determines who won the game.
     * 
     * @param {state} gameState 
     * 
     * returns the player that won the game. otherwise returns undefined
     */
    static determineWinner(gameState) {
        let potentialWinners = [];
        for (var playerIdx = 0; playerIdx < 2; ++playerIdx) {
            const player = gameState.players[playerIdx];
            const playerCanAttack = playerHasHarmfulAttacksPerTurn(player, gameState.board.fields[gameState.players[1 - playerIdx].fieldIndex].grid);
            if ((player.buildingsPerTurn === 0 && !playerCanAttack) ||
                (!playerCanAttack && player.cacaoPerTurn === 0 && player.cacao < entities.getEntityDescriptor(entities.EntityType.CACAOTREE, player.level).costs)) {
                let winner = Object.assign({ idx: 1 - playerIdx }, gameState.players[1 - playerIdx]);
                potentialWinners.push(winner);
            }
        }

        if (potentialWinners.length === 0) {
            return undefined;
        } else if (potentialWinners.length === 1) {
            return potentialWinners;
        } else {
            if (potentialWinners[0].cacao > potentialWinners[1].cacao) {
                return potentialWinners.slice(0, 1);
            } else if (potentialWinners[1].cacao > potentialWinners[0].cacao) {
                return potentialWinners.slice(1, 2);
            } else {
                const player0Trees = gameState.board.fields[potentialWinners[0].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CACAOTREE)).length;
                const player1Trees = gameState.board.fields[potentialWinners[1].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CACAOTREE)).length;
                if (player0Trees > player1Trees) {
                    return potentialWinners.slice(0, 1);
                } else if (player1Trees > player0Trees) {
                    return potentialWinners.slice(1, 2);
                } else {
                    return potentialWinners;
                }
            }
        }
    }

    static isActionValid(game, action) {
        if (!this.isGameAction(action)) {
            console.warn('IS NOT A GAME ACTION ' + JSON.stringify(action))
            return false;
        }

        let currentState = typeof game === 'undefined' ? undefined : game.state;

        if (typeof currentState !== 'undefined') {
            if (!game.isRunning && action.type !== GameActionTypes.finishGame) {
                console.warn('GAME ALREADY ENDED BUT IT WAS TRIED TO ISSUE ' + JSON.stringify(action));
                return false;
            }
        }

        if (action.type === GameActionTypes.chooseStart) {
            if (currentState === GameStateTypes.CHOOSE_FIELD_OR_START) {
                return true;
            } else {
                console.warn('CANNOT COOSE START OUTSIDE OF GAMESTATE ' + GameStateTypes.CHOOSE_FIELD_OR_START);
                return false;
            }
        } else if (action.type === GameActionTypes.chooseField) {
            if (currentState === GameStateTypes.CHOOSE_FIELD_OR_START || currentState === GameStateTypes.CHOOSE_FIELD) {
                return true;
            } else {
                console.warn(GameActionTypes.chooseField + ' IS NOT A VALID ACTION IN GAMESTATE ' + currentState);
                return false;
            }
        } else if (action.type === GameActionTypes.finishTurn) {
            return true;
        } else if (action.type === GameActionTypes.finishBuildPhase) {
            if (currentState === GameStateTypes.BUILD_PHASE) {
                return true;
            } else {
                console.warn(GameActionTypes.finishBuildPhase + ' IS NOT A VALID ACTION IN GAMESTATE ' + currentState);
                return false;
            }
        } else if (action.type === GameActionTypes.build) {
            if (currentState !== GameStateTypes.BUILD_PHASE && currentState !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && currentState !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
                console.warn('PLAYER IS IN UNEXPECTED STATE ' + JSON.stringify(game, action));
                return false;
            } else if (currentPlayer(game).buildings === 0 && action.payload.building.type !== entities.EntityType.FACTORY) {
                console.warn('NO BUILDINGS LEFT')
                return false;
            } else if (currentPlayer(game).cacao < action.payload.building.costs) {
                console.warn('NO CACAO LEFT')
                return false;
            } else {
                if (this.canBuildOnCell(action.payload.building.position, action.payload.building.type, game)) {
                    return true;
                } else {
                    console.warn('CANNOT BUILD ON CELL', action.payload.building.position);
                    return false;
                }
            }
        } else if (action.type === GameActionTypes.attack) {
            if (currentPlayer(game).attacks[action.payload.attackType] === 0) {
                console.warn('NO ATTACKS WITH TYPE OF ' + action.payload.attackType + ' LEFT');
                return false;
            } else if (this.otherPlayerBoardCell(game, action.payload).occupiedBy.length === 0 &&
                action.payload.attackType !== entities.AttackType.BUNNY && action.payload.attackType !== entities.AttackType.HOT_CHOCOLATE) {
                console.warn('FIELD IS EMPTY');
                return false;
            } else {
                return true;
            }
        } else if (action.type === GameActionTypes.endGame) {
            return true;
        }  else {
            console.warn('NOT A VALID GAME STATE')
            return false;
        }
    }
}

class Reducer {
    static updateState(game, action) {
        switch (action.type) {
            case GameActionTypes.chooseField:
                currentPlayer(game).fieldIndex = action.payload.fieldIdx;
                otherPlayer(game).fieldIndex = 1 - action.payload.fieldIdx;
                game.currentPlayerIndex = 1 - game.currentPlayerIndex;
                game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
                break;
            case GameActionTypes.chooseStart:
                game.state = GameStateTypes.CHOOSE_FIELD;
                game.currentPlayerIndex = 1 - game.currentPlayerIndex;
                break;
            case GameActionTypes.finishTurn:
                if (game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
                    game.currentPlayerIndex = 1 - game.currentPlayerIndex;
                    game.state = GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
                } else if (game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT ||
                    game.state === GameStateTypes.ATTACK_PHASE ||
                    game.state === GameStateTypes.BUILD_PHASE) {
                    prepareBuildPhase(game);
                }
                break;
            case GameActionTypes.finishBuildPhase:
                game.state = GameStateTypes.ATTACK_PHASE;
                break;
            case GameActionTypes.build:
                currentPlayerBoardCell(game, action.payload.building.position.row, action.payload.building.position.col).occupiedBy.push(action.payload.building);
                var cellColor = currentPlayerBoardCell(game, action.payload.building.position.row, action.payload.building.position.col).type;
                currentPlayer(game).statistics.builtEntities += 1;
                if (action.payload.building.type === entities.EntityType.FACTORY) {
                    currentPlayer(game).buildingsPerTurn = calculateBuildingsPerTurn(action.payload.building, cellColor);
                    currentPlayer(game).cacaoPerTurn += calculateCacaoPerTurn(action.payload.building, cellColor);
                    currentPlayer(game).hasFactory = true;
                } else {
                    if (action.payload.building.type === entities.EntityType.CACAOTREE) {
                        currentPlayer(game).cacaoPerTurn += calculateCacaoPerTurn(action.payload.building, cellColor);
                    } else if (action.payload.building.type === entities.EntityType.RUM_TRUFFLE_CANNON) {
                        currentPlayer(game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                        currentPlayer(game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                    } else if (action.payload.building.type === entities.EntityType.FRUIT_CANNON) {
                        currentPlayer(game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                        currentPlayer(game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                        let cell = currentPlayerBoardCell(game, action.payload.building.position.row, action.payload.building.position.col);
                        cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== entities.EntityType.RUM_TRUFFLE_CANNON);
                    } else if (action.payload.building.type === entities.EntityType.HOT_CHOCOLATE_BALLISTA) {
                        currentPlayer(game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                        currentPlayer(game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                    } else if (action.payload.building.type === entities.EntityType.SPYING_EASTER_BUNNY) {
                        currentPlayer(game).attacksPerTurn[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                        currentPlayer(game).attacks[action.payload.building.attackType] += action.payload.building.attacksPerTurn;
                    } else if (action.payload.building.type === entities.EntityType.FACTORY_EXTENSION) {
                        currentPlayer(game).buildingsPerTurn += calculateBuildingsPerTurn(action.payload.building, cellColor);
                    } else if (action.payload.building.type === entities.EntityType.CHOCOLATE_FOUNTAIN) {
                        const neighbors = getCellPatch3x3({ row: action.payload.building.position.row, col: action.payload.building.position.col }, game.board, currentPlayerField(game).grid);
                        for (let i = 0; i < neighbors.length; i++) {
                            neighbors[i].shielded = true;
                        }
                    }
                    currentPlayer(game).buildings -= 1;
                    currentPlayer(game).cacao -= action.payload.building.costs;
                }
                break;
            case GameActionTypes.attack:
                let attackType = action.payload.attackType;
                currentPlayer(game).attacks[attackType] -= 1;
                let attackedCell = otherPlayerBoardCell(game, action.payload);
                var cellColor = attackedCell.type;
                let opponent = otherPlayer(game);

                if (attackType === entities.AttackType.BUNNY) {
                    const patch = getCellPatch3x3({ row: action.payload.row, col: action.payload.col }, game.board, otherPlayerField(game).grid);
                    const xmasFactoryFiltered = patch.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.XMAS_FACTORY));
                    if (xmasFactoryFiltered.length === 0) {
                        console.log("Bunny reveals some secrets.");
                        currentPlayer(game).statistics.espionages += 1;
                        patch.forEach((cell) => {
                            if (cell.occupiedBy.map(entity => entity.type).indexOf(entities.EntityType.CREAM) > -1) {
                                cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== entities.EntityType.CREAM);
                            }
                        });
                    } else {
                        console.log("Bunny got captured. Bunny destroyed and xmas factory converted to ballista.");
                        currentPlayer(game).attacksPerTurn[entities.AttackType.BUNNY] = 0;
                        const spyingEasterBunnyCell = currentPlayerField(game).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.SPYING_EASTER_BUNNY))[0];
                        spyingEasterBunnyCell.occupiedBy = spyingEasterBunnyCell.occupiedBy.filter(entity => entity.type !== entities.EntityType.SPYING_EASTER_BUNNY);

                        let ballista = entities.createEntity(entities.EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                        ballista.position = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type === entities.EntityType.XMAS_FACTORY)[0].position;
                        xmasFactoryFiltered[0].occupiedBy = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type !== entities.EntityType.XMAS_FACTORY);
                        xmasFactoryFiltered[0].occupiedBy.push(ballista);
                        opponent.attacksPerTurn[entities.AttackType.HOT_CHOCOLATE] += 1;
                        opponent.attacks[entities.AttackType.HOT_CHOCOLATE] = otherPlayer(game).attacksPerTurn[entities.AttackType.HOT_CHOCOLATE];
                    }
                } else if (attackedCell.shielded === true && attackType !== entities.AttackType.HOT_CHOCOLATE) {
                    let damage = action.payload.attack;
                    if (attackType === entities.AttackType.TRUFFLE) {
                        damage = 0.1 * damage;
                    }

                    let neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, game.board, otherPlayerField(game).grid);
                    let cellsWithFountains = neighbors.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CHOCOLATE_FOUNTAIN));

                    let fountain = cellsWithFountains[0].occupiedBy.filter(entity => entity.type === entities.EntityType.CHOCOLATE_FOUNTAIN)[0];
                    fountain.hp = Math.round(fountain.hp - damage);
                    if (fountain.hp < 1) {
                        cellsWithFountains[0].occupiedBy = [];
                        neighbors = getCellPatch3x3({ row: cellsWithFountains[0].row, col: cellsWithFountains[0].col }, game.board, otherPlayerField(game).grid);
                        neighbors.forEach(neighbor => {
                            const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, game.board, otherPlayerField(game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CHOCOLATE_FOUNTAIN));
                            if (otherFountainNearby.length === 0) {
                                neighbor.shielded = false;
                            }
                        });
                        console.log('CHOCOLATE FOUNTAIN DESTROYED');
                    }
                } else {
                    if (attackType === entities.AttackType.HOT_CHOCOLATE && attackedCell.occupiedBy.length === 0) {
                        attackedCell.molten = true;
                        currentPlayer(state.game).statistics.moltenFields += 1;
                    } else {
                        attackedCell.occupiedBy.forEach(entity => {
                            if (attackType === entities.AttackType.HOT_CHOCOLATE) {
                                entity.hp = 0;
                            } else {
                                let damage = action.payload.damage;
                                if (attackType === entities.AttackType.FRUIT) {
                                    damage = 0.1 * damage;
                                }
                                entity.hp = Math.round(entity.hp - damage);
                            }

                            if (entity.hp < 1) {
                                if (entity.type === entities.EntityType.FACTORY) {
                                    opponent.hasFactory = false;
                                    console.log(opponent.buildingsPerTurn)
                                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(entities.getEntityDescriptor(entities.EntityType.FACTORY, opponent.level), cellColor);
                                    console.log(opponent.buildingsPerTurn)
                                    opponent.cacaoPerTurn -= calculateCacaoPerTurn(entities.getEntityDescriptor(entities.EntityType.FACTORY, opponent.level), cellColor);
                                    console.log('FACTORY DESTROYED');
                                } else if (entity.type === entities.EntityType.FACTORY_EXTENSION) {
                                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(entities.getEntityDescriptor(entities.EntityType.FACTORY_EXTENSION, opponent.level), cellColor);
                                    console.log('FACTORY EXTENSION DESTROYED');
                                } else if (entity.type === entities.EntityType.CACAOTREE) {
                                    opponent.cacaoPerTurn -= calculateCacaoPerTurn(entities.getEntityDescriptor(entities.EntityType.CACAOTREE, opponent.level), cellColor);
                                    console.log('CACAOTREE DESTROYED');
                                } else if (entity.type === entities.EntityType.RUM_TRUFFLE_CANNON) {
                                    const destroyedBuildingDescriptor = entities.getEntityDescriptor(entities.EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType()] -= destroyedBuildingDescriptor.attacksPerTurn();
                                    console.log('CANNON DESTROYED');
                                } else if (entity.type === entities.EntityType.HOT_CHOCOLATE_BALLISTA) {
                                    const destroyedBuildingDescriptor = entities.getEntityDescriptor(entities.EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType()] -= destroyedBuildingDescriptor.attacksPerTurn();
                                    console.log('BALISTA DESTROYED');
                                } else if (entity.type === entities.EntityType.FRUIT_CANNON) {
                                    const destroyedBuildingDescriptor = entities.getEntityDescriptor(entities.EntityType.FRUIT_CANNON, opponent.level);
                                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType()] -= destroyedBuildingDescriptor.attacksPerTurn();
                                    const rumTruffleCannon = entities.getEntityDescriptor(entities.EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                                    opponent.attacksPerTurn[rumTruffleCannon.attackType()] -= rumTruffleCannon.attacksPerTurn();
                                    console.log('FRUIT CANNON DESTROYED');
                                } else if (entity.type === entities.EntityType.SPYING_EASTER_BUNNY) {
                                    const destroyedBuildingDescriptor = entities.getEntityDescriptor(entities.EntityType.SPYING_EASTER_BUNNY, opponent.level);
                                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType()] -= destroyedBuildingDescriptor.attacksPerTurn();
                                    console.log('SPYING EASTER BUNNY DESTROYED');
                                } else if (attackType === entities.AttackType.HOT_CHOCOLATE && entity.type === entities.EntityType.CHOCOLATE_FOUNTAIN) {
                                    attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== entities.EntityType.CHOCOLATE_FOUNTAIN);
                                    const neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, game.board, otherPlayerField(game).grid);
                                    neighbors.forEach(neighbor => {
                                        const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, game.board, otherPlayerField(game).grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(entities.EntityType.CHOCOLATE_FOUNTAIN));
                                        if (otherFountainNearby.length === 0) {
                                            neighbor.shielded = false;
                                        }
                                    });
                                    console.log('CHOCOLATE FOUNTAIN DESTROYED');
                                }
                                attackedCell.occupiedBy = attackedCell.occupiedBy.filter(fieldEntity => fieldEntity.id !== entity.id);
                                attackedCell.molten = attackType === entities.AttackType.HOT_CHOCOLATE;
                                if (attackedCell.molten) {
                                    currentPlayer(game).statistics.moltenFields += 1;
                                } else {
                                    currentPlayer(game).statistics.attacks += 1;
                                }
                            }
                        });
                    }
                }
                break;
            case GameActionTypes.endGame:
                game.isRunning = false;
                game.winners = action.payload.winners;

                let winners = game.winners.map(player => player.id);

                if (action.payload.winners.length === 1) {
                    let currentPlayerWon = winners.includes(currentPlayer(game).id);
                    currentPlayer(game).statistics.lost = !currentPlayerWon;
                    currentPlayer(game).statistics.won = currentPlayerWon;
                    otherPlayer(game).statistics.lost = currentPlayerWon;
                    otherPlayer(game).statistics.won = !currentPlayerWon;
                } else if (action.payload.winners.length === 2) {
                    currentPlayer(game).statistics.lost = false;
                    currentPlayer(game).statistics.won = false;
                    otherPlayer(game).statistics.lost = false;
                    otherPlayer(game).statistics.won = false;
                }
                break;
            default:
                console.warn('EVENT ' + action.type + ' IS NOT SUPPORTED');
        }
    }
}

module.exports = {
    Rules: Rules,
    Reducer: Reducer
}