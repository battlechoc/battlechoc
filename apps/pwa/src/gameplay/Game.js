import * as GameEntities from "./GameEntities.js";
import * as GameActions from "./GameActions.js";

const GameStateTypes = Object.freeze({
    START: 'GameStateTypes.START',
    CHOOSE_FIELD_OR_START: 'GameStateTypes.CHOOSE_FIELD_OR_START',
    CHOOSE_FIELD: 'GameStateTypes.CHOOSE_FIELD',
    PLACEMENT_INIT_PLAYER_1: 'GameStateTypes.PLACEMENT_INIT_PLAYER_1',
    PLACEMENT_INIT_PLAYER_2: 'GameStateTypes.PLACEMENT_INIT_PLAYER_2',
    BUILD_PHASE: 'GameStateTypes.BUILD_PHASE',
    ATTACK_PHASE: 'GameStateTypes.ATTACK_PHASE',
    END: 'GameStateTypes.END'
});

class Game {
    static currentPlayer(gameState) {
        return gameState.players[gameState.currentPlayerIndex];
    }

    static otherPlayer(gameState) {
        return gameState.players[1 - gameState.currentPlayerIndex];
    }

    static createBoard(gameState, boardConfig) {
        return GameEntities.Board.generate(boardConfig.boardSize, boardConfig.boardSeed);
    }

    static nextGameState(gameState, actionType) {
        switch (gameState) {
            case GameStateTypes.START: {
                if (actionType === GameActions.startGame.type) {
                    return GameStateTypes.CHOOSE_FIELD_OR_START;
                }
                break;
            }
            case GameStateTypes.CHOOSE_FIELD_OR_START: {
                if (actionType === GameActions.chooseField.type) {
                    return GameStateTypes.PLACEMENT_INIT_PLAYER_1;
                } else if (actionType === GameActions.chooseStart.type) {
                    return GameStateTypes.CHOOSE_FIELD;
                }
                break;
            }
            case GameStateTypes.CHOOSE_FIELD: {
                if (actionType === GameActions.chooseField.type) {
                    return GameStateTypes.PLACEMENT_INIT_PLAYER_1;
                }
                break;
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_1: {
                return gameState;
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_2: {
                return gameState;
            }
            case GameStateTypes.BUILD_PHASE: {
                return gameState;
            }
            case GameStateTypes.ATTACK_PHASE: {
                return gameState;
            }
            case GameStateTypes.END: {
                return gameState;
            }
            default: {
                throw new Error("Trying to perform action in undefined game state.");
            }
        }
        return gameState;
    }

    static isValidAction(gameState, actionType, currentPlayerId, issuingPlayerId) {
        if (currentPlayerId !== issuingPlayerId) {
            return false;
        }

        switch (gameState) {
            case GameStateTypes.START: {
                if (actionType === GameActions.createBoard.type) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.CHOOSE_FIELD_OR_START: {
                if (actionType === GameActions.chooseField.type ||
                    actionType === GameActions.chooseStart.type) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.CHOOSE_FIELD: {
                if (actionType === GameActions.chooseField.type) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_1: {
                return true;
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_2: {
                return true;
            }
            case GameStateTypes.BUILD_PHASE: {
                return true;
            }
            case GameStateTypes.ATTACK_PHASE: {
                return true;
            }
            case GameStateTypes.END: {
                return false;
            }
            default: {
                return false;
            }
        }
    }

    static listPossibleActions(gameState, currentPlayerId, playerId) {
        if (currentPlayerId !== playerId) {
            return [];
        }
        switch (gameState) {
            case GameStateTypes.START: {
                return [GameActions.createBoard];
            }
            case GameStateTypes.CHOOSE_FIELD_OR_START: {
                return [GameActions.chooseStart, GameActions.chooseField];
            }
            case GameStateTypes.CHOOSE_FIELD: {
                return [GameActions.chooseField];
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_1: {
                return [GameActions.build];
            }
            case GameStateTypes.PLACEMENT_INIT_PLAYER_2: {
                return [GameActions.build];
            }
            case GameStateTypes.BUILD_PHASE: {
                return [GameActions.build,
                GameActions.finishBuildPhase,
                GameActions.finishTurn];
            }
            case GameStateTypes.ATTACK_PHASE: {
                return [GameActions.attack,
                GameActions.finishTurn];
            }
            case GameStateTypes.END: {
                return [];
            }
            default: {
                throw new Error("Trying to get list of possible actions in invalid game state.");
            }
        }
    }
}

export { GameStateTypes, Game };