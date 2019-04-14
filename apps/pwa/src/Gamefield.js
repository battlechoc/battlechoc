import * as THREE from 'three';
import Building from './Building.js';
import { EntityType, AttackType, BoardCellTypes } from './gameplay/GameEntities';
import AssetLoader from './AssetLoader.js';

class Gamefield {
    constructor(isPlayerGameField, position, playerField, fieldIdx, size) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = size.rows;
        this.cols = size.cols;
        this.fieldSize = 8;
        this.position = position;
        this.fieldIdx = fieldIdx;

        this.buildings = [...Array(this.rows)].map(
            field => Array(this.cols).fill([])
        );

        this.gameField = new THREE.Group();
        this.build(playerField, false);
    }

    build(playerField, rebuild) {
        const assets = AssetLoader.assets.models;
        let pivot = assets['FIELD'].model.scene.children[0];
        let materialMap = assets['FIELD'].model.scene.children[1];

        let materials = [materialMap.children[0].material, materialMap.children[1].material, materialMap.children[2].material];
        let board = new THREE.Mesh(new THREE.Geometry(), materials);
        playerField.grid.forEach((cell, i) => {
            if (!cell.molten) {
                let materialIndex = 1;
                if (cell.type === BoardCellTypes.BROWN) {
                    materialIndex = 2;
                } else if (cell.type === BoardCellTypes.BLACK) {
                    materialIndex = 0;
                }

                let geometryLowerBound = board.geometry.faces.length;

                pivot.position.set(this.fieldSize * cell.row, 0, this.fieldSize * cell.col);
                pivot.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.updateMatrix();
                        let geometry = new THREE.Geometry().fromBufferGeometry(child.geometry);
                        geometry.faces.forEach(face => {
                            face.materialIndex = materialIndex;
                        });
                        board.geometry.merge(geometry, child.matrix);
                    }
                });

                for (let i = geometryLowerBound; i < board.geometry.faces.length; i++) {
                    board.geometry.faces[i]._cellIdx = { row: cell.row, col: cell.col };
                    board.geometry.faces[i]._fieldIndex = this.fieldIdx;
                }

                if (cell.occupiedBy.includes(EntityType.CREAM) && !rebuild) {
                    this.setBuilding(EntityType.CREAM, { row: cell.row, col: cell.col });
                }
            }
        });

        board.groupsNeedUpdate = true;
        board.geometry.sortFacesByMaterialIndex();
        board.name = 'BOARD' + this.fieldIdx;

        this.gameField.add(board);
        this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
    }

    rebuild(playerField) {
        let board = this.gameField.getObjectByName('BOARD' + this.fieldIdx);
        this.gameField.remove(board);
        this.build(playerField, true);
    }

    getClickableFields() {
        return this.gameField.children;
    }

    animate(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }

    triggerExplosionAtShield(position) {
        if (typeof this.mixer !== 'undefined') {
            this.mixer.stopAllAction();
            this.explosionCallback();
        }

        const explosion = AssetLoader.assets.models.ATTACK_AT_SHIELD_EXPLOSION.model;

        let model = explosion.scene.clone();
        model.position.set(position.x, position.y, position.z);

        this.gameField.add(model);
        this.mixer = new THREE.AnimationMixer(model);

        for (let i = 0; i < explosion.animations.length; i++) {
            this.mixer.clipAction(explosion.animations[i]).setLoop(THREE.LoopOnce).play()
        }

        this.explosionCallback = () => {
            this.mixer = undefined;
            this.gameField.remove(model);
        }

        this.mixer.addEventListener('finished', () => this.explosionCallback());
    }

    triggerExplosion(building, position) {
        if (typeof this.mixer !== 'undefined') {
            this.mixer.stopAllAction();
            this.explosionCallback();
        }

        this.gameField.remove(building.getModel());

        building.explode();

        if (!this.isPlayerGameField &&
            (building.entityType === EntityType.RUM_TRUFFLE_CANNON ||
                building.entityType === EntityType.SPYING_EASTER_BUNNY ||
                building.entityType === EntityType.HOT_CHOCOLATE_BALLISTA)) {
            building.rotate(Math.PI);
        }

        this.gameField.add(building.getModel());

        this.mixer = new THREE.AnimationMixer(building.getModel());
        const assets = AssetLoader.assets.models;

        let explosion = assets.CREAM_EXPLOSION;

        if (building.entityType === EntityType.CACAOTREE) {
            explosion = assets.CACAOTREE_EXPLOSION;
        } else if (building.entityType === EntityType.FACTORY) {
            explosion = assets.FACTORY_EXPLOSION;
        } else if (building.entityType === EntityType.FACTORY_EXTENSION) {
            explosion = assets.FACTORY_EXTENSION_EXPLOSION;
        } else if (building.entityType === EntityType.RUM_TRUFFLE_CANNON) {
            explosion = assets.RUM_TRUFFLE_CANNON_EXPLOSION;
        } else if (building.entityType === EntityType.SPYING_EASTER_BUNNY) {
            explosion = assets.SPYING_EASTER_BUNNY_EXPLOSION;
        } else if (building.entityType === EntityType.XMAS_FACTORY) {
            explosion = assets.XMAS_FACTORY_EXPLOSION;
        } else if (building.entityType === EntityType.HOT_CHOCOLATE_BALLISTA) {
            explosion = assets.HOT_CHOCOLATE_BALLISTA_EXPLOSION;
        } else if (building.entityType === EntityType.FRUIT_CANNON) {
            explosion = assets.FRUIT_CANNON_EXPLOSION;
        } else if (building.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
            explosion = assets.CHOCOLATE_FOUNTAIN_EXPLOSION;
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

    getCellPatch3x3(selectedRow, selectedCol, returnFields) {
        var patch = [];
        for (let row = selectedRow - 1; row < selectedRow + 2; row++) {
            for (let col = selectedCol - 1; col < selectedCol + 2; col++) {
                if (row >= 0 && col >= 0 && row < this.rows && col < this.cols) {
                    if (returnFields) {
                        patch.push(this.buildings[row][col]);
                    } else {
                        patch.push({ row: row, col: col });
                    }
                }
            }
        }
        return patch;
    }

    locateEasterBunny() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                var index = this.buildings[row][col].findIndex(building => building.entityType === EntityType.SPYING_EASTER_BUNNY)
                if (index > -1) {
                    return {
                        row: row,
                        col: col,
                        index: index
                    };
                }
            }
        }
    }

    meltDownEasterBunny() {
        let { row, col, index } = this.locateEasterBunny();

        let position3d = { x: row * this.fieldSize, y: 0, z: col * this.fieldSize };
        let bunny = this.buildings[row][col][index];
        this.triggerExplosion(bunny, position3d);
        this.buildings[row][col].splice(index, 1);

        let cream = this.buildings[row][col].findIndex(building => building.entityType === EntityType.CREAM);
        if (this.isPlayerGameField && cream > -1) {
            this.buildings[row][col][cream].show();
        }
    }

    receiveBallista(target) {
        const patch = this.getCellPatch3x3(target.row, target.col, true);
        const xmasFactoryCell = patch.filter(cell => cell.findIndex(building => building.entityType === EntityType.XMAS_FACTORY) > -1)[0];

        let row = xmasFactoryCell[0]._cellIdx.row;
        let col = xmasFactoryCell[0]._cellIdx.col;

        let xmasFactoryIndex = this.buildings[row][col].findIndex(building => building.entityType === EntityType.XMAS_FACTORY);
        let xmasFactory = this.buildings[row][col][xmasFactoryIndex];

        this.gameField.remove(xmasFactory.getModel());
        this.buildings[row][col].splice(xmasFactoryIndex, 1);

        this.setBuilding(EntityType.HOT_CHOCOLATE_BALLISTA, { row: row, col: col });
    }

    attack(target, attackType, shielded) {
        let row = target.row;
        let col = target.col;
        let position3d = { x: row * this.fieldSize, y: 0, z: col * this.fieldSize };

        if (attackType === AttackType.TRUFFLE) {
            if (shielded) {
                this.triggerExplosionAtShield(position3d);
            } else {
                let creamyBuildings = this.buildings[row][col].filter(building => building.entityType === EntityType.CREAM);
                if (creamyBuildings.length > 0) {
                    let cream = creamyBuildings[0];
                    this.triggerExplosion(cream, position3d);
                    let otherBuildings = this.buildings[row][col].filter(building => building.entityType !== EntityType.CREAM);

                    otherBuildings.forEach(otherBuilding => otherBuilding.show());

                    setTimeout(() => {
                        otherBuildings.forEach(otherBuilding => {
                            this.triggerExplosion(otherBuilding, position3d);
                        });
                        this.buildings[row][col] = [];
                    }, 1000);
                } else {
                    this.buildings[row][col].forEach(building => {
                        this.triggerExplosion(building, position3d);
                    });
                    this.buildings[row][col] = [];
                }
            }
        } else if (attackType === AttackType.HOT_CHOCOLATE) {
            this.buildings[row][col].forEach(building => this.gameField.remove(building.getModel()));
            this.buildings[row][col] = [];
        } else if (attackType === AttackType.BUNNY) {
            let patch = this.getCellPatch3x3(row, col, false);
            patch.forEach(field => {
                let creamyfieldIndex = this.buildings[field.row][field.col].findIndex(building => building.entityType === EntityType.CREAM)
                if (creamyfieldIndex > -1) {
                    let cream = this.buildings[field.row][field.col][creamyfieldIndex];
                    if (this.isPlayerGameField) {
                        this.buildings[field.row][field.col].splice(creamyfieldIndex, 1);
                        let otherBuildings = this.buildings[field.row][field.col].filter(building => building.entityType !== EntityType.CREAM);
                        if (otherBuildings.length > 0) {
                            otherBuildings.forEach(otherBuilding => otherBuilding.makeUncreamy());
                        } else {
                            this.triggerExplosion(cream, position3d);
                        }
                    } else {
                        this.triggerExplosion(cream, position3d);
                        this.buildings[field.row][field.col].splice(creamyfieldIndex, 1);

                        let otherBuildings = this.buildings[field.row][field.col].filter(building => building.entityType !== EntityType.CREAM);
                        otherBuildings.forEach(otherBuilding => otherBuilding.show());
                    }
                }
            });
        } else if (attackType === AttackType.FRUIT) {
            let chocolateFountainIndex = this.buildings[row][col].findIndex(building => building.entityType === EntityType.CHOCOLATE_FOUNTAIN);
            let cream = this.buildings[row][col].filter(building => building.entityType === EntityType.CREAM);
            if (cream.length > 0) {
                this.buildings[row][col].splice(this.buildings[row][col].indexOf(cream[0]), 1);
                this.triggerExplosion(cream[0], position3d);
                chocolateFountainIndex = this.buildings[row][col].findIndex(building => building.entityType === EntityType.CHOCOLATE_FOUNTAIN);
                if (chocolateFountainIndex > -1) {
                    this.buildings[row][col][chocolateFountainIndex].show();
                    setTimeout(() => {
                        this.triggerExplosion(this.buildings[row][col][chocolateFountainIndex], position3d);
                        this.buildings[row][col].splice(chocolateFountainIndex, 1);
                    }, 1000);
                } else {
                    this.buildings[row][col].forEach(building => building.show());
                }
            } else if (chocolateFountainIndex > -1) {
                this.triggerExplosion(this.buildings[row][col][chocolateFountainIndex], position3d);
                this.buildings[row][col].splice(chocolateFountainIndex, 1);
            }
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

    setBuilding(entityType, entityPosition) {
        const row = entityPosition.row;
        const col = entityPosition.col;

        let position3d = { x: row * this.fieldSize, y: 0, z: col * this.fieldSize };
        let building = new Building(entityType, { col: col, row: row }, position3d, this.fieldIdx);
        if (building.entityType === EntityType.FACTORY_EXTENSION) {
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

        if (!this.isPlayerGameField &&
            (entityType === EntityType.RUM_TRUFFLE_CANNON ||
                entityType === EntityType.SPYING_EASTER_BUNNY ||
                entityType === EntityType.HOT_CHOCOLATE_BALLISTA)) {
            building.rotate(Math.PI);
        }

        if (building.entityType === EntityType.CREAM) {
            let otherBuildings = this.buildings[row][col].filter(building => building.entityType !== EntityType.CREAM);
            if (this.isPlayerGameField) {
                building.makeTransparent();
                if (otherBuildings.length > 0) {
                    building.hide();
                    otherBuildings.forEach(other => other.makeCreamy());
                }
                const patch = this.getCellPatch3x3(row, col, true);
                let withinShield = patch.filter(cell => cell.findIndex(building => building.entityType === EntityType.CHOCOLATE_FOUNTAIN) > -1).length > 0;
                if (withinShield) {
                    building._model.children[0].renderOrder = -1;
                }
            } else {
                if (otherBuildings.length > 0) {
                    otherBuildings.forEach(other => other.hide());
                }
            }
        }

        if (building.entityType === EntityType.FRUIT_CANNON) {
            var index = this.buildings[row][col].findIndex(building => building.entityType === EntityType.RUM_TRUFFLE_CANNON)
            if (index > -1) {
                this.gameField.remove(this.buildings[row][col][index].getModel());
                this.buildings[row][col].splice(index, 1);
            }
        }

        if (building.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
            const patch = this.getCellPatch3x3(row, col, true);
            patch.forEach(cell => {
                let creamIndex = cell.findIndex(building => building.entityType === EntityType.CREAM);
                if (creamIndex > -1) {
                    cell[creamIndex]._model.children[0].renderOrder = -1;
                }
            });
        }

        this.gameField.add(building.getModel());

        if (this.cellContains(row, col, EntityType.CREAM)) {
            this.buildings[row][col].push(building);
            if (!this.isPlayerGameField) {
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
            this.buildings[row][col] = this.buildings[row][col].concat(building);
        }
    }
}

export default Gamefield;