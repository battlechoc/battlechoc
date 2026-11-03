import {
  Vector3,
  Color3,
  Engine,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
} from "./babylon.js";
import { EntityType, engine } from "@battlechoc/battlechoc-shared-functions";

// While a fruit cannon is selected, the own truffle cannons it can replace come to the front:
// the screen dims, their cells stay in the light, and a warm pool of light lies on the board
// around each cannon and breathes slowly; the HUD keeps its colours (Scene renders the dimming
// as an SVG mask below the HUD, the pools are meshes). The user's pick from four looks in the
// play test of 2026-10-30 was a circle of light with a gold rim per cannon; on neighbouring
// cannons the rims crossed, and of the looks tried on 2026-11-03 the user chose the pools of
// light ("I is perfect"): neighbours' pools simply add up.

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
// the corners of a cell around its position
const CORNERS = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];
// the pool of light: its width in cells, how it breathes (between the two strengths, once per
// period) and its warm gold
const POOL_SIZE = 2.0;
const POOL_PULSE = { low: 0.7, high: 1.0, periodMs: 1800 };
const POOL_GOLD = new Color3(1, 0.85, 0.4);

/** The light's texture: a soft round gradient, bright in the middle, gone at the edge. */
const poolTexture = (scene) => {
  const texture = new DynamicTexture("cannon-pool", 256, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 215, 110, 1)");
  gradient.addColorStop(0.45, "rgba(255, 200, 80, 0.55)");
  gradient.addColorStop(1, "rgba(255, 190, 60, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  texture.update();
  texture.hasAlpha = true;
  return texture;
};

/**
 * Lays a pool of light on the board (`field`, a Gamefield) around each of `cells`: a plane just
 * above the chocolate, lit by itself, added to what is under it. The pools breathe while they
 * show, so the scene must render continuously meanwhile (`setRenderLoop`). Returns the
 * function that takes them away.
 */
const lightPools = ({ scene, field, cells, setRenderLoop }) => {
  const texture = poolTexture(scene);
  const material = new StandardMaterial("cannon-pool", scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = POOL_GOLD;
  material.disableLighting = true;
  material.alphaMode = Engine.ALPHA_ADD;
  material.backFaceCulling = false;
  const pools = cells.map(({ row, col }) => {
    const pool = MeshBuilder.CreatePlane(
      `cannon-pool.${row}.${col}`,
      { size: POOL_SIZE },
      scene,
    );
    pool.rotation.x = Math.PI / 2;
    pool.position = field.position.add(new Vector3(row, TILE_TOP + 0.012, col));
    pool.material = material;
    pool.isPickable = false;
    return pool;
  });
  const started = performance.now();
  const breathe = scene.onBeforeRenderObservable.add(() => {
    const phase =
      ((performance.now() - started) / POOL_PULSE.periodMs) * 2 * Math.PI;
    material.alpha =
      POOL_PULSE.low +
      ((POOL_PULSE.high - POOL_PULSE.low) * (1 + Math.sin(phase))) / 2;
  });
  setRenderLoop(true);
  return () => {
    setRenderLoop(false);
    scene.onBeforeRenderObservable.remove(breathe);
    pools.forEach((pool) => pool.dispose());
    material.dispose();
    texture.dispose();
  };
};

/**
 * Puts the cannons of `cells` on the own board in the light: pools of light around them (above),
 * and the dimming of the rest, for which `onSpots` gets, every frame while it shows (the camera
 * may still fly to the own board), `lights`: polygons in CSS pixels of the canvas, one column
 * per cell from a little around its piece up to the top of its cream, and `blur`, how softly
 * they fade. Returns the function that ends it.
 */
export const showCannonPick = ({
  scene,
  camera,
  field,
  cells,
  onSpots,
  requestRender,
  setRenderLoop,
}) => {
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
    // the cell's square, grown, at the top of the piece and at the top of the cream, and the
    // band between them: together the column of light on the cell
    const lights = cells.map(({ row, col }) => {
      const square = (up) =>
        CORNERS.map(([dr, dc]) => project(row + dr * 1.3, col + dc * 1.3, up));
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
    onSpots({ lights, blur: 0.12 * pixelsPerUnit });
  };
  const takeAway = lightPools({ scene, field, cells, setRenderLoop });
  const observer = scene.onAfterRenderObservable.add(update);
  update();
  requestRender();
  return () => {
    scene.onAfterRenderObservable.remove(observer);
    takeAway();
    onSpots(null);
  };
};
