import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes } from 'battlechoc-shared-functions';

export default class FactoryTutorialSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BLACK });
        this.game.gameplay.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[1].fieldIndex = 1;
    }
    static get ui() {
        return (new FactoryTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new FactoryTutorialSituation()).game.gameplay.game;
    }
}