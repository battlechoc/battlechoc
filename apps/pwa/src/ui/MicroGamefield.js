import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import Gamefield from '../Gamefield';
import { EntityType, BoardCellTypes } from '../gameplay/GameEntities';
import * as THREE from 'three';
//import t from './Translation';

class MicroGamefield extends Component {
    componentDidMount() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        window.addEventListener("resize", () => this.updateDimensions());

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        let distance = 50;
        let aspect = width / height;

        this.camera = new THREE.OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 200);
        this.camera.position.set(1, 1, 1);
        this.camera.lookAt(this.scene.position);
        this.camera.position.x = 0;
        this.camera.position.y = 0;
        this.camera.position.z = 0;

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
        let directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0);
        directionalLight.position.set(-80, 100, -20);
        directionalLight.castShadow = false;
        this.scene.add(directionalLight);

        this.microGamefield = new Gamefield(true, [0, 30, 0], field, 0, size);
        this.scene.add(this.microGamefield.gameField);
        this.start();
    }

    componentWillUnmount() {
        this.stop();
        this.container.removeChild(this.renderer.domElement);
        window.removeEventListener("resize", () => this.updateDimensions());
    }

    updateDimensions() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);
        let distance = 50;
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
    size: PropTypes.number.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language });
const MicroGamefieldContainer = connect(mapStateToProps)(MicroGamefield);

export default MicroGamefieldContainer;