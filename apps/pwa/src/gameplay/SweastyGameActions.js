import * as Game from "./Game.js";

const SweastyActionTypes = Object.freeze({
    finish_turn: Symbol("finish_turn"),
    finish_build_phase: Symbol("finish_build_phase"),
    place_unit: Symbol("place_unit"),
    attack_field: Symbol("attack_field")
});

class FinishTurnAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.finish_turn);
    }

    perform(gameState) {
        gameState.finishTurn();
        return gameState;
    }
}

class FinishBuildPhaseAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.finish_build_phase);
    }

    perform(gameState) {
        gameState.finishBuildPhase();
        return gameState;
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

export { SweastyActionTypes, FinishTurnAction, FinishBuildPhaseAction, PlaceUnitAction, AttackFieldAction };
