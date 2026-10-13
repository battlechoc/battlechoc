import {
  engine,
  EntityType,
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

/**
 * Steps of the lesson. `next`: an info step the player confirms. `ready`: the step is shown
 * only once this holds (otherwise the previous card stays). `enter`: remembers values when the
 * step starts. `done`: the step is complete. `whitelist`: buildings the palette offers.
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
    done: ({ view }) => countOwn(view, EntityType.RUM_TRUFFLE_CANNON) > 0,
  },
  {
    id: "cream",
    title: tr.TUTORIAL_CREAM_TITLE,
    message: tr.TUTORIAL_CREAM_MESSAGE,
    whitelist: [EntityType.CREAM],
    enter: ({ view }) => ({ cream: creamedOwn(view) }),
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
    done: ({ view }) => me(view).statistics.shotsFired > 0 || view.phase === MatchPhase.ENDED,
  },
  {
    id: "win",
    title: tr.TUTORIAL_WIN_TITLE,
    message: tr.TUTORIAL_WIN_MESSAGE,
    whitelist: [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON, EntityType.CREAM],
    done: ({ view }) => view.phase === MatchPhase.ENDED,
  },
];

const lessonMatch = ({ playerName, level }) => ({
  players: [
    { id: "player", name: playerName, type: PlayerType.HUMAN, level },
    { id: "ai-mimi-marzipan", name: "Mimi Marzipan", type: PlayerType.AI_TUTORIAL },
  ],
  boardSize: BOARD_SIZE,
  seed: "battlechoc-lesson",
  balance: lessonBalance(),
  agents: [],
  scenario: lessonScenario,
});

export { LESSON, lessonSteps, lessonMatch };
