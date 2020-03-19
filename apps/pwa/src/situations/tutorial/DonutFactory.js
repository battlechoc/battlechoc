import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, createEntity, EntityType } from 'battlechoc-shared-functions';
import { translate as t } from '../../ui/misc';

export default class DonutFactory extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 55);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;

        this.modifyBoard({row: 0, col: 0, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.FACTORY)] });

        game.state = GameStateTypes.BUILD_PHASE;
        game.players[0].hasFactory = true;
        game.players[0].cacao = 500;
        game.players[0].buildingsPerTurn = 3;
        game.players[0].buildings = game.players[0].buildingsPerTurn;
        game.currentPlayerIndex = 0;

        this.game.ui.whitelistBuildings = [EntityType.DONUT_FACTORY];
        this.game.ui.selectedBuilding = EntityType.DONUT_FACTORY;
        this.game.ui.tappedBuilding = EntityType.DONUT_FACTORY;
    }
    static get ui() {
        return (new DonutFactory()).game.ui;
    }

    static get gameplay() {
        return (new DonutFactory()).game.gameplay.game;
    }

    static get title() {
        return t('TUTORIAL_DONUT_FACTORY_TITLE');
    }

    static get description() {
        return t('TUTORIAL_DONUT_FACTORY_MESSAGE');
    }

    async play({game, manipulate, spawnInfo, sleep, selectBuilding, tapBuilding}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.DONUT_FACTORY, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(1500);
        pseudoGame.currentPlayerIndex = 1;
        pseudoGame = await manipulate(pseudoGame);
        await sleep(2500);
        pseudoGame.currentPlayerIndex = 0;
        pseudoGame.players[0].donuts.push(createEntity(EntityType.DONUT_PORTAL_BLUE));
        pseudoGame.players[0].donuts.push(createEntity(EntityType.DONUT_PORTAL_RED));
        pseudoGame = await manipulate(pseudoGame);
        await sleep(1500);
        selectBuilding(EntityType.DONUT_PORTAL_BLUE);
        tapBuilding(EntityType.DONUT_PORTAL_BLUE);
        await sleep(1000);
    }
}