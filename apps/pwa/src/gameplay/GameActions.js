import { createAction } from 'redux-starter-kit';

const startGame = createAction('battlechoc/gameplay/startGame');
const finishGame = createAction('battlechoc/gameplay/finishGame');
const chooseField = createAction('battlechoc/gameplay/chooseField');
const chooseStart = createAction('battlechoc/gameplay/chooseStart');
const createBoard = createAction('battlechoc/gameplay/createBoard');
const finishTurn = createAction('battlechoc/gameplay/finishTurn');
const finishBuildPhase = createAction('battlechoc/gameplay/finishBuildPhase');
const build = createAction('battlechoc/gameplay/build');
const attack = createAction('battlechoc/gameplay/attack');

export {
    startGame, finishGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase, build, attack
};
