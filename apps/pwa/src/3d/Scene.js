import React, { Component } from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../Multiplayer';
import { deselectBuildings, selectAttack, deselectAttack, selectBuilding } from '../ui/UiActions';
import { build, attack, finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Gamefield from './Gamefield';
import { EntityType, AttackType, BoardCellTypes, createEntity, getEntityDescriptor, getCheapest } from '../gameplay/GameEntities';
import { BattlechocError } from '../gameplay/Errors';
import { Jukebox } from '../ui/misc';
import { playerHasAttacks } from '../gameplay/Player';
import { Scene as BabylonScene, DynamicTexture, Mesh, StandardMaterial, DirectionalLight, Engine, HighlightLayer, FlyCamera, Color3, Camera, Vector3, HemisphericLight, Color4, Animation, MeshBuilder } from 'babylonjs';
import { AssetLoadingViewContainer as AssetLoadingView } from '../AssetLoader';
import 'babylonjs-loaders';

class Scene extends Component {

    componentDidMount() {
        this.props.onRef(this);
        this.engine = new Engine(this.container, true, { preserveDrawingBuffer: true, stencil: true, useHighPrecisionFloats: false }, true);

        let createScene = () => {
            let scene = new BabylonScene(this.engine);
            scene.clearColor = new Color4(0, 0, 0, 0);
            this.camera = new FlyCamera("camera", new Vector3(30, 30, 30), scene);
            this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
            this.camera.minZ = 0;
            this.camera.maxZ = 100;
            this.estimateOrthographicSize();
            this.camera.setTarget(Vector3.Zero());
            let light = new HemisphericLight('light', new Vector3(40, 44, 1), scene);
            light.intensity = 0.1;
            light.diffuse = new Color3(1.0, 0.97, 0.93);
            let spot = new DirectionalLight('spot', new Vector3(0, -1, -1), scene);
            spot.intensity = 1;
            spot.position = new Vector3(35, 35, 35)
            this.loadingView.loadAssets(scene)
            return scene;
        }

        this.scene = createScene();
        this.energyBars = [];
        this.highlightLayer = new HighlightLayer('highlightLayer', this.scene);
        this.animate = () => this.scene.render();
        window.addEventListener('resize', this.resize);
        this.animations = [];
        this.playerGameField = null;
        this.opponentGameField = null;
        this.renderLoopRepetitions = 0;
        this.opponentGameFieldDistance = 12;

        this.InfoType = Object.freeze({
            CACAO_HARVESTED: 'InfoType.CACAO_HARVESTED',
            CACAO_CONSUMED: 'InfoType.CACAO_CONSUMED',
            INCREASE_BUILDINGS_PER_TURN: 'InfoType.INCREASE_BUILDINGS_PER_TURN',
            INCREASE_CACAO_PER_TURN: 'InfoType.INCREASE_CACAO_PER_TURN',
            INCREASE_ATTACKS_PER_TURN: 'InfoType.INCREASE_ATTACKS_PER_TURN',
            INCREASE_SPY_ATTACKS_PER_TURN: 'InfoType.INCREASE_SPY_ATTACKS_PER_TURN',
            BUNNY_CAUGHT: 'InfoType.BUNNY_CAUGHT'
        });
    }

    hideEnergyBar = (position, field) => {
        if (position === null) {
            position = new Vector3(field.row, 6.5, field.col);
        }
        let name = position.x + '-6.5-' + position.z;
        if (this.energyBars.includes(name)) {
            this.scene.stopAnimation(this.scene.getMeshByName('energy.bar.' + name));
        }        
    }

    showEnergyBar = (entity, position) => {
        if (typeof position === 'undefined') {
            position = new Vector3(entity.position.row, 6.5, entity.position.col);
        } else {
            position.y = 6.5;
        }
        let name = position.x + '-6.5-' + position.z;
        this.hideEnergyBar(position);
        this.energyBars.push(name);

        let energy = entity.hp / entity.max.hp;
        let bar = MeshBuilder.CreatePlane('energy.bar.' + name, { width: energy, height: 0.15 }, this.scene);
        bar.isPickable = false;
        let material = new StandardMaterial('energy.bar.material.' + name, this.scene);
        if (energy < 0.3) {
            material.diffuseColor﻿ = Color3.FromHexString("#D05531");
        } else if (energy < 0.6) {
            material.diffuseColor﻿ = Color3.FromHexString("#DFBF31");
        } else {
            material.diffuseColor﻿ = Color3.FromHexString("#70bf31");
        }

        bar.material = material;
        bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
        bar.position = position.clone();
        bar.position.x = bar.position.x + (1 - energy) * 0.35;
        bar.position.z = bar.position.z - (1 - energy) * 0.35;

        let fade = new Animation("fade", "visibility", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
        fade.setKeys([{ frame: 0, value: 1.0 }, { frame: 180, value: 0.9 }, { frame: 240, value: 0.0 }]);

        this.setRenderLoop();
        bar.animations = [fade];
        this.scene.beginAnimation(bar, 0, 240, false, 1, () => {
            material.dispose();
            bar.dispose();
            this.energyBars = this.energyBars.filter(bar => bar !== name);
            this.setRenderLoop(false);
        });
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resize);
    }

    componentDidUpdate() {
        if (typeof this.props.game !== 'undefined' && typeof this.lookAtOpponent !== 'undefined') {
            if (!this.lookAtOpponent && ((!multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) && this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
                ( multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) && this.props.game.state === GameStateTypes.ATTACK_PHASE))) {
                this.lookAtOpponent = true;
                this.performCameraFlight();
            } else if (this.lookAtOpponent && ((!multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) && this.props.game.state === GameStateTypes.ATTACK_PHASE) ||
                ( multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) && this.props.game.state !== GameStateTypes.ATTACK_PHASE))) {
                this.lookAtOpponent = false;
                this.performCameraFlight();
            }
        
            if (this.playerGameField !== null) {
                this.opponentGameField.update();
                this.playerGameField.update();
                this.scene.render();
            }
        }
    }

    spawnInfo(messageType, position, amount) {
        let id = Date.now();
        let info = MeshBuilder.CreatePlane('info_' + id, { width: 1.65, height: 1.65 }, this.scene);
        info.isPickable = false;
        info.position = position;
        info.position.y = 6;
        info.billboardMode = Mesh.BILLBOARDMODE_ALL;

        let texture = new DynamicTexture('info_texture_' + id, 208, this.scene);
        let context = texture.getContext();

        let material = new StandardMaterial('info_material_' + id, this.scene);
        material.emissiveTexture = texture;
        material.ambientTexture = texture;
        material.opacityTexture = texture;

        info.material = material;
        
        let drawInfo = (filename, color, text) => {
            let image = new Image();
            image.src = filename;
            image.onload = () => {
                this.setRenderLoop();
                context.drawImage(image, 0, 0);
                texture.update(); 

                if (typeof text !== 'undefined') {
                    let shadowColor = '#7b0000';
                    if (color === '#70bf31') {
                        shadowColor = '#44741e';
                    }

                    texture.drawText(text, 48, 102, 'bold 48px PT Serif', shadowColor, null, true, true);
                    texture.drawText(text, 46, 100, 'bold 48px PT Serif', color, null, true, true);
                }
                
                let flyaway = new Animation('flyaway_' + id, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
                let fade = new Animation("fade", "visibility", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
                fade.setKeys([{ frame: 0, value: 1.0 }, { frame: 100, value: .8 }, { frame: 120, value: 0.0 }]);
                let keyframes = [{ frame: 0, value: info.position.y }, { frame: 120, value: info.position.y + 2.5 }];
                flyaway.setKeys(keyframes);
                info.animations = [flyaway, fade];
                this.scene.beginAnimation(info, 0, 180, false, 1, () => {
                    info.dispose();
                    texture.dispose();
                    material.dispose();
                    this.setRenderLoop(false);
                });
            }
        }

        if (messageType === this.InfoType.CACAO_HARVESTED) {
            drawInfo('images/cacao_no_background.png','#70bf31', '+' + amount);
        } else if (messageType === this.InfoType.CACAO_CONSUMED) {
            drawInfo('images/cacao_no_background.png','#c70000', '-' + amount);
        } else if (messageType === this.InfoType.INCREASE_CACAO_PER_TURN) {
            drawInfo('images/cacaoPerTurn.png','#70bf31', '+' + amount);
        } else if (messageType === this.InfoType.INCREASE_BUILDINGS_PER_TURN) {
            drawInfo('images/buildingsPerTurn.png','#70bf31', '+' + amount);
        } else if (messageType === this.InfoType.INCREASE_ATTACKS_PER_TURN) {
            drawInfo('images/attacksPerTurn.png','#70bf31', '+' + amount);
        } else if (messageType === this.InfoType.INCREASE_SPY_ATTACKS_PER_TURN) {
            drawInfo('images/spyAttacksPerTurn.png','#70bf31', '+' + amount);
        } else if (messageType === this.InfoType.BUNNY_CAUGHT) {
            drawInfo('images/bunnyCaught.png');
        }
    }

    triggerCacaoInfo() {
        let cells = this.props.game.board.fields[this.props.game.players[multiplayer.localPlayerIndex].fieldIndex].grid;

        let entities = cells.filter(cell => cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0)
        entities.forEach(cell => this.showEnergyBar(cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM)[0], new Vector3(cell.row, 0, cell.col)))

        let trees = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE));
        let description = getEntityDescriptor(EntityType.CACAOTREE, this.props.game.players[multiplayer.localPlayerIndex].level);
        trees.forEach(cell => {
            this.spawnInfo(this.InfoType.CACAO_HARVESTED, new Vector3(cell.row, 0, cell.col), cell.type === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn()[0] * 1.5) : description.cacaoPerTurn()[0]);
        });
        let factory = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY));
        description = getEntityDescriptor(EntityType.FACTORY, this.props.game.players[multiplayer.localPlayerIndex].level);
        factory.forEach(cell => {
            this.spawnInfo(this.InfoType.CACAO_HARVESTED, new Vector3(cell.row, 0, cell.col), description.cacaoPerTurn()[0]);
        });
    }

    estimateOrthographicSize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        let ratio = width / height;
        let distance = Math.max(7.5 / ratio, 5);

        if (this.props.tutorial) {
            distance = Math.max(3 / ratio, 5);
        }

        this.camera.orthoTop = distance;
        this.camera.orthoBottom = - distance;
        this.camera.orthoLeft = - distance * ratio;
        this.camera.orthoRight = distance * ratio;
    }

    resize = () => {
        this.estimateOrthographicSize();
        this.engine.resize();
        this.scene.render();
    }

    clear() {
        let instances = this.scene.meshes.filter(mesh => mesh.isAnInstance);
        for (let mesh = 0; mesh < instances.length; mesh++) {
            instances[mesh].dispose();   
        }
        this.playerGameField = null;
        this.opponentGameField = null;
        this.scene.render();
        this.camera.position = new Vector3(30, 30, 30);
        this.lookAtOpponent = undefined;
    }

    highlightCannons = (highlight=true) => {
        let parent = this.scene.getMeshByName(EntityType.RUM_TRUFFLE_CANNON + '__root__');
        let children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();

        children.forEach(child => {
            if (highlight) {
                this.highlightLayer.addMesh(child, new Color3(1, 1, 0));   
            } else {
                this.highlightLayer.removeMesh(child);
            }
        });                    
    }

    detonateAtShield(row, col, playerField=false) {
        let truffle = MeshBuilder.CreateTorus('knot', {diameter: 0.1}, this.scene);
        truffle.material = this.scene.getMaterialByName(BoardCellTypes.BROWN + '.material');
        if (playerField) {
            truffle.position = new Vector3(row, 5, col);
            this.playerGameField.explode(truffle);
        } else {
            truffle.position = new Vector3(row - this.opponentGameFieldDistance, 5, col + this.opponentGameFieldDistance);
            this.opponentGameField.explode(truffle);
        }
    }

    playerFieldClick(row, col, position) {
        let buildingSelected = this.props.selectedBuilding;
        let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
        if (buildingSelected || (initialPlacement && this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn === 0)) {
            let building;
            if (initialPlacement) {
                building = createEntity(EntityType.FACTORY, this.props.game.players[multiplayer.localPlayerIndex].level);
            } else {
                building = createEntity(this.props.selectedBuilding, this.props.game.players[multiplayer.localPlayerIndex].level);
            }
            building.position = { row: row, col: col };
            let playerCacaoPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn;
            let buildingsPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn;
            this.props.build({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id, building: building }).then(() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
                if (building.type !== EntityType.CREAM) {
                    this.showEnergyBar(building);
                }
                if (initialPlacement) {
                    this.spawnInfo(this.InfoType.INCREASE_BUILDINGS_PER_TURN, position.clone(), this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn);
                    this.props.deselectBuildings();
                    this.props.deselectAttack();
                    let playerId = this.props.game.players[multiplayer.localPlayerIndex].id;
                    setTimeout(() => {
                        let description = getEntityDescriptor(EntityType.FACTORY, this.props.game.players[multiplayer.localPlayerIndex].level);
                        this.spawnInfo(this.InfoType.INCREASE_CACAO_PER_TURN, position.clone(), description.cacaoPerTurn()[0]);
                    }, 1000);
                    setTimeout(() => {
                        if (playerId === this.props.game.players[multiplayer.localPlayerIndex].id) {
                            this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
                            this.props.deselectBuildings();
                            this.props.deselectAttack();
                        }
                    }, 3000);
                } else {
                    let description = getEntityDescriptor(this.props.selectedBuilding, this.props.game.players[multiplayer.localPlayerIndex].level);
                    this.spawnInfo(this.InfoType.CACAO_CONSUMED, position.clone(), description.costs());
                    let cacaoDelta = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn - playerCacaoPerTurnBefore;
                    let buildingsDelta = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn - buildingsPerTurnBefore;
                    setTimeout(() => {
                        if (building.type === EntityType.CACAOTREE) {
                            this.spawnInfo(this.InfoType.INCREASE_CACAO_PER_TURN, position.clone(), cacaoDelta);
                        } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                            this.spawnInfo(this.InfoType.INCREASE_ATTACKS_PER_TURN, position.clone(), 1);
                        } else if (building.type === EntityType.FACTORY_EXTENSION) {
                            this.spawnInfo(this.InfoType.INCREASE_BUILDINGS_PER_TURN, position.clone(), buildingsDelta);
                        } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
                            this.spawnInfo(this.InfoType.INCREASE_SPY_ATTACKS_PER_TURN, position.clone(), 1);
                        }
                        setTimeout(() => {
                            if (this.props.game.players[multiplayer.localPlayerIndex].buildings === 0 || this.props.game.players[multiplayer.localPlayerIndex].cacao < getCheapest().costs()) {
                                if (playerHasAttacks(this.props.game.players[multiplayer.localPlayerIndex]) === true) {
                                    this.props.finishBuildPhase({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                        this.props.deselectBuildings();
                                    }).catch(error => {
                                        if (error instanceof BattlechocError) {
                                            console.warn(error);
                                        } else {
                                            throw error;
                                        }
                                    });
                                } else {
                                    this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id }).then(() => {
                                        this.props.deselectBuildings();
                                        this.props.deselectAttack();
                                    }).catch(error => {
                                        if (error instanceof BattlechocError) {
                                            console.warn(error);
                                        } else {
                                            throw error;
                                        }
                                    });
                                }
                            }
                        }, 2000);
                    }, 1000);
                }
            }).catch(error => {
                if (error instanceof BattlechocError) {
                    console.warn(error);
                } else {
                    throw error;
                }
            });
        }
    }

    opponentFieldClick(row, col, position) {
        if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) && this.props.game.state === GameStateTypes.ATTACK_PHASE) {
            let attack = 0;
            if (this.props.selectedAttack === AttackType.TRUFFLE) {
                let description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, this.props.game.players[multiplayer.localPlayerIndex].level);
                attack = description.attack()[0];
            } else if (this.props.selectedAttack === AttackType.FRUIT) {
                let description = getEntityDescriptor(EntityType.FRUIT_CANNON, this.props.game.players[multiplayer.localPlayerIndex].level);
                attack = description.attack()[0];
            }

            let damage = (1 + ((Math.random() * 0.4) - 0.2)) * attack;

            const attackParams = {
                issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
                attackType: this.props.selectedAttack,
                damage: damage,
                row: row,
                col: col
            };
            this.props.attack(attackParams).then(() => {
                if (attackParams.attackType === AttackType.BUNNY) {
                    if (this.props.game.players[multiplayer.localPlayerIndex].attacksPerTurn[AttackType.BUNNY] > 0) {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                    } else {
                        Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                        this.spawnInfo(this.InfoType.BUNNY_CAUGHT, position.clone());
                    }
                } else if (typeof attackParams.attackType !== 'undefined') {
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    let cellAt = (board, field, row, col) => board.fields[field].grid[row * board.size.cols + col];
                    let selectedCell = cellAt(this.props.game.board, this.props.game.players[1 - multiplayer.localPlayerIndex].fieldIndex, row, col);
                    this.detonateAtShield(row, col);
                    if (selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0) {
                        this.showEnergyBar(selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM)[0], position.clone());
                    } else {
                        this.hideEnergyBar(position.clone());
                    }
                }

                if (this.props.game.players[multiplayer.localPlayerIndex].attacks[attackParams.attackType] === 0) {
                    const attackTypes = [AttackType.TRUFFLE, AttackType.FRUIT, AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
                    let undepletedAttack = attackTypes.filter(attackType => this.props.game.players[multiplayer.localPlayerIndex].attacks[attackType] > 0);
                    if (undepletedAttack.length > 0) {
                        this.props.selectAttack(undepletedAttack[0]).catch(error => {
                            if (error instanceof BattlechocError) {
                                console.warn(error);
                            } else {
                                throw error;
                            }
                        });
                    }
                }
            }).catch(error => {
                if (error instanceof BattlechocError) {
                    console.warn(error);
                } else {
                    throw error;
                }
            }); 
        }
    }

    setRenderLoop(run=true) {
        if (run) {
            if (this.renderLoopRepetitions === 0) {
                this.engine.runRenderLoop(this.animate);
            }
            this.renderLoopRepetitions += 1;
        } else if (!run) {
            this.renderLoopRepetitions -= 1;
            if (this.renderLoopRepetitions === 0) {
                this.engine.stopRenderLoop(this.animate);
            }
        }
    }

    performCameraFlight = () => {
        this.setRenderLoop();
        let target = new Vector3(30, 30, 30);
        if (this.lookAtOpponent) {
            target = new Vector3(6, 18, 30);
        }
        let flight = new Animation("animCam", "position", 30, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE);
        let keyframes = [{ frame: 0, value: this.camera.position }, { frame: 30, value: target }];
        flight.setKeys(keyframes);
        this.scene.beginDirectAnimation(this.camera, [flight], 0, 60, false, 1, () => this.setRenderLoop(false));
    };

    startGame = (game, overrideUiState=false) => {
        const playerFieldIndex = game.players[multiplayer.localPlayerIndex].fieldIndex;
        const opponentFieldIndex = game.players[1 - multiplayer.localPlayerIndex].fieldIndex;
        if ((multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state !== GameStateTypes.ATTACK_PHASE) ||
            (!multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state === GameStateTypes.ATTACK_PHASE)) {
            this.lookAtOpponent = false;
        } else {
            this.lookAtOpponent = true;
            this.performCameraFlight();
        }

        let gamefieldHeight = 5;
        if (this.props.tutorial) {
            gamefieldHeight = 3.5;
        }

        this.playerGameField = new Gamefield(true, new Vector3(0, gamefieldHeight, 0), () => this.props.game.board.fields[playerFieldIndex], playerFieldIndex, game.board.size, this.scene, (row, col, eventX, eventY) => this.playerFieldClick(row, col, eventX, eventY), run => this.setRenderLoop(run));
        this.opponentGameField = new Gamefield(false, new Vector3(-this.opponentGameFieldDistance, gamefieldHeight, this.opponentGameFieldDistance), () => this.props.game.board.fields[opponentFieldIndex], opponentFieldIndex, game.board.size, this.scene, (row, col, eventX, eventY) => this.opponentFieldClick(row, col, eventX, eventY), run => this.setRenderLoop(run));

        if (overrideUiState) {
            this.props.deselectBuildings();
        }
        this.resize();
    }

    render() {
        return (
            <div>
                { this.props.assetsReady ? null : <AssetLoadingView onRef={loadingView => this.loadingView = loadingView} /> }
                <canvas className="gameCanvas" ref={container => { this.container = container }} />
            </div>
        );
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    level: state.gameplay.level,
    selectedBuilding: state.ui.selectedBuilding,
    selectedAttack: state.ui.selectedAttack,
    assetsReady: state.ui.assetsReady,
    tutorial: state.ui.tutorial
});

const mapDispatchToProps = {
    finishTurn,
    build,
    attack,
    deselectBuildings,
    selectAttack,
    selectBuilding,
    deselectAttack,
    finishBuildPhase
};

const SceneContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Scene);

export default SceneContainer;