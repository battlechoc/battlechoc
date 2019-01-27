import * as Game from "./Game.js";
import * as Entities from "./SweastyGameEntities.js";
import * as Actions from "./SweastyGameActions.js";

const SweastyGameStateType = Object.freeze({
    start: Symbol("start"),
    choose_field_or_start: Symbol("field_or_start"),
    initial_placement_p1: Symbol("p1_initial_placement"),
    initial_placement_p2: Symbol("p2_initial_placement"),
    build_phase: Symbol("build_phase"),
    attack_phase: Symbol("attack_phase"),
    end: Symbol("end")
});

class SweastyGameState extends Game.State {
    constructor(game, players, config) {
        super(game, players, config);
        this.currentState = SweastyGameStateType.start;
        this.board = null;

        // gamestate components
        // -- game field: 128 cells, integer describing status for each field, or bitfield (free, tree, canon, facility, foggy_for_enemy)
        // -- ressources of player 1, ressources of player 2
    }

    createBoard() {
        this.board = new Entities.Board(this.config.boardSize, this.players.length, this.config.boardSeed);
    }

    getBoard() {
        return this.board;
    }

    advanceState(nextState) {
        this.currentState = nextState;
    }

    getCurrentState() {
        return this.currentState;
    }

    /**
     * Checks if the given action is a valid move based on the current game state and player.
     * 
     * @param {Action} action 
     */
    isValidAction(action) {
        switch (this.currentState) {
            case SweastyGameStateType.start: {
                if (action instanceof Actions.CreateBoardAction) {
                    return true;
                } else {
                    return false;
                }
            }
            case SweastyGameStateType.choose_field_or_start: {
                return true;
            }
            case SweastyGameStateType.initial_placement_p1: {
                return true;
            }
            case SweastyGameStateType.initial_placement_p2: {
                return true;
            }
            case SweastyGameStateType.build_phase: {
                return true;
            }
            case SweastyGameStateType.attack_phase: {
                return true;
            }
            case SweastyGameStateType.end: {
                return false;
            }
            default: {
                return false;
            }
        }
    }

    /**
     * Performs the given action on the current game state. This method advances the game state machine.
     * 
     * @param {Action} action 
     */
    perform(action) {
        if (super.perform(action) === true) {
            switch (this.currentState) {
                case SweastyGameStateType.start: {
                    if (action instanceof Actions.CreateBoardAction) {
                        this.currentState = SweastyGameStateType.choose_field_or_start;
                    }
                    return true;
                }
                case SweastyGameStateType.choose_field_or_start: {
                    return true;
                }
                case SweastyGameStateType.initial_placement_p1: {
                    return true;
                }
                case SweastyGameStateType.initial_placement_p2: {
                    return true;
                }
                case SweastyGameStateType.build_phase: {
                    return true;
                }
                case SweastyGameStateType.attack_phase: {
                    return true;
                }
                case SweastyGameStateType.end: {
                    throw new Error("Trying to perform action in final game state. Should not happen.");
                }
                default: {
                    throw new Error("Trying to perform action in undefined game state.");
                }
            }
        } else {
            return false;
        }
    }

    listPossibleActions(player) {
        if (player !== this.currentPlayer()) {
            return [];
        }
        switch (this.currentState) {
            case SweastyGameStateType.start: {
                return [Actions.SweastyActionTypes.create_board];
            }
            case SweastyGameStateType.choose_field_or_start: {
                return [];
            }
            case SweastyGameStateType.initial_placement_p1: {
                return [];
            }
            case SweastyGameStateType.initial_placement_p2: {
                return [];
            }
            case SweastyGameStateType.build_phase: {
                return [Actions.SweastyActionTypes.place_unit,
                Actions.SweastyActionTypes.finish_build_phase,
                Actions.SweastyActionTypes.finish_turn];
            }
            case SweastyGameStateType.attack_phase: {
                return [Actions.SweastyActionTypes.attack_field,
                Actions.SweastyActionTypes.finish_turn];
            }
            case SweastyGameStateType.end: {
                return [];
            }
            default: {
                throw new Error("Trying to get list of possible actions in invalid game state.");
            }
        }
    }
}

export { SweastyGameStateType, SweastyGameState };