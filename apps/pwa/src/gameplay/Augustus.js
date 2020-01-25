import { EntityType, AttackType, BoardCellTypes, createEntity, getEntityDescriptor } from './GameEntities';
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
        const typeIdx = Math.floor(Math.random() * 3);
        if (typeIdx === 0) {
            return AugustusType.DEFENSIVE;
        } else if (typeIdx === 1) {
            return AugustusType.AGGRESSIVE;
        } else {
            return AugustusType.BALANCED;
        }
    }

    scoreFields() {
        return [this.gamefields[0].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM)).length,
        this.gamefields[1].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM)).length];
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
            const creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
            const building = createEntity(EntityType.FACTORY, this.player.level);
            try {
                await this.setBuildingAtBestPosition(creamedCells, building);
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

    estimateAttackTarget(attackType) {
        let unveiledFactories = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledCannons = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFruitCannons = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.FRUIT_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledBallistas = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.HOT_CHOCOLATE_BALLISTA) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFactoryExtensions = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY_EXTENSION) && !this.discoveredShieldedCells.includes(cell));
        let unveiledTrees = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE) && !this.discoveredShieldedCells.includes(cell));
        let unveiledSpyingEasterBunny = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledXmasFactory = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFountains = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));
        let creamedCells = this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && !this.discoveredShieldedCells.includes(cell));

        if (attackType === AttackType.HOT_CHOCOLATE && unveiledFountains.length > 0) {
            return unveiledFountains[0];
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

    getCellPatch3x3(cellIdx, grid) {
        let patch = [];
        for (let row = cellIdx.row - 1; row < cellIdx.row + 2; row++) {
            for (let col = cellIdx.col - 1; col < cellIdx.col + 2; col++) {
                if (row >= 0 && col >= 0 && row < this.boardSize.rows && col < this.boardSize.cols) {
                    patch.push(grid[row * this.boardSize.cols + col]);
                }
            }
        }
        return patch;
    }

    estimateFruitAttackTarget() {
        const unveiledFountains = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));
        if (unveiledFountains.length > 0) {
            return unveiledFountains[0];
        } else if (this.discoveredShieldedCells.length > 0) {
            const cellsToVisit = this.getCellPatch3x3(this.discoveredShieldedCells[0], this.opponentBoard.grid).filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
            const unvisitedCells = cellsToVisit.filter(cell => !this.visitedShieldedCells.includes(cell));
            if (unvisitedCells.length > 0) {
                this.visitedShieldedCells.push(unvisitedCells[0]);
                return unvisitedCells[0];
            } else if (cellsToVisit.length > 0) {
                return cellsToVisit[0];
            }
        }

        const remainingCells = this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
        if (remainingCells.length > 0) {
            return remainingCells[Math.floor(Math.random() * remainingCells.length)];
        } else {
            return this.opponentBoard.grid[Math.floor(Math.random() * this.opponentBoard.grid.length)];
        }
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
                detonateAtPosition(target.row, target.col); 
                if (selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0) {
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

            if (this.player.attacks[AttackType.BUNNY] > 0 && creamyFields.length) {
                let target = creamyFields[Math.floor(Math.random() * creamyFields.length)];
                logger.info('OPPONENT BUNNY IS GOING TO SPY : ' + target);
                this.simulateAttack(target, AttackType.BUNNY, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.HOT_CHOCOLATE] > 0) {
                let target;
                if (this.discoveredShieldedCells.length > 0) {
                    target = this.discoveredShieldedCells[0];
                    this.discoveredShieldedCells.splice(this.discoveredShieldedCells.indexOf(target), 1);
                } else {
                    target = this.estimateAttackTarget(AttackType.HOT_CHOCOLATE);
                }
                this.simulateAttack(target, AttackType.HOT_CHOCOLATE, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.FRUIT] > 0) {
                let target = this.estimateFruitAttackTarget();
                this.simulateAttack(target, AttackType.FRUIT, detonateAtPosition, showEnergyBar, hideEnergyBar);
            } else if (this.player.attacks[AttackType.TRUFFLE] > 0) {
                let target = this.estimateAttackTarget(AttackType.TRUFFLE);
                if (target.shielded === true) {
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

    getBestCellsForBuilding(cells, entity) {
        if (entity.type === EntityType.FACTORY) {
            if (Math.random() < 0.6) {
                return cells.filter(cell => cell.type === BoardCellTypes.BLACK);
            } else {
                return cells.filter(cell => cell.type !== BoardCellTypes.BLACK);
            }
        } else if (entity.type === EntityType.CACAOTREE) {
            return cells.filter(cell => cell.type === BoardCellTypes.WHITE);
        } else if (entity.type === EntityType.FRUIT_CANNON) {
            return this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON));
        } else if (entity.type === EntityType.XMAS_FACTORY) {
            const cellsWithXMas = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY));
            if (cellsWithXMas.length === 0) {
                return cells;
            } else {
                const cellsNotShielded = cells.filter(cell => cell.shielded === false);
                if (cellsNotShielded.length > 0) {
                    return cellsNotShielded;
                } else {
                    return cells;
                }
            }
        } else if (entity.type === EntityType.CHOCOLATE_FOUNTAIN) {
            const creamedPossible = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
            if (creamedPossible.length > 0) {
                return creamedPossible;
            } else {
                const emptyCells = cells.filter(cell => cell.occupiedBy.length === 0);
                if (emptyCells.length > 0) {
                    return emptyCells;
                } else {
                    return this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
                }
            }
        } else {
            return cells;
        }
    }

    setBuildingAtBestPosition(possibleCells, building) {
        return new Promise((resolve, reject) => {
            let bestCellsForBuilding = this.getBestCellsForBuilding(possibleCells.filter(cell => cell.molten === false), building.type);
            let targetCell = (bestCellsForBuilding.length > 0) ? bestCellsForBuilding[Math.floor(Math.random() * bestCellsForBuilding.length)] : possibleCells[Math.floor(Math.random() * possibleCells.length)];
            logger.info(building.type + ' ' + targetCell.row + ' ' + targetCell.col + ' ' + targetCell.type);

            building.position = {
                row: targetCell.row,
                col: targetCell.col
            }
            this.actions.build({ issuer: this.player.id, building: building }).then(() => resolve()).catch(error => reject(error));
        });
    }

    handleBuildError(error) {
        if (error instanceof BattlechocError) {
            logger.info(error);
        } else {
            throw error;
        }
        this.actions.finishBuildPhase({ issuer: this.player.id });
    }

    simulateBuildPhaseDefensive() {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const uncoveredBuildings = this.board.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length > 0);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length;
        const fountainCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN)).length;
        const factoryCell = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY));

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON, this.player.level);
        const tree = getEntityDescriptor(EntityType.CACAOTREE, this.player.level);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY, this.player.level);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, this.player.level);
        const cream = getEntityDescriptor(EntityType.CREAM, this.player.level);
        const fountain = getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN, this.player.level);

        if (uncoveredBuildings.length > 0 && cacao > cream.costs) {
            this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= fountain.costs && fountainCount < 1 && factoryCell.length > 0) {
            const fountainCells = this.getCellPatch3x3(factoryCell[0], this.board.grid);
            if (fountainCells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && !cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY)).length > 0) {
                this.setBuildingAtBestPosition(fountainCells, createEntity(EntityType.CHOCOLATE_FOUNTAIN, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            } else {
                this.setBuildingAtBestPosition(fountainCells, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            }
        } else if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0 && cannonCount >= 2) {
            this.setBuildingAtBestPosition(creamedCells, createEntity(EntityType.SPYING_EASTER_BUNNY, this.player.level)).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= (1.5 * xmasFactory.costs) && treeCount > 0 && cannonCount > 0 && xmasFactoryCount < 2) {
            this.setBuildingAtBestPosition(creamedCells, createEntity(EntityType.XMAS_FACTORY, this.player.level)).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 1) {
                building = createEntity(EntityType.CACAOTREE, this.player.level);
            } else if (cannonCount < 1 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 1 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON, this.player.level);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.floor(Math.random() * 3);
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE, this.player.level);
                } else if (decision === 1) {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
                } else {
                    building = createEntity(EntityType.CREAM, this.player.level);
                    creamedCells = freeCells;
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if ((freeCells.length > 0 || uncoveredBuildings.length > 0) && cacao >= cream.costs) {
            if (uncoveredBuildings.length > 0) {
                this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            } else {
                this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            }
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    simulateBuildPhaseAggressive() {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const uncoveredBuildings = this.board.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length > 0);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length;

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON, this.player.level);
        const tree = getEntityDescriptor(EntityType.CACAOTREE, this.player.level);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY, this.player.level);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, this.player.level);
        const cream = getEntityDescriptor(EntityType.CREAM, this.player.level);

        if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0 && cannonCount >= 1) {
            const building = createEntity(EntityType.SPYING_EASTER_BUNNY, this.player.level);
            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 1 && cannonCount >= 2) {
            const building = createEntity(EntityType.XMAS_FACTORY, this.player.level);
            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 2) {
                building = createEntity(EntityType.CACAOTREE, this.player.level);
            } else if (cannonCount < 6 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 2 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON, this.player.level);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.round(Math.random());
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE, this.player.level);
                } else {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if ((freeCells.length > 0 || uncoveredBuildings.length > 0) && cacao >= cream.costs) {
            if (uncoveredBuildings.length > 0) {
                this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            } else {
                this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            }
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    simulateBuildPhaseBalanced() {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const uncoveredBuildings = this.board.grid.filter(cell => !cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && cell.occupiedBy.length > 0);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length;
        const fountainCount = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN)).length;
        const factoryCell = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY)).length;

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON, this.player.level);
        const tree = getEntityDescriptor(EntityType.CACAOTREE, this.player.level);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY, this.player.level);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY, this.player.level);
        const cream = getEntityDescriptor(EntityType.CREAM, this.player.level);
        const fountain = getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN, this.player.level);

        if (uncoveredBuildings.length > 0 && cacao > cream.costs) {
            this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0 && cannonCount >= 2) {
            let building = createEntity(EntityType.SPYING_EASTER_BUNNY, this.player.level);
            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 2 && cannonCount > 0 && treeCount > 0) {
            let building = createEntity(EntityType.XMAS_FACTORY, this.player.level);
            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= fountain.costs && fountainCount < 1 && factoryCell.length > 0) {
            const fountainCells = this.getCellPatch3x3(factoryCell[0], this.board.grid);
            if (fountainCells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && !cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY)).length > 0) {
                this.setBuildingAtBestPosition(fountainCells, createEntity(EntityType.CHOCOLATE_FOUNTAIN, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            } else {
                this.setBuildingAtBestPosition(fountainCells, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            }
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 2) {
                building = createEntity(EntityType.CACAOTREE, this.player.level);
            } else if (cannonCount < 2 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 1 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON, this.player.level);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.round(Math.random());
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE, this.player.level);
                } else {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON, this.player.level);
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building).then(() => {
                this.simulateBuildPhase();
            }).catch(error => this.handleBuildError(error));
        } else if ((freeCells.length > 0 || uncoveredBuildings.length > 0) && cacao >= cream.costs) {
            if (uncoveredBuildings.length > 0) {
                this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            } else {
                this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM, this.player.level)).then(() => {
                    this.simulateBuildPhase();
                }).catch(error => this.handleBuildError(error));
            }
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    async simulateBuildPhase() {
        await this.simulateThinking(1000);
        this.refreshGameState();
        if (this.gameIsRunning) {
            if (this.player.buildings === 0) {
                this.actions.finishBuildPhase({ issuer: this.player.id });
            } else {
                if (this.type === AugustusType.BALANCED) {
                    this.simulateBuildPhaseBalanced();
                } else if (this.type === AugustusType.AGGRESSIVE) {
                    this.simulateBuildPhaseAggressive();
                } else if (this.type === AugustusType.DEFENSIVE) {
                    this.simulateBuildPhaseDefensive();
                }
            }
        }
    }
}