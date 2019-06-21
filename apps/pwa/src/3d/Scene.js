import React, { Component } from 'react';
import PropTypes from 'prop-types';
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
import { InfoType, spawnInfo } from '../ui/misc/FlyingInfo';
import { Scene as BabylonScene, Engine, HighlightLayer, FlyCamera, Color3, Camera, Vector3, HemisphericLight, Color4, Animation, Matrix } from 'babylonjs';
import 'babylonjs-loaders';

class Scene extends Component {

    componentDidMount() {
        this.props.onRef(this);
        this.engine = new Engine(this.container, false, { preserveDrawingBuffer: true, stencil: true, useHighPrecisionFloats: false }, true);

        let createScene = () => {
            let scene = new BabylonScene(this.engine);
            scene.clearColor = new Color4(0, 0, 0, 0);
            this.camera = new FlyCamera("camera", new Vector3(30, 30, 30), scene);
            this.orthographicSize = 7;
            this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
            let ratio = this.engine.getAspectRatio(this.camera);
            this.camera.orthoTop = this.orthographicSize;
            this.camera.orthoBottom = -this.orthographicSize;
            this.camera.orthoLeft = - this.orthographicSize * ratio;
            this.camera.orthoRight = this.orthographicSize * ratio;
            this.camera.setTarget(Vector3.Zero());
            this.light = new HemisphericLight('light', new Vector3(40, 44, 1), scene);
            this.light.intensity = 0.95;
            this.light.diffuse = new Color3(1.0, 0.97, 0.93);

            this.props.loadAssets(scene);
            return scene;
        }

        this.scene = createScene();
        this.highlightLayer = new HighlightLayer('highlightLayer', this.scene);
        this.animate = () => this.scene.render();
        window.addEventListener('resize', () => this.resize());
        this.animations = [];
        this.lookAtOpponent = true;
        this.playerGameField = null;
        this.opponentGameField = null;
        this.renderLoopRepetitions = 0;
    }

    componentWillUnmount() {
        window.removeEventListener('resize', () => this.resize());
    }

