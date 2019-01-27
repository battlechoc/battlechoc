import * as Game from "./Game.js";

const SweastyActionTypes = Object.freeze({
    create_board: Symbol("create_board"),
    choose_start: Symbol("choose_start"),
    choose_field: Symbol("choose_field"),
    finish_turn: Symbol("finish_turn"),
    finish_build_phase: Symbol("finish_build_phase"),
    place_unit: Symbol("place_unit"),
    attack_field: Symbol("attack_field")
});

class CreateBoardAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.create_board);
    }

    perform(gameState) {
        gameState.createBoard();
        return true;
    }
}

class ChooseStartAction extends Game.Action {
    constructor() {
        super(SweastyActionTypes.choose_start);
    }

    perform(gameState) {
        gameState.chooseStart();
        return true;
    }
}

class ChooseFieldAction extends Game.Action {
    constructor(fieldIndex) {
        super(SweastyActionTypes.choose_field);
        this.fieldIndex = fieldIndex;
    }

    perform(gameState) {
        gameState.chooseField(this.fieldIndex);
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

export { SweastyActionTypes, ChooseFieldAction, ChooseStartAction, CreateBoardAction, FinishTurnAction, FinishBuildPhaseAction, PlaceUnitAction, AttackFieldAction };
