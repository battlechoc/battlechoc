import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Gamefield from '../Gamefield';
import { InfoType, spawnInfoAtBuilding, spawnInfo } from '../ui/FlyingInfo';
import { EntityType, BoardCellTypes, createEntity, getEntityDescriptor, AttackType } from '../gameplay/GameEntities';
import * as THREE from 'three';
import Jukebox from '../ui/Jukebox';
//import t from './Translation';

class MicroGamefield extends Component {
    componentDidMount() {
        this.props.onRef(this)
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", () => this.updateDimensions());

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        let distance = this.estimateDistance();
        let aspect = width / height;

        this.camera = new THREE.OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 200);
        this.camera.position.set(1, 1, 1);
        this.camera.lookAt(this.scene.position);
        this.camera.position.x = 0;
        this.camera.position.y = 30;
        this.camera.position.z = 70;

        this.container.onclick = event => this.onClick(event);
        this.renderer = new THREE.WebGLRenderer({ alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
        this.renderer.domElement.id = 'micro-game-canvas'
        this.renderer.gammaOutput = true;
        this.renderer.gammaFactor = 1.7;

        this.mixer = null;
        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.size = {rows: this.props.size, cols: this.props.size}

        this.buildings = [...Array(this.size.rows)].map(
            field => Array(this.size.cols).fill([])
        );

        this.playerCells = [...Array(this.size.rows)].map(
            field => Array(this.size.cols).fill(BoardCellTypes.WHITE)
        );

        this.playerField = { grid: [] };
        for (let row = 0; row < this.size.rows; row++) {
            for (let col = 0; col < this.size.cols; col++) {
                let fieldtype = col;
                let cellType = BoardCellTypes.BROWN;

                if (fieldtype === 0) {
                    cellType = BoardCellTypes.WHITE;
                } else if (fieldtype === 1) {
                    cellType = BoardCellTypes.BLACK;
                }

                this.playerCells[row][col] = cellType;

                this.playerField.grid.push({
                    type: cellType,
                    row: row,
                    col: col,
                    occupiedBy: [],
                    molten: false,
                    shielded: false
                });
            }
        }

        var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0);
        directionalLight.position.set(20, 24, -10);
        directionalLight.castShadow = false;
        this.scene.add( directionalLight );

        if (!this.props.opponentGamefield) {
            this.microGamefield = new Gamefield(true, [-65, -35, 0], this.playerField, 0, this.size);
            if (typeof this.props.playerSetup !== 'undefined') {
                this.props.playerSetup.forEach(building => {
                    if (this.buildings[building.row][building.col].length === 0) {
                        this.buildings[building.row][building.col] = [building.type];
                    } else {
                        this.buildings[building.row][building.col].push(building.type);
                    }
                    this.microGamefield.setBuilding(building.type, { row: building.row, col: building.col });                
                });
            }
            this.scene.add(this.microGamefield.gameField);
        } else if (this.props.opponentGamefield) {
            this.microGamefield = new Gamefield(true, [-100, -47, 0], this.playerField, 0, this.size);
            
            if (typeof this.props.playerSetup !== 'undefined') {
                this.props.playerSetup.forEach(building => {
                    if (this.buildings[building.row][building.col].length === 0) {
                        this.buildings[building.row][building.col] = [building.type];
                    } else {
                        this.buildings[building.row][building.col].push(building.type);
                    }
                    this.microGamefield.setBuilding(building.type, { row: building.row, col: building.col });                
                });
            }

            this.scene.add(this.microGamefield.gameField);
            
            this.opponentBuildings = [...Array(this.size.rows)].map(
                field => Array(this.size.cols).fill([])
            );

            this.opponentCells = [...Array(this.size.rows)].map(
                field => Array(this.size.cols).fill(BoardCellTypes.WHITE)
            );

            this.opponentField = { grid: [] };
            for (let row = 0; row < this.size.rows; row++) {
                for (let col = 0; col < this.size.cols; col++) {
                    let fieldtype = row;
                    let cellType = BoardCellTypes.BROWN;

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BLACK;
                    }

                    this.opponentCells[row][col] = cellType;

                    this.opponentField.grid.push({
                        type: cellType,
                        row: row,
                        col: col,
                        occupiedBy: [],
                        molten: false,
                        shielded: false
                    });
                }
            }

            this.opponentGamefield = new Gamefield(false, [-40, -17, 0], this.opponentField, 1, this.size);

            if (typeof this.props.opponentSetup !== 'undefined') {
                this.props.opponentSetup.forEach(building => {
                    this.opponentBuildings[building.row][building.col].push(building.type);
                    this.opponentGamefield.setBuilding(building.type, { row: building.row, col: building.col });                
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
        let distance = 18;
        const width = window.innerWidth;
        if (this.props.opponentGamefield) {
            if (width < 600) {
                distance = 40;
            } else if (width < 850) {
                distance = 27;
            } else if (width < 1100) {
                distance = 22;
            }
        } else {
            if (width < 500) {
                distance = 25;
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
                        cacao: this.playerCells[row][col] === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn, 
                        camera: this.camera, 
                        type: InfoType.CACAO_HARVESTED,
                        container: this.container
                    });
                }
            }            
        }
    }

