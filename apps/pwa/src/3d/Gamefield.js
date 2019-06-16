import { EntityType, BoardCellTypes } from '../gameplay/GameEntities';
import { Vector3, ActionManager, ExecuteCodeAction } from 'babylonjs';

class Gamefield {
    constructor(isPlayerGameField, position, getPlayerField, fieldIdx, size, startAnimation, scene, action) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = size.rows;
        this.cols = size.cols;
        this.fieldSize = 1;
        this.position = position;
        this.fieldIdx = fieldIdx;
        this.scene = scene;
        this.action = action;
        this.renderingEntities = {};
        this.getPlayerField = () => getPlayerField();
        this.playerField = JSON.parse(JSON.stringify(this.getPlayerField()));
        this.build();
        this.startAnimation = (turned, asset, position, offset=25) => startAnimation(this.gameField, turned, asset, position, offset);
    }

    build() {
        let playerField = this.getPlayerField();
        playerField.grid.forEach((cell, i) => {
            if (!cell.molten) {
                this.createMeshInstance(cell.type, cell);
                this.renderEntities(cell);
            }
        });
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
                if (entity.type === EntityType.CREAM && cell.occupiedBy.length > 1 && this.isPlayerGameField) {
                    phenotype = EntityType.CREAM + '.AROUND.BUILDING';
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
            let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + phenotype + '.' + cell.row + '.' + cell.col);
            meshes.forEach(mesh => mesh.dispose());
        }
    }

    createMeshInstance(phenotype, meta) {
        let parent = this.scene.getMeshByName(phenotype + '__root__');
        let children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();

        children.forEach((pivot, i) => {
            let mesh = pivot.createInstance(this.fieldIdx + '.' + phenotype + '.' + meta.row + '.' + meta.col);
            mesh.id = this.fieldIdx + '.' + phenotype + '.' + meta.row + '.' + meta.col;
            mesh.position = this.position.add(new Vector3(this.fieldSize * meta.row, 0, this.fieldSize * meta.col));
            if (!Object.values(BoardCellTypes).includes(phenotype)) {
                mesh.scaling = mesh.scaling.multiply(parent.scaling);
            }
            mesh.actionManager = new ActionManager(this.scene);
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, event => this.action(meta.row, meta.col, event.pointerX, event.pointerY)));
        });
    }

    renderEntity(entity, phenotype, cell) {
        /*if (phenotype === EntityType.CHOCOLATE_FOUNTAIN  + '.BUILDING') {
            pivot = assets[EntityType.CHOCOLATE_FOUNTAIN].model.scene.clone().children[1];
            material = pivot.material;
            position = pivot.position;
        } else {*/

        this.createMeshInstance(phenotype, cell);
        
        /*if (!this.isPlayerGameField) {
            if (entity.type === EntityType.RUM_TRUFFLE_CANNON) {
                mesh.rotation.z = Math.PI / 4;
            } else if (entity.type === EntityType.SPYING_EASTER_BUNNY) {
                mesh.rotation.y = -Math.PI / 1.2;
            } else if (entity.type === EntityType.HOT_CHOCOLATE_BALLISTA) {
                mesh.rotation.y = -Math.PI / 1.5;
            }
        }*/

        /*if (entity.type === EntityType.FACTORY_EXTENSION) {
            if (this.playerField.grid[cell.row * this.cols + Math.min(cell.col + 1, this.cols - 1)].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                mesh.rotation.y = -Math.PI / 2;
            } else if (this.playerField.grid[Math.max(cell.row - 1, 0) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                mesh.rotation.y = Math.PI;
            } else if (this.playerField.grid[Math.min(cell.row + 1, this.rows - 1) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                mesh.rotation.y = 0;
            } else {
                mesh.rotation.y = Math.PI / 2
            }
        }*/
    }

    update() {
        let playerField = this.getPlayerField();
        /*let fieldChanges = playerField.grid.map((cell, i) => cell.molten === this.playerField.grid[i].molten ? null : i);

        if (fieldChanges.filter(position => position !== null).length > 0) {
            let board = this.gameField.getObjectByName('BOARD' + this.fieldIdx);
            this.gameField.remove(board);
            this.build(true);
        }*/

        let changes = playerField.grid.map((cell, i) => JSON.stringify(cell.occupiedBy) === JSON.stringify(this.playerField.grid[i].occupiedBy) ? null : i);
        changes.filter(position => position !== null).forEach(position => {
            /*if (playerField.grid[position].occupiedBy.length < this.playerField.grid[position].occupiedBy.length) {
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
            }*/
            this.renderEntities(this.playerField.grid[position], true);
            this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
            this.renderEntities(this.playerField.grid[position]);
        });
    }

    highlightCannons(unhighlight) {
        /*if (unhighlight) {
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
        }*/
    }
}

export default Gamefield;