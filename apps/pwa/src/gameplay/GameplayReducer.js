import { createReducer } from 'redux-starter-kit';
import { GameActionTypes, startGameReduction, finishGameReduction, endGameReduction, attackReduction, buildReduction, finishBuildPhaseReduction, finishTurnReduction, chooseStartReduction, resumeGameReduction, joinGameReduction, createGameReduction, chooseFieldReduction } from 'battlechoc-shared-functions';
import { manipulateGameAction } from './GameActions';

const logAndApply = (state, action, reduction) => {
    if (action.type === GameActionTypes.attack) {
        action.payload.target = state.game.board.fields[state.game.players[ 1 - state.game.currentPlayerIndex ].fieldIndex].grid[action.payload.row * state.game.board.size.cols + action.payload.col]
    } else if (action.type === GameActionTypes.build) {
        action.payload.target = state.game.board.fields[state.game.players[state.game.currentPlayerIndex ].fieldIndex].grid[action.payload.building.position.row * state.game.board.size.cols + action.payload.building.position.col]
    }
    
    if (typeof state.events === 'undefined') {
        state.events = [JSON.parse(JSON.stringify(action))];
    } else {
        state.events.push(JSON.parse(JSON.stringify(action)));
    }

    reduction(state, action);
}

const gameplayReducer = createReducer({}, {
    [GameActionTypes.startGame]: (state, action) => logAndApply(state, action, startGameReduction),
    [GameActionTypes.resumeGame]: (state, action) => {
        console.log(JSON.stringify(state, undefined, 2))
        console.log(JSON.stringify(action, undefined, 2))

        state.events = action.payload.events;
        logAndApply(state, { ...action, payload: action.payload.game}, resumeGameReduction);
    },
    [GameActionTypes.joinGame]: (state, action) => logAndApply(state, action, joinGameReduction),
    [GameActionTypes.createBoard]: (state, action) => logAndApply(state, action, createGameReduction),
    [GameActionTypes.chooseField]: (state, action) => logAndApply(state, action, chooseFieldReduction),
    [GameActionTypes.chooseStart]: (state, action) => logAndApply(state, action, chooseStartReduction),
    [GameActionTypes.finishTurn]: (state, action) => logAndApply(state, action, finishTurnReduction),
    [GameActionTypes.finishBuildPhase]: (state, action) => logAndApply(state, action, finishBuildPhaseReduction),
    [GameActionTypes.build]: (state, action) => logAndApply(state, action, buildReduction),
    [GameActionTypes.attack]: (state, action) => logAndApply(state, action, attackReduction),
    [GameActionTypes.endGame]: (state, action) => logAndApply(state, action, endGameReduction),
    [GameActionTypes.finishGame]: (state, action) => logAndApply(state, action, finishGameReduction),
    [manipulateGameAction]: (state, action) => {
        state.game = action.payload;
    }
});

export { gameplayReducer }