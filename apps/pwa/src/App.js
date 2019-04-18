import React, { Component } from 'react';
import { connect } from 'react-redux';
import './App.css';
import * as THREE from 'three';

import AssetLoader from './AssetLoader'
import Gamefield from './Gamefield';
import Hud from './ui/Hud';
import Jukebox from './ui/Jukebox';
import t from './ui/Translation';
import OfflineStore from './OfflineStore';
import Rules from './gameplay/Rules';
import { BoardCellTypes, EntityType, AttackType, createEntity, getEntityDescriptor } from './gameplay/GameEntities';
import { startGame, resumeGame, finishGame, createBoard, chooseStart, chooseField, finishTurn, attack, build, finishBuildPhase, endGame } from './gameplay/GameActions';
import { changeLanguage, deselectBuildings, selectAttack, deselectAttack, gameResumeable } from './ui/UiActions';
import { Augustus } from './gameplay/Player';
import { GameTransitions, getGameTransition } from './gameplay/GameTransitions';
import { GameStateTypes } from './gameplay/GameplayReducer'
import { BattlechocError } from './gameplay/Errors';
import { createPlayer, playerHasAttacks, PlayerType } from './gameplay/Player';
import { gameplayLog } from './gameplay/GamePlayLogger';
import CircularProgress from '@material-ui/core/CircularProgress';
import rStats from 'rstatsjs/src/rStats';
import { glStats, BrowserStats } from 'rstatsjs/src/rStats.extras';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loadingProgress: 0
    }
  }

  updateProgressbar(progress) {
    this.setState({ loadingProgress: progress });
  }

  componentWillMount() {
    let browserLanguage = 'en';
    if (navigator.userLanguage) {
        browserLanguage = navigator.userLanguage.substr(0,2);
    } else if (navigator.language) {
        browserLanguage = navigator.language.substr(0,2);
    }

    OfflineStore.settingsStore.get('language').then(language => {
      if (typeof language !== 'undefined') {
        this.props.changeLanguage(language);
      } else {
        this.props.changeLanguage(browserLanguage);
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

    this.renderer = new THREE.WebGLRenderer({ alpha: true });

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.gammaOutput = true;
    this.renderer.gammaFactor = 1.7;

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
      } else if (gameTransition === GameTransitions.PLAYER_BUILD_PHASE) {
        const specialTrees = nextProps.game.board.fields[this.props.game.players[0].fieldIndex].grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE) && cell.type === BoardCellTypes.WHITE);
        const trees = nextProps.game.board.fields[this.props.game.players[0].fieldIndex].grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE) && cell.type !== BoardCellTypes.WHITE);
        let description = getEntityDescriptor(EntityType.CACAOTREE)
        trees.forEach((cell) => {          
          this.spawnInfoText3d(cell, '+' + description.cacaoPerTurn + ' [cacao]', 'positive');
        });
        specialTrees.forEach((cell) => {          
          this.spawnInfoText3d(cell, '+' + Math.round(description.cacaoPerTurn * 1.5) + ' [cacao]', 'positive');
        });
      } else if (gameTransition === GameTransitions.PLAYER_ATTACK_PHASE) {
        const attacks = [AttackType.TRUFFLE, AttackType.HOT_CHOCOLATE, AttackType.FRUIT, AttackType.BUNNY];
        let availableAttackType = undefined;
        for (var attackType in attacks) {
          if (nextProps.game.players[0].attacks[attacks[attackType]] > 0) {
            availableAttackType = attacks[attackType];
            break;
          }
        }
        if (typeof availableAttackType !== 'undefined') {
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

  spawnInfoText3d(position, text, messageType) {
    let building = this.playerGameField.getBuildingAtPosition(position);
    let vector = building._model.getWorldPosition(new THREE.Vector3());
    vector.project(this.camera);
    vector.x = (vector.x + 1) / 2 * window.innerWidth;
    vector.y = - (vector.y - 1) / 2 * window.innerHeight;
    this.spawnInfoText(vector, text, messageType);
  }

  spawnInfoText(position, text, messageType) {
    const info = document.createElement("div");

    if (text.indexOf('[cacao]') > -1) {
      info.innerHTML = '<p>' + text.substr(0, text.indexOf('[cacao]')) + '</p><img src="/images/cacao_no_background.png" />';
    } else if (text.indexOf('[cacao per turn]') > -1) {
      info.innerHTML = '<p>' + text.substr(0, text.indexOf('[cacao per turn]')) + '</p><img src="/images/cacaoPerTurn.png" />';
    } else if (text.indexOf('[attack per turn]') > -1) {
      info.innerHTML = '<p>' + text.substr(0, text.indexOf('[attack per turn]')) + '</p><img src="/images/attacksPerTurn.png" />';
    } else if (text.indexOf('[buildings per turn]') > -1) {
      info.innerHTML = '<p>' + text.substr(0, text.indexOf('[buildings per turn]')) + '</p><img src="/images/buildingsPerTurn.png" />';
    } else if (text.indexOf('[spy attack per turn]') > -1) {
      info.innerHTML = '<p>' + text.substr(0, text.indexOf('[spy attack per turn]')) + '</p><img src="/images/spyAttacksPerTurn.png" />';
    } else {
      info.innerHTML = '<p>' + text + '</p>';
    }

    info.classList.add('flyingInfo');
    info.classList.add(messageType);

    if (text.indexOf('[Bunny caught]') > -1) {
      info.classList.remove('flyingInfo');
      info.classList.remove(messageType);
      info.classList.add('flyingCaughtBunny');
      info.innerHTML = '<img src="/images/bunnyCaught.png" />';
    }
    
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
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.props.game.currentPlayerIndex === 0) {
      this.playerFieldClick(event);
      this.opponentFieldClick(event);
    }
  }

  playerFieldClick(event) {
    var intersects = this.raycaster.intersectObjects(this.clickTargets, true);
    intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
      (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
    let buildingSelected = this.props.selectedBuilding;
    let initialPlacement = this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
      this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;
    if (intersects.length > 0 && (buildingSelected || (initialPlacement && this.props.game.players[0].buildingsPerTurn === 0))) {
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
          console.log(event)
          this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].buildingsPerTurn + ' [buildings per turn]', 'positive');
          this.props.deselectBuildings();
          this.props.deselectAttack();
          setTimeout(() => {
            this.props.finishTurn({ issuer: this.props.game.players[0].id });
            this.props.deselectBuildings();
            this.props.deselectAttack();
          }, 3000);
        } else {
          let description = getEntityDescriptor(this.props.selectedBuilding)
          this.spawnInfoText({ x: event.clientX, y: event.clientY }, '-' + description.costs + ' [cacao]', 'negative');
          setTimeout(() => {
            if (building.type === EntityType.CACAOTREE) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].cacaoPerTurn - playerCacaoPerTurnBefore + ' [cacao per turn]', 'positive');
            } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+1 [attack per turn]', 'positive');
            } else if (building.type === EntityType.FACTORY_EXTENSION) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+' + this.props.game.players[0].buildingsPerTurn - buildingsPerTurnBefore + ' [buildings per turn]', 'positive');
            } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '+1 [spy attack per turn]', 'positive');
            }
          }, 1000);
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
    if (this.lookAtOpponent && this.props.game.state === GameStateTypes.ATTACK_PHASE && typeof this.props.selectedAttack !== 'undefined') {
      var intersects = this.raycaster.intersectObjects(this.opponentClickTargets, true);
      intersects = intersects.filter(intersect => ((typeof intersect.object._cellIdx !== 'undefined' && typeof intersect.object._fieldIdx !== 'undefined') ||
        (typeof intersect.face._cellIdx !== 'undefined' && typeof intersect.face._fieldIdx)));
      if (intersects.length > 0 && playerHasAttacks(this.props.game.players[0]) === true) {
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
              this.spawnInfoText({ x: event.clientX, y: event.clientY }, '[Bunny caught]', 'negative');
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
    if (this.props.statistics) {
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
    if (this.props.statistics) {
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

    if (this.props.statistics) {
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
    const playerFieldIndex = this.props.game.players[0].fieldIndex;
    const opponentFieldIndex = this.props.game.players[1].fieldIndex;
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
      return(
        <div className="app-container">
          <div id="clouds"></div>
            <Hud
              prepareNewGameCallback={this.prepareNewGame}
              prepareResumedGameCallback={this.prepareResumedGame}
              endGame={() => this.endGame}
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
  language: state.ui.language,
  statistics: state.ui.statistics
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
  deselectBuildings,
  changeLanguage,
  selectAttack,
  deselectAttack,
  gameResumeable
};

const AppContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(App);

export default AppContainer;