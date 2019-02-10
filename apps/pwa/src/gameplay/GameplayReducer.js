import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import { Game, GameStateTypes } from './Game';

const gameplayReducer = createReducer({}, {
    [GameActions.startGame]: (state, action) => {
        state.game = {
            players: action.payload,
            currentPlayerIndex: 0,
            state: GameStateTypes.START
        };
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.createBoard]: (state, action) => {
        state.game.board = Game.createBoard(state.game, action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.chooseField]: (state, action) => {
        Game.currentPlayer(state.game).fieldIndex = action.payload;
        Game.otherPlayer(state.game).fieldIndex = 1 - action.payload;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.chooseStart]: (state, action) => {
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.finishTurn]: (state, action) => {
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.finishBuildPhase]: (state, action) => {
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.build]: (state, action) => {
        Game.build(state.game, action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.attack]: (state, action) => {
        Game.attach(state.game, action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    }
})

export default gameplayReducer