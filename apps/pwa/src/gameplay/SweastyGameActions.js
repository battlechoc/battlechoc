import * as Game from "./Game.js";

class FinishTurnAction extends Game.Action {
    perform(gameState) {
        gameState.finishTurn();
        return gameState;
    }
}

class FinishBuildPhaseAction extends Game.Action {
    perform(gameState) {
        gameState.finishBuildPhase();
        return gameState;
    }
}

class PlaceUnitAction extends Game.Action {
    perform(gameState) {
        return super.perform(gameState);
    }
}

class AttackFieldAction extends Game.Action {
    perform(gameState) {
        return super.perform(gameState);
    }
}

export { FinishTurnAction, FinishBuildPhaseAction, PlaceUnitAction, AttackFieldAction };
