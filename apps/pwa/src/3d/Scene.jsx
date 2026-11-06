import React, { Component, createRef } from "react";
import { connect } from "react-redux";
import {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
  toggleBoardView,
  loadUiState,
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
  FlyCamera,
  Color3,
  Camera,
  Vector3,
  Color4,
  Animation,
  MeshBuilder,
  Viewport,
} from "./babylon";
import { AssetLoadingViewContainer as AssetLoadingView } from "../AssetLoader";
import logger from "../helper/logger";
import { v4 as uuidv4 } from "uuid";
import { withTheme } from "react-jss";
import { measureEdges } from "../helper/edges";
import { showCannonPick, cannonCells, fruitCannonPossible } from "./cannonPick.js";
import {
  fitView,
  orthoBounds,
  clampView,
  zoomAbout,
  panBy,
  lerpView,
  sameView,
  swipeBy,
  swipeGoesOn,
  attachGestures,
} from "./boardView.js";
import { exposeSceneForTests } from "../testHooks";
import Fab from "../ui/controls/Fab";
import TapPointer from "../ui/controls/TapPointer";

// the tutorial's hand on a field: its fingertip this high above the field (the top of the
// chocolate piece), and its size, in fields, within reason on a small or a big screen (px)
const POINTER_HEIGHT = 0.3;
const POINTER_SIZE = { fields: 2, min: 56, max: 180 };

// The camera's place for the own board, and how far it moves to look at the opponent's (the
// boards lie 12 apart in x and z: on the screen the other one is beside, just out of view)
const CAMERA_HOME = new Vector3(30, 30, 30);
const CAMERA_FLIGHT = new Vector3(-24, -12, 0);

// The camera looks at the origin and a board's cells start at its position, its middle
// (cols - 1) / 2 further in: lifted by that, a board is centred on the screen. The 6×6 board
// is; the 10×10 one, which nearly fills a landscape screen, sits half a unit higher, clear of
// the build palette; the 8×8 one in between.
const boardHeight = (cols) => (cols - 1) / 2 + (cols - 6) / 8;
// the energy bars float this high above the base of the boards
const ENERGY_BAR = 1.5;
// the progress donut's glaze by the cannon's state: pistachio when a shot is ready, blueberry
// when one can be rushed (the weapon palette's colours, mixed with 25 % white: the full colours
// were too dark for a glaze, the user's pick from screenshots/progress-donut/glaze-colours.png)
const GLAZE_COLORS = { ready: [172, 220, 84], rushable: [101, 172, 210] };
// the preview of the other board: its frame's border (px) and what is behind its board
const PREVIEW_BORDER = 4;
const PREVIEW_BACKGROUND = Color4.FromHexString("#7FC3E0FF");

class Scene extends Component {
  constructor(props) {
    super(props);
    this.loadingView = createRef();
    // the preview of the other board: where it is on the screen and which board it shows
    // and whether the board in view is zoomed in (the whole-board button shows then)
    this.state = { preview: null, cannonSpots: null, zoomed: false, pointer: null };
    // the tutorial's hand: the field it stands on and the observer that keeps it there
    this.pointerKey = "";
    this.pointerObserver = null;
    // the floating infos (+cacao, +1 shot, ...) on their way up
    this.infoPops = new Set();
    // the boards' views (src/3d/boardView.js): zoom 1 and the whole board, each remembers where
    // the player left it; and a view on its way to the whole board
    this.views = { own: fitView(), opponent: fitView() };
    this.viewTransition = null;
    // where the camera is between the boards (0 the own, 1 the opponent's), its flight from
    // one to the other, and a finger dragging it there (src/3d/boardView.js, swipeBy)
    this.between = 0;
    this.flight = null;
    this.swipe = null;
  }

