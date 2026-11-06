import {
  engine,
  EntityType,
  AttackType,
  BoardCellTypes,
  PlayerType,
  DefaultBalance,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// The first lesson: a real match on the real engine against Mimi Marzipan, who never fights
// back. A coach card walks the player through it; every step ends when the player has done
// what it asks (or, for the info steps, taps next).

const { MatchPhase, WeaponState } = engine;

const LESSON = "TutorialLesson";

const BOARD_SIZE = { rows: 6, cols: 6 };

// no deadlines while the player reads: placement and the match last up to an hour
const lessonBalance = () => {
  const balance = JSON.parse(JSON.stringify(DefaultBalance));
  balance.match.placementTimeoutMs = 60 * 60 * 1000;
  balance.match.timeLimitMs = 60 * 60 * 1000;
  return balance;
};

// Mimi's factory and one tree stand uncovered, both damaged so one hit destroys each. Without
// a factory a player cannot build anymore and loses, so the factory is the winning shot.
const lessonScenario = {
  fieldIndex: 0,
  cells: [
    { player: 1, row: 1, col: 1, cream: false, type: BoardCellTypes.BLACK, entities: [{ type: EntityType.FACTORY, hp: 6 }] },
    { player: 1, row: 3, col: 4, cream: false, type: BoardCellTypes.WHITE, entities: [{ type: EntityType.CACAOTREE, hp: 4 }] },
    { player: 1, row: 1, col: 2, cream: false },
    { player: 1, row: 2, col: 1, cream: false },
    { player: 1, row: 3, col: 3, cream: false },
  ],
};

const ownCells = (view) => view.board.fields[view.players[view.viewer].fieldIndex].grid;
const countOwn = (view, type) =>
  ownCells(view).filter((cell) => cell.occupiedBy.some((entity) => entity.type === type)).length;
const creamedOwn = (view) => countOwn(view, EntityType.CREAM);
const me = (view) => view.players[view.viewer];
const ownWeapons = (view) =>
  ownCells(view).flatMap((cell) => cell.occupiedBy.flatMap((entity) => entity.weapons || []));
const opponentCells = (view) => view.board.fields[view.players[1 - view.viewer].fieldIndex].grid;
const holds = (cell, type) => cell.occupiedBy.some((entity) => entity.type === type);
// a building may go under the cream the board starts with (hidden from the start)
const free = (cell) => !cell.molten && cell.occupiedBy.every((entity) => entity.type === EntityType.CREAM);
const distance = (a, b) => (a.row - b.row) ** 2 + (a.col - b.col) ** 2;
const nearest = (cells, to) =>
  cells.reduce((best, cell) => (best === null || distance(cell, to) < distance(best, to) ? cell : best), null);
const factoryCell = (view) => ownCells(view).find((cell) => holds(cell, EntityType.FACTORY));
const onBoard = (board, cell) => (cell ? { board, row: cell.row, col: cell.col } : null);

// Where the finger points. A spot for the factory: dark chocolate near the middle of the board.
const factorySpot = (view) => {
  const cells = ownCells(view).filter(free);
  const dark = cells.filter((cell) => cell.type === BoardCellTypes.BLACK);
  const middle = { row: (view.board.size.rows - 1) / 2, col: (view.board.size.cols - 1) / 2 };
  return onBoard("own", nearest(dark.length > 0 ? dark : cells, middle));
};

// a free field for the step's building, the nearest to the factory, of the wanted chocolate
// when there is one; nothing while the building cannot be paid for or no slot is free
const buildSpot = (view, type, wanted) => {
  const player = me(view);
  if (player.buildTokens < 1 || player.cacao < engine.buildCosts(view, view.viewer, type)) {
    return null;
  }
  const cells = ownCells(view).filter(free);
  const preferred = cells.filter(wanted);
  return onBoard("own", nearest(preferred.length > 0 ? preferred : cells, factoryCell(view)));
};

// the field whose cream hides the most buildings that still lie open (cream fills the open
// cells of its area; with nothing to hide, the most open cells), the nearest to the factory of
// those; nothing while no slot is free
const creamSpot = (view) => {
  if (me(view).buildTokens < 1) {
    return null;
  }
  const cells = ownCells(view);
  const open = (cell) => !cell.molten && !holds(cell, EntityType.CREAM);
  const building = (cell) => cell.occupiedBy.some((entity) => entity.type !== EntityType.CREAM);
  const gain = (cell) => {
    const area = engine
      .creamArea(view.balance, view.board.size, cell.row, cell.col)
      .map((spot) => cells.find((candidate) => candidate.row === spot.row && candidate.col === spot.col))
      .filter(open);
    return area.filter(building).length * 100 + area.length;
  };
  const candidates = cells.filter((cell) => !cell.molten && gain(cell) > 0);
  const most = Math.max(...candidates.map(gain));
  return onBoard("own", nearest(candidates.filter((cell) => gain(cell) === most), factoryCell(view)));
};

// a shot at one of Mimi's buildings: the cannon button until the attack is picked, then the
// building; nothing while no cannon can fire (ready, or early with the cacao for it)
const shotAt = (view, now, selectedAttack, type) => {
  const player = me(view);
  const available = ownWeapons(view).some((weapon) => {
    const status = engine.weaponStatus(view, weapon, now);
    return status.state === WeaponState.READY || (status.state === WeaponState.RUSHABLE && player.cacao >= status.rushCost);
  });
  if (!available) {
    return null;
  }
  if (!selectedAttack) {
    return { weapon: AttackType.TRUFFLE };
  }
  return onBoard("opponent", opponentCells(view).find((cell) => holds(cell, type)));
};

/**
 * Steps of the lesson. `next`: an info step the player confirms. `ready`: the step is shown
 * only once this holds (otherwise the previous card stays). `enter`: remembers values when the
 * step starts. `done`: the step is complete. `whitelist`: buildings the palette offers (one
 * building is picked for the player). `point`: where the finger points right now, a field
 * ({ board: "own" | "opponent", row, col }), a weapon button ({ weapon }) or null.
 */
const lessonSteps = [
  {
    id: "welcome",
    title: tr.TUTORIAL_INTRO_TITLE,
    message: tr.TUTORIAL_INTRO_MESSAGE,
    next: true,
    whitelist: [],
  },
  {
    id: "factory",
    title: tr.TUTORIAL_FACTORY_TITLE,
    message: tr.TUTORIAL_FACTORY_MESSAGE,
    whitelist: [],
    point: ({ view }) => factorySpot(view),
    done: ({ view }) => countOwn(view, EntityType.FACTORY) > 0,
  },
  {
    id: "slots",
    title: tr.TUTORIAL_SLOTS_TITLE,
    message: tr.TUTORIAL_SLOTS_MESSAGE,
    ready: ({ view }) => view.phase === MatchPhase.RUNNING,
    next: true,
    whitelist: [],
  },
  {
    id: "tree",
    title: tr.TUTORIAL_TREE_TITLE,
    message: tr.TUTORIAL_TREE_MESSAGE,
    whitelist: [EntityType.CACAOTREE],
    point: ({ view }) => buildSpot(view, EntityType.CACAOTREE, (cell) => cell.type === BoardCellTypes.WHITE),
    done: ({ view }) => countOwn(view, EntityType.CACAOTREE) > 0,
  },
  {
    id: "cacao",
    title: tr.TUTORIAL_CACAO_TITLE,
    message: tr.TUTORIAL_CACAO_MESSAGE,
    whitelist: [],
    enter: ({ view }) => ({ cacao: me(view).cacao }),
    done: ({ view, memory }) => me(view).cacao > memory.cacao,
  },
  {
    id: "cannon",
    title: tr.TUTORIAL_CANNON_TITLE,
    message: tr.TUTORIAL_CANNON_MESSAGE,
    whitelist: [EntityType.RUM_TRUFFLE_CANNON],
    // white chocolate is for trees
    point: ({ view }) => buildSpot(view, EntityType.RUM_TRUFFLE_CANNON, (cell) => cell.type !== BoardCellTypes.WHITE),
    done: ({ view }) => countOwn(view, EntityType.RUM_TRUFFLE_CANNON) > 0,
  },
  {
    id: "cream",
    title: tr.TUTORIAL_CREAM_TITLE,
    message: tr.TUTORIAL_CREAM_MESSAGE,
    whitelist: [EntityType.CREAM],
    enter: ({ view }) => ({ cream: creamedOwn(view) }),
    point: ({ view }) => creamSpot(view),
    done: ({ view, memory }) => creamedOwn(view) > memory.cream,
  },
  {
    id: "charge",
    title: tr.TUTORIAL_CHARGE_TITLE,
    message: tr.TUTORIAL_CHARGE_MESSAGE,
    whitelist: [],
    done: ({ view, now }) =>
      ownWeapons(view).some((weapon) => engine.weaponStatus(view, weapon, now).state !== WeaponState.CHARGING),
  },
  {
    id: "fire",
    title: tr.TUTORIAL_FIRE_TITLE,
    message: tr.TUTORIAL_FIRE_MESSAGE,
    whitelist: [],
    // her tree first: the factory ends the match, the win step explains that
    point: ({ view, now, selectedAttack }) => shotAt(view, now, selectedAttack, EntityType.CACAOTREE),
    done: ({ view }) => me(view).statistics.shotsFired > 0 || view.phase === MatchPhase.ENDED,
  },
  {
    id: "win",
    title: tr.TUTORIAL_WIN_TITLE,
    message: tr.TUTORIAL_WIN_MESSAGE,
    whitelist: [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM],
    point: ({ view, now, selectedAttack }) => shotAt(view, now, selectedAttack, EntityType.FACTORY),
    done: ({ view }) => view.phase === MatchPhase.ENDED,
  },
];

// the lesson runs without equipment, so every player sees the same values
const lessonMatch = ({ playerName }) => ({
  players: [
    { id: "player", name: playerName, type: PlayerType.HUMAN },
    { id: "ai-mimi-marzipan", name: "Mimi Marzipan", type: PlayerType.AI_TUTORIAL },
  ],
  boardSize: BOARD_SIZE,
  seed: "battlechoc-lesson",
  balance: lessonBalance(),
  agents: [],
  scenario: lessonScenario,
});

export { LESSON, lessonSteps, lessonMatch };
