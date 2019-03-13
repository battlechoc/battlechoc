import uuidv4 from 'uuid/v4';
import { EntityType, createEntity, getEntityDescriptor } from './GameEntities';
import { NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError, NoAttacksLeftError, TargetEmptyError, InvalidActionIssuer } from './Errors';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

function createPlayer(name, type, activePlayer) {
    return {
        name: name,
        type: type,
        id: uuidv4(),
        cacao: 50,
        cacaoPerTurn: 0,
        buildings: 0,
        buildingsPerTurn: 0,
        attacks: 0,
        attacksPerTurn: 0,
        fruitAttacks: 0,
        fruitAttacksPerTurn: 0,
        hotChocolateAttacks: 0,
        hotChocolateAttacksPerTurn: 0,
        hasFactory: false
    };
}

class Augustus {
    constructor(actions, player) {
        this.actions = actions;
        this.attackedCells = [];
        this.timers = [];
    }

    stopThinking() {
        while (this.timers.length > 0) {
            clearTimeout(this.timers[0]);
            this.timers.splice(0, 1);
        }
    }

    startThinking(thoughts) {
        let timer = setTimeout(() => {
            thoughts();
            let index = this.timers.indexOf(timer);
            if (index > -1) {
                this.timers.splice(index, 1);
            }
        }, 1500);
        this.timers.push(timer);
    }

    scoreFields(board) {
        const scores = [board.fields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length,
        board.fields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length];
        return scores;
    }

    simulateChooseFieldOrStartDecision(board) {
        this.startThinking(() => {
            const scores = this.scoreFields(board);
            if (scores[0] === scores[1]) {
                this.actions.chooseStart({ issuer: this.player.id });
            } else if (scores[0] > scores[1]) {
                this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
            } else {
                this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
            }
        });
    }

    simulateChooseFieldDecision(board) {
        this.startThinking(() => {
            const scores = this.scoreFields(board);
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
        });
    }