    start = () => {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.animate);
        }
    }

    stop = () => {
        cancelAnimationFrame(this.frameId);
    }

    onClick = event => {
        var rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
        this.mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera); 
        if (typeof this.props.selectedBuilding !== 'undefined' && this.props.pseudoPhase === 'build') {
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
                    this.props.buildCallback(building.type, this.playerCells[cellIndex.row][cellIndex.col]);
                    this.buildings[cellIndex.row][cellIndex.col] = [building.type];
                    let description = getEntityDescriptor(building.type)

                    let buildingsDelta = this.playerCells[cellIndex.row][cellIndex.col] === BoardCellTypes.BLACK ? Math.round(description.buildingsPerTurn * 1.5) : description.buildingsPerTurn;
                    if (building.type === EntityType.FACTORY) {
                        spawnInfo({ type: InfoType.INCREASE_BUILDINGS_PER_TURN, buildings: buildingsDelta, x: event.clientX, y: event.clientY, container: this.container });
                    } else {
                        spawnInfo({ type: InfoType.CACAO_CONSUMED, cacao: description.costs, x: event.clientX, y: event.clientY, container: this.container });
                        let cacaoDelta = this.playerCells[cellIndex.row][cellIndex.col] === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn;
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
        } else if (typeof this.props.selectedAttack !== 'undefined' && this.opponentGamefield && this.props.pseudoPhase === 'attack') {           
            let opponentIntersects = this.raycaster.intersectObjects(this.opponentGamefield.getClickableFields(), true);

            opponentIntersects = opponentIntersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( opponentIntersects.length > 0 ) {
                let cellIndex = opponentIntersects[0].object._cellIdx || opponentIntersects[0].face._cellIdx;
                
                if (this.props.selectedAttack === AttackType.HOT_CHOCOLATE) {
                    console.log('melt down field ' + (cellIndex.row * this.size.cols + cellIndex.col));
                    this.opponentField.grid[cellIndex.row * this.size.cols + cellIndex.col].molten = true;
                    this.opponentGamefield.rebuild(this.opponentField);
                }

                if (this.opponentBuildings[cellIndex.row][cellIndex.col].length > 0) {
                    this.opponentGamefield.attack({row: cellIndex.row, col: cellIndex.col}, this.props.selectedAttack, false);
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    if (typeof this.props.attackCallback !== 'undefined') {
                        this.props.attackCallback(this.opponentGamefield.buildings);
                    }
                }
            }
        }
    }

    animate = () => {
        let delta = this.clock.getDelta();
        this.renderScene();
        this.microGamefield.animate(delta);
        if(this.props.opponentGamefield) {
            this.opponentGamefield.animate(delta);
        }
        this.frameId = window.requestAnimationFrame(this.animate);
    }

    renderScene() {
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
    opponentSetup: PropTypes.array,
    playerSetup: PropTypes.array
}

const mapStateToProps = state => ({ language: state.ui.language });
const MicroGamefieldContainer = connect(mapStateToProps)(MicroGamefield);

export default MicroGamefieldContainer;