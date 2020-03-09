import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType } from 'battlechoc-shared-functions';

export default class Donuts extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 55);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 1, col: 1, buildings:[] });
        this.modifyBoard({row: 2, col: 1, buildings:[createEntity(EntityType.DONUT_FACTORY)] });

        this.modifyBoard({row: 1, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 500;
        game.players[0].donuts = [createEntity(EntityType.DONUT_PORTAL_BLUE), createEntity(EntityType.DONUT_PORTAL_RED)];
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.currentPlayerIndex = 0;

        this.game.ui.whitelistBuildings = [EntityType.DONUT_FACTORY];
        this.game.ui.selectedBuilding = EntityType.DONUT_FACTORY;
        this.game.ui.tappedBuilding = EntityType.DONUT_FACTORY;
    }
    static get ui() {
        return (new Donuts()).game.ui;
    }

    static get gameplay() {
        return (new Donuts()).game.gameplay.game;
    }

    static get title() {
        return 'Donut Traps';
    }

    static get description() {
        return 'Donuts are triggered by fruit, truffle or hot chocolate attacks. This is the Donut Portal Trap. You will unlock other donuts by upgrading your donut facotry';
    }

    async play(game, manipulate, spawnInfo, sleep, detonateAtPosition) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.DONUT_PORTAL_BLUE, { row: 0, col: 0 }, pseudoGame, spawnInfo, manipulate);
        await sleep(500);
        pseudoGame = await this.build(EntityType.DONUT_PORTAL_RED, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        pseudoGame.players[0].donuts = [];
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2000);
        pseudoGame.currentPlayerIndex = 1;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2000);
        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2000);
        pseudoGame.board.fields[0].grid[0].occupiedBy = []; 
        pseudoGame.board.fields[0].grid[4].occupiedBy = [createEntity(EntityType.FACTORY)]; 
        pseudoGame = await manipulate(pseudoGame);
        detonateAtPosition(0, 0);
        await sleep(1000);
        this.running = false;
    }
}