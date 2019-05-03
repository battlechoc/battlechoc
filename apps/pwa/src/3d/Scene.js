import React, { Component } from 'react';
import { connect } from 'react-redux';
import { deselectBuildings, selectAttack, deselectAttack } from '../ui/UiActions';
import { build, attack, finishTurn } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { BoardCellTypes, EntityType, AttackType, createEntity, getEntityDescriptor } from '../gameplay/GameEntities';
import Gamefield from './Gamefield';
import Jukebox from '../ui/Jukebox';
import { InfoType, spawnInfo, spawnInfoAtBuilding } from '../ui/FlyingInfo';
import { BattlechocError } from '../gameplay/Errors';
import { playerHasAttacks } from '../gameplay/Player';
import { DirectionalLight, Clock, Scene as ThreeScene, WebGLRenderer, OrthographicCamera, Raycaster, Vector2 } from 'three';

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

        this.renderer = new WebGLRenderer({ alpha: true });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
        this.renderer.domElement.id = 'game-canvas'
        this.renderer.gammaOutput = true;
        this.renderer.gammaFactor = 1.7;

        // animations and renderer
        this.mixer = null;
        this.container.appendChild(this.renderer.domElement);

        // Allow clicking
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();
        this.start();
    }

    componentDidUpdate() {
        if (typeof this.props.game !== 'undefined') {
            this.lookAtOpponent = (this.props.game.currentPlayerIndex === 1 &&
                this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
                (this.props.game.currentPlayerIndex === 0 &&
                    this.props.game.state === GameStateTypes.ATTACK_PHASE);
        }
    }

    triggerCacaoInfo() {
        const specialTrees = this.props.game.board.fields[this.props.game.players[0].fieldIndex].grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE) && cell.type === BoardCellTypes.WHITE);
        const trees = this.props.game.board.fields[this.props.game.players[0].fieldIndex].grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE) && cell.type !== BoardCellTypes.WHITE);
        let description = getEntityDescriptor(EntityType.CACAOTREE)
        trees.forEach(cell => spawnInfoAtBuilding({
            tree: this.playerGameField.getBuildingAtPosition(cell),
            cacao: description.cacaoPerTurn,
            camera: this.camera,
            type: InfoType.CACAO_HARVESTED,
            container: this.container
        })
        );
        specialTrees.forEach(cell => spawnInfoAtBuilding({
            tree: this.playerGameField.getBuildingAtPosition(cell),
            cacao: Math.round(description.cacaoPerTurn * 1.5),
            camera: this.camera,
            type: InfoType.CACAO_HARVESTED,
            container: this.container
        })
        );
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
    }

    resetLight = () => {
        this.scene.traverse(child => {
            if (child instanceof DirectionalLight) {
                child.intensity = 2.0;
            }
        });
    }

    onClick = event => {
        // TODO: implement new stats with console.log(this.renderer.info.render.calls)
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.props.game.currentPlayerIndex === 0) {
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
        if (intersects.length > 0 && (buildingSelected || (initialPlacement && this.props.game.players[0].buildingsPerTurn === 0))) {
            let building = null;
            if (initialPlacement) {
                building = createEntity(EntityType.FACTORY);
            } else {
                building = createEntity(this.props.selectedBuilding);
            }
            let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
            building.position = { row: cellIndex.row, col: cellIndex.col }
            let playerCacaoPerTurnBefore = this.props.game.players[0].cacaoPerTurn;
            let buildingsPerTurnBefore = this.props.game.players[0].buildingsPerTurn;
            this.props.build({ issuer: this.props.game.players[0].id, building: building }).then(() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
                this.playerGameField.setBuilding(building.type, building.position);
                if (initialPlacement) {
                    spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: this.props.game.players[0].buildingsPerTurn, x: event.clientX, y: event.clientY, container: this.container });
                    this.props.deselectBuildings();
                    this.props.deselectAttack();
                    setTimeout(() => {
                        this.props.finishTurn({ issuer: this.props.game.players[0].id });
                        this.props.deselectBuildings();
                        this.props.deselectAttack();
                    }, 3000);
                } else {
                    let description = getEntityDescriptor(this.props.selectedBuilding)
                    spawnInfo({ type: InfoType.CACAO_CONSUMED, cacao: description.costs, x: event.clientX, y: event.clientY, container: this.container });
                    let cacaoDelta = this.props.game.players[0].cacaoPerTurn - playerCacaoPerTurnBefore;
                    let buildingsDelta = this.props.game.players[0].buildingsPerTurn - buildingsPerTurnBefore;
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
            if (intersects.length > 0 && playerHasAttacks(this.props.game.players[0]) === true) {
                let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
                let target = { row: cellIndex.row, col: cellIndex.col };
                this.props.attack({
                    issuer: this.props.game.players[0].id,
                    attackType: this.props.selectedAttack,
                    row: target.row,
                    col: target.col
                }).then(() => {
                    if (this.props.selectedAttack === AttackType.BUNNY) {
                        if (this.props.game.players[0].attacksPerTurn[AttackType.BUNNY] > 0) {
                            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                            this.opponentGameField.attack(target, AttackType.BUNNY);
                        } else {
                            Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                            this.playerGameField.meltDownEasterBunny();
                            this.opponentGameField.receiveBallista(target);
                            spawnInfo({ type: InfoType.BUNNY_CAUGHT, x: event.clientX, y: event.clientY, container: this.container });
                        }
                    } else if (typeof this.props.selectedAttack !== 'undefined') {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                        const attackedCell = this.props.game.board.fields[this.props.game.players[1].fieldIndex].grid[target.row * this.props.game.board.size.cols + target.col];
                        this.opponentGameField.attack(target, this.props.selectedAttack, attackedCell.shielded);
                        if (this.props.selectedAttack === AttackType.HOT_CHOCOLATE) {
                            let opponentFieldIndex = this.props.game.players[1].fieldIndex;
                            this.opponentGameField.rebuild(this.props.game.board.fields[opponentFieldIndex]);
                        }
                    }

                    if (this.props.game.players[0].attacks[this.props.selectedAttack] === 0) {
                        const attackTypes = [AttackType.TRUFFLE, AttackType.FRUIT, AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
                        let undepletedAttack = attackTypes.filter(attackType => this.props.game.players[0].attacks[attackType]);
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

    startGame = (createUnits, game) => {
        const playerFieldIndex = game.players[0].fieldIndex;
        const opponentFieldIndex = game.players[1].fieldIndex;
        this.lookAtOpponent = game.currentPlayerIndex === 1;

        // Add Light
        var directionalLight = new DirectionalLight(0xfef8cb, 2.0);
        directionalLight.position.set(20, 24, -10);
        directionalLight.castShadow = false;
        this.scene.add(directionalLight);

        this.playerGameField = new Gamefield(true, [-72, -16, 0], game.board.fields[playerFieldIndex], playerFieldIndex, game.board.size);
        this.opponentGameField = new Gamefield(false, [72, 56, 0], game.board.fields[opponentFieldIndex], opponentFieldIndex, game.board.size);
        this.scene.add(this.playerGameField.gameField);
        this.scene.add(this.opponentGameField.gameField);

        // Setup Game EventListener
        this.container.onclick = event => this.onClick(event);

        // Prepare click targets
        this.clickTargets = this.playerGameField.getClickableFields();
        this.opponentClickTargets = this.opponentGameField.getClickableFields();

        if (createUnits === true) {
            this.props.deselectBuildings();
            this.lookAtOpponent = (game.currentPlayerIndex === 1 || game.state === GameStateTypes.ATTACK_PHASE);
            game.board.fields[game.players[0].fieldIndex].grid.forEach((cell) => {
                cell.occupiedBy.forEach((building) => {
                    if (building !== EntityType.CREAM) {
                        this.playerGameField.setBuilding(building, { row: cell.row, col: cell.col });
                    }
                });
            });
            game.board.fields[game.players[1].fieldIndex].grid.forEach((cell) => {
                cell.occupiedBy.forEach((building) => {
                    if (building !== EntityType.CREAM) {
                        this.opponentGameField.setBuilding(building, { row: cell.row, col: cell.col });
                    }
                });
            });
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
        }
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateDimensions);
        this.stop();
        this.container.removeChild(this.renderer.domElement);
    }

    start = () => {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.animate);
        }
    }

    stop = () => {
        cancelAnimationFrame(this.frameId);
    }

    animate = () => {
        let delta = this.clock.getDelta();

        if (this.lookAtOpponent && this.camera.position.y < 100) {
            this.camera.position.y += 2.0;
            this.camera.position.x += 4.0;
        } else if (!this.lookAtOpponent && this.camera.position.y > 30) {
            this.camera.position.y -= 2.0;
            this.camera.position.x -= 4.0;
        }

        this.renderScene();

        if (this.opponentGameField) {
            this.opponentGameField.animate(delta);
        }

        if (this.playerGameField) {
            this.playerGameField.animate(delta);
        }

        this.frameId = window.requestAnimationFrame(this.animate);
    }

    renderScene() {
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
    deselectAttack,
};

const SceneContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Scene);

export default SceneContainer;