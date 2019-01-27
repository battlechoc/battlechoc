import * as Game from "./Game.js";
import { Board } from "./SweastyGameEntities.js";

const SweastyActionTypes = Object.freeze({
    generate_board: Symbol("generate_board"),
    finish_turn: Symbol("finish_turn"),
    finish_build_phase: Symbol("finish_build_phase"),
    place_unit: Symbol("place_unit"),
    attack_field: Symbol("attack_field")
});

class GenerateBoardAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.generate_board);
    }

    perform(gameState) {
        gameState.generateBoard();
        return true;
    }
}

class FinishTurnAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.finish_turn);
    }

    perform(gameState) {
        gameState.finishTurn();
        return true;
    }
}

class FinishBuildPhaseAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.finish_build_phase);
    }

    perform(gameState) {
        gameState.finishBuildPhase();
        return true;
    }
}

class PlaceUnitAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.place_unit);
    }

    perform(gameState) {
        return super.perform(gameState);
    }
}

class AttackFieldAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.attack_field);
    }

    perform(gameState) {
        return super.perform(gameState);
    }
}

export { SweastyActionTypes, GenerateBoardAction, FinishTurnAction, FinishBuildPhaseAction, PlaceUnitAction, AttackFieldAction };
