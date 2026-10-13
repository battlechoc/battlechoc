import {
  NonPlayerCharacter,
  BattlechocError,
  EntityType,
  AttackType,
  BoardCellTypes,
  createEntity,
  getEntityDescriptor,
  isDonut,
} from "@battlechoc/battlechoc-shared-functions";
import { Jukebox } from "../ui/misc";
import logger from "../helper/logger";

const AugustusType = Object.freeze({
  DEFENSIVE: "AugustusType.DEFENSIVE",
  AGGRESSIVE: "AugustusType.AGGRESSIVE",
  BALANCED: "AugustusType.BALANCED",
});

export default class Augustus extends NonPlayerCharacter {
  constructor(actions, handicap = 0) {
    super(actions);
    this.handicap = handicap;
    this.type = AugustusType.BALANCED;
    this.discoveredShieldedCells = [];
    this.discoveredUnveiledCells = [];
  }

  static randomizeType() {
    let opponentType = Math.floor(Math.random() * 3);
    if (opponentType === 0) {
      return AugustusType.DEFENSIVE;
    } else if (opponentType === 1) {
      return AugustusType.AGGRESSIVE;
    } else {
      return AugustusType.BALANCED;
    }
  }

  scoreFields() {
    return [
      this.gamefields[0].grid.filter((cell) =>
        this.containsEntity(cell, EntityType.CREAM)
      ).length,
      this.gamefields[1].grid.filter((cell) =>
        this.containsEntity(cell, EntityType.CREAM)
      ).length,
    ];
  }

  async simulateChooseFieldDecision() {
    await this.simulateThinking(1500);
    this.refreshGameState();
    if (this.gameIsRunning) {
      const scores = this.scoreFields();
      if (scores[0] === scores[1]) {
        const decision = Math.round(Math.random());
        if (decision === 0) {
          this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
        } else {
          this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
        }
      } else if (scores[0] > scores[1]) {
        this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
      } else {
        this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
      }
    }
  }

  async simulateInitialPlacement() {
    await this.simulateThinking(1500);
    this.refreshGameState();
    if (this.gameIsRunning) {
      try {
        await this.buildEntity(EntityType.FACTORY);
        await this.simulateThinking(3000);
        await this.actions.finishTurn({ issuer: this.player.id });
      } catch (error) {
        if (error instanceof BattlechocError) {
          logger.info(error);
        } else {
          throw error;
        }
      }
    }
  }

  containsEntity(cell, entityType) {
    return cell.occupiedBy.map((entity) => entity.type).includes(entityType);
  }

