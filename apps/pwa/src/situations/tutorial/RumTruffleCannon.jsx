import Situation from "../Situation";
import {
  GameStateTypes,
  PlayerType,
  BoardCellTypes,
  createEntity,
  EntityType,
  AttackType,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

export default class RumTruffleCannon extends Situation {
  constructor() {
    super(3, "Violet Beauregarde", PlayerType.VIOLET_BEAUREGARDE, 27);
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
      buildings: [createEntity(EntityType.FACTORY)],
    });

    game.players[1].hasFactory = true;
    game.players[1].buildingsPerTurn = 3;
    game.players[1].buildings = game.players[1].buildingsPerTurn;

    this.game.ui.whitelistBuildings = [
      EntityType.CACAOTREE,
      EntityType.RUM_TRUFFLE_CANNON,
    ];
    this.game.ui.selectedBuilding = EntityType.RUM_TRUFFLE_CANNON;
    this.game.ui.tappedBuilding = EntityType.RUM_TRUFFLE_CANNON;
    this.game.ui.whitelistAttacks = [AttackType.TRUFFLE];
    this.game.ui.selectedAttack = AttackType.TRUFFLE;
  }
  static get ui() {
    return new RumTruffleCannon().game.ui;
  }

  static get gameplay() {
    return new RumTruffleCannon().game.gameplay;
  }

  static get title() {
    return t(tr.TUTORIAL_CANNON_TITLE);
  }

  static get description() {
    return t(tr.TUTORIAL_CANNON_MESSAGE);
  }

  async play({ game, manipulate, spawnInfo, sleep, isRunning }) {
    let pseudoGame = JSON.parse(JSON.stringify(game));
    pseudoGame = await this.build(
      EntityType.RUM_TRUFFLE_CANNON,
      { row: 0, col: 0 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(800);
    pseudoGame = await this.build(
      EntityType.RUM_TRUFFLE_CANNON,
      { row: 1, col: 1 },
      pseudoGame,
      spawnInfo,
      manipulate
    );
    await sleep(1000);
    if (!isRunning()) {
      return;
    }
    pseudoGame.state = GameStateTypes.ATTACK_PHASE;
    pseudoGame = await manipulate(pseudoGame);
    await sleep(1500);
    this.getFieldAt(pseudoGame.board, { row: 0, col: 0 }, 1).occupiedBy = [];
    pseudoGame.players[0].attacks[AttackType.TRUFFLE] -= 1;
    await manipulate(pseudoGame);
    await sleep(1000);
  }
}
