// The main camera over the boards: the board views (zoom and place, src/3d/boardView.js), the
// player's gestures and keys, the flight between the boards and the swipe that pulls the other
// board in. The scene tells it about the board and hears back when the view changes.
import { FlyCamera, Camera, Vector3, Animation } from "./babylon.js";
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

// The camera's place for the own board, and how far it moves to look at the opponent's (the
// boards lie 12 apart in x and z: on the screen the other one is beside, just out of view)
export const CAMERA_HOME = new Vector3(30, 30, 30);
const CAMERA_FLIGHT = new Vector3(-24, -12, 0);

export class BoardCamera {
  /**
   * @param {object} options
   * @param {Scene} options.scene the Babylon scene
   * @param {HTMLCanvasElement} options.canvas the scene's canvas, for its size and the gestures
   * @param {() => {cols: number, topInset: number}} options.board the board's columns (10 before
   *   a match) and the part of a portrait screen the tutorial's card takes at the top (px)
   * @param {() => boolean} options.canZoom whether the player may zoom and move the board now
   *   (a match or the tutorial's lesson); never while the camera flies
   * @param {(view, bounds) => void} options.onView the camera shows another window of a board
   * @param {() => void} options.onSwipeThrough a swipe went far enough: on to the other board
   * @param {(x, y) => void} options.onTap a tap on the canvas (CSS px)
   * @param {() => void} options.requestRender a frame soon
   * @param {(run?: boolean) => void} options.setRenderLoop holds the render loop while it moves
   */
  constructor({
    scene,
    canvas,
    board,
    canZoom,
    onView,
    onSwipeThrough,
    onTap,
    requestRender,
    setRenderLoop,
  }) {
    this.scene = scene;
    this.canvas = canvas;
    this.board = board;
    this.canZoom = canZoom;
    this.onView = onView;
    this.onSwipeThrough = onSwipeThrough;
    this.onTap = onTap;
    this.requestRender = requestRender;
    this.setRenderLoop = setRenderLoop;
    // the boards' views: zoom 1 and the whole board, each remembers where the player left it;
    // and a view on its way to the whole board
    this.views = { own: fitView(), opponent: fitView() };
    this.viewTransition = null;
    // where the camera is between the boards (0 the own, 1 the opponent's), its flight from
    // one to the other, and a finger dragging it there (src/3d/boardView.js, swipeBy)
    this.between = 0;
    this.flight = null;
    this.swipe = null;
    // the board in front: the opponent's or the own (false, and undefined before a match)
    this.lookAtOpponent = undefined;

    this.camera = new FlyCamera("camera", CAMERA_HOME.clone(), scene);
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0;
    this.camera.maxZ = 100;
    // (no frame yet: the scene is still being made)
    this.applyView(this.currentView(), false);
    this.camera.setTarget(Vector3.Zero());

    scene.onBeforeRenderObservable.add(() => {
      if (this.flight) {
        this.applyBetween(
          this.flight.from + (this.flight.to - this.flight.from) * this.flight.t
        );
      } else if (this.viewTransition) {
        this.applyView(
          lerpView(
            this.viewTransition.from,
            this.viewTransition.to,
            this.viewTransition.t
          )
        );
      }
    });
  }

  // The pointer is ours, not Babylon's (its input manager picked on every pointer down): a tap
  // picks a cell of a board, a drag moves the view or pulls the other board in, two fingers or
  // the wheel zoom (src/3d/boardView.js).
  attach() {
    this.scene.detachControl();
    this.detachGestures = attachGestures(this.canvas, {
      onTap: this.onTap,
      onPan: this.dragBoard,
      onPanEnd: this.endSwipe,
      onPinch: (factor, x, y) => this.zoomBy(factor, x, y),
      onWheel: (deltaY, x, y, pinch) =>
        this.zoomBy(Math.exp(-deltaY * (pinch ? 0.01 : 0.0015)), x, y),
      enabled: () => this.zoomEnabled(),
    });
    window.addEventListener("keydown", this.keyDown);
  }

  detach() {
    window.removeEventListener("keydown", this.keyDown);
    if (this.detachGestures) {
      this.detachGestures();
    }
  }

