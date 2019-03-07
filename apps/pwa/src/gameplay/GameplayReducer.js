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

function otherPlayerBoardCell(gameState, cell) {
    return playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, cell.row, cell.col);
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
        let coinToss = Math.round(Math.random());
        if (action.payload[1].type === PlayerType.AUGUSTUS_GLOOP) {
            coinToss = 0;
        }
        state.game = {
            players: action.payload,
            currentPlayerIndex: coinToss,
            state: GameStateTypes.START
        };
    },
    [GameActions.createBoard]: (state, action) => {
        state.game.board = GameEntities.Board.generate(action.payload.boardSize, action.payload.boardSeed);
        state.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    },
    [GameActions.chooseField]: (state, action) => {
        currentPlayer(state.game).fieldIndex = action.payload.fieldIdx;
        otherPlayer(state.game).fieldIndex = 1 - action.payload.fieldIdx;
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
        currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col).occupiedBy.push(action.payload.building.type);
        if (action.payload.building.type === GameEntities.BuildingType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = 2;
            currentPlayer(state.game).hasFactory = true;
        } else {
            if (action.payload.building.type === GameEntities.BuildingType.CACAOTREE) {
                currentPlayer(state.game).cacaoPerTurn += 30;
            } else if (action.payload.building.type === GameEntities.BuildingType.RUM_TRUFFLE_CANNON) {
                currentPlayer(state.game).attacksPerTurn += 1;
                currentPlayer(state.game).attacks += 1;
            } else if (action.payload.building.type === GameEntities.BuildingType.FACTORY_EXTENSION) {
                currentPlayer(state.game).buildingsPerTurn += 2;
            }
            currentPlayer(state.game).buildings -= 1;
            currentPlayer(state.game).cacao -= action.payload.building.costs;
        }
    },
    [GameActions.attack]: (state, action) => {
        currentPlayer(state.game).attacks = currentPlayer(state.game).attacks - 1;
        let attackedCell = otherPlayerBoardCell(state.game, action.payload);
        let opponent = otherPlayer(state.game);

        if (attackedCell.occupiedBy.includes(GameEntities.BuildingType.FACTORY) || attackedCell.occupiedBy.includes(GameEntities.BuildingType.FACTORY_EXTENSION)) {
            opponent.buildingsPerTurn = opponent.buildingsPerTurn - 2;
            if (opponent.buildingsPerTurn === 0) {
                opponent.hasFactory = false;
                console.log('FACTORY DESTROYED');
            }
        } else if (attackedCell.occupiedBy.includes(GameEntities.BuildingType.CACAOTREE)) {
            opponent.cacaoPerTurn -= 30;
            console.log('CACAOTREE DESTROYED');
        } else if (attackedCell.occupiedBy.includes(GameEntities.BuildingType.RUM_TRUFFLE_CANNON)) {
            opponent.attacksPerTurn -= 1;
            console.log('CANNON DESTROYED');
        }

        attackedCell.occupiedBy = [];
    },
    [GameActions.finishGame]: (state, action) => {
        state.game = undefined;
    }
});

export { gameplayReducer, GameStateTypes }