import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType } from 'battlechoc-shared-functions';

export default class RumTruffleCannon extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 12);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 2, col: 2, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 200;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, playerIndex: 1, buildings:[createEntity(EntityType.FACTORY)] });

        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = 3;
        game.players[1].buildings = game.players[1].buildingsPerTurn;

        this.game.ui.whitelistBuildings = [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON];
        this.game.ui.selectedBuilding = EntityType.RUM_TRUFFLE_CANNON;
    }
    static get ui() {
        return (new RumTruffleCannon()).game.ui;
    }

    static get gameplay() {
        return (new RumTruffleCannon()).game.gameplay.game;
    }

    static get title() {
        return 'All you need is a Rum Truffle Cannon';
    }

    static get description() {
        return 'To distroy your opponents entites you will need cannons. You can attack 1 field per turn using a Rum Truffle Cannon';
    }

    async play(game, manipulate, spawnInfo, sleep) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));
        pseudoGame = await this.build(EntityType.RUM_TRUFFLE_CANNON, { row: 0, col: 0 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        await this.build(EntityType.RUM_TRUFFLE_CANNON, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        this.running = false;
    }
}