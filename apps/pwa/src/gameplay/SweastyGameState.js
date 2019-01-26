import * as Game from "./Game.js";
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
    constructor(players) {
        super(players);
        this.currentState = SweastyGameStateType.start;
    }

    listPossibleActions(player) {
        switch (this.currentState) {
            case SweastyGameState.start: {
                return [];
            }
            case SweastyGameState.choose_field_or_start: {
                return [];
            }
            case SweastyGameState.initial_placement_p1: {
                return [];
            }
            case SweastyGameState.initial_placement_p2: {
                return [];
            }
            case SweastyGameState.build_phase: {
                return [Actions.SweastyActionTypes.place_unit,
                Actions.SweastyActionTypes.finish_build_phase,
                Actions.SweastyActionTypes.finish_turn];
            }
            case SweastyGameState.attack_phase: {
                return [Actions.SweastyActionTypes.attack_field,
                Actions.SweastyActionTypes.finish_turn];
            }
            case SweastyGameState.end: {
                return [];
            }
            default: {
                return [];
            }
        }
    }
}

export { SweastyGameState };