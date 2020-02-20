const Situation = require('./helper').Situation;
const buildReduction = require('../index').buildReduction;
const createEntity = require('../index').createEntity;
const EmptyPlayerStats = require('../index').EmptyPlayerStats;
const BoardCellTypes = require('../index').BoardCellTypes;
const GameStateTypes = require('../index').GameStateTypes;
const GameActionTypes = require('../index').GameActionTypes;
const EntityType = require('../index').EntityType;
const Rules = require('../index').Rules;
const NoBuildingsLeftError = require('../index').NoBuildingsLeftError;
const finishTurnReduction = require('../index').finishTurnReduction;
const NoCacaoLeftError = require('../index').NoCacaoLeftError;
const InvalidActionIssuerError = require('../index').InvalidActionIssuerError;

class BuildTest extends Situation {
    constructor() {
        super(10);
        this.modifyBoard({row: 7, col: 7, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({row: 6, col: 7, cellType: BoardCellTypes.BROWN });
        this.modifyBoard({row: 5, col: 7, cellType: BoardCellTypes.WHITE });
        this.game.gameplay.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[1].fieldIndex = 1;
    }

    static get game() {
        return (new BuildTest()).game;
    }

    static get gameplay() {
        return (new BuildTest()).game.gameplay;
    }
}

const getFieldAt = (board, position) => board.fields[0].grid[position.row * board.size.cols + position.col];

test('should set a factory on a black field at position (7, 7)', () => {
    const position = { row: 7, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.FACTORY, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    const player = JSON.parse(JSON.stringify(game.players[0]));

    expect(getFieldAt(game.board, position).occupiedBy.map(entity => entity.type)).not.toContain(EntityType.FACTORY);
    buildReduction(game, event);
    expect(getFieldAt(game.board, position).occupiedBy.map(entity => entity.type)).toContain(EntityType.FACTORY);
    expect(game.players[0].cacao).toBe(player.cacao);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn + 1);
});

test('should set a factory on a brown field at position (6, 7)', () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.FACTORY, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    const player = JSON.parse(JSON.stringify(game.players[0]));
    buildReduction(game, event);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn);
});

test('should set a factory on a white field at position (5, 7)', () => {
    const position = { row: 5, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.FACTORY, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    const player = JSON.parse(JSON.stringify(game.players[0]));
    buildReduction(game, event);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn);
});

test('should set a tree on a white field at position (5, 7)', () => {
    const position = { row: 5, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    const player = JSON.parse(JSON.stringify(game.players[0]));
    buildReduction(game, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + Math.round(building.cacaoPerTurn * 1.5));
});

test('should set a tree on a brown field at position (6, 7)', () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    const player = JSON.parse(JSON.stringify(game.players[0]));
    buildReduction(game, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + building.cacaoPerTurn);
});

test('should fail to set a tree without factory', () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;
    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    expect(Rules.isActionValid(game, event)).toBeInstanceOf(NoBuildingsLeftError);
});

const buildFactoryFirst = game => {
    let building = createEntity(EntityType.FACTORY, EmptyPlayerStats.level);
    building.position = { row: 1, col: 1 };
    let event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }
    buildReduction(game, event);
}

test('should not fail to set a tree with factory', () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    buildFactoryFirst(game);
    const buildings = game.players[0].buildings;
    finishTurnReduction(game);
    finishTurnReduction(game);
    expect(game.players[0].buildings).toBe(buildings + game.players[0].buildingsPerTurn);
    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;

    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    expect(Rules.isActionValid(game, event)).toBe(true);
    const player = JSON.parse(JSON.stringify(game.players[0]));
    buildReduction(game, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + building.cacaoPerTurn);
});

test('should fail if it\'s not players turn',  () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    buildFactoryFirst(game);
    finishTurnReduction(game);

    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;

    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    game.players[0].cacao = building.costs - 5;
    expect(Rules.isActionValid(game, event)).toBeInstanceOf(InvalidActionIssuerError);
});

test('should fail if player has not enough cacao',  () => {
    const position = { row: 6, col: 7 };
    const game = BuildTest.gameplay.game;
    buildFactoryFirst(game);
    finishTurnReduction(game);
    finishTurnReduction(game);

    const building = createEntity(EntityType.CACAOTREE, EmptyPlayerStats.level);
    building.position = position;

    const event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": building
        }
    }

    game.players[0].cacao = building.costs - 5;
    expect(Rules.isActionValid(game, event)).toBeInstanceOf(NoCacaoLeftError);
});