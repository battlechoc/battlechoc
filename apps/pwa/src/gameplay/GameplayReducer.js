import { createReducer } from "@reduxjs/toolkit";
import {
  GameActionTypes,
  startGameReduction,
  finishGameReduction,
  endGameReduction,
  attackReduction,
  buildReduction,
  finishBuildPhaseReduction,
  finishTurnReduction,
  chooseStartReduction,
  resumeGameReduction,
  joinGameReduction,
  createGameReduction,
  chooseFieldReduction,
} from "@battlechoc/battlechoc-shared-functions";
import { manipulateGameAction } from "./GameActions";

const logAndApply = (state, action, reduction) => {
  let unwrappedAction = JSON.parse(JSON.stringify(action));

  if (typeof state.events === "undefined") {
    state.events = [unwrappedAction];
  } else {
    state.events.push(unwrappedAction);
  }

  reduction(state, action);
};

const gameplayReducer = createReducer(
  {},
  {
    [GameActionTypes.startGame]: (state, action) =>
      logAndApply(state, action, startGameReduction),
    [GameActionTypes.resumeGame]: (state, action) => {
      state.events = action.payload.events;
      logAndApply(
        state,
        { ...action, payload: action.payload.game },
        resumeGameReduction
      );
    },
    [GameActionTypes.joinGame]: (state, action) =>
      logAndApply(state, action, joinGameReduction),
    [GameActionTypes.createBoard]: (state, action) =>
      logAndApply(state, action, createGameReduction),
    [GameActionTypes.chooseField]: (state, action) =>
      logAndApply(state, action, chooseFieldReduction),
    [GameActionTypes.chooseStart]: (state, action) =>
      logAndApply(state, action, chooseStartReduction),
    [GameActionTypes.finishTurn]: (state, action) =>
      logAndApply(state, action, finishTurnReduction),
    [GameActionTypes.finishBuildPhase]: (state, action) =>
      logAndApply(state, action, finishBuildPhaseReduction),
    [GameActionTypes.build]: (state, action) =>
      logAndApply(state, action, buildReduction),
    [GameActionTypes.attack]: (state, action) =>
      logAndApply(state, action, attackReduction),
    [GameActionTypes.endGame]: (state, action) =>
      logAndApply(state, action, endGameReduction),
    [GameActionTypes.finishGame]: (state, action) =>
      logAndApply(state, action, finishGameReduction),
    [manipulateGameAction]: (state, action) => {
      state.game = action.payload;
    },
  }
);

export { gameplayReducer };
