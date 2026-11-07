// Zooming into a board and moving around on it (the user's choice, 2026-10-31: the match starts
// with the whole board, the player zooms in themself). A board's view is how far in (zoom 1 is
// the whole board, as the camera fits it) and where, as an offset of the camera's window in
// world units of the view plane. The view only ever shows what the fitted view showed: the
// board cannot be pushed out of the picture, and at zoom 1 there is nothing to move.
//
// Pure functions on {zoom, x, y}; the Scene applies them to the orthographic camera's bounds.
// `fit` is what the camera fits the board with: distance (half the height of the fitted window),
// ratio (width / height) and shift (the window's lift in the tutorial, src/3d/Scene.jsx).

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

/** The whole board, as the camera fits it. */
export const fitView = () => ({ zoom: ZOOM_MIN, x: 0, y: 0 });

/** The camera's window in world units for a view: {left, right, top, bottom}. */
export const orthoBounds = ({ distance, ratio, shift = 0 }, view) => {
  const halfHeight = distance / view.zoom;
  const halfWidth = halfHeight * ratio;
  return {
    left: -halfWidth + view.x,
    right: halfWidth + view.x,
    top: halfHeight + shift + view.y,
    bottom: -halfHeight + shift + view.y,
  };
};

/** The view within its limits: between the zooms, never beyond the fitted window. */
export const clampView = ({ distance, ratio }, view) => {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom));
  const slackY = distance * (1 - 1 / zoom);
  const slackX = slackY * ratio;
  // (+ 0: never a negative zero, which the tests and sameView would trip over)
  return {
    zoom,
    x: Math.min(slackX, Math.max(-slackX, view.x)) + 0,
    y: Math.min(slackY, Math.max(-slackY, view.y)) + 0,
  };
};

/**
 * Zooms by `factor` about a point of the screen (`px`, `py` as fractions of the canvas, from
 * the top left): what is under that point stays under it, as far as the limits allow.
 */
export const zoomAbout = (fit, view, factor, px = 0.5, py = 0.5) => {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * factor));
  const before = orthoBounds(fit, view);
  // the world point under the pointer
  const worldX = before.left + px * (before.right - before.left);
  const worldY = before.top - py * (before.top - before.bottom);
  // the window at the new zoom, with that point in the same place of the screen
  const halfHeight = fit.distance / zoom;
  const halfWidth = halfHeight * fit.ratio;
  const left = worldX - px * 2 * halfWidth;
  const top = worldY + py * 2 * halfHeight;
  return clampView(fit, {
    zoom,
    x: left + halfWidth,
    y: top - halfHeight - (fit.shift || 0),
  });
};

/** Moves the view with a drag of `dx`, `dy` pixels on a canvas `width` by `height` pixels. */
export const panBy = (fit, view, dx, dy, width, height) => {
  const bounds = orthoBounds(fit, view);
  const perPixel = (bounds.right - bounds.left) / width;
  const perPixelY = (bounds.top - bounds.bottom) / height;
  return clampView(fit, { zoom: view.zoom, x: view.x - dx * perPixel, y: view.y + dy * perPixelY });
};

