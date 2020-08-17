import Situation from './Situation';
import { createEntity, GameStateTypes, BoardCellTypes, EntityType, getEntityDescriptor, AttackType, EmptyPlayerStats } from 'battlechoc-shared-functions';

export default class FirstGame extends Situation {
    constructor() {
        super(6);
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.FACTORY), createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 3, col: 4, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.RUM_TRUFFLE_CANNON), createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 0, col: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.RUM_TRUFFLE_CANNON), createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 1, col: 4, cellType: BoardCellTypes.BLACK, buildings: [createEntity(EntityType.CACAOTREE), createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 5, col: 5, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.CACAOTREE)] });
        
        this.modifyBoard({col: 0, row: 3, playerIndex: 1, cellType: BoardCellTypes.BROWN, buildings: [createEntity(EntityType.FACTORY, createEntity(EntityType.CREAM))]});

        const game = this.game.gameplay.game;

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        game.players[0].cacao = 200;
        game.players[0].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[0].level).buildingsPerTurn + 1;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.players[0].hasFactory = true;

        game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 2;
        game.players[0].attacks[AttackType.TRUFFLE] = 2;

        game.players[0].cacaoPerTurn = 2 * getEntityDescriptor(EntityType.CACAOTREE, game.players[0].level).cacaoPerTurn;

        game.players[1].level = EmptyPlayerStats.level;
        game.players[1].cacao = 50;
        game.players[1].buildingsPerTurn = getEntityDescriptor(EntityType.FACTORY, game.players[1].level).buildingsPerTurn;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        game.players[1].hasFactory = true;  
    }

    static get ui() {
        return (new FirstGame()).game.ui;
    }

    static get gameplay() {
        return (new FirstGame()).game.gameplay;
    }
}