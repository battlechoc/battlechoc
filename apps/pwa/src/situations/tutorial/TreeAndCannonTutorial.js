import Situation from '../Situation';
import { BoardCellTypes, EntityType, AttackType, createEntity } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { PlayerType } from '../../gameplay/Player';

export default class TreeAndCannonTutorialSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.modifyBoard({col: 1, row: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.WHITE});
        this.modifyBoard({col: 1, row: 1, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY)]});
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[0].buildingsPerTurn = 2;
        this.game.gameplay.game.players[0].buildings = 2;
        this.game.gameplay.game.players[0].cacao = 50;
        this.game.gameplay.game.players[0].hasFactory = true;
        this.game.gameplay.game.players[1].fieldIndex = 1;
        this.game.gameplay.game.players[1].buildingsPerTurn = 2;
        this.game.gameplay.game.players[1].buildings = 2;
        this.game.gameplay.game.players[1].cacao = 50;
        this.game.gameplay.game.players[1].hasFactory = true;
        this.game.ui.selectedAttack = AttackType.TRUFFLE;
        this.game.ui.selectedBuilding = EntityType.CACAOTREE;
        this.game.ui.whitelistBuildings = [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON];
        this.game.ui.whitelistAttacks = [AttackType.TRUFFLE];
    }
    static get ui() {
        return (new TreeAndCannonTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new TreeAndCannonTutorialSituation()).game.gameplay.game;
    }
}