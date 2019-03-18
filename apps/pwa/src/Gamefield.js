import * as THREE from 'three';
import Building from './Building.js';
import { EntityType, AttackType, BoardCellTypes } from './gameplay/GameEntities';
import AssetLoader from './AssetLoader.js';

class Gamefield {
    constructor(isPlayerGameField, position, playerField, fieldIdx) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = 8;
        this.cols = 8;
        this.fieldSize = 8;
        this.position = position;
        this.fieldIdx = fieldIdx;

        this.buildings = [...Array(this.rows)].map(
            field => Array(this.cols).fill([new Building(EntityType.EMPTY)])
        );

        this.grid = [...Array(this.rows)].map(
            field => new Array(this.cols)
        );

        this.build(playerField);
    }

    async build(playerField) {
        this.gameField = new THREE.Group();

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                let cell = playerField.grid[row * this.cols + col];
                let fieldClone = undefined;

                const assets = AssetLoader.assets.models;
                if (cell.type === BoardCellTypes.WHITE) {
                    fieldClone = assets['WHITE_TILE'].model.scene.clone();
                } else if (cell.type === BoardCellTypes.BROWN) {
                    fieldClone = assets['BROWN_TILE'].model.scene.clone();
                } else if (cell.type === BoardCellTypes.BLACK) {
                    fieldClone = assets['BLACK_TILE'].model.scene.clone();
                }

                let field = fieldClone.children[0];
                field.position.set(this.fieldSize * row, 0, this.fieldSize * col);
                field.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child._cellIdx = { row: row, col: col };
                        child._fieldIdx = this.fieldIdx;
                    }
                });
                this.gameField.add(field);
                this.grid[row][col] = field;

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
        const assets = AssetLoader.assets.models;

        let explosion = assets.CREAM_EXPLOSION;

        if (building.entityType === EntityType.CACAOTREE) {
            explosion = assets.CACAOTREE_EXPLOSION;
        } else if (building.entityType === EntityType.FACTORY) {
            explosion = assets.FACTORY_EXPLOSION;
        } else if (building.entityType === EntityType.RUM_TRUFFLE_CANNON) {
            explosion = assets.RUM_TRUFFLE_CANNON_EXPLOSION;
        } else if (building.entityType === EntityType.SPYING_EASTER_BUNNY) {
            explosion = assets.SPYING_EASTER_BUNNY_EXPLOSION;
        } else if (building.entityType === EntityType.XMAS_FACTORY) {
            explosion = assets.XMAS_FACTORY_EXPLOSION;
        } else if (building.entityType === EntityType.HOT_CHOCOLATE_BALISTA) {
            explosion = assets.HOT_CHOCOLATE_BALISTA_EXPLOSION;
        }

        for (let i = 0; i < explosion.model.animations.length; i++) {
            this.mixer.clipAction(explosion.model.animations[i]).setLoop(THREE.LoopOnce).play()
        }

        this.explosionCallback = () => {
            this.mixer = undefined;
            this.gameField.remove(building.getModel());
        }

        this.mixer.addEventListener('finished', () => this.explosionCallback());
    }

    attack(position, attackType) {
        let row = position.x / this.fieldSize;
        let col = position.z / this.fieldSize;
        let creamyBuildings = this.buildings[row][col].filter(building => building.entityType === EntityType.CREAM);

        if (attackType === AttackType.TRUFFLE || attackType === AttackType.HOT_CHOCOLATE) {
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
                    this.buildings[row][col] = [new Building(EntityType.EMPTY)];
                }, 1000);
            } else {
                this.buildings[row][col].forEach(building => {
                    this.triggerExplosion(building, position);
                });
                this.buildings[row][col] = [new Building(EntityType.EMPTY)];
            }

            if (attackType === AttackType.HOT_CHOCOLATE) {
                this.this.grid[row][col].traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.visible = false;
                    }
                });
            }
        } else if (attackType === AttackType.BUNNY) {
            // check if bunny got destroyed (player.attacksPerTurn[BUNNY] === 0)
            // if not desotryed explode creams
            // if destroyed --> replace xmas factory building with balista and destroy the factory
        } else if (attackType === AttackType.FRUIT) {

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

        let building = new Building(entityType, { col: col, row: row }, this.fieldIdx);

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