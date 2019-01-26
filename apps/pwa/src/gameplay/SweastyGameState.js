import * as Game from "./Game.js";

const SweastyGameStateType = Object.freeze({
    start: Symbol("start"),
    choose_field_or_start: Symbol("field_or_start"),
    initial_placement_p1: Symbol("p1_initial_placement"),
    initial_placement_p2: Symbol("p2_initial_placement"),
    playing: Symbol("playing"),
    end: Symbol("end")
})

class SweastyGameState extends Game.State {
    constructor(players) {
        super(players);
        this.currentState = SweastyGameStateType.start;
    }
}

export { SweastyGameState };