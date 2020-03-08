import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType } from 'battlechoc-shared-functions';

export default class Cream extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 55);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 0, col: 1, cellType: BoardCellTypes.BROWN, buildings:[] });
        this.modifyBoard({row: 0, col: 2, cellType: BoardCellTypes.BLACK, buildings:[] });
        this.modifyBoard({row: 1, col: 0, cellType: BoardCellTypes.WHITE, buildings:[] });
        this.modifyBoard({row: 1, col: 1, cellType: BoardCellTypes.BROWN, buildings:[] });
        this.modifyBoard({row: 1, col: 2, cellType: BoardCellTypes.WHITE, buildings:[] });
        this.modifyBoard({row: 2, col: 0, cellType: BoardCellTypes.BLACK, buildings:[] });
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BLACK, buildings:[] });
        this.modifyBoard({row: 2, col: 2, cellType: BoardCellTypes.WHITE, buildings:[] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 100;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.currentPlayerIndex = 0;

        this.game.ui.whitelistBuildings = [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM];
        this.game.ui.selectedBuilding = EntityType.CREAM;
        this.game.ui.tappedBuilding = EntityType.CREAM;
    }
    static get ui() {
        return (new Cream()).game.ui;
    }

    static get gameplay() {
        return (new Cream()).game.gameplay.game;
    }

    static get title() {
        return 'Never build without cream';
    }

    static get description() {
        return 'All entities that are built in cream are invisible to your opponent';
    }

    async play(game, manipulate, spawnInfo, sleep) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.CREAM, { row: 2, col: 0 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        pseudoGame = await this.build(EntityType.CREAM, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        await this.build(EntityType.CREAM, { row: 0, col: 0 }, pseudoGame, spawnInfo, manipulate);
        this.running = false;
    }
}