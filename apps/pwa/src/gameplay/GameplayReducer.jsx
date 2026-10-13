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

const gameplayReducer = createReducer({}, (builder) =>
  builder
    .addCase(GameActionTypes.startGame, (state, action) =>
      logAndApply(state, action, startGameReduction)
    )
    .addCase(GameActionTypes.resumeGame, (state, action) => {
      state.events = action.payload.events;
      logAndApply(
        state,
        { ...action, payload: action.payload.game },
        resumeGameReduction
      );
    })
    .addCase(GameActionTypes.joinGame, (state, action) =>
      logAndApply(state, action, joinGameReduction)
    )
    .addCase(GameActionTypes.createBoard, (state, action) =>
      logAndApply(state, action, createGameReduction)
    )
    .addCase(GameActionTypes.chooseField, (state, action) =>
      logAndApply(state, action, chooseFieldReduction)
    )
    .addCase(GameActionTypes.chooseStart, (state, action) =>
      logAndApply(state, action, chooseStartReduction)
    )
    .addCase(GameActionTypes.finishTurn, (state, action) =>
      logAndApply(state, action, finishTurnReduction)
    )
    .addCase(GameActionTypes.finishBuildPhase, (state, action) =>
      logAndApply(state, action, finishBuildPhaseReduction)
    )
    .addCase(GameActionTypes.build, (state, action) =>
      logAndApply(state, action, buildReduction)
    )
    .addCase(GameActionTypes.attack, (state, action) =>
      logAndApply(state, action, attackReduction)
    )
    .addCase(GameActionTypes.endGame, (state, action) =>
      logAndApply(state, action, endGameReduction)
    )
    .addCase(GameActionTypes.finishGame, (state, action) =>
      logAndApply(state, action, finishGameReduction)
    )
    .addCase(manipulateGameAction, (state, action) => {
      state.game = action.payload;
    })
);

export { gameplayReducer };
