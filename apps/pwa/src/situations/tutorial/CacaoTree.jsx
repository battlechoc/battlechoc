import Situation from "../Situation";
import {
  GameStateTypes,
  PlayerType,
  BoardCellTypes,
  createEntity,
  EntityType,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

export default class CacaoTree extends Situation {
  constructor() {
    super(3, "Violet Beauregarde", PlayerType.VIOLET_BEAUREGARDE, 55);
    const game = this.game.gameplay.game;
    game.players[0].fieldIndex = 0;
    game.players[1].fieldIndex = 1;

    this.modifyBoard({
      row: 0,
      col: 0,
      cellType: BoardCellTypes.BLACK,
      buildings: [createEntity(EntityType.FACTORY)],
    });
    this.modifyBoard({
      row: 2,
      col: 1,
      cellType: BoardCellTypes.BLACK,
      buildings: [],
    });
    this.modifyBoard({
      row: 2,
      col: 0,
      cellType: BoardCellTypes.WHITE,
      buildings: [],
    });

    game.state = GameStateTypes.BUILD_PHASE;
    game.players[0].hasFactory = true;
    game.players[0].cacao = 100;
    game.players[0].buildingsPerTurn = 3;
    game.players[0].buildings = game.players[0].buildingsPerTurn;
    game.currentPlayerIndex = 0;

    this.game.ui.whitelistBuildings = [EntityType.CACAOTREE];
    this.game.ui.selectedBuilding = EntityType.CACAOTREE;
    this.game.ui.tappedBuilding = EntityType.CACAOTREE;
  }
  static get ui() {
    return new CacaoTree().game.ui;
  }

  static get gameplay() {
    return new CacaoTree().game.gameplay;
  }

  static get title() {
    return t(tr.TUTORIAL_TREE_TITLE);
  }

  static get description() {
    return t(tr.TUTORIAL_TREE_MESSAGE);
  }

  async play({ game, manipulate, spawnInfo, sleep }) {
    let pseudoGame = JSON.parse(JSON.stringify(game));
    pseudoGame = await this.build(
      EntityType.CACAOTREE,
      { row: 2, col: 1 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(800);
    await this.build(
      EntityType.CACAOTREE,
      { row: 2, col: 0 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
  }
}
