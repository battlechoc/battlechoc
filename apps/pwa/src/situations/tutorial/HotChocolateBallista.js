import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType, AttackType } from 'battlechoc-shared-functions';
import { translate as t } from '../../ui/misc';

export default class HotChocolateBallista extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 12);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 2, col: 2, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.HOT_CHOCOLATE_BALLISTA)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 200;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, playerIndex: 1, buildings:[createEntity(EntityType.FACTORY)] });

        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = 3;
        game.players[1].buildings = game.players[1].buildingsPerTurn;
        game.players[0].attacksPerTurn[AttackType.HOT_CHOCOLATE] = 1;
        game.players[0].attacks[AttackType.HOT_CHOCOLATE] = 1;

        this.game.ui.whitelistBuildings = [];
        this.game.ui.whitelistAttacks = [AttackType.HOT_CHOCOLATE];
        this.game.ui.selectedAttack = AttackType.HOT_CHOCOLATE;
    }
    static get ui() {
        return (new HotChocolateBallista()).game.ui;
    }

    static get gameplay() {
        return (new HotChocolateBallista()).game.gameplay.game;
    }

    static get title() {
        return t('TUTORIAL_BALLISTA_TITLE');
    }

    static get description() {
        return t('TUTORIAL_BALLISTA_MESSAGE');
    }

    async play({game, manipulate, sleep, isRunning}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));
        await sleep(800);
        if (!isRunning()) {
            return;
        }
        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);

        const field = pseudoGame.board.fields[1].grid[0];
        field.occupiedBy = [];
        field.molten = true;
        pseudoGame.players[0].attacks[AttackType.HOT_CHOCOLATE] = 0;
        await manipulate(pseudoGame);
        await sleep(1500);
    }
}