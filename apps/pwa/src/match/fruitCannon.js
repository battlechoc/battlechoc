import { EntityType, engine } from "@battlechoc/battlechoc-shared-functions";

// What the build palette and the scene ask about the fruit cannon, which replaces a truffle
// cannon. Rules only: the palette is part of the first load and must not pull in the 3D engine
// (the cannons' light is src/3d/cannonPick.js).

/** The own cells with a truffle cannon a fruit cannon can replace, in the player's view. */
export const cannonCells = (view) =>
  view.board.fields[view.players[view.viewer].fieldIndex].grid
    .filter(
      (cell) =>
        !cell.molten &&
        cell.occupiedBy.some(
          (entity) => entity.type === EntityType.RUM_TRUFFLE_CANNON
        )
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
