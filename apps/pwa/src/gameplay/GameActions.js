import { createAction } from 'redux-starter-kit';

const GameActionTypes = Object.freeze({
    startGame: 'battlechoc/gameplay/startGame',
    resumeGame: 'battlechoc/gameplay/resumeGame',
    finishGame: 'battlechoc/gameplay/finishGame',
    chooseField: 'battlechoc/gameplay/chooseField',
    chooseStart: 'battlechoc/gameplay/chooseStart',
    createBoard: 'battlechoc/gameplay/createBoard',
    finishTurn: 'battlechoc/gameplay/finishTurn',
    finishBuildPhase: 'battlechoc/gameplay/finishBuildPhase',
    build: 'battlechoc/gameplay/build',
    attack: 'battlechoc/gameplay/attack',
    endGame: 'battlechoc/gameplay/endGame',
    joinGame: 'battlechoc/gameplay/joinGame',
    playerJoined: 'battlechoc/gameplay/playerJoined',
    updateLevel: 'battlechoc/gameplay/updateLevel'
});

const IssuerRelevantActions = [
    GameActionTypes.chooseField,
    GameActionTypes.chooseStart,
    GameActionTypes.finishTurn,
    GameActionTypes.finishBuildPhase,
    GameActionTypes.build,
    GameActionTypes.attack,
    GameActionTypes.endGame
];

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
const playerJoined = createAction(GameActionTypes.playerJoined);
const updateLevel = createAction(GameActionTypes.updateLevel);

export {
    GameActionTypes, IssuerRelevantActions, updateLevel, startGame, resumeGame, finishGame, chooseField, chooseStart, createBoard, finishTurn, finishBuildPhase, build, attack, endGame, joinGame, playerJoined
};
