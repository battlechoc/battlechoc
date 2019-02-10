import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import { Game } from './Game';

const gameplayReducer = createReducer({
        screen: 'START_SCREEN',
        hudMessageAnimation: false
    }, {
    [GameActions.startGame]: (state, action) => {
        state.screen = 'CHOOSE_START_OR_FIELD'
        state.game = Game.create(action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.createBoard]: (state, action) => {
        Game.createBoard(state.game, action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.chooseField]: (state, action) => {
        state.screen = 'GAME_RUNNING';
        Game.chooseField(state.game, action.payload);
        state.game.state = Game.nextGameState(state.game.state, action.type);
    },
    [GameActions.chooseStart]: (state, action) => {
        state.screen = 'GAME_RUNNING';
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