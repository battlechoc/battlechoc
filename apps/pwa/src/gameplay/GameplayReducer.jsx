import { createReducer } from "@reduxjs/toolkit";
import {
  GameActionTypes,
  finishGameReduction,
  endGameReduction,
  resumeGameReduction,
} from "@battlechoc/battlechoc-shared-functions";
import { manipulateGameAction } from "./GameActions";

// The scripted tutorial loops still render a turn-shaped game state. Real matches live in the
// match slice (match/matchSlice.js); nothing else uses this one.
const gameplayReducer = createReducer({}, (builder) =>
  builder
    .addCase(GameActionTypes.resumeGame, (state, action) =>
      resumeGameReduction(state, { ...action, payload: action.payload.game })
    )
    .addCase(GameActionTypes.endGame, (state, action) =>
      endGameReduction(state, action)
    )
    .addCase(GameActionTypes.finishGame, (state, action) =>
      finishGameReduction(state, action)
    )
    .addCase(manipulateGameAction, (state, action) => {
      state.game = action.payload;
    })
);

export { gameplayReducer };
