import { EntityType, AttackType, BoardCellTypes, createEntity, getEntityDescriptor, isDonut } from './GameEntities';
import { BattlechocError } from './Errors';
import { NonPlayerCharacter } from './Player';
import { Jukebox } from '../ui/misc';
import logger from '../helper/logger';

const AugustusType = Object.freeze({
    DEFENSIVE: 'AugustusType.DEFENSIVE',
    AGGRESSIVE: 'AugustusType.AGGRESSIVE',
    BALANCED: 'AugustusType.BALANCED'
})

export default class Augustus extends NonPlayerCharacter {
    constructor(actions) {
    	super(actions);
        this.type = AugustusType.BALANCED;
        this.discoveredShieldedCells = [];
        this.visitedShieldedCells = [];
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
        return [this.gamefields[0].grid.filter(cell => this.containsEntity(cell, EntityType.CREAM)).length,
        this.gamefields[1].grid.filter(cell => this.containsEntity(cell, EntityType.CREAM)).length];
    }

    async simulateChooseFieldOrStartDecision() {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            const scores = this.scoreFields();
            if (scores[0] === scores[1]) {
                this.actions.chooseStart({ issuer: this.player.id });
            } else if (scores[0] > scores[1]) {
                this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
            } else {
                this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
            }
        }
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
        return cell.occupiedBy.map(entity => entity.type).includes(entityType)
    }

    estimateAttackTarget(attackType) {
        let uncreamedFields = this.opponentBoard.grid.filter(cell => !this.containsEntity(cell, EntityType.CREAM));
        let unveiledFactories = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledCannons = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFruitCannons = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.FRUIT_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledBallistas = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.HOT_CHOCOLATE_BALLISTA) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFactoryExtensions = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.FACTORY_EXTENSION) && !this.discoveredShieldedCells.includes(cell));
        let unveiledTrees = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.CACAOTREE) && !this.discoveredShieldedCells.includes(cell));
        let unveiledSpyingEasterBunny = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.SPYING_EASTER_BUNNY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledXmasFactory = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.XMAS_FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFountains = uncreamedFields.filter(cell => this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN));
        let creamedCells = this.opponentBoard.grid.filter(cell => this.containsEntity(cell, EntityType.CREAM) && !this.discoveredShieldedCells.includes(cell));

        if ([AttackType.HOT_CHOCOLATE, AttackType.FRUIT].includes(attackType)) {
            if (unveiledFountains.length > 0) {
                return unveiledFountains[0];
            } else if (attackType === AttackType.FRUIT && this.discoveredShieldedCells.length > 0) {
                return this.discoveredShieldedCells[0];
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
        } else if (creamedCells.length > 0) {
            return creamedCells[Math.floor(Math.random() * creamedCells.length)];
        } else {
            return this.opponentBoard.grid[Math.floor(Math.random() * this.opponentBoard.grid.length)];
        }
    }

    cellExists = (row, col) => row >= 0 && col >= 0 && row < this.boardSize.rows && col < this.boardSize.cols;

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
            {row: position.row, col: position.col + 1},
            {row: position.row + 1, col: position.col},
            {row: position.row, col: position.col - 1},
            {row: position.row - 1, col: position.col},
        ]

        for (let {row, col} of positions) {
            if (this.cellExists(row, col)) {
                neighbors.push(grid[row * this.boardSize.cols + col])
            }
        }

        return neighbors;
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

    simulateAttack(target, attackType, detonateAtPosition, showEnergyBar, hideEnergyBar) {
        let attack = 0;
        if (attackType === AttackType.TRUFFLE) {
            let description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
            attack = description.attack;
        } else if (attackType === AttackType.FRUIT) {
            let description = getEntityDescriptor(EntityType.FRUIT_CANNON, this.player.level);
            attack = description.attack;
        } 

        let damage = (1 + ((Math.random() * 0.4) - 0.2)) * attack;
        let shieldedBefore = this.opponentBoard.grid[target.row * this.boardSize.cols + target.col].shielded;
        this.actions.attack({
            issuer: this.player.id,
            attackType: attackType,
            damage: damage,
            row: target.row,
            col: target.col
        }).then(() => {
            this.refreshGameState();
            if (attackType === AttackType.BUNNY) {
                if (this.player.attacksPerTurn[AttackType.BUNNY] > 0) {
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                } else {
                    Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                }
            } else {
                Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                let selectedCell = this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];
                
                if (shieldedBefore && !selectedCell.shielded) {
                    this.discoveredShieldedCells = this.discoveredShieldedCells.filter(cell => !(cell.row === target.row && cell.col === target.col));
                }
                
                detonateAtPosition(target.row, target.col); 
                if (selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type)).length > 0) {
                    let entity = selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM)[0];
                    showEnergyBar(entity);
                } else {
                    hideEnergyBar({row: target.row, col: target.col});
                }
            }
            this.simulateAttackPhase(detonateAtPosition, showEnergyBar, hideEnergyBar);
        }).catch(error => this.handleAttackError(error));
    }

    async simulateAttackPhase(detonateAtPosition, showEnergyBar, hideEnergyBar) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            let creamyFields = this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));

            if (this.player.attacks[AttackType.BUNNY] > 0 && creamyFields.length > 0) {
                let target = creamyFields[Math.floor(Math.random() * creamyFields.length)];
                this.simulateAttack(target, AttackType.BUNNY, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.HOT_CHOCOLATE] > 0) {
                let target = this.estimateAttackTarget(AttackType.HOT_CHOCOLATE);
                this.simulateAttack(target, AttackType.HOT_CHOCOLATE, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.FRUIT] > 0) {
                let target = this.estimateAttackTarget(AttackType.FRUIT);
                this.simulateAttack(target, AttackType.FRUIT, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.TRUFFLE] > 0) {
                let target = this.estimateAttackTarget(AttackType.TRUFFLE);
                if (target.shielded) {
                    this.discoveredShieldedCells.push(target);
                }
                this.simulateAttack(target, AttackType.TRUFFLE, detonateAtPosition, showEnergyBar, hideEnergyBar);
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

    matchCellsAndEntity(entity) {
        let board = this.board.grid;
        let cells = board.filter(cell => !cell.molten);

        let freeCells = cells.filter(cell => this.countEntities(cell) === 0);
        let creamedCells = board.filter(cell => this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) === 1);
        let uncoveredEntities = board.filter(cell => !this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) > 0);
        let uncoveredRedDonuts = freeCells.filter(cell => this.containsEntity(cell, EntityType.DONUT_PORTAL_RED));
        let shieldedCells = creamedCells.filter(cell => cell.shielded);
        let donutCells = board.filter(cell => cell.occupiedBy.some(entity => isDonut(entity) && entity !== EntityType.DONUT_PORTAL_RED) && this.containsEntity(cell) === 0);

        if ([EntityType.RUM_TRUFFLE_CANNON, EntityType.CACAOTREE, EntityType.XMAS_FACTORY].includes(entity) && donutCells.length > 0) {
            return donutCells;
        }

        if (entity === EntityType.FACTORY) {
            if (Math.random() < 0.666 && creamedCells.some(cell => cell.type === BoardCellTypes.BLACK)) {
                return creamedCells.filter(cell => cell.type === BoardCellTypes.BLACK);
            }
        } else if (entity === EntityType.CACAOTREE) {
            if (Math.random() < 0.8 && creamedCells.some(cell => cell.type === BoardCellTypes.WHITE)) {
                return creamedCells.filter(cell => cell.type === BoardCellTypes.WHITE);
            }
        } else if (entity === EntityType.FRUIT_CANNON) {
            return board.filter(cell => this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON));
        } else if (entity === EntityType.CHOCOLATE_FOUNTAIN) {
            let factoryCell = board.filter(cell => this.containsEntity(cell, EntityType.FACTORY));
            if (factoryCell.length > 0) {
                let cellsNearFactory = this.getCellPatch3x3(factoryCell[0], board);
                cellsNearFactory = cellsNearFactory.filter(cell => !this.containsEntity(cell, EntityType.FACTORY) && !cell.molten);
                let freeCellsNearFactory = cellsNearFactory.filter(cell => this.countEntities(cell) === 0)
                let creamedCellsNearFactory = cellsNearFactory.filter(cell => this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) === 1);
                if (creamedCellsNearFactory.length > 0) {
                    return creamedCellsNearFactory
                } else if (freeCellsNearFactory.length > 0) {
                    return freeCellsNearFactory;
                }
            }
        } else if (entity === EntityType.CREAM) {
            if (uncoveredEntities.length > 0) {
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
            let factoryCell = board.filter(cell => this.containsEntity(cell, EntityType.FACTORY));
            if (typeof factoryCell[0] !== 'undefined') {
                let factoryNeighbors = this.getDirectNeighbors(factoryCell[0], board).filter(cell => !cell.molten);
                return factoryNeighbors.filter(cell => this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) === 1);
            }        
        } else if (entity === EntityType.XMAS_FACTORY) {
            let xmasFactoriesOnShieldedCells = board.filter(cell => this.containsEntity(cell, EntityType.XMAS_FACTORY) && cell.shielded)
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
            let factoryCell = board.filter(cell => this.containsEntity(cell, EntityType.FACTORY));
            if (typeof factoryCell[0] !== 'undefined' && !factoryCell[0].occupiedBy.some(entity => isDonut(entity))) {
                return factoryCell;
            }
        } else if (entity === EntityType.DONUT_PORTAL_RED) {
            return creamedCells;
        } else if (isDonut(entity)) {
            return board.filter(cell => !cell.occupiedBy.some(entity => isDonut(entity)));
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
            logger.info(`Set entity ${building.type} @[${target.row} ${target.col}] (${target.type})`);

            building.position = { row: target.row, col: target.col }
            try {
                await this.actions.build({ issuer: this.player.id, building: building });
            } catch (error) {
                logger.warn(error);
            } finally {
                if (entityType !== EntityType.FACTORY) {
                    this.simulateBuildPhase();
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

        if (this.player.buildings === 0 && this.player.donuts.length === 0) {
            return await this.actions.finishBuildPhase({ issuer: this.player.id });
        } 

        let rage = Math.random();        
        if (this.type === AugustusType.AGGRESSIVE) {
            rage += Math.random() * 0.5;
        } else if (this.type === AugustusType.DEFENSIVE) {
            rage -= Math.random() * 0.5
        }

        let cacao = this.player.cacao;
        let board = this.board.grid;

        let hasEnoughCacaoFor = entityType => cacao >= getEntityDescriptor(entityType, this.player.level).costs;

        let trees = board.filter(cell => this.containsEntity(cell, EntityType.CACAOTREE)).length;
        let lowerTreeLimit = 1;
        if (rage < 0.5) {
            lowerTreeLimit = 2;
        } else if (rage < 0.2) {
            lowerTreeLimit = 3;
        }

        let uncoveredEntities = board.filter(cell => !this.containsEntity(cell, EntityType.CREAM) && this.countEntities(cell) > 0).length;
        let cannons = board.filter(cell => this.containsEntity(cell, EntityType.RUM_TRUFFLE_CANNON)).length;
        let lowerCannonLimit = 1;
        if (rage > 0.5) {
            lowerCannonLimit = 2;
        } else if (rage > 0.7) {
            lowerCannonLimit = 4;
        }

        let fruitcannons = board.filter(cell => this.containsEntity(cell, EntityType.FRUIT_CANNON)).length;
        let bunnies = board.filter(cell => this.containsEntity(cell, EntityType.SPYING_EASTER_BUNNY)).length;
        let fountains = board.filter(cell => this.containsEntity(cell, EntityType.CHOCOLATE_FOUNTAIN)).length;
        let lowerFountainLimit = 0;
        if (rage < 0.4) {
            lowerFountainLimit = 1;
        } else if (rage < 0) {
            lowerFountainLimit = 4;
        }

        let xmasFactories = board.filter(cell => this.containsEntity(cell, EntityType.XMAS_FACTORY)).length;
        let lowerXmasFactoryLimit = 1;
        if (rage < 0.4) {
            lowerXmasFactoryLimit = 2;
        } else if (rage < 0.1) {
            lowerXmasFactoryLimit = 4;
        }
        let donutFactories = board.filter(cell => this.containsEntity(cell, EntityType.DONUT_FACTORY)).length;
        let factoryExtensions = board.filter(cell => this.containsEntity(cell, EntityType.FACTORY_EXTENSION)).length;
        let factoryExtensionLimits = 0;
        if (rage < 0.5) {
            factoryExtensionLimits = 1;
        } else if (rage < 0.1) {
            factoryExtensionLimits = 3;
        }

        if (this.player.donuts.length > 0) {
            await this.buildEntity(this.player.donuts[0].type);
        } else if (uncoveredEntities > 0 && hasEnoughCacaoFor(EntityType.CREAM)) {
            await this.buildEntity(EntityType.CREAM);
        } else if (trees < lowerTreeLimit && hasEnoughCacaoFor(EntityType.CACAOTREE)) {
            await this.buildEntity(EntityType.CACAOTREE);
        } else if ((cannons + fruitcannons) < lowerCannonLimit && hasEnoughCacaoFor(EntityType.RUM_TRUFFLE_CANNON)) {
            await this.buildEntity(EntityType.RUM_TRUFFLE_CANNON);
        } else if (this.discoveredShieldedCells > 0 && cannons > 0 && hasEnoughCacaoFor(EntityType.FRUIT_CANNON)) {
            await this.buildEntity(EntityType.FRUIT_CANNON);
        } else if (bunnies < 1 && hasEnoughCacaoFor(EntityType.SPYING_EASTER_BUNNY) && rage > 0.7) {
            await this.buildEntity(EntityType.SPYING_EASTER_BUNNY);
        } else if (factoryExtensions < factoryExtensionLimits && hasEnoughCacaoFor(EntityType.FACTORY_EXTENSION)) {
            await this.buildEntity(EntityType.FACTORY_EXTENSION);
        } else if (fountains < lowerFountainLimit && hasEnoughCacaoFor(EntityType.CHOCOLATE_FOUNTAIN)) {
            await this.buildEntity(EntityType.CHOCOLATE_FOUNTAIN);
        } else if (donutFactories < 1 && hasEnoughCacaoFor(EntityType.DONUT_FACTORY)) {
            await this.buildEntity(EntityType.DONUT_FACTORY);
        } else if (xmasFactories < lowerXmasFactoryLimit && hasEnoughCacaoFor(EntityType.XMAS_FACTORY)) {
            await this.buildEntity(EntityType.XMAS_FACTORY);
        } else if (rage > 0.8 && hasEnoughCacaoFor(EntityType.RUM_TRUFFLE_CANNON)) {
            await this.buildEntity(EntityType.RUM_TRUFFLE_CANNON);
        } else if (rage > 0.4 && hasEnoughCacaoFor(EntityType.CACAOTREE)) {
            await this.buildEntity(EntityType.CACAOTREE);
        } else if (rage > 0.2  && hasEnoughCacaoFor(EntityType.CREAM)) {
            await this.buildEntity(EntityType.CREAM);
        } else {
            await this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }
}