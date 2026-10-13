import { createAction } from "@reduxjs/toolkit";
import { GameActionTypes } from "@battlechoc/battlechoc-shared-functions";

// the turn-shaped state of the scripted tutorial loops (see GameplayReducer)
const resumeGame = createAction(GameActionTypes.resumeGame);
const finishGame = createAction(GameActionTypes.finishGame);
const endGame = createAction(GameActionTypes.endGame);

const manipulateGameAction = "battlechoc/gameplay/manipulateGame";
const manipulateGame = createAction(manipulateGameAction);

const InfoType = Object.freeze({
  CACAO_HARVESTED: "InfoType.CACAO_HARVESTED",
  CACAO_CONSUMED: "InfoType.CACAO_CONSUMED",
  INCREASE_BUILDINGS_PER_TURN: "InfoType.INCREASE_BUILDINGS_PER_TURN",
  INCREASE_CACAO_PER_TURN: "InfoType.INCREASE_CACAO_PER_TURN",
  INCREASE_ATTACKS_PER_TURN: "InfoType.INCREASE_ATTACKS_PER_TURN",
  INCREASE_SPY_ATTACKS_PER_TURN: "InfoType.INCREASE_SPY_ATTACKS_PER_TURN",
  INCREASE_FRUIT_ATTACKS_PER_TURN: "InfoType.INCREASE_FRUIT_ATTACKS_PER_TURN",
  BUNNY_CAUGHT: "InfoType.BUNNY_CAUGHT",
  DONUT_TRAP: "InfoType.DONUT_TRAP",
});

export {
  InfoType,
  manipulateGameAction,
  manipulateGame,
  resumeGame,
  finishGame,
  endGame,
};
