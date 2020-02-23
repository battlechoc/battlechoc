const Situation = require('./helper').Situation;
const createEntity = require('../index').createEntity;
const BoardCellTypes = require('../index').BoardCellTypes;
const GameStateTypes = require('../index').GameStateTypes;
const GameActionTypes = require('../index').GameActionTypes;
const EntityType = require('../index').EntityType;
const getEntityDescriptor = require('../index').getEntityDescriptor;
const AttackType = require('../index').AttackType;
const Rules = require('../index').Rules;
const TargetEmptyError = require('../index').TargetEmptyError;
const attackReduction = require('../index').attackReduction;
const setRandomSeed = require('../index').setRandomSeed;
const getRandomNumber = require('../index').getRandomNumber;

class AttackTest extends Situation {
    constructor() {
        super(10);
        this.modifyBoard({row: 7, col: 7, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({row: 6, col: 7, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 5, col: 7, cellType: BoardCellTypes.WHITE });
        this.modifyBoard({row: 6, col: 6, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY, this.game.gameplay.game.players[0].level)] });
        this.modifyBoard({row: 1, col: 3, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON, this.game.gameplay.game.players[0].level)] });

        const surpriseDonut = createEntity(EntityType.DONUT_SURPRISE_YELLOW)
        const healthDonut = createEntity(EntityType.DONUT_HEALTH_GREEN)

        this.modifyBoard({row: 2, col: 2, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY)]});
        this.modifyBoard({row: 7, col: 7, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: []});
        this.modifyBoard({row: 6, col: 7, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [healthDonut]});
        this.modifyBoard({row: 5, col: 7, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [surpriseDonut, createEntity(EntityType.XMAS_FACTORY)]});
        this.modifyBoard({row: 1, col: 1, playerIndex: 1, cellType: BoardCellTypes.BRWON, buildings: [createEntity(EntityType.XMAS_FACTORY)]});

        const game = this.game.gameplay.game;

        game.state = GameStateTypes.ATTACK_PHASE;
        game.currentPlayerIndex = 0;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[1].level).buildingsPerTurn + 1;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        game.players[1].activeDonuts = [surpriseDonut, healthDonut];

        game.players[0].hasFactory = true;
        game.players[0].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[0].level).buildingsPerTurn + 1;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.players[0].attacks[AttackType.TRUFFLE] = 1;
        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 1;
    }

    static get game() {
        return (new AttackTest()).game;
    }

    static get gameplay() {
        return (new AttackTest()).game.gameplay;
    }
}

test('should fail to attack an empty cell', () => {
    const position = { row: 7, col: 7 };
    const game = AttackTest.gameplay.game;
    
    const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[0].level);
    const damage = (1 + ((Math.random() * 0.4) - 0.2)) * description.attack;

    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    expect(Rules.isActionValid(game, event)).toBeInstanceOf(TargetEmptyError);
});

const getFieldAt = (board, position, fieldIndex=0) => board.fields[fieldIndex].grid[position.row * board.size.cols + position.col];

test('should not fail to attack an cell containing the factory', () => {
    const position = { row: 2, col: 2 };
    const gameplay = AttackTest.game.gameplay;
    const game = gameplay.game;
    
    const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[0].level);
    const damage = (1 + ((Math.random() * 0.4) - 0.2)) * description.attack;

    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    expect(Rules.isActionValid(game, event)).toBe(true);

    const health = getFieldAt(game.board, position, 1).occupiedBy.find(entity => entity.type === EntityType.FACTORY).hp;
    
    attackReduction(gameplay, event);
    expect(getFieldAt(game.board, position, 1).occupiedBy.find(entity => entity.type === EntityType.FACTORY).hp).toBeLessThan(health); 
});

test('should fail to attack an cell containing only a donut', () => {
    const position = { row: 6, col: 7 };
    const gameplay = AttackTest.game.gameplay;
    const game = gameplay.game;
    
    const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[0].level);
    const damage = (1 + ((Math.random() * 0.4) - 0.2)) * description.attack;

    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    expect(Rules.isActionValid(game, event)).toBeInstanceOf(TargetEmptyError);
});

test('should give everytime the same random number', () => {
    setRandomSeed(2453);
    expect(getRandomNumber()).toBe(0.5063910039907569);
    expect(getRandomNumber()).toBe(0.20797195665363688);
});

test('should test the yellow donut', () => {
    const position = { row: 5, col: 7 };
    const gameplay = JSON.parse(JSON.stringify(AttackTest.game.gameplay));
    const game = gameplay.game;
    
    const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[0].level);
    const damage = (1 + ((Math.random() * 0.4) - 0.2)) * description.attack;

    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    expect(Rules.isActionValid(game, event)).toBe(true);
    setRandomSeed(42);
    attackReduction(gameplay, event);

    let field = gameplay.game.board.fields[1].grid[position.row * gameplay.game.board.size.cols + position.col];
    expect(field.occupiedBy.map(entity => entity.type)).toContain(EntityType.HOT_CHOCOLATE_BALLISTA);
    field = gameplay.game.board.fields[1].grid[1 * gameplay.game.board.size.cols + 1];
    expect(field.occupiedBy.map(entity => entity.type)).toContain(EntityType.HOT_CHOCOLATE_BALLISTA);
    expect(gameplay.game.players[1].attacksPerTurn[AttackType.HOT_CHOCOLATE]).toBe(2);
});

test('should test the yellow donut', () => {
    const position = { row: 5, col: 7 };
    const gameplay = JSON.parse(JSON.stringify(AttackTest.game.gameplay));
    const game = gameplay.game;
    
    const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[0].level);
    const damage = (1 + ((Math.random() * 0.4) - 0.2)) * description.attack;

    const event = {
        "type": GameActionTypes.attack,
        "payload": {
            "issuer": game.players[0].id,
            "attackType": AttackType.TRUFFLE,
            "damage": damage,
            "row": position.row,
            "col": position.col
        }
    }

    expect(Rules.isActionValid(game, event)).toBe(true);
    setRandomSeed(46);
    attackReduction(gameplay, event);

    let field = gameplay.game.board.fields[1].grid[position.row * gameplay.game.board.size.cols + position.col];
    expect(field.occupiedBy.map(entity => entity.type)).toContain(EntityType.CHOCOLATE_FOUNTAIN);
    field = gameplay.game.board.fields[1].grid[1 * gameplay.game.board.size.cols + 1];
    expect(field.occupiedBy.map(entity => entity.type)).toContain(EntityType.CHOCOLATE_FOUNTAIN);
    expect(field.shielded).toBe(true);
});