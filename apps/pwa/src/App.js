import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';

import AssetLoader from './AssetLoader'
import Gamefield from './Gamefield';
import Hud from './ui/Hud';
import { BuildingType, getEntity } from './gameplay/GameEntities';
import { startGame, finishGame, createBoard, chooseStart, chooseField, finishTurn, attack, build, finishBuildPhase } from './gameplay/GameActions';
import { changeLanguage, deselectBuildings } from './ui/UiActions';
import { connect } from 'react-redux';
import { Augustus } from './gameplay/Player';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { GameStateTypes } from './gameplay/GameplayReducer'
import { NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError, NoAttacksLeftError, TargetEmptyError, InvalidActionIssuer } from './gameplay/Errors';
import { createPlayer, PlayerType } from './gameplay/Player';
import Rules from './gameplay/Rules';
import CircularProgress from '@material-ui/core/CircularProgress';
import { ScreenRotation } from '@material-ui/icons';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import Divider from '@material-ui/core/Divider';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import InputLabel from '@material-ui/core/InputLabel';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import t from './ui/Translation';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loadingProgress: 0,
      showSettings: false,
      attentionTextVisible: false
    }
  }

  updateProgressbar(progress) {
    this.setState({ loadingProgress: progress });
  }

  async componentDidMount() {
    // Load Models
    await AssetLoader.loadAssets(progress => this.updateProgressbar(progress));

    // Basic window and game setup
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    window.addEventListener("resize", () => this.updateDimensions());

    // Setup scene, camera and renderer
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.targetFps = 1 / 30;
    this.delta = 0;

    let distance = this.estimateDistance(width / height);
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, 0, 250);
    this.camera.position.set(40, 40, 40);
    this.camera.lookAt(this.scene.position);
    this.camera.position.x = 20;
    this.camera.position.y = 55;
    this.camera.position.z = 95;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 1.9;

    // Enable swipe
    this.mousedown = false;
    this.swipeStartPosition = 0;
    this.swipePosition = 0;
    this.isSwiping = false;

    // animations and renderer
    this.mixer = null;
    this.container.appendChild(this.renderer.domElement);

    // Allow clicking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

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

    this.opponent = new Augustus({
      chooseStart: this.props.chooseStart,
      chooseField: this.props.chooseField,
      build: this.props.build,
      attack: this.props.attack,
      finishTurn: this.props.finishTurn,
      finishBuildPhase: this.props.finishBuildPhase
    });
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.game !== undefined && (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE)) {
      const winners = Rules.determineWinner(nextProps.game);
      if (typeof winners !== 'undefined') {
        if (typeof this.opponent.stopThinking === 'function') {
          this.opponent.stopThinking();
        }
        setTimeout(() => {
          if (winners.length === 1) {
            if (winners[0].type === PlayerType.HUMAN) {
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_WIN_GAME);
            } else {
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_LOST_GAME);
            }
          } else if (winners.length === 2) {
            this.hud.showTurnMessage(t[this.props.language].MESSAGE_DRAW_GAME);
          }
          setTimeout(() => this.endGame(), 1000);
        }, 2000);
        return;
      }
    }

    const gameTransition = getGameTransition(this.props.game, nextProps.game);
    console.log(gameTransition);

    if (gameTransition === GameTransitions.OPPONENT_HAS_CHOSEN_START) {
      this.hud.unlockUi();
      this.colorStartButton = 1;
    } else if (gameTransition === GameTransitions.OPPONENT_STARTS_GAME) {
      this.opponent.simulateChooseFieldOrStartDecision(nextProps.game.board);
    } else if (gameTransition === GameTransitions.PLAYER_HAS_CHOSEN_START) {
      this.opponent.simulateChooseFieldDecision(nextProps.game.board);
    } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
      this.triggerUiEvent = 'START_GAME';
    } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT) {
      this.triggerUiEvent = 'START_GAME';
    } else if (gameTransition === GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT) {
      const opponentGameBoard = nextProps.game.board.fields[nextProps.game.players[1].fieldIndex];
      this.opponent.simulateInitialPlacement(opponentGameBoard, this.opponentGameField);
    } else if (gameTransition === GameTransitions.OPPONENT_BUILD_PHASE) {
      const opponentGameBoard = nextProps.game.board.fields[nextProps.game.players[1].fieldIndex];
      this.opponent.simulateBuildPhase(opponentGameBoard, nextProps.game.players[1].buildingsPerTurn, nextProps.game.players[1].cacao, this.opponentGameField);
    } else if (gameTransition === GameTransitions.OPPONENT_ATTACK_PHASE) {
      const playersBoard = nextProps.game.board.fields[nextProps.game.players[0].fieldIndex];
      this.opponent.simulateAttackPhase(playersBoard, this.playerGameField, nextProps.game.players[1].attacksPerTurn);
    } else if (gameTransition === GameTransitions.GAME_FINISHED) {
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
    } else if (gameTransition === GameTransitions.ATTACKS_DEPLETED) {
      setTimeout(() => {
        this.props.finishTurn({ issuer: this.props.game.players[0].id })
          .catch(error => {
            if (error instanceof InvalidActionIssuer) {
              console.log(error.message);
            } else {
              throw error;
            }
          })
      }, 3000);
    }
  }

  componentDidUpdate() {
    if (typeof this.props.game !== 'undefined') {
      if (this.triggerUiEvent === 'START_GAME') {
        this.startGame();
        if (this.props.game.currentPlayerIndex === 1) {
          const opponentGameBoard = this.props.game.board.fields[this.props.game.players[1].fieldIndex];
          this.opponent.simulateInitialPlacement(opponentGameBoard, this.opponentGameField);
        }
      }
      this.triggerUiEvent = undefined;
      this.lookAtOpponent = (this.props.game.currentPlayerIndex === 1 &&
        this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
        (this.props.game.currentPlayerIndex === 0 &&
          this.props.game.state === GameStateTypes.ATTACK_PHASE);
    }
  }

  onClick = event => {
    // Get mouse position and use raycaster
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check clickable objects
    if (this.props.game.currentPlayerIndex === 0) {
      this.playerFieldClick();
      this.opponentFieldClick();
    }

    // Part of "ignore click if it was just an end of swiping"
    this.isSwiping = false;
  }

  playerFieldClick() {
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);
    intersects = intersects.filter(intersect => intersect.object.name.startsWith('Cell'));
    let buildingSelected = this.props.selectedBuilding && this.props.selectedBuilding !== BuildingType.EMPTY;
    let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
      this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
    if (intersects.length > 0 && !this.isSwiping && (buildingSelected || (initialPlacement && this.props.game.players[0].hasFactory !== true))) {
      let building = null;
      if (initialPlacement) {
        building = getEntity(BuildingType.FACTORY);
      } else {
        building = getEntity(this.props.selectedBuilding);
      }

      const position = intersects[0].object.parent.position;
      building.position = {
        row: position.x / this.playerGameField.fieldSize,
        col: position.z / this.playerGameField.fieldSize
      }
      this.props.build({ issuer: this.props.game.players[0].id, building: building }).then(() => {
        this.playerGameField.setBuilding(position, building.type);
        if (initialPlacement) {
          this.props.deselectBuildings();
          setTimeout(() => {
            this.props.finishTurn({ issuer: this.props.game.players[0].id });
            this.props.deselectBuildings();
          }, 3000);
        }
      }).catch(error => {
        if (error instanceof NoBuildingsLeftError) {
          console.log(error.message);
        } else if (error instanceof NoCacaoLeftError) {
          console.log(error.message);
        } else if (error instanceof BuildNotPossibleError) {
          console.log(error.message);
        } else if (error instanceof InvalidActionIssuer) {
          console.log(error.message);
        } else {
          throw error;
        }
      });
    }
  }

  opponentFieldClick() {
    if (this.lookAtOpponent && this.props.game.state === GameStateTypes.ATTACK_PHASE) {
      var intersects = this.raycaster.intersectObjects(this.opponentClickTargets, true);
      intersects = intersects.filter(intersect => intersect.object.name.startsWith('Cell'));

      if (intersects.length > 0 && !this.isSwiping && this.props.game.players[0].attacks > 0) {
        let position = intersects[0].object.parent.position;

        let row = position.x / this.opponentGameField.fieldSize;
        let col = position.z / this.opponentGameField.fieldSize;

        this.props.attack({
          issuer: this.props.game.players[0].id,
          row: row,
          col: col
        }).then(() => {
          this.opponentGameField.attack(position);
        }).catch(error => {
          if (error instanceof NoAttacksLeftError) {
            console.log(error.message);
          } else if (error instanceof TargetEmptyError) {
            console.log(error.message);
          } else {
            throw error;
          }
        })
      }
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

  estimateDistance(ratio) {
    if (ratio < 0.9) { return 60; }
    else if (ratio < 1.1) { return 50; }
    else if (ratio < 1.4) { return 40; }
    else { return 30; }
  }

  updateDimensions() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    let distance = this.estimateDistance(width / height);

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
      if (this.lookAtOpponent && this.camera.position.y < 128) {
        this.camera.position.y += 2.0;
        this.camera.position.x += 4.0;
      } else if (!this.lookAtOpponent && this.camera.position.y > 58) {
        this.camera.position.y -= 2.0;
        this.camera.position.x -= 4.0;
      }
      this.delta = this.delta % this.targetFps;
    }

    if (this.opponentGameField) {
      this.opponentGameField.animate(this.delta);
    }

    if (this.playerGameField) {
      this.playerGameField.animate(this.delta);
    }

    this.frameId = window.requestAnimationFrame(this.animate);
  }

  deviceOrientationChanged(orientation) {
    this.setState({ landscapeOrientation: this.orientationQuery.matches });
  }

  prepareGame = async () => {

    const searchParams = new URLSearchParams(window.location.search);
    const isPwa = searchParams.get('app_runs_as') === 'pwa';

    if (!isPwa) {
      try {
        await document.documentElement.requestFullscreen();
        await window.screen.orientation.lock('landscape');
      } catch (error) {
        console.log(error.name + ': ' + error.message);
      }
    }

    this.orientationQuery = window.matchMedia("(orientation:landscape)");
    this.setState({ landscapeOrientation: this.orientationQuery.matches });
    this.orientationQuery.addListener(orientation => this.deviceOrientationChanged(orientation));

    let players = [
      createPlayer("Charlie Bucket", PlayerType.HUMAN),
      createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP)
    ];

    this.opponent.player = players[1];

    this.props.startGame(players).then(() => {
      if (this.props.game.currentPlayerIndex === 0) {
        this.hud.showTurnMessage(t[this.props.language].MESSAGE_PLAYER_DECIDE);
      } else {
        this.hud.lockUi();
        this.hud.showTurnMessage(t[this.props.language].MESSAGE_OPPONENT_DECIDE);
      }

      setTimeout(() => {
        this.props.createBoard({
          boardSize: { rows: 8, cols: 8 },
          boardSeed: 42
        });
      }, 1000);
    });
  }

  endGame() {
    setTimeout(() => {
      this.props.finishGame();
    }, 1000);
  }

  startGame = () => {
    let playerFieldIndex = this.props.game.players[0].fieldIndex;
    let opponentFieldIndex = this.props.game.players[1].fieldIndex;
    this.lookAtOpponent = this.props.game.currentPlayerIndex === 1;

    // Add Light
    var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0);
    directionalLight.position.set(20, 24, -10);
    this.scene.add(directionalLight);

    this.playerGameField = new Gamefield(true, [-72, -16, 0], this.props.game.board.fields[playerFieldIndex]);
    this.opponentGameField = new Gamefield(false, [72, 56, 0], this.props.game.board.fields[opponentFieldIndex]);
    this.scene.add(this.playerGameField.gameField);
    this.scene.add(this.opponentGameField.gameField);

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

    // Prepare click targets
    this.clickTargets = this.playerGameField.getClickableFields();
    this.opponentClickTargets = this.opponentGameField.getClickableFields();
  }

  renderScene() {
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    if (this.state.loadingProgress < 100) {
      return (
        <div className="loadingView">
          <CircularProgress className="progress" variant="static" value={this.state.loadingProgress} />
        </div>
      )
    } else {
      return (
        <div className="app-container">
          <div id="clouds"></div>
          {(() => {
            let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (!this.state.landscapeOrientation && isMobile && typeof this.props.game !== 'undefined') {
              return (
                <div className="pauseView">
                  <h2>Pause</h2>
                  <p>We ask for your understanding that our games are mainly programmed by meerkats who only know the landscape mode</p>
                  <p>Please turn the phone to resume the game</p>
                  <ScreenRotation className="rotationIcon" />
                </div>
              );
            }
          })()}

          <Dialog
            open={this.state.showSettings}
            onClose={() => this.setState({ showSettings: false, attentionTextVisible: false })}
            aria-labelledby="form-dialog-title"
          >
            <DialogTitle id="form-dialog-title">{t[this.props.language].SETTINGS}</DialogTitle>
            <DialogContent>
              <FormControl>
                <InputLabel htmlFor="lang-selection">{t[this.props.language].LANGUAGE}</InputLabel>
                <Select
                  native
                  value={this.props.language}
                  onChange={event => this.props.changeLanguage(event.target.value)}
                  inputProps={{
                    name: 'language',
                    id: 'lang-selection',
                  }}
                >
                  <option value="en">{t[this.props.language].ENGLISH}</option>
                  <option value="de">{t[this.props.language].GERMAN}</option>
                </Select>
                {
                  typeof this.props.game !== 'undefined' ?
                  <Button variant="outlined" className="quitGame" onClick={() => {
                    if (this.state.attentionTextVisible) {
                      this.endGame();
                      this.setState({ showSettings: false, attentionTextVisible: false });
                    } else {
                      this.setState({ attentionTextVisible: true });
                    }
                  }}>
                    { t[this.props.language].SETTINGS_QUIT }
                  </Button>
                  : null
                }
                {
                  this.state.attentionTextVisible && typeof this.props.game !== 'undefined' ? 
                  <Typography color="error" className="attentionText">{ t[this.props.language].SETTINGS_ATTENTION_TEXT }</Typography> 
                  : null
                }
              </FormControl>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => this.setState({ showSettings: false, attentionTextVisible: false })} color="primary">
                {t[this.props.language].BUTTON_BACK}
              </Button>
            </DialogActions>
          </Dialog>

          <Hud
            toggleMusic={() => this.toggleMusic()}
            prepareGameCallback={this.prepareGame}
            showSettings={() => this.setState({ showSettings: true })}
            onRef={hud => (this.hud = hud)} />
          <div
            className="app"
            ref={container => { this.container = container }}
          />
        </div>
      )
    }
  }
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  selectedBuilding: state.ui.selectedBuilding,
  language: state.ui.language
});

const mapDispatchToProps = {
  startGame,
  createBoard,
  chooseStart,
  chooseField,
  finishTurn,
  finishGame,
  build,
  finishBuildPhase,
  attack,
  changeLanguage,
  deselectBuildings
};

const AppContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default AppContainer;