/** Between two views, `t` from 0 to 1 (the zoom in log steps, so both halves feel alike). */
export const lerpView = (from, to, t) => ({
  zoom: from.zoom * Math.pow(to.zoom / from.zoom, t),
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

export const sameView = (a, b) =>
  Math.abs(a.zoom - b.zoom) < 1e-6 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

// Between the boards: 0 is the own board, 1 the opponent's; the Scene moves the camera along
// the line between them, a swipe scrubs it. A drag of `dx` pixels pulls the other board in by
// what the picture moves on the screen: `perPixel` world units a pixel and `sideways` the
// other board's offset on the screen in world units (negative: it lies to the left).
export const swipeBy = (between, dx, perPixel, sideways) =>
  Math.min(1, Math.max(0, between - (dx * perPixel) / sideways)) + 0;

// A released swipe goes on to the other board this far along the way, or when flicked this
// fast (`speed`: CSS pixels per millisecond toward the other board, the same on every screen)
// after a twentieth of the way; otherwise it springs back
export const SWIPE_SNAP = 0.3;
export const SWIPE_FLICK = 0.5;
export const swipeGoesOn = (start, between, speed) => {
  const progress = (between - start) * (start === 0 ? 1 : -1);
  return progress > SWIPE_SNAP || (progress > 0.05 && speed > SWIPE_FLICK);
};

// A finger or a mouse button moving less than this is a tap (CSS pixels)
export const TAP_SLACK = 8;

/**
 * Tells taps, drags, pinches and the wheel apart on an element (pointer events). No double
 * tap: firing many cannons means tapping fast, every tap must count. Coordinates are CSS
 * pixels from the element's top left. The handlers:
 *   onTap(x, y)            a press and release that did not move
 *   onPan(dx, dy)          a drag by dx, dy pixels since the last call
 *   onPanEnd()             the last finger or the button went up after a drag or a pinch
 *   onPinch(factor, x, y)  two fingers: their distance grew by factor, about their middle
 *   onWheel(deltaY, x, y, pinch)  the wheel, or a trackpad pinch (ctrl + wheel)
 * `enabled()` says whether drags and zooms count right now (taps always do).
 */
export const attachGestures = (element, { onTap, onPan, onPanEnd = () => {}, onPinch, onWheel, enabled = () => true }) => {
  const pointers = new Map();
  let moved = false;
  let pinching = false;

  const local = (event) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const middle = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const down = (event) => {
    // the mouse's other buttons drag too; a context menu or autoscroll would get in the way
    if (event.pointerType === "mouse" && event.button !== 0) {
      event.preventDefault();
    }
    const point = local(event);
    pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y });
    if (pointers.size === 1) {
      moved = false;
      pinching = false;
    } else if (pointers.size === 2) {
      pinching = true;
      moved = true;
    }
    if (element.setPointerCapture) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // a pointer that is gone already
      }
    }
  };

  const move = (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      return;
    }
    const point = local(event);
    if (pointers.size === 2 && enabled()) {
      const before = distance();
      const middleBefore = middle();
      pointer.x = point.x;
      pointer.y = point.y;
      const after = distance();
      const middleAfter = middle();
      if (before > 0) {
        onPinch(after / before, middleAfter.x, middleAfter.y);
      }
      onPan(middleAfter.x - middleBefore.x, middleAfter.y - middleBefore.y);
      return;
    }
    if (pointers.size !== 1 || pinching) {
      pointer.x = point.x;
      pointer.y = point.y;
      return;
    }
    if (!moved && Math.hypot(point.x - pointer.startX, point.y - pointer.startY) < TAP_SLACK) {
      return;
    }
    if (!enabled()) {
      return;
    }
    if (!moved) {
      moved = true;
      // the first step counts from where the finger went down
      onPan(point.x - pointer.startX, point.y - pointer.startY);
    } else {
      onPan(point.x - pointer.x, point.y - pointer.y);
    }
    pointer.x = point.x;
    pointer.y = point.y;
  };

  const up = (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      return;
    }
    pointers.delete(event.pointerId);
    if (pointers.size > 0) {
      return;
    }
    if (moved || event.type === "pointercancel") {
      const dragged = moved;
      pinching = false;
      moved = false;
      if (dragged) {
        onPanEnd();
      }
      return;
    }
    const point = local(event);
    onTap(point.x, point.y);
  };

  const wheel = (event) => {
    if (!enabled()) {
      return;
    }
    event.preventDefault();
    const point = local(event);
    // lines or pages instead of pixels: Firefox with a mouse wheel
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    onWheel(event.deltaY * scale, point.x, point.y, event.ctrlKey);
  };

  const swallow = (event) => event.preventDefault();

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("contextmenu", swallow);
  // Safari's own pinch zoom of the page
  element.addEventListener("gesturestart", swallow);
  return () => {
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("contextmenu", swallow);
    element.removeEventListener("gesturestart", swallow);
  };
};
