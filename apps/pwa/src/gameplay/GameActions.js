import { createAction } from 'redux-starter-kit';

const GameActionTypes = Object.freeze({
    startGame: 'battlechoc/gameplay/startGame',
    finishGame: 'battlechoc/gameplay/finishGame',
    chooseField: 'battlechoc/gameplay/chooseField',
    chooseStart: 'battlechoc/gameplay/chooseStart',
    createBoard: 'battlechoc/gameplay/createBoard',
    finishTurn: 'battlechoc/gameplay/finishTurn',
    finishBuildPhase: 'battlechoc/gameplay/finishBuildPhase',
    build: 'battlechoc/gameplay/build',
    attack: 'battlechoc/gameplay/attack',
});

const startGame = createAction(GameActionTypes.startGame);
const finishGame = createAction(GameActionTypes.finishGame);
const chooseField = createAction(GameActionTypes.chooseField);
const chooseStart = createAction(GameActionTypes.chooseStart);
const createBoard = createAction(GameActionTypes.createBoard);
const finishTurn = createAction(GameActionTypes.finishTurn);
const finishBuildPhase = createAction(GameActionTypes.finishBuildPhase);
const build = createAction(GameActionTypes.build);
const attack = createAction(GameActionTypes.attack);

export {
    GameActionTypes, startGame, finishGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase, build, attack
};
