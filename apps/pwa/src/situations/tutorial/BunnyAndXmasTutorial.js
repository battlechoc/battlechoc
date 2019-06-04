import Situation from '../Situation';
import { BoardCellTypes, EntityType, AttackType, createEntity } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class BunnyAndXmasTutorialSituation extends Situation {
    constructor() {
        super(3);
        this.modifyBoard({row: 1, col: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 2, col: 2, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.SPYING_EASTER_BUNNY)]});
        this.modifyBoard({row: 1, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.SPYING_EASTER_BUNNY)]});
        this.modifyBoard({row: 0, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)]});
        this.game.gameplay.game.state = GameStateTypes.ATTACK_PHASE;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[0].buildingsPerTurn = 3;
        this.game.gameplay.game.players[0].buildings = 3;
        this.game.gameplay.game.players[0].cacao = 50;
        this.game.gameplay.game.players[0].attacks[AttackType.BUNNY] = 1;
        this.game.gameplay.game.players[0].attacksPerTurn[AttackType.BUNNY] = 1;
        this.game.ui.selectedAttack = AttackType.BUNNY;
        this.game.ui.selectedBuilding = EntityType.XMAS_FACTORY;
    }
    static get game() {
        return (new BunnyAndXmasTutorialSituation()).game;
    }
}