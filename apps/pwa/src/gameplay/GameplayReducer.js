import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import * as GameEntities from "./GameEntities.js";

const GameStateTypes = Object.freeze({
    START: 'GameStateTypes.START',
    CHOOSE_FIELD_OR_START: 'GameStateTypes.CHOOSE_FIELD_OR_START',
    CHOOSE_FIELD: 'GameStateTypes.CHOOSE_FIELD',
    INITIAL_PLACEMENT: 'GameStateTypes.INITIAL_PLACEMENT',
    BUILD_PHASE: 'GameStateTypes.BUILD_PHASE',
    ATTACK_PHASE: 'GameStateTypes.ATTACK_PHASE',
    END: 'GameStateTypes.END'
});

function currentPlayer(gameState) {
    return gameState.players[gameState.currentPlayerIndex];
}

function otherPlayer(gameState) {
    return gameState.players[1 - gameState.currentPlayerIndex];
}

const gameplayReducer = createReducer({}, {
    [GameActions.startGame]: (state, action) => {
        state.game = {
            players: action.payload.players,
            currentPlayerIndex: action.payload.coinToss
        };

        currentPlayer(state.game).state = GameStateTypes.START;
        otherPlayer(state.game).state = GameStateTypes.START;
    },
    [GameActions.createBoard]: (state, action) => {
        state.game.board = GameEntities.Board.generate(action.payload.boardSize, action.payload.boardSeed);

        currentPlayer(state.game).state = GameStateTypes.CHOOSE_FIELD_OR_START;
        otherPlayer(state.game).state = GameStateTypes.START;
    },
    [GameActions.chooseField]: (state, action) => {
        currentPlayer(state.game).fieldIndex = action.payload;
        otherPlayer(state.game).fieldIndex = 1 - action.payload;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;

        currentPlayer(state.game).state = GameStateTypes.INITIAL_PLACEMENT;
        otherPlayer(state.game).state = GameStateTypes.INITIAL_PLACEMENT;
    },
    [GameActions.chooseStart]: (state, action) => {
        currentPlayer(state.game).state = GameStateTypes.INITIAL_PLACEMENT;
        otherPlayer(state.game).state = GameStateTypes.CHOOSE_FIELD;
    },
    [GameActions.finishTurn]: (state, action) => {
        //state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.finishBuildPhase]: (state, action) => {
        //state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.build]: (state, action) => {
        //Game.build(state.game, action.payload);
        //state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.attack]: (state, action) => {
        //Game.attach(state.game, action.payload);
        //state.game.state = Game.nextGameState(state.game.state, action.type);
    }
})

export default gameplayReducer