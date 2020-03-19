import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, AttackType, createEntity, getEntityDescriptor } from 'battlechoc-shared-functions';
import { translate as t } from '../../ui/misc';

export default class ChocolateFountain extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 102);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });
        
        this.modifyBoard({row: 0, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 2, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });

        game.currentPlayerIndex = 0;

        game.players[0].hasFactory = true;
        game.players[0].cacao = 400;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = 3;

        game.players[1].attacksPerTurn[AttackType.TRUFFLE] = 6;
        game.players[1].attacks[AttackType.TRUFFLE] = 6;

        game.state = GameStateTypes.BUILD_PHASE;
        this.game.ui.whitelistBuildings = [EntityType.CHOCOLATE_FOUNTAIN];
        this.game.ui.selectedBuilding = EntityType.CHOCOLATE_FOUNTAIN;
        this.game.ui.tappedBuilding = EntityType.CHOCOLATE_FOUNTAIN;
    }

    static get ui() {
        return (new ChocolateFountain()).game.ui;
    }

    static get gameplay() {
        return (new ChocolateFountain()).game.gameplay.game;
    }

    static get title() {
        return t('TUTORIAL_FOUNTAIN_TITLE');
    }

    static get description() {
        return t('TUTORIAL_FOUNTAIN_MESSAGE');
    }

    async play({game, manipulate, spawnInfo, sleep, detonateAtPosition, isRunning}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));
        pseudoGame = await this.build(EntityType.CHOCOLATE_FOUNTAIN, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(1500);
        if (!isRunning()) {
            return;
        }

        for (const cell of pseudoGame.board.fields[0].grid) {
            cell.shielded = true;
            for (const entity of cell.occupiedBy) {
                entity.position = {row: cell.row, col: cell.col};
            }
        }
        pseudoGame.state = GameStateTypes.BUILD_PHASE;
        pseudoGame.currentPlayerIndex = 1;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2500);
        if (!isRunning()) {
            return;
        }

        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);

        const damage = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON).attack;

        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(400);
        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(200);
        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(400);
        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(600);
        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(200);
        pseudoGame.board.fields[0].grid[4].occupiedBy.find(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN).hp -= damage; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(2, 1);
        await sleep(1000);
    }
}