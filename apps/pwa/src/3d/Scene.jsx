import { Component, createRef } from "react";
import { connect } from "react-redux";
import {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
  toggleBoardView,
  loadUiState,
} from "../ui/uiSlice";
import { selectActiveGame } from "../match/matchSlice";
import { matchSession } from "../match/LocalMatchHost";
import { submit, ignoreRuleErrors } from "../ui/match/submit";
import { tapOwnCell, tapOpponentCell } from "../match/boardActions.js";
import { InfoType } from "./InfoType";
import Gamefield from "./Gamefield";
import { applyLook } from "./look";
import {
  EntityType,
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Jukebox from "../ui/misc/Jukebox";
import {
  Scene as BabylonScene,
  Engine,
  FlyCamera,
  Camera,
  Vector3,
  Color4,
  Viewport,
} from "./babylon";
import { AssetLoadingViewContainer as AssetLoadingView } from "../AssetLoader";
import { withTheme } from "react-jss";
import { measureEdges } from "../helper/edges";
import { showCannonPick } from "./cannonPick.js";
import { cannonCells, fruitCannonPossible } from "../match/fruitCannon.js";
import { RenderLoop } from "./renderLoop.js";
import { BoardCamera } from "./BoardCamera.js";
import { OneShots } from "./oneShots.js";
import { spawnInfoPop } from "./infoPops.js";
import { EnergyBars } from "./energyBars.js";
import { WeaponIndicators } from "./weaponIndicators.js";
import {
  BOARD_DISTANCE,
  playMatchEvents,
  showProduction,
  chocolateFlash,
  detonate,
} from "./matchEffects.js";
import { exposeSceneForTests } from "../testHooks";
import Fab from "../ui/controls/Fab";
import TapPointer from "../ui/controls/TapPointer";

// the tutorial's hand on a field: its fingertip this high above the field (the top of the
// chocolate piece), and its size, in fields, within reason on a small or a big screen (px)
const POINTER_HEIGHT = 0.3;
const POINTER_SIZE = { fields: 2, min: 56, max: 180 };

// The camera looks at the origin and a board's cells start at its position, its middle
// (cols - 1) / 2 further in: lifted by that, a board is centred on the screen. The 6×6 board
// is; the 10×10 one, which nearly fills a landscape screen, sits half a unit higher, clear of
// the build palette; the 8×8 one in between.
const boardHeight = (cols) => (cols - 1) / 2 + (cols - 6) / 8;
// the energy bars float this high above the base of the boards
const ENERGY_BAR = 1.5;
// the preview of the other board: its frame's border (px) and what is behind its board
const PREVIEW_BORDER = 4;
const PREVIEW_BACKGROUND = Color4.FromHexString("#7FC3E0FF");

// The match's 3D scene: the two boards (Gamefield), the camera over them (BoardCamera), what
// floats above them (infoPops, energyBars, weaponIndicators) and what the match's events play
// (matchEffects); taps on a cell become match actions (src/match/boardActions.js).
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
    this.infoPops = new OneShots();
    this.playerGameField = null;
    this.opponentGameField = null;
    this.opponentGameFieldDistance = BOARD_DISTANCE;
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

    this.scene = new BabylonScene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    this.renderLoop = new RenderLoop(this.engine, this.scene);
    this.requestRender = this.renderLoop.request;
    this.boardCamera = new BoardCamera({
      scene: this.scene,
      canvas: this.container,
      board: () => ({
        cols: typeof this.props.game !== "undefined" ? this.props.game.board.size.cols : 10,
        topInset: this.props.boardTopInset,
      }),
      canZoom: () => this.playerGameField !== null && (!this.props.tutorial || this.props.tutorialInteractive),
      onView: this.viewChanged,
      onSwipeThrough: () => this.props.toggleBoardView(),
      onTap: this.tapBoard,
      requestRender: () => this.requestRender(),
      setRenderLoop: (run) => this.setRenderLoop(run),
    });
    this.camera = this.boardCamera.camera;
    applyLook(this.scene);
    this.loadingView.current.loadAssets(this.scene);
    this.boardCamera.attach();
    window.addEventListener("resize", this.resize);

    this.energyBars = new EnergyBars({
      scene: this.scene,
      setRenderLoop: (run) => this.setRenderLoop(run),
      height: () => this.heightAbove(ENERGY_BAR),
    });
    this.weaponIndicators = new WeaponIndicators({
      scene: this.scene,
      requestRender: () => this.requestRender(),
      setRenderLoop: (run) => this.setRenderLoop(run),
      current: () =>
        typeof this.props.game === "undefined" || typeof matchSession.host === "undefined" || this.matchEnded()
          ? null
          : { view: this.props.game, now: matchSession.host.now() },
      onShotReady: (entity, attackType) => this.spawnInfo(InfoType.SHOT_READY, entity.position, 1, attackType),
    });
  }

  // what the tests and the visual checks read of the camera (window.__battlechocScene)
  get views() {
    return this.boardCamera.views;
  }

  get between() {
    return this.boardCamera.between;
  }

  get flight() {
    return this.boardCamera.flight;
  }

  get lookAtOpponent() {
    return this.boardCamera.lookAtOpponent;
  }

  set lookAtOpponent(lookAtOpponent) {
    this.boardCamera.lookAtOpponent = lookAtOpponent;
  }

  get renderLoopRepetitions() {
    return this.renderLoop.repetitions;
  }

  sideways() {
    return this.boardCamera.sideways();
  }

  zoomBy(factor, x, y) {
    this.boardCamera.zoomBy(factor, x, y);
  }

  fitBoard = () => this.boardCamera.fitBoard();

  componentWillUnmount() {
    window.removeEventListener("resize", this.resize);
    this.boardCamera.detach();
    this.weaponIndicators.stop();
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

  // a floating info over a cell (src/3d/infoPops.js); the tests wrap this method
  spawnInfo(messageType, position, amount, donutType) {
    // the floating infos belong to a running match: none once the end screen shows
    if (this.matchEnded()) {
      return;
    }
    const { color } = this.props.theme;
    spawnInfoPop(
      {
        scene: this.scene,
        pops: this.infoPops,
        setRenderLoop: (run) => this.setRenderLoop(run),
        // starts right above the units of the board (boards sit lower the smaller they are)
        height: this.heightAbove(1),
        colors: { gain: color.primary.light, cost: color.accent.light },
      },
      messageType,
      position,
      amount,
      donutType
    );
  }

  showEnergyBar(entity, position) {
    this.energyBars.show(entity, position);
  }

  estimateOrthographicSize() {
    this.boardCamera.fit();
  }

  // The camera shows another window of a board: the whole-board button comes with the first bit
  // of zoom and goes with the last; the preview then shows the board in view with the part of
  // it on the screen (showPreview).
  viewChanged = (view, bounds) => {
    const zoomed = view.zoom > 1.01;
    if (zoomed !== this.state.zoomed) {
      this.setState({ zoomed }, () => this.state.preview && this.showPreview());
    } else if (zoomed && this.state.preview) {
      this.updateMinimap(bounds);
    }
  };

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
      gamefield.onCellTap(row, col, pick.pickedMesh.position);
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
    this.weaponIndicators.clear();
    // the boards' explosions and melting cells end with them, none of their timers runs later
    [this.playerGameField, this.opponentGameField].forEach((field) => field && field.dispose());
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
        // only when the picture changed (cannonPick compares), never on every frame
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

  // the board takes taps in matches and in the tutorial lesson, not in the demos
  takesTaps() {
    return !this.props.tutorial || this.props.tutorialInteractive;
  }

  // a tap on a cell of the own board; `position` is the place of the tapped mesh
  playerFieldClick(row, col, position) {
    if (!this.takesTaps()) {
      return;
    }
    tapOwnCell(this.props.game, this.props.selectedBuilding, { row, col }, {
      submit,
      ignoreRuleErrors,
      factoryPlaced: () => Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD),
      donutPlaced: (next) => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
        if (next) {
          this.props.selectBuilding(next);
          this.props.tapBuilding(next);
        } else {
          this.props.deselectBuildings();
        }
      },
      built: (costs) => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
        if (costs > 0) {
          this.spawnInfo(InfoType.CACAO_CONSUMED, position.clone(), costs);
        }
      },
    });
  }

  opponentFieldClick(row, col) {
    if (!this.takesTaps()) {
      return;
    }
    tapOpponentCell(this.props.game, this.props.selectedAttack, { row, col }, {
      submit,
      ignoreRuleErrors,
      // no shot available: the weapon's button flashes
      denied: (attackType) => this.props.attackDenied(attackType),
    });
  }

  matchEnded() {
    return typeof this.props.game !== "undefined" && this.props.game.phase === engine.MatchPhase.ENDED;
  }

  // takes the floating infos away, also those still on their way up
  stopInfos() {
    this.infoPops.stopAll();
  }

  // a height `offset` above the base of the boards (of `cols` columns, the match's by default)
  heightAbove(offset, cols = this.props.game ? this.props.game.board.size.cols : 10) {
    return boardHeight(cols) + offset;
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
    // The boards, the indicators above the units and the floating infos follow the match's
    // view, nothing else. Every other update of this component (the preview's place, the
    // tutorial's hand, the zoom, the cannon spots) used to diff both boards and redraw the
    // indicators as well.
    if (prevProps.game !== this.props.game) {
      this.syncBoards();
      showProduction(prevProps.game, this.props.game, (...info) => this.spawnInfo(...info));
    }
    if (prevProps.matchEvents !== this.props.matchEvents) {
      this.playMatchEvents(this.props.matchEvents);
    }
  }

  // explosions, trap icons and sounds for attacks of both players (src/3d/matchEffects.js)
  playMatchEvents(events) {
    playMatchEvents(events, this.props.game, {
      playSound: (name) => Jukebox.playSound(Jukebox.SOUNDS[name]),
      spawnInfo: (...info) => this.spawnInfo(...info),
      detonate: (row, col, ownBoard) =>
        detonate(
          this.scene,
          ownBoard ? this.playerGameField : this.opponentGameField,
          row,
          col,
          this.heightAbove(0.5)
        ),
      // just above the cell's chocolate piece, wherever the board sits (boardHeight)
      chocolateFlash: (position) =>
        chocolateFlash(this.scene, position, this.heightAbove(0.6), (run) => this.setRenderLoop(run)),
      showEnergyBar: (entity, position) => this.showEnergyBar(entity, position),
      newDonuts: () => {
        // the tutorial's coach card explains donuts itself
        if (!this.props.tutorial) {
          this.props.showQuickMessage({ text: t(tr.MATCH_NEW_DONUTS), autoHideDuration: 3000 });
        }
      },
    });
  }

  // the meshes of both boards and the indicators above the units as the view has them
  syncBoards() {
    this.opponentGameField.update();
    this.playerGameField.update();
    this.syncWeaponIndicators();
    this.requestRender();
  }

  // the donuts above the own weapon units and producers (src/3d/weaponIndicators.js), while
  // the match runs
  syncWeaponIndicators() {
    const view = this.props.game;
    if (typeof view === "undefined" || this.playerGameField === null || view.phase !== engine.MatchPhase.RUNNING) {
      return;
    }
    const grid = view.board.fields[view.players[view.viewer].fieldIndex].grid;
    this.weaponIndicators.sync(grid, this.heightAbove(ENERGY_BAR, view.board.size.cols));
  }

  setRenderLoop(run = true) {
    this.renderLoop.run(run);
  }

  // the camera flies to the board in front, from wherever it is (a swipe may have brought it
  // part of the way); the view glides to that board's zoom and place along with it
  performCameraFlight = () => {
    this.boardCamera.flyToBoard();
  };

  // the camera at the own board, nothing on its way
  resetCamera() {
    this.boardCamera.reset();
  }

  startGame = (game) => {
    // the viewer's board is in front, the opponent's behind it; the player switches freely
    const playerFieldIndex = game.players[game.viewer].fieldIndex;
    const opponentFieldIndex = game.players[1 - game.viewer].fieldIndex;
    this.lookAtOpponent = false;
    this.resetCamera();

    const gamefieldHeight = boardHeight(game.board.size.cols);
    const board = (own, fieldIdx, position, onCellTap) =>
      new Gamefield({
        own,
        position,
        getField: () => this.props.game.board.fields[fieldIdx],
        fieldIdx,
        size: game.board.size,
        scene: this.scene,
        onCellTap,
        setRenderLoop: (run) => this.setRenderLoop(run),
        requestRender: this.requestRender,
      });
    this.playerGameField = board(true, playerFieldIndex, new Vector3(0, gamefieldHeight, 0), (row, col, position) =>
      this.playerFieldClick(row, col, position)
    );
    this.opponentGameField = board(
      false,
      opponentFieldIndex,
      new Vector3(-this.opponentGameFieldDistance, gamefieldHeight, this.opponentGameFieldDistance),
      (row, col) => this.opponentFieldClick(row, col)
    );

    // the indicators above the units of a match resumed while running (the next view, which
    // used to bring them, may be seconds away)
    this.syncWeaponIndicators();
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

  renderFitButton({ left, top, height, edgeLeft, edgeTop, fab, gap }, where) {
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
