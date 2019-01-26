import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';

import { Game, Player, PlayerType } from './gameplay/Game.js';
import { SweastyGameState } from './gameplay/SweastyGameState';
import { FinishTurnAction } from './gameplay/SweastyGameActions';
import ModelLoader from './ModelLoader.js'
import Gamefield from './Gamefield.js';
import { BuildingType } from './Building.js';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cacao: 50,
      buildings: 3
    };
  }

  async componentDidMount() {
    // Load Models
    await ModelLoader.loadModels();
    this.selectedBuilding = BuildingType.CACAOTREE;
    // Basic window and game setup
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    window.addEventListener("resize", () => this.updateDimensions());

    this.game = new Game(SweastyGameState);
    this.game.start([new Player("foo", PlayerType.human), new Player("bar", PlayerType.non_human)]);

    this.initialTurn = true;

    // Setup scene, camera and renderer
    this.scene = new THREE.Scene();

    let distance = 30;
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera( -distance * aspect, distance * aspect, distance, -distance, -100, 1000);
    this.camera.position.set(140, 140, 140);
    this.camera.lookAt(this.scene.position);
    this.camera.position.y = 60;
    this.camera.position.x = 30;
    this.camera.position.z = 95;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor('#000000');
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 1.9;

    // Enable swipe
    this.mousedown = false;
    this.swipeStartPosition = 0;
    this.swipePosition = 0;
    this.isSwiping = false;
    this.lookAtOpponent = false;
    
    // animations and renderer
    this.mixer = null;

    this.renderer.domElement.addEventListener('mousedown', event => this.startSwipe(event));
    this.renderer.domElement.addEventListener('mousemove', event => this.swipe(event));
    this.renderer.domElement.addEventListener('mouseup', () => this.endSwipe());
    this.renderer.domElement.addEventListener('touchstart', event => {
      event.clientX = event.touches[0].clientX;
      this.startSwipe(event)
    });

    this.renderer.domElement.addEventListener('touchmove', event => {
      event.clientX = event.touches[0].clientX;
      this.swipe(event)
    });

    this.renderer.domElement.addEventListener('touchend', () => this.endSwipe());

    this.mount.appendChild(this.renderer.domElement);

    // Allow clicking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onClick = this.onClick.bind(this);

    // Add Gamefield    
    this.playerGameField = new Gamefield(true, [-72, -16, 0], this.scene);
    this.opponentGameField = new Gamefield(false, [72, 56, 0], this.scene);
    this.clickTargets = this.playerGameField.getClickableFields();
    this.opponentClickTargets = this.opponentGameField.getClickableFields();

    // Add Light
    var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0); 
    directionalLight.position.set(20, 24, -10);
    this.scene.add(directionalLight);

    // Start game render loop
    this.start();

    // Setup Music
    var audioListener = new THREE.AudioListener();
    this.camera.add(audioListener);

    this.ambientSound = new THREE.Audio(audioListener);
    this.scene.add(this.ambientSound);

    var loader = new THREE.AudioLoader();

    loader.load(
      'music/CacaoLiving.mp3',
      audioBuffer => {
        this.ambientSound.setBuffer(audioBuffer);
        this.ambientSound.setLoop(true);
        this.ambientSound.setVolume(0.1);
        this.ambientSound.pause();
      }
    );
  }

  onClick = event => {
    // Time for game logic
    console.log(this.game.listPossibleActions(this.game.currentPlayer()));
    this.game.perform(new FinishTurnAction());
    
    // Get mouse position and use raycaster
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check clickable objects
    this.playerFieldClick();
    this.opponentFieldClick();
    
    // Part of "ignore click if it was just an end of swiping"
    this.isSwiping = false;
  }

  playerFieldClick() {
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);

    if (intersects.length > 0 && !this.isSwiping) {
      if (this.initialTurn) {
        this.playerGameField.setBuilding(intersects[0].object.parent.position, BuildingType.FACTORY);
        this.initialTurn = false;
      } else {
        this.playerGameField.setBuilding(intersects[0].object.parent.position, this.selectedBuilding);
      }
    }
  }

  opponentFieldClick() {
    var intersects = this.raycaster.intersectObjects(this.opponentClickTargets, true);

    if (intersects.length > 0 && !this.isSwiping) {
      /*
      TODO: gltf animation is not correctly exported by blender

      console.log(intersects[0].object.parent.position);
      let model = ModelLoader.models[7].scene.clone();
      console.dir(ModelLoader.models[7]);
      this.scene.add(model);

      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(ModelLoader.models[7].animations[0]).play();*/
    }
  }

  toggleMusic() {
    if (this.ambientSound.isPlaying) {
      this.ambientSound.pause();
    } else {
      this.ambientSound.play();
    }
  }

  startSwipe(event) {
    this.swipeStartPosition = event.clientX / event.target.width;
    this.mousedown = true;
  }

  endSwipe() {
    this.mousedown = false;
    
    if (this.swipePosition < 0.4 && this.swipeStartPosition > 0.6 && !this.lookAtOpponent && this.isSwiping) {
      this.lookAtOpponent = true;
    } else if (this.swipePosition > 0.6 && this.swipeStartPosition < 0.4 && this.lookAtOpponent && this.isSwiping) { 
      this.lookAtOpponent = false;
    }
  }

  swipe(event) {
    if (this.mousedown) {
      this.swipePosition = event.clientX / event.target.width;
      this.isSwiping = true;
    }
  }

  updateDimensions () {
    console.log()
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

    if (this.lookAtOpponent && this.camera.position.y < 120) {
      this.camera.position.y += 2.0;
      this.camera.position.x += 4.0;
    } else if (!this.lookAtOpponent && this.camera.position.y > 60) {
      this.camera.position.y -= 2.0;
      this.camera.position.x -= 4.0;      
    }

    this.frameId = window.requestAnimationFrame(this.animate);
    if (this.mixer != null) {
      this.mixer.update(this.frameId);
    };
  }

  renderScene = () => {
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return(
      <div className="app-container">
        <div id="hud">
          <div id="toggleMusic" onClick={() => this.toggleMusic()}>toggle music</div>
          <p>Cacao: {this.state.cacao}<br />Buildings: {this.state.buildings}</p>
          <img alt="cacao tree preview" id="cacaotreeIcon" className="preview" src="images/cacaotree_icon.png" onClick={() => {
            this.selectedBuilding = BuildingType.CACAOTREE;
          }}/>
          <img alt="cannon preview" id="cannonIcon" className="preview" src="images/cannon_icon.png" onClick={() => {
            this.selectedBuilding = BuildingType.RUM_TRUFFLE_CANNON;
          }}/>
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
