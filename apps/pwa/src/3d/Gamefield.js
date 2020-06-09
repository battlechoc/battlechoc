import { EntityType, isDonut } from 'battlechoc-shared-functions';
import { Mesh, ParticleSystem, Vector3, Color4, ActionManager, ExecuteCodeAction, SolidParticleSystem, Texture } from 'babylonjs';
import uuidv4 from 'uuid/v4';

class Gamefield {
    constructor(isPlayerGameField, position, getPlayerField, fieldIdx, size, scene, action, setRenderLoop) {
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
        this.animations = [];
        this.setRenderLoop = setRenderLoop;
    }

    build() {
        let playerField = this.getPlayerField();
        playerField.grid.forEach((cell, i) => {
            if (!cell.molten) {
                if (!cell.occupiedBy.some(entity => isDonut(entity.type)) || !this.isPlayerGameField) {
                    this.createMeshInstance(cell.type, cell);
                }
                
                this.renderEntities(cell);
            }
        });
    }

    renderEntities(cell, remove=false) {
        if (remove) {
            cell.occupiedBy.forEach(entity => {
                if (this.isPlayerGameField || !isDonut(entity.type)) {
                    let phenotype = entity.type;
                    if (entity.type === EntityType.CREAM && cell.occupiedBy.filter(entity => !isDonut(entity.type)).length > 1 && this.isPlayerGameField) {
                        phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                    }
                    
                    this.removeEntity(entity, phenotype, cell);
                }
            });
        } else {
            cell.occupiedBy.forEach(entity => {
                if (this.isPlayerGameField || !isDonut(entity.type)) {
                    let phenotype = entity.type;
                    if (entity.type === EntityType.CREAM && cell.occupiedBy.filter(entity => !isDonut(entity.type)).length > 1 && this.isPlayerGameField) {
                        phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                    }

                    if (entity.type === EntityType.CREAM || cell.occupiedBy.filter(entity => !isDonut(entity.type)).length === 1 || !cell.occupiedBy.map(building => building.type).includes(EntityType.CREAM) || this.isPlayerGameField) {
                        this.createMeshInstance(phenotype, cell);
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
        let meshId = this.fieldIdx + '.' + phenotype + '.' + cell.row + '.' + cell.col;
        let parent = this.scene.getMeshByName(phenotype + '__root__');
        let children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();

        children.forEach((pivot, i) => {
            let mesh = pivot.createInstance(meshId);
            mesh.id = meshId;
            mesh.position = this.position.add(new Vector3(cell.row, 0, cell.col));
            if (pivot.material.name !==  phenotype + '.Shield.material') {
                mesh.actionManager = new ActionManager(this.scene);
                mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, event => {
                    this.action(cell.row, cell.col, mesh.position);
                }));
            } else {
                mesh.isPickable = false;
            }

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

            if (!this.isPlayerGameField) {
                if ([EntityType.RUM_TRUFFLE_CANNON, EntityType.FRUIT_CANNON, EntityType.SPYING_EASTER_BUNNY, EntityType.HOT_CHOCOLATE_BALLISTA].includes(phenotype)) {
                    mesh.rotation.y = Math.PI
                }
            }
        });
    }

    update() {
        let playerField = this.getPlayerField();
        playerField.grid.filter((cell, i) => cell.molten !== this.playerField.grid[i].molten).forEach(cell => {
            let field = this.scene.getMeshByName(this.fieldIdx + '.' + cell.type + '.' + cell.row + '.' + cell.col);
            if (field) {
                this.animateHotChocolate(field);
            }
        });

        if (this.isPlayerGameField) {
            playerField.grid.filter((cell, i) => !this.playerField.grid[i].occupiedBy.some(entity => isDonut(entity.type)) && cell.occupiedBy.some(entity => isDonut(entity.type))).forEach(cell => {
                    let field = this.scene.getMeshByName(this.fieldIdx + '.' + cell.type + '.' + cell.row + '.' + cell.col);
                    field.dispose();
            });
        }

        let conatinsTrap = (playerField, position) => {
            return playerField.grid[position].occupiedBy.some(entity => isDonut(entity.type));
        }
        
        let explodeCream = position => {
            let entities = this.playerField.grid[position].occupiedBy;
            let hasTrap = conatinsTrap(this.playerField, position);
            let plainCream = entities.length === 1 || (entities.length === 2 && hasTrap)
            let creamPheonotype = plainCream ? EntityType.CREAM : EntityType.CREAM + '.AROUND.BUILDING';
            let phenotype = !this.isPlayerGameField ? EntityType.CREAM : creamPheonotype;
            let mesh = this.scene.getMeshByName(this.fieldIdx + '.' + phenotype + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
            this.explode(mesh);
        };

        let changes = playerField.grid.map((cell, i) => JSON.stringify(cell.occupiedBy) === JSON.stringify(this.playerField.grid[i].occupiedBy) ? null : i);
        changes.filter(position => position !== null).forEach(position => {
            if (conatinsTrap(this.playerField, position) && !conatinsTrap(playerField, position) && !playerField.grid[position].molten) {
                this.renderEntities(this.playerField.grid[position], true);
                if (this.isPlayerGameField) {
                    this.createMeshInstance(playerField.grid[position].type, playerField.grid[position]);
                }
                this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
                this.renderEntities(this.playerField.grid[position]);
                this.scene.render();
            } else if (playerField.grid[position].occupiedBy.length < this.playerField.grid[position].occupiedBy.length) {                
                if (playerField.grid[position].occupiedBy.filter(entity => !isDonut(entity.type)).length === 0) {                
                    if (this.playerField.grid[position].occupiedBy.length > 1 && this.playerField.grid[position].occupiedBy.map(building => building.type).includes(EntityType.CREAM)) {
                        this.playerField.grid[position].occupiedBy.filter(building => building.type !== EntityType.CREAM && !isDonut(building.type)).forEach(entity => {
                            if (!this.isPlayerGameField) {
                                this.createMeshInstance(entity.type, this.playerField.grid[position]);
                            }
                            setTimeout(() => {
                                let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + entity.type + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                                meshes.forEach(mesh => {
                                    this.explode(mesh);
                                });
                            }, 1000);
                        });
                        explodeCream(position);    
                    } else {
                        this.playerField.grid[position].occupiedBy.forEach(entity => {
                            if (entity.type === EntityType.CREAM) {
                                let mesh = this.scene.getMeshByName(this.fieldIdx + '.' + EntityType.CREAM + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                                this.explode(mesh);
                            } else if (!isDonut(entity.type)) {
                                let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + entity.type + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                                meshes.forEach(mesh => this.explode(mesh));
                            }
                        });                         
                    }
                } else if (this.playerField.grid[position].occupiedBy.map(building => building.type).includes(EntityType.SPYING_EASTER_BUNNY) && !playerField.grid[position].occupiedBy.map(building => building.type).includes(EntityType.SPYING_EASTER_BUNNY)) {
                    let meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + EntityType.SPYING_EASTER_BUNNY + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                    meshes.forEach(mesh => this.explode(mesh));
                    if (this.playerField.grid[position].occupiedBy.map(building => building.type).includes(EntityType.CREAM)) {
                        let phenotype = EntityType.CREAM;
                        if (this.isPlayerGameField) {
                            phenotype = EntityType.CREAM + '.AROUND.BUILDING';
                        }
                        meshes = this.scene.getMeshesByID(this.fieldIdx + '.' + phenotype + '.' + this.playerField.grid[position].row + '.' + this.playerField.grid[position].col);
                        meshes.forEach(mesh => mesh.dispose());
                        this.renderEntities(playerField.grid[position]);
                    }
                } else {
                    explodeCream(position);
                    if (!this.isPlayerGameField) {
                        this.playerField.grid[position].occupiedBy.filter(building => building.type !== EntityType.CREAM).forEach(entity => {
                            this.createMeshInstance(entity.type, this.playerField.grid[position]);
                        });
                    }
                }
                this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
            } else {
                this.renderEntities(this.playerField.grid[position], true);
                this.playerField.grid[position] = JSON.parse(JSON.stringify(playerField.grid[position]));
                this.renderEntities(this.playerField.grid[position]);
            }
        });
    }

    animateHotChocolate(field) {
        this.setRenderLoop();
        let fountain = Mesh.CreateBox("foutain", 1.0, this.scene);
        fountain.position.addInPlace(field.position);
        fountain.isVisible = false;
        if (this.isPlayerGameField) {
            fountain.position.addInPlace(new Vector3(-0.2, 4, -0.2));
        } else {
            fountain.position.addInPlace(new Vector3(0.2, 4, 0.2));
        }
        
        let particleSystem = new ParticleSystem("particles", 2000, this.scene);
        particleSystem.particleTexture = new Texture("/images/raindrop.png", this.scene);

        particleSystem.emitter = fountain;
        particleSystem.minEmitBox = new Vector3(0, 0, 0);
        particleSystem.maxEmitBox = new Vector3(0.3, 0.3, 0.3);

        particleSystem.color1 = Color4.FromHexString("#824529FF");
        particleSystem.color2 = Color4.FromHexString("#3E211BFF");
        particleSystem.colorDead = new Color4(0, 0, 0, 0);

        particleSystem.minSize = 0.02;
        particleSystem.maxSize = 0.1;

        particleSystem.minLifeTime = 0.4;
        particleSystem.maxLifeTime = 1.5;

        particleSystem.emitRate = 1500;
        particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
        particleSystem.gravity = new Vector3(0, 12*-9.81, 0);

        particleSystem.direction1 = new Vector3(Math.random(), Math.random(), Math.random());
        particleSystem.direction2 = new Vector3(Math.random(), Math.random(), Math.random());

        particleSystem.minAngularSpeed = 0;
        particleSystem.maxAngularSpeed = Math.PI;

        particleSystem.minEmitPower = 1;
        particleSystem.maxEmitPower = 3;
        particleSystem.updateSpeed = 0.005;

        particleSystem.start();
        this.scene.beginAnimation(fountain, 0, 100, true);
        setTimeout(() => {
            field.dispose();
        }, 1000);

        const uuid = uuidv4();
        this.animations.push({ id: uuid, stopAnimation: () => {
            this.scene.stopAnimation(fountain);
            this.setRenderLoop(false);
            particleSystem.dispose();
            fountain.dispose();
            this.scene.render();
            this.animations = this.animations.filter(callback => callback.id !== uuid);
        }});

        setTimeout(() => {
            if (this.animations.findIndex(callback => callback.id === uuid) > -1) {
                this.animations.find(callback => callback.id === uuid).stopAnimation();
            }
        }, 3000);
    }

    stopAllAnimations = () => {
        for (const callback of this.animations) {
            callback.stopAnimation();
        }
        this.animations = [];
    }

    explode(mesh) {
        let gravity = -0.02;
        let solidParticleSystem = new SolidParticleSystem("solidParticleSystem", this.scene);
        solidParticleSystem.digest(mesh, {number: 32});
        let particleMesh = solidParticleSystem.buildMesh();
        particleMesh.material = mesh.material;
        particleMesh.material.freeze();
        solidParticleSystem.refreshVisibleSize();

        solidParticleSystem.updateParticle = particle => {
            if (particle.position.y < -20) {
                particle.isVisible = false;
            } else {
                particle.velocity.y += gravity;
                particle.velocity.x -= 0.01;
                particle.velocity.z -= 0.01;
                (particle.position).addInPlace(particle.velocity);
            }
        }

        solidParticleSystem.initParticles = () => {
            for (let particle = 0; particle < solidParticleSystem.nbParticles; particle++) {
                solidParticleSystem.particles[particle].rotation.addInPlace(mesh.rotation);
                solidParticleSystem.particles[particle].position.addInPlace(mesh.position);
            }
        };

        solidParticleSystem.computeParticleTexture = false;
        solidParticleSystem.computeParticleColor = false;

        solidParticleSystem.isAlwaysVisible = true;
        solidParticleSystem.initParticles();
        solidParticleSystem.setParticles();

        let setParticles = () => solidParticleSystem.setParticles();

        this.setRenderLoop()
        let speed = 0.7;
        for (let particle = 0; particle < solidParticleSystem.nbParticles; particle++) {
            solidParticleSystem.particles[particle].velocity.x = Math.random() * speed;
            solidParticleSystem.particles[particle].velocity.y = Math.random() * speed;
            solidParticleSystem.particles[particle].velocity.z = Math.random() * speed;
        }
        this.scene.registerBeforeRender(setParticles);

        const uuid = uuidv4();
        this.animations.push({ id: uuid, stopAnimation: () => {
            this.scene.unregisterBeforeRender(setParticles);
            solidParticleSystem.dispose();
            solidParticleSystem = null;
            this.setRenderLoop(false);
            this.animations = this.animations.filter(callback => callback.id !== uuid);
        }});

        setTimeout(() => {
            if (this.animations.findIndex(callback => callback.id === uuid) > -1) {
                this.animations.find(callback => callback.id === uuid).stopAnimation();
            }
        }, 3000);
        mesh.dispose();
    }
}

export default Gamefield;