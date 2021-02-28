const uuidv4 = require('uuid/v4');

const setRandomSeed = seed => {
    const seedableRandom = function (s) {
        return function () { s = Math.sin(s) * 10000; return s - Math.floor(s); };
    };

    Math.random = seedableRandom(seed);
}

const getRandomNumber = () => Math.random();

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
});

const SurrenderCosts = 20;

const EntityType = Object.freeze({
    CREAM: 'EntityType.CREAM',
    FACTORY: 'EntityType.FACTORY',
    FACTORY_EXTENSION: 'EntityType.FACTORY_EXTENSION',
    CACAOTREE: 'EntityType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'EntityType.RUM_TRUFFLE_CANNON',
    FRUIT_CANNON: 'EntityType.FRUIT_CANNON',
    SPYING_EASTER_BUNNY: 'EntityType.SPYING_EASTER_BUNNY',
    XMAS_FACTORY: 'EntityType.XMAS_FACTORY',
    HOT_CHOCOLATE_BALLISTA: 'EntityType.HOT_CHOCOLATE_BALLISTA',
    CHOCOLATE_FOUNTAIN: 'EntityType.CHOCOLATE_FOUNTAIN',
    DONUT_FACTORY: 'EntityType.DONUT_FACTORY',
    DONUT_PORTAL_BLUE: 'EntityType.DONUT_PORTAL_BLUE',
    DONUT_PORTAL_RED: 'EntityType.DONUT_PORTAL_RED',
    DONUT_SURPRISE_YELLOW: 'EntityType.DONUT_SURPRISE_YELLOW',
    DONUT_HEALTH_GREEN: 'EntityType.DONUT_HEALTH_GREEN',
    DONUT_STOP_PINK: 'EntityType.DONUT_STOP_PINK',
    DONUT_CREAM_WHITE: 'EntityType.DONUT_CREAM_WHITE',
    isInstanceOf: function (entityType) {
        if (entityType === EntityType.CREAM ||
            entityType === EntityType.FACTORY ||
            entityType === EntityType.CACAOTREE ||
            entityType === EntityType.RUM_TRUFFLE_CANNON ||
            entityType === EntityType.FACTORY_EXTENSION ||
            entityType === EntityType.SPYING_EASTER_BUNNY ||
            entityType === EntityType.XMAS_FACTORY ||
            entityType === EntityType.HOT_CHOCOLATE_BALLISTA ||
            entityType === EntityType.CHOCOLATE_FOUNTAIN ||
            entityType === EntityType.FRUIT_CANNON ||
            entityType === EntityType.DONUT_FACTORY ||
            entityType === EntityType.DONUT_PORTAL_RED ||
            entityType === EntityType.DONUT_PORTAL_BLUE ||
            entityType === EntityType.DONUT_SURPRISE_YELLOW ||
            entityType === EntityType.DONUT_HEALTH_GREEN ||
            entityType === EntityType.DONUT_STOP_PINK ||
            entityType === EntityType.DONUT_CREAM_WHITE) {
            return true;
        } else {
            return false;
        }
    }
});

const isDonut = entityType => [
    EntityType.DONUT_HEALTH_GREEN,
    EntityType.DONUT_STOP_PINK,
    EntityType.DONUT_CREAM_WHITE,
    EntityType.DONUT_PORTAL_RED,
    EntityType.DONUT_PORTAL_BLUE,
    EntityType.DONUT_SURPRISE_YELLOW
].includes(entityType)

const AttackType = Object.freeze({
    TRUFFLE: 'AttackType.TRUFFLE',
    FRUIT: 'AttackType.FRUIT',
    HOT_CHOCOLATE: 'AttackType.HOT_CHOCOLATE',
    BUNNY: 'AttackType.BUNNY',
    isInstanceOf: function (attackType) {
        if (attackType === AttackType.TRUFFLE ||
            attackType === AttackType.FRUIT ||
            attackType === AttackType.HOT_CHOCOLATE ||
            attackType === AttackType.BUNNY) {
            return true;
        }
        else {
            return false;
        }
    }
});

const NotificationReasonType = Object.freeze({
    OPPONENT_FINISHED_TURN: 'OPPONENT_FINISHED_TURN',
    OPPONENT_SURRENDERED_GAME: 'OPPONENT_SURRENDERED_GAME',
    SESSION_TIMEOUT_GAME_WON: 'SESSION_TIMEOUT_GAME_WON',
    SESSION_TIMEOUT_GAME_LOST: 'SESSION_TIMEOUT_GAME_LOST',
    REMEMBER_TURN: 'REMEMBER_TURN',
    CHALLENGED: 'CHALLENGED',
    GAME_LOST: 'GAME_LOST',
    isInstanceOf: function (reason) {
        if (reason === NotificationReasonType.OPPONENT_FINISHED_TURN ||
            reason === NotificationReasonType.OPPONENT_SURRENDERED_GAME ||
            reason === NotificationReasonType.SESSION_TIMEOUT_GAME_WON ||
            reason === NotificationReasonType.SESSION_TIMEOUT_GAME_LOST ||
            reason === NotificationReasonType.REMEMBER_TURN ||
            reason === NotificationReasonType.CHALLENGED ||
            reason === NotificationReasonType.GAME_LOST) {
            return true;
        }
        else {
            return false;
        }
    }
});

const MultiplayerGameSessionState = Object.freeze({
    UNINITIALIZED: 'MultiplayerGameSessionState.Uninitialized',
    PENDING: 'MultiplayerGameSessionState.Pending',
    CREATED: 'MultiplayerGameSessionState.Created',
    RUNNING: 'MultiplayerGameSessionState.Running',
    FINISHED: 'MultiplayerGameSessionState.Finished'
});

const EmptyPlayerStats = Object.freeze({
    username: 'Chocnonymous',
    tutorialStarted: false,
    tutorialSkipped: false,
    tutorialFinished: false,
    coins: 0,
    awards: [],
    score: 0,
    winnings: 0,
    drawn: 0,
    losses: 0,
    trackRecord: [],
    level: {
        'EntityType.CREAM': 0,
        'EntityType.FACTORY': 0,
        'EntityType.FACTORY_EXTENSION': 0,
        'EntityType.CACAOTREE': 0,
        'EntityType.RUM_TRUFFLE_CANNON': 0,
        'EntityType.FRUIT_CANNON': 0,
        'EntityType.SPYING_EASTER_BUNNY': 0,
        'EntityType.XMAS_FACTORY': 0,
        'EntityType.HOT_CHOCOLATE_BALLISTA': 0,
        'EntityType.CHOCOLATE_FOUNTAIN': 0,
        'EntityType.DONUT_FACTORY': 0
    }
});


const finalLevel = 20;
const calculateDivisor = (start, end) => (finalLevel * Math.log2(2)) / Math.log2((end - finalLevel) / start);
const linearGrowFunction = (level, start, end) => ((end - start) / (finalLevel - 1)) * level + start
const exponentialGrowFunction = (level, start, end) => Math.round(level + start * Math.pow(2, level / calculateDivisor(start, end)));

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.CREAM, () => ({
        level: { max: 1 },
        hp: 1,
        area: 1,
        costs: 10
    })],
    [EntityType.FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 52),
        cacaoPerTurn: linearGrowFunction(level, 15, 35),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 0,
        coins: exponentialGrowFunction(level, 102, 13002)
    })],
    [EntityType.FACTORY_EXTENSION, level => ({
        hp: linearGrowFunction(level, 11, 52),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 120,
        coins: exponentialGrowFunction(level, 71, 12201)
    })],
    [EntityType.CACAOTREE, level => ({
        hp: linearGrowFunction(level, 5, 19),
        cacaoPerTurn: linearGrowFunction(level, 30, 52),
        costs: 20,
        coins: exponentialGrowFunction(level, 24, 8650)
    })],
    [EntityType.RUM_TRUFFLE_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.TRUFFLE,
        attacksPerTurn: 1
    })],
    [EntityType.FRUIT_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.FRUIT,
        attacksPerTurn: 1
    })],
    [EntityType.SPYING_EASTER_BUNNY, level => ({
        hp: linearGrowFunction(level, 7, 23),
        area: 3,
        costs: 120,
        coins: exponentialGrowFunction(level, 43, 9120),
        attackType: AttackType.BUNNY,
        attacksPerTurn: 1
    })],
    [EntityType.XMAS_FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 45),
        area: 3,
        costs: 80,
        coins: exponentialGrowFunction(level, 32, 8267)
    })],
    [EntityType.HOT_CHOCOLATE_BALLISTA, level => ({
        hp: linearGrowFunction(level, 11, 46),
        costs: 0,
        coins: exponentialGrowFunction(level, 68, 10020),
        attackType: AttackType.HOT_CHOCOLATE,
        attacksPerTurn: 1
    })],
    [EntityType.CHOCOLATE_FOUNTAIN, level => ({
        hp: linearGrowFunction(level, 18, 78),
        costs: 120,
        coins: exponentialGrowFunction(level, 46, 8402)
    })],
    [EntityType.DONUT_FACTORY, level => ({
        hp: linearGrowFunction(level, 8, 31),
        donutProbability: (() => {
            if (level > 14) {
                return 0.999;
            } else if (level > 6) {
                return 0.75;
            } else {
                return 0.666;
            }
        })(),
        donutTypes: (() => {
            if (level > 16) {
                return 5;
            } else if (level > 12) {
                return 4;
            } else {
                return 3;
            }
        })(),
        costs: 240,
        coins: exponentialGrowFunction(level, 44, 10050)
    })]
]));

