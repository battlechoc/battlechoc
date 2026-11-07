// A running match on a 6×6 board with prepared cells, for the unit tests of the scene's parts.
import { engine, PlayerType } from "@battlechoc/battlechoc-shared-functions";

// `cells`: [{ player, row, col, entities: [EntityType…], cream }], see engine.prepareScenario
export const runningMatch = (
  cells,
  { phase = engine.MatchPhase.RUNNING } = {}
) => {
  const match = engine.createMatch({
    players: [
      { id: "a", name: "A", type: PlayerType.HUMAN },
      { id: "b", name: "B", type: PlayerType.AI_STRONG },
    ],
    boardSize: { rows: 6, cols: 6 },
    seed: "scene-unit",
  });
  engine.prepareScenario(match, { clear: true, phase, cells });
  return match;
};

// the view of player 0 at match time `t` (the match advances there)
export const viewAt = (match, t = match.t) => {
  engine.advanceTo(match, t);
  return engine.getPlayerView(match, 0);
};

// the entity of `type` in a view, on the viewer's board (own) or the opponent's
export const entityOf = (view, type, own = true) => {
  const player = own ? view.viewer : 1 - view.viewer;
  const grid = view.board.fields[view.players[player].fieldIndex].grid;
  for (const cell of grid) {
    const entity = cell.occupiedBy.find((candidate) => candidate.type === type);
    if (entity) {
      return entity;
    }
  }
  return undefined;
};
