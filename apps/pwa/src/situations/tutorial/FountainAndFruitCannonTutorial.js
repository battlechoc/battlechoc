import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, AttackType, createEntity } from 'battlechoc-shared-functions';

export default class FountainAndFruitCannonSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 2, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 0, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 1, col: 2, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 2, col: 0, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 2, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });

        this.modifyBoard({row: 1, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.CHOCOLATE_FOUNTAIN)]});
        this.modifyBoard({row: 0, col: 1, playerIndex: 1, buildings: [createEntity(EntityType.FACTORY)]});
        
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[0].buildingsPerTurn = 2;
        this.game.gameplay.game.players[0].buildings = 2;
        this.game.gameplay.game.players[0].cacao = 20;
        this.game.gameplay.game.players[0].cacaoPerTurn = 0;
        this.game.gameplay.game.players[0].attacks[AttackType.TRUFFLE] = 6;
        this.game.gameplay.game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 6;
        this.game.gameplay.game.players[0].hasFactory = true;
        this.game.gameplay.game.players[1].fieldIndex = 1;
        this.game.gameplay.game.players[1].buildingsPerTurn = 2;
        this.game.gameplay.game.players[1].buildings = 2;
        this.game.gameplay.game.players[1].hasFactory = true;
        for (let row = 0; row < 3; row++) {
        	for (let col = 0; col < 3; col++ ) {
        		this.game.gameplay.game.board.fields[1].grid[row * 3 + col].shielded = true;
        	}
        }

        this.game.ui.selectedAttack = AttackType.BUNNY;
        this.game.ui.tappedBuilding = EntityType.CACAOTREE;
        this.game.ui.selectedBuilding = EntityType.CACAOTREE;
        this.game.ui.whitelistBuildings = [EntityType.CACAOTREE, EntityType.FRUIT_CANNON];
        this.game.ui.whitelistAttacks = [AttackType.TRUFFLE, AttackType.FRUIT];

    }
    static get ui() {
        return (new FountainAndFruitCannonSituation()).game.ui;
    }

    static get gameplay() {
        return (new FountainAndFruitCannonSituation()).game.gameplay.game;
    }
}