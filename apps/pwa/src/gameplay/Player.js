import uuidv4 from 'uuid/v4';
import { BuildingType, getEntity } from './GameEntities';
import { NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError } from './Errors';

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
    constructor(actions) {
        this.actions = actions;
    }

    simulateChooseFieldOrStartDecision() {
        setTimeout(() => {
            let decision = Math.floor(Math.random() * 3);

            if (decision === 0) {
                this.actions.chooseStart();
            } else if (decision === 1) {
                this.actions.chooseField(0);
            } else {
                this.actions.chooseField(1);
            }
        }, 3000);
    }

    simulateChooseFieldDecision() {
        setTimeout(() => {
            let decision = Math.round(Math.random());

            if (decision === 0) {
                this.actions.chooseField(0);
            } else {
                this.actions.chooseField(1);
            }
        }, 3000);
    }

    simulateInitialPlacement(gamefield, uiGamefield) {        
        setTimeout(() => {
            let creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM));
            let building = getEntity(BuildingType.FACTORY);

            this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                this.actions.finishTurn();
            }).catch(error => {
                if (error instanceof NoBuildingsLeftError) {
                  console.log(error.message);
                } else if (error instanceof NoCacaoLeftError) {
                  console.log(error.message);
                } else if (error instanceof BuildNotPossibleError) {
                  console.log(error.message);
                } else {
                  throw error;
                }
            });
        }, 3000);     
    }

    simulateAttackPhase() {
        setTimeout(() => {
            this.actions.finishTurn();
        }, 3000);    
    }

    setBuildingAtRandomPosition(possibleCells, building, uiGamefield) {
        return new Promise((resolve, reject) => {
            let randomCell = possibleCells[Math.floor(Math.random()*possibleCells.length)];
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

            this.actions.build(building).then(() => {
                uiGamefield.setBuilding(randomPosition, building.type);
                resolve();
            }).catch(error => { reject(error); });
        });
    }

    simulateBuildPhase(gamefield, uiGamefield) {
        setTimeout(() => {
            let creamedCells = gamefield.grid.filter(cell => cell.occupiedBy.includes(BuildingType.CREAM) && cell.occupiedBy.length === 1);
            let freeCells = gamefield.grid.filter(cell => cell.occupiedBy.length === 0);
            
            if (creamedCells.length > 0) {
                let building = getEntity(BuildingType.CACAOTREE);
                this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                this.actions.finishBuildPhase();
                }).catch(error => {
                    if (error instanceof NoBuildingsLeftError) {
                      console.log(error.message);
                    } else if (error instanceof NoCacaoLeftError) {
                      console.log(error.message);
                    } else if (error instanceof BuildNotPossibleError) {
                      console.log(error.message);
                    } else {
                      throw error;
                    }
                });
            } else if (freeCells.length > 0) {
                let building = getEntity(BuildingType.CREAM);
                this.setBuildingAtRandomPosition(freeCells, building, uiGamefield).then(() => {
                this.actions.finishBuildPhase();
                }).catch(error => {
                    if (error instanceof NoBuildingsLeftError) {
                      console.log(error.message);
                    } else if (error instanceof NoCacaoLeftError) {
                      console.log(error.message);
                    } else if (error instanceof BuildNotPossibleError) {
                      console.log(error.message);
                    } else {
                      throw error;
                    }
                });                
            } else {
                this.actions.finishBuildPhase();
            }
        }, 3000);   
    }
}

export { PlayerType, createPlayer, Augustus };