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
const uuidv4 = require('uuid/v4');

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
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
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
    buildReduction(gameplay, event);
    expect(getFieldAt(game.board, position).occupiedBy.map(entity => entity.type)).toContain(EntityType.FACTORY);
    expect(game.players[0].cacao).toBe(player.cacao);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn + 1);
});

test('should set a factory on a brown field at position (6, 7)', () => {
    const position = { row: 6, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
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
    buildReduction(gameplay, event);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn);
});

test('should set a factory on a white field at position (5, 7)', () => {
    const position = { row: 5, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
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
    buildReduction(gameplay, event);
    expect(game.players[0].buildingsPerTurn).toBe(player.buildingsPerTurn + building.buildingsPerTurn);
});

test('should set a tree on a white field at position (5, 7)', () => {
    const position = { row: 5, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
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
    buildReduction(gameplay, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + Math.round(building.cacaoPerTurn * 1.5));
});

test('should set a tree on a brown field at position (6, 7)', () => {
    const position = { row: 6, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
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
    buildReduction(gameplay, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + building.cacaoPerTurn);
});

test('should set a blue and red donut on a brown field at position (6, 7) and (7, 6)', () => {
    const positionBlue = { row: 6, col: 7 };
    const positionRed = { row: 7, col: 6 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
    const blueDonut = createEntity(EntityType.DONUT_PORTAL_BLUE, EmptyPlayerStats.level);
    const redDonut = createEntity(EntityType.DONUT_PORTAL_RED, EmptyPlayerStats.level);
    blueDonut.position = positionBlue;
    redDonut.position = positionRed;
    let assignment = uuidv4();
    blueDonut.assignment = assignment;
    redDonut.assignment = assignment;
    const eventBlue = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": blueDonut
        }
    }
    const eventRed = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": game.players[0].id,
            "building": redDonut
        }
    }

    buildReduction(gameplay, eventBlue);
    expect(getFieldAt(game.board, positionBlue).occupiedBy.map(entity => entity.type)).toContain(EntityType.DONUT_PORTAL_BLUE);
    expect(game.players[0].activeDonuts.filter(donut => donut.type === EntityType.DONUT_PORTAL_BLUE).length).not.toBe(0);
    buildReduction(gameplay, eventRed);
    expect(getFieldAt(game.board, positionRed).occupiedBy.map(entity => entity.type)).toContain(EntityType.DONUT_PORTAL_RED);
    expect(game.players[0].activeDonuts.filter(donut => donut.type === EntityType.DONUT_PORTAL_RED).length).not.toBe(0);
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

const buildFactoryFirst = state => {
    let building = createEntity(EntityType.FACTORY, EmptyPlayerStats.level);
    building.position = { row: 1, col: 1 };
    let event = {
        "type": GameActionTypes.build,
        "payload": {
            "issuer": state.game.players[0].id,
            "building": building
        }
    }
    buildReduction(state, event);
}

test('should not fail to set a tree with factory', () => {
    const position = { row: 6, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
    buildFactoryFirst(gameplay);
    const buildings = game.players[0].buildings;
    finishTurnReduction(gameplay);
    finishTurnReduction(gameplay);
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
    buildReduction(gameplay, event);
    expect(game.players[0].cacao).toBe(player.cacao - building.costs);
    expect(game.players[0].cacaoPerTurn).toBe(player.cacaoPerTurn + building.cacaoPerTurn);
});

test('should fail if it\'s not players turn',  () => {
    const position = { row: 6, col: 7 };
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
    buildFactoryFirst(gameplay);
    finishTurnReduction(gameplay);

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
    const gameplay = BuildTest.gameplay;
    const game = gameplay.game;
    buildFactoryFirst(gameplay);
    finishTurnReduction(gameplay);
    finishTurnReduction(gameplay);

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