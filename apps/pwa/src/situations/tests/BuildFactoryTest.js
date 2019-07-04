import Situation from '../Situation';
import { BoardCellTypes } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class BuildFactoryTest extends Situation {
    constructor() {
        super(8);
        this.modifyBoard({row: 7, col: 7, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({row: 6, col: 7, cellType: BoardCellTypes.BROWN });
        this.modifyBoard({row: 5, col: 7, cellType: BoardCellTypes.WHITE });
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