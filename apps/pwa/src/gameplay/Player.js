import uuidv4 from 'uuid/v4';
import { BuildingType, getEntity } from './GameEntities';
import { NoBuildingsLeftError, NoCacaoLeftError } from './Errors';

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
        let possibleCells = [];

        gamefield.grid.forEach(cell => {
            if (cell.occupiedBy.includes(BuildingType.CREAM)) {
                possibleCells.push(cell);
            }
        });

        let randomCell = possibleCells[Math.floor(Math.random()*possibleCells.length)];
        let randomPosition = {
            x: randomCell.row * uiGamefield.fieldSize,
            y: 0,
            z: randomCell.col * uiGamefield.fieldSize
        }

        setTimeout(() => {
            let building = getEntity(BuildingType.FACTORY);
            building.position = {
              row: randomPosition.x / uiGamefield.fieldSize,
              col: randomPosition.z / uiGamefield.fieldSize
            }   
            console.log(building) 
            this.actions.build(building).then(() => {
              uiGamefield.setBuilding(randomPosition, building.type);
              this.actions.finishTurn();
            }).catch(error => {
              if (error instanceof NoBuildingsLeftError) {
                console.log(error.message);
              } else if (error instanceof NoCacaoLeftError) {
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

    simulateBuildPhase() {
        setTimeout(() => {
            this.actions.finishBuildPhase();
        }, 3000);   
    }
}

export { PlayerType, createPlayer, Augustus };