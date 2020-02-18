import Situation from '../Situation';
import { EmptyPlayerStats, createEntity, getEntityDescriptor, BoardCellTypes, EntityType, AttackType } from 'battlechoc-shared-functions';

export default class FactoryExtensionTest extends Situation {
    constructor() {
        let size = 10;
        super(size);

        let game = this.game.gameplay.game;
        game.currentPlayerIndex = 0;

        game.players[0].level = {
            'EntityType.CREAM': 0,
            'EntityType.FACTORY': 0,
            'EntityType.FACTORY_EXTENSION': 0,
            'EntityType.CACAOTREE': 0,
            'EntityType.RUM_TRUFFLE_CANNON': 0,
            'EntityType.FRUIT_CANNON': 0,
            'EntityType.SPYING_EASTER_BUNNY': 0,
            'EntityType.XMAS_FACTORY': 0,
            'EntityType.HOT_CHOCOLATE_BALLISTA': 0,
            'EntityType.CHOCOLATE_FOUNTAIN': 0,
            'EntityType.DONUT_FACTORY': 20
        }

        let healthDonut = createEntity(EntityType.DONUT_HEALTH_GREEN);
        let creamDonut = createEntity(EntityType.DONUT_CREAM_WHITE);

        this.modifyBoard({col: 0, row: 0, buildings: [creamDonut]});
        this.modifyBoard({col: 4, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 2, row: 3, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 5, cellType: BoardCellTypes.BLACK });
        this.modifyBoard({col: 3, row: 4, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({col: 1, row: 3, cellType: BoardCellTypes.WHITE, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({col: 6, row: 6, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY, game.players[0].level)] });
        this.modifyBoard({col: 6, row: 7, buildings: [createEntity(EntityType.CREAM), createEntity(EntityType.DONUT_FACTORY, game.players[0].level)] });
        this.modifyBoard({col: 2, row: 0, cellType: BoardCellTypes.WHITE});

        this.modifyBoard({col: 0, row: 0, playerIndex: 1, cellType: BoardCellTypes.WHITE, buildings: [healthDonut]});
        this.modifyBoard({col: 2, row: 2, playerIndex: 1, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY)]});

        game.players[0].fieldIndex = 0;
        game.players[0].cacao = 2000;
        game.players[0].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[0].level).buildingsPerTurn + 1;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.players[0].hasFactory = true;
        game.players[0].attacks[AttackType.TRUFFLE] = 2;
        game.players[0].donutProbability = 1;
        game.players[0].activeDonuts = [creamDonut];
        game.players[0].donuts = [createEntity(EntityType.DONUT_PORTAL_BLUE), createEntity(EntityType.DONUT_PORTAL_RED)]
        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 2;

        game.players[1].level = EmptyPlayerStats.level;
        game.players[1].fieldIndex = 1;
        game.players[1].activeDonuts = [healthDonut];
        game.players[1].cacao = 50;
        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[1].level).buildingsPerTurn + 1;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
    }

    static get ui() {
        return (new FactoryExtensionTest()).game.ui;
    }

    static get gameplay() {
        return (new FactoryExtensionTest()).game.gameplay.game;
    }
}