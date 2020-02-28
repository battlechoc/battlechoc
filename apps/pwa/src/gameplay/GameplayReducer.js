import { createReducer } from 'redux-starter-kit';
import { GameActionTypes, startGameReduction, finishGameReduction, endGameReduction, attackReduction, buildReduction, finishBuildPhaseReduction, finishTurnReduction, chooseStartReduction, resumeGameReduction, joinGameReduction, createGameReduction, chooseFieldReduction } from 'battlechoc-shared-functions';
import { manipulateGameAction } from './GameActions';

const gameplayReducer = createReducer({}, {
    [GameActionTypes.startGame]: startGameReduction,
    [GameActionTypes.resumeGame]: resumeGameReduction,
    [GameActionTypes.joinGame]: joinGameReduction,
    [GameActionTypes.createBoard]: createGameReduction,
    [GameActionTypes.chooseField]: chooseFieldReduction,
    [GameActionTypes.chooseStart]: chooseStartReduction,
    [GameActionTypes.finishTurn]: finishTurnReduction,
    [GameActionTypes.finishBuildPhase]: finishBuildPhaseReduction,
    [GameActionTypes.build]: buildReduction,
    [GameActionTypes.attack]: attackReduction,
    [GameActionTypes.endGame]: endGameReduction,
    [GameActionTypes.finishGame]: finishGameReduction,
    [manipulateGameAction]: (state, action) => {
        state.game = action.payload;
    }
});

export { gameplayReducer }