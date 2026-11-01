import { Vector3 } from "./babylon.js";
import { EntityType, engine } from "@battlechoc/battlechoc-shared-functions";

// While a fruit cannon is selected, the own truffle cannons it can replace come to the front:
// the screen dims, each cannon sits in a soft circle of light with a thick gold rim, the HUD
// keeps its colours (Scene renders the circles as an SVG mask below the HUD). The user's pick
// from four looks in the play test of 2026-10-30 (the old yellow glow on every truffle cannon,
// the opponent's too, looked odd; a pulsing ring vanished behind the cream, a lift hardly showed).

/** The own cells with a truffle cannon a fruit cannon can replace, in the player's view. */
export const cannonCells = (view) =>
  view.board.fields[view.players[view.viewer].fieldIndex].grid
    .filter(
      (cell) =>
        !cell.molten &&
        cell.occupiedBy.some((entity) => entity.type === EntityType.RUM_TRUFFLE_CANNON)
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
    cell.occupiedBy.some((entity) => entity.type === EntityType.FRUIT_CANNON)
  ).length;
  return (
    cannonCells(view).length > 0 &&
    me.buildTokens >= 1 &&
    me.cacao >= engine.buildCosts(view, view.viewer, EntityType.FRUIT_CANNON) &&
    !(spec.maxPerField && fruitCannons >= spec.maxPerField)
  );
};

/**
 * Puts the cannons of `cells` on the own board (`field`, a Gamefield) in the light: hands their
 * places on the screen (CSS pixels of the canvas) and the circles' radius to `onSpots`, every
 * frame while it shows (the camera may still fly to the own board). Returns the function that
 * ends it.
 */
export const showCannonPick = ({ scene, camera, field, cells, onSpots, requestRender }) => {
  const update = () => {
    const canvas = scene.getEngine().getRenderingCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
    const spots = cells.map(({ row, col }) => {
      const point = Vector3.TransformCoordinates(
        field.position.add(new Vector3(row, 0.45, col)),
        transform
      );
      return {
        x: Math.round(((point.x + 1) / 2) * width),
        y: Math.round(((1 - point.y) / 2) * height),
      };
    });
    // a cell is about 1.4 world units wide on the screen
    const radius = Math.round((0.85 * height) / (camera.orthoTop - camera.orthoBottom));
    onSpots({ spots, radius });
  };
  const observer = scene.onAfterRenderObservable.add(update);
  update();
  requestRender();
  return () => {
    scene.onAfterRenderObservable.remove(observer);
    onSpots(null);
  };
};
