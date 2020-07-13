import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, AttackType, createEntity, getEntityDescriptor, translate as t, translationKeys as tr } from 'battlechoc-shared-functions';

export default class FruitCannon extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 100);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 0, col: 1, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 2, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 3, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 1, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 2, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        
        this.modifyBoard({row: 0, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 1, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.CHOCOLATE_FOUNTAIN)] });

        game.currentPlayerIndex = 0;

        game.players[0].hasFactory = true;
        game.players[0].cacao = 600;
        game.players[0].buildingsPerTurn = 5;
        game.players[0].buildings = 5;
        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 5;
        game.players[0].attacks[AttackType.TRUFFLE] = 5;

        game.players[1].hasFactory = true;

        game.state = GameStateTypes.BUILD_PHASE;
        this.game.ui.whitelistBuildings = [EntityType.FRUIT_CANNON];
        this.game.ui.selectedBuilding = EntityType.FRUIT_CANNON;
        this.game.ui.tappedBuilding = EntityType.FRUIT_CANNON;
        this.game.ui.whitelistAttacks = [AttackType.FRUIT, AttackType.TRUFFLE];
        this.game.ui.selectedAttack = AttackType.FRUIT;
    }

    static get ui() {
        return (new FruitCannon()).game.ui;
    }

    static get gameplay() {
        return (new FruitCannon()).game.gameplay.game;
    }

    static get title() {
        return t(tr.TUTORIAL_FRUIT_CANNON_TITLE);
    }

    static get description() {
        return t(tr.TUTORIAL_FRUIT_CANNON_MESSAGE);
    }

    async play({game, manipulate, spawnInfo, sleep, detonateAtPosition, selectAttack, isRunning}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));
        await sleep(400);
        pseudoGame = await this.build(EntityType.FRUIT_CANNON, { row: 0, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(400);
        pseudoGame = await this.build(EntityType.FRUIT_CANNON, { row: 0, col: 2 }, pseudoGame, spawnInfo, manipulate);
        await sleep(300);
        pseudoGame = await this.build(EntityType.FRUIT_CANNON, { row: 0, col: 3 }, pseudoGame, spawnInfo, manipulate);
        await sleep(500);
        pseudoGame = await this.build(EntityType.FRUIT_CANNON, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(300);
        pseudoGame = await this.build(EntityType.FRUIT_CANNON, { row: 2, col: 2 }, pseudoGame, spawnInfo, manipulate);
        await sleep(500);

        for (const cell of pseudoGame.board.fields[1].grid) {
            cell.shielded = true;
            for (const entity of cell.occupiedBy) {
                entity.position = {row: cell.row, col: cell.col};
            }
        }
        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        if (!isRunning()) {
            return;
        }
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);
        const damage = getEntityDescriptor(EntityType.FRUIT_CANNON).attack * 2;

        pseudoGame.board.fields[1].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame.players[0].attacks[AttackType.FRUIT] -= 1;
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(1, 1, false);
        await sleep(400);
        pseudoGame.board.fields[1].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame.players[0].attacks[AttackType.FRUIT] -= 1;
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(1, 1, false);
        await sleep(200);
        pseudoGame.board.fields[1].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame.players[0].attacks[AttackType.FRUIT] -= 1;
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(1, 1, false);
        await sleep(400);
        pseudoGame.board.fields[1].grid[4].occupiedBy = [];
        for (const cell of pseudoGame.board.fields[1].grid) {
            cell.shielded = false;
        }
        pseudoGame.players[0].attacks[AttackType.FRUIT] -= 1;
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(1, 1, false);
        await sleep(500);
        selectAttack(AttackType.TRUFFLE);
        await sleep(1000);
        pseudoGame.board.fields[1].grid[0].occupiedBy.find(entity => entity.type === EntityType.FACTORY).hp -= Math.ceil(getEntityDescriptor(EntityType.FACTORY).hp / 2); 
        pseudoGame.players[0].attacks[AttackType.TRUFFLE] -= 1;
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(0, 0, false);
        await sleep(800);
        pseudoGame.board.fields[1].grid[0].occupiedBy = [];
        pseudoGame.players[0].attacks[AttackType.TRUFFLE] -= 1;
        await manipulate(pseudoGame);
        detonateAtPosition(0, 0, false);
        await sleep(1500);
    }
}