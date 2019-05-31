import Situation from '../Situation';
import { BoardCellTypes } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class BuildFactoryTest extends Situation {
    constructor() {
        super(8);
        this.modifyBoard({col: 7, row: 7, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 6, row: 7, cellType: BoardCellTypes.BROWN });
        this.modifyBoard({col: 5, row: 7, cellType: BoardCellTypes.WHITE });
        this.game.gameplay.game.state = GameStateTypes.PLAYER_1_INITIAL_PLACEMENT;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[1].fieldIndex = 1;
    }

    static get ui() {
        return (new BuildFactoryTest()).game.ui;
    }

    static get gameplay() {
        return (new BuildFactoryTest()).game.gameplay.game;
    }
}