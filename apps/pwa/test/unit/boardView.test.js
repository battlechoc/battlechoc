// The zoom and pan sums of src/3d/boardView.js (node --test): the view never shows more than
// the fitted board, a zoom keeps the point under the pointer still, and a drag moves by the
// pixels dragged.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitView,
  orthoBounds,
  clampView,
  zoomAbout,
  panBy,
  lerpView,
  swipeBy,
  swipeGoesOn,
  ZOOM_MAX,
} from "../../src/3d/boardView.js";

// a 1000 by 500 screen fitting a board with 5 world units of half height
const fit = { distance: 5, ratio: 2, shift: 0 };
const close = (a, b, message) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

test("the fitted view is the camera's whole window", () => {
  assert.deepEqual(orthoBounds(fit, fitView()), {
    left: -10,
    right: 10,
    top: 5,
    bottom: -5,
  });
});

test("the tutorial's lift moves the window, not the view", () => {
  const bounds = orthoBounds({ ...fit, shift: 1 }, fitView());
  assert.deepEqual(bounds, { left: -10, right: 10, top: 6, bottom: -4 });
});

test("at zoom 1 there is nowhere to go", () => {
  assert.deepEqual(clampView(fit, { zoom: 1, x: 3, y: -2 }), {
    zoom: 1,
    x: 0,
    y: 0,
  });
});

test("zoomed in, the window stays inside the fitted one", () => {
  const view = clampView(fit, { zoom: 2, x: 100, y: -100 });
  assert.deepEqual(view, { zoom: 2, x: 5, y: -2.5 });
  const bounds = orthoBounds(fit, view);
  close(bounds.right, 10, "right edge");
  close(bounds.bottom, -5, "bottom edge");
});

test("the zoom stops at its limits", () => {
  assert.equal(clampView(fit, { zoom: 0.5, x: 0, y: 0 }).zoom, 1);
  assert.equal(clampView(fit, { zoom: 9, x: 0, y: 0 }).zoom, ZOOM_MAX);
});

test("zooming about a point keeps that point under the pointer", () => {
  // the pointer at a quarter of the width and three quarters of the height: world (-5, -2.5)
  const view = zoomAbout(fit, fitView(), 2, 0.25, 0.75);
  assert.equal(view.zoom, 2);
  const bounds = orthoBounds(fit, view);
  close(
    bounds.left + 0.25 * (bounds.right - bounds.left),
    -5,
    "x under the pointer"
  );
  close(
    bounds.top - 0.75 * (bounds.top - bounds.bottom),
    -2.5,
    "y under the pointer"
  );
});

test("zooming about a corner cannot leave the board: the window stops at the edge", () => {
  const view = zoomAbout(fit, fitView(), 2, 0, 0);
  const bounds = orthoBounds(fit, view);
  close(bounds.left, -10, "left edge");
  close(bounds.top, 5, "top edge");
});

test("zooming out to 1 lands on the whole board again", () => {
  const zoomed = zoomAbout(fit, fitView(), 2, 0.9, 0.1);
  assert.deepEqual(zoomAbout(fit, zoomed, 0.5, 0.2, 0.8), fitView());
});

test("a drag moves the view by the pixels dragged", () => {
  const view = clampView(fit, { zoom: 2, x: 0, y: 0 });
  // at zoom 2 the window is 10 units over 1000 px: 100 px are one unit; the view follows the
  // finger, so the window moves the other way
  const moved = panBy(fit, view, 100, -50, 1000, 500);
  close(moved.x, -1, "x");
  close(moved.y, -0.5, "y");
});

test("a view glides between two others, the zoom in even steps of its ratio", () => {
  const middle = lerpView(
    { zoom: 1, x: 0, y: 0 },
    { zoom: 4, x: 2, y: -2 },
    0.5
  );
  close(middle.zoom, 2, "zoom");
  close(middle.x, 1, "x");
  close(middle.y, -1, "y");
});

test("a swipe pulls the other board in by what the picture moves, and no further than it", () => {
  // the other board 17 units to the left, 50 px a unit: a drag to the right by 170 px is a
  // fifth of the way; past the end it stops
  close(swipeBy(0, 170, 0.02, -17), 0.2, "a fifth");
  close(swipeBy(0.2, -170, 0.02, -17), 0, "back");
  assert.equal(swipeBy(0, -100, 0.02, -17), 0);
  assert.equal(swipeBy(0.9, 1000, 0.02, -17), 1);
  // the other board to the right: a drag to the left pulls it in
  close(swipeBy(0, -170, 0.02, 17), 0.2, "to the right");
});

test("a released swipe goes on past a third of the way or with a flick, else springs back", () => {
  assert.equal(swipeGoesOn(0, 0.2, 0), false);
  assert.equal(swipeGoesOn(0, 0.35, 0), true);
  assert.equal(swipeGoesOn(0, 0.1, 1), true);
  assert.equal(swipeGoesOn(0, 0.1, 0.2), false);
  assert.equal(swipeGoesOn(0, 0.02, 1), false);
  // from the opponent's board back: the way counts the other way
  assert.equal(swipeGoesOn(1, 0.6, 0), true);
  assert.equal(swipeGoesOn(1, 0.8, 0), false);
  assert.equal(swipeGoesOn(1, 0.8, 1), true);
});
