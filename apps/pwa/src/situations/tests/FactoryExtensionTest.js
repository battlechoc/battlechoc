import Situation from '../Situation';
import { BoardCellTypes, EntityType, createEntity, AttackType } from '../../gameplay/GameEntities';

export default class FactoryExtensionTest extends Situation {
    constructor() {
    	let size = 8;
        super(size);
        this.modifyBoard({col: 4, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 2, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 5, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 4, cellType: BoardCellTypes.BLACK });

        this.modifyBoard({col: 1, row: 3, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({col: 0, row: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.WHITE});
        this.modifyBoard({col: 2, row: 2, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY)]});
        this.modifyBoard({col: 3, row: 3, playerIndex: 1, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CHOCOLATE_FOUNTAIN)]});
        this.modifyBoard({col: 6, row: 1, playerIndex: 1, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.XMAS_FACTORY)]});
		this.modifyBoard({col: 6, row: 2, playerIndex: 1, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
		this.modifyBoard({col: 7, row: 1, playerIndex: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
		this.modifyBoard({col: 7, row: 2, playerIndex: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.SPYING_EASTER_BUNNY)] });

        this.game.gameplay.game.currentPlayerIndex = 0;
        this.game.gameplay.game.players[0].cacao = 2000;
        this.game.gameplay.game.players[0].fieldIndex = 0;
        this.game.gameplay.game.players[1].fieldIndex = 1;
        this.game.gameplay.game.players[0].buildingsPerTurn = 3;
        this.game.gameplay.game.players[0].buildings = 3;
        this.game.gameplay.game.players[0].hasFactory = true;
        this.game.gameplay.game.players[0].attacks[AttackType.TRUFFLE] = 1;
        this.game.gameplay.game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 1;
        this.game.gameplay.game.players[1].hasFactory = true;
        this.game.gameplay.game.players[1].buildingsPerTurn = 3;
        this.game.gameplay.game.players[1].buildings = 3;
        this.game.gameplay.game.players[1].attacks[AttackType.TRUFFLE] = 1;
        this.game.gameplay.game.players[1].attacksPerTurn[AttackType.TRUFFLE] = 1;
        this.game.gameplay.game.players[1].attacks[AttackType.BUNNY] = 1;
        this.game.gameplay.game.players[1].attacksPerTurn[AttackType.BUNNY] = 1;

        for (let row = 2; row < 5; row++) {
        	for (let col = 2; col < 5; col++ ) {
        		this.game.gameplay.game.board.fields[1].grid[row * size + col].shielded = true;
        	}
        }
    }

    static get ui() {
        return (new FactoryExtensionTest()).game.ui;
    }

    static get gameplay() {
        return (new FactoryExtensionTest()).game.gameplay.game;
    }
}