import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType } from 'battlechoc-shared-functions';

export default class Factory extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 25);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BLACK, buildings:[] });
        game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
        game.currentPlayerIndex = 0;
    }

    static get ui() {
        return (new Factory()).game.ui;
    }

    static get gameplay() {
        return (new Factory()).game.gameplay.game;
    }

    static get title() {
        return 'The Chocolate Factory';
    }

    static get description() {
        return 'The factory can be build in the first turn and allows you to build all other entities. It performs better on a dark chocolate field';
    }

    async play(game, manipulate, spawnInfo, sleep) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        await this.build(EntityType.FACTORY, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        this.running = false;
    }
}