function createEntity(entityType, level) {
    if (isDonut(entityType)) {
        return {
            id: uuidv4(),
            type: entityType,
            hp: 1,
            costs: 0,
            coins: 0,
            max: { hp: 1 }
        };
    }

    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let entity = {
            id: uuidv4(),
            type: entityType
        };
        const descriptor = EntityDescriptors.get(entityType)(level[entityType]);
        entity.max = { hp: descriptor.hp };
        return { ...entity, ...descriptor };
    }
}

function getEntityDescriptor(entityType, level) {
    if (isDonut(entityType)) {
        return {
            type: entityType,
            hp: 1,
            costs: 0,
            coins: 0,
            max: { hp: 1 }
        };
    }

    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let descriptor = { type: entityType, ...EntityDescriptors.get(entityType)(level[entityType]) }
        descriptor.max = { hp: descriptor.hp }
        return descriptor;
    }
}

function getCheapest(level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    return getEntityDescriptor(EntityType.CREAM, level);
}

class Board {
    static generate(size, seed = null) {
        let random = Math.random;
        if (seed) {
            const seedableRandom = function (s) {
                return function () { s = Math.sin(s) * 10000; return s - Math.floor(s); };
            };

            random = seedableRandom(seed);
        } else {
            seed = 42;
        }

        const playerFields = [];
        for (let player = 0; player < 2; player++) {
            const field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    const fieldtype = Math.floor(random() * 6);
                    const creamed = random() < 0.7
                    let cellType = BoardCellTypes.BROWN;
                    let previewStyle = 'brown';

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                        previewStyle = 'white';
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BLACK;
                        previewStyle = 'black';
                    }

                    const cream = createEntity(EntityType.CREAM);
                    cream.position = { col: col, row: row };

                    field.grid.push({
                        type: cellType,
                        previewStyle: previewStyle,
                        row: row,
                        col: col,
                        occupiedBy: creamed ? [cream] : [],
                        molten: false,
                        shielded: false
                    });
                }
            }
            playerFields.push(field);
        }
        return { fields: playerFields, size: size, seed: seed };
    }
}

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP',
    VIOLET_BEAUREGARDE: 'PlayerType.VIOLET_BEAUREGARDE',
    DONALD_TRUMP: 'PlayerType.DONALD_TRUMP',
});

function createPlayer(name, type, level, id) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (typeof id === 'undefined') {
        var id = uuidv4();
    }

    let player = {
        name: name,
        level: level,
        type: type,
        id: id,
        cacao: 100,
        cacaoPerTurn: 0,
        buildings: 0,
        buildingsPerTurn: 0,
        donutProbability: 0,
        donuts: [],
        activeDonuts: [],
        attacks: {},
        attacksPerTurn: {},
        hasFactory: false,
        statistics: {
            attacks: 0,
            builtEntities: 0,
            espionages: 0,
            moltenFields: 0
        }
    };
    player.attacks[AttackType.TRUFFLE] = 0;
    player.attacks[AttackType.HOT_CHOCOLATE] = 0;
    player.attacks[AttackType.FRUIT] = 0;
    player.attacks[AttackType.BUNNY] = 0;
    player.attacksPerTurn[AttackType.TRUFFLE] = 0;
    player.attacksPerTurn[AttackType.HOT_CHOCOLATE] = 0;
    player.attacksPerTurn[AttackType.FRUIT] = 0;
    player.attacksPerTurn[AttackType.BUNNY] = 0;
    return player;
}

function playerHasAttacks(player) {
    return (player.attacks[AttackType.TRUFFLE] +
        player.attacks[AttackType.HOT_CHOCOLATE] +
        player.attacks[AttackType.FRUIT] +
        player.attacks[AttackType.BUNNY]) > 0;
}

function playerHasAttacksPerTurn(player) {
    return (player.attacksPerTurn[AttackType.TRUFFLE] +
        player.attacksPerTurn[AttackType.HOT_CHOCOLATE] +
        player.attacksPerTurn[AttackType.FRUIT] +
        player.attacksPerTurn[AttackType.BUNNY]) > 0;
}

function playerHasHarmfulAttacksPerTurn(player) {
    if (player.attacksPerTurn[AttackType.HOT_CHOCOLATE] > 0 ||
        (player.attacksPerTurn[AttackType.TRUFFLE] > 0 && player.attacksPerTurn[AttackType.FRUIT] > 0) ||
        (player.attacksPerTurn[AttackType.TRUFFLE] > 0)) {
        return true;
    } else {
        return false;
    }
}

class NonPlayerCharacter {
    constructor(actions) {
        this.actions = actions;
    }

    simulateThinking(timeToThink) {
        return new Promise(resolve => {
            let timeoutId = setTimeout(resolve, timeToThink);
            this.registerTimeout(timeoutId);
        });
    }

    connectGamestate(callback, registerTimeout) {
        this.registerTimeout = timeout => registerTimeout(timeout);
        this.refreshGameState = () => {
            let game = callback();
            if (typeof game !== 'undefined') {
                this.gameIsRunning = game.isRunning;
                if (this.gameIsRunning) {
                    this.player = game.players[1];
                    if (typeof game.board !== 'undefined') {
                        this.gamefields = game.board.fields;
                        this.boardSize = game.board.size;
                        this.board = game.board.fields[this.player.fieldIndex];
                        this.opponentBoard = game.board.fields[game.players[0].fieldIndex];
                    }
                }
            } else {
                this.gameIsRunning = undefined;
                this.player = undefined;
                this.gamefields = undefined;
                this.boardSize = undefined;
                this.board = undefined;
                this.opponentBoard = undefined;
            }
        };
        this.refreshGameState();
    }

    async simulateChooseFieldOrStartDecision() { await this.simulateThinking(500) }
    async simulateChooseFieldDecision() { await this.simulateThinking(500) }
    async simulateInitialPlacement() { await this.simulateThinking(500) }
    async simulateAttackPhase() { await this.simulateThinking(500) }
    async simulateBuildPhase() { await this.simulateThinking(500) }
}

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
    joinGame: 'battlechoc/gameplay/joinGame'
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

/* reducer */

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

function currentPlayer(game) {
    try {
        return game.players[game.currentPlayerIndex];
    } catch (error) {
        throw new GameNotRunningError();
    }
}

function containsEntity(cell, entityType) {
    return cell.occupiedBy.map(entity => entity.type).includes(entityType)
}

function otherPlayer(game) {
    try {
        return game.players[1 - game.currentPlayerIndex];
    } catch (error) {
        throw new GameNotRunningError();
    }
}

function playerBoardCell(game, playerIndex, row, col) {
    return game.board.fields[game.players[playerIndex].fieldIndex].grid[row * game.board.size.cols + col];
}

function currentPlayerBoardCell(game, row, col) {
    return playerBoardCell(game, game.currentPlayerIndex, row, col);
}

function otherPlayerBoardCell(game, cell) {
    return playerBoardCell(game, 1 - game.currentPlayerIndex, cell.row, cell.col);
}

function currentPlayerField(game) {
    return game.board.fields[game.players[game.currentPlayerIndex].fieldIndex];
}

function otherPlayerField(game) {
    return game.board.fields[game.players[1 - game.currentPlayerIndex].fieldIndex];
}

function boardCell(grid, size, cellIdx) {
    return grid[cellIdx.row * size.cols + cellIdx.col];
}

function getCellPatch3x3(cellIdx, board, grid) {
    var patch = [];
    for (let row = cellIdx.row - 1; row < cellIdx.row + 2; row++) {
        for (let col = cellIdx.col - 1; col < cellIdx.col + 2; col++) {
            if (row >= 0 && col >= 0 && row < board.size.rows && col < board.size.cols) {
                patch.push(boardCell(grid, board.size, { row: row, col: col }));
            }
        }
    }
    return patch;
}

function getCellPatch5x5(cellIdx, board, grid) {
    var patch = [];
    for (let row = cellIdx.row - 2; row < cellIdx.row + 3; row++) {
        for (let col = cellIdx.col - 2; col < cellIdx.col + 3; col++) {
            if (row >= 0 && col >= 0 && row < board.size.rows && col < board.size.cols) {
                patch.push(boardCell(grid, board.size, { row: row, col: col }));
            }
        }
    }
    return patch;
}

