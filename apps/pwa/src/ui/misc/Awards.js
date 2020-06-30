import { EntityType, BoardCellTypes, AttackType, GameActionTypes, PlayerType } from "battlechoc-shared-functions";
import { translate as t, keys as tr } from '../misc';

const playerGameField = (game, playerIndex) => game.board.fields[game.players[playerIndex].fieldIndex].grid;
const containsEntity = (cell, entityType) => {
    return cell.occupiedBy.map(entity => entity.type).includes(entityType)
}

const awards = [
    {
        title: t(tr.AWARDS_NERD_TITLE),
        subtitle: t(tr.AWARDS_NERD_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex) => playerGameField(game, playerIndex)
            .filter(cell => containsEntity(cell, EntityType.CACAOTREE))
            .every(cell => cell.type === BoardCellTypes.WHITE)
    }, {
        title: t(tr.AWARDS_UNUSED_TITLE),
        subtitle: t(tr.AWARDS_UNUSED_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex) => {
            const player = game.players[playerIndex];
            return player.attacksPerTurn[AttackType.BUNNY] > 0 && player.statistics.espionages === 0;
        }
    }, {
        title: t(tr.AWARDS_RUSHHOUR_TITLE),
        subtitle: t(tr.AWARDS_RUSHHOUR_SUBTITLE),
        coins: 100,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            return actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length <= 5;
        }
    }, {
        title: t(tr.AWARDS_MINIMALIST_TITLE),
        subtitle: t(tr.AWARDS_MINIMALIST_SUBTITLE),
        coins: 150,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON).length === 1;
        }
    }, {
        title: t(tr.AWARDS_ONEHITWONDER_TITLE),
        subtitle: t(tr.AWARDS_ONEHITWONDER_SUBTITLE),
        coins: 1800,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attack = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack);
            const entities = attack.payload.target.occupiedBy.map(entity => entity.type);
            return entities.includes(EntityType.FACTORY) && entities.includes(EntityType.CREAM);
        }
    }, {
        title: t(tr.AWARDS_SPY_TITLE),
        subtitle: t(tr.AWARDS_SPY_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
            return attacks.length >= 4;
        }
    }, {
        title: t(tr.AWARDS_SECRETAGENT_TITLE),
        subtitle: t(tr.AWARDS_SECRETAGENT_SUBTITLE),
        coins: 500,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.attack && action.payload.attackType === AttackType.BUNNY);
            return attacks.length >= 8;
        }
    }, {
        title: t(tr.AWARDS_GROUNDHOGDAY_TITLE),
        subtitle: t(tr.AWARDS_GROUNDHOGDAY_SUBTITLE),
        coins: 100,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 4;
        }
    }, {
        title: t(tr.AWARDS_REPEATOFFENDER_TITLE),
        subtitle: t(tr.AWARDS_REPEATOFFENDER_SUBTITLE),
        coins: 800,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build);
            return buildActions.filter(action => action.payload.building.type === EntityType.SPYING_EASTER_BUNNY).length >= 8;
        }
    }, {
        title: t(tr.AWARDS_FIRSTCOMEFIRSTSERVED_TITLE),
        subtitle: t(tr.AWARDS_FIRSTCOMEFIRSTSERVED_SUBTITLE),
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
        title: t(tr.AWARDS_HINDSIGHT_TITLE),
        subtitle: t(tr.AWARDS_HINDSIGHT_SUBTITLE),
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
        title: t(tr.AWARDS_MOLTEN_TITLE),
        subtitle: t(tr.AWARDS_MOLTEN_SUBTITLE),
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
        title: t(tr.AWARDS_OMG_TITLE),
        subtitle: t(tr.AWARDS_OMG_SUBTITLE),
        coins: 2000,
        isFulfilled: (game, playerIndex) => {
            const board = playerGameField(game, 1 - playerIndex);
            return board.filter(cell => cell.molten).length >= 30;
        }
    },
    {
        title: t(tr.AWARDS_HORCRUXES_TITLE),
        subtitle: t(tr.AWARDS_HORCRUXES_SUBTITLE),
        coins: 1200,
        isFulfilled: (game, playerIndex) => {
            const board = playerGameField(game, playerIndex);
            return board.filter(cell => containsEntity(cell, EntityType.FACTORY_EXTENSION)).length >= 4;
        }
    },
    {
        title: t(tr.AWARDS_PICKY_TITLE),
        subtitle: t(tr.AWARDS_PICKY_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseField);
            return typeof chooseAction !== 'undefined';
        }
    },
    {
        title: t(tr.AWARDS_FIRST_TITLE),
        subtitle: t(tr.AWARDS_FIRST_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.chooseStart);
            return typeof chooseAction !== 'undefined';
        }
    },
    {
        title: t(tr.AWARDS_GREEDY_TITLE),
        subtitle: t(tr.AWARDS_GREEDY_SUBTITLE),
        coins: 10,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            return buildAction.payload.target.type === BoardCellTypes.BLACK;
        }
    },
    {
        title: t(tr.AWARDS_STRATEGIST_TITLE),
        subtitle: t(tr.AWARDS_STRATEGIST_SUBTITLE),
        coins: 10,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            return buildAction.payload.target.type !== BoardCellTypes.BLACK;
        }
    },
    {
        title: t(tr.AWARDS_WINNER_TITLE),
        subtitle: t(tr.AWARDS_WINNER_SUBTITLE),
        coins: 25,
        isFulfilled: () => true
    }, {
        title: t(tr.AWARDS_RANDOM_TITLE),
        subtitle: t(tr.AWARDS_RANDOM_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const chooseAction = actions.find(action => action.payload.issuer === opponent.id && [GameActionTypes.chooseStart, GameActionTypes.chooseField].includes(action.type));
            return typeof chooseAction !== 'undefined';
        }
    }, {
        title: t(tr.AWARDS_MULTIPLAYERBONUS_TITLE),
        subtitle: t(tr.AWARDS_MULTIPLAYERBONUS_SUBTITLE),
        coins: 5,
        isFulfilled: (game, playerIndex) => {
            const opponent = game.players[1 - playerIndex];
            return opponent.type === PlayerType.HUMAN;
        }
    }, {
        title: t(tr.AWARDS_GOLDENMULTIPLAYERBONUS_TITLE),
        subtitle: t(tr.AWARDS_GOLDENMULTIPLAYERBONUS_SUBTITLE),
        coins: 200,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const player = game.players[playerIndex];
            return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 5;
        }
    }, {
        title: t(tr.AWARDS_DIAMONDMULTIPLAYERBONUS_TITLE),
        subtitle: t(tr.AWARDS_DIAMONDMULTIPLAYERBONUS_SUBTITLE),
        coins: 500,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const player = game.players[playerIndex];
            return opponent.type === PlayerType.HUMAN && actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.finishTurn).length >= 15;
        }
    }, {
        title: t(tr.AWARDS_CONCRETEJUNGLE_TITLE),
        subtitle: t(tr.AWARDS_CONCRETEJUNGLE_SUBTITLE),
        coins: 600,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return typeof buildAction === 'undefined';
        }
    }, {
        title: t(tr.AWARDS_GREENSPOT_TITLE),
        subtitle: t(tr.AWARDS_GREENSPOT_SUBTITLE),
        coins: 20,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 1;
        }
    }, {
        title: t(tr.AWARDS_RANDOMFOREST_TITLE),
        subtitle: t(tr.AWARDS_RANDOMFOREST_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 5;
        }
    }, {
        title: t(tr.AWARDS_RAINFOREST_TITLE),
        subtitle: t(tr.AWARDS_RAINFOREST_SUBTITLE),
        coins: 1000,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            return buildActions.length >= 15;
        }
    }, {
        title: t(tr.AWARDS_SMALLOFFENSIVE_TITLE),
        subtitle: t(tr.AWARDS_SMALLOFFENSIVE_SUBTITLE),
        coins: 30,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 2;
        }
    }, {
        title: t(tr.AWARDS_OFFENSIVE_TITLE),
        subtitle: t(tr.AWARDS_OFFENSIVE_SUBTITLE),
        coins: 70,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 5;
        }
    }, {
        title: t(tr.AWARDS_MAJOROFFENSIVE_TITLE),
        subtitle: t(tr.AWARDS_MAJOROFFENSIVE_SUBTITLE),
        coins: 1500,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const buildActions = actions.filter(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return buildActions.length >= 20;
        }
    }, {
        title: t(tr.AWARDS_UNBREAKABLE_TITLE),
        subtitle: t(tr.AWARDS_UNBREAKABLE_SUBTITLE),
        coins: 200,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
            return !attacks.some(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage));
        }
    }, {
        title: t(tr.AWARDS_MRGLASS_TITLE),
        subtitle: t(tr.AWARDS_MRGLASS_SUBTITLE),
        coins: 600,
        isFulfilled: (game, playerIndex, actions) => {
            const opponent = game.players[1 - playerIndex];
            const attacks = actions.filter(action => action.payload.issuer === opponent.id && action.type === GameActionTypes.attack)
            return attacks.filter(attack => attack.payload.target.occupiedBy.some(entity => entity.type !== EntityType.CREAM && entity.hp < attack.payload.damage)).length >= 20;
        }
    }, {
        title: t(tr.AWARDS_OUVERT_TITLE),
        subtitle: t(tr.AWARDS_OUVERT_SUBTITLE),
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
        title: t(tr.AWARDS_SETTLER_TITLE),
        subtitle: t(tr.AWARDS_SETTLER_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const factoryBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FACTORY);
            const treeBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CACAOTREE);
            const cannonBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.RUM_TRUFFLE_CANNON);
            return typeof factoryBuildAction !== 'undefined' && typeof treeBuildAction !== 'undefined' && typeof cannonBuildAction !== 'undefined';
        }
    }, {
        title: t(tr.AWARDS_UPGRADE_TITLE),
        subtitle: t(tr.AWARDS_UPGRADE_SUBTITLE),
        coins: 50,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const fruitCannonBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.FRUIT_CANNON);
            return typeof fruitCannonBuildAction !== 'undefined';
        }
    }, {
        title: t(tr.AWARDS_REFILLED_TITLE),
        subtitle: t(tr.AWARDS_REFILLED_SUBTITLE),
        coins: 30,
        isFulfilled: (game, playerIndex, actions) => {
            const player = game.players[playerIndex];
            const creamBuildAction = actions.find(action => action.payload.issuer === player.id && action.type === GameActionTypes.build && action.payload.building.type === EntityType.CREAM);
            return typeof creamBuildAction !== 'undefined';
        }
    }, {
        title: t(tr.AWARDS_PERSONALCONCERN_TITLE),
        subtitle: t(tr.AWARDS_PERSONALCONCERN_SUBTITLE),
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