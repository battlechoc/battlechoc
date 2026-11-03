import { Vector3 } from "./babylon.js";
import { EntityType, engine } from "@battlechoc/battlechoc-shared-functions";

// While a fruit cannon is selected, the own truffle cannons it can replace come to the front:
// the screen dims, their cells stay in a soft light, and a gold frame runs along the edges of
// their chocolate pieces; the HUD keeps its colours (Scene renders it as an SVG mask below the
// HUD). The user's pick from four looks in the play test of 2026-10-30 was a circle of light
// per cannon; on neighbouring cannons the circles crossed (2026-11-03), so now the cells
// themselves are lit and neighbours share one frame: an edge between two lit cells is not drawn.

/** The own cells with a truffle cannon a fruit cannon can replace, in the player's view. */
export const cannonCells = (view) =>
  view.board.fields[view.players[view.viewer].fieldIndex].grid
    .filter(
      (cell) =>
        !cell.molten &&
        cell.occupiedBy.some(
          (entity) => entity.type === EntityType.RUM_TRUFFLE_CANNON,
        ),
    )
    .map((cell) => ({ row: cell.row, col: cell.col }));

/**
 * Whether the player can build a fruit cannon right now: a truffle cannon to replace, a free
 * building slot, enough cacao and room on the field. While it can't, nothing stands out.
 */
export const fruitCannonPossible = (view) => {
  if (!view || view.phase !== engine.MatchPhase.RUNNING) {
    return false;
  }
  const me = view.players[view.viewer];
  const spec = view.balance.entities[EntityType.FRUIT_CANNON] || {};
  const fruitCannons = view.board.fields[me.fieldIndex].grid.filter((cell) =>
    cell.occupiedBy.some((entity) => entity.type === EntityType.FRUIT_CANNON),
  ).length;
  return (
    cannonCells(view).length > 0 &&
    me.buildTokens >= 1 &&
    me.cacao >= engine.buildCosts(view, view.viewer, EntityType.FRUIT_CANNON) &&
    !(spec.maxPerField && fruitCannons >= spec.maxPerField)
  );
};

// the top of a chocolate piece above its cell's position, and the height of the cream on it
const TILE_TOP = 0.26;
const CREAM_HEIGHT = 0.9;
// the four edges of a cell: the corner offsets of each and the neighbour across it
const EDGES = [
  { from: [-0.5, -0.5], to: [0.5, -0.5], across: [0, -1] },
  { from: [0.5, -0.5], to: [0.5, 0.5], across: [1, 0] },
  { from: [0.5, 0.5], to: [-0.5, 0.5], across: [0, 1] },
  { from: [-0.5, 0.5], to: [-0.5, -0.5], across: [-1, 0] },
];

/**
 * The outline of the cells together: every cell edge with no lit cell across it, as pairs of
 * corners in grid units ([row, col]). Neighbours form one frame.
 */
export const outlineEdges = (cells) => {
  const lit = new Set(cells.map(({ row, col }) => `${row}.${col}`));
  return cells.flatMap(({ row, col }) =>
    EDGES.filter(
      ({ across }) => !lit.has(`${row + across[0]}.${col + across[1]}`),
    ).map(({ from, to }) => [
      [row + from[0], col + from[1]],
      [row + to[0], col + to[1]],
    ]),
  );
};

/**
 * Puts the cannons of `cells` on the own board (`field`, a Gamefield) in the light: hands
 * `onSpots` their places on the screen (CSS pixels of the canvas), every frame while it shows
 * (the camera may still fly to the own board): `frame`, the outline's edges along the tops of
 * the chocolate pieces; `lights`, a polygon per cell from a little around its piece up to the
 * top of its cream; `blur`, how softly the light fades. Returns the function that ends it.
 */
export const showCannonPick = ({
  scene,
  camera,
  field,
  cells,
  onSpots,
  requestRender,
}) => {
  const edges = outlineEdges(cells);
  const update = () => {
    const canvas = scene.getEngine().getRenderingCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const transform = camera
      .getViewMatrix()
      .multiply(camera.getProjectionMatrix());
    const project = (row, col, up) => {
      const point = Vector3.TransformCoordinates(
        field.position.add(new Vector3(row, TILE_TOP + up, col)),
        transform,
      );
      return [((point.x + 1) / 2) * width, ((1 - point.y) / 2) * height];
    };
    const frame = edges.map(([from, to]) => [
      project(from[0], from[1], 0),
      project(to[0], to[1], 0),
    ]);
    // the cell's square, grown, at the top of the piece and at the top of the cream, and the
    // band between them: together the column of light on the cell
    const lights = cells.map(({ row, col }) => {
      const square = (up) =>
        EDGES.map(({ from }) =>
          project(row + from[0] * 1.3, col + from[1] * 1.3, up),
        );
      const bottom = square(0);
      const top = square(CREAM_HEIGHT);
      const leftmost = bottom.reduce(
        (best, p, i) => (p[0] < bottom[best][0] ? i : best),
        0,
      );
      const rightmost = bottom.reduce(
        (best, p, i) => (p[0] > bottom[best][0] ? i : best),
        0,
      );
      return [
        bottom,
        top,
        [bottom[leftmost], top[leftmost], top[rightmost], bottom[rightmost]],
      ];
    });
    const pixelsPerUnit = height / (camera.orthoTop - camera.orthoBottom);
    onSpots({
      frame,
      lights,
      blur: 0.12 * pixelsPerUnit,
      stroke: Math.max(3, 0.05 * pixelsPerUnit),
    });
  };
  const observer = scene.onAfterRenderObservable.add(update);
  update();
  requestRender();
  return () => {
    scene.onAfterRenderObservable.remove(observer);
    onSpots(null);
  };
};