function prepareBuildPhase(state) {
    state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
    currentPlayer(state.game).cacao += currentPlayer(state.game).cacaoPerTurn;
    currentPlayer(state.game).attacks[AttackType.TRUFFLE] = currentPlayer(state.game).attacksPerTurn[AttackType.TRUFFLE];
    currentPlayer(state.game).attacks[AttackType.FRUIT] = currentPlayer(state.game).attacksPerTurn[AttackType.FRUIT];
    currentPlayer(state.game).attacks[AttackType.HOT_CHOCOLATE] = currentPlayer(state.game).attacksPerTurn[AttackType.HOT_CHOCOLATE];
    currentPlayer(state.game).attacks[AttackType.BUNNY] = currentPlayer(state.game).attacksPerTurn[AttackType.BUNNY];
    currentPlayer(state.game).buildings = currentPlayer(state.game).buildingsPerTurn;

    let donutProbability = Math.random();

    if (typeof currentPlayer(state.game).donuts !== 'undefined' && donutProbability < currentPlayer(state.game).donutProbability && currentPlayer(state.game).donuts.length === 0) {
        let donutFactory = getEntityDescriptor(EntityType.DONUT_FACTORY, currentPlayer(state.game).level);
        let donutType = Math.floor(Math.random() * donutFactory.donutTypes) + 1;
        let donuts = [createEntity(EntityType.DONUT_PORTAL_BLUE), createEntity(EntityType.DONUT_PORTAL_RED)]
        if (donutType === 2) {
            donuts = [createEntity(EntityType.DONUT_HEALTH_GREEN)]
        } else if (donutType === 3) {
            donuts = [createEntity(EntityType.DONUT_STOP_PINK)]
        } else if (donutType === 4) {
            donuts = [createEntity(EntityType.DONUT_CREAM_WHITE)]
        } else if (donutType === 5) {
            donuts = [createEntity(EntityType.DONUT_SURPRISE_YELLOW)]
        }
        currentPlayer(state.game).donuts = donuts;
    }

    if ((currentPlayer(state.game).buildings > 0 && currentPlayer(state.game).cacao >= getCheapest(currentPlayer(state.game).level).costs) ||
        (typeof currentPlayer(state.game).donuts !== 'undefined' && currentPlayer(state.game).donuts.length > 0)) {
        state.game.state = GameStateTypes.BUILD_PHASE;
    } else {
        state.game.state = GameStateTypes.ATTACK_PHASE;
    }
}

function calculateCacaoPerTurn(building, cellColor) {
    let cacaoPerTurn = building.cacaoPerTurn;
    if (cellColor === BoardCellTypes.WHITE) {
        cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
    }
    return cacaoPerTurn;
}

function calculateBuildingsPerTurn(building, cellColor) {
    let buildingsPerTurn = building.buildingsPerTurn;
    if (cellColor === BoardCellTypes.BLACK) {
        buildingsPerTurn += 1;
    }
    return buildingsPerTurn;
}

const startGameReduction = (state, action) => {
    let coinToss = Math.round(Math.random());
    if (action.payload[1].type === PlayerType.AUGUSTUS_GLOOP || action.payload[1].type === PlayerType.DONALD_TRUMP) {
        coinToss = 0;
    }
    state.game = {
        players: action.payload,
        currentPlayerIndex: coinToss,
        state: GameStateTypes.START,
        isRunning: true,
        winners: []
    };
};

const resumeGameReduction = (state, action) => {
    state.game = {
        players: action.payload.players,
        currentPlayerIndex: action.payload.currentPlayerIndex,
        state: action.payload.state,
        board: action.payload.board,
        isRunning: action.payload.isRunning
    };
}

const joinGameReduction = (state, action) => {
    state.game = action.payload;
}

const createGameReduction = (state, action) => {
    state.game.board = Board.generate(action.payload.boardSize, action.payload.boardSeed);
    state.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
}

const chooseFieldReduction = (state, action) => {
    currentPlayer(state.game).fieldIndex = action.payload.fieldIdx;
    otherPlayer(state.game).fieldIndex = 1 - action.payload.fieldIdx;
    state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
    state.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
}

const chooseStartReduction = state => {
    state.game.state = GameStateTypes.CHOOSE_FIELD;
    state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
}

const finishTurnReduction = state => {
    if (state.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
        state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
        state.game.state = GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
    } else if (state.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT ||
        state.game.state === GameStateTypes.ATTACK_PHASE ||
        state.game.state === GameStateTypes.BUILD_PHASE) {
        prepareBuildPhase(state);
    }
}

const finishBuildPhaseReduction = state => {
    state.game.state = GameStateTypes.ATTACK_PHASE;
}

const buildReduction = (state, action) => {
    let building = action.payload.building;

    if (building.type === EntityType.DONUT_PORTAL_RED) {
        let blueDonut = currentPlayer(state.game).activeDonuts.find(donut => donut.type === EntityType.DONUT_PORTAL_BLUE && typeof donut.assignment === 'undefined');
        if (blueDonut) {
            let assignment = uuidv4();
            blueDonut.assignment = assignment;
            building.assignment = assignment;
        }
    }

    currentPlayerBoardCell(state.game, building.position.row, building.position.col).occupiedBy.push(building);
    const cellColor = currentPlayerBoardCell(state.game, building.position.row, building.position.col).type;
    currentPlayer(state.game).statistics.builtEntities += 1;

    if (building.type === EntityType.FACTORY) {
        currentPlayer(state.game).buildingsPerTurn = calculateBuildingsPerTurn(building, cellColor);
        currentPlayer(state.game).cacaoPerTurn += calculateCacaoPerTurn(building, cellColor);
        currentPlayer(state.game).hasFactory = true;
    } else {
        if (building.type === EntityType.CACAOTREE) {
            currentPlayer(state.game).cacaoPerTurn += calculateCacaoPerTurn(building, cellColor);
        } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
            currentPlayer(state.game).attacksPerTurn[building.attackType] += building.attacksPerTurn;
            currentPlayer(state.game).attacks[building.attackType] += building.attacksPerTurn;
        } else if (building.type === EntityType.FRUIT_CANNON) {
            currentPlayer(state.game).attacksPerTurn[building.attackType] += building.attacksPerTurn;
            currentPlayer(state.game).attacks[building.attackType] += building.attacksPerTurn;
            let cell = currentPlayerBoardCell(state.game, building.position.row, building.position.col);
            cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== EntityType.RUM_TRUFFLE_CANNON);
        } else if (building.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
            currentPlayer(state.game).attacksPerTurn[building.attackType] += building.attacksPerTurn;
            currentPlayer(state.game).attacks[building.attackType] += building.attacksPerTurn;
        } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
            currentPlayer(state.game).attacksPerTurn[building.attackType] += building.attacksPerTurn;
            currentPlayer(state.game).attacks[building.attackType] += building.attacksPerTurn;
        } else if (building.type === EntityType.FACTORY_EXTENSION) {
            currentPlayer(state.game).buildingsPerTurn += calculateBuildingsPerTurn(building, cellColor);
        } else if (building.type === EntityType.DONUT_FACTORY) {
            currentPlayer(state.game).donutProbability += building.donutProbability;
        } else if (building.type === EntityType.CHOCOLATE_FOUNTAIN) {
            const neighbors = getCellPatch3x3({ row: building.position.row, col: building.position.col }, state.game.board, currentPlayerField(state.game).grid);
            for (let i = 0; i < neighbors.length; i++) {
                neighbors[i].shielded = true;
            }
        }

        if (!isDonut(building.type)) {
            currentPlayer(state.game).buildings -= 1;
            currentPlayer(state.game).cacao -= building.costs;
        } else {
            currentPlayer(state.game).donuts = currentPlayer(state.game).donuts.filter(donut => donut.type !== building.type);
            currentPlayer(state.game).activeDonuts.push(action.payload.building);
        }
    }
}

