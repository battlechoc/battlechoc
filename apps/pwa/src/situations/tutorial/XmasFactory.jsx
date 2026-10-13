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
import { InfoType } from "../../gameplay/GameActions";

export default class XmasFactory extends Situation {
  constructor() {
    super(3, "Violet Beauregarde", PlayerType.VIOLET_BEAUREGARDE, 12);
    const game = this.game.gameplay.game;
    game.players[0].fieldIndex = 0;
    game.players[1].fieldIndex = 1;

    this.modifyBoard({
      row: 2,
      col: 2,
      cellType: BoardCellTypes.BLACK,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.FACTORY),
      ],
    });

    game.state = GameStateTypes.BUILD_PHASE;
    game.players[0].hasFactory = true;
    game.players[0].cacao = 200;
    game.players[0].buildingsPerTurn = 3;
    game.players[0].buildings = game.players[0].buildingsPerTurn;

    this.modifyBoard({
      row: 0,
      col: 0,
      cellType: BoardCellTypes.BLACK,
      playerIndex: 1,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.FACTORY),
      ],
    });
    this.modifyBoard({
      row: 1,
      col: 0,
      cellType: BoardCellTypes.WHITE,
      playerIndex: 1,
      buildings: [createEntity(EntityType.SPYING_EASTER_BUNNY)],
    });
    this.modifyBoard({
      row: 0,
      col: 2,
      cellType: BoardCellTypes.BROWN,
      playerIndex: 1,
      buildings: [createEntity(EntityType.CREAM)],
    });
    this.modifyBoard({
      row: 0,
      col: 1,
      cellType: BoardCellTypes.BLACK,
      playerIndex: 1,
      buildings: [createEntity(EntityType.CREAM)],
    });

    game.players[1].hasFactory = true;
    game.players[1].buildingsPerTurn = 3;
    game.players[1].buildings = game.players[1].buildingsPerTurn;

    this.game.ui.whitelistBuildings = [EntityType.XMAS_FACTORY];
    this.game.ui.selectedBuilding = EntityType.XMAS_FACTORY;
    this.game.ui.tappedBuilding = EntityType.XMAS_FACTORY;
  }
  static get ui() {
    return new XmasFactory().game.ui;
  }

  static get gameplay() {
    return new XmasFactory().game.gameplay;
  }

  static get title() {
    return t(tr.TUTORIAL_XMAS_TITLE);
  }

  static get description() {
    return t(tr.TUTORIAL_XMAS_MESSAGE);
  }

  async play({ game, manipulate, spawnInfo, sleep, isRunning }) {
    let pseudoGame = JSON.parse(JSON.stringify(game));
    pseudoGame = await this.build(
      EntityType.XMAS_FACTORY,
      { row: 0, col: 0 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(1000);
    if (!isRunning()) {
      return;
    }
    pseudoGame.state = GameStateTypes.BUILD_PHASE;
    pseudoGame.currentPlayerIndex = 1;
    pseudoGame = await manipulate(pseudoGame);
    await sleep(2500);
    if (!isRunning()) {
      return;
    }
    pseudoGame.state = GameStateTypes.ATTACK_PHASE;
    pseudoGame = await manipulate(pseudoGame);
    await sleep(1500);

    const field = pseudoGame.board.fields[0].grid[0];
    field.occupiedBy = field.occupiedBy.filter(
      (entity) => entity.type !== EntityType.XMAS_FACTORY
    );
    field.occupiedBy.push(createEntity(EntityType.HOT_CHOCOLATE_BALLISTA));
    spawnInfo(InfoType.BUNNY_CAUGHT, { row: 0, col: 0 });
    await manipulate(pseudoGame);
  }
}