  componentDidMount() {
    this.props.onRef(this);
    exposeSceneForTests(this);
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
    // The pointer is ours, not Babylon's (its input manager picked on every pointer down): a tap
    // picks a cell of a board (the meshes of a Gamefield carry their cell in metadata), a drag
    // moves the view or pulls the other board in, two fingers or the wheel zoom
    // (src/3d/boardView.js).
    this.scene.detachControl();
    this.detachGestures = attachGestures(this.container, {
      onTap: this.tapBoard,
      onPan: this.dragBoard,
      onPanEnd: this.endSwipe,
      onPinch: (factor, x, y) => this.zoomBy(factor, x, y),
      onWheel: (deltaY, x, y, pinch) => this.zoomBy(Math.exp(-deltaY * (pinch ? 0.01 : 0.0015)), x, y),
      enabled: () => this.zoomEnabled(),
    });
    window.addEventListener("keydown", this.keyDown);
    this.scene.onBeforeRenderObservable.add(() => {
      if (this.flight) {
        this.applyBetween(this.flight.from + (this.flight.to - this.flight.from) * this.flight.t);
      } else if (this.viewTransition) {
        this.applyView(lerpView(this.viewTransition.from, this.viewTransition.to, this.viewTransition.t));
      }
    });
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
    window.removeEventListener("keydown", this.keyDown);
    if (this.detachGestures) {
      this.detachGestures();
    }
    clearInterval(this.weaponIndicatorInterval);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.boardTopInset !== this.props.boardTopInset) {
      this.resize();
    }
    if (typeof this.props.game !== "undefined") {
      this.realtimeUpdate(prevProps);
    }
    // the end screen: what still floats up goes
    if (this.matchEnded() && !(prevProps.game && prevProps.game.phase === engine.MatchPhase.ENDED)) {
      this.stopInfos();
    }
    this.updateCannonPick();
    this.updateTutorialPointer();
  }

  spawnInfo(messageType, position, amount, donutType) {
    // the floating infos belong to a running match: none once the end screen shows
    if (this.matchEnded()) {
      return;
    }
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

    // until its picture has loaded the info is only a mesh; stopInfos() removes it either way
    const pop = {
      stop: () => {
        info.dispose();
        texture.dispose();
        material.dispose();
        this.infoPops.delete(pop);
      },
    };
    this.infoPops.add(pop);

    const drawInfo = (filename, color, text, plain = false) => {
      const image = new Image();
      image.src = filename;
      image.onload = () => {
        if (!this.infoPops.has(pop)) {
          return;
        }
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
            this.infoPops.delete(pop);
          },
        });
        pop.stop = () => {
          this.scene.stopAnimation(info);
          const running = this.animations.find((callback) => callback.id === uuid);
          if (running) {
            running.stopAnimation();
          }
        };
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

  // How the camera fits a whole board on the screen: half the height of its window in world
  // units, the screen's ratio and the window's lift (src/3d/boardView.js reckons with it).
  boardFit() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const ratio = width / height;
    const cols = typeof this.props.game !== "undefined" ? this.props.game.board.size.cols : 10;
    // the 10×10 board fills a landscape screen: a little further away, and the window a little
    // higher, so that its back corner (with a tall building) stays under the match time and
    // its front corner above the palette (seen cut on 844×390 and 1280×720, 2026-11-03)
    let distance = Math.max(7.5 / ratio, 5.8);
    let lift = ratio > 1 ? 0.7 : 0;
    if (cols === 6) {
      distance = Math.max(4.5 / ratio, 5);
      lift = 0;
    } else if (cols === 8) {
      distance = Math.max(6 / ratio, 5);
      lift = 0;
    }

    // in portrait the tutorial's card lies across the top: the board moves down by half the
    // card, into the middle of the space below it
    const inset = height > width ? this.props.boardTopInset : 0;
    const shift = (inset * distance) / height + lift;
    return { distance, ratio, shift };
  }

  estimateOrthographicSize() {
    this.applyView(this.currentView());
  }

  // the view of the board in front: the own one before the match
  boardView() {
    return this.lookAtOpponent ? this.views.opponent : this.views.own;
  }

  // the view as it shows right now: between the boards, a mix of both views
  currentView() {
    if (this.viewTransition) {
      return lerpView(this.viewTransition.from, this.viewTransition.to, this.viewTransition.t);
    }
    return lerpView(this.views.own, this.views.opponent, this.between);
  }

  // the camera on its way between the boards (0 the own, 1 the opponent's): its place and the
  // view that goes with it
  applyBetween(between) {
    this.between = between;
    this.camera.position = CAMERA_HOME.add(CAMERA_FLIGHT.scale(between));
    this.applyView(this.currentView());
  }

  // the other board's offset on the screen in world units, negative when it lies to the left
  // (the flight's part across the camera's view)
  sideways() {
    return Vector3.TransformNormal(CAMERA_FLIGHT, this.camera.getViewMatrix()).x;
  }

  setBoardView(view) {
    if (this.lookAtOpponent) {
      this.views.opponent = view;
    } else {
      this.views.own = view;
    }
  }

  // the camera's window for a view (clamped to the fitted window) and a frame soon
  applyView(view) {
    const fit = this.boardFit();
    const bounds = orthoBounds(fit, clampView(fit, view));
    this.camera.orthoLeft = bounds.left;
    this.camera.orthoRight = bounds.right;
    this.camera.orthoTop = bounds.top;
    this.camera.orthoBottom = bounds.bottom;
    // the whole-board button comes with the first bit of zoom and goes with the last; the
    // preview then shows the board in view with the part of it on the screen (showPreview)
    const zoomed = view.zoom > 1.01;
    if (zoomed !== this.state.zoomed) {
      this.setState({ zoomed }, () => this.state.preview && this.showPreview());
    } else if (zoomed && this.state.preview) {
      this.updateMinimap(bounds);
    }
    // (the first call comes while the scene is being made, before requestRender exists)
    if (this.requestRender) {
      this.requestRender();
    }
  }

  // The part of the board on the screen, as a rectangle in the preview (fractions of its
  // inside): both cameras look the same way, so the camera's window only has to be moved by
  // where the preview's target lies in the camera's view.
  minimapRect(bounds) {
    const camera = this.previewCamera;
    if (!camera || !this.previewTarget) {
      return null;
    }
    const target = Vector3.TransformCoordinates(this.previewTarget, this.camera.getViewMatrix());
    const width = camera.orthoRight - camera.orthoLeft;
    const height = camera.orthoTop - camera.orthoBottom;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const left = clamp((bounds.left - target.x - camera.orthoLeft) / width);
    const right = clamp((bounds.right - target.x - camera.orthoLeft) / width);
    const top = clamp((target.y + camera.orthoTop - bounds.top) / height);
    const bottom = clamp((target.y + camera.orthoTop - bounds.bottom) / height);
    const round = (value) => Math.round(value * 1000) / 1000;
    return { left: round(left), top: round(top), width: round(right - left), height: round(bottom - top) };
  }

  updateMinimap(bounds) {
    const minimap = this.minimapRect(bounds);
    const current = this.state.preview && this.state.preview.minimap;
    if (minimap && (!current || ["left", "top", "width", "height"].some((key) => current[key] !== minimap[key]))) {
      this.setState({ preview: { ...this.state.preview, minimap } });
    }
  }

  // zooming and moving: in a match and in the tutorial's lesson (not in the building demos,
  // they keep the whole board), not while the camera flies
  zoomEnabled() {
    return (
      this.playerGameField !== null &&
      (!this.props.tutorial || this.props.tutorialInteractive) &&
      !this.viewTransition &&
      !this.flight
    );
  }

  // `change(fit, view)` gives the new view of the board in front
  changeView(change) {
    if (!this.zoomEnabled() || this.swipe) {
      return;
    }
    const fit = this.boardFit();
    const view = clampView(fit, change(fit, this.boardView()));
    this.setBoardView(view);
    this.applyView(view);
  }

  zoomBy(factor, x, y) {
    this.changeView((fit, view) =>
      zoomAbout(fit, view, factor, x / this.container.clientWidth, y / this.container.clientHeight)
    );
  }

  // the whole board again (the button under the preview, the 0 key)
  fitBoard = () => {
    if (!this.zoomEnabled() || this.swipe) {
      return;
    }
    const view = this.boardView();
    this.setBoardView(fitView());
    this.animateView(view, fitView(), 8);
  };

  // A drag: the view moves with the finger; what it cannot take sideways, at the edge of the
  // board or with the whole board in view, pulls the other board in. Once that began, the
  // finger scrubs the camera between the boards until it goes back where it started.
  dragBoard = (dx, dy) => {
    if (!this.zoomEnabled()) {
      return;
    }
    if (this.swipe) {
      this.moveSwipe(dx);
      return;
    }
    const fit = this.boardFit();
    const before = this.boardView();
    const width = this.container.clientWidth;
    const after = panBy(fit, before, dx, dy, width, this.container.clientHeight);
    this.setBoardView(after);
    this.applyView(after);
    const bounds = orthoBounds(fit, before);
    const taken = ((before.x - after.x) * width) / (bounds.right - bounds.left);
    const leftover = dx - taken;
    if (Math.abs(leftover) > 0.5) {
      this.moveSwipe(leftover);
    }
  };

  moveSwipe(dx) {
    const bounds = orthoBounds(this.boardFit(), this.currentView());
    const perPixel = (bounds.right - bounds.left) / this.container.clientWidth;
    const between = swipeBy(this.between, dx, perPixel, this.sideways());
    const start = this.lookAtOpponent ? 1 : 0;
    const now = performance.now();
    if (!this.swipe) {
      if (between === start) {
        return;
      }
      this.swipe = { start, speed: 0, time: now };
    } else {
      // the speed of the last moves toward the other board (pixels a millisecond), for a flick
      const dt = Math.max(1, now - this.swipe.time);
      const pixels = ((between - this.between) * (start === 0 ? 1 : -1) * Math.abs(this.sideways())) / perPixel;
      this.swipe.speed = 0.6 * this.swipe.speed + (0.4 * pixels) / dt;
      this.swipe.time = now;
    }
    this.applyBetween(between);
    if (between === start) {
      this.swipe = null;
    }
  }

  // the finger is off: on to the other board, or back
  endSwipe = () => {
    if (!this.swipe) {
      return;
    }
    const { start, speed } = this.swipe;
    this.swipe = null;
    if (swipeGoesOn(start, this.between, speed)) {
      // the HUD's toggle, as the preview button: the flight follows (realtimeUpdate)
      this.props.toggleBoardView();
    } else {
      this.animateBetween(start);
    }
  };

  // the camera flies between the boards, over `frames` (at 30 a second) for the whole way
  animateBetween(to, frames = 30) {
    if (this.viewTransition) {
      this.scene.stopAnimation(this.viewTransition);
      this.viewTransition = null;
    }
    const from = this.between;
    if (from === to) {
      this.applyBetween(to);
      return;
    }
    // part of the way (after a swipe) takes its share of the time, a short hop at least
    const length = Math.max(6, Math.round(frames * Math.abs(to - from)));
    this.flight = { from, to, t: 0 };
    const glide = new Animation("cameraFlight", "t", 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    glide.setKeys([
      { frame: 0, value: 0 },
      { frame: length, value: 1 },
    ]);
    this.setRenderLoop();
    this.scene.beginDirectAnimation(this.flight, [glide], 0, length, false, 1, () => {
      this.flight = null;
      this.applyBetween(to);
      this.setRenderLoop(false);
    });
  }

  // the view glides from one to another over `frames` (at 30 a second)
  animateView(from, to, frames) {
    if (sameView(from, to)) {
      this.applyView(to);
      return;
    }
    this.viewTransition = { from, to, t: 0 };
    const glide = new Animation("boardView", "t", 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
    glide.setKeys([
      { frame: 0, value: 0 },
      { frame: frames, value: 1 },
    ]);
    this.setRenderLoop();
    this.scene.beginDirectAnimation(this.viewTransition, [glide], 0, frames, false, 1, () => {
      this.viewTransition = null;
      this.applyView(to);
      this.setRenderLoop(false);
    });
  }

  keyDown = (event) => {
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    if (event.key === "+" || event.key === "=") {
      this.zoomBy(1.25, this.container.clientWidth / 2, this.container.clientHeight / 2);
    } else if (event.key === "-") {
      this.zoomBy(0.8, this.container.clientWidth / 2, this.container.clientHeight / 2);
    } else if (event.key === "0") {
      this.fitBoard();
    }
  };

  // a tap on a cell of a board: the board's action (build, aim, place the factory)
  tapBoard = (x, y) => {
    if (!this.scene || this.scene.isDisposed) {
      return;
    }
    const pick = this.scene.pick(
      x,
      y,
      (mesh) =>
        mesh.isPickable && mesh.isVisible && mesh.isEnabled() && Boolean(mesh.metadata && mesh.metadata.gamefield),
      false,
      this.camera
    );
    if (pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata) {
      const { gamefield, row, col } = pick.pickedMesh.metadata;
      gamefield.action(row, col, pick.pickedMesh.position);
    }
  };

  resize = () => {
    this.estimateOrthographicSize();
    this.engine.resize();
    if (this.state.preview) {
      this.showPreview();
    }
    this.scene.render();
  };

  // The preview of the board not in view, at the top left beside the menu button (a corner the
  // isometric boards leave free): a second camera renders it into its own part of the canvas,
  // and tapping it switches the boards. Not in the tutorial.
  previewRect() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const ratio = width / height;
    // the screen's edges and the menu button's size, as the HUD has them (src/index.css)
    const { top, left, fab, gap } = measureEdges();
    // (the edges, fab and gap place the whole-board button too, renderFitButton)
    const edges = { edgeLeft: left, edgeTop: top, fab, gap };
    if (ratio < 1) {
      // portrait: under the menu button, clear of the match time at the top middle; it takes
      // the row below the buttons (underButtons: the match's messages go below it)
      const side = 0.4 * width;
      return { left: Math.round(left), top: Math.round(top + fab + gap), width: Math.round(side), height: Math.round(side * 0.6), underButtons: true, ...edges };
    }
    // landscape: beside the menu button; on a phone held sideways no higher than a fifth of the
    // screen, the board comes close to the corner there
    const side = Math.min(Math.max(0.2 * width, 180), 340, (0.22 * height) / 0.6);
    return { left: Math.round(left + fab + gap), top: Math.round(top), width: Math.round(side), height: Math.round(side * 0.6), underButtons: false, ...edges };
  }

  showPreview() {
    const game = this.props.game;
    if (typeof game === "undefined" || this.props.tutorial || this.playerGameField === null) {
      this.hidePreview();
      return;
    }
    if (!this.previewCamera) {
      this.previewCamera = new FlyCamera("preview", new Vector3(30, 30, 30), this.scene);
      this.previewCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      this.previewCamera.minZ = 0;
      this.previewCamera.maxZ = 200;
      // its own background: the board in it never mixes with the big one behind
      this.scene.onBeforeCameraRenderObservable.add((camera) => {
        if (camera === this.previewCamera && this.previewPixels) {
          const { x, y, width, height } = this.previewPixels;
          this.engine.enableScissor(x, y, width, height);
          this.engine.clear(PREVIEW_BACKGROUND, true, true, true);
          this.engine.disableScissor();
        }
      });
    }
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const rect = this.previewRect();
    // inside the frame's border, which covers the edge of what the camera clears
    const inner = {
      left: rect.left + PREVIEW_BORDER,
      top: rect.top + PREVIEW_BORDER,
      width: rect.width - 2 * PREVIEW_BORDER,
      height: rect.height - 2 * PREVIEW_BORDER,
    };
    const camera = this.previewCamera;
    // viewport and scissor count from the bottom left
    camera.viewport = new Viewport(inner.left / width, 1 - (inner.top + inner.height) / height, inner.width / width, inner.height / height);
    const scale = this.engine.getRenderWidth() / width;
    this.previewPixels = {
      x: Math.round(inner.left * scale),
      y: Math.round((height - inner.top - inner.height) * scale),
      width: Math.round(inner.width * scale),
      height: Math.round(inner.height * scale),
    };
    // the whole board that is not in view, seen like the big one; zoomed in, the board in view
    // instead, with the part of it on the screen marked (a minimap)
    const cols = game.board.size.cols;
    const middle = (cols - 1) / 2;
    const zoomed = Boolean(this.state.zoomed);
    const own = zoomed ? !this.lookAtOpponent : Boolean(this.lookAtOpponent);
    const away = own ? 0 : this.opponentGameFieldDistance;
    const target = new Vector3(middle - away, boardHeight(cols) + 0.5, middle + away);
    this.previewTarget = target;
    camera.position = target.add(new Vector3(1, 1, 1).normalize().scale(40));
    camera.setTarget(target);
    const aspect = inner.width / inner.height;
    // on the screen a board is 0.82 · cols high (with what stands on it a bit more) and
    // 1.41 · cols wide
    const half = Math.max((0.82 * cols + 2) / 2, (0.71 * cols + 0.3) / aspect);
    camera.orthoTop = half;
    camera.orthoBottom = -half;
    camera.orthoLeft = -half * aspect;
    camera.orthoRight = half * aspect;
    this.scene.activeCameras = [this.camera, camera];
    this.scene.cameraToUseForPointers = this.camera;
    const minimap = zoomed
      ? this.minimapRect({
          left: this.camera.orthoLeft,
          right: this.camera.orthoRight,
          top: this.camera.orthoTop,
          bottom: this.camera.orthoBottom,
        })
      : null;
    const preview = { ...rect, own, minimap };
    const current = this.state.preview;
    if (
      !current ||
      ["left", "top", "width", "height", "own"].some((key) => current[key] !== preview[key]) ||
      JSON.stringify(current.minimap) !== JSON.stringify(minimap)
    ) {
      this.setState({ preview });
    }
    // in portrait the preview takes the row below the buttons: the HUD puts the match's
    // messages below it (MatchBanner); held sideways it stands beside the buttons, the row is free
    const previewBottom = rect.underButtons ? rect.top + rect.height : null;
    const currentBottom = current && current.underButtons ? current.top + current.height : null;
    if (!current || currentBottom !== previewBottom) {
      this.props.loadUiState({ previewBottom });
    }
    this.requestRender();
  }

  hidePreview() {
    if (this.scene && this.scene.activeCameras && this.scene.activeCameras.length > 0) {
      this.scene.activeCameras = [];
      this.scene.activeCamera = this.camera;
    }
    if (this.state.preview) {
      this.setState({ preview: null });
      this.props.loadUiState({ previewBottom: null });
    }
  }

  clear() {
    this.hidePreview();
    this.stopInfos();
    if (this.hideCannonPick) {
      this.hideCannonPick();
      this.hideCannonPick = null;
    }
    this.cannonPickKey = "";
    this.pointerKey = "";
    this.hideTutorialPointer();
    this.weaponIndicators.forEach((indicator, id) => this.disposeIndicator(id, indicator));
    const instances = this.scene.meshes.filter((mesh) => mesh.isAnInstance);
    for (const instance of instances) {
      instance.dispose();
    }
    this.playerGameField = null;
    this.opponentGameField = null;
    this.requestRender();
    this.lookAtOpponent = undefined;
    this.resetCamera();
  }

  // While a fruit cannon is selected, the own truffle cannons it can replace stand out
  // (src/3d/cannonPick.js); they follow the board when a cannon comes or goes meanwhile.
  updateCannonPick() {
    const view = this.props.game;
    const active =
      typeof view !== "undefined" &&
      this.playerGameField !== null &&
      this.props.selectedBuilding === EntityType.FRUIT_CANNON &&
      fruitCannonPossible(view);
    const cells = active ? cannonCells(view) : [];
    const key = cells.map(({ row, col }) => `${row}.${col}`).join(",");
    if (key === this.cannonPickKey) {
      return;
    }
    if (this.hideCannonPick) {
      this.hideCannonPick();
      this.hideCannonPick = null;
    }
    this.cannonPickKey = key;
    if (cells.length > 0) {
      this.hideCannonPick = showCannonPick({
        scene: this.scene,
        camera: this.camera,
        field: this.playerGameField,
        cells,
        requestRender: this.requestRender,
        setRenderLoop: (run) => this.setRenderLoop(run),
        onSpots: (cannonSpots) => this.setState({ cannonSpots }),
      });
    }
  }

  // The tutorial's hand on a field (ui.tutorialPointer): its place on the screen follows the
  // camera (it flies between the boards, the player zooms) through an observer on every frame,
  // like the cannon pick's light. On a weapon button the weapon palette shows the hand itself.
  updateTutorialPointer() {
    const target = this.props.tutorialPointer;
    const onField = Boolean(target) && typeof target.row === "number" && this.playerGameField !== null;
    const key = onField ? `${target.board}.${target.row}.${target.col}` : "";
    if (key === this.pointerKey) {
      return;
    }
    this.pointerKey = key;
    this.hideTutorialPointer();
    if (!onField) {
      return;
    }
    const field = target.board === "opponent" ? this.opponentGameField : this.playerGameField;
    const world = field.position.add(new Vector3(target.row, POINTER_HEIGHT, target.col));
    const place = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const transform = this.camera.getViewMatrix().multiply(this.camera.getProjectionMatrix());
      const point = Vector3.TransformCoordinates(world, transform);
      const pixelsPerField = height / (this.camera.orthoTop - this.camera.orthoBottom);
      const pointer = {
        x: Math.round(((point.x + 1) / 2) * width),
        y: Math.round(((1 - point.y) / 2) * height),
        size: Math.round(Math.min(POINTER_SIZE.max, Math.max(POINTER_SIZE.min, POINTER_SIZE.fields * pixelsPerField))),
        board: target.board,
        row: target.row,
        col: target.col,
      };
      const current = this.state.pointer;
      if (!current || Object.keys(pointer).some((prop) => current[prop] !== pointer[prop])) {
        this.setState({ pointer });
      }
    };
    this.pointerObserver = this.scene.onAfterRenderObservable.add(place);
    this.requestRender();
  }

  hideTutorialPointer() {
    if (this.pointerObserver) {
      this.scene.onAfterRenderObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.state.pointer) {
      this.setState({ pointer: null });
    }
  }

  renderTutorialPointer({ x, y, size, board, row, col }) {
    return (
      <TapPointer data-testid="tutorial-pointer" data-board={board} data-row={row} data-col={col} x={x} y={y} size={size} />
    );
  }

  // the screen dims around the lit cells of the cannons (their pools of light are meshes)
  renderCannonSpots({ lights, blur }) {
    const points = (polygon) => polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return (
      <svg className="cannonSpots" aria-hidden="true" data-testid="cannon-spots">
        <defs>
          <filter id="cannon-light">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
          <mask id="cannon-spots">
            <rect width="100%" height="100%" fill="white" />
            <g filter="url(#cannon-light)">
              {lights.map((polygons, i) =>
                polygons.map((polygon, j) => <polygon key={`${i}.${j}`} points={points(polygon)} fill="black" />)
              )}
            </g>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(30, 15, 8, 0.55)" mask="url(#cannon-spots)" />
      </svg>
    );
  }

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

  matchEnded() {
    return typeof this.props.game !== "undefined" && this.props.game.phase === engine.MatchPhase.ENDED;
  }

  // takes the floating infos away, also those still on their way up
  stopInfos() {
    [...this.infoPops].forEach((pop) => pop.stop());
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
      this.showPreview();
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

  // A donut step as a 112 px bitmap, coloured for its state: "ready" and "rushable" colour the
  // glaze only, the dough and the sprinkles keep their colours (the user, 2026-11-01); "ghost"
  // is the whole donut as a pale shadow of what is still missing. Rasterised once per step and
  // state, not on every redraw.
  donutBitmap(step, state) {
    const key = `${step}:${state}`;
    if (this.donutBitmaps.has(key)) {
      return this.donutBitmaps.get(key);
    }
    const image = this.donutImages[step - 1];
    if (!image || !image.complete || image.naturalWidth === 0) {
      return undefined;
    }
    const bitmap = document.createElement("canvas");
    bitmap.width = 112;
    bitmap.height = 112;
    const context = bitmap.getContext("2d");
    context.drawImage(image, 0, 0, 112, 112);
    if (state === "ghost") {
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = "rgba(226, 230, 236, 0.8)";
      context.fillRect(0, 0, 112, 112);
    } else if (GLAZE_COLORS[state]) {
      // the glaze is the light, unsaturated part of the picture: those pixels take the state's
      // colour, shaded as they were
      const [red, green, blue] = GLAZE_COLORS[state];
      const pixels = context.getImageData(0, 0, 112, 112);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (data[i + 3] > 0 && max > 150 && max - min < 40) {
          const shade = max / 255;
          data[i] = red * shade;
          data[i + 1] = green * shade;
          data[i + 2] = blue * shade;
        }
      }
      context.putImageData(pixels, 0, 0);
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
      // a pale whole donut shows what is still missing (a grey one looked black and dirty; the
      // user's pick of 2026-11-01, "C3" in screenshots/progress-donut)
      const ghost = this.donutBitmap(10, "ghost");
      if (ghost) {
        context.globalAlpha = 0.35;
        context.drawImage(ghost, x, 8);
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
    // the donuts stop with the match: its clock goes on, and a cannon would report a shot
    // ("+1") over the end screen
    if (this.matchEnded()) {
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

  // the camera flies to the board in front, from wherever it is (a swipe may have brought it
  // part of the way); the view glides to that board's zoom and place along with it
  performCameraFlight = () => {
    this.animateBetween(this.lookAtOpponent ? 1 : 0);
  };

  // the camera at the own board, nothing on its way
  resetCamera() {
    if (this.flight) {
      this.scene.stopAnimation(this.flight);
      this.flight = null;
    }
    if (this.viewTransition) {
      this.scene.stopAnimation(this.viewTransition);
      this.viewTransition = null;
    }
    this.swipe = null;
    this.views = { own: fitView(), opponent: fitView() };
    this.applyBetween(0);
  }

  startGame = (game) => {
    // the viewer's board is in front, the opponent's behind it; the player switches freely
    const playerFieldIndex = game.players[game.viewer].fieldIndex;
    const opponentFieldIndex = game.players[1 - game.viewer].fieldIndex;
    this.lookAtOpponent = false;
    this.resetCamera();

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

    this.showPreview();
    this.resize();
    // new instances only show up once their materials are compiled; render again then,
    // because a real-time match has no camera flight that would keep rendering
    this.scene.executeWhenReady(() => this.scene.render());
  };

  renderPreviewFrame({ left, top, width, height, own, minimap }) {
    const { color, font } = this.props.theme;
    return (
      <button
        type="button"
        data-testid="board-preview"
        data-board={own ? "own" : "opponent"}
        data-minimap={minimap ? "true" : undefined}
        aria-label={own ? t(tr.BOARD_PREVIEW_OWN) : t(tr.BOARD_PREVIEW_OPPONENT)}
        onClick={() => {
          Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
          this.props.toggleBoardView();
        }}
        style={{
          position: "absolute",
          zIndex: 2,
          left,
          top,
          width,
          height,
          boxSizing: "border-box",
          padding: 0,
          border: `${PREVIEW_BORDER}px solid ${color.secondary.light}`,
          borderRadius: 12,
          background: "none",
          boxShadow: "0 0.3vw 1vw rgba(0, 0, 0, 0.3)",
          cursor: "pointer",
        }}
      >
        {minimap ? (
          <span
            data-testid="board-minimap"
            style={{
              position: "absolute",
              left: `${minimap.left * 100}%`,
              top: `${minimap.top * 100}%`,
              width: `${minimap.width * 100}%`,
              height: `${minimap.height * 100}%`,
              boxSizing: "border-box",
              border: "2px solid #FAD25A",
              borderRadius: 3,
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
              pointerEvents: "none",
            }}
          />
        ) : null}
        <span
          style={{
            position: "absolute",
            left: 8,
            bottom: 4,
            color: "white",
            fontFamily: font.display,
            fontSize: font.size.sm,
            WebkitTextStroke: `${font.stroke} ${color.secondary.dark}`,
            pointerEvents: "none",
          }}
        >
          {own ? t(tr.BOARD_PREVIEW_OWN) : t(tr.BOARD_PREVIEW_OPPONENT)}
        </span>
      </button>
    );
  }

  // The whole-board button: there as soon as the board in view is zoomed in, gone when the
  // whole board shows again. A small round button, an icon only (the corners of a frame closing
  // in on a board). In landscape under the menu button, so it ends about where the preview
  // beside it ends (the user, 2026-11-01); in portrait under the preview.
  // where the whole-board button stands in the tutorial's lesson, which has no preview: beside
  // the menu button (Mimi's card hangs under it), in portrait under her card
  lessonFitPlace({ edgeLeft, edgeTop, fab, gap }) {
    const landscape = this.container.clientWidth >= this.container.clientHeight;
    return landscape
      ? { left: Math.round(edgeLeft + fab + gap), top: Math.round(edgeTop) }
      : { left: Math.round(edgeLeft), top: Math.round((this.props.boardTopInset || edgeTop + fab) + gap) };
  }

  renderFitButton({ left, top, width, height, edgeLeft, edgeTop, fab, gap }, where) {
    const zoomed = this.state.zoomed;
    const size = Math.max(40, Math.round(0.7 * fab));
    const landscape = this.container.clientWidth >= this.container.clientHeight;
    const place =
      where ||
      (landscape
        ? { left: Math.round(edgeLeft), top: Math.round(edgeTop + fab + gap) }
        : { left, top: top + height + gap });
    return (
      <Fab
        color="secondary"
        icon="fit-board"
        data-testid="board-fit"
        aria-label={t(tr.BOARD_ZOOM_RESET)}
        aria-hidden={!zoomed}
        tabIndex={zoomed ? 0 : -1}
        onClick={this.fitBoard}
        style={{
          position: "absolute",
          zIndex: 2,
          left: place.left,
          top: place.top,
          width: size,
          height: size,
          opacity: zoomed ? 1 : 0,
          pointerEvents: zoomed ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />
    );
  }

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
        {this.state.preview ? this.renderPreviewFrame(this.state.preview) : null}
        {this.state.preview
          ? this.renderFitButton(this.state.preview)
          : this.props.tutorial && this.container && this.playerGameField
          ? this.renderFitButton(this.previewRect(), this.lessonFitPlace(this.previewRect()))
          : null}
        {this.state.cannonSpots ? this.renderCannonSpots(this.state.cannonSpots) : null}
        {this.state.pointer ? this.renderTutorialPointer(this.state.pointer) : null}
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
  tutorialPointer: state.ui.tutorialPointer,
});

const mapDispatchToProps = {
  toggleBoardView,
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
  loadUiState,
};

const SceneContainer = connect(mapStateToProps, mapDispatchToProps)(Scene);

export default withTheme(SceneContainer);