const attackReduction = (state, action) => {
    let attackType = action.payload.attackType;
    currentPlayer(state.game).attacks[attackType] -= 1;
    let attackedCell = otherPlayerBoardCell(state.game, action.payload);
    const cellColor = attackedCell.type;
    let opponent = otherPlayer(state.game);

    const testAndTriggerTraps = (force = false) => {
        if (attackedCell.shielded && !force) {
            return;
        }

        let blueDonut = otherPlayer(state.game).activeDonuts.find(entity => entity.type === EntityType.DONUT_PORTAL_BLUE && entity.position.row === attackedCell.row && entity.position.col === attackedCell.col);
        if (typeof blueDonut !== 'undefined') {
            console.log(`HIT BLUE DONUT @ [${blueDonut.position.row},${blueDonut.position.col}]`);
            let redDonut = otherPlayer(state.game).activeDonuts.find(entity => entity.type === EntityType.DONUT_PORTAL_RED && entity.assignment === blueDonut.assignment);
            if (typeof redDonut !== 'undefined') {
                console.log(`THERE IS A RELATED RED DONUT@ [${redDonut.position.row},${redDonut.position.col}]`);
                let redDonutCell = otherPlayerBoardCell(state.game, redDonut.position);

                redDonutCell.occupiedBy = redDonutCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_PORTAL_RED);
                attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_PORTAL_BLUE);

                otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.assignment !== blueDonut.assignment);

                if ((!containsEntity(attackedCell, EntityType.CHOCOLATE_FOUNTAIN) && containsEntity(redDonutCell, EntityType.CHOCOLATE_FOUNTAIN)) ||
                    (containsEntity(attackedCell, EntityType.CHOCOLATE_FOUNTAIN) && !containsEntity(redDonutCell, EntityType.CHOCOLATE_FOUNTAIN))) {
                    let fountain = [...attackedCell.occupiedBy, ...redDonutCell.occupiedBy].find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN);
                    let neighbors = [...getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid),
                    ...getCellPatch3x3({ row: redDonutCell.row, col: redDonutCell.col }, state.game.board, otherPlayerField(state.game).grid)];
                    neighbors.forEach(neighbor => {
                        let otherFountainsNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN));
                        otherFountainsNearby = otherFountainsNearby.filter(cell => !cell.occupiedBy.some(entity => entity.id === fountain.id));
                        if (otherFountainsNearby.length === 0) {
                            neighbor.shielded = !neighbor.shielded;
                        }
                    });
                }

                let pivot = JSON.parse(JSON.stringify(redDonutCell));
                redDonutCell.occupiedBy = attackedCell.occupiedBy;
                attackedCell.occupiedBy = pivot.occupiedBy;

                attackedCell.occupiedBy.forEach(entity => entity.position = { row: attackedCell.row, col: attackedCell.col });
                redDonutCell.occupiedBy.forEach(entity => entity.position = { row: redDonutCell.row, col: redDonutCell.col });

                redDonutCell.type = attackedCell.type;
                attackedCell.type = pivot.type;
            }
        }

        let greenDonut = attackedCell.occupiedBy.find(entity => entity.type === EntityType.DONUT_HEALTH_GREEN);
        if (typeof greenDonut !== 'undefined') {
            console.log(`HIT GREEN DONUT @ [${greenDonut.position.row},${greenDonut.position.col}]`);
            attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_HEALTH_GREEN);
            otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.id !== greenDonut.id);
            let patch = getCellPatch5x5({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
            patch.forEach((cell) => {
                cell.occupiedBy.forEach(entity => {
                    entity.hp = getEntityDescriptor(entity.type, otherPlayer(state.game).level).max.hp;
                });
            });
        }

        let whiteDonut = attackedCell.occupiedBy.find(entity => entity.type === EntityType.DONUT_CREAM_WHITE);
        if (typeof whiteDonut !== 'undefined') {
            console.log(`HIT WHITE DONUT @ [${whiteDonut.position.row},${whiteDonut.position.col}]`);
            attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_CREAM_WHITE);
            otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.id !== whiteDonut.id);
            let patch = getCellPatch5x5({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
            patch.forEach(cell => {
                if (!containsEntity(cell, EntityType.CREAM)) {
                    let cream = createEntity(EntityType.CREAM, opponent.level);
                    cream.position = { row: cell.row, col: cell.col };
                    cell.occupiedBy.push(cream);
                }
            });
        }

        let pinkDonut = attackedCell.occupiedBy.find(entity => entity.type === EntityType.DONUT_STOP_PINK);
        if (typeof pinkDonut !== 'undefined') {
            console.log(`HIT PINK DONUT @ [${pinkDonut.position.row},${pinkDonut.position.col}]`);
            attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_STOP_PINK);
            otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.id !== pinkDonut.id);
            prepareBuildPhase(state);
        }

        let yellowDonut = attackedCell.occupiedBy.find(entity => entity.type === EntityType.DONUT_SURPRISE_YELLOW);
        if (typeof yellowDonut !== 'undefined') {
            console.log(`HIT YELLOW DONUT @ [${yellowDonut.position.row},${yellowDonut.position.col}]`);
            attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_SURPRISE_YELLOW);
            otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.id !== yellowDonut.id);
            let donutType = Math.round(Math.random() * 4)
            if (donutType === 0) {
                prepareBuildPhase(state);
            } else if (donutType === 1) {
                let patch = getCellPatch5x5({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
                patch.forEach((cell) => {
                    if (!containsEntity(cell, EntityType.CREAM)) {
                        let cream = createEntity(EntityType.CREAM, opponent.level);
                        cream.position = { row: cell.row, col: cell.col };
                        cell.occupiedBy.push(cream);
                    }
                });
            } else if (donutType === 2) {
                const patch = getCellPatch5x5({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
                patch.forEach((cell) => {
                    cell.occupiedBy.forEach(entity => {
                        entity.hp = getEntityDescriptor(entity.type, otherPlayer(state.game).level).max.hp;
                    });
                });
            } else if (donutType === 3) {
                for (let xmasFactoryCell of otherPlayerField(state.game).grid.filter(cell => containsEntity(cell, EntityType.XMAS_FACTORY))) {
                    const ballista = createEntity(EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                    ballista.position = { row: xmasFactoryCell.row, col: xmasFactoryCell.col };
                    xmasFactoryCell.occupiedBy = xmasFactoryCell.occupiedBy.filter(entity => entity.type !== EntityType.XMAS_FACTORY);
                    xmasFactoryCell.occupiedBy.push(ballista);
                    opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE] += 1;
                    opponent.attacks[AttackType.HOT_CHOCOLATE] = opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE];
                }
            } else if (donutType === 4) {
                for (let xmasFactoryCell of otherPlayerField(state.game).grid.filter(cell => containsEntity(cell, EntityType.XMAS_FACTORY))) {
                    const fountain = createEntity(EntityType.CHOCOLATE_FOUNTAIN, opponent.level);
                    fountain.position = { row: xmasFactoryCell.row, col: xmasFactoryCell.col };
                    xmasFactoryCell.occupiedBy = xmasFactoryCell.occupiedBy.filter(entity => entity.type !== EntityType.XMAS_FACTORY);
                    xmasFactoryCell.occupiedBy.push(fountain);
                    const neighbors = getCellPatch3x3({ row: fountain.position.row, col: fountain.position.col }, state.game.board, otherPlayerField(state.game).grid);
                    for (let i = 0; i < neighbors.length; i++) {
                        neighbors[i].shielded = true;
                    }
                }
            }
        }
    }

    if (![AttackType.HOT_CHOCOLATE, AttackType.BUNNY].includes(attackType)) {
        testAndTriggerTraps();
    }

    if (attackType === AttackType.BUNNY) {
        const patch = getCellPatch3x3({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
        const xmasFactoryFiltered = patch.filter(cell => containsEntity(cell, EntityType.XMAS_FACTORY));
        if (xmasFactoryFiltered.length === 0) {
            currentPlayer(state.game).statistics.espionages += 1;
            patch.forEach((cell) => {
                if (cell.occupiedBy.map(entity => entity.type).indexOf(EntityType.CREAM) > -1) {
                    cell.occupiedBy = cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM);
                }
            });
        } else {
            currentPlayer(state.game).attacksPerTurn[AttackType.BUNNY] = 0;
            const spyingEasterBunnyCell = currentPlayerField(state.game).grid.filter(cell => containsEntity(cell, EntityType.SPYING_EASTER_BUNNY))[0];
            spyingEasterBunnyCell.occupiedBy = spyingEasterBunnyCell.occupiedBy.filter(entity => entity.type !== EntityType.SPYING_EASTER_BUNNY);

            let ballista = createEntity(EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
            ballista.position = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type === EntityType.XMAS_FACTORY)[0].position;
            xmasFactoryFiltered[0].occupiedBy = xmasFactoryFiltered[0].occupiedBy.filter(entity => entity.type !== EntityType.XMAS_FACTORY);
            xmasFactoryFiltered[0].occupiedBy.push(ballista);
            opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE] += 1;
            opponent.attacks[AttackType.HOT_CHOCOLATE] = opponent.attacksPerTurn[AttackType.HOT_CHOCOLATE];
        }
    } else if (attackedCell.shielded && attackType !== AttackType.HOT_CHOCOLATE) {
        let damage = action.payload.damage;
        if (attackType === AttackType.TRUFFLE) {
            damage = 0.1 * damage;
        }
        let neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
        let cellsWithFountains = neighbors.filter(cell => containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN));

        let fountain = cellsWithFountains[0].occupiedBy.filter(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN)[0];
        fountain.hp = Math.round(fountain.hp - damage);
        if (fountain.hp < 1) {
            cellsWithFountains[0].occupiedBy = [];
            neighbors = getCellPatch3x3({ row: cellsWithFountains[0].row, col: cellsWithFountains[0].col }, state.game.board, otherPlayerField(state.game).grid);
            neighbors.forEach(neighbor => {
                const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN));
                if (otherFountainNearby.length === 0) {
                    neighbor.shielded = false;
                }
            });
            testAndTriggerTraps();
        }
    } else {
        if (attackType === AttackType.HOT_CHOCOLATE) {
            testAndTriggerTraps(true);

            // remove the blue donut from the active donuts of the other player and remove the blue donut from the field if a red donut got molten
            let redDonut = otherPlayer(state.game).activeDonuts.find(entity => entity.type === EntityType.DONUT_PORTAL_RED && entity.position.row === attackedCell.row && entity.position.col === attackedCell.col);
            if (typeof redDonut !== 'undefined') {
                console.log(`MOLTEN RED DONUT @ [${redDonut.position.row},${redDonut.position.col}]`);
                let blueDonut = otherPlayer(state.game).activeDonuts.find(entity => entity.type === EntityType.DONUT_PORTAL_BLUE && entity.assignment === redDonut.assignment);
                if (typeof blueDonut !== 'undefined') {
                    console.log(`THERE IS A RELATED BLUE DONUT THAT NEEDS TO BE DESTROYED@ [${blueDonut.position.row},${blueDonut.position.col}]`);
                    let blueDonutCell = otherPlayerBoardCell(state.game, blueDonut.position);

                    blueDonutCell.occupiedBy = blueDonutCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_PORTAL_BLUE);
                    attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_PORTAL_RED);

                    otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.assignment !== blueDonut.assignment);
                }
            }
            attackedCell.molten = true;

            if (attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0) {
                currentPlayer(state.game).statistics.moltenFields += 1;
            }
        }

        attackedCell.occupiedBy.forEach(entity => {
            if (attackType === AttackType.HOT_CHOCOLATE) {
                entity.hp = 0;
            } else {
                if (!isDonut(entity.type)) {
                    let damage = action.payload.damage;
                    if (attackType === AttackType.FRUIT) {
                        damage = 0.1 * damage;
                    }
                    entity.hp = Math.round(entity.hp - damage);
                }
            }

            if (entity.hp < 1) {
                currentPlayer(state.game).statistics.attacks += 1;
                if (entity.type === EntityType.FACTORY) {
                    opponent.hasFactory = false;
                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(getEntityDescriptor(EntityType.FACTORY, opponent.level), cellColor);
                    opponent.cacaoPerTurn -= calculateCacaoPerTurn(getEntityDescriptor(EntityType.FACTORY, opponent.level), cellColor);
                } else if (entity.type === EntityType.FACTORY_EXTENSION) {
                    opponent.buildingsPerTurn -= calculateBuildingsPerTurn(getEntityDescriptor(EntityType.FACTORY_EXTENSION, opponent.level), cellColor);
                } else if (entity.type === EntityType.CACAOTREE) {
                    opponent.cacaoPerTurn -= calculateCacaoPerTurn(getEntityDescriptor(EntityType.CACAOTREE, opponent.level), cellColor);
                } else if (entity.type === EntityType.DONUT_FACTORY) {
                    opponent.donutProbability = 0;
                } else if (entity.type === EntityType.RUM_TRUFFLE_CANNON) {
                    const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                } else if (entity.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
                    const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.HOT_CHOCOLATE_BALLISTA, opponent.level);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                } else if (entity.type === EntityType.FRUIT_CANNON) {
                    const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.FRUIT_CANNON, opponent.level);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                    const rumTruffleCannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, opponent.level);
                    opponent.attacksPerTurn[rumTruffleCannon.attackType] -= rumTruffleCannon.attacksPerTurn;
                } else if (entity.type === EntityType.SPYING_EASTER_BUNNY) {
                    const destroyedBuildingDescriptor = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, opponent.level);
                    opponent.attacksPerTurn[destroyedBuildingDescriptor.attackType] -= destroyedBuildingDescriptor.attacksPerTurn;
                } else if (attackType === AttackType.HOT_CHOCOLATE && entity.type === EntityType.CHOCOLATE_FOUNTAIN) {
                    attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.CHOCOLATE_FOUNTAIN);
                    const neighbors = getCellPatch3x3({ row: attackedCell.row, col: attackedCell.col }, state.game.board, otherPlayerField(state.game).grid);
                    neighbors.forEach(neighbor => {
                        const otherFountainNearby = getCellPatch3x3({ row: neighbor.row, col: neighbor.col }, state.game.board, otherPlayerField(state.game).grid).filter(cell => containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN));
                        if (otherFountainNearby.length === 0) {
                            neighbor.shielded = false;
                        }
                    });
                }
                attackedCell.occupiedBy = attackedCell.occupiedBy.filter(fieldEntity => fieldEntity.id !== entity.id);
            }
        });
    }
}

