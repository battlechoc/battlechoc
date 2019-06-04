import { Group, Geometry, Mesh } from 'three';
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
        this.playerField.grid.forEach((cell, i) => {
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

        this.gameField.add(board);
        this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
    }

    renderEntities(cell, remove=false) {
        if (remove) {
            cell.occupiedBy.forEach(entity => {
                let phenotype = entity.type;
                if (entity.type === EntityType.CREAM && cell.occupiedBy.length > 1 && this.isPlayerGameField) {
                    phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                }
                if (entity.type === EntityType.CREAM || cell.occupiedBy.length === 1 || !cell.occupiedBy.map(building => building.type).includes(EntityType.CREAM) || this.isPlayerGameField) {
                    this.renderingEntities[phenotype].geometry.faces = this.renderingEntities[phenotype].geometry.faces.filter(face => face.entityId !== entity.id);
                    this.renderingEntities[phenotype].geometry.elementsNeedUpdate = true;
                }
            });
        } else {
            const assets = AssetLoader.assets.models;
            cell.occupiedBy.forEach(entity => {
                let phenotype = entity.type;
                if (entity.type === EntityType.CREAM) {
                    if (cell.occupiedBy.length > 1 && this.isPlayerGameField) {
                        phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                    }
                }

                if (entity.type === EntityType.CREAM || cell.occupiedBy.length === 1 || !cell.occupiedBy.map(building => building.type).includes(EntityType.CREAM) || this.isPlayerGameField) {
                    let pivot = assets[phenotype].model.scene.children[0];
                    let material = assets[phenotype].model.scene.children[0].material;
                    if (pivot instanceof Group) {
                        material = [...new Set(pivot.children.map(child => child.material))];
                    } 

                    if (typeof this.renderingEntities[phenotype] === 'undefined') {
                        this.renderingEntities[phenotype] = new Mesh(new Geometry(), material);
                        this.gameField.add(this.renderingEntities[phenotype]);
                    }

                    let geometryLowerBound = this.renderingEntities[phenotype].geometry.faces.length;
                    pivot.position.set(this.fieldSize * cell.row, assets[phenotype].model.scene.children[0].position.y, this.fieldSize * cell.col);
                    pivot.traverse(child => {
                        if (child instanceof Mesh) {
                            child.updateMatrix();
                            let geometry = new Geometry().fromBufferGeometry(child.geometry);
                            if (pivot instanceof Group) {
                                child.position.set(this.fieldSize * cell.row, assets[phenotype].model.scene.children[0].position.y, this.fieldSize * cell.col);
                                child.scale.set(pivot.scale.x, pivot.scale.y, pivot.scale.z);
                                child.rotation.set(pivot.rotation.x, pivot.rotation.y, pivot.rotation.z)
                                child.updateMatrix();
                                geometry.faces.forEach(face => {
                                    face.materialIndex = material.findIndex(submaterial => child.material.uuid === submaterial.uuid);
                                });
                            }
                            this.renderingEntities[phenotype].geometry.merge(geometry, child.matrix);
                        }
                    });

                    for (let i = geometryLowerBound; i < this.renderingEntities[phenotype].geometry.faces.length; i++) {
                        this.renderingEntities[phenotype].geometry.faces[i]._cellIdx = { row: cell.row, col: cell.col };
                        this.renderingEntities[phenotype].geometry.faces[i]._fieldIndex = this.fieldIdx;
                        this.renderingEntities[phenotype].geometry.faces[i].entityId = entity.id;
                    }

                    if (pivot instanceof Group) {
                        this.renderingEntities[phenotype].geometry.groupsNeedUpdate = true;
                        this.renderingEntities[phenotype].geometry.sortFacesByMaterialIndex();
                    }
                    this.renderingEntities[phenotype].geometry.elementsNeedUpdate = true;
                }
            });
        }
    }

    rebuild() {
        this.update();
        let board = this.gameField.getObjectByName('BOARD' + this.fieldIdx);
        this.gameField.remove(board);

        this.build(true);
        this.renderScene();
    }

    update() {
        let playerField = this.getPlayerField();
        let changes = playerField.grid.map((cell, i) => JSON.stringify(cell.occupiedBy) === JSON.stringify(this.playerField.grid[i].occupiedBy) ? null : i);
        changes.filter(position => position !== null).forEach(position => {           
            console.log(playerField.grid[position]);
            if (playerField.grid[position].occupiedBy.length < this.playerField.grid[position].occupiedBy.length) {
                const assets = AssetLoader.assets.models;
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
                        this.startAnimation(isTurned(entity), assets[entity.type + '.EXPLOSION'], cellPosition, offset);
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
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                this.buildings[row][col].forEach(building => {
                    if (building.entityType === EntityType.RUM_TRUFFLE_CANNON) {
                        building.highlight(unhighlight);
                    }
                })
            }
        }
        this.renderScene();
    }
}

export default Gamefield;