import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';

import {Game, SweastyGameState, Player, PlayerType, FinishTurnAction } from './Game.js';
import Gamefield from './Gamefield.js';
import { BuildingType } from './Building.js';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cannons: 0,
      trees: 0
    };
  }

  async componentDidMount() {
    // Prototyping Variables
    this.setCannon = false;
    // Basic window and game setup
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    window.addEventListener("resize", () => this.updateDimensions());

    this.game = new Game(SweastyGameState);
    this.game.start([new Player("foo", PlayerType.human), new Player("bar", PlayerType.non_human)], 0);

    this.initialTurn = true;

    // Setup scene, camera and renderer
    this.scene = new THREE.Scene();

    let distance = 50;
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera( -distance * aspect, distance * aspect, distance, -distance, 1, 1000);
    this.camera.position.set(120, 120, 120);
    this.camera.lookAt(this.scene.position)

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor('#000000');
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 1.9;

    this.mount.appendChild(this.renderer.domElement);

    // Allow clicking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onClick = this.onClick.bind(this);
    
    // Add Gamefield    
    this.playerGameField = new Gamefield(true, [-72, -16, 0]);
    this.clickTargets = this.playerGameField.getClickableFields();
    this.opponentGameField = new Gamefield(true, [72, 56, 0]);

    this.scene.add(this.opponentGameField.getMeshGroup());
    this.scene.add(this.playerGameField.getMeshGroup());

    // Add Light
    var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2); 
    directionalLight.position.set(20, 24, -10);
    this.scene.add(directionalLight); 

    // Start game render loop
    this.start();
  }

  onClick = (event) => {
    this.game.perform(new FinishTurnAction());

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);

    if (intersects.length > 0) {
      if (this.initialTurn) {
        this.playerGameField.setBuilding(this.scene, intersects[0].object.parent.position, BuildingType.FACTORY);
        this.initialTurn = false;
      } else {
        if (this.setCannon) {
          if (this.playerGameField.setBuilding(this.scene, intersects[0].object.parent.position, BuildingType.RUM_TRUFFLE_CANNON)) {
            this.setState({cannons: this.state.cannons + 1});
          }
        } else {
          if (this.playerGameField.setBuilding(this.scene, intersects[0].object.parent.position, BuildingType.CACAOTREE)) {
            this.setState({trees: this.state.trees + 1});
          }
        }
      }
    }
    
    console.log(this.game.currentPlayer().name);
  }

  updateDimensions () {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  componentWillUnmount() {
    this.stop();
    this.mount.removeChild(this.renderer.domElement);
    window.removeEventListener("resize", () => this.updateDimensions());
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
    this.renderScene();
    this.frameId = window.requestAnimationFrame(this.animate);
  }

  renderScene = () => {
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return(
      <div className="app-container">
        <div id="hud">
          <p>Rum Truffle Cannons: {this.state.cannons} Cacao Trees: {this.state.trees}</p>
          <img alt="cacao tree preview" id="cacaotreeIcon" className="preview" src="images/cacaotree_icon.png" onClick={() => {this.setCannon = false;}}/>
          <img alt="cannon preview" id="cannonIcon" className="preview" src="images/cannon_icon.png" onClick={() => {this.setCannon = true;}}/>
        </div>
        <div
          className="app"
          onClick={this.onClick}
          ref={(mount) => {this.mount = mount}}
        />
      </div>
    )
  }
  
}

export default App;
