import Situation from '../Situation';
import { BoardCellTypes, EntityType, createEntity, AttackType, getEntityDescriptor } from '../../gameplay/GameEntities';
import { EmptyPlayerStats } from '../../Multiplayer';

export default class FactoryExtensionTest extends Situation {
    constructor() {
        let size = 10;
        super(size);
        this.modifyBoard({col: 4, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 2, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 5, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 4, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 1, row: 3, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({col: 6, row: 6, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.WHITE});

        this.modifyBoard({col: 2, row: 2, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY)]});
        this.modifyBoard({col: 6, row: 1, playerIndex: 1, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.XMAS_FACTORY)]});
        this.modifyBoard({col: 7, row: 1, playerIndex: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.FRUIT_CANNON)] });

        let game = this.game.gameplay.game;

        game.currentPlayerIndex = 0;

        game.players[0].level = EmptyPlayerStats.level;
        game.players[0].fieldIndex = 0;
        game.players[0].cacao = 2000;
        game.players[0].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[0].level).buildingsPerTurn + 1;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.players[0].hasFactory = true;
        game.players[0].attacks[AttackType.TRUFFLE] = 1;
        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 1;

        game.players[1].level = EmptyPlayerStats.level;
        game.players[1].fieldIndex = 1;
        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[1].level).buildingsPerTurn + 1;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        game.players[1].attacks[AttackType.TRUFFLE] = 1;
        game.players[1].attacksPerTurn[AttackType.TRUFFLE] = 1;
        game.players[1].attacks[AttackType.FRUIT] = 1;
        game.players[1].attacksPerTurn[AttackType.FRUIT] = 1;
    }

    static get ui() {
        return (new FactoryExtensionTest()).game.ui;
    }

    static get gameplay() {
        return (new FactoryExtensionTest()).game.gameplay.game;
    }
}