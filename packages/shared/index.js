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

export { BoardCellTypes, EntityType, AttackType, isDonut, createEntity, getEntityDescriptor, getCheapest, EntityDescriptors, finalLevel, MultiplayerGameSessionState, EmptyPlayerStats, Board };
export { PlayerType, createPlayer, playerHasAttacksPerTurn, playerHasHarmfulAttacksPerTurn, playerHasAttacks, NonPlayerCharacter };
export * from './errors';