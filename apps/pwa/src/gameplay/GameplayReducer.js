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
    [GameActions.resumeGame]: (state, action) => {
        state.game = {
            players: action.payload.players,
            currentPlayerIndex: action.payload.currentPlayerIndex,
            state: action.payload.state,
            board: action.payload.board
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
        if (action.payload.building.type === GameEntities.EntityType.FACTORY) {
            currentPlayer(state.game).buildingsPerTurn = action.payload.building.buildingsPerTurn;
            currentPlayer(state.game).hasFactory = true;
        } else {
            if (action.payload.building.type === GameEntities.EntityType.CACAOTREE) {
                currentPlayer(state.game).cacaoPerTurn += action.payload.building.cacaoPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.RUM_TRUFFLE_CANNON) {
                currentPlayer(state.game).attacksPerTurn += action.payload.building.attacksPerTurn;
                currentPlayer(state.game).attacks += action.payload.building.attacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FRUIT_CANNON) {
                currentPlayer(state.game).fruitAttacksPerTurn += action.payload.building.fruitAttacksPerTurn;
                currentPlayer(state.game).fruitAttacks += action.payload.building.fruitAttacksPerTurn;
                let cell = currentPlayerBoardCell(state.game, action.payload.building.position.row, action.payload.building.position.col);
                cell.occupiedBy.splice(cell.occupiedBy.indexOf(GameEntities.EntityType.RUM_TRUFFLE_CANNON, 1));
            } else if (action.payload.building.type === GameEntities.EntityType.HOT_CHOCOLATE_BALLISTA) {
                currentPlayer(state.game).hotChocolateAttacksPerTurn += action.payload.building.hotChocolateAttacksPerTurn;
                currentPlayer(state.game).hotChocolateAttacks += action.payload.building.hotChocolateAttacksPerTurn;
            } else if (action.payload.building.type === GameEntities.EntityType.FACTORY_EXTENSION) {
                currentPlayer(state.game).buildingsPerTurn += action.payload.building.buildingsPerTurn;
            }
            currentPlayer(state.game).buildings -= 1;
            currentPlayer(state.game).cacao -= action.payload.building.costs;
        }
    },
    [GameActions.attack]: (state, action) => {
        currentPlayer(state.game).attacks = currentPlayer(state.game).attacks - 1;
        let attackedCell = otherPlayerBoardCell(state.game, action.payload);
        let opponent = otherPlayer(state.game);
        if (attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY) || attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY_EXTENSION)) {
            opponent.buildingsPerTurn -= (attackedCell.occupiedBy.includes(GameEntities.EntityType.FACTORY)) ?
                GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY).buildingsPerTurn :
                GameEntities.getEntityDescriptor(GameEntities.EntityType.FACTORY_EXTENSION).buildingsPerTurn;
            if (opponent.buildingsPerTurn === 0) {
                opponent.hasFactory = false;
                console.log('FACTORY DESTROYED');
            }
        } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.CACAOTREE)) {
            opponent.cacaoPerTurn -= GameEntities.getEntityDescriptor(GameEntities.EntityType.CACAOTREE).cacaoPerTurn;
            console.log('CACAOTREE DESTROYED');
        } else if (attackedCell.occupiedBy.includes(GameEntities.EntityType.RUM_TRUFFLE_CANNON)) {
            opponent.attacksPerTurn -= GameEntities.getEntityDescriptor(GameEntities.EntityType.RUM_TRUFFLE_CANNON).attacksPerTurn;
            console.log('CANNON DESTROYED');
        }
        attackedCell.occupiedBy = [];
    },
    [GameActions.finishGame]: (state, action) => {
        state.game = undefined;
    }
});

export { gameplayReducer, GameStateTypes }