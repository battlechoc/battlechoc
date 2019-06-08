import Situation from '../Situation';
import { BoardCellTypes, EntityType, AttackType, createEntity } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { PlayerType } from '../../gameplay/Player';

export default class BunnyAndXmasTutorialSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.modifyBoard({row: 1, col: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 2, col: 2, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.SPYING_EASTER_BUNNY)]});
        this.modifyBoard({row: 1, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.SPYING_EASTER_BUNNY)]});
        this.modifyBoard({row: 0, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)]});
        this.game.gameplay.game.state = GameStateTypes.ATTACK_PHASE;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[0].buildingsPerTurn = 3;
        this.game.gameplay.game.players[0].buildings = 3;
        this.game.gameplay.game.players[0].cacao = 50;
        this.game.gameplay.game.players[0].cacaoPerTurn = 50;
        this.game.gameplay.game.players[0].attacks[AttackType.BUNNY] = 1;
        this.game.gameplay.game.players[0].attacksPerTurn[AttackType.BUNNY] = 1;
        this.game.gameplay.game.players[0].hasFactory = true;
        this.game.gameplay.game.players[1].fieldIndex = 1;
        this.game.gameplay.game.players[1].buildingsPerTurn = 3;
        this.game.gameplay.game.players[1].buildings = 3;
        this.game.gameplay.game.players[1].hasFactory = true;
        this.game.gameplay.game.players[1].attacks[AttackType.BUNNY] = 1;
        this.game.gameplay.game.players[1].attacksPerTurn[AttackType.BUNNY] = 1;
        this.game.ui.selectedAttack = AttackType.BUNNY;
        this.game.ui.tappedBuilding = EntityType.XMAS_FACTORY;
        this.game.ui.selectedBuilding = EntityType.XMAS_FACTORY;
        this.game.ui.whitelistBuildings = [EntityType.XMAS_FACTORY];
        this.game.ui.whitelistAttacks = [AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
    }
    static get ui() {
        return (new BunnyAndXmasTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new BunnyAndXmasTutorialSituation()).game.gameplay.game;
    }
}