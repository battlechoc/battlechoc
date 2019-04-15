import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './App.css';
import * as THREE from 'three';

import AssetLoader from './AssetLoader'
import Gamefield from './Gamefield';
import Hud from './ui/Hud';
import { EntityType, AttackType, createEntity, getEntityDescriptor } from './gameplay/GameEntities';
import { startGame, resumeGame, finishGame, createBoard, chooseStart, chooseField, finishTurn, attack, build, finishBuildPhase, endGame } from './gameplay/GameActions';
import { changeLanguage, deselectBuildings, selectAttack, deselectAttack, gameResumeable } from './ui/UiActions';
import { connect } from 'react-redux';
import { Augustus } from './gameplay/Player';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { GameStateTypes } from './gameplay/GameplayReducer'
import { BattlechocError } from './gameplay/Errors';
import { createPlayer, playerHasAttacks, PlayerType } from './gameplay/Player';
import Rules from './gameplay/Rules';
import { gameplayLog } from './gameplay/GamePlayLogger';
import OfflineStore from './OfflineStore';
import CircularProgress from '@material-ui/core/CircularProgress';
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
import Jukebox from './ui/Jukebox';

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

  componentWillMount() {
    OfflineStore.settingsStore.get('language').then(language => {
      if (typeof language !== 'undefined') {
        this.props.changeLanguage(language);
      } else {
        this.props.changeLanguage(this.props.browserLanguage);
      }
    });
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

    window.onfocus = () => Jukebox.playMusic();
    window.onblur = () => Jukebox.pauseMusic();
  }

  componentWillReceiveProps(nextProps) {
    const gameTransition = getGameTransition(this.props.game, nextProps.game);
    let gameStopped = typeof this.props.game !== 'undefined' ? !this.props.game.isRunning : false;
    if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined') {
      if (this.props.game.isRunning === true && nextProps.game.isRunning === false) {
        gameStopped = true;
        setTimeout(() => {
          if (nextProps.game.winners.length === 1) {
            if (nextProps.game.winners[0].type === PlayerType.HUMAN) {
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_WIN_GAME);
            } else {
              this.hud.showTurnMessage(t[this.props.language].MESSAGE_LOST_GAME);
            }
          } else if (nextProps.game.winners.length === 2) {
            this.hud.showTurnMessage(t[this.props.language].MESSAGE_DRAW_GAME);
          }
          setTimeout(() => this.endGame(), 2000);
        }, 2000);
      }
    }

    if (gameTransition === GameTransitions.GAME_FINISHED) {
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
        this.props.gameResumeable(false);
        OfflineStore.gamestateStore.clear();
      }
    }

    if (!gameStopped) {
      if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined' && typeof OfflineStore.gamestateStore !== 'undefined' &&
        (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE) && (nextProps.game.currentPlayerIndex === 0)) {
        OfflineStore.saveCurrentGame(nextProps.game)
          .then(() => {
            this.props.gameResumeable(true)
              .catch(error => {
                if (error instanceof BattlechocError) {
                  console.warn(error);
                } else {
                  throw error;
                }
              });
          });
      }

      if (nextProps.game !== undefined && (nextProps.game.state === GameStateTypes.BUILD_PHASE || nextProps.game.state === GameStateTypes.ATTACK_PHASE)) {
        const winners = Rules.determineWinner(nextProps.game);
        if (typeof winners !== 'undefined') {
          this.props.endGame(winners)
        }
      }

      // switch language also for meta tags #SEO
      if (nextProps.language !== this.props.language) {
        document.querySelector('meta[name="description"]').setAttribute("content", t[nextProps.language].META_DESCRIPTION);
        document.querySelector('meta[name="keywords"]').setAttribute("content", t[nextProps.language].META_KEYWORDS);
      }

      if (gameTransition === GameTransitions.OPPONENT_HAS_CHOSEN_START) {
        this.hud.unlockUi();
        this.colorStartButton = 1;
      } else if (gameTransition === GameTransitions.OPPONENT_STARTS_GAME) {
        this.opponent.simulateChooseFieldOrStartDecision();
      } else if (gameTransition === GameTransitions.PLAYER_HAS_CHOSEN_START) {
        this.opponent.simulateChooseFieldDecision();
      } else if (gameTransition === GameTransitions.PLAYER_INITAL_PLACEMENT) {
        this.triggerUiEvent = 'START_GAME';
      } else if (gameTransition === GameTransitions.OPPONENT_INITAL_PLACEMENT) {
        this.triggerUiEvent = 'START_GAME';
      } else if (gameTransition === GameTransitions.PLAYER_FINISHED_INITIAL_PLACEMENT) {
        this.opponent.simulateInitialPlacement(this.opponentGameField);
      } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
        const attacks = [AttackType.TRUFFLE, AttackType.HOT_CHOCOLATE, AttackType.FRUIT, AttackType.BUNNY];
        for (var attackType in attacks) {
          if (nextProps.game.players[0].attacks[attacks[attackType]] > 0) {
            setTimeout(() => {
              this.props.selectAttack(attacks[attackType])
                .catch(error => {
                  if (error instanceof BattlechocError) {
                    console.warn(error);
                  } else {
                    throw error;
                  }
                })
            }, 200);
            break;
          }
        }
      } else if (gameTransition === GameTransitions.OPPONENT_BUILD_PHASE) {
        this.opponent.simulateBuildPhase(this.opponentGameField);
      } else if (gameTransition === GameTransitions.OPPONENT_ATTACK_PHASE) {
        this.opponent.simulateAttackPhase(this.opponentGameField, this.playerGameField);
      } else if (gameTransition === GameTransitions.ATTACKS_DEPLETED) {
        setTimeout(() => {
          this.props.finishTurn({ issuer: this.props.game.players[0].id })
            .catch(error => {
              if (error instanceof BattlechocError) {
                console.warn(error);
              } else {
                throw error;
              }
            })
        }, 3000);
      }
    }
  }

  componentDidUpdate() {
    if (typeof this.props.game !== 'undefined') {
      if (this.triggerUiEvent === 'START_GAME') {
        this.startGame();
        if (this.props.game.currentPlayerIndex === 1) {
          this.opponent.simulateInitialPlacement(this.opponentGameField);
        }
      }
      this.triggerUiEvent = undefined;
      this.lookAtOpponent = (this.props.game.currentPlayerIndex === 1 &&
        this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
        (this.props.game.currentPlayerIndex === 0 &&
          this.props.game.state === GameStateTypes.ATTACK_PHASE);
    }
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
      "animation": "animationend",
      "OAnimation": "oAnimationEnd",
      "MozAnimation": "animationend",
      "WebkitAnimation": "webkitAnimationEnd"
    }
    let supportedAnimation = 'animation';

    for (let animation in animations) {
      if (typeof info.style[animation] !== 'undefined') {
        supportedAnimation = animations[animation];
      }
    }

    info.addEventListener(supportedAnimation, () => {
      this.container.removeChild(info);
    });
    this.container.appendChild(info);
  }

  onClick = event => {
    // Get mouse position and use raycaster
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check clickable objects
    if (this.props.game.currentPlayerIndex === 0) {
      this.playerFieldClick(event);
      this.opponentFieldClick(event);
    }

    // Part of "ignore click if it was just an end of swiping"
    this.isSwiping = false;
  }

  playerFieldClick(event) {
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);
    intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
      (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
    let buildingSelected = this.props.selectedBuilding;
    let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
      this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
    if (intersects.length > 0 && !this.isSwiping && (buildingSelected || (initialPlacement && this.props.game.players[0].buildingsPerTurn === 0))) {
      let building = null;
      if (initialPlacement) {
        building = createEntity(EntityType.FACTORY);
      } else {
        building = createEntity(this.props.selectedBuilding);
      }
      let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
      building.position = {
        row: cellIndex.row,
        col: cellIndex.col
      }
      let playerCacaoPerTurnBefore = this.props.game.players[0].cacaoPerTurn;
      let buildingsPerTurnBefore = this.props.game.players[0].buildingsPerTurn;
      this.props.build({ issuer: this.props.game.players[0].id, building: building }).then(() => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
        this.playerGameField.setBuilding(building.type, building.position);
        if (initialPlacement) {
          this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].buildingsPerTurn + ' buildings per turn', 'positive');
          this.props.deselectBuildings();
          this.props.deselectAttack();
          setTimeout(() => {
            this.props.finishTurn({ issuer: this.props.game.players[0].id });
            this.props.deselectBuildings();
            this.props.deselectAttack();
          }, 3000);
        } else {
          let description = getEntityDescriptor(this.props.selectedBuilding)
          this.spawnInfoText({ x: event.clientX, y: event.clientY }, '-' + description.costs + ' cacao', 'negative');
          setTimeout(() => {
            if (building.type === EntityType.CACAOTREE) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].cacaoPerTurn - playerCacaoPerTurnBefore + ' cacao per turn', 'positive');
            } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+1 attack per turn', 'positive');
            } else if (building.type === EntityType.FACTORY_EXTENSION) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].buildingsPerTurn - buildingsPerTurnBefore + ' buildings per turn', 'positive');
            } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+1 spy attack per turn', 'positive');
            }
          }, 400);
        }
      }).catch(error => {
        if (error instanceof BattlechocError) {
          console.warn(error);
        } else {
          throw error;
        }
      });
    }
  }

  opponentFieldClick(event) {
    if (this.lookAtOpponent && this.props.game.state === GameStateTypes.ATTACK_PHASE) {
      var intersects = this.raycaster.intersectObjects(this.opponentClickTargets, true);
      intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
      if (intersects.length > 0 && !this.isSwiping && playerHasAttacks(this.props.game.players[0]) === true) {
        let cellIndex = intersects[0].object._cellIdx || intersects[0].face._cellIdx;
        let target = { row: cellIndex.row, col: cellIndex.col };
        this.props.attack({
          issuer: this.props.game.players[0].id,
          attackType: this.props.selectedAttack,
          row: target.row,
          col: target.col
        }).then(() => {
          if (this.props.selectedAttack === AttackType.BUNNY) {
            if (this.props.game.players[0].attacksPerTurn[AttackType.BUNNY] > 0) {
              Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
              this.opponentGameField.attack(target, AttackType.BUNNY);
            } else {
              Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
              this.playerGameField.meltDownEasterBunny();
              this.opponentGameField.receiveBallista(target);
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, 'Xmas factory caught your spying easter bunny!', 'negative');
            }
          } else if (typeof this.props.selectedAttack !== 'undefined') {
            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
            const attackedCell = this.props.game.board.fields[this.props.game.players[1].fieldIndex].grid[target.row * this.props.game.board.size.cols + target.col];
            this.opponentGameField.attack(target, this.props.selectedAttack, attackedCell.shielded);
            if (this.props.selectedAttack === AttackType.HOT_CHOCOLATE) {
              let opponentFieldIndex = this.props.game.players[1].fieldIndex;
              this.opponentGameField.rebuild(this.props.game.board.fields[opponentFieldIndex]);
            }
          }

          if (this.props.game.players[0].attacks[this.props.selectedAttack] === 0) {
            const attackTypes = [AttackType.TRUFFLE, AttackType.FRUIT, AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
            let undepletedAttack = attackTypes.filter(attackType => this.props.game.players[0].attacks[attackType]);
            if (undepletedAttack.length > 0) {
              this.props.selectAttack(undepletedAttack[0]).catch(error => {
                if (error instanceof BattlechocError) {
                  console.warn(error);
                } else {
                  throw error;
                }
              });
            }
          }
        }).catch(error => {
          if (error instanceof BattlechocError) {
            console.warn(error);
          } else {
            throw error;
          }
        })
      }
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
    Jukebox.startMusic(Jukebox.SONGS.MAIN_THEME);
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    gameplayLog.clear();

    const searchParams = new URLSearchParams(window.location.search);
    const isPwa = searchParams.get('app_runs_as') === 'pwa';
    let isAndroid = /Android/i.test(navigator.userAgent);

    if (!isPwa) {
      try {
        await document.documentElement.requestFullscreen();
        if (isAndroid) {
          await window.screen.orientation.lock('landscape');
        }
      } catch (error) {
        console.log(error.name + ': ' + error.message);
      }
    }

    if (typeof resumeableGame === 'undefined') {
      let players = [
        createPlayer("Charlie Bucket", PlayerType.HUMAN),
        createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP)
      ];

      this.props.startGame(players).then(() => {
        if (this.props.game.currentPlayerIndex === 0) {
          this.hud.showTurnMessage(t[this.props.language].MESSAGE_PLAYER_DECIDE);
        } else {
          this.hud.lockUi();
          this.hud.showTurnMessage(t[this.props.language].MESSAGE_OPPONENT_DECIDE);
        }

        this.opponent.type = Augustus.randomizeType();
        console.log("type of Augustus is: " + this.opponent.type);
        this.opponent.connectGamestate(() => this.props.game);

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
        this.opponent.connectGamestate(() => this.props.game);
        this.startGame(true);
      });
    }
  }

  endGame() {
    setTimeout(() => {
      Jukebox.stopMusic();
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

    this.playerGameField = new Gamefield(true, [-72, -16, 0], this.props.game.board.fields[playerFieldIndex], playerFieldIndex, this.props.game.board.size);
    this.opponentGameField = new Gamefield(false, [72, 56, 0], this.props.game.board.fields[opponentFieldIndex], opponentFieldIndex, this.props.game.board.size);
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
          if (building !== EntityType.CREAM) {
            this.playerGameField.setBuilding(building, { row: cell.row, col: cell.col });
          }
        });
      });
      this.props.game.board.fields[this.props.game.players[1].fieldIndex].grid.forEach((cell) => {
        cell.occupiedBy.forEach((building) => {
          if (building !== EntityType.CREAM) {
            this.opponentGameField.setBuilding(building, { row: cell.row, col: cell.col });
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
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
              <Button onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                this.setState({ showErrorReport: false });
              }} color="primary">
                {t[this.props.language].BUTTON_BACK}
              </Button>
              <Button onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
                  console.warn(error);
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
                  onChange={event => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    this.props.changeLanguage(event.target.value);
                  }}
                  inputProps={{
                    name: 'language',
                    id: 'lang-selection',
                  }}
                >
                  <option value="en">{t[this.props.language].ENGLISH}</option>
                  <option value="de">{t[this.props.language].GERMAN}</option>
                </Select>
                <Button className="dialogButton" color="secondary" variant="outlined" onClick={() => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
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
              <Button onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                this.setState({ showSettings: false, attentionTextVisible: false })
              }} color="primary">
                {t[this.props.language].BUTTON_BACK}
              </Button>
            </DialogActions>
          </Dialog>

          <Hud
            prepareNewGameCallback={this.prepareNewGame}
            prepareResumedGameCallback={this.prepareResumedGame}
            showSettings={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              this.setState({ showSettings: true });
            }}
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

App.propTypes = {
  browserLanguage: PropTypes.string.isRequired,
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  selectedBuilding: state.ui.selectedBuilding,
  selectedAttack: state.ui.selectedAttack,
  language: state.ui.language
});

const mapDispatchToProps = {
  startGame,
  endGame,
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
  selectAttack,
  deselectAttack,
  gameResumeable
};

const AppContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default AppContainer;
