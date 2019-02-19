import { GameActionTypes } from './GameActions';
import { UiActionTypes } from '../ui/UiActions';
import * as GameEntities from './GameEntities';

class Rules {
	static currentPlayer(gameState) {
    	return gameState.players[gameState.currentPlayerIndex];
	}

    static isActionValid(action, state) {
        let currentState = typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state;
        console.log(action, currentState);

        if (action.type === GameActionTypes.startGame) {
            return true;
        } else if (action.type === GameActionTypes.createBoard) {
        	return true;
        } else if (action.type === GameActionTypes.chooseStart) {
        	return true;
        } else if (action.type === GameActionTypes.chooseField) {
        	return true;
        } else if (action.type === GameActionTypes.finishGame) {
        	return true;
        } else if (action.type === GameActionTypes.finishTurn) {
        	return true;
        } else if (action.type === GameActionTypes.finishBuildPhase) {
        	return true;
        } else if (action.type === GameActionTypes.build) {
        	if (this.currentPlayer(state.gameplay.game).buildings === 0 &&
        		action.payload.type !== GameEntities.BuildingType.FACTORY){
        		return { error: 'No more buildings can be built'};
        	} else if (this.currentPlayer(state.gameplay.game).cacao < action.payload.costs) {
        		return { error: 'Not enough cacao left'};
        	} else {
        		return true;
        	}
        } else if (action.type === GameActionTypes.attack) {
        	return true;
        } else if (action.type === UiActionTypes.showMessage) {
        	return true;
        } else if (action.type === UiActionTypes.hideMessage) {
        	return true;
        } else if (action.type === UiActionTypes.selectBuilding) {
        	return true;
        } else {
            return { error: action.type + ' is not a valid action'};
        }
    }
}

export default Rules;
