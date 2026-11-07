// What a cell of a board shows in 3D and how its meshes leave, as plain sums (no Babylon):
// Gamefield.js draws it. The asset loader names the models by these phenotypes too.
import { EntityType, isDonut } from "@battlechoc/battlechoc-shared-functions";

const { CREAM } = EntityType;

// the cream that leaves room for a building under it (its own model)
export const CREAM_AROUND_BUILDING = CREAM + ".AROUND.BUILDING";
// the id of a cell's own chocolate piece among the meshes of the cell
export const TILE = "tile";

const hasDonut = (cell) =>
  cell.occupiedBy.some((entity) => isDonut(entity.type));
const solids = (cell) =>
  cell.occupiedBy.filter((entity) => !isDonut(entity.type));
const isCream = (phenotype) =>
  phenotype === CREAM || phenotype === CREAM_AROUND_BUILDING;

/**
 * The meshes a cell shows, as { phenotype, id }: the phenotype names the model, the id the
 * entity (TILE for the cell's chocolate piece).
 * - A molten cell shows nothing.
 * - On the own board a donut lies in place of the tile, and cream over a building is the cream
 *   that leaves room for it.
 * - On the opponent's board donuts never show, nor what lies under cream (the view leaves both
 *   out already; views from before the fog of war came from the server had them).
 */
export const cellMeshes = (cell, own) => {
  if (cell.molten) {
    return [];
  }
  const solid = solids(cell);
  const creamed = solid.some((entity) => entity.type === CREAM);
  const meshes =
    own && hasDonut(cell) ? [] : [{ phenotype: cell.type, id: TILE }];
  cell.occupiedBy.forEach((entity) => {
    if (own) {
      const aroundBuilding = entity.type === CREAM && solid.length > 1;
      meshes.push({
        phenotype: aroundBuilding ? CREAM_AROUND_BUILDING : entity.type,
        id: entity.id,
      });
    } else if (!isDonut(entity.type) && (!creamed || entity.type === CREAM)) {
      meshes.push({ phenotype: entity.type, id: entity.id });
    }
  });
  return meshes;
};

/**
 * How a mesh of a cell that the cell no longer shows goes, from the cell `before` to `after`:
 * - "burst": it explodes (the entity was destroyed);
 * - "later": it explodes a second later (a building shot away together with its cream, which
 *   bursts first);
 * - "melt": the tile of a cell that just melted;
 * - "away": it is just replaced or removed (the same entity with another model, a fruit cannon
 *   replacing a truffle cannon, a caught bunny's Xmas factory turned into a ballista, a donut,
 *   a donut that went off).
 */
export const departure = ({ phenotype, id }, before, after) => {
  if (id === TILE) {
    return after.molten && !before.molten ? "melt" : "away";
  }
  // fewer entities than before: something was destroyed; a replacement keeps the count, and a
  // trap that went off takes the cell's other changes along quietly
  const trapWentOff = hasDonut(before) && !hasDonut(after) && !after.molten;
  const destroyed =
    after.occupiedBy.length < before.occupiedBy.length && !trapWentOff;
  const stays = after.occupiedBy.some((entity) => entity.id === id);
  if (stays || !destroyed || isDonut(phenotype)) {
    return "away";
  }
  const coveredBuilding =
    !isCream(phenotype) &&
    solids(after).length === 0 &&
    before.occupiedBy.some((entity) => entity.type === CREAM) &&
    before.occupiedBy.length > 1;
  return coveredBuilding ? "later" : "burst";
};
