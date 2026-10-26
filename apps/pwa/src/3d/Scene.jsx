import React, { Component, createRef } from "react";
import { connect } from "react-redux";
import {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
} from "../ui/UiActions";
import { selectActiveGame } from "../match/matchSlice";
import { matchSession } from "../match/LocalMatchHost";
import { submit, ignoreRuleErrors } from "../ui/match/submit";
import { InfoType } from "./InfoType";
import Gamefield from "./Gamefield";
import { applyLook } from "./look";
import {
  EntityType,
  AttackType,
  BoardCellTypes,
  isDonut,
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { Jukebox } from "../ui/misc";
import {
  Scene as BabylonScene,
  DynamicTexture,
  Mesh,
  StandardMaterial,
  Engine,
  HighlightLayer,
  FlyCamera,
  Color3,
  Camera,
  Vector3,
  Color4,
  Animation,
  MeshBuilder,
  PointerEventTypes,
} from "./babylon";
import { AssetLoadingViewContainer as AssetLoadingView } from "../AssetLoader";
import logger from "../helper/logger";
import { v4 as uuidv4 } from "uuid";
import { withTheme } from "react-jss";

// The camera looks at the origin and a board's cells start at its position, its middle
// (cols - 1) / 2 further in: lifted by that, a board is centred on the screen. The 6×6 board
// is; the 10×10 one, which nearly fills a landscape screen, sits half a unit higher, clear of
// the build palette; the 8×8 one in between.
const boardHeight = (cols) => (cols - 1) / 2 + (cols - 6) / 8;
// the energy bars float this high above the base of the boards
const ENERGY_BAR = 1.5;

class Scene extends Component {
  constructor(props) {
    super(props);
    this.loadingView = createRef();
  }

  componentDidMount() {
    this.props.onRef(this);
    // A phone with a 3x screen would render nine times the pixels of the CSS size; twice is
    // sharp enough and leaves the GPU less than half the work (limitDeviceRatio).
    this.engine = new Engine(
      this.container,
      true,
      {
        stencil: true,
        useHighPrecisionFloats: false,
        limitDeviceRatio: 2,
      },
      true
    );

    let createScene = () => {
      let scene = new BabylonScene(this.engine);
      scene.clearColor = new Color4(0, 0, 0, 0);
      this.camera = new FlyCamera("camera", new Vector3(30, 30, 30), scene);
      this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      this.camera.minZ = 0;
      this.camera.maxZ = 100;
      this.estimateOrthographicSize();
      this.camera.setTarget(Vector3.Zero());
      applyLook(scene);
      this.loadingView.current.loadAssets(scene);
      return scene;
    };

    this.animations = [];
    this.scene = createScene();
    this.energyBars = [];
    this.highlightLayer = new HighlightLayer("highlightLayer", this.scene, {
      camera: this.camera,
    });
    this.animate = () => this.scene.render();
    // Renders once in the next frame, however often it is asked before; the render loop, while
    // it runs, renders anyway. (Every view update used to render right away.)
    this.requestRender = () => {
      if (this.renderLoopRepetitions > 0 || this.renderRequested) {
        return;
      }
      this.renderRequested = true;
      requestAnimationFrame(() => {
        this.renderRequested = false;
        if (!this.scene.isDisposed) {
          this.scene.render();
        }
      });
    };
    // One pointer handler for the boards: the meshes of a Gamefield carry their cell in
    // metadata (an action manager on every instance cost picking work on every pointer move).
    // Only board meshes are picked, and only on pointer down.
    this.scene.skipPointerMovePicking = true;
    this.scene.skipPointerUpPicking = true;
    this.scene.pointerDownPredicate = (mesh) =>
      mesh.isPickable && mesh.isVisible && mesh.isEnabled() && Boolean(mesh.metadata && mesh.metadata.gamefield);
    this.scene.onPointerObservable.add((info) => {
      const pick = info.pickInfo;
      if (pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata) {
        const { gamefield, row, col } = pick.pickedMesh.metadata;
        gamefield.action(row, col, pick.pickedMesh.position);
      }
    }, PointerEventTypes.POINTERDOWN);
    window.addEventListener("resize", this.resize);
    this.playerGameField = null;
    this.opponentGameField = null;
    this.renderLoopRepetitions = 0;
    this.opponentGameFieldDistance = 12;
    this.weaponIndicators = new Map();
    this.donutBitmaps = new Map();
    // the loading donut in ten steps doubles as the progress indicator above the units
    this.donutImages = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((percent) => {
      const image = new Image();
      image.onload = () => this.updateWeaponIndicators();
      image.src = `/images/progress-${percent}.svg`;
      return image;
    });
    this.weaponIndicatorInterval = setInterval(() => this.updateWeaponIndicators(), 250);
  }

  hideEnergyBar = (position, field) => {
    const height = this.heightAbove(ENERGY_BAR);

    if (position === null) {
      position = new Vector3(field.row, height, field.col);
    }
    let name = `${position.x}-${height}-${position.z}`;
    if (this.energyBars.includes(name)) {
      this.scene.stopAnimation(this.scene.getMeshByName("energy.bar." + name));
    }
  };

  stopAllAnimations = () => {
    for (const callback of this.animations) {
      this.scene.stopAnimation(callback.target);
    }

    if (this.opponentGameField) {
      this.opponentGameField.stopAllAnimations();
    }

    if (this.playerGameField) {
      this.playerGameField.stopAllAnimations();
    }

    this.animations = [];
  };

  showEnergyBar = (entity, position, showShieldEnergyToo = false) => {
    if (showShieldEnergyToo) {
      const cellAt = (board, field, row, col) =>
        board.fields[field].grid[row * board.size.cols + col];
      const selectedCell = cellAt(
        this.props.game.board,
        this.props.game.players[this.props.game.viewer].fieldIndex,
        entity.position.row,
        entity.position.col
      );
      if (selectedCell.shielded) {
        this.showEnergyBar(
          this.getFountain(
            entity.position.row,
            entity.position.col,
            this.props.game.board,
            this.props.game.players[this.props.game.viewer].fieldIndex
          )
        );
      }
    }

    const height = this.heightAbove(ENERGY_BAR);

    if (typeof position === "undefined") {
      position = new Vector3(entity.position.row, height, entity.position.col);
    } else if (!(position instanceof Vector3)) {
      position = new Vector3(position.row, height, position.col);
    } else {
      position.y = height;
    }

    const name = `${position.x}-${height}-${position.z}`;
    this.hideEnergyBar(position);
    this.energyBars.push(name);

    const maxHp = typeof entity.maxHp === "number" ? entity.maxHp : entity.max.hp;
    const energy = Math.max(0, Math.min(1, entity.hp / maxHp));
    const bar = MeshBuilder.CreatePlane(
      "energy.bar." + name,
      { width: energy, height: 0.15 },
      this.scene
    );
    bar.isPickable = false;
    const material = new StandardMaterial(
      "energy.bar.material." + name,
      this.scene
    );
    // unlit like the weapon indicators: the lights would darken the bar's colour
    material.disableLighting = true;
    if (energy < 0.3) {
      material.emissiveColor = Color3.FromHexString("#D05531");
    } else if (energy < 0.6) {
      material.emissiveColor = Color3.FromHexString("#DFBF31");
    } else {
      material.emissiveColor = Color3.FromHexString("#70bf31");
    }

    bar.material = material;
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bar.position = position.clone();
    bar.position.x = bar.position.x + (1 - energy) * 0.35;
    bar.position.z = bar.position.z - (1 - energy) * 0.35;

    const fade = new Animation(
      "fade",
      "visibility",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    fade.setKeys([
      { frame: 0, value: 1.0 },
      { frame: 180, value: 0.9 },
      { frame: 240, value: 0.0 },
    ]);

    this.setRenderLoop();
    bar.animations = [fade];

    const uuid = uuidv4();
    this.animations.push({
      id: uuid,
      target: bar,
      stopAnimation: () => {
        material.dispose();
        bar.dispose();
        this.energyBars = this.energyBars.filter((bar) => bar !== name);
        this.setRenderLoop(false);
        this.animations = this.animations.filter(
          (callback) => callback.id !== uuid
        );
      },
    });

    this.scene.beginAnimation(bar, 0, 240, false, 1, () => {
      if (this.animations.findIndex((callback) => callback.id === uuid) > -1) {
        this.animations
          .find((callback) => callback.id === uuid)
          .stopAnimation();
      }
    });
  };

  componentWillUnmount() {
    window.removeEventListener("resize", this.resize);
    clearInterval(this.weaponIndicatorInterval);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.boardTopInset !== this.props.boardTopInset) {
      this.resize();
    }
    if (typeof this.props.game !== "undefined") {
      this.realtimeUpdate(prevProps);
    }
  }

  spawnInfo(messageType, position, amount, donutType) {
    if (!(position instanceof Vector3)) {
      position = new Vector3(position.row, 6.5, position.col);
    }

    const id = Date.now();
    const info = MeshBuilder.CreatePlane(
      "info_" + id,
      { width: 1.15, height: 1.15 },
      this.scene
    );
    info.isPickable = false;
    info.renderingGroupId = 1;
    info.position = position;
    // starts right above the units of the board (boards sit lower the smaller they are)
    info.position.y = this.heightAbove(1);
    info.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const texture = new DynamicTexture("info_texture_" + id, 208, this.scene);
    const context = texture.getContext();
    const material = new StandardMaterial("info_material_" + id, this.scene);
    material.emissiveTexture = texture;
    material.ambientTexture = texture;
    material.opacityTexture = texture;

    info.material = material;

    const drawInfo = (filename, color, text, plain = false) => {
      const image = new Image();
      image.src = filename;
      image.onload = () => {
        this.setRenderLoop();
        let top = 120;
        let left = 70;
        if (plain) {
          // palette icons come in different sizes: draw them into a fixed box
          context.drawImage(image, 0, 0, 130, 130);
          top = 130;
          left = 90;
        } else if (filename === "/images/cacao.svg") {
          context.drawImage(image, 0, 0, image.width * 0.5, image.height * 0.5);
          top = 100;
          left = 56;
        } else {
          context.drawImage(image, 0, 0, image.width * 0.8, image.height * 0.8);
        }

        texture.update();

        const darken = (color, amount) =>
          "#" +
          color
            .replace(/^#/, "")
            .replace(/../g, (color) =>
              (
                "0" +
                Math.min(
                  255,
                  Math.max(0, parseInt(color, 16) + amount)
                ).toString(16)
              ).substr(-2)
            );

        if (typeof text !== "undefined") {
          texture.drawText(
            text,
            left + 2,
            top + 2,
            "bold 68px Bangers, Impact, sans-serif",
            darken(color, -128),
            null,
            true,
            true
          );
          texture.drawText(
            text,
            left,
            top,
            "bold 68px Bangers, Impact, sans-serif",
            color,
            null,
            true,
            true
          );
        }

        const flyaway = new Animation(
          "flyaway_" + id,
          "position.y",
          60,
          Animation.ANIMATIONTYPE_FLOAT,
          Animation.ANIMATIONLOOPMODE_CYCLE
        );
        const fade = new Animation(
          "fade",
          "visibility",
          60,
          Animation.ANIMATIONTYPE_FLOAT,
          Animation.ANIMATIONLOOPMODE_CONSTANT
        );
        fade.setKeys([
          { frame: 0, value: 1.0 },
          { frame: 100, value: 0.8 },
          { frame: 120, value: 0.0 },
        ]);
        const keyframes = [
          { frame: 0, value: info.position.y },
          { frame: 120, value: info.position.y + 1.4 },
        ];
        flyaway.setKeys(keyframes);
        info.animations = [flyaway, fade];
        const uuid = uuidv4();
        this.animations.push({
          id: uuid,
          target: info,
          stopAnimation: () => {
            info.dispose();
            texture.dispose();
            material.dispose();
            this.setRenderLoop(false);
            this.animations = this.animations.filter(
              (callback) => callback.id !== uuid
            );
          },
        });
        this.scene.beginAnimation(info, 0, 180, false, 1, () => {
          if (
            this.animations.findIndex((callback) => callback.id === uuid) > -1
          ) {
            this.animations
              .find((callback) => callback.id === uuid)
              .stopAnimation();
          }
        });
      };
    };

    if (messageType === InfoType.CACAO_HARVESTED) {
      drawInfo(
        "/images/cacao.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.CACAO_CONSUMED) {
      drawInfo(
        "/images/cacao.svg",
        this.props.theme.color.accent.light,
        "-" + amount
      );
    } else if (messageType === InfoType.INCREASE_CACAO_PER_TURN) {
      drawInfo(
        "/images/cacao-per-turn.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.INCREASE_BUILDINGS_PER_TURN) {
      drawInfo(
        "/images/buildings-per-turn.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.INCREASE_ATTACKS_PER_TURN) {
      drawInfo(
        "/images/attacks-per-turn.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.INCREASE_SPY_ATTACKS_PER_TURN) {
      drawInfo(
        "/images/spy-attacks-per-turn.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.INCREASE_FRUIT_ATTACKS_PER_TURN) {
      drawInfo(
        "/images/fruit-attacks-per-turn.svg",
        this.props.theme.color.primary.light,
        "+" + amount
      );
    } else if (messageType === InfoType.BUILDING_READY) {
      drawInfo("/images/buildings-icon.svg", this.props.theme.color.primary.light, "+" + amount, true);
    } else if (messageType === InfoType.SHOT_READY) {
      const images = {
        [AttackType.TRUFFLE]: "truffle-cannon-icon",
        [AttackType.FRUIT]: "fruit-cannon-icon",
        [AttackType.BUNNY]: "easter-bunny-icon",
        [AttackType.HOT_CHOCOLATE]: "ballista-icon",
      };
      drawInfo(`/images/${images[donutType] || images[AttackType.TRUFFLE]}.svg`, this.props.theme.color.primary.light, "+" + amount, true);
    } else if (messageType === InfoType.BUNNY_CAUGHT) {
      drawInfo("/images/bunny-caught.svg");
    } else if (messageType === InfoType.DONUT_TRAP) {
      let donutImage = "/images/stop-donut-icon.svg";
      if (donutType === EntityType.DONUT_PORTAL_BLUE) {
        donutImage = "/images/portal-donut-icon.svg";
      } else if (donutType === EntityType.DONUT_HEALTH_GREEN) {
        donutImage = "/images/health-donut-icon.svg";
      } else if (donutType === EntityType.DONUT_CREAM_WHITE) {
        donutImage = "/images/cream-donut-icon.svg";
      } else if (donutType === EntityType.DONUT_SURPRISE_YELLOW) {
        donutImage = "/images/surprise-donut-icon.svg";
      }
      drawInfo(donutImage, undefined, undefined, true);
    }
  }

  estimateOrthographicSize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    let ratio = width / height;
    let distance = Math.max(7.5 / ratio, 5);

    if (typeof this.props.game !== "undefined") {
      if (this.props.game.board.size.cols === 6) {
        distance = Math.max(4.5 / ratio, 5);
      } else if (this.props.game.board.size.cols === 8) {
        distance = Math.max(6 / ratio, 5);
      }
    }

    // in portrait the tutorial's card lies across the top: the board moves down by half the
    // card, into the middle of the space below it
    const inset = height > width ? this.props.boardTopInset : 0;
    const shift = (inset * distance) / height;
    this.camera.orthoTop = distance + shift;
    this.camera.orthoBottom = -distance + shift;
    this.camera.orthoLeft = -distance * ratio;
    this.camera.orthoRight = distance * ratio;
  }

  resize = () => {
    this.estimateOrthographicSize();
    this.engine.resize();
    this.scene.render();
  };

  clear() {
    this.weaponIndicators.forEach((indicator, id) => this.disposeIndicator(id, indicator));
    const instances = this.scene.meshes.filter((mesh) => mesh.isAnInstance);
    for (const instance of instances) {
      instance.dispose();
    }
    this.playerGameField = null;
    this.opponentGameField = null;
    this.requestRender();
    this.camera.position = new Vector3(30, 30, 30);
    this.lookAtOpponent = undefined;
  }

  highlightCannons = (highlight = true) => {
    const parent = this.scene.getMeshByName(
      EntityType.RUM_TRUFFLE_CANNON + "__root__"
    );
    const children = parent.getChildMeshes(false);
    children.forEach((child) => {
      if (highlight) {
        this.highlightLayer.addMesh(child, new Color3(1, 1, 0));
      } else {
        this.highlightLayer.removeMesh(child);
      }
    });

    this.requestRender();
  };

  detonateAtPosition(row, col, playerField = false) {
    let truffle = MeshBuilder.CreateTorus(
      "knot",
      { diameter: 0.1 },
      this.scene
    );
    truffle.material = this.scene.getMaterialByName(
      BoardCellTypes.BROWN + ".material"
    );
    if (playerField) {
      truffle.position = new Vector3(row, this.heightAbove(0.5), col);
      this.playerGameField.explode(truffle);
    } else {
      truffle.position = new Vector3(
        row - this.opponentGameFieldDistance,
        this.heightAbove(0.5),
        col + this.opponentGameFieldDistance
      );
      this.opponentGameField.explode(truffle);
    }
  }

  getFountain(row, col, board, field) {
    let cellAt = (board, field, row, col) =>
      board.fields[field].grid[row * board.size.cols + col];
    let neighbors = [];
    for (let r = row - 1; r < row + 2; r++) {
      for (let c = col - 1; c < col + 2; c++) {
        if (r >= 0 && c >= 0 && r < board.size.rows && c < board.size.cols) {
          neighbors.push(cellAt(board, field, r, c));
        }
      }
    }
    const cellsWithFountains = neighbors.filter((cell) =>
      cell.occupiedBy
        .map((entity) => entity.type)
        .includes(EntityType.CHOCOLATE_FOUNTAIN)
    );
    if (cellsWithFountains.length > 0) {
      return cellsWithFountains[0].occupiedBy.filter(
        (entity) => entity.type === EntityType.CHOCOLATE_FOUNTAIN
      )[0];
    } else {
      return undefined;
    }
  }

  // the board takes clicks in matches and in the tutorial lesson, not in the demos
  playerFieldClick(row, col, position) {
    if (!this.props.tutorial || this.props.tutorialInteractive) {
      this.realtimePlayerFieldClick(row, col, position);
    }
  }

  opponentFieldClick(row, col, position) {
    if (!this.props.tutorial || this.props.tutorialInteractive) {
      this.realtimeOpponentFieldClick(row, col, position);
    }
  }

  // a height `offset` above the base of the boards (of `cols` columns, the match's by default)
  heightAbove(offset, cols = this.props.game ? this.props.game.board.size.cols : 10) {
    return boardHeight(cols) + offset;
  }

  boardPosition(row, col, ownBoard) {
    return ownBoard
      ? new Vector3(row, 0, col)
      : new Vector3(
          row - this.opponentGameFieldDistance,
          0,
          col + this.opponentGameFieldDistance
        );
  }

  setLookAtOpponent(lookAtOpponent) {
    if (this.lookAtOpponent !== lookAtOpponent) {
      this.lookAtOpponent = lookAtOpponent;
      this.performCameraFlight();
    }
  }

  realtimeUpdate(prevProps) {
    if (this.playerGameField === null) {
      return;
    }
    // the swap button toggles; picking an attack or a building focuses its board every time
    if (prevProps.boardViewToggles !== this.props.boardViewToggles) {
      this.setLookAtOpponent(!this.lookAtOpponent);
    } else if (prevProps.boardFocus.seq !== this.props.boardFocus.seq) {
      this.setLookAtOpponent(this.props.boardFocus.target === "opponent");
    }

    this.opponentGameField.update();
    this.playerGameField.update();
    this.syncWeaponIndicators();
    if (prevProps.game !== this.props.game) {
      this.showProduction(prevProps.game, this.props.game);
    }
    if (prevProps.matchEvents !== this.props.matchEvents) {
      this.playMatchEvents(this.props.matchEvents);
    }
    this.requestRender();
  }

  realtimePlayerFieldClick(row, col, position) {
    const view = this.props.game;
    const { MatchPhase, MatchActionTypes } = engine;
    if (view.phase === MatchPhase.PLACEMENT) {
      submit(MatchActionTypes.placeFactory, { row, col })
        .then(() => Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD))
        .catch(ignoreRuleErrors);
      return;
    }
    const type = this.props.selectedBuilding;
    if (view.phase !== MatchPhase.RUNNING || typeof type === "undefined") {
      return;
    }
    if (isDonut(type)) {
      submit(MatchActionTypes.placeDonut, { donutType: type, row, col })
        .then(() => {
          Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
          if (type === EntityType.DONUT_PORTAL_BLUE) {
            this.props.selectBuilding(EntityType.DONUT_PORTAL_RED);
            this.props.tapBuilding(EntityType.DONUT_PORTAL_RED);
          } else {
            this.props.deselectBuildings();
          }
        })
        .catch(ignoreRuleErrors);
      return;
    }
    const costs = engine.buildCosts(view, view.viewer, type);
    submit(MatchActionTypes.build, { entityType: type, row, col })
      .then(() => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
        if (costs > 0) {
          this.spawnInfo(InfoType.CACAO_CONSUMED, position.clone(), costs);
        }
      })
      .catch(ignoreRuleErrors);
  }

  realtimeOpponentFieldClick(row, col) {
    const view = this.props.game;
    const attackType = this.props.selectedAttack;
    if (view.phase !== engine.MatchPhase.RUNNING || typeof attackType === "undefined") {
      return;
    }
    submit(engine.MatchActionTypes.attack, { attackType, row, col, allowRush: true }).catch((error) => {
      // online the engine's error name travels as ruleName
      const name = (error && (error.ruleName || (error.constructor && error.constructor.name))) || "";
      // nothing to hit there: just nothing happens; no shot available: the button flashes
      if (["WeaponNotReadyError", "NoCacaoLeftError", "NoAttacksLeftError", "StunnedError"].includes(name)) {
        this.props.attackDenied(attackType);
      }
      return ignoreRuleErrors(error);
    });
  }

  // explosions, trap icons and sounds for attacks of both players, driven by match events
  playMatchEvents(events) {
    const view = this.props.game;
    const trapDonuts = {
      "DonutEffect.PORTAL": EntityType.DONUT_PORTAL_BLUE,
      "DonutEffect.GREEN": EntityType.DONUT_HEALTH_GREEN,
      "DonutEffect.WHITE": EntityType.DONUT_CREAM_WHITE,
      "DonutEffect.PINK": EntityType.DONUT_STOP_PINK,
      "DonutEffect.XMAS_TO_BALLISTA": EntityType.DONUT_SURPRISE_YELLOW,
      "DonutEffect.XMAS_TO_FOUNTAIN": EntityType.DONUT_SURPRISE_YELLOW,
    };
    events.forEach((event) => {
      if (event.type === "attack") {
        const mine = event.player === view.viewer;
        const { row, col, attackType, result } = event.data;
        const ownBoard = !mine;
        const position = this.boardPosition(row, col, ownBoard);
        if (attackType === AttackType.BUNNY) {
          if (result.caught) {
            Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
            if (mine) {
              this.spawnInfo(InfoType.BUNNY_CAUGHT, position.clone());
            }
          } else {
            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
          }
          return;
        }
        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
        this.detonateAtPosition(row, col, ownBoard);
        result.traps.forEach((trap) => {
          this.spawnInfo(InfoType.DONUT_TRAP, position.clone(), undefined, trapDonuts[trap]);
        });
        const owner = mine ? 1 - view.viewer : view.viewer;
        if (result.shielded && !result.fountainDestroyed) {
          // the shield took the hit: the cell is coated in chocolate for a moment and the
          // fountain shows what is left of its shield
          this.chocolateFlash(position.clone());
          const fountain = this.visibleFountain(view, owner, row, col);
          if (fountain) {
            this.showEnergyBar(fountain, this.boardPosition(fountain.position.row, fountain.position.col, ownBoard));
          }
          return;
        }
        const cell = view.board.fields[view.players[owner].fieldIndex].grid[row * view.board.size.cols + col];
        const survivor = cell.occupiedBy.find(
          (entity) => entity.type !== EntityType.CREAM && !isDonut(entity.type)
        );
        if (survivor) {
          this.showEnergyBar(survivor, position.clone());
        }
      } else if (event.type === "donutsSpawned") {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        // the tutorial's coach card explains donuts itself
        if (!this.props.tutorial) {
          this.props.showQuickMessage({ text: t(tr.MATCH_NEW_DONUTS), autoHideDuration: 3000 });
        }
      }
    });
  }

  // A donut above every weapon unit, factory and extension that grows while it reloads or
  // produces the next building slot. Its glaze shows the state: plain while charging, blue
  // when the weapon can fire early, green when the shot is free or the building storage is
  // full. It hops when it gets ready. A fruit cannon shows one donut per weapon.
  syncWeaponIndicators() {
    const view = this.props.game;
    if (typeof view === "undefined" || this.playerGameField === null || view.phase !== engine.MatchPhase.RUNNING) {
      return;
    }
    const grid = view.board.fields[view.players[view.viewer].fieldIndex].grid;
    const present = new Set();
    const height = this.heightAbove(ENERGY_BAR, view.board.size.cols);
    const producers = [EntityType.FACTORY, EntityType.FACTORY_EXTENSION];
    grid.forEach((cell) =>
      cell.occupiedBy
        .filter((entity) => Array.isArray(entity.weapons) || producers.includes(entity.type))
        .forEach((entity) => {
          present.add(entity.id);
          const donuts = Array.isArray(entity.weapons) ? Math.min(2, entity.weapons.length) : 1;
          let indicator = this.weaponIndicators.get(entity.id);
          if (indicator && indicator.donuts !== donuts) {
            this.disposeIndicator(entity.id, indicator);
            indicator = undefined;
          }
          if (!indicator) {
            const size = 0.8;
            const mesh = MeshBuilder.CreatePlane(
              "weapon.indicator." + entity.id,
              { width: size * donuts, height: size },
              this.scene
            );
            const texture = new DynamicTexture(
              "weapon.indicator.texture." + entity.id,
              { width: 128 * donuts, height: 128 },
              this.scene,
              true
            );
            texture.hasAlpha = true;
            const material = new StandardMaterial("weapon.indicator.material." + entity.id, this.scene);
            material.diffuseTexture = texture;
            material.emissiveTexture = texture;
            material.useAlphaFromDiffuseTexture = true;
            material.disableLighting = true;
            material.backFaceCulling = false;
            mesh.material = material;
            mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
            mesh.isPickable = false;
            // drawn after the boards, so trees and buildings never cover it
            mesh.renderingGroupId = 1;
            indicator = { mesh, material, texture, donuts, key: undefined, states: [], progress: [] };
            this.weaponIndicators.set(entity.id, indicator);
          }
          indicator.entity = entity;
          // the factory models are taller than the cannons
          const lift = producers.includes(entity.type) ? 0.35 : 0;
          indicator.mesh.position = new Vector3(cell.row, height - 0.3 + lift, cell.col);
        })
    );
    this.weaponIndicators.forEach((indicator, id) => {
      if (!present.has(id)) {
        this.disposeIndicator(id, indicator);
      }
    });
    this.updateWeaponIndicators(false);
  }

  disposeIndicator(id, indicator) {
    indicator.mesh.dispose();
    indicator.texture.dispose();
    indicator.material.dispose();
    this.weaponIndicators.delete(id);
  }

  // progress and state of each donut of an indicator
  indicatorDonuts(view, entity, now) {
    if (Array.isArray(entity.weapons)) {
      return entity.weapons.slice(0, 2).map((weapon) => {
        const status = engine.weaponStatus(view, weapon, now);
        return { progress: status.progress, state: status.state };
      });
    }
    const me = view.players[view.viewer];
    if (me.buildTokens >= engine.buildCapacity(view, view.viewer)) {
      return [{ progress: 1, state: "ready" }];
    }
    const intervalMs = engine.generatorStats(view, view.viewer, entity).intervalMs;
    const progress = typeof entity.buildAt === "number" ? 1 - (entity.buildAt - now) / intervalMs : 0;
    return [{ progress: Math.max(0, Math.min(1, progress)), state: "charging" }];
  }

  // A donut step as a 112 px bitmap, tinted for its state ("grey" is the whole donut greyed
  // out): rasterised once per step and state, not on every redraw.
  donutBitmap(step, state) {
    const key = `${step}:${state}`;
    if (this.donutBitmaps.has(key)) {
      return this.donutBitmaps.get(key);
    }
    const image = this.donutImages[step - 1];
    if (!image || !image.complete || image.naturalWidth === 0) {
      return undefined;
    }
    const tints = {
      grey: "rgba(118, 112, 108, 0.88)",
      ready: "rgba(144, 208, 27, 0.55)",
      rushable: "rgba(49, 144, 195, 0.6)",
    };
    const bitmap = document.createElement("canvas");
    bitmap.width = 112;
    bitmap.height = 112;
    const context = bitmap.getContext("2d");
    context.drawImage(image, 0, 0, 112, 112);
    if (tints[state]) {
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = tints[state];
      context.fillRect(0, 0, 112, 112);
    }
    this.donutBitmaps.set(key, bitmap);
    return bitmap;
  }

  drawDonuts(texture, donuts) {
    const context = texture.getContext();
    context.clearRect(0, 0, 128 * donuts.length, 128);
    donuts.forEach(({ progress, state }, index) => {
      const step = progress <= 0 ? 0 : Math.max(1, Math.min(10, Math.round(progress * 10)));
      const x = index * 128 + 8;
      // a grey whole donut shows how much is still missing
      const grey = this.donutBitmap(10, "grey");
      if (grey) {
        context.globalAlpha = 0.92;
        context.drawImage(grey, x, 8);
        context.globalAlpha = 1;
      }
      const piece = step > 0 ? this.donutBitmap(step, state) : undefined;
      if (piece) {
        context.drawImage(piece, x, 8);
      }
    });
    texture.update();
  }

  // floating +cacao over every producer that just harvested, +1 building over a factory or
  // extension that just added a building slot (only when the storage was not full)
  showProduction(before, view) {
    if (!before || !view || before.phase !== engine.MatchPhase.RUNNING || view.phase !== engine.MatchPhase.RUNNING) {
      return;
    }
    const viewer = view.viewer;
    const entitiesById = (match) => {
      const grid = match.board.fields[match.players[viewer].fieldIndex].grid;
      const entities = new Map();
      grid.forEach((cell) => cell.occupiedBy.forEach((entity) => entities.set(entity.id, entity)));
      return entities;
    };
    const previous = entitiesById(before);
    let newSlots = Math.max(0, view.players[viewer].buildTokens - before.players[viewer].buildTokens);
    entitiesById(view).forEach((entity, id) => {
      const old = previous.get(id);
      if (!old) {
        return;
      }
      if (typeof entity.cacaoAt === "number" && typeof old.cacaoAt === "number" && entity.cacaoAt > old.cacaoAt) {
        const amount = engine.producerStats(view, viewer, entity).amount;
        this.spawnInfo(InfoType.CACAO_HARVESTED, entity.position, amount);
      }
      if (newSlots > 0 && typeof entity.buildAt === "number" && typeof old.buildAt === "number" && entity.buildAt > old.buildAt) {
        newSlots -= 1;
        // a little to the side, the factory may have harvested cacao at the same moment
        this.spawnInfo(InfoType.BUILDING_READY, { row: entity.position.row + 0.6, col: entity.position.col - 0.6 }, 1);
      }
    });
  }

  // a visible fountain of `owner` whose 3x3 shield covers the cell, if any
  visibleFountain(view, owner, row, col) {
    const grid = view.board.fields[view.players[owner].fieldIndex].grid;
    const { rows, cols } = view.board.size;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && c >= 0 && r < rows && c < cols) {
          const fountain = grid[r * cols + c].occupiedBy.find((entity) => entity.type === EntityType.CHOCOLATE_FOUNTAIN);
          if (fountain) {
            return fountain;
          }
        }
      }
    }
    return undefined;
  }

  // a brown chocolate dome over a cell that fades out: the shield absorbed the shot
  chocolateFlash(position) {
    const size = this.props.game ? this.props.game.board.size.cols : 10;
    const top = size === 6 ? 4.6 : size === 8 ? 5.1 : 5.6;
    const dome = MeshBuilder.CreateSphere("chocolate.flash." + Date.now(), { diameter: 1.05, segments: 16 }, this.scene);
    dome.scaling = new Vector3(1, 0.75, 1);
    dome.position = new Vector3(position.x, top, position.z);
    dome.isPickable = false;
    dome.renderingGroupId = 1;
    const material = new StandardMaterial("chocolate.flash.material." + Date.now(), this.scene);
    material.diffuseColor = Color3.FromHexString("#5A2E16");
    material.emissiveColor = Color3.FromHexString("#3E1E0E");
    material.specularColor = new Color3(0.4, 0.3, 0.25);
    material.alpha = 0.85;
    dome.material = material;
    const fade = new Animation("chocolate.flash.fade", "alpha", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    fade.setKeys([
      { frame: 0, value: 0.85 },
      { frame: 30, value: 0.75 },
      { frame: 60, value: 0 },
    ]);
    this.setRenderLoop(true);
    this.scene.beginDirectAnimation(material, [fade], 0, 60, false, 1, () => {
      dome.dispose();
      material.dispose();
      this.setRenderLoop(false);
    });
  }

  // a short hop when a donut becomes ready
  hopIndicator(indicator) {
    const hop = new Animation("weapon.indicator.hop", "scaling", 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    hop.setKeys([
      { frame: 0, value: new Vector3(1, 1, 1) },
      { frame: 7, value: new Vector3(1.4, 1.4, 1.4) },
      { frame: 14, value: new Vector3(0.9, 0.9, 0.9) },
      { frame: 20, value: new Vector3(1, 1, 1) },
    ]);
    this.setRenderLoop(true);
    this.scene.beginDirectAnimation(indicator.mesh, [hop], 0, 20, false, 1, () => this.setRenderLoop(false));
  }

  updateWeaponIndicators(render = true) {
    if (typeof this.props.game === "undefined" || typeof matchSession.host === "undefined" || this.weaponIndicators.size === 0) {
      return;
    }
    const view = this.props.game;
    const now = matchSession.host.now();
    const loaded = this.donutImages.filter((image) => image.complete).length;
    let changed = false;
    this.weaponIndicators.forEach((indicator) => {
      const donuts = this.indicatorDonuts(view, indicator.entity, now);
      // redraw only when a donut grew a piece or changed its glaze
      const key = `${loaded}:` + donuts.map((donut) => `${donut.state}:${Math.round(donut.progress * 10)}`).join("|");
      if (key !== indicator.key) {
        const becameReady = donuts.some((donut, index) => donut.state === "ready" && indicator.states[index] && indicator.states[index] !== "ready");
        indicator.previousStates = indicator.states;
        // a factory that just produced a building slot starts a new donut
        const slotArrived = donuts.some((donut, index) => (indicator.progress[index] || 0) > 0.8 && donut.progress < 0.2);
        indicator.key = key;
        indicator.states = donuts.map((donut) => donut.state);
        indicator.progress = donuts.map((donut) => donut.progress);
        this.drawDonuts(indicator.texture, donuts);
        if (becameReady || slotArrived) {
          this.hopIndicator(indicator);
        }
        if (becameReady && Array.isArray(indicator.entity.weapons)) {
          donuts.forEach((donut, index) => {
            if (donut.state === "ready" && indicator.previousStates[index] && indicator.previousStates[index] !== "ready") {
              const attackType = indicator.entity.weapons[index].attackType;
              this.spawnInfo(InfoType.SHOT_READY, indicator.entity.position, 1, attackType);
            }
          });
        }
        changed = true;
      }
    });
    if (changed && render) {
      this.requestRender();
    }
  }

  setRenderLoop(run = true) {
    if (run) {
      if (this.renderLoopRepetitions === 0) {
        this.engine.runRenderLoop(this.animate);
      }
      this.renderLoopRepetitions += 1;
    } else if (!run) {
      this.renderLoopRepetitions -= 1;
      if (this.renderLoopRepetitions === 0) {
        this.engine.stopRenderLoop(this.animate);
      }
    }
  }

  performCameraFlight = () => {
    this.setRenderLoop();
    let target = new Vector3(30, 30, 30);
    if (this.lookAtOpponent) {
      target = new Vector3(6, 18, 30);
    }
    let flight = new Animation(
      "animCam",
      "position",
      30,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    let keyframes = [
      { frame: 0, value: this.camera.position },
      { frame: 30, value: target },
    ];
    flight.setKeys(keyframes);
    this.scene.beginDirectAnimation(
      this.camera,
      [flight],
      0,
      60,
      false,
      1,
      () => this.setRenderLoop(false)
    );
  };

  startGame = (game) => {
    // the viewer's board is in front, the opponent's behind it; the player switches freely
    const playerFieldIndex = game.players[game.viewer].fieldIndex;
    const opponentFieldIndex = game.players[1 - game.viewer].fieldIndex;
    this.lookAtOpponent = false;
    this.camera.position = new Vector3(30, 30, 30);

    const gamefieldHeight = boardHeight(game.board.size.cols);

    this.playerGameField = new Gamefield(
      true,
      new Vector3(0, gamefieldHeight, 0),
      () => this.props.game.board.fields[playerFieldIndex],
      playerFieldIndex,
      game.board.size,
      this.scene,
      (row, col, eventX, eventY) =>
        this.playerFieldClick(row, col, eventX, eventY),
      (run) => this.setRenderLoop(run),
      this.requestRender
    );
    this.opponentGameField = new Gamefield(
      false,
      new Vector3(
        -this.opponentGameFieldDistance,
        gamefieldHeight,
        this.opponentGameFieldDistance
      ),
      () => this.props.game.board.fields[opponentFieldIndex],
      opponentFieldIndex,
      game.board.size,
      this.scene,
      (row, col, eventX, eventY) =>
        this.opponentFieldClick(row, col, eventX, eventY),
      (run) => this.setRenderLoop(run),
      this.requestRender
    );

    this.resize();
    // new instances only show up once their materials are compiled; render again then,
    // because a real-time match has no camera flight that would keep rendering
    this.scene.executeWhenReady(() => this.scene.render());
  };

  render() {
    return (
      <div>
        {this.props.assetsReady ? null : (
          <AssetLoadingView customRef={this.loadingView} />
        )}
        <canvas
          className="gameCanvas"
          ref={(container) => {
            this.container = container;
          }}
        />
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  game: selectActiveGame(state),
  tutorialInteractive: state.ui.tutorialInteractive,
  matchEvents: state.match.events,
  boardViewToggles: state.ui.boardViewToggles,
  selectedBuilding: state.ui.selectedBuilding,
  selectedAttack: state.ui.selectedAttack,
  assetsReady: state.ui.assetsReady,
  tutorial: state.ui.tutorial,
  boardFocus: state.ui.boardFocus,
  boardTopInset: state.ui.boardTopInset,
});

const mapDispatchToProps = {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
};

const SceneContainer = connect(mapStateToProps, mapDispatchToProps)(Scene);

export default withTheme(SceneContainer);
