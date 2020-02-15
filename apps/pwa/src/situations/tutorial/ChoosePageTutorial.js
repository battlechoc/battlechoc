import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, createEntity } from 'battlechoc-shared-functions';

export default class ChoosePageTutorialSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.modifyBoard({col: 0, row: 0, cellType: BoardCellTypes.WHITE, buildings: [] });
        this.modifyBoard({col: 1, row: 0, cellType: BoardCellTypes.BROWN, buildings: [] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.BROWN, buildings: [] });
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM)] });
        this.game.gameplay.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    }
    static get ui() {
        return (new ChoosePageTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new ChoosePageTutorialSituation()).game.gameplay.game;
    }
}