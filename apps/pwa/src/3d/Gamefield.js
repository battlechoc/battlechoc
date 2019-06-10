import { Group, Geometry, Mesh, MeshLambertMaterial, SpotLight, Object3D } from 'three';
import { EntityType, BoardCellTypes } from '../gameplay/GameEntities';
import { assetLoader as AssetLoader} from '../AssetLoader.js';

class Gamefield {
    constructor(isPlayerGameField, position, getPlayerField, fieldIdx, size, startAnimation, renderScene) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = size.rows;
        this.cols = size.cols;
        this.fieldSize = 8;
        this.position = position;
        this.fieldIdx = fieldIdx;
        this.renderScene = () => renderScene();

        this.buildings = [...Array(this.rows)].map(
            field => Array(this.cols).fill([])
        );

        this.renderingEntities = {};
        this.gameField = new Group();
        this.getPlayerField = () => getPlayerField();
        this.playerField = JSON.parse(JSON.stringify(this.getPlayerField()));
        this.build();
        this.startAnimation = (turned, asset, position, offset=25) => startAnimation(this.gameField, turned, asset, position, offset);
    }

    build(skipEntities=false) {
        const assets = AssetLoader.assets.models;
        let pivot = assets['FIELD'].model.scene.children[0];
        let materialMap = assets['FIELD'].model.scene.children[1];

        let materials = [materialMap.children[0].material, materialMap.children[1].material, materialMap.children[2].material];
        let board = new Mesh(new Geometry(), materials);
        let playerField = this.getPlayerField();
        playerField.grid.forEach((cell, i) => {
            if (!cell.molten) {
                let materialIndex = 0;
                if (cell.type === BoardCellTypes.BROWN) {
                    materialIndex = 1;
                } else if (cell.type === BoardCellTypes.BLACK) {
                    materialIndex = 2;
                }

                let geometryLowerBound = board.geometry.faces.length;

                pivot.position.set(this.fieldSize * cell.row, 3, this.fieldSize * cell.col);
                pivot.traverse(child => {
                    if (child instanceof Mesh) {
                        child.updateMatrix();
                        let geometry = new Geometry().fromBufferGeometry(child.geometry);
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

                if (!skipEntities) {
                    this.renderEntities(cell);
                }
            }
        });

        board.groupsNeedUpdate = true;
        board.geometry.sortFacesByMaterialIndex();
        board.name = 'BOARD' + this.fieldIdx;
        board.frustumCulled = false;

        this.gameField.add(board);
        this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
        if (!skipEntities) {
            this.renderScene();
        }
    }

    renderEntities(cell, remove=false) {
        if (remove) {
            cell.occupiedBy.forEach(entity => {
                let phenotype = entity.type;
                if (entity.type === EntityType.CREAM && cell.occupiedBy.length > 1 && this.isPlayerGameField) {
                    phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                }
                this.removeEntity(entity, phenotype, cell);
                if (entity.type === EntityType.CHOCOLATE_FOUNTAIN) {
                    this.removeEntity(entity, EntityType.CHOCOLATE_FOUNTAIN + '.BUILDING', cell);
                }
            });
        } else {
            cell.occupiedBy.forEach(entity => {
                let phenotype = entity.type;
                if (entity.type === EntityType.CREAM) {
                    if (cell.occupiedBy.length > 1 && this.isPlayerGameField) {
                        phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                    }
                }

                if (entity.type === EntityType.CREAM || cell.occupiedBy.length === 1 || !cell.occupiedBy.map(building => building.type).includes(EntityType.CREAM) || this.isPlayerGameField) {
                    this.renderEntity(entity, phenotype, cell);
                    if (entity.type === EntityType.CHOCOLATE_FOUNTAIN) {
                        this.renderEntity(entity, EntityType.CHOCOLATE_FOUNTAIN + '.BUILDING', cell);
                    }
                }
            });
        }
    }

    removeEntity(entity, phenotype, cell) {
        if (entity.type === EntityType.CREAM || cell.occupiedBy.length === 1 || !cell.occupiedBy.map(building => building.type).includes(EntityType.CREAM) || this.isPlayerGameField) {
            let reducedGeometry = this.renderingEntities[phenotype].geometry.faces.filter(face => face.entityId !== entity.id);
            if (reducedGeometry.length > 0) {
                this.renderingEntities[phenotype].geometry.faces = reducedGeometry;
                this.renderingEntities[phenotype].geometry.elementsNeedUpdate = true;
            } else {
                this.gameField.remove(this.renderingEntities[phenotype]);
                delete this.renderingEntities[phenotype];
            }
        }        
    }

    renderEntity(entity, phenotype, cell) {
        const assets = AssetLoader.assets.models;
        let pivot, material, position;

        if (phenotype === EntityType.CHOCOLATE_FOUNTAIN  + '.BUILDING') {
            pivot = assets[EntityType.CHOCOLATE_FOUNTAIN].model.scene.clone().children[1];
            material = pivot.material;
            position = pivot.position;
        } else {
            pivot = assets[phenotype].model.scene.clone().children[0];
            
            if (phenotype === EntityType.CREAM || phenotype === EntityType.CREAM + '.AROUND.BUILDING') {
                material = new MeshLambertMaterial({ color: 0xffffff,  emissive: 0x606060 });
            } else {
                material = pivot.material;
            }

            position = pivot.position;
        }

        if (pivot instanceof Group) {
            material = [...new Set(pivot.children.map(child => child.material))];
        } 

        if (typeof this.renderingEntities[phenotype] === 'undefined') {
            if (phenotype === EntityType.CHOCOLATE_FOUNTAIN) {
                material = new MeshLambertMaterial({ color: 0x6C5710, opacity: 0.3, transparent: true });
            }

            this.renderingEntities[phenotype] = new Mesh(new Geometry(), material);
            this.renderingEntities[phenotype].matrixAutoUpdate = false;
            this.renderingEntities[phenotype].frustumCulled = false;
            this.gameField.add(this.renderingEntities[phenotype]);
        }

        let geometryLowerBound = this.renderingEntities[phenotype].geometry.faces.length;
        pivot.position.set(this.fieldSize * cell.row, position.y, this.fieldSize * cell.col);

        if (!this.isPlayerGameField) {
            if (entity.type === EntityType.RUM_TRUFFLE_CANNON) {
                pivot.rotation.z = Math.PI / 4;
            } else if (entity.type === EntityType.SPYING_EASTER_BUNNY) {
                pivot.rotation.y = -Math.PI / 1.2;
            } else if (entity.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
                pivot.rotation.y = -Math.PI / 1.5;
            }
        } 

        if (entity.type === EntityType.FACTORY_EXTENSION) {
            if (this.playerField.grid[cell.row * this.cols + Math.min(cell.col + 1, this.cols - 1)].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                pivot.rotation.y = -Math.PI / 2;
            } else if (this.playerField.grid[Math.max(cell.row - 1, 0) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                pivot.rotation.y = Math.PI;
            } else if (this.playerField.grid[Math.min(cell.row + 1, this.rows - 1) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                pivot.rotation.y = 0;
            } else {
                pivot.rotation.y = Math.PI / 2
            }
        }

        pivot.traverse(child => {
            if (child instanceof Mesh) {
                child.updateMatrix();
                let geometry = new Geometry().fromBufferGeometry(child.geometry);
                if (pivot instanceof Group) {
                    child.position.set(this.fieldSize * cell.row, position.y, this.fieldSize * cell.col);
                    child.scale.set(pivot.scale.x, pivot.scale.y, pivot.scale.z);
                    child.rotation.set(pivot.rotation.x, pivot.rotation.y, pivot.rotation.z);
                    child.updateMatrix();
                    geometry.faces.forEach(face => {
                        face.materialIndex = material.findIndex(submaterial => child.material.uuid === submaterial.uuid);
                    });
                }
                this.renderingEntities[phenotype].geometry.merge(geometry, child.matrix);
            }
        });

        for (let i = geometryLowerBound; i < this.renderingEntities[phenotype].geometry.faces.length; i++) {
            if (pivot.name !== 'Shield') {
                this.renderingEntities[phenotype].geometry.faces[i]._cellIdx = { row: cell.row, col: cell.col };
                this.renderingEntities[phenotype].geometry.faces[i]._fieldIndex = this.fieldIdx;
            }
            this.renderingEntities[phenotype].geometry.faces[i].entityId = entity.id;
        }

        if (pivot instanceof Group) {
            this.renderingEntities[phenotype].geometry.groupsNeedUpdate = true;
            this.renderingEntities[phenotype].geometry.sortFacesByMaterialIndex();
        }
        this.renderingEntities[phenotype].geometry.elementsNeedUpdate = true;
    }

    update() {
        let playerField = this.getPlayerField();
        let fieldChanges = playerField.grid.map((cell, i) => cell.molten === this.playerField.grid[i].molten ? null : i);

        if (fieldChanges.filter(position => position !== null).length > 0) {
            let board = this.gameField.getObjectByName('BOARD' + this.fieldIdx);
            this.gameField.remove(board);
            this.build(true);
        }

        let changes = playerField.grid.map((cell, i) => JSON.stringify(cell.occupiedBy) === JSON.stringify(this.playerField.grid[i].occupiedBy) ? null : i);
        changes.filter(position => position !== null).forEach(position => {
            if (playerField.grid[position].occupiedBy.length < this.playerField.grid[position].occupiedBy.length) {
                let isTurned = entity => (!this.isPlayerGameField &&
                             (entity.type === EntityType.RUM_TRUFFLE_CANNON ||
                              entity.type === EntityType.SPYING_EASTER_BUNNY ||
                              entity.type === EntityType.HOT_CHOCOLATE_BALLISTA))                
                if (playerField.grid[position].occupiedBy.length === 0) {
                    let cellPosition = { x: this.playerField.grid[position].row * this.fieldSize, y: 0, z: this.playerField.grid[position].col * this.fieldSize };
                    this.playerField.grid[position].occupiedBy.forEach(entity => {
                        let offset = 25;
                        if (entity.type !== EntityType.CREAM && this.playerField.grid[position].occupiedBy.filter(building => building.type === EntityType.CREAM).length > 0) {
                            offset = 400;
                        }
                        this.startAnimation(isTurned(entity), entity.type + '.EXPLOSION', cellPosition, offset);
                    });
                }
            }
            this.renderEntities(this.playerField.grid[position], true);
            this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
            this.renderEntities(this.playerField.grid[position]);  
        });
        this.renderScene();
    }

    highlightCannons(unhighlight) {
        if (unhighlight) {
            for (let entityType in this.renderingEntities) {
                if (entityType !== EntityType.RUM_TRUFFLE_CANNON && typeof this.renderingEntities[entityType] !== 'undefined') {
                    this.gameField.add(this.renderingEntities[entityType]);
                }
            }

            this.gameField.children.forEach(child => {
                if (child.name === 'target' || child instanceof SpotLight) {
                    this.gameField.remove(child);
                }
            });
        } else {
            for (let entityType in this.renderingEntities) {
                if (entityType !== EntityType.RUM_TRUFFLE_CANNON && typeof this.renderingEntities[entityType] !== 'undefined') {
                    this.gameField.remove(this.renderingEntities[entityType]);
                } 
            }

            this.playerField.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.RUM_TRUFFLE_CANNON)).forEach(cell => {
                let spotlight = new SpotLight(0xffffff, 4.0, 64, 0.2);
                spotlight.position.set(this.fieldSize * cell.row, 32, this.fieldSize * cell.col);
                this.gameField.add(spotlight);
                let pivot = new Object3D();
                pivot.name = 'target';
                pivot.position.set(this.fieldSize * cell.row, 3, this.fieldSize * cell.col)
                this.gameField.add(pivot);
                spotlight.target = pivot;
            });
        }
        this.renderScene();
    }
}

export default Gamefield;