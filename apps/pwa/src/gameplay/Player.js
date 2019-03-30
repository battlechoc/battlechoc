import uuidv4 from 'uuid/v4';
import { EntityType, AttackType, BoardCellTypes, createEntity, getEntityDescriptor } from './GameEntities';
import { BattlechocError } from './Errors';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

const AugustusType = Object.freeze({
    DEFENSIVE: 'AugustusType.DEFENSIVE',
    AGGRESSIVE: 'AugustusType.AGGRESSIVE',
    BALANCED: 'AugustusType.BALANCED'
})

function createPlayer(name, type, activePlayer) {
    let player = {
        name: name,
        type: type,
        id: uuidv4(),
        cacao: 100,
        cacaoPerTurn: 0,
        buildings: 0,
        buildingsPerTurn: 0,
        attacks: {},
        attacksPerTurn: {},
        hasFactory: false
    };
    player.attacks[AttackType.TRUFFLE] = 0;
    player.attacks[AttackType.HOT_CHOCOLATE] = 0;
    player.attacks[AttackType.FRUIT] = 0;
    player.attacks[AttackType.BUNNY] = 0;
    player.attacksPerTurn[AttackType.TRUFFLE] = 0;
    player.attacksPerTurn[AttackType.HOT_CHOCOLATE] = 0;
    player.attacksPerTurn[AttackType.FRUIT] = 0;
    player.attacksPerTurn[AttackType.BUNNY] = 0;
    return player;
}

function playerHasAttacks(player) {
    return (player.attacks[AttackType.TRUFFLE] +
        player.attacks[AttackType.HOT_CHOCOLATE] +
        player.attacks[AttackType.FRUIT] +
        player.attacks[AttackType.BUNNY]) > 0;
}

function playerHasAttacksPerTurn(player) {
    return (player.attacksPerTurn[AttackType.TRUFFLE] +
        player.attacksPerTurn[AttackType.HOT_CHOCOLATE] +
        player.attacksPerTurn[AttackType.FRUIT] +
        player.attacksPerTurn[AttackType.BUNNY]) > 0;
}

function playerHasHarmfulAttacksPerTurn(player) {
    return (player.attacksPerTurn[AttackType.TRUFFLE] + player.attacksPerTurn[AttackType.HOT_CHOCOLATE]) > 0;
}

