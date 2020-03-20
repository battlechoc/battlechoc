import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType } from 'battlechoc-shared-functions';
import { translate as t, keys as tr } from '../../ui/misc';

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
        return t(tr.TUTORIAL_FACTORY_TITLE);
    }

    static get description() {
        return t(tr.TUTORIAL_FACTORY_MESSAGE);
    }

    async play({game, manipulate, spawnInfo, sleep}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        await this.build(EntityType.FACTORY, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
    }
}