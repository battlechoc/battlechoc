const Situation = require('./helper').Situation;
const createEntity = require('../index').createEntity;
const BoardCellTypes = require('../index').BoardCellTypes;
const GameStateTypes = require('../index').GameStateTypes;
const GameActionTypes = require('../index').GameActionTypes;
const EntityType = require('../index').EntityType;
const getEntityDescriptor = require('../index').getEntityDescriptor;
const AttackType = require('../index').AttackType;
const Rules = require('../index').Rules;
const finishTurnReduction = require('../index').finishTurnReduction;
const finishBuildPhaseReduction = require('../index').finishBuildPhaseReduction;
const attackReduction = require('../index').attackReduction;
const buildReduction = require('../index').buildReduction;
const EmptyPlayerStats = require('../index').EmptyPlayerStats;
const endGameReduction = require('../index').endGameReduction;

class GamePlayTest extends Situation {
    constructor() {
        super(10);
        this.modifyBoard({row: 7, col: 7, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({row: 6, col: 7, cellType: BoardCellTypes.BROWN });
        this.modifyBoard({row: 5, col: 7, cellType: BoardCellTypes.WHITE });
        this.modifyBoard({col: 6, row: 6, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY, this.game.gameplay.game.players[0].level)] });
        this.modifyBoard({col: 1, row: 3, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON, this.game.gameplay.game.players[0].level)] });
        this.modifyBoard({col: 1, row: 2, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON, this.game.gameplay.game.players[0].level)] });
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON, this.game.gameplay.game.players[0].level)] });

        let healthDonut = createEntity(EntityType.DONUT_HEALTH_GREEN);
        let creamDonut = createEntity(EntityType.DONUT_CREAM_WHITE);

        this.modifyBoard({col: 2, row: 2, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [creamDonut, createEntity(EntityType.FACTORY, this.game.gameplay.game.players[1].level)]});
        this.modifyBoard({col: 7, row: 7, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: []});
        this.modifyBoard({col: 5, row: 5, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [healthDonut]});

        const game = this.game.gameplay.game;

        game.state = GameStateTypes.ATTACK_PHASE;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[1].level).buildingsPerTurn + 1;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        game.players[1].cacao = 500;
        game.players[1].activeDonuts = [creamDonut, healthDonut];

        game.players[0].hasFactory = true;
        game.players[0].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[0].level).buildingsPerTurn + 1;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.players[0].attacks[AttackType.TRUFFLE] = 3;
        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 3;
    }

    static get game() {
        return (new GamePlayTest()).game;
    }

    static get gameplay() {
        return (new GamePlayTest()).game.gameplay;
    }
}

test('should not find a winner', () => {
    const gameplay = GamePlayTest.gameplay;
    
    expect(Rules.determineWinner(gameplay.game)).toBeUndefined();
});

test('should find a winner', () => {
    const game = GamePlayTest.game;
    const gameplay = game.gameplay;

    const position = { row: 2, col: 2 };
    const damage = getEntityDescriptor(EntityType.FACTORY, gameplay.game.players[0].level).hp + 1;
    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": gameplay.game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    if (Rules.isActionValid(event, game)) {
        attackReduction(gameplay, event);
    }

    expect(Rules.determineWinner(gameplay.game)[0].name).toBe(gameplay.game.players[0].name);
});

test('should find a winner even with donut factory', () => {
    const game = GamePlayTest.game;
    const gameplay = game.gameplay;

    finishTurnReduction(game.gameplay);
    const building = createEntity(EntityType.DONUT_FACTORY, EmptyPlayerStats.level);
    building.position = {row: 7, col: 6};

    let event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.gameplay.game.players[1].id,
            "building": building
        }
    }

    expect(Rules.isActionValid(event, game)).toBe(true);

    buildReduction(game.gameplay, event);  
    finishBuildPhaseReduction(game.gameplay);
    finishTurnReduction(game.gameplay);

    const position = { row: 2, col: 2 };
    const damage = getEntityDescriptor(EntityType.FACTORY, gameplay.game.players[0].level).hp + 1;
    event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": gameplay.game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    if (Rules.isActionValid(event, game)) {
        attackReduction(gameplay, event);
    }

    const winners = Rules.determineWinner(gameplay.game);
    expect(winners[0].name).toBe(gameplay.game.players[0].name);

    event = {
        "type": "battlechoc/gameplay/endGame",
        "payload": {
            "issuer": gameplay.game.players[0].id,
            "winners": winners
        }
    }

    if (Rules.isActionValid(event, game)) {
        endGameReduction(gameplay, event);
    }

    expect(gameplay.game.players[0].statistics.won).toBe(true);
    expect(gameplay.game.players[0].statistics.lost).toBe(false);

    expect(gameplay.game.players[1].statistics.won).toBe(false);
    expect(gameplay.game.players[1].statistics.lost).toBe(true);
});