import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, AttackType, createEntity } from 'battlechoc-shared-functions';

export default class ChocolateFountain extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 102);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        this.modifyBoard({row: 2, col: 1, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });
        
        this.modifyBoard({row: 0, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 0, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 1, col: 2, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 0, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });
        this.modifyBoard({row: 2, col: 1, playerIndex: 1, buildings:[createEntity(EntityType.RUM_TRUFFLE_CANNON)] });

        game.currentPlayerIndex = 0;

        game.players[0].hasFactory = true;
        game.players[0].cacao = 400;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = 3;

        game.players[1].attacksPerTurn[AttackType.TRUFFLE] = 6;
        game.players[1].attacks[AttackType.TRUFFLE] = 6;

        game.state = GameStateTypes.BUILD_PHASE;
    }

    static get ui() {
        return (new ChocolateFountain()).game.ui;
    }

    static get gameplay() {
        return (new ChocolateFountain()).game.gameplay.game;
    }

    static get title() {
        return 'You\'ve unlocked the Chocolate Fountain';
    }

    static get description() {
        return 'The attacks of a Rum Truffle Cannon are very ineffective against the chocolate fountain, protecting the figures under its 3x3 field with its chocolate shield';
    }

    async play(game, manipulate, spawnInfo, sleep) {
        this.running = true;
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.CHOCOLATE_FOUNTAIN, { row: 1, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(1500);
        if (!this.running) {
            return;
        }

        pseudoGame.state = GameStateTypes.BUILD_PHASE;
        pseudoGame.currentPlayerIndex = 1;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2500);
        if (!this.running) {
            return;
        }

        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);
        this.running = false;
    }
}