const endGameReduction = (state, action) => {
    state.game.isRunning = false;
    state.game.winners = action.payload.winners;

    if (action.payload.winners.length === 1) {
        let winner = state.game.players.find(player => player.id === action.payload.winners[0].id)
        winner.statistics.won = true;
        winner.statistics.lost = false;

        let looser = state.game.players.find(player => player.id !== action.payload.winners[0].id)
        looser.statistics.won = false;
        looser.statistics.lost = true;
    } else if (action.payload.winners.length === 2) {
        for (let player of state.game.players) {
            player.statistics.won = false;
            player.statistics.lost = false;
        }
    }
}

const finishGameReduction = state => {
    state.game = undefined;
}

/* rules */

class Rules {
    static currentPlayer(game) {
        try {
            return game.players[game.currentPlayerIndex];
        } catch (error) {
            throw new GameNotRunningError();
        }
    }

    static isIssuerRelevant(action) {
        return IssuerRelevantActions.includes(action.type);
    }

    static isGameAction(action) {
        return action.type.includes('battlechoc/gameplay/');
    }

    static playerBoardCell(game, playerIndex, cellIdx) {
        return game.board.fields[game.players[playerIndex].fieldIndex].grid[cellIdx.row * game.board.size.cols + cellIdx.col];
    }

    static currentPlayerBoardCell(game, cellIdx) {
        return this.playerBoardCell(game, game.currentPlayerIndex, cellIdx);
    }

    static currentPlayerField(game) {
        return game.board.fields[game.players[game.currentPlayerIndex].fieldIndex];
    }

    static otherPlayerBoardCell(game, cellIdx) {
        return this.playerBoardCell(game, 1 - game.currentPlayerIndex, cellIdx);
    }

    static getCellNeighbors(cellIdx, game) {
        let neighbors = [];

        const idxLeftOf = { row: cellIdx.row, col: cellIdx.col - 1 };
        if (idxLeftOf.col >= 0) {
            neighbors.push(this.currentPlayerBoardCell(game, idxLeftOf));
        }

        const idxRightOf = { row: cellIdx.row, col: cellIdx.col + 1 };
        if (idxRightOf.col < game.board.size.cols) {
            neighbors.push(this.currentPlayerBoardCell(game, idxRightOf));
        }

        const idxTopOf = { row: cellIdx.row - 1, col: cellIdx.col };
        if (idxTopOf.row >= 0) {
            neighbors.push(this.currentPlayerBoardCell(game, idxTopOf));
        }

        const idxBelowOf = { row: cellIdx.row + 1, col: cellIdx.col };
        if (idxBelowOf.row < game.board.size.rows) {
            neighbors.push(this.currentPlayerBoardCell(game, idxBelowOf));
        }

        return neighbors;
    }