class Augustus {
    constructor(actions, player) {
        this.actions = actions;
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

    connectGamestate(callback) {
        this.refreshGameState = () => {
            let game = callback();
            this.gameIsRunning = game.isRunning;
            if (this.gameIsRunning) {
                this.player = game.players[1];
                this.gamefields = game.board.fields;
                this.boardSize = game.board.size;
                this.board = game.board.fields[this.player.fieldIndex];
                this.opponentBoard = game.board.fields[game.players[0].fieldIndex];
            }
        };
    }

    simulateThinking(timeToThink) {
        return new Promise(resolve => setTimeout(resolve, timeToThink));
    }

    scoreFields() {
        return [this.gamefields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length,
        this.gamefields[1].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length];
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

    async simulateInitialPlacement(uiGamefield) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            const creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
            const building = createEntity(EntityType.FACTORY);
            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                setTimeout(() => {
                    this.actions.finishTurn({ issuer: this.player.id });
                }, 3000);
            }).catch(error => {
                if (error instanceof BattlechocError) {
                    console.warn(error);
                } else {
                    throw error;
                }
            });
        }
    }

    estimateAttackTarget() {
        let unveiledFactories = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledCannons = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFruitCannons = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FRUIT_CANNON) && !this.discoveredShieldedCells.includes(cell));
        let unveiledBallistas = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.HOT_CHOCOLATE_BALLISTA) && !this.discoveredShieldedCells.includes(cell));
        let unveiledFactoryExtensions = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY_EXTENSION) && !this.discoveredShieldedCells.includes(cell));
        let unveiledTrees = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.CACAOTREE) && !this.discoveredShieldedCells.includes(cell));
        let unveiledSpyingEasterBunny = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY) && !this.discoveredShieldedCells.includes(cell));
        let unveiledXmasFactory = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.XMAS_FACTORY) && !this.discoveredShieldedCells.includes(cell));
        let creamedCells = this.opponentBoard.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && !this.discoveredShieldedCells.includes(cell));

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
        var patch = [];
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
        let unveiledFountains = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.CHOCOLATE_FOUNTAIN));
        if (unveiledFountains.length > 0) {
            return unveiledFountains[0];
        } else if (this.discoveredShieldedCells.length > 0) {
            let cellsToVisit = this.getCellPatch3x3(this.discoveredShieldedCells[0], this.opponentBoard.grid);
            let unvisitedCells = cellsToVisit.filter(cell => !this.visitedShieldedCells.includes(cell));
            if (unvisitedCells.length > 0) {
                this.visitedShieldedCells.push(unvisitedCells[0]);
                return unvisitedCells[0];
            } else {
                return cellsToVisit[0];
            }
        } else {
            return this.opponentBoard.grid[Math.floor(Math.random() * this.opponentBoard.grid.length)];
        }
    }

    handleAttackError(error) {
        if (error instanceof BattlechocError) {
            console.warn(error.message);
            this.actions.finishTurn({ issuer: this.player.id });
        } else {
            throw error;
        }
    }

    simulateAttack(target, attackType, gamefield3d, opponentGameField3d) {
        this.actions.attack({
            issuer: this.player.id,
            attackType: attackType,
            row: target.row,
            col: target.col
        }).then(() => {
            this.refreshGameState();
            if (attackType === AttackType.BUNNY) {
                if (this.player.attacksPerTurn[AttackType.BUNNY] > 0) {
                    opponentGameField3d.attack({ row: target.row, col: target.col }, AttackType.BUNNY);
                } else {
                    gamefield3d.meltDownEasterBunny();
                    opponentGameField3d.receiveBallista({ row: target.row, col: target.col });
                }
            } else {
                const attackedCell = this.opponentBoard.grid[target.row * this.boardSize.cols + target.col];
                if (attackedCell.shielded !== true || (attackType !== AttackType.TRUFFLE && attackType !== AttackType.FRUIT)) {
                    opponentGameField3d.attack({ row: target.row, col: target.col }, attackType);
                    if (attackType === AttackType.HOT_CHOCOLATE) {
                        opponentGameField3d.rebuild(this.opponentBoard);
                    }
                }
            }
            this.simulateAttackPhase(gamefield3d, opponentGameField3d);
        }).catch(error => this.handleAttackError(error));
    }

    async simulateAttackPhase(gamefield3d, opponentGameField3d) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            let creamyFields = this.opponentBoard.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));

            if (this.player.attacks[AttackType.BUNNY] > 0 && creamyFields.length) {
                let target = creamyFields[Math.floor(Math.random() * creamyFields.length)];
                console.log('OPPONENT BUNNY IS GOING TO SPY :', target);
                this.simulateAttack(target, AttackType.BUNNY, gamefield3d, opponentGameField3d);
            } else if (this.player.attacks[AttackType.HOT_CHOCOLATE] > 0) {
                let target;
                if (this.discoveredShieldedCells.length > 0) {
                    target = this.discoveredShieldedCells[0];
                    this.discoveredShieldedCells.splice(this.discoveredShieldedCells.indexOf(target), 1);
                } else {
                    target = this.estimateAttackTarget();
                }
                this.simulateAttack(target, AttackType.HOT_CHOCOLATE, gamefield3d, opponentGameField3d);
            } else if (this.player.attacks[AttackType.FRUIT] > 0) {
                let target = this.estimateFruitAttackTarget();
                this.simulateAttack(target, AttackType.FRUIT, gamefield3d, opponentGameField3d);
            } else if (this.player.attacks[AttackType.TRUFFLE] > 0) {
                let target = this.estimateAttackTarget();
                if (target.shielded === true) {
                    this.discoveredShieldedCells.push(target);
                }
                this.simulateAttack(target, AttackType.TRUFFLE, gamefield3d, opponentGameField3d);
            } else {
                this.actions.finishTurn({ issuer: this.player.id });
            }
        }
    }

    getBestCellsForBuilding(cells, building) {
        if (building === EntityType.FACTORY) {
            return cells.filter(cell => cell.type === BoardCellTypes.BLACK);
        } else if (building === EntityType.CACAOTREE) {
            return cells.filter(cell => cell.type === BoardCellTypes.WHITE);
        } else if (building === EntityType.FRUIT_CANNON) {
            return this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
        } else if (building === EntityType.CHOCOLATE_FOUNTAIN) {
            const creamedPossible = cells.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
            console.log(creamedPossible.length);
            if (creamedPossible.length > 0) {
                return creamedPossible;
            } else {
                return cells.filter(cell => cell.occupiedBy.length === 0 || (cell.occupiedBy.length === 1 && cell.occupiedBy.includes(EntityType.CREAM)));
            }
        } else {
            return cells;
        }
    }

    setBuildingAtBestPosition(possibleCells, building, uiGamefield) {
        return new Promise((resolve, reject) => {
            let bestCellsForBuilding = this.getBestCellsForBuilding(possibleCells, building);
            let targetCell = (bestCellsForBuilding.length > 0) ? bestCellsForBuilding[Math.floor(Math.random() * bestCellsForBuilding.length)] : possibleCells[Math.floor(Math.random() * possibleCells.length)];
            console.log('DEV HINT: ', building.type, targetCell.row, targetCell.col);

            building.position = {
                row: targetCell.row,
                col: targetCell.col
            }

            this.actions.build({ issuer: this.player.id, building: building }).then(() => {
                uiGamefield.setBuilding(building.type, { row: targetCell.row, col: targetCell.col });
                resolve();
            }).catch(error => { reject(error); });
        });
    }

    handleBuildError(error) {
        if (error instanceof BattlechocError) {
            console.warn(error);
        } else {
            throw error;
        }
        this.actions.finishBuildPhase({ issuer: this.player.id });
    }

    simulateBuildPhaseDefensive(uiGamefield) {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const uncoveredBuildings = this.board.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length > 0);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.XMAS_FACTORY)).length;
        const fountainCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CHOCOLATE_FOUNTAIN)).length;
        const factoryCell = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.FACTORY));

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON);
        const tree = getEntityDescriptor(EntityType.CACAOTREE);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY);
        const cream = getEntityDescriptor(EntityType.CREAM);
        const fountain = getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN);

        if (uncoveredBuildings.length > 0 && cacao > cream.costs) {
            this.setBuildingAtBestPosition(uncoveredBuildings, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= fountain.costs && fountainCount < 1 && factoryCell.length > 0) {
            const fountainCells = this.getCellPatch3x3(factoryCell[0], this.board.grid);
            this.setBuildingAtBestPosition(fountainCells, createEntity(EntityType.CHOCOLATE_FOUNTAIN), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0) {
            this.setBuildingAtBestPosition(creamedCells, createEntity(EntityType.SPYING_EASTER_BUNNY), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 2) {
            this.setBuildingAtBestPosition(creamedCells, createEntity(EntityType.XMAS_FACTORY), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 4) {
                building = createEntity(EntityType.CACAOTREE);
            } else if (cannonCount < 2 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 1 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.floor(Math.random() * 3);
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE);
                } else if (decision === 1) {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                } else {
                    building = createEntity(EntityType.CREAM);
                    creamedCells = freeCells;
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (freeCells.length > 0 && cacao >= cream.costs) {
            this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    simulateBuildPhaseAggressive(uiGamefield) {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.XMAS_FACTORY)).length;

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON);
        const tree = getEntityDescriptor(EntityType.CACAOTREE);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY);
        const cream = getEntityDescriptor(EntityType.CREAM);

        if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0) {
            const building = createEntity(EntityType.SPYING_EASTER_BUNNY);
            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 1) {
            const building = createEntity(EntityType.XMAS_FACTORY);
            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 2) {
                building = createEntity(EntityType.CACAOTREE);
            } else if (cannonCount < 6 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 2 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.round(Math.random());
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE);
                } else {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (freeCells.length > 0 && cacao >= cream.costs) {
            this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    simulateBuildPhaseBalanced(uiGamefield) {
        const cacao = this.player.cacao;

        let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
        const freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);

        const treeCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE)).length;
        const bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length;
        const cannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length;
        const fruitCannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.FRUIT_CANNON)).length;
        const xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.XMAS_FACTORY)).length;
        const fountainCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CHOCOLATE_FOUNTAIN)).length;
        const factoryCell = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.FACTORY)).length;

        const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON);
        const fruitCannon = getEntityDescriptor(EntityType.FRUIT_CANNON);
        const tree = getEntityDescriptor(EntityType.CACAOTREE);
        const xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY);
        const easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY);
        const cream = getEntityDescriptor(EntityType.CREAM);
        const fountain = getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN);

        if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0) {
            let building = createEntity(EntityType.SPYING_EASTER_BUNNY);
            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 2) {
            let building = createEntity(EntityType.XMAS_FACTORY);
            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && cacao >= fountain.costs && fountainCount < 1 && factoryCell.length > 0) {
            const building = createEntity(EntityType.CHOCOLATE_FOUNTAIN);
            const fountainCells = this.getCellPatch3x3(factoryCell[0], this.board.grid);
            this.setBuildingAtBestPosition(fountainCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
            let building;
            if (treeCount < 2) {
                building = createEntity(EntityType.CACAOTREE);
            } else if (cannonCount < 3 && cacao >= cannon.costs) {
                building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
            } else if (cacao >= fruitCannon.costs && fruitCannonCount < 1 && cannonCount > 0 && this.discoveredShieldedCells.length > 0) {
                building = createEntity(EntityType.FRUIT_CANNON);
                creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
            } else {
                const decision = Math.round(Math.random());
                if (decision === 0 || cacao < cannon.costs) {
                    building = createEntity(EntityType.CACAOTREE);
                } else {
                    building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                }
            }

            this.setBuildingAtBestPosition(creamedCells, building, uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else if (freeCells.length > 0 && cacao >= cream.costs) {
            this.setBuildingAtBestPosition(freeCells, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                this.simulateBuildPhase(uiGamefield);
            }).catch(error => this.handleBuildError(error));
        } else {
            this.actions.finishBuildPhase({ issuer: this.player.id });
        }
    }

    async simulateBuildPhase(uiGamefield) {
        await this.simulateThinking(1000);
        this.refreshGameState();
        if (this.gameIsRunning) {
            if (this.player.buildings === 0) {
                this.actions.finishBuildPhase({ issuer: this.player.id });
            } else {
                if (this.type === AugustusType.BALANCED) {
                    this.simulateBuildPhaseBalanced(uiGamefield);
                } else if (this.type === AugustusType.AGGRESSIVE) {
                    this.simulateBuildPhaseAggressive(uiGamefield);
                } else if (this.type === AugustusType.DEFENSIVE) {
                    this.simulateBuildPhaseDefensive(uiGamefield);
                }
            }
        }
    }
}

export { PlayerType, createPlayer, playerHasAttacksPerTurn, playerHasHarmfulAttacksPerTurn, playerHasAttacks, Augustus };