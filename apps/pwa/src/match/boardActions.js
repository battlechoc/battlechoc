// What a tap on a cell of a board does in a match: the scene finds the cell (Scene.tapBoard),
// this sends the match action, and the caller's `effects` show what follows. Rules only, no 3D;
// `effects.submit` and `effects.ignoreRuleErrors` come from src/ui/match/submit.js.
import {
  engine,
  EntityType,
  isDonut,
} from "@battlechoc/battlechoc-shared-functions";

// the refusals of a shot that flash the weapon's button (no shot available); a target with
// nothing to hit just does nothing
const DENIED = [
  "WeaponNotReadyError",
  "NoCacaoLeftError",
  "NoAttacksLeftError",
  "StunnedError",
];

/**
 * A tap on a cell of the own board: places the factory, a donut or the selected building.
 * @param {object} view the match view
 * @param {string} [selected] the selected building or donut type
 * @param {{row: number, col: number}} cell
 * @param {object} effects submit(type, payload) and ignoreRuleErrors(error), and what follows
 *   a success: factoryPlaced(), donutPlaced(next) with the donut to place next (the red portal
 *   after the blue one) or undefined, built(costs) with the cacao it cost
 * @returns {Promise|undefined} the action on its way, undefined when the tap does nothing
 */
export const tapOwnCell = (view, selected, { row, col }, effects) => {
  const { MatchPhase, MatchActionTypes } = engine;
  if (view.phase === MatchPhase.PLACEMENT) {
    return effects
      .submit(MatchActionTypes.placeFactory, { row, col })
      .then(() => effects.factoryPlaced())
      .catch(effects.ignoreRuleErrors);
  }
  if (view.phase !== MatchPhase.RUNNING || typeof selected === "undefined") {
    return undefined;
  }
  if (isDonut(selected)) {
    return effects
      .submit(MatchActionTypes.placeDonut, { donutType: selected, row, col })
      .then(() =>
        effects.donutPlaced(
          selected === EntityType.DONUT_PORTAL_BLUE
            ? EntityType.DONUT_PORTAL_RED
            : undefined
        )
      )
      .catch(effects.ignoreRuleErrors);
  }
  // what it costs before it is built (the costs rise with every building)
  const costs = engine.buildCosts(view, view.viewer, selected);
  return effects
    .submit(MatchActionTypes.build, { entityType: selected, row, col })
    .then(() => effects.built(costs))
    .catch(effects.ignoreRuleErrors);
};

/**
 * A tap on a cell of the opponent's board: fires the selected weapon there (early, for cacao,
 * when it is still charging).
 * @param {object} view the match view
 * @param {string} [attackType] the selected weapon's attack type
 * @param {{row: number, col: number}} cell
 * @param {object} effects submit, ignoreRuleErrors and denied(attackType): no shot available
 * @returns {Promise|undefined} the shot on its way, undefined when the tap does nothing
 */
export const tapOpponentCell = (view, attackType, { row, col }, effects) => {
  if (
    view.phase !== engine.MatchPhase.RUNNING ||
    typeof attackType === "undefined"
  ) {
    return undefined;
  }
  return effects
    .submit(engine.MatchActionTypes.attack, {
      attackType,
      row,
      col,
      allowRush: true,
    })
    .catch((error) => {
      // the rule error's code (shared errors.js); online it travels as ruleName
      const name = (error && (error.ruleName || error.code)) || "";
      if (DENIED.includes(name)) {
        effects.denied(attackType);
      }
      return effects.ignoreRuleErrors(error);
    });
};
