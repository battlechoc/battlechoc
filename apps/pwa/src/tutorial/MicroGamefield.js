import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Gamefield from '../3d/Gamefield';
import Animation from '../3d/Animation';
import { InfoType, spawnInfoAtBuilding, spawnInfo } from '../ui/misc';
import { EntityType, BoardCellTypes, createEntity, getEntityDescriptor } from '../gameplay/GameEntities';
import { Scene, Clock, OrthographicCamera, WebGLRenderer, Raycaster, Vector2, DirectionalLight } from 'three';
import { Jukebox } from '../ui/misc';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class MicroGamefield extends Component {
    componentDidMount() {
        this.props.onRef(this)
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", () => this.updateDimensions());

        this.scene = new Scene();
        this.clock = new Clock();

        let distance = this.estimateDistance();
        let aspect = width / height;

        this.camera = new OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 200);
        this.camera.position.set(1, 1, 1);
        this.camera.lookAt(this.scene.position);
        this.camera.position.x = 0;
        this.camera.position.y = 30;
        this.camera.position.z = 70;

        this.container.onclick = event => this.onClick(event);
        this.renderer = new WebGLRenderer({ alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
        this.renderer.domElement.id = 'micro-game-canvas'
        this.renderer.gammaOutput = true;
        this.renderer.gammaFactor = 1.7;
        this.animations = [];

        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.size = {rows: this.props.size, cols: this.props.size}

        this.buildings = [...Array(this.size.rows)].map(
            field => Array(this.size.cols).fill([])
        );

        var directionalLight = new DirectionalLight(0xfef8cb, 2.0);
        directionalLight.position.set(20, 24, -10);
        directionalLight.castShadow = false;
        this.scene.add( directionalLight );

        if (!this.props.opponentGamefield) {
            this.microGamefield = new Gamefield(true, [-70, -34.5, 0], this.props.playerSetup, 0, this.size, this.startAnimation, this.renderScene);
            if (typeof this.props.playerSetup !== 'undefined') {
                this.props.playerSetup.grid.forEach(field => {
                    this.buildings[field.row][field.col] = field.occupiedBy;
                    field.occupiedBy.filter(building => building.type !== EntityType.CREAM)
                    .forEach(building => this.microGamefield.setBuilding(building, { row: field.row, col: field.col }));                
                });
            }
            this.scene.add(this.microGamefield.gameField);
        } else if (this.props.opponentGamefield) {
            this.microGamefield = new Gamefield(true, [-98, -46, 0], this.props.playerSetup, 0, this.size, this.startAnimation, this.renderScene);
            
            if (typeof this.props.playerSetup !== 'undefined') {
                this.props.playerSetup.grid.forEach(field => {
                    this.buildings[field.row][field.col] = field.occupiedBy;
                    field.occupiedBy.filter(building => building.type !== EntityType.CREAM)
                    .forEach(building => this.microGamefield.setBuilding(building, { row: field.row, col: field.col }));                
                });
            }

            this.scene.add(this.microGamefield.gameField);
            this.opponentBuildings = [...Array(this.size.rows)].map(
                field => Array(this.size.cols).fill([])
            );

            this.opponentGamefield = new Gamefield(false, [-42, -18, 0], this.props.opponentSetup, 1, this.size, this.startAnimation, this.renderScene);

            if (typeof this.props.opponentSetup !== 'undefined') {
                this.props.opponentSetup.grid.forEach(field => {
                    this.opponentBuildings[field.row][field.col] = field.occupiedBy;
                    field.occupiedBy.filter(building => building.type !== EntityType.CREAM)
                    .forEach(building => this.opponentGamefield.setBuilding(building, { row: field.row, col: field.col }));                  
                });
            }

            this.scene.add(this.opponentGamefield.gameField);
        }
        
        this.start();
    }

    componentWillUnmount() {
        this.stop();
        window.removeEventListener("resize", () => this.updateDimensions());
        this.container.removeChild(this.renderer.domElement);
    }

    estimateDistance() {
        let distance = 16;
        const landscape = window.innerWidth > window.innerHeight;
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (this.props.opponentGamefield) {
            if (landscape) {
                if (width < 500) {
                    distance = 24;
                } else if (width < 600) {
                    distance = 18;
                } else {
                    distance = 16;
                }
            } else {
                if (height < 400) {
                    distance = 38;
                } else if (height < 600) {
                    distance = 36;
                } else {
                    distance = 34;
                }
            }
        } else {
            if (landscape) {
                if (width < 400) {
                    distance = 20;
                } else if (width < 600) {
                    distance = 15;
                } else {
                    distance = 13;
                }
            } else {
                if (height < 400) {
                    distance = 25;
                } else if (height < 600) {
                    distance = 20;
                } else {
                    distance = 18;
                }               
            }         
        }
        return distance;
    }

    updateDimensions() {
        if (typeof this.container !== 'undefined') {
            if (this.container !== null) {
                const width = this.container.clientWidth;
                const height = this.container.clientHeight;
                this.renderer.setSize(width, height);
                
                let aspect = width / height;
                let distance = this.estimateDistance();

                this.camera.left = -distance * aspect;
                this.camera.right = distance * aspect;
                this.camera.top = distance;
                this.camera.bottom = -distance;
                this.camera.updateProjectionMatrix();
            }
        }
    }

    triggerFlyingTreeInfo() {
        let description = getEntityDescriptor(EntityType.CACAOTREE);
        var rect = this.renderer.domElement.getBoundingClientRect();
        for (let row = 0; row < this.size.rows; row++) {
            for (let col = 0; col < this.size.cols; col++) {
                if (this.buildings[row][col].includes(EntityType.CACAOTREE)) {
                    spawnInfoAtBuilding({ 
                        rect: rect,
                        tree: this.microGamefield.getBuildingAtPosition({ row: row, col: col }), 
                        cacao: this.props.playerSetup.grid[row * this.size.cols + col].type === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn, 
                        camera: this.camera, 
                        type: InfoType.CACAO_HARVESTED,
                        container: this.container
                    });
                }
            }            
        }
    }

    onClick = event => {
        var rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
        this.mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera); 

        if (typeof this.props.selectedBuilding !== 'undefined' && (this.props.pseudoPhase === GameStateTypes.BUILD_PHASE || this.props.pseudoPhase === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT)) {
            var intersects = this.raycaster.intersectObjects(this.microGamefield.getClickableFields(), true);
            intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( intersects.length > 0 ) {
                let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
                if (this.buildings[cellIndex.row][cellIndex.col].length === 0 || 
                    (this.buildings[cellIndex.row][cellIndex.col].length === 1 && this.buildings[cellIndex.row][cellIndex.col].includes(EntityType.CREAM))) {
                    let building = createEntity(this.props.selectedBuilding);
                    building.position = {
                        row: cellIndex.row,
                        col: cellIndex.col
                    }
                    Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);

                    this.microGamefield.setBuilding(building.type, building.position);
                    this.props.buildCallback(building.type, this.props.playerSetup.grid[cellIndex.row * this.size.cols + cellIndex.col].type);
                    this.buildings[cellIndex.row][cellIndex.col] = [building.type];
                    let description = getEntityDescriptor(building.type)

                    let buildingsDelta = this.props.playerSetup.grid[cellIndex.row * this.size.cols + cellIndex.col].type === BoardCellTypes.BLACK ? Math.round(description.buildingsPerTurn * 1.5) : description.buildingsPerTurn;
                    if (building.type === EntityType.FACTORY) {
                        spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: buildingsDelta, x: event.clientX, y: event.clientY, container: this.container });
                    } else {
                        spawnInfo({ type: InfoType.CACAO_CONSUMED, cacao: description.costs, x: event.clientX, y: event.clientY, container: this.container });
                        let cacaoDelta = this.props.playerSetup.grid[cellIndex.row * this.size.cols + cellIndex.col].type === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn;
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
                }
            }
        } else if (typeof this.props.selectedAttack !== 'undefined' && this.opponentGamefield && this.props.pseudoPhase === GameStateTypes.ATTACK_PHASE) {           
            let opponentIntersects = this.raycaster.intersectObjects(this.opponentGamefield.getClickableFields(), true);

            opponentIntersects = opponentIntersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( opponentIntersects.length > 0 ) {
                let cellIndex = opponentIntersects[0].object._cellIdx || opponentIntersects[0].face._cellIdx;
                
                if (this.opponentBuildings[cellIndex.row][cellIndex.col].length > 0) {
                    this.opponentGamefield.attack({row: cellIndex.row, col: cellIndex.col}, this.props.selectedAttack, false);
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    if (typeof this.props.attackCallback !== 'undefined') {
                        this.props.attackCallback(this.props.selectedAttack, {row: cellIndex.row, col: cellIndex.col});
                    }
                }
            }
        }
    }

    meltDownField() {
        this.opponentGamefield.rebuild(this.props.opponentSetup);
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

    startAnimation = (gamefield, turned, asset, position) => {
        let id = Math.random().toString().substr(2) + Date.now().toString();
        let animation = new Animation(gamefield, turned, asset, position, id, () => {
            this.animations = this.animations.filter(animation => animation.id !== id);
        });
        this.animations.push(animation);
        animation.play();
        this.start();
    }

    animate = () => {
        let delta = this.clock.getDelta();
        this.renderScene();

        if (this.animations.length > 0) {
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
        return <div id="microGamefield" ref={container => { this.container = container }}></div>;
    }
}

MicroGamefield.propTypes = {
    size: PropTypes.number.isRequired,
    selectedBuilding: PropTypes.string,
    selectedAttack: PropTypes.string,
    buildCallback: PropTypes.func,
    attackCallback: PropTypes.func,
    opponentGamefield: PropTypes.bool.isRequired,
    pseudoPhase: PropTypes.string,
    opponentSetup: PropTypes.object,
    playerSetup: PropTypes.object
}

const mapStateToProps = state => ({ language: state.ui.language });
const MicroGamefieldContainer = connect(mapStateToProps)(MicroGamefield);

export default MicroGamefieldContainer;