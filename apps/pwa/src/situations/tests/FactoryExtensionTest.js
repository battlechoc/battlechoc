import Situation from "../Situation";
import {
  EmptyPlayerStats,
  createEntity,
  getEntityDescriptor,
  BoardCellTypes,
  EntityType,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";

export default class FactoryExtensionTest extends Situation {
  constructor() {
    const size = 10;
    super(size);

    const game = this.game.gameplay.game;
    game.currentPlayerIndex = 0;

    game.players[0].level = EmptyPlayerStats.level;
    game.players[0].level[EntityType.DONUT_FACTORY] = 20;

    const yellowDonut = createEntity(EntityType.DONUT_SURPRISE_YELLOW);
    this.game.gameplay.events = [
      {
        type: "battlechoc/gameplay/build",
        payload: {
          issuer: game.players[0].id,
          building: {
            id: "40d734d5-42e2-48e4-8db0-b1bd5d110db4",
            type: "EntityType.FACTORY",
            max: { hp: 340 },
            hp: 340,
            cacaoPerTurn: 130,
            buildingsPerTurn: 3,
            costs: 0,
            coins: 4366,
            position: { row: 8, col: 6 },
          },
          target: {
            type: "BoardCellTypes.BLACK",
            previewStyle: "black",
            row: 8,
            col: 6,
            occupiedBy: [
              {
                id: "401dddc3-2222-4001-a273-6cdf523d4607",
                type: "EntityType.CREAM",
                max: { hp: 1 },
                level: { max: 1 },
                hp: 1,
                area: 1,
                costs: 10,
                position: { col: 6, row: 8 },
              },
            ],
            molten: false,
            shielded: false,
          },
        },
      },
    ];

    this.modifyBoard({
      col: 0,
      row: 0,
      buildings: [yellowDonut, createEntity(EntityType.XMAS_FACTORY)],
    });
    this.modifyBoard({ col: 4, row: 3, cellType: BoardCellTypes.BLACK });
    this.modifyBoard({ col: 3, row: 3, cellType: BoardCellTypes.BLACK });
    this.modifyBoard({ col: 2, row: 3, cellType: BoardCellTypes.BLACK });
    this.modifyBoard({ col: 3, row: 5, cellType: BoardCellTypes.BLACK });
    this.modifyBoard({
      col: 3,
      row: 4,
      cellType: BoardCellTypes.BLACK,
      buildings: [createEntity(EntityType.FRUIT_CANNON)],
    });
    this.modifyBoard({
      col: 1,
      row: 3,
      cellType: BoardCellTypes.WHITE,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.FRUIT_CANNON),
      ],
    });
    this.modifyBoard({
      col: 1,
      row: 4,
      cellType: BoardCellTypes.WHITE,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.FRUIT_CANNON),
      ],
    });
    this.modifyBoard({
      col: 1,
      row: 5,
      cellType: BoardCellTypes.WHITE,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.FRUIT_CANNON),
      ],
    });
    this.modifyBoard({
      col: 6,
      row: 6,
      cellType: BoardCellTypes.BLACK,
      buildings: [createEntity(EntityType.FACTORY, game.players[0].level)],
    });
    this.modifyBoard({
      col: 6,
      row: 7,
      buildings: [
        createEntity(EntityType.CREAM),
        createEntity(EntityType.DONUT_FACTORY, game.players[0].level),
      ],
    });
    this.modifyBoard({ col: 2, row: 0, cellType: BoardCellTypes.WHITE });

    this.modifyBoard({
      col: 0,
      row: 0,
      playerIndex: 1,
      cellType: BoardCellTypes.BLACK,
      buildings: [createEntity(EntityType.FACTORY)],
    });

    game.players[0].fieldIndex = 0;
    game.players[0].cacao = 2000;
    game.players[0].buildingsPerTurn =
      getEntityDescriptor(EntityType.FACTORY, game.players[0].level)
        .buildingsPerTurn + 1;
    game.players[0].buildings = game.players[0].buildingsPerTurn;
    game.players[0].hasFactory = true;
    game.players[0].donutProbability = getEntityDescriptor(
      EntityType.DONUT_FACTORY,
      game.players[0].level
    ).donutProbability;
    game.players[0].activeDonuts = [yellowDonut];
    game.players[0].attacksPerTurn[AttackType.TRUFFLE] = 4;
    game.players[0].attacks[AttackType.TRUFFLE] = 4;
    game.players[0].attacksPerTurn[AttackType.FRUIT] = 4;
    game.players[0].attacks[AttackType.FRUIT] = 4;

    game.players[1].level = EmptyPlayerStats.level;
    game.players[1].fieldIndex = 1;
    game.players[1].cacao = 1000;
    game.players[1].hasFactory = true;
    game.players[1].buildingsPerTurn =
      getEntityDescriptor(EntityType.FACTORY, game.players[1].level)
        .buildingsPerTurn + 1;
    game.players[1].buildings = game.players[1].buildingsPerTurn;
  }

  static get ui() {
    return new FactoryExtensionTest().game.ui;
  }

  static get gameplay() {
    return new FactoryExtensionTest().game.gameplay;
  }
}
