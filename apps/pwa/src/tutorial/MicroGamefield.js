import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Gamefield from '../Gamefield';
import { EntityType, BoardCellTypes, createEntity, getEntityDescriptor } from '../gameplay/GameEntities';
import * as THREE from 'three';
//import t from './Translation';

class MicroGamefield extends Component {
    componentDidMount() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", () => this.updateDimensions());

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        let distance = 18;
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

        let size = {rows: this.props.size, cols: this.props.size}

        this.buildings = [...Array(size.rows)].map(
            field => Array(size.cols).fill([])
        );

        this.playerCells = [...Array(size.rows)].map(
            field => Array(size.cols).fill(BoardCellTypes.WHITE)
        );

        let field = { grid: [] };
        for (let row = 0; row < size.rows; row++) {
            for (let col = 0; col < size.cols; col++) {
                let fieldtype = col;
                let creamed = col + row * size.cols === 4;
                let cellType = BoardCellTypes.BROWN;

                if (fieldtype === 0) {
                    cellType = BoardCellTypes.WHITE;
                } else if (fieldtype === 1) {
                    cellType = BoardCellTypes.BLACK;
                }

                this.playerCells[row][col] = cellType;

                field.grid.push({
                    type: cellType,
                    row: row,
                    col: col,
                    occupiedBy: creamed ? [EntityType.CREAM] : [],
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
            this.microGamefield = new Gamefield(true, [-65, -35, 0], field, 0, size);
            this.scene.add(this.microGamefield.gameField);
        } else if (this.props.opponentGamefield) {
            this.microGamefield = new Gamefield(true, [-95, -44.5, 0], field, 0, size);
            this.scene.add(this.microGamefield.gameField);
            
            this.opponentBuildings = [...Array(size.rows)].map(
                field => Array(size.cols).fill([])
            );

            this.opponentCells = [...Array(size.rows)].map(
                field => Array(size.cols).fill(BoardCellTypes.WHITE)
            );

            field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    let fieldtype = row;
                    let creamed = false;
                    let cellType = BoardCellTypes.BROWN;

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BLACK;
                    }

                    this.opponentCells[row][col] = cellType;

                    field.grid.push({
                        type: cellType,
                        row: row,
                        col: col,
                        occupiedBy: creamed ? [EntityType.CREAM] : [],
                        molten: false,
                        shielded: false
                    });
                }
            }

            this.opponentGamefield = new Gamefield(false, [-45, -19.5, 0], field, 1, size);

            let building = createEntity(EntityType.FACTORY);
            this.opponentBuildings[1][1] = [EntityType.FACTORY];
            building.position = {
                row: 1,
                col: 1
            }
            this.opponentGamefield.setBuilding(building.type, building.position);

            this.scene.add(this.opponentGamefield.gameField);
        }
        