  // How the camera fits a whole board on the screen: half the height of its window in world
  // units, the screen's ratio and the window's lift (src/3d/boardView.js reckons with it).
  boardFit() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ratio = width / height;
    const { cols, topInset } = this.board();
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
    const inset = height > width ? topInset : 0;
    const shift = (inset * distance) / height + lift;
    return { distance, ratio, shift };
  }

  // the window again for the screen and the board as they are now (a resize, a new match)
  fit() {
    this.applyView(this.currentView());
  }

  // the view of the board in front: the own one before the match
  boardView() {
    return this.lookAtOpponent ? this.views.opponent : this.views.own;
  }

  // the view as it shows right now: between the boards, a mix of both views
  currentView() {
    if (this.viewTransition) {
      return lerpView(
        this.viewTransition.from,
        this.viewTransition.to,
        this.viewTransition.t
      );
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
    return Vector3.TransformNormal(CAMERA_FLIGHT, this.camera.getViewMatrix())
      .x;
  }

  setBoardView(view) {
    if (this.lookAtOpponent) {
      this.views.opponent = view;
    } else {
      this.views.own = view;
    }
  }

  // the camera's window for a view (clamped to the fitted window) and a frame soon
  applyView(view, render = true) {
    const fit = this.boardFit();
    const bounds = orthoBounds(fit, clampView(fit, view));
    this.camera.orthoLeft = bounds.left;
    this.camera.orthoRight = bounds.right;
    this.camera.orthoTop = bounds.top;
    this.camera.orthoBottom = bounds.bottom;
    this.onView(view, bounds);
    if (render) {
      this.requestRender();
    }
  }

  // zooming and moving: in a match and in the tutorial's lesson (not in the building demos,
  // they keep the whole board), not while the camera flies
  zoomEnabled() {
    return this.canZoom() && !this.viewTransition && !this.flight;
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
      zoomAbout(
        fit,
        view,
        factor,
        x / this.canvas.clientWidth,
        y / this.canvas.clientHeight
      )
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
    const width = this.canvas.clientWidth;
    const after = panBy(fit, before, dx, dy, width, this.canvas.clientHeight);
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
    const perPixel = (bounds.right - bounds.left) / this.canvas.clientWidth;
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
      const pixels =
        ((between - this.between) *
          (start === 0 ? 1 : -1) *
          Math.abs(this.sideways())) /
        perPixel;
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
      // the HUD's toggle, as the preview button: the flight follows (Scene.realtimeUpdate)
      this.onSwipeThrough();
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
    const glide = new Animation(
      "cameraFlight",
      "t",
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    glide.setKeys([
      { frame: 0, value: 0 },
      { frame: length, value: 1 },
    ]);
    this.setRenderLoop();
    this.scene.beginDirectAnimation(
      this.flight,
      [glide],
      0,
      length,
      false,
      1,
      () => {
        this.flight = null;
        this.applyBetween(to);
        this.setRenderLoop(false);
      }
    );
  }

  // the view glides from one to another over `frames` (at 30 a second)
  animateView(from, to, frames) {
    if (sameView(from, to)) {
      this.applyView(to);
      return;
    }
    this.viewTransition = { from, to, t: 0 };
    const glide = new Animation(
      "boardView",
      "t",
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    glide.setKeys([
      { frame: 0, value: 0 },
      { frame: frames, value: 1 },
    ]);
    this.setRenderLoop();
    this.scene.beginDirectAnimation(
      this.viewTransition,
      [glide],
      0,
      frames,
      false,
      1,
      () => {
        this.viewTransition = null;
        this.applyView(to);
        this.setRenderLoop(false);
      }
    );
  }

  keyDown = (event) => {
    const target = event.target;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    const middle = [this.canvas.clientWidth / 2, this.canvas.clientHeight / 2];
    if (event.key === "+" || event.key === "=") {
      this.zoomBy(1.25, ...middle);
    } else if (event.key === "-") {
      this.zoomBy(0.8, ...middle);
    } else if (event.key === "0") {
      this.fitBoard();
    }
  };

  // the camera flies to the board in front, from wherever it is (a swipe may have brought it
  // part of the way); the view glides to that board's zoom and place along with it
  flyToBoard() {
    this.animateBetween(this.lookAtOpponent ? 1 : 0);
  }

  // the camera at the own board, nothing on its way
  reset() {
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
}
