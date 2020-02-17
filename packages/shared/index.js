const uuidv4 = require('uuid/v4');

const BoardCellTypes = Object.freeze({
  WHITE: 'BoardCellTypes.WHITE',
  BROWN: 'BoardCellTypes.BROWN',
  BLACK: 'BoardCellTypes.BLACK'
});

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

const MultiplayerGameSessionState = Object.freeze({
  UNINITIALIZED: 'MultiplayerGameSessionState.Uninitialized',
  PENDING: 'MultiplayerGameSessionState.Pending',
  CREATED: 'MultiplayerGameSessionState.Created',
  RUNNING: 'MultiplayerGameSessionState.Running',
  FINISHED: 'MultiplayerGameSessionState.Finished'
});

const EmptyPlayerStats = Object.freeze({
  username: 'Chocnonymous',
  coins: 0,
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
const calculateDivisor = (start, end) => (finalLevel * Math.log2(2))/Math.log2((end - finalLevel)/start);
const growFunction = (level, start, end) => Math.round(level + start * Math.pow(2, level/calculateDivisor(start,end)));

const EntityDescriptors = Object.freeze(new Map([
  [EntityType.CREAM, () => ({
    level: { max: 1 },
    hp: 1,
    area: 1,
    costs: 10
  })],
  [EntityType.FACTORY, level => ({
    hp: growFunction(level, 48, 1204),
    cacaoPerTurn: growFunction(level, 15, 490),
    buildingsPerTurn: (() => {
      if (level > 19) {
        return 5;
      } else if (level > 14) {
        return 4;
      } else if (level > 9) {
        return 3;
      } else if (level > 4) {
        return 2;
      } else {
        return 1;
      }
    })(),
    costs: 0,
    coins: growFunction(level, 102, 53201)
  })],
  [EntityType.FACTORY_EXTENSION, level => ({
    hp: growFunction(level, 48, 1204),
    buildingsPerTurn: (() => {
      if (level > 19) {
        return 5;
      } else if (level > 14) {
        return 4;
      } else if (level > 9) {
        return 3;
      } else if (level > 4) {
        return 2;
      } else {
        return 1;
      }
    })(),
    costs: growFunction(level, 120, 2300),
    coins: growFunction(level, 71, 36201)
  })],
  [EntityType.CACAOTREE, level => ({
    hp: growFunction(level, 12, 502),
    cacaoPerTurn: growFunction(level, 30, 980),
    costs: growFunction(level, 20, 306),
    coins: growFunction(level, 24, 12404)
  })],
  [EntityType.RUM_TRUFFLE_CANNON, level => ({
    hp: growFunction(level, 33, 840),
    attack: growFunction(level, 27, 926),
    costs: growFunction(level, 40, 1012),
    coins: growFunction(level, 55, 27043),
    attackType: AttackType.TRUFFLE,
    attacksPerTurn: 1
  })],
  [EntityType.FRUIT_CANNON, level => ({
    hp: growFunction(level, 33, 560),
    attack: growFunction(level, 27, 1486),
    costs: growFunction(level, 40, 755),
    coins: growFunction(level, 55, 27043),
    attackType: AttackType.FRUIT,
    attacksPerTurn: 1
  })],
  [EntityType.SPYING_EASTER_BUNNY, level => ({
    hp: growFunction(level, 46, 2198),
    area: 3,
    costs: growFunction(level, 120, 3604),
    coins: growFunction(level, 43, 19024),
    attackType: AttackType.BUNNY,
    attacksPerTurn: 1      
  })],
  [EntityType.XMAS_FACTORY, level => ({
    hp: growFunction(level, 46, 5012),
    area: 3,
    costs: growFunction(level, 80, 2663),
    coins: growFunction(level, 32, 16950)
  })],
  [EntityType.HOT_CHOCOLATE_BALLISTA, level => ({
    hp: growFunction(level, 124, 4320),
    costs: 0,
    coins: growFunction(level, 68, 32244),
    attackType: AttackType.HOT_CHOCOLATE,
    attacksPerTurn: 1
  })],
  [EntityType.CHOCOLATE_FOUNTAIN, level => ({
    hp: growFunction(level, 230, 32012),
    costs: growFunction(level, 120, 3306),
    coins: growFunction(level, 46, 20244)
  })],
  [EntityType.DONUT_FACTORY, level => ({
    hp: growFunction(level, 32, 4201),
    donutProbability: (() => {
      if (level > 19) {
        return 0.9;
      } else if (level > 14) {
        return 0.7;
      } else if (level > 9) {
        return 0.5;
      } else if (level > 4) {
        return 0.4;
      } else {
        return 0.3;
      }
    })(),
    donutTypes: (() => {
      if (level > 19) {
        return 5;
      } else if (level > 14) {
        return 4;
      } else if (level > 9) {
        return 3;
      } else if (level > 4) {
        return 2;
      } else {
        return 1;
      }
    })(),
    costs: growFunction(level, 240, 7208),
    coins: growFunction(level, 44, 20100)
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
      max: {hp: 1}
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
    entity.max = { hp : descriptor.hp };
    return {...entity, ...descriptor};
  }
}

function getEntityDescriptor(entityType, level) {
  if (isDonut(entityType)) {
    return {
      type: entityType,
      hp: 1,
      costs: 0,
      coins: 0,
      max: {hp: 1}
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
  static generate(size, seed) {
    let playerFields = [];
    for (let player = 0; player < 2; player++) {
      let field = { grid: [] };
      for (let row = 0; row < size.rows; row++) {
        for (let col = 0; col < size.cols; col++) {
          let fieldtype = Math.floor(Math.random() * 6);
          let creamed = Math.random() < 0.7
          let cellType = BoardCellTypes.BROWN;
          let previewStyle = 'brown';
          
          if (fieldtype === 0) {
            cellType = BoardCellTypes.WHITE;
            previewStyle = 'white';
          } else if (fieldtype === 1) {
            cellType = BoardCellTypes.BLACK;
            previewStyle = 'black';
          }
          
          let cream = createEntity(EntityType.CREAM);
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
  VIOLET_BEAUREGARDE: 'PlayerType.VIOLET_BEAUREGARDE'
});

function createPlayer(name, type, level) {
  if (typeof level === 'undefined') {
    level = EmptyPlayerStats.level;
  }

  let player = {
    name: name,
    level: level,
    type: type,
    id: uuidv4(),
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

function playerHasHarmfulAttacksPerTurn(player, playerGrid, otherPlayerGrid) {
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

function currentPlayer(gameState) {
  return gameState.players[gameState.currentPlayerIndex];
}

function containsEntity(cell, entityType) {
  return cell.occupiedBy.map(entity => entity.type).includes(entityType)
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

function currentPlayerField(gameState) {
  return gameState.board.fields[gameState.players[gameState.currentPlayerIndex].fieldIndex];
}

function otherPlayerField(gameState) {
  return gameState.board.fields[gameState.players[1 - gameState.currentPlayerIndex].fieldIndex];
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

function prepareBuildPhase(gameState) {
  gameState.currentPlayerIndex = 1 - gameState.currentPlayerIndex;
  currentPlayer(gameState).cacao += currentPlayer(gameState).cacaoPerTurn;
  currentPlayer(gameState).attacks[AttackType.TRUFFLE] = currentPlayer(gameState).attacksPerTurn[AttackType.TRUFFLE];
  currentPlayer(gameState).attacks[AttackType.FRUIT] = currentPlayer(gameState).attacksPerTurn[AttackType.FRUIT];
  currentPlayer(gameState).attacks[AttackType.HOT_CHOCOLATE] = currentPlayer(gameState).attacksPerTurn[AttackType.HOT_CHOCOLATE];
  currentPlayer(gameState).attacks[AttackType.BUNNY] = currentPlayer(gameState).attacksPerTurn[AttackType.BUNNY];
  currentPlayer(gameState).buildings = currentPlayer(gameState).buildingsPerTurn;
  
  let donutProbability = Math.random();
  
  if (typeof currentPlayer(gameState).donuts !== 'undefined' && donutProbability < currentPlayer(gameState).donutProbability && currentPlayer(gameState).donuts.length === 0) {
      let donutFactory = getEntityDescriptor(EntityType.DONUT_FACTORY, currentPlayer(gameState).level);
      let donutType = Math.floor(Math.random() * donutFactory.donutTypes) + 1;
      let donuts = [createEntity(EntityType.DONUT_PORTAL_BLUE), createEntity(EntityType.DONUT_PORTAL_RED)]
      if (donutType === 2) {
          donuts = [createEntity(EntityType.DONUT_HEALTH_GREEN)]
      } else if (donutType === 3) {
          donuts = [createEntity(EntityType.DONUT_SURPRISE_YELLOW)]
      } else if (donutType === 4) {
          donuts = [createEntity(EntityType.DONUT_STOP_PINK)]
      } else if (donutType === 5) {
          donuts = [createEntity(EntityType.DONUT_CREAM_WHITE)]
      }
      currentPlayer(gameState).donuts = donuts;
  }

  if (currentPlayer(gameState).buildings > 0 && currentPlayer(gameState).cacao >= getCheapest(currentPlayer(gameState).level).costs) {
      gameState.state = GameStateTypes.BUILD_PHASE;
  } else {
      gameState.state = GameStateTypes.ATTACK_PHASE;
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
  if (action.payload[1].type === PlayerType.AUGUSTUS_GLOOP) {
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

const chooseStartReduction = (state, action) => {
  state.game.state = GameStateTypes.CHOOSE_FIELD;
  state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
}

const finishTurnReduction = (state, action) => {
  if (state.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
      state.game.currentPlayerIndex = 1 - state.game.currentPlayerIndex;
      state.game.state = GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
  } else if (state.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT ||
      state.game.state === GameStateTypes.ATTACK_PHASE ||
      state.game.state === GameStateTypes.BUILD_PHASE) {
      prepareBuildPhase(state.game);
  }
}

const finishBuildPhaseReduction = (state, action) => {
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

  const testAndTriggerTraps = (force=false) => {
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

              if ((!containsEntity(attackedCell, EntityType.CHOCOLATE_FOUNTAIN) && containsEntity(redDonutCell, EntityType.CHOCOLATE_FOUNTAIN)) ||
                  (containsEntity(attackedCell, EntityType.CHOCOLATE_FOUNTAIN) && !containsEntity(redDonutCell, EntityType.CHOCOLATE_FOUNTAIN))) {
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

              attackedCell.occupiedBy.forEach(entity => entity.position = { row: attackedCell.row, col: attackedCell.col});
              redDonutCell.occupiedBy.forEach(entity => entity.position = { row: redDonutCell.row, col: redDonutCell.col});

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
          prepareBuildPhase(state.game);
      }

      let yellowDonut = attackedCell.occupiedBy.find(entity => entity.type === EntityType.DONUT_SURPRISE_YELLOW);
      if (typeof yellowDonut !== 'undefined') {
          console.log(`HIT YELLOW DONUT @ [${yellowDonut.position.row},${yellowDonut.position.col}]`);
          attackedCell.occupiedBy = attackedCell.occupiedBy.filter(entity => entity.type !== EntityType.DONUT_SURPRISE_YELLOW);
          otherPlayer(state.game).activeDonuts = otherPlayer(state.game).activeDonuts.filter(donut => donut.id !== yellowDonut.id);
          let donutType = Math.round(Math.random() * 2)

          if (donutType === 0) {
              prepareBuildPhase(state.game);
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
              let patch = getCellPatch5x5({ row: action.payload.row, col: action.payload.col }, state.game.board, otherPlayerField(state.game).grid);
              patch.forEach((cell) => {
                  cell.occupiedBy.forEach(entity => {
                      entity.hp = getEntityDescriptor(entity.type, otherPlayer(state.game).level).max.hp;
                  });
              });
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

const finishGameReduction = (state, action) => {
  state.game = undefined;
}

/* rules */

class Rules {
  static currentPlayer(gameState) {
      try {
          return gameState.players[gameState.currentPlayerIndex];
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

  static playerBoardCell(gameState, playerIndex, cellIdx) {
      return gameState.board.fields[gameState.players[playerIndex].fieldIndex].grid[cellIdx.row * gameState.board.size.cols + cellIdx.col];
  }

  static currentPlayerBoardCell(gameState, cellIdx) {
      return this.playerBoardCell(gameState, gameState.currentPlayerIndex, cellIdx);
  }

  static currentPlayerField(gameState) {
      return gameState.board.fields[gameState.players[gameState.currentPlayerIndex].fieldIndex];
  }

  static otherPlayerBoardCell(gameState, cellIdx) {
      return this.playerBoardCell(gameState, 1 - gameState.currentPlayerIndex, cellIdx);
  }

  static getCellNeighbors(cellIdx, gameState) {
      let neighbors = [];

      const idxLeftOf = { row: cellIdx.row, col: cellIdx.col - 1 };
      if (idxLeftOf.col >= 0) {
          neighbors.push(this.currentPlayerBoardCell(gameState, idxLeftOf));
      }

      const idxRightOf = { row: cellIdx.row, col: cellIdx.col + 1 };
      if (idxRightOf.col < gameState.board.size.cols) {
          neighbors.push(this.currentPlayerBoardCell(gameState, idxRightOf));
      }

      const idxTopOf = { row: cellIdx.row - 1, col: cellIdx.col };
      if (idxTopOf.row >= 0) {
          neighbors.push(this.currentPlayerBoardCell(gameState, idxTopOf));
      }

      const idxBelowOf = { row: cellIdx.row + 1, col: cellIdx.col };
      if (idxBelowOf.row < gameState.board.size.rows) {
          neighbors.push(this.currentPlayerBoardCell(gameState, idxBelowOf));
      }

      return neighbors;
  }

  static canBuildFactoryExtensionOnCell(cellIdx, gameState) {
      return this.getCellNeighbors(cellIdx, gameState).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY)).length > 0;
  }

  static canBuildOnCell(cellIdx, entityType, gameState) {
      let cell = this.currentPlayerBoardCell(gameState, cellIdx);
      if (entityType === EntityType.SPYING_EASTER_BUNNY && this.currentPlayerField(gameState).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length > 0) {
          return new BuildNotPossibleError('Can only build one spying easter bunny.');
      } else if (entityType === EntityType.DONUT_FACTORY && this.currentPlayerField(gameState).grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.DONUT_FACTORY)).length > 0) {
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
              (entityType === EntityType.FACTORY_EXTENSION && ((cell.occupiedBy.length === 1 && cell.occupiedBy[0].type === EntityType.CREAM) || cell.occupiedBy.length === 0) && this.canBuildFactoryExtensionOnCell(cellIdx, gameState)) ||
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
   * @param {state} gameState 
   * 
   * returns the player that won the game. otherwise returns undefined
   */
  static determineWinner(gameState) {
      let potentialWinners = [];
      for (var playerIdx = 0; playerIdx < 2; ++playerIdx) {
          const player = gameState.players[playerIdx];
          const playerCanAttack = playerHasHarmfulAttacksPerTurn(player, gameState.board.fields[gameState.players[1 - playerIdx].fieldIndex].grid);
          if ((player.buildingsPerTurn === 0 && !playerCanAttack) ||
              (!playerCanAttack && player.cacaoPerTurn === 0 && player.cacao < getEntityDescriptor(EntityType.CACAOTREE, player.level).costs)) {
              let winner = Object.assign({ idx: 1 - playerIdx }, gameState.players[1 - playerIdx]);
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
              const player0Trees = gameState.board.fields[potentialWinners[0].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
              const player1Trees = gameState.board.fields[potentialWinners[1].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
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

  static issuerIsInvalid(action, state) {
      if (IssuerRelevantActions.includes(action.type)) {
          if (typeof action.payload === 'undefined' ||
              typeof action.payload.issuer === 'undefined' ||
              action.payload.issuer !== this.currentPlayer(state).id) {
              return true;
          }
      }
      return false;
  }

  static isActionValid(action, state) {
      if (!(this.isGameAction(action))) {
          return new ActionValidationError(action);
      }

      let currentState = typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state;
      if (Rules.issuerIsInvalid(action, state.gameplay.game) && action.type !== GameActionTypes.endGame) {
          let issuerId;
          if (typeof action.payload !== 'undefined') {
              issuerId = action.payload.issuer;
          }
          return new InvalidActionIssuerError(action, issuerId, this.currentPlayer(state.gameplay.game).id);
      }

      if (typeof currentState !== 'undefined') {
          if (!state.gameplay.game.isRunning && action.type !== GameActionTypes.finishGame) {
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
          } else if (this.currentPlayer(state.gameplay.game).donuts.length > 0 && isDonut(action.payload.building.type)) {
              return this.canBuildOnCell(action.payload.building.position, action.payload.building.type, state.gameplay.game);
          } else if ((this.currentPlayer(state.gameplay.game).buildings === 0 || (this.currentPlayer(state.gameplay.game).buildingsPerTurn === 0 && action.payload.building.type === EntityType.FACTORY_EXTENSION)) &&
              action.payload.building.type !== EntityType.FACTORY) {
              return new NoBuildingsLeftError();
          } else if (this.currentPlayer(state.gameplay.game).cacao < action.payload.building.costs) {
              return new NoCacaoLeftError();
          } else {
              return this.canBuildOnCell(action.payload.building.position, action.payload.building.type, state.gameplay.game);
          }
      } else if (action.type === GameActionTypes.attack) {
          if (this.currentPlayer(state.gameplay.game).attacks[action.payload.attackType] === 0) {
              return new NoAttacksLeftError();
          } else if (this.otherPlayerBoardCell(state.gameplay.game, action.payload).occupiedBy.length === 0 &&
              action.payload.attackType !== AttackType.BUNNY && action.payload.attackType !== AttackType.HOT_CHOCOLATE) {
              return new TargetEmptyError();
          } else if (AttackType.HOT_CHOCOLATE && this.otherPlayerBoardCell(state.gameplay.game, action.payload).molten) {
              return new AlreadyMolten();
          } else {
              return true;
          }
      } else {
          return new ActionValidationError(action);
      }
  }
}

module.exports.BoardCellTypes = BoardCellTypes;
module.exports.EntityType =  EntityType;
module.exports.AttackType = AttackType
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

class BattlechocError extends Error {};

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