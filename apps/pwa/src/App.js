import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';

import { Game } from './gameplay/Game';
import { createPlayer, PlayerType } from './gameplay/Player';
import * as GameActions from './gameplay/GameActions';
import ModelLoader from './ModelLoader'
import Gamefield from './Gamefield';
import { BuildingType } from './Building';
import { createBoard } from './gameplay/GameActions';
import Hud from './ui/Hud';
import { connect } from 'react-redux';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      cacao: 50,
      buildings: 3,
      game: {}
    };
  }

  async componentDidMount() {
    // Load Models
    await ModelLoader.loadModels();
    this.selectedBuilding = BuildingType.CACAOTREE;
    // Basic window and game setup
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    window.addEventListener("resize", () => this.updateDimensions());

    // Setup scene, camera and renderer
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.targetFps = 1 / 32;
    this.delta = 0;

    let distance = 30;
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 1000);
    this.camera.position.set(140, 140, 140);
    this.camera.lookAt(this.scene.position);
    this.camera.position.y = 60;
    this.camera.position.x = 30;
    this.camera.position.z = 95;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio( window.devicePixelRatio );
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
    this.container.appendChild(this.renderer.domElement);

    // Allow clicking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Add Light
    var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0);
    directionalLight.position.set(20, 24, -10);
    this.scene.add(directionalLight);

    // Start render loop
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
      console.log(this.state.game);
      console.log(this.state.game.listPossibleActions(this.state.game.currentPlayer()));

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
      console.log(this.state.game);
      console.log(this.state.game.listPossibleActions(this.state.game.currentPlayer()));

      let position = intersects[0].object.parent.position;
      this.opponentGameField.attack(position);
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

  componentWillUnmount() {
    this.stop();
    this.container.removeChild(this.renderer.domElement);
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
    this.delta += this.clock.getDelta();
    if (this.delta > this.targetFps) {
      // Render all objects
      this.renderScene();
      // Swipe animation to another game field
      if (this.lookAtOpponent && this.camera.position.y < 120) {
        this.camera.position.y += 2.0;
        this.camera.position.x += 4.0;
      } else if (!this.lookAtOpponent && this.camera.position.y > 60) {
        this.camera.position.y -= 2.0;
        this.camera.position.x -= 4.0;
      }
      this.delta = this.delta % this.targetFps;
    }

    if (this.opponentGameField) {
      this.opponentGameField.animate(this.delta);
    }
    this.frameId = window.requestAnimationFrame(this.animate);    
  }

  prepareGame = () => {
    // Game Logic
    this.initialTurn = true;

    // Add Gamefield
    this.props.createBoard({
      boardSize: {rows: 8, cols: 8},
      boardSeed: 42
    });
    
    // Setup Game EventListener
    this.container.onclick = event => this.onClick(event);
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
  }

  startGame = (action, field) => {
    if (action === GameActions.chooseStart) {
      // TODO dispatch chooseStart action
      //this.state.game.dispatch(new ChooseStartAction());
      this.playerGameField = new Gamefield(true, [-72, -16, 0], this.state.game.currentState().getBoard().playerFields[0]);
      this.opponentGameField = new Gamefield(false, [72, 56, 0], this.state.game.currentState().getBoard().playerFields[1]);
    } else if (action === GameActions.chooseField) {
      if (field === 0) {
        // TODO dispatch chooseField action - payload: 0
        //this.state.game.dispatch(new ChooseFieldAction(0));
        this.playerGameField = new Gamefield(true, [-72, -16, 0], this.state.game.currentState().getBoard().playerFields[0]);
        this.opponentGameField = new Gamefield(false, [72, 56, 0], this.state.game.currentState().getBoard().playerFields[1]);
      } else {
        // TODO dispatch chooseField action - payload:1
        //this.state.game.dispatch(new ChooseFieldAction(1));
        this.playerGameField = new Gamefield(true, [-72, -16, 0], this.state.game.currentState().getBoard().playerFields[1]);
        this.opponentGameField = new Gamefield(false, [72, 56, 0], this.state.game.currentState().getBoard().playerFields[0]);
      }
    }

    this.clickTargets = this.playerGameField.getClickableFields();
    this.opponentClickTargets = this.opponentGameField.getClickableFields();

    this.scene.add(this.playerGameField.gameField);
    this.scene.add(this.opponentGameField.gameField);
  }

  renderScene = () => {
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return (
      <div className="app-container">
        <Hud
          selectBuilding={buildingType => this.selectedBuilding = buildingType}
          toggleMusic={() => this.toggleMusic()}
          cacao={this.state.cacao}
          buildings={this.state.buildings}
          startGameCallback={this.startGame}
          prepareGameCallback={this.prepareGame}
          playerFieldPreview={this.state.playerFieldPreview}
          opponentFieldPreview={this.state.opponentFieldPreview} />
        <div
          className="app"
          ref={(container) => { this.container = container }}
        />
      </div>
    )
  }
}

const mapStateToProps = state => ({
  ...state
});

const mapDispatchToProps = {
  createBoard
};

const AppContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default AppContainer;
