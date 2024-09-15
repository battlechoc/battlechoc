import { createAction } from "@reduxjs/toolkit";
import { GameActionTypes } from "@battlechoc/battlechoc-shared-functions";

const startGame = createAction(GameActionTypes.startGame);
const resumeGame = createAction(GameActionTypes.resumeGame);
const finishGame = createAction(GameActionTypes.finishGame);
const chooseField = createAction(GameActionTypes.chooseField);
const chooseStart = createAction(GameActionTypes.chooseStart);
const createBoard = createAction(GameActionTypes.createBoard);
const finishTurn = createAction(GameActionTypes.finishTurn);
const finishBuildPhase = createAction(GameActionTypes.finishBuildPhase);
const build = createAction(GameActionTypes.build);
const attack = createAction(GameActionTypes.attack);
const endGame = createAction(GameActionTypes.endGame);
const joinGame = createAction(GameActionTypes.joinGame);

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
  startGame,
  resumeGame,
  finishGame,
  chooseField,
  chooseStart,
  createBoard,
  finishTurn,
  finishBuildPhase,
  build,
  attack,
  endGame,
  joinGame,
};
