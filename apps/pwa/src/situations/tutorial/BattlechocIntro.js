import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType, AttackType } from 'battlechoc-shared-functions';

export default class BattlechocIntro extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 125);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 1, col: 1, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 0, col: 2, cellType: BoardCellTypes.WHITE, buildings:[createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.WHITE, buildings:[] });
        this.modifyBoard({row: 0, col: 1, cellType: BoardCellTypes.BROWN, buildings:[createEntity(EntityType.CREAM)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 270;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, playerIndex: 1, buildings:[createEntity(EntityType.FACTORY)] });

        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = 3;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        this.game.ui.selectedAttack = AttackType.TRUFFLE;

        this.game.ui.selectedBuilding = EntityType.CACAOTREE;
        this.game.ui.tappedBuilding = EntityType.CACAOTREE;
    }
    static get ui() {
        return (new BattlechocIntro()).game.ui;
    }

    static get gameplay() {
        return (new BattlechocIntro()).game.gameplay.game;
    }

    static get title() {
        return 'Welcome to battlechoc';
    }

    static get description() {
        return 'battlechoc is a turn-based strategy game with chocolate flavor. You win the game if you distroy the chocolate factory and cannons of your opponent';
    }

    async play(game, manipulate, spawnInfo, sleep, detonateAtPosition, selectBuilding, tapBuilding) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.CACAOTREE, { row: 0, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        selectBuilding(EntityType.RUM_TRUFFLE_CANNON);
        tapBuilding(EntityType.RUM_TRUFFLE_CANNON)
        await sleep(1000);
        pseudoGame = await this.build(EntityType.RUM_TRUFFLE_CANNON, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        pseudoGame = await this.build(EntityType.RUM_TRUFFLE_CANNON, { row: 0, col: 0 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        if (!this.running) {
            return;
        }
        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);
        this.getFieldAt(pseudoGame.board, { row: 0, col: 0 }, 1).occupiedBy = [];
        pseudoGame.players[0].attacks[AttackType.TRUFFLE] -= 1;
        await manipulate(pseudoGame);
        detonateAtPosition(0, 0, false);
        await sleep(1000);
        this.running = false;
    }
}