    simulateInitialPlacement(gamefield, uiGamefield) {
        this.startThinking(() => {
            const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
            const building = createEntity(EntityType.FACTORY);
            this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                setTimeout(() => {
                    this.actions.finishTurn({ issuer: this.player.id });
                }, 3000);
            }).catch(error => {
                if (error instanceof NoBuildingsLeftError) {
                    console.log(error.message);
                } else if (error instanceof NoCacaoLeftError) {
                    console.log(error.message);
                } else if (error instanceof BuildNotPossibleError) {
                    console.log(error.message);
                } else if (error instanceof InvalidActionIssuer) {
                    console.log(error.message);
                } else {
                    throw error;
                }
            });
        });
    }

    estimateCellToAttack(gamefield) {
        const unveiledFactories = gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY));
        const unveiledCannons = gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
        const unveiledFactoryExtensions = gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY_EXTENSION));
        const unveiledTrees = gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.CACAOTREE));
        const unveiledSpyingEasterBunny = gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY));
        const unveiledXmasFactory= gamefield.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.XMAS_FACTORY));
        const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));

        if (unveiledFactories.length > 0) {
            return unveiledFactories[0];
        } else if (unveiledFactoryExtensions.length > 0) {
            return unveiledFactoryExtensions[0];
        } else if (unveiledSpyingEasterBunny.length > 0) {
            return unveiledSpyingEasterBunny[0];
        } else if (unveiledCannons.length > 0) {
            return unveiledCannons[0];
        } else if (unveiledTrees.length > 0) {
            return unveiledTrees[0];
        } else if (unveiledXmasFactory.length > 0) {
            return unveiledXmasFactory[0];
        } else if (creamedCells.length > 0) {
            return creamedCells[Math.floor(Math.random() * creamedCells.length)];
        } else {
            return gamefield.grid[Math.floor(Math.random() * gamefield.grid.length)];
        }        
    }

    simulateAttack(gamefield, uiGamefield, attacks) {
        this.startThinking(() => {
            let cellToAttack = this.estimateCellToAttack(gamefield);

            this.actions.attack({
                issuer: this.player.id,
                row: cellToAttack.row,
                col: cellToAttack.col
            }).then(() => {
                uiGamefield.attack({ x: cellToAttack.row * uiGamefield.fieldSize, y: 0, z: cellToAttack.col * uiGamefield.fieldSize });
            }).catch(error => {
                if (error instanceof NoAttacksLeftError) {
                    console.log(error.message);
                } else if (error instanceof TargetEmptyError) {
                    console.log(error.message);
                } else {
                    throw error;
                }
            });

            if (attacks > 1) {
                this.simulateAttack(gamefield, uiGamefield, attacks - 1);
            } else {
                this.actions.finishTurn({ issuer: this.player.id });
            }
        });
    }

    simulateAttackPhase(gamefield, uiGamefield, attacks) {
        this.simulateAttack(gamefield, uiGamefield, attacks);
    }

    setBuildingAtRandomPosition(possibleCells, building, uiGamefield) {
        return new Promise((resolve, reject) => {
            let randomCell = possibleCells[Math.floor(Math.random() * possibleCells.length)];
            console.log('DEV HINT: ', randomCell);
            let randomPosition = {
                x: randomCell.row * uiGamefield.fieldSize,
                y: 0,
                z: randomCell.col * uiGamefield.fieldSize
            }
            building.position = {
                row: randomPosition.x / uiGamefield.fieldSize,
                col: randomPosition.z / uiGamefield.fieldSize
            }

            this.actions.build({ issuer: this.player.id, building: building }).then(() => {
                uiGamefield.setBuilding(randomPosition, building.type);
                resolve();
            }).catch(error => { reject(error); });
        });
    }

    simulateBuild(gamefield, buildingsToBuild, cacao, uiGamefield) {
        this.startThinking(() => {
            if (buildingsToBuild === 0) {
                this.actions.finishBuildPhase({ issuer: this.player.id });
            } else {
                const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
                const freeCells = gamefield.grid.filter(cell => cell.occupiedBy.length === 0);
                const treeCount = gamefield.grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE));
                const cannonCount = gamefield.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
                const cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON);
                const tree = getEntityDescriptor(EntityType.CACAOTREE);
                const cream = getEntityDescriptor(EntityType.CREAM);
                if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
                    let building;
                    if (treeCount < 2) {
                        building = createEntity(EntityType.CACAOTREE);
                    } else if (cannonCount < 3 && cacao >= cannon.costs) {
                        building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                    } else {
                        const decision = Math.round(Math.random());
                        if (decision === 0 || cacao < cannon.costs) {
                            building = createEntity(EntityType.CACAOTREE);
                        } else {
                            building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                        }
                    }

                    this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                        this.simulateBuild(gamefield, buildingsToBuild - 1, cacao - building.costs, uiGamefield);
                    }).catch(error => {
                        if (error instanceof NoBuildingsLeftError) {
                            console.log(error.message);
                        } else if (error instanceof NoCacaoLeftError) {
                            console.log(error.message);
                        } else if (error instanceof BuildNotPossibleError) {
                            console.log(error.message);
                        } else if (error instanceof InvalidActionIssuer) {
                            console.log(error.message);
                        } else {
                            throw error;
                        }
                        this.actions.finishBuildPhase({ issuer: this.player.id });
                    });
                } else if (freeCells.length > 0 && cacao >= cream.costs) {
                    this.setBuildingAtRandomPosition(freeCells, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                        this.simulateBuild(gamefield, buildingsToBuild - 1, cacao - cream.costs, uiGamefield);
                    }).catch(error => {
                        if (error instanceof NoBuildingsLeftError) {
                            console.log(error.message);
                        } else if (error instanceof NoCacaoLeftError) {
                            console.log(error.message);
                        } else if (error instanceof BuildNotPossibleError) {
                            console.log(error.message);
                        } else if (error instanceof InvalidActionIssuer) {
                            console.log(error.message);
                        } else {
                            throw error;
                        }
                        this.actions.finishBuildPhase({ issuer: this.player.id });
                    });
                } else {
                    this.actions.finishBuildPhase({ issuer: this.player.id });
                }
            }
        });
    }

    simulateBuildPhase(gamefield, buildingsToBuild, cacao, uiGamefield) {
        this.simulateBuild(gamefield, buildingsToBuild, cacao, uiGamefield);
    }
}

export { PlayerType, createPlayer, Augustus };