    componentDidUpdate() {
        if (typeof this.props.game !== 'undefined') {
            if (this.lookAtOpponent !== ((multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === false &&
                this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
                (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true &&
                    this.props.game.state === GameStateTypes.ATTACK_PHASE))) {
                this.lookAtOpponent = !this.lookAtOpponent;
                this.performCameraFlight();
            }
        
            if (this.playerGameField !== null) {
                this.opponentGameField.update();
                this.playerGameField.update();
                this.scene.render();
            }
        }
    }

    triggerCacaoInfo() {
        let trees = this.props.game.board.fields[this.props.game.players[multiplayer.localPlayerIndex].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE));
        let description = getEntityDescriptor(EntityType.CACAOTREE);
        trees.forEach(cell => {
            let point = Vector3.Project(new Vector3(cell.row, 3, cell.col), 
                Matrix.Identity(), 
                this.scene.getTransformMatrix(), 
                this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
            spawnInfo({
                x: point.x,
                y: point.y,
                cacao: cell.type === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn,
                type: InfoType.CACAO_HARVESTED
            });
        });
    }

    resize = () => {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        let ratio = width / height;
        this.camera.orthoTop = this.orthographicSize;
        this.camera.orthoBottom = -this.orthographicSize;
        this.camera.orthoLeft = - this.orthographicSize * ratio;
        this.camera.orthoRight = this.orthographicSize * ratio;
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
        /*let position3d = { x: row * this.playerGameField.fieldSize, y: 0, z: col * this.playerGameField.fieldSize };
        if (playerField) {
            this.startAnimation(this.playerGameField.gameField, false, 'ATTACK_AT_SHIELD_EXPLOSION', position3d);
        } else {
            this.startAnimation(this.opponentGameField.gameField, false, 'ATTACK_AT_SHIELD_EXPLOSION', position3d);
        }*/
    }

    playerFieldClick(row, col, eventX, eventY) {
        let buildingSelected = this.props.selectedBuilding;
        let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
        if (buildingSelected || (initialPlacement && this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn === 0)) {
            let building;
            if (initialPlacement) {
                building = createEntity(EntityType.FACTORY);
            } else {
                building = createEntity(this.props.selectedBuilding);
            }
            building.position = { row: row, col: col }
            let playerCacaoPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn;
            let buildingsPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn;
            this.props.build({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id, building: building }).then(() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
                if (initialPlacement) {
                    spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn, x: eventX, y: eventY});
                    this.props.deselectBuildings();
                    this.props.deselectAttack();
                    let playerId = this.props.game.players[multiplayer.localPlayerIndex].id;
                    setTimeout(() => {
                        if (playerId === this.props.game.players[multiplayer.localPlayerIndex].id) {
                            this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
                            this.props.deselectBuildings();
                            this.props.deselectAttack();
                        }
                    }, 3000);
                } else {
                    let description = getEntityDescriptor(this.props.selectedBuilding)
                    spawnInfo({ type: InfoType.CACAO_CONSUMED, cacao: description.costs, x: eventX, y: eventY});
                    let cacaoDelta = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn - playerCacaoPerTurnBefore;
                    let buildingsDelta = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn - buildingsPerTurnBefore;
                    setTimeout(() => {
                        if (building.type === EntityType.CACAOTREE) {
                            spawnInfo({ type: InfoType.INCREASE_CACAO_PER_TURN, cacao: cacaoDelta, x: eventX, y: eventY});
                        } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                            spawnInfo({ type: InfoType.INCREASE_ATTACKS_PER_TURN, attacks: 1, x: eventX, y: eventY});
                        } else if (building.type === EntityType.FACTORY_EXTENSION) {
                            spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: buildingsDelta, x: eventX, y: eventY});
                        } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
                            spawnInfo({ type: InfoType.INCREASE_SPY_ATTACKS_PER_TURN, attacks: 1, x: eventX, y: eventY});
                        }
                        setTimeout(() => {
                            if (this.props.game.players[multiplayer.localPlayerIndex].buildings === 0 || this.props.game.players[multiplayer.localPlayerIndex].cacao < getCheapest().costs) {
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

    opponentFieldClick(row, col, eventX, eventY) {
        if (this.lookAtOpponent && this.props.game.state === GameStateTypes.ATTACK_PHASE && typeof this.props.selectedAttack !== 'undefined') {
            this.props.attack({
                issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
                attackType: this.props.selectedAttack,
                row: row,
                col: col
            }).then(() => {
                if (this.props.selectedAttack === AttackType.BUNNY) {
                    if (this.props.game.players[multiplayer.localPlayerIndex].attacksPerTurn[AttackType.BUNNY] > 0) {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                    } else {
                        Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                        spawnInfo({ type: InfoType.BUNNY_CAUGHT, x: eventX, y: eventY});
                    }
                } else if (typeof this.props.selectedAttack !== 'undefined') {
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    let cellAt = (board, field, row, col) => board.fields[field].grid[row * board.size.cols + col];
                    if (cellAt(this.props.game.board, this.props.game.players[1 - multiplayer.localPlayerIndex].fieldIndex, row, col).shielded) {
                        this.detonateAtShield(row, col);
                    }
                }

                if (this.props.game.players[multiplayer.localPlayerIndex].attacks[this.props.selectedAttack] === 0) {
                    const attackTypes = [AttackType.TRUFFLE, AttackType.FRUIT, AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
                    let undepletedAttack = attackTypes.filter(attackType => this.props.game.players[multiplayer.localPlayerIndex].attacks[attackType]);
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

        if (this.lookAtOpponent !== ((multiplayer.isLocalPlayer(game.currentPlayerIndex) === false &&
            game.state !== GameStateTypes.ATTACK_PHASE) ||
            (multiplayer.isLocalPlayer(game.currentPlayerIndex) === true &&
            game.state === GameStateTypes.ATTACK_PHASE))) {
            this.lookAtOpponent = !this.lookAtOpponent;
            this.performCameraFlight();
        } 

        this.playerGameField = new Gamefield(true, new Vector3(0, 4, 0), () => this.props.game.board.fields[playerFieldIndex], playerFieldIndex, game.board.size, this.scene, (row, col, eventX, eventY) => this.playerFieldClick(row, col, eventX, eventY), run => this.setRenderLoop(run));
        this.opponentGameField = new Gamefield(false, new Vector3(-12, 4, 12), () => this.props.game.board.fields[opponentFieldIndex], opponentFieldIndex, game.board.size, this.scene, (row, col, eventX, eventY) => this.opponentFieldClick(row, col, eventX, eventY), run => this.setRenderLoop(run));

        if (overrideUiState) {
            this.props.deselectBuildings();
        }
    }

    render() {
        return <canvas className="gameCanvas" ref={container => { this.container = container }} />
    }
}

Scene.propTypes = {
    loadAssets: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    selectedBuilding: state.ui.selectedBuilding,
    selectedAttack: state.ui.selectedAttack
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