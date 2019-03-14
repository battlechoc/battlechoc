import { GameActionTypes, IssuerRelevantActions } from './GameActions';
import { UiActionTypes } from '../ui/UiActions';
import * as GameEntities from './GameEntities';
import * as Errors from './Errors.js';
import { GameStateTypes } from './GameplayReducer';

class Rules {
    static currentPlayer(gameState) {
        return gameState.players[gameState.currentPlayerIndex];
    }

    static isGameAction(action) {
        return action.type.includes('battlechoc/gameplay/');
    }

    static isUiAction(action) {
        return action.type.includes('battlechoc/ui/');
    }

    static playerBoardCell(gameState, playerIndex, cellIdx) {
        return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[cellIdx.row * gameState.board.size.cols + cellIdx.col];
    }

    static currentPlayerBoardCell(gameState, cellIdx) {
        return this.playerBoardCell(gameState, gameState.currentPlayerIndex, cellIdx);
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
        console.dir(cellIdx);
        console.dir(this.getCellNeighbors(cellIdx, gameState));
        return this.getCellNeighbors(cellIdx, gameState).filter(cell => cell.occupiedBy.includes(GameEntities.EntityType.FACTORY)).length > 0;
    }

    static canBuildOnCell(cellIdx, entityType, gameState) {
        let cell = this.currentPlayerBoardCell(gameState, cellIdx);
        if (entityType === GameEntities.EntityType.FRUIT_CANNON && cell.occupiedBy.includes(GameEntities.EntityType.RUM_TRUFFLE_CANNON)) {
            return true;
        } else if (entityType !== GameEntities.EntityType.FRUIT_CANNON &&
            ((entityType !== GameEntities.EntityType.FACTORY_EXTENSION && cell.occupiedBy.length === 0) ||
                (entityType === GameEntities.EntityType.CREAM && !cell.occupiedBy.includes(GameEntities.EntityType.CREAM)) ||
                (entityType === GameEntities.EntityType.FACTORY_EXTENSION && ((cell.occupiedBy.length === 1 && cell.occupiedBy[0] === GameEntities.EntityType.CREAM) || cell.occupiedBy.length === 0) && this.canBuildFactoryExtensionOnCell(cellIdx, gameState)) ||
                (entityType !== GameEntities.EntityType.CREAM && entityType !== GameEntities.EntityType.FACTORY_EXTENSION && cell.occupiedBy.length === 1 && cell.occupiedBy[0] === GameEntities.EntityType.CREAM))) {
            return true;
        } else {
            return new Errors.BuildNotPossibleError('Build not possible on given field row: ' +
                cellIdx.row + ' col: ' + cellIdx.col + ', entity type: ' + entityType + ' cell occupied by: ' + cell.occupiedBy);
        }
    }

    static countTrees(grid) {
        let count = 0;
        for (var cell in grid) {
            if (grid[cell].occupiedBy.includes(GameEntities.EntityType.CACAOTREE)) {
                ++count;
            }
        }
        return count;
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
            if (player.buildingsPerTurn === 0 && player.attacksPerTurn === 0) {
                potentialWinners.push(gameState.players[1 - playerIdx]);
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
                const player0Trees = Rules.countTrees(gameState.board.fields[potentialWinners[0].fieldIndex].grid, gameState.board.size);
                const player1Trees = Rules.countTrees(gameState.board.fields[potentialWinners[1].fieldIndex].grid, gameState.board.size);
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

    static issuerIsInvalid(action, state) {
        if (IssuerRelevantActions.includes(action.type)) {
            if (typeof action.payload === 'undefined' ||
                typeof action.payload.issuer === 'undefined' ||
                action.payload.issuer !== this.currentPlayer(state).id) {
                return true;
            }
        }
        return false;
    }

    static isActionValid(action, state) {
        if (!(this.isGameAction(action) || this.isUiAction(action))) {
            return new Errors.ActionValidationError(action);
        }

        let currentState = typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state;

        if (Rules.issuerIsInvalid(action, state.gameplay.game)) {
            let issuerId;
            if (typeof action.payload !== 'undefined') {
                issuerId = action.payload.issuer;
            }
            return new Errors.InvalidActionIssuer(action, issuerId, this.currentPlayer(state.gameplay.game).id);
        }

        if (typeof currentState === 'undefined' && (action.type === GameActionTypes.startGame || action.type === GameActionTypes.resumeGame)) {
            return true;
        } else if (action.type === GameActionTypes.createBoard) {
            return currentState === GameStateTypes.START;
        } else if (action.type === GameActionTypes.chooseStart) {
            return currentState === GameStateTypes.CHOOSE_FIELD_OR_START;
        } else if (action.type === GameActionTypes.chooseField) {
            return currentState === GameStateTypes.CHOOSE_FIELD_OR_START || currentState === GameStateTypes.CHOOSE_FIELD;
        } else if (action.type === GameActionTypes.finishGame) {
            return true;
        } else if (action.type === GameActionTypes.finishTurn) {
            return true;
        } else if (action.type === GameActionTypes.finishBuildPhase) {
            return currentState === GameStateTypes.BUILD_PHASE;
        } else if (action.type === GameActionTypes.build) {
            if (currentState !== GameStateTypes.BUILD_PHASE && currentState !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && currentState !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
                return new Errors.UnexpectedStateError(currentState);
            } else if ((this.currentPlayer(state.gameplay.game).buildings === 0 || (this.currentPlayer(state.gameplay.game).hasFactory === false && action.payload.building.type === GameEntities.EntityType.FACTORY_EXTENSION)) &&
                action.payload.building.type !== GameEntities.EntityType.FACTORY) {
                return new Errors.NoBuildingsLeftError();
            } else if (this.currentPlayer(state.gameplay.game).cacao < action.payload.building.costs) {
                return new Errors.NoCacaoLeftError();
            } else {
                return this.canBuildOnCell(action.payload.building.position, action.payload.building.type, state.gameplay.game);
            }
        } else if (action.type === GameActionTypes.attack) {
            let attackedCell = this.otherPlayerBoardCell(state.gameplay.game, action.payload);
            if (this.currentPlayer(state.gameplay.game).attacks === 0) {
                return new Errors.NoAttacksLeftError();
            } else if (attackedCell.occupiedBy.length === 0) {
                return new Errors.TargetEmptyError();
            } else {
                return true;
            }
        } else if (action.type === UiActionTypes.selectBuilding) {
            return true;
        } else if (action.type === UiActionTypes.changeLanguage) {
            return true;
        } else if (action.type === UiActionTypes.deselectBuildings) {
            return true;
        } else if (action.type === UiActionTypes.gameResumeable) {
            return true;
        } else {
            return new Errors.ActionValidationError(action);
        }
    }
}

export default Rules;