    static canBuildFactoryExtensionOnCell(cellIdx, game) {
        return this.getCellNeighbors(cellIdx, game).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY)).length > 0;
    }

    static canBuildOnCell(cellIdx, entityType, game) {
        let cell = this.currentPlayerBoardCell(game, cellIdx);
        if (entityType === EntityType.SPYING_EASTER_BUNNY && this.currentPlayerField(game).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length > 0) {
            return new BuildNotPossibleError('Can only build one spying easter bunny.');
        } else if (entityType === EntityType.DONUT_FACTORY && this.currentPlayerField(game).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.DONUT_FACTORY)).length > 0) {
            return new BuildNotPossibleError('Can only build one donut factory.');
        } else if (isDonut(entityType)) {
            if (cell.occupiedBy.some(entity => isDonut(entity.type))) {
                return new BuildNotPossibleError('Build not possible on given field row: ' +
                    cellIdx.row + ' col: ' + cellIdx.col + ', entity type: ' + entityType + ' cell occupied already by another trap: ' + JSON.stringify(cell.occupiedBy.filter(entity => isDonut(entity.type))));
            } else {
                return true;
            }
        } else if (cell.molten) {
            return new BuildNotPossibleError('Cannot build on molten cells.');
        } else if (entityType === EntityType.FRUIT_CANNON && cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)) {
            return true;
        } else if (entityType !== EntityType.FRUIT_CANNON &&
            ((entityType !== EntityType.FACTORY_EXTENSION && cell.occupiedBy.filter(entity => !isDonut(entity.type)).length === 0) ||
                (entityType === EntityType.CREAM && !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM)) ||
                (entityType === EntityType.FACTORY_EXTENSION && ((cell.occupiedBy.length === 1 && cell.occupiedBy[0].type === EntityType.CREAM) || cell.occupiedBy.length === 0) && this.canBuildFactoryExtensionOnCell(cellIdx, game)) ||
                (entityType !== EntityType.CREAM && entityType !== EntityType.FACTORY_EXTENSION && cell.occupiedBy.filter(entity => !isDonut(entity.type)).length === 1 && cell.occupiedBy.filter(entity => !isDonut(entity.type))[0].type === EntityType.CREAM))) {
            return true;
        } else {
            return new BuildNotPossibleError('Build not possible on given field row: ' +
                cellIdx.row + ' col: ' + cellIdx.col + ', entity type: ' + entityType + ' cell occupied by: ' + JSON.stringify(cell.occupiedBy));
        }
    }

    /**
     * Determines who won the game.
     * 
     * @param {state} game 
     * 
     * returns the player that won the game. otherwise returns undefined
     */
    static determineWinner(game) {
        let potentialWinners = [];
        for (var playerIdx = 0; playerIdx < 2; ++playerIdx) {
            const player = game.players[playerIdx];
            const playerCanAttack = playerHasHarmfulAttacksPerTurn(player, game.board.fields[game.players[1 - playerIdx].fieldIndex].grid);
            if ((player.buildingsPerTurn === 0 && !playerCanAttack) ||
                (!playerCanAttack && player.cacaoPerTurn === 0 && player.cacao < getEntityDescriptor(EntityType.CACAOTREE, player.level).costs)) {
                let winner = Object.assign({ idx: 1 - playerIdx }, game.players[1 - playerIdx]);
                potentialWinners.push(winner);
            }
        }

        if (potentialWinners.length === 0) {
            return undefined;
        } else if (potentialWinners.length === 1) {
            return potentialWinners;
        } else {
            if (potentialWinners[0].cacao > potentialWinners[1].cacao) {
                return potentialWinners.slice(0, 1);
            } else if (potentialWinners[1].cacao > potentialWinners[0].cacao) {
                return potentialWinners.slice(1, 2);
            } else {
                const player0Trees = game.board.fields[potentialWinners[0].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
                const player1Trees = game.board.fields[potentialWinners[1].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
                if (player0Trees > player1Trees) {
                    return potentialWinners.slice(0, 1);
                } else if (player1Trees > player0Trees) {
                    return potentialWinners.slice(1, 2);
                } else {
                    return potentialWinners;
                }
            }
        }
    }

    static issuerIsInvalid(game, action) {
        if (IssuerRelevantActions.includes(action.type)) {
            if (typeof action.payload === 'undefined' ||
                typeof action.payload.issuer === 'undefined' ||
                action.payload.issuer !== currentPlayer(game).id) {
                return true;
            }
        }
        return false;
    }

    static isActionValid(game, action) {
        if (!(this.isGameAction(action))) {
            return new ActionValidationError(action);
        }

        let currentState = typeof game === 'undefined' ? undefined : game.state;
        if (Rules.issuerIsInvalid(game, action) && action.type !== GameActionTypes.endGame) {
            let issuerId;
            if (typeof action.payload !== 'undefined') {
                issuerId = action.payload.issuer;
            }
            return new InvalidActionIssuerError(action, issuerId, this.currentPlayer(game).id);
        }

        if (typeof currentState !== 'undefined') {
            if (!game.isRunning && action.type !== GameActionTypes.finishGame) {
                return new GameAlreadyEndedError(action);
            }
        }

        if (typeof currentState === 'undefined' && [GameActionTypes.startGame, GameActionTypes.resumeGame, GameActionTypes.joinGame].includes(action.type)) {
            return true;
        } else if (action.type === GameActionTypes.createBoard) {
            return currentState === GameStateTypes.START;
        } else if (action.type === GameActionTypes.chooseStart) {
            return currentState === GameStateTypes.CHOOSE_FIELD_OR_START;
        } else if (action.type === GameActionTypes.chooseField) {
            return currentState === GameStateTypes.CHOOSE_FIELD_OR_START || currentState === GameStateTypes.CHOOSE_FIELD;
        } else if (action.type === GameActionTypes.endGame) {
            return true;
        } else if (action.type === GameActionTypes.finishGame) {
            return true;
        } else if (action.type === GameActionTypes.finishTurn) {
            return true;
        } else if (action.type === GameActionTypes.finishBuildPhase) {
            return currentState === GameStateTypes.BUILD_PHASE;
        } else if (action.type === GameActionTypes.build) {
            if (currentState !== GameStateTypes.BUILD_PHASE && currentState !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && currentState !== GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
                return new UnexpectedStateError(currentState);
            } else if (this.currentPlayer(game).donuts.length > 0 && isDonut(action.payload.building.type)) {
                return this.canBuildOnCell(action.payload.building.position, action.payload.building.type, game);
            } else if ((this.currentPlayer(game).buildings === 0 || (this.currentPlayer(game).buildingsPerTurn === 0 && action.payload.building.type === EntityType.FACTORY_EXTENSION)) &&
                action.payload.building.type !== EntityType.FACTORY) {
                return new NoBuildingsLeftError();
            } else if (this.currentPlayer(game).cacao < action.payload.building.costs) {
                return new NoCacaoLeftError();
            } else {
                return this.canBuildOnCell(action.payload.building.position, action.payload.building.type, game);
            }
        } else if (action.type === GameActionTypes.attack) {
            if (this.currentPlayer(game).attacks[action.payload.attackType] === 0) {
                return new NoAttacksLeftError();
            } else if (this.otherPlayerBoardCell(game, action.payload).occupiedBy.filter(entity => !isDonut(entity.type)).length === 0 &&
                action.payload.attackType !== AttackType.BUNNY && action.payload.attackType !== AttackType.HOT_CHOCOLATE) {
                return new TargetEmptyError();
            } else if (AttackType.HOT_CHOCOLATE && this.otherPlayerBoardCell(game, action.payload).molten) {
                return new AlreadyMolten();
            } else {
                return true;
            }
        } else {
            return new ActionValidationError(action);
        }
    }
}

module.exports.setRandomSeed = setRandomSeed;
module.exports.getRandomNumber = getRandomNumber;
module.exports.BoardCellTypes = BoardCellTypes;
module.exports.EntityType = EntityType;
module.exports.AttackType = AttackType;
module.exports.NotificationReasonType = NotificationReasonType;
module.exports.isDonut = isDonut;
module.exports.createEntity = createEntity;
module.exports.getEntityDescriptor = getEntityDescriptor;
module.exports.getCheapest = getCheapest;
module.exports.EntityDescriptors = EntityDescriptors;
module.exports.finalLevel = finalLevel;
module.exports.MultiplayerGameSessionState = MultiplayerGameSessionState;
module.exports.EmptyPlayerStats = EmptyPlayerStats;
module.exports.Board = Board;
module.exports.PlayerType = PlayerType;
module.exports.createPlayer = createPlayer;
module.exports.playerHasAttacksPerTurn = playerHasAttacksPerTurn;
module.exports.playerHasHarmfulAttacksPerTurn = playerHasHarmfulAttacksPerTurn;
module.exports.playerHasAttacks = playerHasAttacks;
module.exports.NonPlayerCharacter = NonPlayerCharacter;
module.exports.GameActionTypes = GameActionTypes;
module.exports.IssuerRelevantActions = IssuerRelevantActions;
module.exports.GameStateTypes = GameStateTypes;
module.exports.startGameReduction = startGameReduction;
module.exports.resumeGameReduction = resumeGameReduction;
module.exports.joinGameReduction = joinGameReduction;
module.exports.createGameReduction = createGameReduction;
module.exports.chooseFieldReduction = chooseFieldReduction;
module.exports.chooseStartReduction = chooseStartReduction;
module.exports.finishTurnReduction = finishTurnReduction;
module.exports.finishBuildPhaseReduction = finishBuildPhaseReduction;
module.exports.buildReduction = buildReduction;
module.exports.attackReduction = attackReduction;
module.exports.endGameReduction = endGameReduction;
module.exports.finishGameReduction = finishGameReduction;
module.exports.Rules = Rules

/* errors */

class BattlechocError extends Error { };

class ActionValidationError extends BattlechocError {
    constructor(action, ...args) {
        super(...args);
        this.message = action.type + ' is not a valid action';
    }
}

class InvalidActionIssuerError extends BattlechocError {
    constructor(action, issuerId, currentPlayerId, ...args) {
        super(...args);
        this.message = action.type + ' issued by ' + issuerId + ' cannot be issued by this issuer because it is not her turn. Current player is ' + currentPlayerId;
    }
}

class NoBuildingsLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'No more buildings can be built';
    }
}

class NoCacaoLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'Not enough cacao left';
    }
}

class BuildNotPossibleError extends BattlechocError {
    constructor(message, ...args) {
        super(...args);
        this.message = message;
    }
}

class NoAttacksLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'No attacks left';
    }
}

class TargetEmptyError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'The target field is empty';
    }
}

class UnexpectedStateError extends BattlechocError {
    constructor(state, ...args) {
        super(...args);
        this.message = 'Unexpected state for action: ' + state;
    }
}

class GameAlreadyEndedError extends BattlechocError {
    constructor(action, ...args) {
        super(...args);
        this.message = 'Action ' + action.type + ' cannot be executed, because the game has already ended!';
    }
}

class GameNotRunningError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'There is currently no running game to access its gamestate!';
    }
}

class AlreadyMolten extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'This field is already molten';
    }
}

class NoHealthyInternetConnectionError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'You may not have a healthy internet connection at the moment. Please try again later'
    }
}

module.exports.BattlechocError = BattlechocError;
module.exports.NoHealthyInternetConnectionError = NoHealthyInternetConnectionError;
module.exports.AlreadyMolten = AlreadyMolten;
module.exports.GameNotRunningError = GameNotRunningError;
module.exports.ActionValidationError = ActionValidationError;
module.exports.NoBuildingsLeftError = NoBuildingsLeftError;
module.exports.NoCacaoLeftError = NoCacaoLeftError;
module.exports.BuildNotPossibleError = BuildNotPossibleError;
module.exports.TargetEmptyError = TargetEmptyError;
module.exports.NoAttacksLeftError = NoAttacksLeftError;
module.exports.UnexpectedStateError = UnexpectedStateError;
module.exports.InvalidActionIssuerError = InvalidActionIssuerError;
module.exports.GameAlreadyEndedError = GameAlreadyEndedError;
module.exports.SurrenderCosts = SurrenderCosts;

// Translations begin

function fmt(str, values) {
    return str.replace(/\{\{(\w+)\}\}/g, function (match, key) {
        return values[key];
    });
};

