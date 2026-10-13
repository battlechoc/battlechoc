import React, { Component, createRef } from "react";
import { connect } from "react-redux";
import {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
} from "../ui/UiActions";
import { selectActiveGame } from "../match/matchSlice";
import { matchSession } from "../match/LocalMatchHost";
import { submit, ignoreRuleErrors } from "../ui/match/submit";
import { InfoType } from "./InfoType";
import Gamefield from "./Gamefield";
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
  DirectionalLight,
  Engine,
  HighlightLayer,
  FlyCamera,
  Color3,
  Camera,
  Vector3,
  HemisphericLight,
  Color4,
  Animation,
  MeshBuilder,
} from "@babylonjs/core";
import { AssetLoadingViewContainer as AssetLoadingView } from "../AssetLoader";
import logger from "../helper/logger";
import { v4 as uuidv4 } from "uuid";
import { withTheme } from "react-jss";

class Scene extends Component {
  constructor(props) {
    super(props);
    this.loadingView = createRef();
  }

  componentDidMount() {
    this.props.onRef(this);
    this.engine = new Engine(
      this.container,
      true,
      {
        preserveDrawingBuffer: true,
        stencil: true,
        useHighPrecisionFloats: false,
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
      let light = new HemisphericLight("light", new Vector3(40, 44, 1), scene);
      light.intensity = 0.1;
      light.diffuse = new Color3(1.0, 0.97, 0.93);
      let spot = new DirectionalLight("spot", new Vector3(0, -1, -1), scene);
      spot.intensity = 1;
      spot.position = new Vector3(35, 35, 35);
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
    window.addEventListener("resize", this.resize);
    this.playerGameField = null;
    this.opponentGameField = null;
    this.renderLoopRepetitions = 0;
    this.opponentGameFieldDistance = 12;
    this.weaponIndicators = new Map();
    this.weaponIndicatorInterval = setInterval(() => this.updateWeaponIndicators(), 250);
  }

  hideEnergyBar = (position, field) => {
    let height = 6.5;
    if (typeof this.props.game !== "undefined") {
      if (this.props.game.board.size.cols === 6) {
        height = 5.5;
      } else if (this.props.game.board.size.cols === 8) {
        height = 6.1;
      }
    }

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

    let height = 6.5;
    if (typeof this.props.game !== "undefined") {
      if (this.props.game.board.size.cols === 6) {
        height = 5.5;
      } else if (this.props.game.board.size.cols === 8) {
        height = 6.1;
      }
    }

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
    if (energy < 0.3) {
      material.diffuseColor = Color3.FromHexString("#D05531");
    } else if (energy < 0.6) {
      material.diffuseColor = Color3.FromHexString("#DFBF31");
    } else {
      material.diffuseColor = Color3.FromHexString("#70bf31");
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
      { width: 1.65, height: 1.65 },
      this.scene
    );
    info.isPickable = false;
    info.position = position;
    info.position.y = 6;
    info.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const texture = new DynamicTexture("info_texture_" + id, 208, this.scene);
    const context = texture.getContext();
    const material = new StandardMaterial("info_material_" + id, this.scene);
    material.emissiveTexture = texture;
    material.ambientTexture = texture;
    material.opacityTexture = texture;

    info.material = material;

    const drawInfo = (filename, color, text) => {
      const image = new Image();
      image.src = filename;
      image.onload = () => {
        this.setRenderLoop();
        let top = 120;
        let left = 70;
        if (filename === "/images/cacao.svg") {
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
            "bold 68px Bangers",
            darken(color, -128),
            null,
            true,
            true
          );
          texture.drawText(
            text,
            left,
            top,
            "bold 68px Bangers",
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
          { frame: 120, value: info.position.y + 2.5 },
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

    this.camera.orthoTop = distance;
    this.camera.orthoBottom = -distance;
    this.camera.orthoLeft = -distance * ratio;
    this.camera.orthoRight = distance * ratio;
  }

  resize = () => {
    this.estimateOrthographicSize();
    this.engine.resize();
    this.scene.render();
  };

  clear() {
    this.weaponIndicators.forEach((indicator) => {
      indicator.mesh.dispose();
      indicator.material.dispose();
    });
    this.weaponIndicators.clear();
    const instances = this.scene.meshes.filter((mesh) => mesh.isAnInstance);
    for (const instance of instances) {
      instance.dispose();
    }
    this.playerGameField = null;
    this.opponentGameField = null;
    this.scene.render();
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

    this.scene.render();
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
      truffle.position = new Vector3(row, 5, col);
      this.playerGameField.explode(truffle);
    } else {
      truffle.position = new Vector3(
        row - this.opponentGameFieldDistance,
        5,
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
    if (prevProps.boardViewToggles !== this.props.boardViewToggles) {
      this.setLookAtOpponent(!this.lookAtOpponent);
    } else if (
      typeof this.props.selectedAttack !== "undefined" &&
      prevProps.selectedAttack !== this.props.selectedAttack
    ) {
      this.setLookAtOpponent(true);
    } else if (
      typeof this.props.selectedBuilding !== "undefined" &&
      prevProps.selectedBuilding !== this.props.selectedBuilding
    ) {
      this.setLookAtOpponent(false);
    }

    this.opponentGameField.update();
    this.playerGameField.update();
    this.syncWeaponIndicators();
    if (prevProps.matchEvents !== this.props.matchEvents) {
      this.playMatchEvents(this.props.matchEvents);
    }
    this.scene.render();
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
    const costs = (view.balance.entities[type] || {}).costs || 0;
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
      const name = error && error.constructor ? error.constructor.name : "";
      if (name === "TargetEmptyError") {
        this.props.showQuickMessage({ text: t(tr.MATCH_TARGET_GONE), autoHideDuration: 2000 });
      } else if (name === "WeaponNotReadyError") {
        this.props.showQuickMessage({ text: t(tr.MATCH_NOT_READY), autoHideDuration: 2000 });
      } else if (name === "StunnedError") {
        this.props.showQuickMessage({ text: t(tr.MATCH_STUNNED), autoHideDuration: 2000 });
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

  // a small disc above each own weapon: grey while charging, blue when it can rush, green when ready
  syncWeaponIndicators() {
    const view = this.props.game;
    if (typeof view === "undefined" || this.playerGameField === null || view.phase !== engine.MatchPhase.RUNNING) {
      return;
    }
    const grid = view.board.fields[view.players[view.viewer].fieldIndex].grid;
    const present = new Set();
    let height = 6.5;
    if (view.board.size.cols === 6) {
      height = 5.5;
    } else if (view.board.size.cols === 8) {
      height = 6.1;
    }
    grid.forEach((cell) =>
      cell.occupiedBy
        .filter((entity) => Array.isArray(entity.weapons))
        .forEach((entity) => {
          present.add(entity.id);
          let indicator = this.weaponIndicators.get(entity.id);
          if (!indicator) {
            const mesh = MeshBuilder.CreateDisc("weapon.indicator." + entity.id, { radius: 0.16, tessellation: 24 }, this.scene);
            const material = new StandardMaterial("weapon.indicator.material." + entity.id, this.scene);
            material.disableLighting = true;
            mesh.material = material;
            mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
            mesh.isPickable = false;
            indicator = { mesh, material, state: undefined };
            this.weaponIndicators.set(entity.id, indicator);
          }
          indicator.weapons = entity.weapons;
          indicator.mesh.position = new Vector3(cell.row - 0.25, height - 0.7, cell.col + 0.25);
        })
    );
    this.weaponIndicators.forEach((indicator, id) => {
      if (!present.has(id)) {
        indicator.mesh.dispose();
        indicator.material.dispose();
        this.weaponIndicators.delete(id);
      }
    });
    this.updateWeaponIndicators(false);
  }

  updateWeaponIndicators(render = true) {
    if (typeof this.props.game === "undefined" || typeof matchSession.host === "undefined" || this.weaponIndicators.size === 0) {
      return;
    }
    const view = this.props.game;
    const now = matchSession.host.now();
    const colors = {
      ready: Color3.FromHexString("#90D01B"),
      rushable: Color3.FromHexString("#3190C3"),
      charging: Color3.FromHexString("#8a7b72"),
    };
    let changed = false;
    this.weaponIndicators.forEach((indicator) => {
      const states = indicator.weapons.map((weapon) => engine.weaponStatus(view, weapon, now).state);
      const state = states.includes("ready") ? "ready" : states.includes("rushable") ? "rushable" : "charging";
      if (state !== indicator.state) {
        indicator.state = state;
        indicator.material.emissiveColor = colors[state];
        indicator.material.diffuseColor = colors[state];
        changed = true;
      }
    });
    if (changed && render) {
      this.scene.render();
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

    let gamefieldHeight = 5;
    if (game.board.size.cols === 6) {
      gamefieldHeight = 4;
    } else if (game.board.size.cols === 8) {
      gamefieldHeight = 4.5;
    }

    this.playerGameField = new Gamefield(
      true,
      new Vector3(0, gamefieldHeight, 0),
      () => this.props.game.board.fields[playerFieldIndex],
      playerFieldIndex,
      game.board.size,
      this.scene,
      (row, col, eventX, eventY) =>
        this.playerFieldClick(row, col, eventX, eventY),
      (run) => this.setRenderLoop(run)
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
      (run) => this.setRenderLoop(run)
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
  level: state.ui.playerInfos.stats.level,
  selectedBuilding: state.ui.selectedBuilding,
  selectedAttack: state.ui.selectedAttack,
  assetsReady: state.ui.assetsReady,
  tutorial: state.ui.tutorial,
});

const mapDispatchToProps = {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
};

const SceneContainer = connect(mapStateToProps, mapDispatchToProps)(Scene);

export default withTheme(SceneContainer);
