import { EntityType, BoardCellTypes, AttackType, GameActionTypes, PlayerType, NoAttacksLeftError } from "battlechoc-shared-functions";

const playerGameField = (game, playerIndex) => game.board.fields[game.players[playerIndex].fieldIndex].grid;
const containsEntity = (cell, entityType) => {
  return cell.occupiedBy.map(entity => entity.type).includes(entityType)
}

const awards = [
  { 
    title: 'Nerd', 
    subtitle: 'All trees built on white fields', 
    coins: 50,
    isFulfilled: (game, playerIndex) => playerGameField(game, playerIndex)
      .filter(cell => containsEntity(cell, EntityType.CACAOTREE))
      .every(cell => cell.type === BoardCellTypes.WHITE)
  }, { 
    title: 'Unused', 
    subtitle: 'You had a bunny but you didn\'t used it', 
    coins: 50,
    isFulfilled: (game, playerIndex) => {
      const player = game.players[playerIndex];
      return player.attacksPerTurn[AttackType.BUNNY] > 0 && player.statistics.espionages === 0;
    }
  }, { 
    title: 'Rushhour', 
    subtitle: 'Won within the first 5 turns', 
    coins: 100,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      return actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length <= 5;
    }
  }, { 
    title: 'Minimalist', 
    subtitle: 'Only one cannon built', 
    coins: 150,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
      return buildActions.filter(action => action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON).length === 1;
    }
  }, { 
    title: 'One-Hit-Wonder', 
    subtitle: 'The first attack hits the hidden factory', 
    coins: 1800,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const attack = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack);
      const entities = attack.payload.target.occupiedBy.map(entity => entity.type);
      return entities.includes(EntityType.FACTORY) && entities.includes(EntityType.CREAM);
    }    
  }, { 
    title: 'Spy', 
    subtitle: 'Used the spying easter bunny at least 4 times', 
    coins: 50,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
      return attacks.length >= 4;
    }
  }, { 
    title: 'Secret Agent', 
    subtitle: 'Used the spying easter bunny at least 8 times', 
    coins: 500,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
      return attacks.length >= 8;
    }      
  }, { 
    title: 'Groundhog Day', 
    subtitle: 'Rebuild the spying easter bunny at least 4 times', 
    coins: 100,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
      return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 4;
    }
  }, { 
    title: 'Repeat offender', 
    subtitle: 'Rebuild the spying easter bunny at least 8 times', 
    coins: 800,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
      return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 8;
    } 
  }, { 
    title: 'First come, first served', 
    subtitle: 'First move chosen and first attack made', 
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
    title: 'Hindsight is 20/20', 
    subtitle: 'On the last creamed field was the factory', 
    coins: 1000,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const lastAttack = actions.map(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack).lastIndexOf(true);
      if (lastAttack !== -1) {
        const entities = actions[lastAttack].payload.target.occupiedBy.map(entity => entity.type);
        return entities.includes(EntityType.CREAM) && entities.includes(EntityType.FACTORY);
      } else {
        return false;
      }
    }
  }, { 
    title: 'Molten', 
    subtitle: 'You hit an entity (except cream) with the ballista', 
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
    title: 'OMG', 
    subtitle: '30 or more fields were melted down', 
    coins: 2000,
    isFulfilled: (game, playerIndex) => {
      const board = playerGameField(game, 1 - playerIndex);
      return board.filter(cell => cell.molten).length >= 30; 
    }
  },
  { 
    title: 'Horcruxes', 
    subtitle: 'Own more than 4 factory extensions', 
    coins: 1200,
    isFulfilled: (game, playerIndex) => {
      const board = playerGameField(game, playerIndex);
      return board.filter(cell => containsEntity(cell, EntityType.FACTORY_EXTENSION)).length >= 4; 
    }
  },
  { 
    title: 'Picky', 
    subtitle: 'You have chosen a game field', 
    coins: 5,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseField);
      return typeof chooseAction !== 'undefined';
    } 
  },
  { 
    title: 'First!', 
    subtitle: 'You chose the first turn', 
    coins: 5,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseStart);
      return typeof chooseAction !== 'undefined';
    } 
  },
  { 
    title: 'Greedy', 
    subtitle: 'You built the factory on a black field', 
    coins: 10,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
      return buildAction.payload.target.type === BoardCellTypes.BLACK;
    }
  },
  { 
    title: 'Strategist', 
    subtitle: 'You didn\'t built the factory on a black field', 
    coins: 10,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
      return buildAction.payload.target.type !== BoardCellTypes.BLACK;
    }
  },
  { 
    title: 'Winner', 
    subtitle: 'You won the game', 
    coins: 25,
    isFulfilled: () => true
  }, { 
    title: 'Random', 
    subtitle: 'The opponent was allowed to choose', 
    coins: 5,
    isFulfilled: (game, playerIndex, actions) => {
      const opponent = game.players[1 - playerIndex];
      const chooseAction = actions.find(action => action.payload.issuer === opponent.id && [GameActionTypes.chooseStart, GameActionTypes.chooseField].includes(action.type));
      return typeof chooseAction !== 'undefined';
    }    
  }, { 
    title: 'Multiplayer bonus', 
    subtitle: 'It was a multiplayer game', 
    coins: 5,
    isFulfilled: (game, playerIndex) => {
      const opponent = game.players[1 - playerIndex];
      return opponent.type === PlayerType.HUMAN;
    }    
  }, { 
    title: 'Golden multiplayer bonus', 
    subtitle: 'It was a multiplayer game with at least 5 turns', 
    coins: 200,
    isFulfilled: (game, playerIndex) => {
      const opponent = game.players[1 - playerIndex];
      const player = game.players[playerIndex];
      return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 5;
    }
  }, { 
    title: 'Diamond multiplayer bonus', 
    subtitle: 'It was a multiplayer game with at least 15 turns', 
    coins: 500,
    isFulfilled: (game, playerIndex) => {
      const opponent = game.players[1 - playerIndex];
      const player = game.players[playerIndex];
      return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 15;
    } 
  }, { 
    title: 'Concrete jungle', 
    subtitle: 'Won without building a tree just cannons', 
    coins: 600,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
      return typeof buildAction === 'undefined';
    } 
  }, { 
    title: 'A green spot', 
    subtitle: 'Won with building at least 1 tree', 
    coins: 20,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
      return buildActions.length >= 1;
    } 
  }, { 
    title: 'Random forest', 
    subtitle: 'Won with building at least 5 trees', 
    coins: 50,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
      return buildActions.length >= 5;
    } 
  }, { 
    title: 'Rainforest', 
    subtitle: 'Won with building at least 15 trees', 
    coins: 1000,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
      return buildActions.length >= 15;
    } 
  }, { 
    title: 'Small Offensive', 
    subtitle: 'Won with building at least 2 cannons', 
    coins: 30,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
      return buildActions.length >= 2;
    } 
  }, { 
    title: 'Offensive', 
    subtitle: 'Won with building at least 5 cannons', 
    coins: 70,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
      return buildActions.length >= 5;
    } 
  }, { 
    title: 'Major offensive', 
    subtitle: 'Won with building at least 20 cannons', 
    coins: 1500,
    isFulfilled: (game, playerIndex, actions) => {
      const player = game.players[playerIndex];
      const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
      return buildActions.length >= 20;
    }
  }, { 
    title: 'Unbreakable', 
    subtitle: 'No entity lost', 
    coins: 200,
    isFulfilled: (game, playerIndex) => {
      const opponent = game.players[1 - playerIndex];
      const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
      return !attacks.some(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage ));
    } 
  }, { 
    title: 'Mr. Glass', 
    subtitle: 'You\'ve lost more than 20 entities', 
    coins: 600,
    isFulfilled: (game, playerIndex) => {
      const opponent = game.players[1 - playerIndex];
      const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
      return attacks.filter(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage )).length >= 20;
    } 
  }, { 
    title: 'Cards on the table', 
    subtitle: 'The factory was built on a field without cream', 
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
  }/*,
  { title: 'Settler', subtitle: 'Built a factory, a tree and a cannon', coins: 50 },
  { title: 'Upgrade', subtitle: 'Built at least one fruit cannon', coins: 50 },
  { title: 'Refilled', subtitle: 'Built at least one cream', coins: 30 },
  { title: 'Improved', subtitle: 'Won with more cream than you started', coins: 400},
  { title: 'Unchanged', subtitle: 'Finished with the same amount of cream as you started', coins: 30},
  { title: 'Personal concern', subtitle: 'The entire game field is filled with cream', coins: 1000},
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
  { title: 'Take off all your clothes', subtitle: 'Owned at least 8 ballista', coins: 1000 },
  { title: 'Easter egg', subtitle: 'You applied the bunny to a creamless area', coins: 250 },*/
]

const computeAwards = (game, playerIndex, actions) => {
  const sortByCoinsAsc = (a, b) => a.coins < b.coins ? -1 : 1;
  const sortByCoinsDesc = (a, b) => a.coins < b.coins ? 1 : -1;
  const player = game.players[playerIndex];
  if (game.winners.some(winner => winner.id === player.id)) {
    let fulfilled = awards.filter(award => award.isFulfilled(game, playerIndex, actions));
    console.log(fulfilled)
    fulfilled = fulfilled.sort(sortByCoinsDesc).splice(0, 5).sort(sortByCoinsAsc);
    console.log(fulfilled)
    return fulfilled;
  } else {
    return [];
  }
}

export default computeAwards;