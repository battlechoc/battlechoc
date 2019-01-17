import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';
import GLTFLoader from 'three-gltf-loader';
import {Game, GameConfig, Player, PlayerType } from './Game.js';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cannons: 0
    };
  }

  async componentDidMount() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;

    this.scene = new THREE.Scene();
    this.loader = new GLTFLoader();
    this.clickTargets = [];

    this.camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      1000
    );

    this.game = new Game();
    this.game.start([new Player("foo", PlayerType.human), new Player("bar", PlayerType.non_human)], 0, new GameConfig());

    this.camera.rotation.x = Math.PI / 4
    this.initialTurn = true;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.camera.position.z = 45;
    this.camera.position.y = -20;
    this.camera.position.x = 10;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor('#000000');
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 2.2;

    this.mount.appendChild(this.renderer.domElement);
    this.onClick = this.onClick.bind(this);

    var cannonModel = await this.loadGLTFModel('models/cannon.gltf');
    var factoryModel = await this.loadGLTFModel('models/factory.gltf');
    this.factory = factoryModel.scene;
    this.factory.scale.set(1, 2, 2);
    this.factory.rotation.y = Math.PI * 1.25;
    this.factory.rotation.x = Math.PI / 2;

    console.log(factoryModel.asset)

    this.cannonGeometry = cannonModel.scene.children[2].geometry;
    
    this.playerGameField = this.buildGameField(true);
    this.playerGameField.position.set(-60, 0, 0);

    this.opponentGameField = this.buildGameField(false);
    this.opponentGameField.position.set(20, 0, 0);

    this.scene.add(this.opponentGameField);
    this.scene.add(this.playerGameField);

    var ambientLight = new THREE.AmbientLight(0x101010, 1.0);
    this.scene.add(ambientLight);
    var directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); 
    directionalLight.position.set(0.0, -5.0, 10.0);
    this.scene.add(directionalLight); 

    this.start();
    window.addEventListener("resize", () => this.updateDimensions());
  }

  loadGLTFModel = (filename) => {
    return new Promise((resolve, reject) => {
      this.loader.load(filename, resolve);
    });
  }

  onClick = (event) => {
    this.game.finishTurn();

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    var intersects = this.raycaster.intersectObjects(this.clickTargets);

    for (let i = 0; i < intersects.length; i++) {
      if (this.initialTurn) {
        this.setFactory(intersects[i].object.position);
        this.initialTurn = false;
      } else {
        this.setRumTruffleCannon(intersects[i].object.position);
      }
    }

    console.log(this.game.currentPlayer().name);
  }

  setFactory(position) {
    this.factory.position.set(position.x - 59, position.y, 2);
    this.scene.add(this.factory);
  }

  setRumTruffleCannon(position) {
    const material = new THREE.MeshPhongMaterial({ color: '#2b1d0e', specular: '#e08b3e', shininess: 30, flatShading: true });
    let cannon = new THREE.Mesh(this.cannonGeometry, material);
    let scaleFactor = .002;
    cannon.scale.set(scaleFactor, scaleFactor, scaleFactor);
    cannon.rotation.y = Math.PI / 2
    cannon.rotation.x = Math.PI / 2
    cannon.position.set(position.x - 59, position.y, 2);
    this.scene.add(cannon);
    this.setState({cannons: this.state.cannons + 1});
  }

  buildGameField(isPlayerGameField) {
    var gameField = new THREE.Group();
    const rows = 8;
    const cols = 8;
    const fieldSize = 8;
    var fieldtypes = ['#e08b3e', '#b5651d', '#734012'];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        var geometry = new THREE.PlaneGeometry(fieldSize, 8, fieldSize);
        var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
        var field = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: fieldtype}));
        field.position.set(fieldSize * i, fieldSize * j, 0);
        gameField.add(field);
        if (isPlayerGameField) {
          this.clickTargets.push(field);
        }
      }
    }
    return gameField;
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
        <div id="hud">Rum Truffle Cannons: {this.state.cannons}</div>
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
