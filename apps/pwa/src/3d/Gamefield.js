import { EntityType } from '../gameplay/GameEntities';
import { Vector3, ActionManager, ExecuteCodeAction, SolidParticleSystem } from 'babylonjs';

class Gamefield {
    constructor(isPlayerGameField, position, getPlayerField, fieldIdx, size, scene, action) {
        this.isPlayerGameField = isPlayerGameField;
        this.rows = size.rows;
        this.cols = size.cols;
        this.position = position;
        this.fieldIdx = fieldIdx;
        this.scene = scene;
        this.action = action;
        this.getPlayerField = () => getPlayerField();
        this.playerField = JSON.parse(JSON.stringify(this.getPlayerField()));
        this.build();
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
                    this.removeEntity(entity, EntityType.CHOCOLATE_FOUNTAIN + '.SHIELD', cell);
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
                        this.renderEntity(entity, EntityType.CHOCOLATE_FOUNTAIN + '.SHIELD', cell);
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

    createMeshInstance(phenotype, cell) {
        let parent = this.scene.getMeshByName(phenotype + '__root__');
        let children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();

        children.forEach((pivot, i) => {
            let mesh = pivot.createInstance(this.fieldIdx + '.' + phenotype + '.' + cell.row + '.' + cell.col);
            mesh.id = this.fieldIdx + '.' + phenotype + '.' + cell.row + '.' + cell.col;
            mesh.position = this.position.add(new Vector3(cell.row, 0, cell.col));
            mesh.actionManager = new ActionManager(this.scene);
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, event => {
                this.action(cell.row, cell.col, event.pointerX, event.pointerY)
            }));

            if (phenotype === EntityType.FACTORY_EXTENSION) {
                if (this.playerField.grid[cell.row * this.rows + Math.min(cell.col + 1, this.cols - 1)].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                    mesh.rotation.y = 0;
                } else if (this.playerField.grid[Math.max(cell.row - 1, 0) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                    mesh.rotation.y = -Math.PI / 2;
                } else if (this.playerField.grid[Math.min(cell.row + 1, this.rows - 1) * this.cols + cell.col].occupiedBy.map(building => building.type).includes(EntityType.FACTORY)) {
                    mesh.rotation.y = Math.PI / 2;
                } else {
                    mesh.rotation.y = Math.PI;
                }
            }
        });
    }

    renderEntity(entity, phenotype, cell) {
        if (phenotype === EntityType.CHOCOLATE_FOUNTAIN  + '.SHIELD') {
            /*pivot = assets[EntityType.CHOCOLATE_FOUNTAIN].model.scene.clone().children[1];
            material = pivot.material;
            position = pivot.position;*/
        } else {
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
        }
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
            if (playerField.grid[position].occupiedBy.length < this.playerField.grid[position].occupiedBy.length) {                
                if (playerField.grid[position].occupiedBy.length === 0) {
                    this.playerField.grid[position].occupiedBy.forEach(entity => {
                        if (entity.type !== EntityType.CREAM && this.playerField.grid[position].occupiedBy.filter(building => building.type === EntityType.CREAM).length > 0) {
                            let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + entity.type + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                            meshes.forEach(mesh => this.explode(mesh, 800));
                        } else if (entity.type === EntityType.CREAM && this.playerField.grid[position].occupiedBy.filter(building => building.type !== EntityType.CREAM).length > 0 && this.isPlayerGameField) {
                            let mesh = this.scene.getMeshByName(this.fieldIdx + '.' + EntityType.CREAM + '.AROUND.BUILDING.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                            this.explode(mesh);
                        } else {
                            let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + entity.type + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                            meshes.forEach(mesh => this.explode(mesh));
                        }
                    });
                }
            }
            this.renderEntities(this.playerField.grid[position], true);
            this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
            this.renderEntities(this.playerField.grid[position]);
        });
    }

    explode(mesh, offset=100) {
        let gravity = -0.04;
        let solidParticleSystem = new SolidParticleSystem("solidParticleSystem", this.scene);
        solidParticleSystem.digest(mesh, {number: 48});
        let particleMesh = solidParticleSystem.buildMesh();
        particleMesh.material = mesh.material;
        particleMesh.material.freeze();
        solidParticleSystem.refreshVisibleSize();

        solidParticleSystem.updateParticle = particle => {
            if (particle.position.y < -20) {
                particle.alive = false;
            } else {
                particle.velocity.y += gravity;
                particle.velocity.x -= 0.01;
                particle.velocity.z -= 0.01;
                (particle.position).addInPlace(particle.velocity);
            }
        }

        solidParticleSystem.initParticles = () => {
            for (let particle = 0; particle < solidParticleSystem.nbParticles; particle++) {
                solidParticleSystem.particles[particle].position.addInPlace(mesh.position);
            }
        };

        solidParticleSystem.computeParticleRotation = false;
        solidParticleSystem.computeParticleTexture = false;
        solidParticleSystem.computeParticleColor = false;

        solidParticleSystem.isAlwaysVisible = true;
        solidParticleSystem.initParticles();
        solidParticleSystem.setParticles();

        let setParticles = () => solidParticleSystem.setParticles();

        setTimeout(() => {
            let speed = 1.2;
            for (let particle = 0; particle < solidParticleSystem.nbParticles; particle++) {
                solidParticleSystem.particles[particle].velocity.x = Math.random() * speed;
                solidParticleSystem.particles[particle].velocity.y = Math.random() * speed;
                solidParticleSystem.particles[particle].velocity.z = Math.random() * speed;
            }
            this.scene.registerBeforeRender(setParticles);
        }, offset);

        setTimeout(() => {
            this.scene.unregisterBeforeRender(setParticles);
            solidParticleSystem.dispose();
            solidParticleSystem = null;
        }, offset + 2000);
    }
}

export default Gamefield;