import uuidv4 from 'uuid/v4';
import { BuildingType, getEntity } from './GameEntities';
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
        const scores = [board.fields[0].grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM)).length,
        board.fields[0].grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM)).length];
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
            const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM));
            const building = getEntity(BuildingType.FACTORY);
            this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                this.actions.finishTurn({ issuer: this.player.id });
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

    simulateAttack(gamefield, uiGamefield, attacks) {
        this.startThinking(() => {
            let cellToAttack = undefined;
            const unveiledFactories = gamefield.grid.filter(cell => !cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.includes(BuildingType.FACTORY));
            if (unveiledFactories.length > 0) {
                cellToAttack = unveiledFactories[0];
            } else {
                const unveiledCannons = gamefield.grid.filter(cell => !cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.includes(BuildingType.RUM_TRUFFLE_CANNON));
                if (unveiledCannons.length > 0) {
                    cellToAttack = unveiledCannons[0];
                } else {
                    const unveiledFactoryExtensions = gamefield.grid.filter(cell => !cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.includes(BuildingType.FACTORY_EXTENSION));
                    if (unveiledFactoryExtensions.length > 0) {
                        cellToAttack = unveiledFactoryExtensions[0];
                    } else {
                        const unveiledTrees = gamefield.grid.filter(cell => !cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.includes(BuildingType.CACAOTREE));
                        if (unveiledTrees.length > 0) {
                            cellToAttack = unveiledTrees[0];
                        } else {
                            const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM));
                            if (creamedCells.length > 0) {
                                cellToAttack = creamedCells[Math.floor(Math.random() * creamedCells.length)];
                            } else {
                                cellToAttack = gamefield.grid[Math.floor(Math.random() * gamefield.grid.length)];
                            }
                        }
                    }
                }
            }

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
                const creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.length === 1);
                const freeCells = gamefield.grid.filter(cell => cell.occupiedBy.length === 0);
                const treeCount = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CACAOTREE));
                const cannonCount = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.RUM_TRUFFLE_CANNON));
                const cannon = getEntity(BuildingType.RUM_TRUFFLE_CANNON);
                const tree = getEntity(BuildingType.CACAOTREE);
                const cream = getEntity(BuildingType.CREAM);
                if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
                    let building;
                    if (treeCount < 2) {
                        building = tree;
                    } else if (cannonCount < 3 && cacao >= cannon.costs) {
                        building = cannon;
                    } else {
                        const decision = Math.round(Math.random());
                        if (decision === 0 || cacao < cannon.costs) {
                            building = tree;
                        } else {
                            building = cannon;
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
                    let building = cream;
                    this.setBuildingAtRandomPosition(freeCells, building, uiGamefield).then(() => {
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