        this.start();
    }

    componentWillUnmount() {
        this.stop();
        window.removeEventListener("resize", () => this.updateDimensions());
        this.container.removeChild(this.renderer.domElement);
    }

    updateDimensions() {
        if (typeof this.container !== 'undefined') {
            if (this.container !== null) {
                const width = this.container.clientWidth;
                const height = this.container.clientHeight;
                this.renderer.setSize(width, height);
                let distance = 18;
                let aspect = width / height;

                this.camera.left = -distance * aspect;
                this.camera.right = distance * aspect;
                this.camera.top = distance;
                this.camera.bottom = -distance;
                this.camera.updateProjectionMatrix();
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

    spawnInfoText(position, text, messageType) {
        let info = document.createElement("p");
        info.appendChild(document.createTextNode(text));
        info.classList.add('flyingInfo');
        info.classList.add(messageType);

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        let ratio = width / height;

        if (ratio < 1.1) {
            info.style.top = (position.y - Math.round(window.innerHeight * 0.07)) + "px";
            info.style.left = (position.x - Math.round(window.innerWidth * 0.015)) + "px";
        }
        else if (ratio < 1.4) { 
            info.style.top = (position.y - Math.round(window.innerHeight * 0.1)) + "px";
            info.style.left = (position.x - Math.round(window.innerWidth * 0.015)) + "px"; 
        }
        else { 
            info.style.top = (position.y - Math.round(window.innerHeight * 0.12)) + "px";
            info.style.left = (position.x - Math.round(window.innerWidth * 0.01)) + "px";
        }
        
        let animations = {
            "animation"      : "animationend",
            "OAnimation"     : "oAnimationEnd",
            "MozAnimation"   : "animationend",
            "WebkitAnimation": "webkitAnimationEnd"
        }
        let supportedAnimation = 'animation';

        for (let animation in animations) {
            if (typeof info.style[animation] !== 'undefined') {
                supportedAnimation = animations[animation];
            }
        }

        info.addEventListener(supportedAnimation, () => {
            document.getElementById('tutorial').removeChild(info);
        });

        document.getElementById('tutorial').appendChild(info);
    }

    onClick = event => {
        if (typeof this.props.selectedBuilding !== 'undefined' && this.props.pseudoPhase === 'build') {
            var rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
            this.mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            var intersects = this.raycaster.intersectObjects(this.microGamefield.getClickableFields(), true);
            intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( intersects.length > 0 ) {
                let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
                if (this.buildings[cellIndex.row][cellIndex.col].length === 0) {
                    let building = createEntity(this.props.selectedBuilding);
                    building.position = {
                        row: cellIndex.row,
                        col: cellIndex.col
                    }

                    this.microGamefield.setBuilding(building.type, building.position);
                    this.props.buildCallback(building.type, this.playerCells[cellIndex.row][cellIndex.col]);
                    this.buildings[cellIndex.row][cellIndex.col] = [building.type];
                    let description = getEntityDescriptor(building.type)

                    if (building.type === EntityType.FACTORY) {
                        if (this.playerCells[cellIndex.row][cellIndex.col] === BoardCellTypes.BLACK) {
                            this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + (description.buildingsPerTurn + 1) + ' buildings per turn', 'positive');
                        } else {
                            this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + description.buildingsPerTurn + ' buildings per turn', 'positive');
                        }
                    } else if (building.type === EntityType.CACAOTREE) {
                        this.spawnInfoText({ x: event.clientX, y: event.clientY }, '-' + description.costs + ' cacao', 'negative');
                        if (this.playerCells[cellIndex.row][cellIndex.col] === BoardCellTypes.WHITE) {
                            setTimeout(() => this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + Math.round(description.cacaoPerTurn * 1.5) + ' cacao per turn', 'positive'), 400);
                        } else {
                            setTimeout(() => this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + description.cacaoPerTurn + ' cacao per turn', 'positive'), 400);
                        }                        
                    } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                        this.spawnInfoText({ x: event.clientX, y: event.clientY }, '-' + description.costs + ' cacao', 'negative');
                        setTimeout(() => this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+1 attack per turn', 'positive'), 400);                   
                    }
                }
            }
        } else if (typeof this.props.selectedAttack !== 'undefined' && this.opponentGamefield && this.props.pseudoPhase === 'attack') {
            var rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
            this.mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);            
            let opponentIntersects = this.raycaster.intersectObjects(this.opponentGamefield.getClickableFields(), true);

            opponentIntersects = opponentIntersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( opponentIntersects.length > 0 ) {
                let cellIndex = opponentIntersects[0].object._cellIdx || opponentIntersects[0].face._cellIdx;
                if (this.opponentBuildings[cellIndex.row][cellIndex.col].length > 0) {
                    this.opponentGamefield.attack({row: cellIndex.row, col: cellIndex.col}, this.props.selectedAttack, false);
                    if (typeof this.props.attackCallback !== 'undefined') {
                        this.props.attackCallback();
                    }
                }
            }
        }
    }

    animate = () => {
        let delta = this.clock.getDelta();
        this.renderScene();
        this.microGamefield.animate(delta);
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
    pseudoPhase: PropTypes.string
}

const mapStateToProps = state => ({ language: state.ui.language });
const MicroGamefieldContainer = connect(mapStateToProps)(MicroGamefield);

export default MicroGamefieldContainer;