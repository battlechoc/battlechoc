import { GameActionTypes } from './GameActions';
import * as GameEntities from './GameEntities';
import { GameStateTypes } from './GameplayReducer';

class Rules {
    static currentPlayer(gameState) {
        return gameState.players[gameState.currentPlayerIndex];
    }

    static isGameAction(action) {
        return action.type.includes('battlechoc/gameplay/');
    }

    static playerBoardCell(gameState, playerIndex, cellIdx) {
        return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[cellIdx.row * gameState.board.size.cols + cellIdx.col];
    }

    static currentPlayerBoardCell(gameState, cellIdx) {
        return Rules.playerBoardCell(gameState, gameState.currentPlayerIndex, cellIdx);
    }

    static otherPlayerBoardCell(gameState, cellIdx) {
        return Rules.playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, cellIdx);
    }

    static canBuildOnCell(cellIdx, buildingType, gameState) {
        let cell = Rules.currentPlayerBoardCell(gameState, cellIdx);
        if (cell.occupiedBy.length === 0 ||
            (buildingType === GameEntities.BuildingType.CREAM && !cell.occupiedBy.includes(GameEntities.BuildingType.CREAM)) ||
            (buildingType !== GameEntities.BuildingType.CREAM && cell.occupiedBy.length === 1 && cell.occupiedBy[0] === GameEntities.BuildingType.CREAM)) {
            return true;
        } else {
            return {
                error: 'Build not possible on given field row: ' + cellIdx.row
                    + ' col: ' + cellIdx.col + ', building type: ' + buildingType + ' cell occupied by: ' + cell.occupiedBy
            };
        }
    }

    static isActionValid(action, state) {
        if (!Rules.isGameAction(action)) {
            return true;
        }

        let currentState = typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state;
        console.log(action, currentState);

        if (action.type === GameActionTypes.startGame) {
            return currentState === undefined;
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
                return { error: 'Cannot build in current game phase: ' + currentState };
            } else if (this.currentPlayer(state.gameplay.game).buildings === 0 &&
                action.payload.type !== GameEntities.BuildingType.FACTORY) {
                return { error: 'No more buildings can be built' };
            } else if (this.currentPlayer(state.gameplay.game).cacao < action.payload.costs) {
                return { error: 'Not enough cacao left' };
            } else {
                return Rules.canBuildOnCell(action.payload.position, action.payload.type, state.gameplay.game);
            }
        } else if (action.type === GameActionTypes.attack) {
            if (this.currentPlayer(state.gameplay.game).attacks === 0) {
                return { error: 'Player has no attacks left.' };
            } else {
                return true;
            }
        } else {
            return { error: action.type + ' is not a valid game action' };
        }
    }
}

export default Rules;
