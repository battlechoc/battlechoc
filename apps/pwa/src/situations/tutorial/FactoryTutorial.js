import Situation from '../Situation';
import { BoardCellTypes } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class FactoryTutorialSituation extends Situation {
    constructor() {
        super(3);
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BLACK });
        this.game.gameplay.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
    }
    static get game() {
        return (new FactoryTutorialSituation()).game;
    }
}