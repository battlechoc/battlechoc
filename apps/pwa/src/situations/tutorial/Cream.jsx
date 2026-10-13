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

export default class Cream extends Situation {
  constructor() {
    super(3, "Mimi Marzipan", PlayerType.AI_TUTORIAL, 55);
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
      row: 0,
      col: 1,
      cellType: BoardCellTypes.BROWN,
      buildings: [],
    });
    this.modifyBoard({
      row: 0,
      col: 2,
      cellType: BoardCellTypes.BLACK,
      buildings: [],
    });
    this.modifyBoard({
      row: 1,
      col: 0,
      cellType: BoardCellTypes.WHITE,
      buildings: [],
    });
    this.modifyBoard({
      row: 1,
      col: 1,
      cellType: BoardCellTypes.BROWN,
      buildings: [],
    });
    this.modifyBoard({
      row: 1,
      col: 2,
      cellType: BoardCellTypes.WHITE,
      buildings: [],
    });
    this.modifyBoard({
      row: 2,
      col: 0,
      cellType: BoardCellTypes.BLACK,
      buildings: [],
    });
    this.modifyBoard({
      row: 2,
      col: 1,
      cellType: BoardCellTypes.BLACK,
      buildings: [],
    });
    this.modifyBoard({
      row: 2,
      col: 2,
      cellType: BoardCellTypes.WHITE,
      buildings: [],
    });

    game.state = GameStateTypes.BUILD_PHASE;
    game.players[0].hasFactory = true;
    game.players[0].cacao = 100;
    game.players[0].buildingsPerTurn = 3;
    game.players[0].buildings = game.players[0].buildingsPerTurn;
    game.currentPlayerIndex = 0;

    this.game.ui.whitelistBuildings = [
      EntityType.CACAOTREE,
      EntityType.RUM_TRUFFLE_CANNON,
      EntityType.CREAM,
    ];
    this.game.ui.selectedBuilding = EntityType.CREAM;
    this.game.ui.tappedBuilding = EntityType.CREAM;
  }
  static get ui() {
    return new Cream().game.ui;
  }

  static get gameplay() {
    return new Cream().game.gameplay;
  }

  static get title() {
    return t(tr.TUTORIAL_CREAM_TITLE);
  }

  static get description() {
    return t(tr.TUTORIAL_CREAM_MESSAGE);
  }

  async play({ game, manipulate, spawnInfo, sleep }) {
    let pseudoGame = JSON.parse(JSON.stringify(game));
    pseudoGame = await this.build(
      EntityType.CREAM,
      { row: 2, col: 0 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(800);
    pseudoGame = await this.build(
      EntityType.CREAM,
      { row: 1, col: 1 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(800);
    await this.build(
      EntityType.CREAM,
      { row: 0, col: 0 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
  }
}
