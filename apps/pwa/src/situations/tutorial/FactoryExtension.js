import Situation from '../Situation';
import { GameStateTypes, PlayerType, BoardCellTypes, EntityType, createEntity, translate as t, translationKeys as tr } from 'battlechoc-shared-functions';

export default class FactoryExtension extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE, 25);
        const game = this.game.gameplay.game;
        game.players[0].fieldIndex = 0;
        game.players[1].fieldIndex = 1;
        this.modifyBoard({ row: 1, col: 1, cellType: BoardCellTypes.BLACK, buildings:[createEntity(EntityType.CREAM), createEntity(EntityType.FACTORY)] });
        this.modifyBoard({ row: 1, col: 2, cellType: BoardCellTypes.BLACK, buildings:[] });
        game.state = GameStateTypes.BUILD_PHASE;
        game.currentPlayerIndex = 0;
        game.players[0].cacao = 500;
        game.players[0].buildingsPerTurn = 4;
        game.players[0].buildings = 4;
        game.players[0].hasFactory = true;
        
        this.game.ui.whitelistBuildings = [EntityType.FACTORY_EXTENSION];
        this.game.ui.selectedBuilding = EntityType.FACTORY_EXTENSION;
        this.game.ui.tappedBuilding = EntityType.FACTORY_EXTENSION;
    }

    static get ui() {
        return (new FactoryExtension()).game.ui;
    }

    static get gameplay() {
        return (new FactoryExtension()).game.gameplay;
    }

    static get title() {
        return t(tr.TUTORIAL_FACTORY_EXTENSION_TITLE);
    }

    static get description() {
        return t(tr.TUTORIAL_FACTORY_EXTENSION_MESSAGE);
    }

    async play({game, manipulate, spawnInfo, sleep}) {
        let pseudoGame = JSON.parse(JSON.stringify(game));        
        pseudoGame = await this.build(EntityType.FACTORY_EXTENSION, { row: 0, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        pseudoGame = await this.build(EntityType.FACTORY_EXTENSION, { row: 1, col: 2 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        pseudoGame = await this.build(EntityType.FACTORY_EXTENSION, { row: 2, col: 1 }, pseudoGame, spawnInfo, manipulate);
        await sleep(800);
        await this.build(EntityType.FACTORY_EXTENSION, { row: 1, col: 0 }, pseudoGame, spawnInfo, manipulate);
    }
}