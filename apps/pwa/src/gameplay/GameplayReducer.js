import { createReducer } from 'redux-starter-kit';
import * as GameActions from './GameActions';
import * as GameEntities from './GameEntities';
import { PlayerType } from './Player';

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

function otherPlayerBoardCell(gameState, row, col) {
    return playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, row, col);
}

function prepareBuildPhase(gameState) {
    gameState.currentPlayerIndex = 1 - gameState.currentPlayerIndex;
    currentPlayer(gameState).cacao += currentPlayer(gameState).cacaoPerTurn;
    currentPlayer(gameState).attacks = currentPlayer(gameState).attacksPerTurn;
    currentPlayer(gameState).buildings = currentPlayer(gameState).buildingsPerTurn;
    gameState.state = GameStateTypes.BUILD_PHASE;
}

const gameplayReducer = createReducer({}, {
    [GameActions.startGame]: (state, action) => {
        console.log(action);
        if (action.valid === true) {
            console.log("action is valid");
        } else {
            console.log(action.valid.error);
        }
        let coinToss = Math.round(Math.random());
        if (action.payload[1].type === PlayerType.AUGUSTUS_GLOOP) {
            coinToss = 0;
        }
        state.game = {
            players: action.payload,
            currentPlayerIndex: coinToss,
            state: GameStateTypes.START
        };

        //let s = {triggeredBy: action, actionProcessed: true/false, error: undefined };
        //let turn = {currentPlayer: 1, turnCount: 2};
    },
    [GameActions.createBoard]: (state, action) => {
        if (action.valid === true) {
            console.log("createBoard action is valid");
        } else {
            console.log(action.valid.error);
        }
        state.game.board = GameEntities.Board.generate(action.payload.boardSize, action.payload.boardSeed);
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
        } else if (state.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT ||
            state.game.state === GameStateTypes.ATTACK_PHASE ||
            state.game.state === GameStateTypes.BUILD_PHASE) {
            prepareBuildPhase(state.game);
        }
    },
    [GameActions.finishBuildPhase]: (state, action) => {
        state.game.state = GameStateTypes.ATTACK_PHASE;
    },
    [GameActions.build]: (state, action) => {
        if (action.payload.type === GameEntities.BuildingType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = 2;
            currentPlayer(state.game).hasFactory = true;
            currentPlayerBoardCell(state.game, action.payload.position.row, action.payload.position.col).occupiedBy.push(action.payload.type);
        } else if (action.payload.type === GameEntities.BuildingType.CACAOTREE) {
            currentPlayer(state.game).cacaoPerTurn += 30;
        } else if (action.payload.type === GameEntities.BuildingType.RUM_TRUFFLE_CANNON) {
            currentPlayer(state.game).attacksPerTurn += 1;
            currentPlayer(state.game).attacks += 1;
        } else if (action.payload.type === GameEntities.BuildingType.FACTORY_EXTENSION) {
            currentPlayer(state.game).buildingsPerTurn += 2;
        }
                                
        currentPlayerBoardCell(state.game, action.payload.position.row, action.payload.position.col).occupiedBy.push(action.payload.type);
        // Pay cacao and decrease the buildings
        currentPlayer(state.game).buildings -= 1;
        currentPlayer(state.game).cacao -= action.payload.costs;
    },
    [GameActions.attack]: (state, action) => {
        if (currentPlayer(state.game).attacks > 0) {
            currentPlayer(state.game).attacks = currentPlayer(state.game).attacks - 1;
            let attackedCell = otherPlayerBoardCell(state.game, action.payload.targetRow, action.payload.targetCol);
            if (attackedCell.occupiedBy.length > 0) {
                if (state.ui === undefined) {
                    state.ui = {};
                }
                state.ui.attackOutcome = {
                    fieldIndex: otherPlayer(state.game).fieldIndex,
                    target: { col: action.payload.targetCol, row: action.payload.targetRow },
                    wasOccupiedBy: attackedCell.occupiedBy
                };
                attackedCell.occupiedBy = [];
            }
        }
    }
});

export { gameplayReducer, GameStateTypes }