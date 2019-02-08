import { createAction } from 'redux-starter-kit';

const startGame = createAction('sweasty/gameplay/startGame');
const finishGame = createAction('sweasty/gameplay/finishGame');
const chooseField = createAction('sweasty/gameplay/chooseField');
const chooseStart = createAction('sweasty/gameplay/chooseStart');
const createBoard = createAction('sweasty/gameplay/createBoard');
const finishTurn = createAction('sweasty/gameplay/finishTurn');
const finishBuildPhase = createAction('sweasty/gameplay/finishBuildPhase');
const build = createAction('sweasty/gameplay/build');
const attack = createAction('sweasty/gameplay/attack');

export {
    startGame, finishGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase, build, attack
};
