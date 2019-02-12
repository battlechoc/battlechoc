import { GameStateTypes } from './GameplayReducer';

const GameTransitions = Object.freeze({
    PLAYER_BEGINS_GAME: 'GameTransitions.PLAYER_BEGINS_GAME',
    OPPONENT_BEGINS_GAME: 'GameTransitions.OPPONENT_BEGINS_GAME',
    OPPONENT_STARTS_GAME: 'GameTransitions.OPPONENT_STARTS_GAME',
    PLAYER_HAS_CHOSEN_START: 'GameTransitions.PLAYER_HAS_CHOSEN_START',
    OPPONENT_HAS_CHOSEN_START: 'GameTransitions.OPPONENT_HAS_CHOSEN_START',
    BEGIN_INITAL_PLACEMENT: 'GameTransitions.BEGIN_INITAL_PLACEMENT',
    INVALID: 'GameTransitions.INVALID'
});


function getGameTransition(currentState, nextState) {
    if (typeof currentState === 'undefined' &&
        typeof nextState !== 'undefined') {
        if (nextState.currentPlayerIndex === 0) {
            return GameTransitions.PLAYER_BEGINS_GAME;
        } else {
            return GameTransitions.OPPONENT_BEGINS_GAME;
        }
    } else if (currentState.state === GameStateTypes.START && 
        currentState.currentPlayerIndex === 1 &&
        nextState.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
        return GameTransitions.OPPONENT_STARTS_GAME;
    } else if (nextState.currentPlayerIndex === 0 &&
        currentState.state === GameStateTypes.CHOOSE_FIELD_OR_START &&
        nextState.state === GameStateTypes.CHOOSE_FIELD &&
        currentState.currentPlayerIndex === 1) {
        return GameTransitions.OPPONENT_HAS_CHOSEN_START;
    } else if (currentState.state === GameStateTypes.CHOOSE_FIELD_OR_START &&
        nextState.state === GameStateTypes.CHOOSE_FIELD &&
        currentState.currentPlayerIndex === 0) {
        return GameTransitions.PLAYER_HAS_CHOSEN_START;
    } else if ((currentState.state === GameStateTypes.CHOOSE_FIELD_OR_START &&
        nextState.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) ||
        (currentState.state === GameStateTypes.CHOOSE_FIELD &&
        nextState.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT)) {
        return GameTransitions.BEGIN_INITAL_PLACEMENT;
    } else {
        return GameTransitions.INVALID;
    }
}

export { GameTransitions, getGameTransition }  