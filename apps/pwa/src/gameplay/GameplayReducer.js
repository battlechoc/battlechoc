import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import * as GameEntities from "./GameEntities.js";

const GameStateTypes = Object.freeze({
    START: 'GameStateTypes.START',
    CHOOSE_FIELD_OR_START: 'GameStateTypes.CHOOSE_FIELD_OR_START',
    CHOOSE_FIELD: 'GameStateTypes.CHOOSE_FIELD',
    PLAYER_1_INITIAL_PLACEMENT: 'GameStateTypes.PLAYER_1_INITIAL_PLACEMENT',
    PLAYER_2_INITIAL_PLACEMENT: 'GameStateTypes.PLAYER_2_INITIAL_PLACEMENT',
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

function playerBoardCell(gameState, playerIndex, row, col) {
    return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[row * gameState.board.size.cols + col];
}

function currentPlayerBoardCell(gameState, row, col) {
    return playerBoardCell(gameState, gameState.currentPlayerIndex, row, col);
}

const gameplayReducer = createReducer({}, {
    [GameActions.startGame]: (state, action) => {
        let coinToss = Math.round(Math.random());
        state.game = {
            players: action.payload,
            currentPlayerIndex: coinToss,
            state: GameStateTypes.START
        };
    },
    [GameActions.createBoard]: (state, action) => {
        state.game.board = GameEntities.Board.generate(action.payload.boardSize, action.payload.boardSeed);
        console.dir(state.game.board);
        state.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    },
    [GameActions.chooseField]: (state, action) => {
        currentPlayer(state.game).fieldIndex = action.payload;
        otherPlayer(state.game).fieldIndex = 1 - action.payload;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
        state.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
    },
    [GameActions.chooseStart]: (state, action) => {
        state.game.state = GameStateTypes.CHOOSE_FIELD;
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
    },
    [GameActions.finishTurn]: (state, action) => {
        if (state.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            state.game.state = GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
        } else if (state.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            currentPlayer(state.game).cacao += currentPlayer(state.game).cacaoPerTurn;
            currentPlayer(state.game).attacks = currentPlayer(state.game).attacksPerTurn;
            currentPlayer(state.game).buildings = currentPlayer(state.game).buildingsPerTurn;
            state.game.state = GameStateTypes.BUILD_PHASE;
        } else if (state.game.state === GameStateTypes.ATTACK_PHASE) { 
            currentPlayer(state.game).cacao += currentPlayer(state.game).cacaoPerTurn;
            currentPlayer(state.game).attacks = currentPlayer(state.game).attacksPerTurn;
            currentPlayer(state.game).buildings = currentPlayer(state.game).buildingsPerTurn;
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            state.game.state = GameStateTypes.BUILD_PHASE;
        } else if (state.game.state === GameStateTypes.BUILD_PHASE) { 
            currentPlayer(state.game).cacao += currentPlayer(state.game).cacaoPerTurn;
            currentPlayer(state.game).attacks = currentPlayer(state.game).attacksPerTurn;
            currentPlayer(state.game).buildings = currentPlayer(state.game).buildingsPerTurn;
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            state.game.state = GameStateTypes.BUILD_PHASE;
        }
    },
    [GameActions.finishBuildPhase]: (state, action) => {
        state.game.state = GameStateTypes.ATTACK_PHASE;
    },
    [GameActions.build]: (state, action) => {
        if (action.payload.type === GameEntities.BuildingType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = 2;
            currentPlayerBoardCell(state.game, action.payload.position.row, action.payload.position.col).occupiedBy = action.payload.type;
        } else if (currentPlayer(state.game).buildings > 0) {
            // Check if Player has enough cacao
            if (currentPlayer(state.game).cacao >= action.payload.costs) {
                currentPlayerBoardCell(state.game, action.payload.position.row, action.payload.position.col).occupiedBy = action.payload.type;
                // Pay cacao and decrease the buildings
                currentPlayer(state.game).buildings -= 1;
                currentPlayer(state.game).cacao -= action.payload.costs;
                // Skip to attack phase if player has no resources anymore
                // Skip attack phase if player has no attacks
                if (currentPlayer(state.game).attacks > 0) {
                    if (currentPlayer(state.game).buildings === 0 ||
                        currentPlayer(state.game).cacao === 0) {
                        state.game.state = GameStateTypes.ATTACK_PHASE;
                    }
                } else {
                    state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
                    state.game.state = GameStateTypes.BUILD_PHASE;                
                }
            }
        } else {
            // Skip to attack phase if player has no resources anymore
            // Skip attack phase if player has no attacks
            if (currentPlayer(state.game).attacks > 0) {
                state.game.state = GameStateTypes.ATTACK_PHASE;
            } else {
                state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
                state.game.state = GameStateTypes.BUILD_PHASE;                
            }
        }
    },
    [GameActions.attack]: (state, action) => {
        if (currentPlayer(state.game).attacks > 0) {
            currentPlayer(state.game).attacks = currentPlayer(state.game).attacks - 1;

            if (currentPlayer(state.game).attacks === 0) {
                state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
                state.game.state = GameStateTypes.BUILD_PHASE;
            }
        } else {
            state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
            state.game.state = GameStateTypes.BUILD_PHASE;
        }
    }
})

export { gameplayReducer, GameStateTypes }