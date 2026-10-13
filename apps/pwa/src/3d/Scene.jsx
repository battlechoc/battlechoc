import React, { Component, createRef } from "react";
import { connect } from "react-redux";
import { multiplayer } from "../Multiplayer";
import {
  deselectBuildings,
  selectAttack,
  deselectAttack,
  selectBuilding,
  tapBuilding,
} from "../ui/UiActions";
import {
  InfoType,
  build,
  attack,
  finishTurn,
  finishBuildPhase,
} from "../gameplay/GameActions";
import Gamefield from "./Gamefield";
import {
  GameStateTypes,
  playerHasAttacks,
  BattlechocError,
  EntityType,
  AttackType,
  BoardCellTypes,
  createEntity,
  getEntityDescriptor,
  getCheapest,
  isDonut,
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
  }

  hideEnergyBar = (position, field) => {
    let height = 6.5;
    if (this.props.tutorial) {
      height = 5.25;
    } else if (typeof this.props.game !== "undefined") {
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
        this.props.game.players[multiplayer.localPlayerIndex].fieldIndex,
        entity.position.row,
        entity.position.col
      );
      if (selectedCell.shielded) {
        this.showEnergyBar(
          this.getFountain(
            entity.position.row,
            entity.position.col,
            this.props.game.board,
            this.props.game.players[multiplayer.localPlayerIndex].fieldIndex
          )
        );
      }
    }

    let height = 6.5;
    if (this.props.tutorial) {
      height = 5.25;
    } else if (typeof this.props.game !== "undefined") {
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

    const energy = entity.hp / entity.max.hp;
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
  }

  componentDidUpdate() {
    if (
      typeof this.props.game !== "undefined" &&
      typeof this.lookAtOpponent !== "undefined"
    ) {
      if (
        !this.lookAtOpponent &&
        ((!multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) &&
          this.props.game.state !== GameStateTypes.ATTACK_PHASE) ||
          (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) &&
            this.props.game.state === GameStateTypes.ATTACK_PHASE))
      ) {
        this.lookAtOpponent = true;
        this.performCameraFlight();
      } else if (
        this.lookAtOpponent &&
        ((!multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) &&
          this.props.game.state === GameStateTypes.ATTACK_PHASE) ||
          (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) &&
            this.props.game.state !== GameStateTypes.ATTACK_PHASE))
      ) {
        this.lookAtOpponent = false;
        this.performCameraFlight();
      }

      if (this.playerGameField !== null) {
        this.opponentGameField.update();
        this.playerGameField.update();
        this.scene.render();
      }
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
    info.position.y = this.props.tutorial ? 4 : 6;
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

  triggerDonutInfo(donut, position) {
    if (typeof position === "undefined") {
      position = new Vector3(donut.position.row, 6.5, donut.position.col);
    } else {
      position.y = 6.5;
    }
    this.spawnInfo(InfoType.DONUT_TRAP, position, undefined, donut.type);
  }

  triggerCacaoInfo() {
    let cells =
      this.props.game.board.fields[
        this.props.game.players[multiplayer.localPlayerIndex].fieldIndex
      ].grid;

    let entities = cells.filter(
      (cell) =>
        cell.occupiedBy.filter((entity) => entity.type !== EntityType.CREAM)
          .length > 0
    );
    entities.forEach((cell) =>
      this.showEnergyBar(
        cell.occupiedBy.filter((entity) => entity.type !== EntityType.CREAM)[0],
        new Vector3(cell.row, 0, cell.col)
      )
    );

    let trees = cells.filter((cell) =>
      cell.occupiedBy
        .map((entity) => entity.type)
        .includes(EntityType.CACAOTREE)
    );
    let description = getEntityDescriptor(
      EntityType.CACAOTREE,
      this.props.game.players[multiplayer.localPlayerIndex].level
    );
    trees.forEach((cell) => {
      this.spawnInfo(
        InfoType.CACAO_HARVESTED,
        new Vector3(cell.row, 0, cell.col),
        cell.type === BoardCellTypes.WHITE
          ? Math.round(description.cacaoPerTurn * 1.5)
          : description.cacaoPerTurn
      );
    });
    let factory = cells.filter((cell) =>
      cell.occupiedBy.map((entity) => entity.type).includes(EntityType.FACTORY)
    );
    description = getEntityDescriptor(
      EntityType.FACTORY,
      this.props.game.players[multiplayer.localPlayerIndex].level
    );
    factory.forEach((cell) => {
      this.spawnInfo(
        InfoType.CACAO_HARVESTED,
        new Vector3(cell.row, 0, cell.col),
        description.cacaoPerTurn
      );
    });
  }

  estimateOrthographicSize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    let ratio = width / height;
    let distance = Math.max(7.5 / ratio, 5);

    if (this.props.tutorial) {
      distance = Math.max(3 / ratio, 5);
    } else if (typeof this.props.game !== "undefined") {
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

  highlightDonuts = (highlight = true) => {
    let highlights = [
      { type: EntityType.DONUT_PORTAL_BLUE, color: new Color3(0.3, 0.3, 1) },
      { type: EntityType.DONUT_PORTAL_RED, color: new Color3(1, 0.3, 0.3) },
      { type: EntityType.DONUT_CREAM_WHITE, color: new Color3(0.9, 0.9, 0.9) },
      { type: EntityType.DONUT_SURPRISE_YELLOW, color: new Color3(1, 1, 0.3) },
      { type: EntityType.DONUT_HEALTH_GREEN, color: new Color3(0.3, 1, 0.3) },
      { type: EntityType.DONUT_STOP_PINK, color: new Color3(1, 0.41, 0.7) },
    ];

    for (let entity of highlights) {
      let parent = this.scene.getMeshByName(entity.type + "__root__");
      let children = parent.getChildMeshes(false);

      for (let child of children) {
        if (highlight) {
          this.highlightLayer.addMesh(child, entity.color);
        } else {
          this.highlightLayer.removeMesh(child);
        }
      }
    }

    let entities = [
      EntityType.CREAM,
      EntityType.FACTORY,
      EntityType.FACTORY_EXTENSION,
      EntityType.CACAOTREE,
      EntityType.RUM_TRUFFLE_CANNON,
      EntityType.FRUIT_CANNON,
      EntityType.SPYING_EASTER_BUNNY,
      EntityType.XMAS_FACTORY,
      EntityType.HOT_CHOCOLATE_BALLISTA,
      EntityType.CHOCOLATE_FOUNTAIN,
      EntityType.DONUT_FACTORY,
    ];

    for (let entityType of [
      ...entities,
      EntityType.CREAM + ".AROUND.BUILDING",
    ]) {
      let parent = this.scene.getMeshByName(entityType + "__root__");
      let children =
        parent.getChildren()[0].getChildren().length > 0
          ? parent.getChildren()[0].getChildren()
          : parent.getChildren();

      children.forEach((child) => {
        if (highlight) {
          child.visibility = 0;
        } else {
          child.visibility = 1;
        }
      });
    }

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

  playerFieldClick(row, col, position) {
    if (this.props.tutorial) {
      return;
    }

    let player = this.props.game.players[multiplayer.localPlayerIndex];
    let buildingSelected = this.props.selectedBuilding;
    let initialPlacement =
      this.props.game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
      this.props.game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;

    if (
      buildingSelected ||
      (initialPlacement && player.buildingsPerTurn === 0)
    ) {
      let building;
      if (initialPlacement) {
        building = createEntity(EntityType.FACTORY, player.level);
      } else {
        building = createEntity(this.props.selectedBuilding, player.level);
      }
      building.position = { row: row, col: col };
      let playerCacaoPerTurnBefore = player.cacaoPerTurn;
      let buildingsPerTurnBefore = player.buildingsPerTurn;
      const target =
        this.props.game.board.fields[
          this.props.game.players[this.props.game.currentPlayerIndex].fieldIndex
        ].grid[row * this.props.game.board.size.cols + col];
      this.props
        .build({ issuer: player.id, building: building, target: target })
        .then(() => {
          player = this.props.game.players[multiplayer.localPlayerIndex];
          Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
          if (building.type === EntityType.DONUT_PORTAL_BLUE) {
            this.props.selectBuilding(EntityType.DONUT_PORTAL_RED);
            this.props.tapBuilding(EntityType.DONUT_PORTAL_RED);
          } else if (isDonut(building.type)) {
            this.props.deselectBuildings();
          }

          if (building.type !== EntityType.CREAM) {
            this.showEnergyBar(building);
          }
          if (initialPlacement) {
            this.spawnInfo(
              InfoType.INCREASE_BUILDINGS_PER_TURN,
              position.clone(),
              player.buildingsPerTurn
            );
            this.props.deselectBuildings();
            this.props.deselectAttack();
            let playerId = player.id;
            setTimeout(() => {
              let description = getEntityDescriptor(
                EntityType.FACTORY,
                player.level
              );
              this.spawnInfo(
                InfoType.INCREASE_CACAO_PER_TURN,
                position.clone(),
                description.cacaoPerTurn
              );
            }, 1000);
            setTimeout(() => {
              if (playerId === player.id) {
                this.props.finishTurn({ issuer: player.id });
                this.props.deselectBuildings();
                this.props.deselectAttack();
              }
            }, 3000);
          } else {
            let description = getEntityDescriptor(building.type, player.level);
            if (!isDonut(building.type)) {
              this.spawnInfo(
                InfoType.CACAO_CONSUMED,
                position.clone(),
                description.costs
              );
            }
            let cacaoDelta = player.cacaoPerTurn - playerCacaoPerTurnBefore;
            let buildingsDelta =
              player.buildingsPerTurn - buildingsPerTurnBefore;
            setTimeout(() => {
              if (typeof this.props.game !== "undefined") {
                if (building.type === EntityType.CACAOTREE) {
                  this.spawnInfo(
                    InfoType.INCREASE_CACAO_PER_TURN,
                    position.clone(),
                    cacaoDelta
                  );
                } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                  this.spawnInfo(
                    InfoType.INCREASE_ATTACKS_PER_TURN,
                    position.clone(),
                    1
                  );
                } else if (building.type === EntityType.FACTORY_EXTENSION) {
                  this.spawnInfo(
                    InfoType.INCREASE_BUILDINGS_PER_TURN,
                    position.clone(),
                    buildingsDelta
                  );
                } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
                  this.spawnInfo(
                    InfoType.INCREASE_SPY_ATTACKS_PER_TURN,
                    position.clone(),
                    1
                  );
                } else if (building.type === EntityType.FRUIT_CANNON) {
                  this.spawnInfo(
                    InfoType.INCREASE_FRUIT_ATTACKS_PER_TURN,
                    position.clone(),
                    1
                  );
                }
                setTimeout(() => {
                  if (typeof this.props.game !== "undefined") {
                    player =
                      this.props.game.players[multiplayer.localPlayerIndex];
                    if (
                      player.donuts.length === 0 &&
                      (player.buildings === 0 ||
                        player.cacao < getCheapest().costs)
                    ) {
                      if (playerHasAttacks(player) === true) {
                        this.props
                          .finishBuildPhase({ issuer: player.id })
                          .then(() => {
                            this.props.deselectBuildings();
                          })
                          .catch((error) => {
                            if (error instanceof BattlechocError) {
                              logger.warn(error);
                            } else {
                              throw error;
                            }
                          });
                      } else {
                        this.props
                          .finishTurn({ issuer: player.id })
                          .then(() => {
                            this.props.deselectBuildings();
                            this.props.deselectAttack();
                          })
                          .catch((error) => {
                            if (error instanceof BattlechocError) {
                              logger.warn(error);
                            } else {
                              throw error;
                            }
                          });
                      }
                    }
                  }
                }, 2000);
              }
            }, 1000);
          }
        })
        .catch((error) => {
          if (error instanceof BattlechocError) {
            logger.warn(error);
          } else {
            throw error;
          }
        });
    }
  }

  opponentFieldClick(row, col, position) {
    if (this.props.tutorial) {
      return;
    }

    if (
      multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) &&
      this.props.game.state === GameStateTypes.ATTACK_PHASE
    ) {
      let attack = 0;
      if (this.props.selectedAttack === AttackType.TRUFFLE) {
        let description = getEntityDescriptor(
          EntityType.RUM_TRUFFLE_CANNON,
          this.props.game.players[multiplayer.localPlayerIndex].level
        );
        attack = description.attack;
      } else if (this.props.selectedAttack === AttackType.FRUIT) {
        let description = getEntityDescriptor(
          EntityType.FRUIT_CANNON,
          this.props.game.players[multiplayer.localPlayerIndex].level
        );
        attack = description.attack;
      }

      let damage = (1 + (Math.random() * 0.4 - 0.2)) * attack;

      const attackParams = {
        issuer: this.props.game.players[multiplayer.localPlayerIndex].id,
        attackType: this.props.selectedAttack,
        damage: damage,
        row: row,
        col: col,
        target:
          this.props.game.board.fields[
            this.props.game.players[1 - this.props.game.currentPlayerIndex]
              .fieldIndex
          ].grid[row * this.props.game.board.size.cols + col],
      };

      let cellAt = (board, field, row, col) =>
        board.fields[field].grid[row * board.size.cols + col];
      let selectedCell = cellAt(
        this.props.game.board,
        this.props.game.players[1 - multiplayer.localPlayerIndex].fieldIndex,
        row,
        col
      );
      let cellContainsDonut = selectedCell.occupiedBy.some((entity) =>
        isDonut(entity.type)
      );
      let donut = cellContainsDonut
        ? selectedCell.occupiedBy.filter((entity) => isDonut(entity.type))[0]
        : null;
      this.props
        .attack(attackParams)
        .then(() => {
          selectedCell = cellAt(
            this.props.game.board,
            this.props.game.players[1 - multiplayer.localPlayerIndex]
              .fieldIndex,
            row,
            col
          );
          if (
            cellContainsDonut &&
            !selectedCell.occupiedBy.some((entity) => isDonut(entity.type))
          ) {
            this.triggerDonutInfo(donut, position.clone());
          }

          if (attackParams.attackType === AttackType.BUNNY) {
            if (
              this.props.game.players[multiplayer.localPlayerIndex]
                .attacksPerTurn[AttackType.BUNNY] > 0
            ) {
              Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
            } else {
              Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
              this.spawnInfo(InfoType.BUNNY_CAUGHT, position.clone());
            }
          } else if (typeof attackParams.attackType !== "undefined") {
            Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
            this.detonateAtPosition(row, col);
            if (
              selectedCell.occupiedBy.filter(
                (entity) => entity.type !== EntityType.CREAM
              ).length > 0
            ) {
              if (selectedCell.shielded) {
                this.showEnergyBar(
                  this.getFountain(
                    row,
                    col,
                    this.props.game.board,
                    this.props.game.players[1 - multiplayer.localPlayerIndex]
                      .fieldIndex
                  ),
                  position.clone()
                );
              } else {
                this.showEnergyBar(
                  selectedCell.occupiedBy.filter(
                    (entity) => entity.type !== EntityType.CREAM
                  )[0],
                  position.clone()
                );
              }
            } else {
              this.hideEnergyBar(position.clone());
            }
          }

          if (
            this.props.game.players[multiplayer.localPlayerIndex].attacks[
              attackParams.attackType
            ] === 0
          ) {
            const attackTypes = [
              AttackType.TRUFFLE,
              AttackType.FRUIT,
              AttackType.HOT_CHOCOLATE,
              AttackType.BUNNY,
            ];
            let undepletedAttack = attackTypes.filter(
              (attackType) =>
                this.props.game.players[multiplayer.localPlayerIndex].attacks[
                  attackType
                ] > 0
            );
            if (undepletedAttack.length > 0) {
              this.props.selectAttack(undepletedAttack[0]).catch((error) => {
                if (error instanceof BattlechocError) {
                  logger.warn(error);
                } else {
                  throw error;
                }
              });
            }
          }
        })
        .catch((error) => {
          if (error instanceof BattlechocError) {
            logger.warn(error);
          } else {
            throw error;
          }
        });
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

  startGame = (game, overrideUiState = false) => {
    const playerFieldIndex =
      game.players[multiplayer.localPlayerIndex].fieldIndex;
    const opponentFieldIndex =
      game.players[1 - multiplayer.localPlayerIndex].fieldIndex;
    if (
      (multiplayer.isLocalPlayer(game.currentPlayerIndex) &&
        game.state !== GameStateTypes.ATTACK_PHASE) ||
      (!multiplayer.isLocalPlayer(game.currentPlayerIndex) &&
        game.state === GameStateTypes.ATTACK_PHASE)
    ) {
      this.lookAtOpponent = false;
    } else {
      this.lookAtOpponent = true;
      this.performCameraFlight();
    }

    let gamefieldHeight = 5;
    if (this.props.tutorial) {
      gamefieldHeight = 3.5;
    } else if (typeof this.props.game !== "undefined") {
      if (this.props.game.board.size.cols === 6) {
        gamefieldHeight = 4;
      } else if (this.props.game.board.size.cols === 8) {
        gamefieldHeight = 4.5;
      }
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

    if (overrideUiState) {
      this.props.deselectBuildings();
    }
    this.resize();
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
  game: state.gameplay.game,
  level: state.ui.playerInfos.stats.level,
  selectedBuilding: state.ui.selectedBuilding,
  selectedAttack: state.ui.selectedAttack,
  assetsReady: state.ui.assetsReady,
  tutorial: state.ui.tutorial,
});

const mapDispatchToProps = {
  finishTurn,
  build,
  attack,
  deselectBuildings,
  selectAttack,
  selectBuilding,
  tapBuilding,
  deselectAttack,
  finishBuildPhase,
};

const SceneContainer = connect(mapStateToProps, mapDispatchToProps)(Scene);

export default withTheme(SceneContainer);
