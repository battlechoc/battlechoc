import * as GameEntities from "./GameEntities.js";
import * as GameActions from "./GameActions.js";

const GameStateTypes = Object.freeze({
    start: 'start',
    choose_field_or_start: 'field_or_start',
    choose_field: 'choose_field',
    initial_placement_p1: 'p1_initial_placement',
    initial_placement_p2: 'p2_initial_placement',
    build_phase: 'build_phase',
    attack_phase: 'attack_phase',
    end: 'end'
});

class Game {
    static nextPlayerIndex(gameState) {
        return ((gameState.currentPlayerIndex + 1) % gameState.players.length);
    }

    static currentPlayer(gameState) {
        return gameState.players[gameState.currentPlayerIndex];
    }

    static otherPlayer(gameState) {
        return gameState.players[Game.nextPlayerIndex(gameState)];
    }

    static create(data) {
        return {
            players: data.players,
            currentPlayerIndex: 0,
            state: GameStateTypes.start
        };
    }

    static createBoard(gameState, boardConfig) {
        gameState.board = new GameEntities.Board(boardConfig.boardSize, gameState.players.length, boardConfig.boardSeed);
    }

    static chooseField(gameState, fieldIndex) {
        Game.currentPlayer(gameState).fieldIndex = fieldIndex;
        Game.otherPlayer(gameState).fieldIndex = (fieldIndex + 1) % this.players.length;
        gameState.currentPlayerIndex = Game.nextPlayerIndex(gameState);
    }

    static build(gameState, data) {
        // data: entityType, playerId, row, col
        // let entity = GameEntities.getEntity(data.entityType);
        // TODO reduce ressources of player
        // TODO create the graphical entity based on the game entity
    }

    static attack(gameStaste) {

    }

    static nextGameState(gameState, actionType) {
        switch (gameState) {
            case GameStateTypes.start: {
                if (actionType === GameActions.createBoard) {
                    return GameStateTypes.choose_field_or_start;
                }
                break;
            }
            case GameStateTypes.choose_field_or_start: {
                if (actionType === GameActions.chooseField) {
                    return GameStateTypes.initial_placement_p1;
                } else if (actionType === GameActions.chooseStart) {
                    return GameStateTypes.choose_field;
                }
                break;
            }
            case GameStateTypes.choose_field: {
                if (actionType === GameActions.chooseField) {
                    return GameStateTypes.initial_placement_p1;
                }
                break;
            }
            case GameStateTypes.initial_placement_p1: {
                return gameState;
            }
            case GameStateTypes.initial_placement_p2: {
                return gameState;
            }
            case GameStateTypes.build_phase: {
                return gameState;
            }
            case GameStateTypes.attack_phase: {
                return gameState;
            }
            case GameStateTypes.end: {
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
            case GameStateTypes.start: {
                if (actionType === GameActions.createBoard) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.choose_field_or_start: {
                if (actionType === GameActions.chooseField ||
                    actionType === GameActions.chooseStart) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.choose_field: {
                if (actionType === GameActions.chooseField) {
                    return true;
                } else {
                    return false;
                }
            }
            case GameStateTypes.initial_placement_p1: {
                return true;
            }
            case GameStateTypes.initial_placement_p2: {
                return true;
            }
            case GameStateTypes.build_phase: {
                return true;
            }
            case GameStateTypes.attack_phase: {
                return true;
            }
            case GameStateTypes.end: {
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
            case GameStateTypes.start: {
                return [GameActions.createBoard];
            }
            case GameStateTypes.choose_field_or_start: {
                return [GameActions.chooseStart, GameActions.chooseField];
            }
            case GameStateTypes.choose_field: {
                return [GameActions.chooseField];
            }
            case GameStateTypes.initial_placement_p1: {
                return [GameActions.build];
            }
            case GameStateTypes.initial_placement_p2: {
                return [GameActions.build];
            }
            case GameStateTypes.build_phase: {
                return [GameActions.build,
                GameActions.finishBuildPhase,
                GameActions.finishTurn];
            }
            case GameStateTypes.attack_phase: {
                return [GameActions.attack,
                GameActions.finishTurn];
            }
            case GameStateTypes.end: {
                return [];
            }
            default: {
                throw new Error("Trying to get list of possible actions in invalid game state.");
            }
        }
    }
}

export { GameStateTypes, Game };