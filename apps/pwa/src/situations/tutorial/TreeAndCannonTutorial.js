import Situation from '../Situation';
import { BoardCellTypes, EntityType, AttackType } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class TreeAndCannonTutorialSituation extends Situation {
    constructor() {
        super(3);
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BLACK, buildings: [EntityType.CREAM, EntityType.FACTORY] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.WHITE});
        this.modifyBoard({col: 1, row: 1, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [EntityType.FACTORY]});
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[0].buildingsPerTurn = 3;
        this.game.gameplay.game.players[0].buildings = 3;
        this.game.gameplay.game.players[0].cacao = 50;
        this.game.ui.selectedAttack = AttackType.TRUFFLE;
        this.game.ui.selectedBuilding = EntityType.CACAOTREE;
    }
    static get game() {
        return (new TreeAndCannonTutorialSituation()).game;
    }
}