const validLanguages = ['en', 'de', 'jp', 'es', 'fr', 'it', 'pt', 'vn'];
const referenceLanguage = 'en';
const strings = {
    en: require('./translations/en_strings.js'),
    de: require('./translations/de_strings.js'),
    jp: require('./translations/jp_strings.js'),
    es: require('./translations/es_strings.js'),
    fr: require('./translations/fr_strings.js'),
    it: require('./translations/it_strings.js'),
    pt: require('./translations/pt_strings.js'),
    vn: require('./translations/vn_strings.js')
};

const translationPredicates = {
    TOOLTIP_INITIAL_TURN_OPPONENT: function (strings, name) {
        return name + strings.TOOLTIP_INITIAL_TURN_OPPONENT;
    },
    TOOLTIP_BUILDING_TITLE: function (strings, type) {
        switch (type) {
            case EntityType.CREAM:
            case EntityType.FACTORY_EXTENSION:
            case EntityType.FACTORY:
            case EntityType.HOT_CHOCOLATE_BALLISTA:
            case EntityType.CACAOTREE:
            case EntityType.RUM_TRUFFLE_CANNON:
            case EntityType.XMAS_FACTORY:
            case EntityType.SPYING_EASTER_BUNNY:
            case EntityType.CHOCOLATE_FOUNTAIN:
            case EntityType.FRUIT_CANNON:
            case EntityType.DONUT_FACTORY:
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
            case EntityType.DONUT_STOP_PINK:
            case EntityType.DONUT_SURPRISE_YELLOW:
            case EntityType.DONUT_HEALTH_GREEN:
            case EntityType.DONUT_CREAM_WHITE:
                return strings['TOOLTIP_BUILDING_TITLE_' + type.replace('EntityType.', '')];
            default: return strings.TOOLTIP_BUILDING_TITLE_UNKNOWN;
        }
    },
    TOOLTIP_BUILDING_INFO: function (strings, type, building) {
        switch (type) {
            case EntityType.CREAM:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CREAM,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.FACTORY_EXTENSION:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_FACTORY_EXTENSION,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_BUILDINGS_PER_TURN + building.buildingsPerTurn
                }
            case EntityType.CACAOTREE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CACAOTREE,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_CACAO_PER_TURN + building.cacaoPerTurn
                }
            case EntityType.RUM_TRUFFLE_CANNON:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_RUM_TRUFFLE_CANNON,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_ATTACKS_PER_TURN
                }
            case EntityType.XMAS_FACTORY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_XMAS_FACTORY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.SPYING_EASTER_BUNNY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_SPYING_EASTER_BUNNY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_SPYING_PER_TURN
                }
            case EntityType.CHOCOLATE_FOUNTAIN:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE
                }
            case EntityType.FRUIT_CANNON:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_FRUIT_CANNON,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_FRUIT_CANNON_ADVANTAGE
                }
            case EntityType.DONUT_FACTORY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_FACTORY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_DONUT_FACTORY_ADVANTAGE_PART + `${building.donutProbability * 100}%`
                }
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_PORTAL_RED_BLUE
                }
            case EntityType.DONUT_CREAM_WHITE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_CREAM_WHITE
                }
            case EntityType.DONUT_HEALTH_GREEN:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_HEALTH_GREEN
                }
            case EntityType.DONUT_STOP_PINK:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_STOP_PINK
                }
            case EntityType.DONUT_SURPRISE_YELLOW:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_SURPRISE_YELLOW
                }
            default: return { info: strings.TOOLTIP_BUILDING_INFO_UNKNOWN }
        }
    },
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: function (strings, attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return strings['TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];
            default: return strings.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: function (strings, attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return strings['TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];;
            default: return strings.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    ATTRIBUTE_NAME: function (strings, attribute) {
        switch (attribute) {
            case 'hp':
            case 'area':
            case 'buildingsPerTurn':
            case 'cacaoPerTurn':
            case 'attack':
            case 'fortune':
            case 'donutProbability':
            case 'donutTypes':
                return strings['ATTRIBUTE_NAME_' + attribute];
            default: return strings.ATTRIBUTE_NAME_UNKNOWN;
        }
    },
    WARNING_PLAYER_NOT_FOUND: function (strings, name) {
        return fmt(strings.WARNING_PLAYER_NOT_FOUND, { name: name });
    },
    SURRENDER_GAME_TEXT: function (strings, name, coins) {
        return fmt(strings.SURRENDER_GAME_TEXT, { name: name, coins: coins })
    },
    UPDATE_LEVEL_FAILED: function (strings, upgrade) {
        return upgrade ? strings.UPDATE_LEVEL_FAILED_UPGRADE : strings.UPDATE_LEVEL_FAILED_DOWNGRADE;
    },
    NOTIFICATION_UNLOCK_EXTENSION_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_EXTENSION_MESSAGE, { coins: coins });
    },
    NOTIFICATION_UNLOCK_BUNNY_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_BUNNY_MESSAGE, { coins: coins });
    },
    NOTIFICATION_UNLOCK_FOUNTAIN_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_FOUNTAIN_MESSAGE, { coins: coins });
    },
    PLAYER_NAME_GENERATED_BODY: function (strings, name) {
        return fmt(strings.PLAYER_NAME_GENERATED_BODY, { name: name });
    },
    COINS_FOR_NEXT_FEATURE_TITLE: function (strings, feature) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_TITLE, { feature: feature });
    },
    COINS_FOR_NEXT_FEATURE_BODY: function (strings, feature, missingScore) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_BODY, { feature: feature, missingScore: missingScore });
    },
    MULTIPLAYER_AUTOMATICALLY_LOSE: function (strings, hours, minutes) {
        return fmt(strings.MULTIPLAYER_AUTOMATICALLY_LOSE, { hours: hours, minutes: minutes });
    },
    MULTIPLAYER_AUTOMATICALLY_WIN: function (strings, hours, minutes) {
        return fmt(strings.MULTIPLAYER_AUTOMATICALLY_WIN, { hours: hours, minutes: minutes });
    },
    SERVER_NOTIFICATION_REMEMBER_TURN_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_REMEMBER_TURN_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_CHALLENGE_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_CHALLENGE_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_GAME_LOST_BODY: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_GAME_LOST_BODY, { name: name });
    },
    SERVER_NOTIFICATION_TURN_FINISHED_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_TURN_FINISHED_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_OPPONENT_SURENDERED_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_OPPONENT_SURENDERED_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE, { name: name });
    },
};

const predicateNames = Object.freeze(Object.keys(translationPredicates));

const translations = {
    ...strings,
    isPredicate: (predicateName) => {
        return predicateNames.includes(predicateName);
    },
    callPredicate: (language, predicateName, ...rest) => {
        if (translationPredicates[predicateName] === 'Undefined') {
            console.warn("Could not find predicate function with given key in translations: {}", predicateName);
            return "";
        } else {
            return translationPredicates[predicateName](translations[language], ...([].slice.call(rest, 0)));
        }
    }
}

const translationKeys = { ...strings[referenceLanguage], ...translationPredicates };
Object.keys(translationKeys).forEach(key => translationKeys[key] = key);
const translationRefKeys = Object.freeze(translationKeys);

class Translation {
    constructor() {
        this.currentLanguage = validLanguages[0];
    }

    isValid(language) {
        return validLanguages.includes(language);
    }
}

const translation = new Translation();

function setCurrentLanguage(language, onSuccess) {
    if (translation.isValid(language)) {
        translation.currentLanguage = language;
        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } else {
        console.error("invalid language " + language + " given. Current language " + translation.currentLanguage + " used.");
    }
}

function getCurrentLanguage() {
    return translation.currentLanguage;
}

function translate(key) {
    if (typeof key === 'undefined') {
        console.error("invalid translation key given");
        return '';
    } else {
        const currentTranslation = translations[translation.currentLanguage];
        if (typeof currentTranslation === 'undefined') {
            console.warn("translations data for current language " + translation.currentLanguage + " undefined. this is weired.");
            return '';
        } else {
            if (translations.isPredicate(key)) {
                return translations.callPredicate(translation.currentLanguage, key, ...([].slice.call(arguments, 1)));
            } else if (typeof currentTranslation[key] === 'string') {
                return currentTranslation[key];
            } else {
                console.warn("Undefined text key in current translation: {} {}", translation.currentLanguage, key);
                return '';
            }
        }
    }
}

module.exports.setCurrentLanguage = setCurrentLanguage;
module.exports.getCurrentLanguage = getCurrentLanguage;
module.exports.isValidLanguage = (language) => { return validLanguages.includes(language); }
module.exports.getDefaultLanguage = () => { return referenceLanguage; }
module.exports.translate = translate;
module.exports.translationKeys = translationRefKeys;

// Translations end

// Awards begin

const playerGameField = (game, playerIndex) => (typeof game === 'undefined' || typeof game.board === 'undefined' ||
    typeof game.players === 'undefined' || typeof game.players[playerIndex] === 'undefined' ||
    typeof game.board.fields[game.players[playerIndex].fieldIndex] === 'undefined' ||
    typeof game.board.fields[game.players[playerIndex].fieldIndex].grid === 'undefined') ? [] : game.board.fields[game.players[playerIndex].fieldIndex].grid;

