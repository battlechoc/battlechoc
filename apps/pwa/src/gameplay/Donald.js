import { NonPlayerCharacter, BattlechocError, EntityType, AttackType, createEntity, getEntityDescriptor, isDonut } from 'battlechoc-shared-functions';
import { Jukebox } from '../ui/misc';
import logger from '../helper/logger';

export default class Donald extends NonPlayerCharacter {
    scoreFields() {
        return [this.gamefields[0].grid.filter(cell => this.containsEntity(cell, EntityType.CREAM)).length,
        this.gamefields[1].grid.filter(cell => this.containsEntity(cell, EntityType.CREAM)).length];
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
                this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
            } else {
                this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
            }
        }
    }

    async simulateInitialPlacement() {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            try {
                await this.buildEntity(EntityType.FACTORY);
                await this.simulateThinking(2000);
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
        return cell.occupiedBy.map(entity => entity.type).includes(entityType)
    }

    handleAttackError(error) {
        if (error instanceof BattlechocError) {
            logger.info(error.message);
            this.actions.finishTurn({ issuer: this.player.id }).catch(error => {
                logger.warn('Turn already ended', error);
            });
        } else {
            throw error;
        }
    }

    async simulateAttack(target, attackType, detonateAtPosition, triggerDonutInfo) {
        const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
        const attack = description.attack;
        
        const damage = (1 + ((Math.random() * 0.4) - 0.2)) * attack;
        let selectedCell = this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];

        const cellContainsDonut = selectedCell.occupiedBy.some(entity => isDonut(entity.type));
        const donut = cellContainsDonut ? selectedCell.occupiedBy.filter(entity => isDonut(entity.type))[0] : null;
        try {
          logger.info(`Attack cell @[${target.row} ${target.col}] with attack type ${attackType}`);
          await this.actions.attack({
            issuer: this.player.id,
            attackType: attackType,
            damage: damage,
            row: target.row,
            col: target.col,
            target: selectedCell
          });
        } catch(error) {
            return this.handleAttackError(error)
        }

        this.refreshGameState();
        selectedCell = this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];

        if (cellContainsDonut && !selectedCell.occupiedBy.some(entity => isDonut(entity.type))) {
            triggerDonutInfo(donut);
        }

        this.refreshGameState();
        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
        detonateAtPosition(target.row, target.col);
        
        try {
            this.simulateAttackPhase(detonateAtPosition, triggerDonutInfo);
        } catch(error) {
            return this.handleAttackError(error)
        }
    }

    async simulateAttackPhase(detonateAtPosition, triggerDonutInfo) {
      await this.simulateThinking(1500);
      this.refreshGameState();
      if (this.gameIsRunning) {
        const cells = this.opponentBoard.grid.filter(cell => !cell.molten);
        const fieldsWithEntities = cells.filter(cell => this.countEntities(cell) > 0);
        if (this.player.attacks[AttackType.TRUFFLE] > 0) {
          let target = fieldsWithEntities[Math.floor(Math.random() * fieldsWithEntities.length)];
          await this.simulateAttack(target, AttackType.TRUFFLE, detonateAtPosition, triggerDonutInfo);
        } else {
          this.actions.finishTurn({ issuer: this.player.id }).catch(error => {
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
        return cell.occupiedBy.filter(entity => !isDonut(entity)).length;
    }

    async buildEntity(entityType) {
      let building = createEntity(entityType, this.player.level);
      const board = this.board.grid;
      const cells = board.filter(cell => !cell.molten);

      const freeCells = cells.filter(cell => this.countEntities(cell) === 0);
      const creamedCells = cells.filter(cell => this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) === 1);

      const matches = creamedCells.length > 0 ? creamedCells : freeCells;

      if (matches.length > 0) {
        let target = matches[Math.floor(Math.random() * matches.length)];
        logger.info(`Set entity ${building.type} @[${target.row} ${target.col}] (${target.type})`);

        building.position = { row: target.row, col: target.col }
        try {
            await this.actions.build({ issuer: this.player.id, building: building, target: target });
        } catch (error) {
            logger.warn(error);
        } finally {
            if (entityType !== EntityType.FACTORY) {
                await this.simulateBuildPhase();
            }
        }
      } else {
        logger.info(`There is no matching cell for entity type ${building.type}`)
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
        logger.warn('this game is not running')
        return;
      }

      if (this.player.buildings === 0) {
        return await this.actions.finishBuildPhase({ issuer: this.player.id });
      } 

      const cacao = this.player.cacao;
      const hasEnoughCacaoFor = entityType => cacao >= getEntityDescriptor(entityType, this.player.level).costs;
      const coincidence = Math.random();

      if (coincidence < 0.8 && hasEnoughCacaoFor(EntityType.CACAOTREE)) {
        await this.buildEntity(EntityType.CACAOTREE);
      } else if (hasEnoughCacaoFor(EntityType.RUM_TRUFFLE_CANNON)) {
        await this.buildEntity(EntityType.RUM_TRUFFLE_CANNON);
      } else {
        await this.actions.finishBuildPhase({ issuer: this.player.id });
      }
    }
}