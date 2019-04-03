import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Gamefield from '../Gamefield';
import { EntityType, BoardCellTypes, createEntity } from '../gameplay/GameEntities';
import * as THREE from 'three';
//import t from './Translation';

class MicroGamefield extends Component {
    componentDidMount() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", () => this.updateDimensions());

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        let distance = 30;
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

        var light = new THREE.DirectionalLight( 0xffffff, 1 );
        light.position.set( 20, 24, -10 ).normalize();
        light.castShadow = false;
        this.scene.add( light );

        this.microGamefield = new Gamefield(true, [-72, -16, 0], field, 0, size);
        this.scene.add(this.microGamefield.gameField);
        
        this.start();
    }

    componentWillUnmount() {
        this.stop();
        window.removeEventListener("resize", () => this.updateDimensions());
        this.container.removeChild(this.renderer.domElement);
    }

    updateDimensions() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);
        let distance = 30;
        let aspect = width / height;

        this.camera.left = -distance * aspect;
        this.camera.right = distance * aspect;
        this.camera.top = distance;
        this.camera.bottom = -distance;
        this.camera.updateProjectionMatrix();
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
        if (typeof this.props.selectedBuilding !== 'undefined') {
            var rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
            this.mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            var intersects = this.raycaster.intersectObjects(this.microGamefield.getClickableFields(), true);
            intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
                                                        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));    
            if ( intersects.length > 0 ) {
                let building = createEntity(this.props.selectedBuilding);
                let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
                building.position = {
                    row: cellIndex.row,
                    col: cellIndex.col
                }
                this.microGamefield.setBuilding(building.type, building.position);
                this.props.buildCallback();
                // this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].buildingsPerTurn + ' buildings per turn', 'positive');
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
    buildCallback: PropTypes.func
}

const mapStateToProps = state => ({ language: state.ui.language });
const MicroGamefieldContainer = connect(mapStateToProps)(MicroGamefield);

export default MicroGamefieldContainer;