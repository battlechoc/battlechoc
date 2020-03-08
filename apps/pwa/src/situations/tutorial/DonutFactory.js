import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType } from 'battlechoc-shared-functions';

export default class DonutFactory extends Situation {
    constructor() {
        super(5, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 55);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 500;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.currentPlayerIndex = 0;

        this.game.ui.whitelistBuildings = [EntityType.DONUT_FACTORY];
        this.game.ui.selectedBuilding = EntityType.DONUT_FACTORY;
        this.game.ui.tappedBuilding = EntityType.DONUT_FACTORY;
    }
    static get ui() {
        return (new DonutFactory()).game.ui;
    }

    static get gameplay() {
        return (new DonutFactory()).game.gameplay.game;
    }

    static get title() {
        return 'You\'ve unlocked the Donut Factory';
    }

    static get description() {
        return 'The Donut Factory produces one donut per round with a certain probability. Donuts triggers like traps when they are attacked. The Donut Factory can be improved in the Choclab to unlock new donut types';
    }

    async play(game, manipulate, spawnInfo, sleep) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        await this.build(EntityType.DONUT_FACTORY, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(1500);
        this.running = false;
    }
}