const ui_awards = [
    {
        title: () => translate(translationRefKeys.AWARDS_NERD_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_NERD_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex) => {
            const trees = playerGameField(game, playerIndex)
                .filter(cell => containsEntity(cell, EntityType.CACAOTREE));
            return trees.length > 0 && trees.every(cell => cell.type === BoardCellTypes.WHITE);
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_UNUSED_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_UNUSED_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex) => {
            const player = game.players[playerIndex];
            return player.attacksPerTurn[AttackType.BUNNY] > 0 && player.statistics.espionages === 0;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_RUSHHOUR_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_RUSHHOUR_SUBTITLE),
        coins: 100,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            return actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length <= 5;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_MINIMALIST_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_MINIMALIST_SUBTITLE),
        coins: 150,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON).length === 1;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_ONEHITWONDER_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_ONEHITWONDER_SUBTITLE),
        coins: 1800,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attack = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack);
            if (typeof attack !== 'undefined') {
                const entities = attack.payload.target.occupiedBy.map(entity => entity.type);
                return entities.includes(EntityType.FACTORY) && entities.includes(EntityType.CREAM);
            }
            return false;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_SPY_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_SPY_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
            return attacks.length >= 4;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_SECRETAGENT_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_SECRETAGENT_SUBTITLE),
        coins: 500,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
            return attacks.length >= 8;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_GROUNDHOGDAY_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_GROUNDHOGDAY_SUBTITLE),
        coins: 100,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 4;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_REPEATOFFENDER_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_REPEATOFFENDER_SUBTITLE),
        coins: 800,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 8;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_FIRSTCOMEFIRSTSERVED_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_FIRSTCOMEFIRSTSERVED_SUBTITLE),
        coins: 200,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const opponent = game.players[1 - playerIndex];
            const playerAttack = actions.findIndex(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack);
            const opponentAttack = actions.findIndex(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack);
            const firstMove = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseStart);
            return (opponentAttack === -1 || playerAttack < opponentAttack) && typeof firstMove !== 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_HINDSIGHT_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_HINDSIGHT_SUBTITLE),
        coins: 1000,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const lastAttack = actions.map(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack).lastIndexOf(true);
            if (lastAttack !== -1) {
                const entities = actions[lastAttack].payload.target.occupiedBy.map(entity => entity.type);
                return entities.includes(EntityType.CREAM) && entities.includes(EntityType.FACTORY) && !playerGameField(game, 1 - playerIndex).some(cell => containsEntity(cell, EntityType.CREAM));
            } else {
                return false;
            }
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_MOLTEN_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_MOLTEN_SUBTITLE),
        coins: 300,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const chocolateAttacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.HOT_CHOCOLATE);
            if (chocolateAttacks.length > 0) {
                return chocolateAttacks.some(attack => attack.payload.target.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0)
            } else {
                return false;
            }
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_OMG_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_OMG_SUBTITLE),
        coins: 2000,
        isFulfilled: (game, playerIndex) => {
            const board = playerGameField(game, 1 - playerIndex);
            return board.filter(cell => cell.molten).length >= 30;
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_HORCRUXES_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_HORCRUXES_SUBTITLE),
        coins: 1200,
        isFulfilled: (game, playerIndex) => {
            const board = playerGameField(game, playerIndex);
            return board.filter(cell => containsEntity(cell, EntityType.FACTORY_EXTENSION)).length > 4;
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_PICKY_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_PICKY_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseField);
            return typeof chooseAction !== 'undefined';
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_FIRST_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_FIRST_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseStart);
            return typeof chooseAction !== 'undefined';
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_GREEDY_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_GREEDY_SUBTITLE),
        coins: 10,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            if (typeof buildAction !== 'undefined') {
                return buildAction.payload.target.type === BoardCellTypes.BLACK;
            } else {
                return false;
            }
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_STRATEGIST_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_STRATEGIST_SUBTITLE),
        coins: 10,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            if (typeof buildAction !== 'undefined') {
                return buildAction.payload.target.type !== BoardCellTypes.BLACK;
            } else {
                return false;
            }
        }
    },
    {
        title: () => translate(translationRefKeys.AWARDS_WINNER_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_WINNER_SUBTITLE),
        coins: 25,
        isFulfilled: () => true
    }, {
        title: () => translate(translationRefKeys.AWARDS_RANDOM_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_RANDOM_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === opponent.id && [GameActionTypes.chooseStart, GameActionTypes.chooseField].includes(action.type));
            return typeof chooseAction !== 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_MULTIPLAYERBONUS_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_MULTIPLAYERBONUS_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex) => {
            const opponent = game.players[1 - playerIndex];
            return opponent.type === PlayerType.HUMAN;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_GOLDENMULTIPLAYERBONUS_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_GOLDENMULTIPLAYERBONUS_SUBTITLE),
        coins: 200,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const player = game.players[playerIndex];
            return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 5;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_DIAMONDMULTIPLAYERBONUS_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_DIAMONDMULTIPLAYERBONUS_SUBTITLE),
        coins: 500,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const player = game.players[playerIndex];
            return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 15;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_CONCRETEJUNGLE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_CONCRETEJUNGLE_SUBTITLE),
        coins: 600,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildTreeAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return typeof buildTreeAction === 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_GREENSPOT_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_GREENSPOT_SUBTITLE),
        coins: 20,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 1;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_RANDOMFOREST_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_RANDOMFOREST_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 5;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_RAINFOREST_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_RAINFOREST_SUBTITLE),
        coins: 1000,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 15;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_SMALLOFFENSIVE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_SMALLOFFENSIVE_SUBTITLE),
        coins: 30,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 2;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_OFFENSIVE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_OFFENSIVE_SUBTITLE),
        coins: 70,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 5;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_MAJOROFFENSIVE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_MAJOROFFENSIVE_SUBTITLE),
        coins: 1500,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 20;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_UNBREAKABLE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_UNBREAKABLE_SUBTITLE),
        coins: 200,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
            return !attacks.some(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage));
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_MRGLASS_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_MRGLASS_SUBTITLE),
        coins: 600,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
            return attacks.filter(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage)).length >= 20;
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_OUVERT_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_OUVERT_SUBTITLE),
        coins: 800,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            if (typeof buildAction !== 'undefined') {
                return !containsEntity(buildAction.payload.target, EntityType.CREAM);
            } else {
                return false;
            }
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_SETTLER_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_SETTLER_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const factoryBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            const treeBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            const cannonBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return typeof factoryBuildAction !== 'undefined' && typeof treeBuildAction !== 'undefined' && typeof cannonBuildAction !== 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_UPGRADE_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_UPGRADE_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const fruitCannonBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FRUIT_CANNON);
            return typeof fruitCannonBuildAction !== 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_REFILLED_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_REFILLED_SUBTITLE),
        coins: 30,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const creamBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CREAM);
            return typeof creamBuildAction !== 'undefined';
        }
    }, {
        title: () => translate(translationRefKeys.AWARDS_PERSONALCONCERN_TITLE),
        subtitle: () => translate(translationRefKeys.AWARDS_PERSONALCONCERN_SUBTITLE),
        coins: 1500,
        isFulfilled: (game, playerIndex) => {
            const board = playerGameField(game, playerIndex);
            return board.every(cell => containsEntity(cell, EntityType.CREAM));
        }
    },/* { 
    title: 'Easter egg', 
    subtitle: 'You applied the bunny to a creamless area', 
    coins: 250,
    isFulfilled: (game, playerIndex, actions) => {
      const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
      if (attacks.length > 0) {
        return attacks.some(attack => //TODO NEED TO LOG AREA FOR BUNNY ATTACK)
      } else {
        return false;
      }
    }
  }
  { 
    title: 'Easy come, easy go', 
    subtitle: 'Your brand-new ballista was destroyed before you could use it', 
    coins: 300,
    isFulfilled: (game, playerIndex, actions) => {
      return TODO: NEED TO LOG BUNNY CAUGHT EVENTS
    }
  },
  { title: 'Cornered', subtitle: 'Your opponent has surrendered', coins: 20 },
  { title: 'Easy Goal', subtitle: 'Your opponent has surrendered or waited too long without making a move', coins: 1 },
  { title: 'Benefactor', subtitle: '5 or more cannons were unused when the attack phase was skipped', coins: 300 },
  { title: 'Christmas elf', subtitle: 'Caught at least 4 bunnies', coins: 400 },
  { title: 'Best christmas elf', subtitle: 'Caught at least 8 bunnies', coins: 800 },
  { title: 'It\'s gettin hot in here', subtitle: 'Owned at least one ballista', coins: 200 },
  { title: 'So hot', subtitle: 'Owned at least 4 ballista', coins: 600 },
  { title: 'Take off all your clothes', subtitle: 'Owned at least 8 ballista', coins: 1000 },*/
]

const computeAwards = (game, playerIndex, actions) => {
    const sortByCoinsAsc = (a, b) => a.coins < b.coins ? -1 : 1;
    const sortByCoinsDesc = (a, b) => a.coins < b.coins ? 1 : -1;
    const player = game.players[playerIndex];
    if (game.winners.some(winner => winner.id === player.id)) {
        let fulfilled = ui_awards.filter(award => award.isFulfilled(game, playerIndex, actions));
        fulfilled = fulfilled.sort(sortByCoinsDesc).splice(0, 5).sort(sortByCoinsAsc);
        return fulfilled;
    } else {
        return [];
    }
}

module.exports.computeAwards = computeAwards;

// Awards end