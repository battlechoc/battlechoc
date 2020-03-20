import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType, AttackType } from 'battlechoc-shared-functions';
import { translate as t } from '../../ui/misc';

export default class EasterBunny extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 12);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 2, col: 2, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 200;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        
        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, playerIndex: 1, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({row: 1, col: 0, cellType: BoardCellTypes.WHITE, playerIndex: 1, buildings:[createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 0, col: 2, cellType: BoardCellTypes.BROWN, playerIndex: 1, buildings:[createEntity(EntityType.CREAM)] });
        this.modifyBoard({row: 0, col: 1, cellType: BoardCellTypes.BLACK, playerIndex: 1, buildings:[createEntity(EntityType.CREAM)] });

        game.players[1].hasFactory = true;
        game.players[1].buildingsPerTurn = 3;
        game.players[1].buildings = game.players[1].buildingsPerTurn;

        this.game.ui.whitelistBuildings = [EntityType.SPYING_EASTER_BUNNY];
        this.game.ui.selectedBuilding = EntityType.SPYING_EASTER_BUNNY;
        this.game.ui.tappedBuilding = EntityType.SPYING_EASTER_BUNNY;
        this.game.ui.whitelistAttacks = [AttackType.BUNNY];
        this.game.ui.selectedAttack = AttackType.BUNNY;
    }
    static get ui() {
        return (new EasterBunny()).game.ui;
    }

    static get gameplay() {
        return (new EasterBunny()).game.gameplay.game;
    }

    static get title() {
        return t('TUTORIAL_BUNNY_TITLE');
    }

    static get description() {
        return t('TUTORIAL_BUNNY_MESSAGE');
    }

    async play({game, manipulate, spawnInfo, sleep, isRunning}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));
        pseudoGame = await this.build(EntityType.SPYING_EASTER_BUNNY, { row: 0, col: 0 }, pseudoGame, spawnInfo, manipulate);
        await sleep(1000);
        if (!isRunning()) {
            return;
        }
        pseudoGame.state = GameStateTypes.ATTACK_PHASE;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);

        for (const field of pseudoGame.board.fields[1].grid) {
            field.occupiedBy = field.occupiedBy.filter(entitiy => entitiy.type !== EntityType.CREAM);
        }
        pseudoGame.players[0].attacks[AttackType.BUNNY] -= 1;
        await manipulate(pseudoGame);
    }
}