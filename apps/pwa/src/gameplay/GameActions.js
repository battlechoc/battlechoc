import { createAction } from 'redux-starter-kit';
import { GameActionTypes } from 'battlechoc-shared-functions';

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

export {
    startGame, resumeGame, finishGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase, build, attack, endGame, joinGame
};
