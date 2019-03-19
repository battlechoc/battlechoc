import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';

import AssetLoader from './AssetLoader'
import Gamefield from './Gamefield';
import Hud from './ui/Hud';
import { EntityType, AttackType, createEntity } from './gameplay/GameEntities';
import { startGame, resumeGame, finishGame, createBoard, chooseStart, chooseField, finishTurn, attack, build, finishBuildPhase } from './gameplay/GameActions';
import { changeLanguage, deselectBuildings, gameResumeable } from './ui/UiActions';
import { connect } from 'react-redux';
import { Augustus } from './gameplay/Player';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { GameStateTypes } from './gameplay/GameplayReducer'
import { NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError, NoAttacksLeftError, TargetEmptyError, InvalidActionIssuer } from './gameplay/Errors';
import { createPlayer, playerHasAttacks, PlayerType } from './gameplay/Player';
import Rules from './gameplay/Rules';
import { gameplayLog } from './gameplay/GamePlayLogger';
import OfflineStore from './OfflineStore';
import CircularProgress from '@material-ui/core/CircularProgress';
import { ScreenRotation } from '@material-ui/icons';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import InputLabel from '@material-ui/core/InputLabel';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import Snackbar from '@material-ui/core/Snackbar';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import t from './ui/Translation';
import rStats from 'rstatsjs/src/rStats';
import { glStats, BrowserStats } from 'rstatsjs/src/rStats.extras';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import TextField from '@material-ui/core/TextField';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loadingProgress: 0,
      showSettings: false,
      attentionTextVisible: false,
      statistics: false,
      showErrorReport: false,
      includeDeviceInformation: false,
      additionalReportMessage: '',
      snackbar: {
        visible: false,
        text: 'The problem report was sent successfully!'
      }
    }
  }

  updateProgressbar(progress) {
    this.setState({ loadingProgress: progress });
  }


  async componentDidMount() {
    OfflineStore.hasGameToResume().then((resumeable) => {
      this.props.gameResumeable(resumeable);
    });

    // Load Models
    await AssetLoader.loadAssets(progress => this.updateProgressbar(progress));

    // Basic window and game setup
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    window.addEventListener("resize", () => this.updateDimensions());

    // Setup scene, camera and renderer
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    let distance = this.estimateDistance(width / height);
    let aspect = width / height;

    this.camera = new THREE.OrthographicCamera(-distance * aspect, distance * aspect, distance, -distance, -100, 200);
    this.camera.position.set(1, 1, 1);
    this.camera.lookAt(this.scene.position);
    this.camera.position.x = 0;
    this.camera.position.y = 30;
    this.camera.position.z = 70;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true
    });

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 1.7;

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

    // SEO optimization
    if (this.props.language !== 'en') {
      document.querySelector('meta[name="description"]').setAttribute("content", t[this.props.language].META_DESCRIPTION);
      document.querySelector('meta[name="keywords"]').setAttribute("content", t[this.props.language].META_KEYWORDS);
    }

    let browserStats = new BrowserStats();
    this.glStats = new glStats();
    this.renderStats = new rStats({
      userTimingAPI: true,
      values: {
        frame: { caption: 'Total frame time (ms)', over: 16, average: true, avgMs: 100 },
        fps: { caption: 'Framerate (FPS)', below: 30 },
        calls: { caption: 'Calls (three.js)', over: 3000 },
        raf: { caption: 'Time since last rAF (ms)', average: true, avgMs: 100 },
        rstats: { caption: 'rStats update (ms)', average: true, avgMs: 100 },
      },
      groups: [
        { caption: 'Framerate', values: ['fps', 'raf'] },
        { caption: 'Frame Budget', values: ['frame', 'render'] }
      ],
      fractions: [
        { base: 'frame', steps: ['render'] }
      ],
      plugins: [
        browserStats,
        this.glStats
      ]
    });
  }

  componentWillReceiveProps(nextProps) {
    if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined' && typeof OfflineStore.gamestateStore !== 'undefined' &&
      (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE) && (nextProps.game.currentPlayerIndex === 0)) {
      OfflineStore.saveCurrentGame(nextProps.game).then(() => { this.props.gameResumeable(true); })
    }
    if (nextProps.game !== undefined && (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE)) {
      const winners = Rules.determineWinner(nextProps.game);
      if (typeof winners !== 'undefined') {
        setTimeout(() => {
          if (winners.length === 1) {
            if (winners[0].type === PlayerType.HUMAN) {
              console.log("YOU WON DISPLAYING MESSAGE");
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_WIN_GAME);
            } else {
              console.log("YOU LOST DISPLAYING MESSAGE");
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_LOST_GAME);
            }
          } else if (winners.length === 2) {
            console.log("DRAW GAME DISPLAYING MESSAGE");
            this.hud.showTurnMessage(t[this.props.language].MESSAGE_DRAW_GAME);
          }
          setTimeout(() => this.endGame(), 2000);
        }, 2000);
        return;
      }
    }

    // switch language also for meta tags #SEO
    if (nextProps.language !== this.props.language) {
      document.querySelector('meta[name="description"]').setAttribute("content", t[nextProps.language].META_DESCRIPTION);
      document.querySelector('meta[name="keywords"]').setAttribute("content", t[nextProps.language].META_KEYWORDS);
    }

    const gameTransition = getGameTransition(this.props.game, nextProps.game);

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
      this.opponent.simulateAttackPhase(playersBoard, this.playerGameField, nextProps.game.players[1].attacksPerTurn[AttackType.TRUFFLE]);
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
    intersects = intersects.filter(intersect => (typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined'));
    let buildingSelected = this.props.selectedBuilding && this.props.selectedBuilding !== EntityType.EMPTY;
    let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
      this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
    if (intersects.length > 0 && !this.isSwiping && (buildingSelected || (initialPlacement && this.props.game.players[0].hasFactory !== true))) {
      let building = null;
      if (initialPlacement) {
        building = createEntity(EntityType.FACTORY);
      } else {
        building = createEntity(this.props.selectedBuilding);
      }
      building.position = {
        row: intersects[0].object._cellIdx.row,
        col: intersects[0].object._cellIdx.col
      }
      const position = { x: intersects[0].object._cellIdx.row * this.playerGameField.fieldSize, y: 0, z: intersects[0].object._cellIdx.col * this.playerGameField.fieldSize };
      this.props.build({ issuer: this.props.game.players[0].id, building: building }).then(() => {
        this.playerGameField.setBuilding(position, building.type, building.position);
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
      intersects = intersects.filter(intersect => (typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined'));
      if (intersects.length > 0 && !this.isSwiping && playerHasAttacks(this.props.game.players[0]) === true) {
        let position = intersects[0].object.parent.position;
        this.props.attack({
          issuer: this.props.game.players[0].id,
          attackType: this.props.selectedAttack,
          row: intersects[0].object._cellIdx.row,
          col: intersects[0].object._cellIdx.col
        }).then(() => {
          this.opponentGameField.attack(position, this.props.selectedAttack);
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
    if (this.state.statistics) {
      this.renderStats('frame').start();
      this.glStats.start();
      this.renderStats('rAF').tick();
      this.renderStats('FPS').frame();
    }

    let delta = this.clock.getDelta();

    // Swipe animation to another game field
    if (this.lookAtOpponent && this.camera.position.y < 100) {
      this.camera.position.y += 2.0;
      this.camera.position.x += 4.0;
    } else if (!this.lookAtOpponent && this.camera.position.y > 30) {
      this.camera.position.y -= 2.0;
      this.camera.position.x -= 4.0;
    }

    // Render all objects
    if (this.state.statistics) {
      this.renderStats('render').start();
      this.renderScene();
      this.renderStats('render').end();
    } else {
      this.renderScene();
    }

    if (this.opponentGameField) {
      this.opponentGameField.animate(delta);
    }

    if (this.playerGameField) {
      this.playerGameField.animate(delta);
    }

    if (this.state.statistics) {
      this.renderStats('frame').end();
      this.renderStats('rStats').start();
      this.renderStats().update();
      this.renderStats('rStats').end();
    }

    this.frameId = window.requestAnimationFrame(this.animate);
  }

  deviceOrientationChanged(orientation) {
    this.setState({ landscapeOrientation: this.orientationQuery.matches });
  }

  prepareResumedGame = async () => {
    OfflineStore.getResumeableGame().then((resumeableGame) => {
      if (typeof resumeableGame === 'undefined') {
        this.prepareNewGame();
      } else {
        this.prepareNewGame(resumeableGame);
      }
    })
  }

  prepareNewGame = async (resumeableGame) => {

    gameplayLog.clear();

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

    if (typeof resumeableGame === 'undefined') {
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
    } else {
      this.props.resumeGame(resumeableGame).then(() => {
        this.opponent.player = resumeableGame.players[1];
        this.startGame(true);
      });
    }
  }

  endGame() {
    setTimeout(() => {
      this.props.finishGame();
    }, 1000);
  }

  startGame = (createUnits) => {
    let playerFieldIndex = this.props.game.players[0].fieldIndex;
    let opponentFieldIndex = this.props.game.players[1].fieldIndex;
    this.lookAtOpponent = this.props.game.currentPlayerIndex === 1;

    // Add Light
    var directionalLight = new THREE.DirectionalLight(0xfef8cb, 2.0);
    directionalLight.position.set(20, 24, -10);
    directionalLight.castShadow = false;
    this.scene.add(directionalLight);

    this.playerGameField = new Gamefield(true, [-72, -16, 0], this.props.game.board.fields[playerFieldIndex], playerFieldIndex);
    this.opponentGameField = new Gamefield(false, [72, 56, 0], this.props.game.board.fields[opponentFieldIndex], opponentFieldIndex);
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

    if (createUnits === true) {
      this.lookAtOpponent = (this.props.game.currentPlayerIndex === 1 || this.props.game.state === GameStateTypes.ATTACK_PHASE);
      this.props.game.board.fields[this.props.game.players[0].fieldIndex].grid.forEach((cell) => {
        cell.occupiedBy.forEach((building) => {
          if (building !== EntityType.EMPTY && building !== EntityType.CREAM) {
            const position = { x: cell.row * this.playerGameField.fieldSize, y: 0, z: cell.col * this.playerGameField.fieldSize };
            this.playerGameField.setBuilding(position, building, {row: cell.row, col: cell.col });
          }
        });
      });
      this.props.game.board.fields[this.props.game.players[1].fieldIndex].grid.forEach((cell) => {
        cell.occupiedBy.forEach((building) => {
          if (building !== EntityType.EMPTY && building !== EntityType.CREAM) {
            const position = { x: cell.row * this.playerGameField.fieldSize, y: 0, z: cell.col * this.playerGameField.fieldSize };
            this.opponentGameField.setBuilding(position, building, {row: cell.row, col: cell.col });
          }
        });
      });
    }
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

          <Snackbar
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            open={this.state.snackbar.visible}
            autoHideDuration={4000}
            onClose={() => this.setState({
              snackbar: {
                text: this.state.snackbar.text,
                visible: false
              }
            })}
            ContentProps={{
              'aria-describedby': 'message-id',
            }}
            message={<span id="message-id">{this.state.snackbar.text}</span>}
            action={
              <IconButton
                key="close"
                aria-label="Close"
                color="inherit"
                onClick={() => this.setState({
                  snackbar: {
                    text: this.state.snackbar.text,
                    visible: false
                  }
                })}
              >
                <CloseIcon />
              </IconButton>
            }
          />

          <Dialog
            open={this.state.showErrorReport}
            onClose={() => this.setState({ additionalReportMessage: '', includeDeviceInformation: false, showErrorReport: false })}
            aria-labelledby="report-form-dialog-title"
            PaperProps={{
              style: { width: '80%' }
            }}
          >
            <DialogTitle id="report-form-dialog-title">{t[this.props.language].REPORT_PROBLEM}</DialogTitle>
            <DialogContent>
              <form noValidate autoComplete="off">
                <Typography>{t[this.props.language].REPORT_INFORMATION}</Typography>
                <TextField
                  label={t[this.props.language].REPORT_CUSTOM_MESSAGE}
                  placeholder={t[this.props.language].REPORT_CUSTOM_MESSAGE_PLACEHOLDER}
                  multiline
                  fullWidth
                  InputProps={{
                    style: { fontSize: '0.9rem' },
                  }}
                  InputLabelProps={{
                    style: { color: '#457B82' },
                    shrink: true
                  }}
                  className="additionalMessage"
                  variant="outlined"
                  onChange={event => this.setState({ additionalReportMessage: event.target.value })}
                />
              </form>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={this.state.includeDeviceInformation}
                    onChange={event => {
                      if (event.target.checked) {
                        this.setState({ includeDeviceInformation: true });
                      } else {
                        this.setState({ includeDeviceInformation: false });
                      }
                    }}
                  />
                }
                label={t[this.props.language].REPORT_DEVICE_INFO}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => this.setState({ showErrorReport: false })} color="primary">
                {t[this.props.language].BUTTON_BACK}
              </Button>
              <Button onClick={() => {
                OfflineStore.gamestateStore.get('gamestate').then(gamestate => {
                  let report = {
                    deviceInformation: this.state.includeDeviceInformation ? navigator.userAgent : undefined,
                    gamestate: gamestate,
                    message: this.state.additionalReportMessage
                  };

                  let user = 'battlechoc-pwa';
                  let password = '***REMOVED***';
                  let auth = btoa(user + ':' + password);

                  fetch('https://us-central1-battlechoc.cloudfunctions.net/api/debugging/gamestate', {
                    method: 'post',
                    headers: new Headers({
                      'Authorization': 'Basic ' + auth,
                      'Accept': 'application/json',
                      'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({ report: report })
                  })
                    .then(response => response.json())
                    .then(data => this.setState({
                      snackbar: {
                        text: t[this.props.language].SNACKBAR_SEND,
                        visible: true
                      }
                    }));
                  this.setState({ additionalReportMessage: '', includeDeviceInformation: false, showErrorReport: false });
                }).catch(error => {
                  console.log(error);
                  this.setState({
                    additionalReportMessage: '',
                    includeDeviceInformation: false,
                    showErrorReport: false,
                    snackbar: {
                      text: t[this.props.language].SNACKBAR_ERROR,
                      visible: true
                    }
                  });
                })
              }} color="primary">
                {t[this.props.language].REPORT_PROBLEM}
              </Button>
            </DialogActions>
          </Dialog>

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
                <Button className="dialogButton" color="secondary" variant="outlined" onClick={() => {
                  this.setState({
                    showSettings: false,
                    attentionTextVisible: false,
                    showErrorReport: true
                  });
                }}>
                  {t[this.props.language].REPORT_PROBLEM}
                </Button>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={this.state.statistics}
                      onChange={event => {
                        if (event.target.checked) {
                          document.getElementsByClassName('rs-base')[0].style.display = 'block';
                          this.setState({ statistics: true });
                        } else {
                          document.getElementsByClassName('rs-base')[0].style.display = 'none';
                          this.setState({ statistics: false });
                        }
                      }}
                    />
                  }
                  label="Development Statistics"
                />
                {
                  typeof this.props.game !== 'undefined' ?
                    <Button variant="outlined" className="dialogButton" onClick={() => {
                      if (this.state.attentionTextVisible) {
                        this.endGame();
                        this.setState({ showSettings: false, attentionTextVisible: false });
                      } else {
                        this.setState({ attentionTextVisible: true });
                      }
                    }}>
                      {t[this.props.language].SETTINGS_QUIT}
                    </Button>
                    : null
                }
                {
                  this.state.attentionTextVisible && typeof this.props.game !== 'undefined' ?
                    <Typography color="error" className="attentionText">{t[this.props.language].SETTINGS_ATTENTION_TEXT}</Typography>
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
            prepareNewGameCallback={this.prepareNewGame}
            prepareResumedGameCallback={this.prepareResumedGame}
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
  selectedAttack: state.ui.selectedAttack,
  language: state.ui.language
});

const mapDispatchToProps = {
  startGame,
  resumeGame,
  createBoard,
  chooseStart,
  chooseField,
  finishTurn,
  finishGame,
  build,
  finishBuildPhase,
  attack,
  changeLanguage,
  deselectBuildings,
  gameResumeable
};

const AppContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default AppContainer;
