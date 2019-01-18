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

    let distance = 50;
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera( -distance * aspect, distance * aspect, distance, -distance, 1, 1000);
    
    this.game = new Game();
    this.game.start([new Player("foo", PlayerType.human), new Player("bar", PlayerType.non_human)], 0, new GameConfig());

    this.initialTurn = true;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.camera.position.set(120, 120, 120);
    this.camera.lookAt(this.scene.position)

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
    this.whiteTileModel = await this.loadGLTFModel('models/white_tile.gltf');
    this.brownTileModel = await this.loadGLTFModel('models/brown_tile.gltf');
    this.blackTileModel = await this.loadGLTFModel('models/black_tile.gltf');

    this.factory = factoryModel.scene;
    this.factory.scale.set(1.4, 1.4, 1.4);
    this.factory.rotation.y = Math.PI * 1.25;

    this.cannonGeometry = cannonModel.scene.children[2].geometry;
    
    this.playerGameField = this.buildGameField(true);
    this.playerGameField.position.set(-72, 0, 0);

    this.opponentGameField = this.buildGameField(false);
    this.opponentGameField.position.set(72, 72, 0);

    this.scene.add(this.opponentGameField);
    this.scene.add(this.playerGameField);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 2); 
    directionalLight.position.set(20, 40, 20);
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
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);

    if (intersects.length > 0) {
      if (this.initialTurn) {
        this.setFactory(intersects[0].object.parent.position);
        this.initialTurn = false;
      } else {
        this.setRumTruffleCannon(intersects[0].object.parent.position);
      }
    }
    
    console.log(this.game.currentPlayer().name);
  }

  setFactory(position) {
    this.factory.position.set(position.x - 70.5, 6, position.z + 1.5);
    this.scene.add(this.factory);
  }

  setRumTruffleCannon(position) {
    const material = new THREE.MeshPhongMaterial({ color: '#2b1d0e', specular: '#e08b3e', shininess: 30, flatShading: true });
    let cannon = new THREE.Mesh(this.cannonGeometry, material);
    let scaleFactor = .002;
    cannon.scale.set(scaleFactor, scaleFactor, scaleFactor);
    cannon.rotation.y = Math.PI / 1.5
    cannon.position.set(position.x - 71, 6, position.z);
    this.scene.add(cannon);
    this.setState({cannons: this.state.cannons + 1});
  }

  buildGameField(isPlayerGameField) {
    var gameField = new THREE.Group();
    const rows = 8;
    const cols = 8;
    const fieldSize = 8;
    var fieldtypes = ['white', 'brown', 'black'];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
        if (fieldtype === 'white') {
          var fieldClone = this.whiteTileModel.scene.clone();
        } else if (fieldtype === 'brown') {
          var fieldClone = this.brownTileModel.scene.clone();
        } else {
          var fieldClone = this.blackTileModel.scene.clone();
        }
        var field = fieldClone.children[2]
        field.scale.set(3, 3, 3);
        field.position.set(fieldSize * i, 0, fieldSize * j);
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