  estimateAttackTarget(attackType) {
    let uncreamedFields = this.opponentBoard.grid.filter(
      (cell) => !this.containsEntity(cell, EntityType.CREAM)
    );
    let unveiledFactories = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.FACTORY) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledCannons = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledFruitCannons = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.FRUIT_CANNON) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledBallistas = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.HOT_CHOCOLATE_BALLISTA) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledFactoryExtensions = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.FACTORY_EXTENSION) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledTrees = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.CACAOTREE) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledSpyingEasterBunny = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.SPYING_EASTER_BUNNY) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledXmasFactory = uncreamedFields.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.XMAS_FACTORY) &&
        !this.shieldAlreadyDiscoverd(cell)
    );
    let unveiledFountains = uncreamedFields.filter((cell) =>
      this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN)
    );
    let creamedCells = this.opponentBoard.grid.filter((cell) =>
      this.containsEntity(cell, EntityType.CREAM)
    );
    let creamedAndNotShieldedCells = creamedCells.filter(
      (cell) => !this.shieldAlreadyDiscoverd(cell)
    );
    let creamedButRememberedCells = creamedAndNotShieldedCells.filter((cell) =>
      this.containsRememberedUnveiledEntities(cell)
    );

    if ([AttackType.HOT_CHOCOLATE, AttackType.FRUIT].includes(attackType)) {
      if (unveiledFountains.length > 0) {
        return unveiledFountains[0];
      } else if (
        this.discoveredShieldedCells.filter(
          (cell) =>
            this.countEntities(cell) > 0 &&
            !this.containsEntity(cell, EntityType.CREAM)
        ).length > 0
      ) {
        return this.discoveredShieldedCells.filter(
          (cell) =>
            this.countEntities(cell) > 0 &&
            !this.containsEntity(cell, EntityType.CREAM)
        )[0];
      } else if (
        this.discoveredShieldedCells.filter(
          (cell) => this.countEntities(cell) > 0
        ).length > 0
      ) {
        return this.discoveredShieldedCells.filter(
          (cell) => this.countEntities(cell) > 0
        )[0];
      }
    }

    if (unveiledFactories.length > 0) {
      return unveiledFactories[0];
    } else if (unveiledFactoryExtensions.length > 0) {
      return unveiledFactoryExtensions[0];
    } else if (unveiledSpyingEasterBunny.length > 0) {
      return unveiledSpyingEasterBunny[0];
    } else if (unveiledCannons.length > 0) {
      return unveiledCannons[0];
    } else if (unveiledFruitCannons.length > 0) {
      return unveiledFruitCannons[0];
    } else if (unveiledBallistas.length > 0) {
      return unveiledBallistas[0];
    } else if (unveiledTrees.length > 0) {
      return unveiledTrees[0];
    } else if (unveiledXmasFactory.length > 0) {
      return unveiledXmasFactory[0];
    } else if (creamedButRememberedCells.length > 0) {
      logger.info(
        `Remember unveiled entities @[${creamedButRememberedCells[0].row} ${creamedButRememberedCells[0].col}]`
      );
      return creamedButRememberedCells[0];
    } else if (creamedAndNotShieldedCells.length > 0) {
      return creamedAndNotShieldedCells[
        Math.floor(Math.random() * creamedAndNotShieldedCells.length)
      ];
    } else if (
      uncreamedFields.filter((cell) => this.countEntities(cell) > 0).length > 0
    ) {
      return uncreamedFields.filter((cell) => this.countEntities(cell) > 0)[0];
    } else if (creamedCells.length > 0) {
      return creamedCells[0];
    } else {
      return this.opponentBoard.grid[
        Math.floor(Math.random() * this.opponentBoard.grid.length)
      ];
    }
  }

  cellExists = (row, col) =>
    row >= 0 &&
    col >= 0 &&
    row < this.boardSize.rows &&
    col < this.boardSize.cols;

  getCellPatch3x3(cellIdx, grid) {
    let patch = [];
    for (let row = cellIdx.row - 1; row < cellIdx.row + 2; row++) {
      for (let col = cellIdx.col - 1; col < cellIdx.col + 2; col++) {
        if (this.cellExists(row, col)) {
          patch.push(grid[row * this.boardSize.cols + col]);
        }
      }
    }
    return patch;
  }

  getDirectNeighbors(position, grid) {
    let neighbors = [];
    let positions = [
      { row: position.row, col: position.col + 1 },
      { row: position.row + 1, col: position.col },
      { row: position.row, col: position.col - 1 },
      { row: position.row - 1, col: position.col },
    ];

    for (let { row, col } of positions) {
      if (this.cellExists(row, col)) {
        neighbors.push(grid[row * this.boardSize.cols + col]);
      }
    }

    return neighbors;
  }

  handleAttackError(error) {
    if (error instanceof BattlechocError) {
      logger.info(error.message);
      this.actions.finishTurn({ issuer: this.player.id }).catch((error) => {
        logger.warn("Turn already ended", error);
      });
    } else {
      throw error;
    }
  }

  async simulateAttack(
    target,
    attackType,
    detonateAtPosition,
    triggerDonutInfo
  ) {
    let attack = 0;
    if (attackType === AttackType.TRUFFLE) {
      let description = getEntityDescriptor(
        EntityType.RUM_TRUFFLE_CANNON,
        this.player.level
      );
      attack = description.attack;
    } else if (attackType === AttackType.FRUIT) {
      let description = getEntityDescriptor(
        EntityType.FRUIT_CANNON,
        this.player.level
      );
      attack = description.attack;
    }

    let damage = (1 + (Math.random() * 0.4 - 0.2)) * attack;
    let shieldedBefore =
      this.opponentBoard.grid[target.row * this.boardSize.cols + target.col]
        .shielded;
    let fountainCellNearby = null;

    let selectedCell =
      this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];
    if (shieldedBefore) {
      const shieldedArea = this.getCellPatch3x3(
        selectedCell,
        this.opponentBoard.grid
      );
      fountainCellNearby = shieldedArea.find((cell) =>
        this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN)
      );
    }

    let cellContainsDonut = selectedCell.occupiedBy.some((entity) =>
      isDonut(entity.type)
    );
    let donut = cellContainsDonut
      ? selectedCell.occupiedBy.filter((entity) => isDonut(entity.type))[0]
      : null;
    try {
      logger.info(
        `Attack cell @[${target.row} ${target.col}] with attack type ${attackType}`
      );
      await this.actions.attack({
        issuer: this.player.id,
        attackType: attackType,
        damage: damage,
        row: target.row,
        col: target.col,
        target: selectedCell,
      });
    } catch (error) {
      console.warn("Error during attack phase of NPC", error);
      return this.handleAttackError(error);
    }

    this.refreshGameState();
    selectedCell =
      this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];
    if (this.countEntities(selectedCell) === 0) {
      this.forgetUnveiledCell(selectedCell);
    }

    if (
      cellContainsDonut &&
      !selectedCell.occupiedBy.some((entity) => isDonut(entity.type))
    ) {
      triggerDonutInfo(donut);
    }

    this.refreshGameState();
    if (attackType === AttackType.BUNNY) {
      if (this.player.attacksPerTurn[AttackType.BUNNY] > 0) {
        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
      } else {
        Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
      }
    } else {
      Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
      if (shieldedBefore && !selectedCell.shielded) {
        logger.info(
          `[${selectedCell.row} ${selectedCell.col}] is not shielded anymore`
        );
        this.fieldNotShieldedAnymore(selectedCell);
        if (fountainCellNearby) {
          let cellsNearFountain = this.getCellPatch3x3(
            fountainCellNearby,
            this.opponentBoard.grid
          );

          for (let cell of cellsNearFountain) {
            if (this.shieldAlreadyDiscoverd(cell)) {
              logger.info(
                `Logically conclude that [${cell.row} ${cell.col}] is not shielded anymore`
              );
              this.fieldNotShieldedAnymore(cell);
            }
          }
        }
      }
      detonateAtPosition(target.row, target.col);
    }

    try {
      this.simulateAttackPhase(detonateAtPosition, triggerDonutInfo);
    } catch (error) {
      console.warn(
        "Error during recursive call to simulateAttackPhase of NPC",
        error
      );
      return this.handleAttackError(error);
    }
  }

  shieldAlreadyDiscoverd(cell) {
    return this.discoveredShieldedCells.some(
      (field) => field.row === cell.row && field.col === cell.col
    );
  }

  containsRememberedUnveiledEntities(cell) {
    return this.discoveredUnveiledCells.some(
      (field) => field.row === cell.row && field.col === cell.col
    );
  }

  forgetUnveiledCell(cell) {
    if (
      this.discoveredUnveiledCells.some(
        (field) => field.row === cell.row && field.col === cell.col
      )
    ) {
      logger.info(
        `Forget that [${cell.row} ${cell.col}] had unveiled entities`
      );
    }
    this.discoveredUnveiledCells = this.discoveredUnveiledCells.filter(
      (field) => !(field.row === cell.row && field.col === cell.col)
    );
  }

  fieldNotShieldedAnymore(cell) {
    this.discoveredShieldedCells = this.discoveredShieldedCells.filter(
      (field) => !(field.row === cell.row && field.col === cell.col)
    );
  }

  async simulateAttackPhase(detonateAtPosition, triggerDonutInfo) {
    await this.simulateThinking(1500);
    this.refreshGameState();
    if (this.gameIsRunning) {
      const cells = this.opponentBoard.grid.filter((cell) => !cell.molten);
      const creamyFields = cells.filter((cell) =>
        this.containsEntity(cell, EntityType.CREAM)
      );
      const uncreamedFields = cells.filter(
        (cell) => !this.containsEntity(cell, EntityType.CREAM)
      );
      const unveiledFountains = uncreamedFields.filter((cell) =>
        this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN)
      );

      for (let cell of uncreamedFields.filter(
        (cell) => this.countEntities(cell) > 0
      )) {
        logger.info(
          `Remember that [${cell.row} ${cell.col}] contains unveiled entities`
        );
        this.discoveredUnveiledCells.push(cell);
      }

      for (let unveiledFountain of unveiledFountains) {
        let cellsNearFountain = this.getCellPatch3x3(
          unveiledFountain,
          this.opponentBoard.grid
        ).filter((cell) => !cell.molten);
        for (let cell of cellsNearFountain) {
          if (!this.shieldAlreadyDiscoverd(cell)) {
            logger.info(
              `Logically conclude that [${cell.row} ${cell.col}] is shielded`
            );
            this.discoveredShieldedCells.push(cell);
          }
        }
      }

      if (
        this.player.attacks[AttackType.BUNNY] > 0 &&
        creamyFields.length > 0
      ) {
        let target =
          creamyFields[Math.floor(Math.random() * creamyFields.length)];
        await this.simulateAttack(
          target,
          AttackType.BUNNY,
          detonateAtPosition,
          triggerDonutInfo
        );
      } else if (this.player.attacks[AttackType.HOT_CHOCOLATE] > 0) {
        let target = this.estimateAttackTarget(AttackType.HOT_CHOCOLATE);
        await this.simulateAttack(
          target,
          AttackType.HOT_CHOCOLATE,
          detonateAtPosition,
          triggerDonutInfo
        );
      } else if (this.player.attacks[AttackType.FRUIT] > 0) {
        let target = this.estimateAttackTarget(AttackType.FRUIT);
        if (target.shielded && !this.shieldAlreadyDiscoverd(target)) {
          logger.info(`Target is shielded. Push [${target.row} ${target.col}]`);
          this.discoveredShieldedCells.push(target);
        }
        await this.simulateAttack(
          target,
          AttackType.FRUIT,
          detonateAtPosition,
          triggerDonutInfo
        );
      } else if (this.player.attacks[AttackType.TRUFFLE] > 0) {
        let target = this.estimateAttackTarget(AttackType.TRUFFLE);
        if (target.shielded && !this.shieldAlreadyDiscoverd(target)) {
          logger.info(`Target is shielded. Push [${target.row} ${target.col}]`);
          this.discoveredShieldedCells.push(target);
        }
        await this.simulateAttack(
          target,
          AttackType.TRUFFLE,
          detonateAtPosition,
          triggerDonutInfo
        );
      } else {
        this.actions.finishTurn({ issuer: this.player.id }).catch((error) => {
          if (error instanceof BattlechocError) {
            logger.info(error);
          } else {
            throw error;
          }
        });
      }
    }
  }

  countEntities(cell) {
    return cell.occupiedBy.filter((entity) => !isDonut(entity)).length;
  }

  matchCellsAndEntity(entity) {
    const board = this.board.grid;
    const cells = board.filter((cell) => !cell.molten);

    const freeCells = cells.filter((cell) => this.countEntities(cell) === 0);
    const creamedCells = cells.filter(
      (cell) =>
        this.containsEntity(cell, EntityType.CREAM) &&
        this.countEntities(cell) === 1
    );
    const uncoveredEntities = cells.filter(
      (cell) =>
        !this.containsEntity(cell, EntityType.CREAM) &&
        this.countEntities(cell) > 0
    );
    const uncoveredRedDonuts = freeCells.filter((cell) =>
      this.containsEntity(cell, EntityType.DONUT_PORTAL_RED)
    );
    const shieldedCells = creamedCells.filter((cell) => cell.shielded);
    const donutCells = cells.filter(
      (cell) =>
        cell.occupiedBy.some(
          (entity) =>
            isDonut(entity.type) && entity !== EntityType.DONUT_PORTAL_RED
        ) && this.containsEntity(cell) === 0
    );
    const donutFreeCells = cells.filter(
      (cell) => !cell.occupiedBy.some((entity) => isDonut(entity.type))
    );

    if (
      [
        EntityType.RUM_TRUFFLE_CANNON,
        EntityType.CACAOTREE,
        EntityType.XMAS_FACTORY,
      ].includes(entity) &&
      donutCells.length > 0
    ) {
      return donutCells;
    }

    if (entity === EntityType.FACTORY) {
      if (
        Math.random() < 0.666 &&
        creamedCells.some((cell) => cell.type === BoardCellTypes.BLACK)
      ) {
        return creamedCells.filter(
          (cell) => cell.type === BoardCellTypes.BLACK
        );
      }
    } else if (entity === EntityType.CACAOTREE) {
      if (
        Math.random() < 0.8 &&
        creamedCells.some((cell) => cell.type === BoardCellTypes.WHITE)
      ) {
        return creamedCells.filter(
          (cell) => cell.type === BoardCellTypes.WHITE
        );
      }
    } else if (entity === EntityType.FRUIT_CANNON) {
      return cells.filter((cell) =>
        this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON)
      );
    } else if (entity === EntityType.CHOCOLATE_FOUNTAIN) {
      const factoryCell = cells.filter((cell) =>
        this.containsEntity(cell, EntityType.FACTORY)
      );
      if (factoryCell.length > 0) {
        let cellsNearFactory = this.getCellPatch3x3(factoryCell[0], board);
        cellsNearFactory = cellsNearFactory.filter(
          (cell) =>
            !this.containsEntity(cell, EntityType.FACTORY) && !cell.molten
        );
        const freeCellsNearFactory = cellsNearFactory.filter(
          (cell) => this.countEntities(cell) === 0
        );
        const creamedCellsNearFactory = cellsNearFactory.filter(
          (cell) =>
            this.containsEntity(cell, EntityType.CREAM) &&
            this.countEntities(cell) === 1
        );
        if (creamedCellsNearFactory.length > 0) {
          return creamedCellsNearFactory;
        } else if (freeCellsNearFactory.length > 0) {
          return freeCellsNearFactory;
        }
      }
    } else if (entity === EntityType.CREAM) {
      if (
        uncoveredEntities.filter((cell) =>
          this.containsEntity(cell, EntityType.FACTORY)
        ).length > 0
      ) {
        return uncoveredEntities.filter((cell) =>
          this.containsEntity(cell, EntityType.FACTORY)
        );
      } else if (
        uncoveredEntities.filter(
          (cell) =>
            this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON) ||
            this.containsEntity(cell, EntityType.FRUIT_CANNON)
        ).length > 0
      ) {
        return uncoveredEntities.filter(
          (cell) =>
            this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON) ||
            this.containsEntity(cell, EntityType.FRUIT_CANNON)
        );
      } else if (uncoveredEntities.length > 0) {
        return uncoveredEntities;
      } else if (uncoveredRedDonuts.length > 0) {
        return uncoveredRedDonuts;
      } else {
        return freeCells;
      }
    } else if (entity === EntityType.RUM_TRUFFLE_CANNON) {
      if (shieldedCells.length > 0) {
        return shieldedCells;
      }
    } else if (entity === EntityType.FACTORY_EXTENSION) {
      const factoryCell = cells.filter((cell) =>
        this.containsEntity(cell, EntityType.FACTORY)
      );
      if (typeof factoryCell[0] !== "undefined") {
        const factoryNeighbors = this.getDirectNeighbors(
          factoryCell[0],
          board
        ).filter((cell) => !cell.molten);
        return factoryNeighbors.filter(
          (cell) =>
            this.containsEntity(cell, EntityType.CREAM) &&
            this.countEntities(cell) === 1
        );
      }
    } else if (entity === EntityType.XMAS_FACTORY) {
      let xmasFactoriesOnShieldedCells = cells.filter(
        (cell) =>
          this.containsEntity(cell, EntityType.XMAS_FACTORY) && cell.shielded
      );
      if (shieldedCells.length > 0 && xmasFactoriesOnShieldedCells < 3) {
        return shieldedCells;
      }
    } else if (entity === EntityType.SPYING_EASTER_BUNNY) {
      if (shieldedCells.length > 0) {
        return shieldedCells;
      }
    } else if (entity === EntityType.DONUT_FACTORY) {
      if (shieldedCells.length > 0) {
        return shieldedCells;
      }
    } else if (entity === EntityType.DONUT_PORTAL_BLUE) {
      let factoryCell = cells.filter(
        (cell) =>
          this.containsEntity(cell, EntityType.FACTORY) &&
          !cell.occupiedBy.some((entity) => isDonut(entity.type))
      );
      if (factoryCell.length > 0) {
        return factoryCell;
      } else {
        return donutFreeCells;
      }
    } else if (entity === EntityType.DONUT_PORTAL_RED) {
      if (
        donutFreeCells.filter((cell) =>
          this.containsEntity(cell, EntityType.CREAM)
        ).length > 0
      ) {
        return donutFreeCells.filter((cell) =>
          this.containsEntity(cell, EntityType.CREAM)
        );
      } else {
        return donutFreeCells;
      }
    } else if (isDonut(entity)) {
      return donutFreeCells;
    }

    if (creamedCells.length > 0) {
      return creamedCells;
    } else {
      return freeCells;
    }
  }

  async buildEntity(entityType) {
    let building = createEntity(entityType, this.player.level);
    let matches = this.matchCellsAndEntity(building.type);

    if (matches.length > 0) {
      let target = matches[Math.floor(Math.random() * matches.length)];
      logger.info(
        `Set entity ${building.type} @[${target.row} ${target.col}] (${target.type})`
      );

      building.position = { row: target.row, col: target.col };
      try {
        await this.actions.build({
          issuer: this.player.id,
          building: building,
          target: target,
        });
      } catch (error) {
        logger.warn(error);
      } finally {
        if (entityType !== EntityType.FACTORY) {
          await this.simulateBuildPhase();
        }
      }
    } else {
      logger.info(`There is no matching cell for entity type ${building.type}`);
      this.actions.finishBuildPhase({ issuer: this.player.id });
    }
  }

  handleBuildError(error) {
    if (error instanceof BattlechocError) {
      logger.info(error);
    } else {
      throw error;
    }
    this.actions.finishBuildPhase({ issuer: this.player.id });
  }

  async simulateBuildPhase() {
    await this.simulateThinking(1000);
    this.refreshGameState();
    if (!this.gameIsRunning) {
      logger.warn("this game is not running");
      return;
    }

    if (this.player.buildings === 0 && this.player.donuts.length === 0) {
      return await this.actions.finishBuildPhase({ issuer: this.player.id });
    }

    let rage = Math.random();
    if (this.type === AugustusType.AGGRESSIVE) {
      rage += Math.random() * 0.5;
    } else if (this.type === AugustusType.DEFENSIVE) {
      rage -= Math.random() * 0.5;
    }

    const cacao = this.player.cacao;
    const board = this.board.grid;

    const hasEnoughCacaoFor = (entityType) =>
      cacao >= getEntityDescriptor(entityType, this.player.level).costs;

    const trees = board.filter((cell) =>
      this.containsEntity(cell, EntityType.CACAOTREE)
    ).length;
    let lowerTreeLimit = 1;
    if (rage < 0.5) {
      lowerTreeLimit = 2;
    } else if (rage < 0.2) {
      lowerTreeLimit = 3;
    }

    const uncoveredEntities = board.filter(
      (cell) =>
        !this.containsEntity(cell, EntityType.CREAM) &&
        this.countEntities(cell) > 0
    );
    const cannons = board.filter((cell) =>
      this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON)
    ).length;
    let lowerCannonLimit = 1;
    if (rage > 0.5) {
      lowerCannonLimit = 2;
    } else if (rage > 0.7) {
      lowerCannonLimit = 4;
    }

    const fruitcannons = board.filter((cell) =>
      this.containsEntity(cell, EntityType.FRUIT_CANNON)
    ).length;
    const bunnies = board.filter((cell) =>
      this.containsEntity(cell, EntityType.SPYING_EASTER_BUNNY)
    ).length;
    const fountains = board.filter((cell) =>
      this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN)
    ).length;
    let lowerFountainLimit = 0;
    if (rage < 0.4) {
      lowerFountainLimit = 1;
    } else if (rage < 0) {
      lowerFountainLimit = 4;
    }

    const xmasFactories = board.filter((cell) =>
      this.containsEntity(cell, EntityType.XMAS_FACTORY)
    ).length;
    let lowerXmasFactoryLimit = 1;
    if (rage < 0.4) {
      lowerXmasFactoryLimit = 2;
    } else if (rage < 0.1) {
      lowerXmasFactoryLimit = 4;
    }
    const donutFactories = board.filter((cell) =>
      this.containsEntity(cell, EntityType.DONUT_FACTORY)
    ).length;
    const factoryExtensions = board.filter((cell) =>
      this.containsEntity(cell, EntityType.FACTORY_EXTENSION)
    ).length;
    let factoryExtensionLimits = 0;
    if (rage < 0.5) {
      factoryExtensionLimits = 1;
    } else if (rage < 0.1) {
      factoryExtensionLimits = 3;
    }

    if (this.player.donuts.length > 0) {
      await this.buildEntity(this.player.donuts[0].type);
    } else if (
      this.handicap < 2 &&
      uncoveredEntities.filter(
        (cell) =>
          this.containsEntity(cell, EntityType.FACTORY) && !cell.shielded
      ).length > 0 &&
      hasEnoughCacaoFor(EntityType.CHOCOLATE_FOUNTAIN) &&
      rage < 0.7
    ) {
      await this.buildEntity(EntityType.CHOCOLATE_FOUNTAIN);
    } else if (
      uncoveredEntities.length > 0 &&
      hasEnoughCacaoFor(EntityType.CREAM) &&
      rage < 0.4
    ) {
      await this.buildEntity(EntityType.CREAM);
    } else if (
      this.handicap < 2 &&
      this.discoveredShieldedCells.length > 0 &&
      cannons > 0 &&
      hasEnoughCacaoFor(EntityType.FRUIT_CANNON)
    ) {
      await this.buildEntity(EntityType.FRUIT_CANNON);
    } else if (
      trees < lowerTreeLimit &&
      hasEnoughCacaoFor(EntityType.CACAOTREE)
    ) {
      await this.buildEntity(EntityType.CACAOTREE);
    } else if (
      this.handicap < 3 &&
      bunnies < 1 &&
      hasEnoughCacaoFor(EntityType.SPYING_EASTER_BUNNY) &&
      rage > 0.7
    ) {
      await this.buildEntity(EntityType.SPYING_EASTER_BUNNY);
    } else if (
      cannons + fruitcannons < lowerCannonLimit &&
      hasEnoughCacaoFor(EntityType.RUM_TRUFFLE_CANNON)
    ) {
      await this.buildEntity(EntityType.RUM_TRUFFLE_CANNON);
    } else if (
      this.handicap < 4 &&
      factoryExtensions < factoryExtensionLimits &&
      hasEnoughCacaoFor(EntityType.FACTORY_EXTENSION)
    ) {
      await this.buildEntity(EntityType.FACTORY_EXTENSION);
    } else if (
      this.handicap < 2 &&
      fountains < lowerFountainLimit &&
      hasEnoughCacaoFor(EntityType.CHOCOLATE_FOUNTAIN)
    ) {
      await this.buildEntity(EntityType.CHOCOLATE_FOUNTAIN);
    } else if (
      this.handicap < 1 &&
      donutFactories < 1 &&
      hasEnoughCacaoFor(EntityType.DONUT_FACTORY)
    ) {
      await this.buildEntity(EntityType.DONUT_FACTORY);
    } else if (
      this.handicap < 3 &&
      xmasFactories < lowerXmasFactoryLimit &&
      hasEnoughCacaoFor(EntityType.XMAS_FACTORY)
    ) {
      await this.buildEntity(EntityType.XMAS_FACTORY);
    } else if (rage > 0.8 && hasEnoughCacaoFor(EntityType.RUM_TRUFFLE_CANNON)) {
      await this.buildEntity(EntityType.RUM_TRUFFLE_CANNON);
    } else if (rage > 0.4 && hasEnoughCacaoFor(EntityType.CACAOTREE)) {
      await this.buildEntity(EntityType.CACAOTREE);
    } else if (rage > 0.2 && hasEnoughCacaoFor(EntityType.CREAM)) {
      await this.buildEntity(EntityType.CREAM);
    } else {
      await this.actions.finishBuildPhase({ issuer: this.player.id });
    }
  }
}
