import React, { Component } from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../Multiplayer';
import { deselectBuildings, selectAttack, deselectAttack, selectBuilding } from '../ui/UiActions';
import { build, attack, finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { BoardCellTypes, EntityType, AttackType, createEntity, getEntityDescriptor, getCheapest } from '../gameplay/GameEntities';
import Gamefield from './Gamefield';
import Animation from './Animation';
import { Jukebox } from '../ui/misc';
import { InfoType, spawnInfo, spawnInfoAtBuilding } from '../ui/misc/FlyingInfo';
import { BattlechocError } from '../gameplay/Errors';
import { playerHasAttacks } from '../gameplay/Player';
import { DirectionalLight, Clock, Scene as ThreeScene, WebGLRenderer, OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';

class Scene extends Component {

    componentDidMount() {
        this.props.onRef(this);
        // Basic window and game setup
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", this.updateDimensions);

        // Setup scene, camera and renderer
        this.scene = new ThreeScene();
        this.clock = new Clock();

        let distance = this.estimateDistance(width / height);
        let aspect = width / height;

        this.camera = new OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 200);
        this.camera.position.set(1, 1, 1);
        this.camera.lookAt(this.scene.position);
        this.camera.position.x = 0;
        this.camera.position.y = 30;
        this.camera.position.z = 70;

        this.renderer = new WebGLRenderer({ alpha: true, antialias: true });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
        this.renderer.domElement.id = 'game-canvas'
        this.renderer.gammaOutput = true;
        this.renderer.gammaFactor = 1.7;

        // animations and renderer
        this.animations = [];
        this.container.appendChild(this.renderer.domElement);

        // Allow clicking
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();
        this.lookAtOpponent = false;
    }

    componentDidUpdate() {
        if (typeof this.props.game !== 'undefined') {
            if (this.lookAtOpponent !== ((multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === false &&
                this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
                (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true &&
                    this.props.game.state === GameStateTypes.ATTACK_PHASE))) {
                this.updateView();
            }
        }

        if (typeof this.opponentGameField !== 'undefined') {
            this.opponentGameField.update();
            this.playerGameField.update();
        }
    }

    updateView() {
        this.lookAtOpponent = !this.lookAtOpponent;
        this.start();
    }

    triggerCacaoInfo() {
        const specialTrees = this.props.game.board.fields[this.props.game.players[multiplayer.localPlayerIndex].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE) && cell.type === BoardCellTypes.WHITE);
        const trees = this.props.game.board.fields[this.props.game.players[multiplayer.localPlayerIndex].fieldIndex].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE) && cell.type !== BoardCellTypes.WHITE);
        let description = getEntityDescriptor(EntityType.CACAOTREE)
        trees.forEach(cell => spawnInfoAtBuilding({
            position: (new Vector3(cell.row * this.playerGameField.fieldSize, 3, cell.col * this.playerGameField.fieldSize)).add(this.playerGameField.gameField.position),
            cacao: description.cacaoPerTurn,
            camera: this.camera,
            type: InfoType.CACAO_HARVESTED,
            container: this.container
        }));
        specialTrees.forEach(cell => spawnInfoAtBuilding({
            position: (new Vector3(cell.row * this.playerGameField.fieldSize, 3, cell.col * this.playerGameField.fieldSize)).add(this.playerGameField.gameField.position),
            cacao: Math.round(description.cacaoPerTurn * 1.5),
            camera: this.camera,
            type: InfoType.CACAO_HARVESTED,
            container: this.container
        }));
    }

    clear() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
    }

    dimLight = () => {
        this.scene.traverse(child => {
            if (child instanceof DirectionalLight) {
                child.intensity = 0.1;
            }
        });
        this.renderScene();
    }

    resetLight = () => {
        this.scene.traverse(child => {
            if (child instanceof DirectionalLight) {
                child.intensity = 2.0;
            }
        });
        this.renderScene();
    }

    onClick = event => {
        // console.log(event.clientX, event.clientY);
        // TODO: implement new stats with console.log(this.renderer.info.render.calls)
        console.log(this.renderer.info.render.calls); // creams + 3
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex)) {
            this.playerFieldClick(event);
            this.opponentFieldClick(event);
        }
    }

    playerFieldClick(event) {
        var intersects = this.raycaster.intersectObjects(this.clickTargets, true);
        intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
            (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
        let buildingSelected = this.props.selectedBuilding;
        let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
        if (intersects.length > 0 && (buildingSelected || (initialPlacement && this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn === 0))) {
            let building = null;
            if (initialPlacement) {
                building = createEntity(EntityType.FACTORY);
            } else {
                building = createEntity(this.props.selectedBuilding);
            }
            let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
            building.position = { row: cellIndex.row, col: cellIndex.col }
            let playerCacaoPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn;
            let buildingsPerTurnBefore = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn;
            this.props.build({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id, building: building }).then(() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
                if (initialPlacement) {
                    spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn, x: event.clientX, y: event.clientY, container: this.container });
                    this.props.deselectBuildings();
                    this.props.deselectAttack();
                    setTimeout(() => {
                        this.props.finishTurn({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
                        this.props.deselectBuildings();
                        this.props.deselectAttack();
                    }, 3000);
                } else {
                    let description = getEntityDescriptor(this.props.selectedBuilding)
                    spawnInfo({ type: InfoType.CACAO_CONSUMED, cacao: description.costs, x: event.clientX, y: event.clientY, container: this.container });
                    let cacaoDelta = this.props.game.players[multiplayer.localPlayerIndex].cacaoPerTurn - playerCacaoPerTurnBefore;
                    let buildingsDelta = this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn - buildingsPerTurnBefore;
                    setTimeout(() => {
                        if (building.type === EntityType.CACAOTREE) {
                            spawnInfo({ type: InfoType.INCREASE_CACAO_PER_TURN, cacao: cacaoDelta, x: event.clientX, y: event.clientY, container: this.container });
                        } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                            spawnInfo({ type: InfoType.INCREASE_ATTACKS_PER_TURN, attacks: 1, x: event.clientX, y: event.clientY, container: this.container });
                        } else if (building.type === EntityType.FACTORY_EXTENSION) {
                            spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: buildingsDelta, x: event.clientX, y: event.clientY, container: this.container });
                        } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
                            spawnInfo({ type: InfoType.INCREASE_SPY_ATTACKS_PER_TURN, attacks: 1, x: event.clientX, y: event.clientY, container: this.container });
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

    opponentFieldClick(event) {
        if (this.lookAtOpponent && this.props.game.state === GameStateTypes.ATTACK_PHASE && typeof this.props.selectedAttack !== 'undefined') {
            var intersects = this.raycaster.intersectObjects(this.opponentClickTargets, true);
            intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
            if (intersects.length > 0 && playerHasAttacks(this.props.game.players[multiplayer.localPlayerIndex]) === true) {
                let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
                let target = { row: cellIndex.row, col: cellIndex.col };
                this.props.attack({
                    issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
                    attackType: this.props.selectedAttack,
                    row: target.row,
                    col: target.col
                }).then(() => {
                    if (this.props.selectedAttack === AttackType.BUNNY) {
                        if (this.props.game.players[multiplayer.localPlayerIndex].attacksPerTurn[AttackType.BUNNY] > 0) {
                            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                        } else {
                            Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                            spawnInfo({ type: InfoType.BUNNY_CAUGHT, x: event.clientX, y: event.clientY, container: this.container });
                        }
                    } else if (typeof this.props.selectedAttack !== 'undefined') {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
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
    }

    startGame = (game, overrideUiState=true) => {
        const playerFieldIndex = game.players[multiplayer.localPlayerIndex].fieldIndex;
        const opponentFieldIndex = game.players[1 - multiplayer.localPlayerIndex].fieldIndex;
        
        if (this.lookAtOpponent !== multiplayer.isLocalPlayer(game.currentPlayerIndex)) {
            this.updateView();
        } else {
            this.start();
        }

        // Add Light
        var directionalLight = new DirectionalLight(0xffffff, 2);
        directionalLight.position.set(40, 44, 1);
        directionalLight.castShadow = false;
        this.scene.add(directionalLight);

        this.playerGameField = new Gamefield(true, [-72, -16, 0], () => this.props.game.board.fields[playerFieldIndex], playerFieldIndex, game.board.size, this.startAnimation, this.renderScene);
        this.opponentGameField = new Gamefield(false, [72, 56, 0], () => this.props.game.board.fields[opponentFieldIndex], opponentFieldIndex, game.board.size, this.startAnimation, this.renderScene);
        this.scene.add(this.playerGameField.gameField);
        this.scene.add(this.opponentGameField.gameField);

        // Setup Game EventListener
        this.container.onclick = event => this.onClick(event);

        // Prepare click targets
        this.clickTargets = this.playerGameField.gameField.children;
        this.opponentClickTargets = this.opponentGameField.gameField.children;
        this.props.selectBuilding(EntityType.FACTORY);

        if (overrideUiState) {
            this.props.deselectBuildings();
        }
    }

    estimateDistance(ratio) {
        if (ratio < 0.9) { return 60; }
        else if (ratio < 1.1) { return 50; }
        else if (ratio < 1.4) { return 40; }
        else { return 30; }
    }

    updateDimensions = () => {
        if (typeof this.container !== 'undefined') {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            this.renderer.setSize(width, height);
            let distance = this.estimateDistance(width / height);

            let aspect = width / height;

            this.camera.left = -distance * aspect;
            this.camera.right = distance * aspect;
            this.camera.top = distance;
            this.camera.bottom = -distance;
            this.camera.updateProjectionMatrix();
            this.renderScene();
        }
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateDimensions);
        this.stop();
        this.container.removeChild(this.renderer.domElement);
    }

    start = () => {
        if (typeof this.frameId === 'undefined') {
            this.frameId = requestAnimationFrame(this.animate);
        }
    }

    stop = () => {
        if (this.animations.length === 0) {
            cancelAnimationFrame(this.frameId);
            this.frameId = undefined;
        }
    }

    startAnimation = (gamefield, turned, asset, position, offset=25) => {
        let id = Math.random().toString().substr(2) + Date.now().toString();
        let animation = new Animation(gamefield, turned, asset, position, id, () => {
            this.animations = this.animations.filter(animation => animation.id !== id);
        });
        this.animations.push(animation);
        animation.play(offset);
        this.start();
    }

    animate = () => {
        let delta = this.clock.getDelta();
        this.renderScene();

        if (this.lookAtOpponent && this.camera.position.y < 100) {
            this.camera.position.y += 2.0;
            this.camera.position.x += 4.0;
            this.frameId = window.requestAnimationFrame(this.animate);
        } else if (!this.lookAtOpponent && this.camera.position.y > 30) {
            this.camera.position.y -= 2.0;
            this.camera.position.x -= 4.0;
            this.frameId = window.requestAnimationFrame(this.animate);
        } else if (this.animations.length > 0) {
            for (let i = 0; i < this.animations.length; i++) {
                this.animations[i].mixer.update(delta);
            }
            this.frameId = window.requestAnimationFrame(this.animate);
        } else {
            this.stop();
        }
    }

    renderScene = () => {
        this.renderer.render(this.scene, this.camera);
    }

    render() {
        return <div className="scene" ref={container => { this.container = container }} />
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    selectedBuilding: state.ui.selectedBuilding,
    selectedAttack: state.ui.selectedAttack,
    // TODO: implement new statistics --> statistics: state.ui.statistics,
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