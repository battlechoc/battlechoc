import * as THREE from 'three';
import Building from './Building.js';
import { EntityType, BoardCellTypes } from './gameplay/GameEntities';
import AssetLoader from './AssetLoader.js';

class Gamefield {
    constructor(isPlayerGameField, position, playerField) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = 8;
        this.cols = 8;
        this.fieldSize = 8;
        this.position = position;

        this.buildings = [...Array(this.rows)].map(
            field => Array(this.cols).fill([ new Building(EntityType.EMPTY) ])
        );

        this.build(playerField);
    }

    async build(playerField) {
        this.gameField = new THREE.Group();
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                let cell = playerField.grid[i * this.cols + j];
                let fieldClone = undefined;

                if (cell.type === BoardCellTypes.WHITE) {
                    fieldClone = AssetLoader.models[0].scene.clone();
                } else if (cell.type === BoardCellTypes.BROWN) {
                    fieldClone = AssetLoader.models[1].scene.clone();
                } else if (cell.type === BoardCellTypes.BLACK) {
                    fieldClone = AssetLoader.models[2].scene.clone();
                }

                let field = fieldClone.children[0]
                field.position.set(this.fieldSize * i, 0, this.fieldSize * j);
                
                this.gameField.add(field);

                if (cell.occupiedBy.includes(EntityType.CREAM)) {
                    this.setBuilding(field.position, EntityType.CREAM);
                }
            }
        }

        this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
    }

    getClickableFields() {
        return this.gameField.children;
    }

    animate(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }       
    }

    triggerExplosion(building, position) {
        if (typeof this.mixer !== 'undefined') {
            this.mixer.stopAllAction();
            this.explosionCallback();
        }

        this.gameField.remove(building.getModel());

        building.explode();
        building.adjustPosition(position);
        this.gameField.add(building.getModel());

        this.mixer = new THREE.AnimationMixer(building.getModel());
        let animationNumber = 8;

        if (building.entityType === EntityType.CACAOTREE) {
            animationNumber = 9;
        } else if (building.entityType === EntityType.FACTORY) {
            animationNumber = 10;
        } else if (building.entityType === EntityType.RUM_TRUFFLE_CANNON) {
            animationNumber = 11;
        }

        for (let i = 0; i < AssetLoader.models[animationNumber].animations.length; i++) {
            this.mixer.clipAction(AssetLoader.models[animationNumber].animations[i]).setLoop(THREE.LoopOnce).play()
        }

        this.explosionCallback = () => {
            this.mixer = undefined;
            this.gameField.remove(building.getModel());
        }

        this.mixer.addEventListener('finished', () => this.explosionCallback());
    }

    attack(position) {
        let row = position.x / this.fieldSize;
        let col = position.z / this.fieldSize;
        let creamyBuildings = this.buildings[row][col].filter(building => building.entityType === EntityType.CREAM);

        if (creamyBuildings.length > 0) {
            let cream = creamyBuildings[0];
            this.triggerExplosion(cream, position);

            let otherBuildings = this.buildings[row][col].filter(building => building.entityType !== EntityType.CREAM);
            otherBuildings.forEach(otherBuilding => {
                otherBuilding.show();
            });

            setTimeout(() => {
                otherBuildings.forEach(otherBuilding => {
                    this.triggerExplosion(otherBuilding, position);
                });                
                this.buildings[row][col] = [ new Building(EntityType.EMPTY) ];
            }, 1000);
        } else {
            this.buildings[row][col].forEach(building => {
                this.triggerExplosion(building, position);
            });
            this.buildings[row][col] = [ new Building(EntityType.EMPTY) ];
        }
    }
    
    isAboveOfFactory(row, col) {
        if ((col + 1) < this.fieldSize) {
            return this.cellContains(row, col + 1, EntityType.FACTORY);
        } else {
            return false;
        }
    }

    isRightToFactory(row, col) {
        if ((row + 1) < this.fieldSize) {
            return this.cellContains(row + 1, col, EntityType.FACTORY);
        } else {
            return false;
        }
    }

    isBelowOfFactory(row, col) {
        if ((col - 1) >= 0) {
            return this.cellContains(row, col - 1, EntityType.FACTORY);
        } else {
            return false
        }
    }

    isLeftToFactory(row, col) {
        if ((row - 1) >= 0) {
            return this.cellContains(row - 1, col, EntityType.FACTORY);
        } else {
            return false;
        }
    }

    cellContains(row, col, entityType) {
        return this.buildings[row][col].filter(building => building.entityType === entityType).length > 0;
    }

    setBuilding(position, entityType) {       
        const row = position.x / this.fieldSize;
        const col = position.z / this.fieldSize;

        let building = new Building(entityType);

        if (entityType === EntityType.FACTORY_EXTENSION) {
            if (this.isAboveOfFactory(row, col)) {
                building.rotate(Math.PI);
            } else if (this.isRightToFactory(row, col)) {
                building.rotate(-Math.PI / 2);
            } else if (this.isLeftToFactory(row, col)) {
                building.rotate(Math.PI / 2);
            } else if (!this.isBelowOfFactory(row, col)) {
                return undefined;
            }
        } 

        building.adjustPosition(position);

        if (entityType === EntityType.CREAM && this.isPlayerGameField) {
            building.makeTransparent();
            let otherBuildings = this.buildings[row][col].filter(building => building.entityType !== EntityType.CREAM && building.entityType !== EntityType.EMPTY);
            if (otherBuildings.length > 0) {
                building.hide();
                this.buildings[row][col].forEach(other => {
                    if (other.entityType !== EntityType.CREAM &&
                        other.entityType !== EntityType.EMPTY) {
                        other.makeCreamy();
                    }
                });
            }
        }
        
        this.gameField.add(building.getModel());

        if (this.cellContains(row, col, EntityType.CREAM)) {
            this.buildings[row][col].push(building);
            if (this.isPlayerGameField === false) {
                building.hide();
            } else {
                building.makeCreamy();
                this.buildings[row][col].forEach(cream => {
                    if (cream.entityType === EntityType.CREAM) {
                        cream.hide();
                    }
                });
            }
        } else {
            this.buildings[row][col] = [building];
        }
    }
}

export default Gamefield;