import {
  engine,
  EntityType,
  AttackType,
  PlayerType,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// Short scripted matches that show the buildings unlocked after the first win. They run on
// the real engine with two scripted players and a fast-forwarded clock, so production,
// reloads and rush look exactly as in a match. The viewer is always player 0; `cues` select a
// weapon (which turns the camera to the opponent's board) or a building (back to your own).

const { MatchActionTypes, MatchPhase } = engine;

const DemoId = Object.freeze({
  FACTORY_EXTENSION: "TutorialDemo.FactoryExtension",
  EASTER_BUNNY: "TutorialDemo.EasterBunny",
  XMAS_FACTORY: "TutorialDemo.XmasFactory",
  HOT_CHOCOLATE_BALLISTA: "TutorialDemo.HotChocolateBallista",
  CHOCOLATE_FOUNTAIN: "TutorialDemo.ChocolateFountain",
  FRUIT_CANNON: "TutorialDemo.FruitCannon",
  DONUT_FACTORY: "TutorialDemo.DonutFactory",
  DONUTS: "TutorialDemo.Donuts",
});

const build = (at, entityType, row, col) => ({ at, type: MatchActionTypes.build, payload: { entityType, row, col } });
const shoot = (at, attackType, row, col) => ({
  at,
  type: MatchActionTypes.attack,
  payload: { attackType, row, col, allowRush: true },
});
const placeDonut = (at, donutType, row, col) => ({ at, type: MatchActionTypes.placeDonut, payload: { donutType, row, col } });

const own = (row, col, entities = [], cream = false) => ({ player: 0, row, col, cream, entities });
const mimi = (row, col, entities = [], cream = false) => ({ player: 1, row, col, cream, entities });

// both factories face each other on otherwise empty boards; demos add their own cells
const scenario = ({ cells = [], donuts } = {}) => ({
  phase: MatchPhase.RUNNING,
  clear: true,
  cacao: [1000, 1000],
  donuts,
  cells: [own(2, 2, [EntityType.FACTORY]), mimi(2, 3, [EntityType.FACTORY]), ...cells],
});

const demos = {
  [DemoId.FACTORY_EXTENSION]: {
    title: tr.TUTORIAL_FACTORY_EXTENSION_TITLE,
    message: tr.TUTORIAL_FACTORY_EXTENSION_MESSAGE,
    speed: 2,
    duration: 24000,
    scenario: scenario(),
    scripts: [
      [
        build(1500, EntityType.FACTORY_EXTENSION, 2, 3),
        build(4000, EntityType.CACAOTREE, 4, 1),
        // the factory refills after 15 s, the extension after 20 s on its own
        build(15500, EntityType.CACAOTREE, 4, 4),
        build(21600, EntityType.CACAOTREE, 0, 4),
      ],
      [],
    ],
    cues: [],
  },
  [DemoId.EASTER_BUNNY]: {
    title: tr.TUTORIAL_BUNNY_TITLE,
    message: tr.TUTORIAL_BUNNY_MESSAGE,
    speed: 4,
    duration: 36000,
    scenario: scenario({
      cells: [
        mimi(3, 3, [EntityType.CACAOTREE], true),
        mimi(4, 4, [EntityType.RUM_TRUFFLE_CANNON], true),
        mimi(3, 4, [], true),
        mimi(4, 3, [], true),
        mimi(2, 4, [], true),
        mimi(4, 5, [], true),
      ],
    }),
    scripts: [[build(1000, EntityType.SPYING_EASTER_BUNNY, 4, 1), shoot(31000, AttackType.BUNNY, 3, 4)], []],
    cues: [{ at: 28000, attack: AttackType.BUNNY }],
  },
  [DemoId.XMAS_FACTORY]: {
    title: tr.TUTORIAL_XMAS_TITLE,
    message: tr.TUTORIAL_XMAS_MESSAGE,
    speed: 4,
    duration: 36000,
    scenario: scenario({
      cells: [
        own(3, 3, [], true),
        own(3, 4, [], true),
        own(4, 3, [], true),
        own(4, 4, [], true),
        mimi(0, 0, [EntityType.SPYING_EASTER_BUNNY]),
      ],
    }),
    scripts: [[build(1000, EntityType.XMAS_FACTORY, 4, 4)], [shoot(30500, AttackType.BUNNY, 4, 4)]],
    cues: [],
  },
  [DemoId.HOT_CHOCOLATE_BALLISTA]: {
    title: tr.TUTORIAL_BALLISTA_TITLE,
    message: tr.TUTORIAL_BALLISTA_MESSAGE,
    speed: 2,
    duration: 12000,
    scenario: scenario({
      // her extension keeps Mimi in the match after the factory is gone
      cells: [
        own(4, 1, [EntityType.HOT_CHOCOLATE_BALLISTA]),
        mimi(2, 4, [EntityType.FACTORY_EXTENSION]),
        mimi(1, 1, [EntityType.CACAOTREE]),
        mimi(4, 4, [EntityType.CACAOTREE]),
      ],
    }),
    scripts: [[shoot(2500, AttackType.HOT_CHOCOLATE, 2, 3)], []],
    cues: [{ at: 800, attack: AttackType.HOT_CHOCOLATE }],
  },
  [DemoId.CHOCOLATE_FOUNTAIN]: {
    title: tr.TUTORIAL_FOUNTAIN_TITLE,
    message: tr.TUTORIAL_FOUNTAIN_MESSAGE,
    speed: 3,
    duration: 26000,
    scenario: scenario({ cells: [mimi(0, 0, [EntityType.RUM_TRUFFLE_CANNON])] }),
    scripts: [[build(1000, EntityType.CHOCOLATE_FOUNTAIN, 2, 1)], [shoot(20500, AttackType.TRUFFLE, 2, 2)]],
    cues: [],
  },
  [DemoId.FRUIT_CANNON]: {
    title: tr.TUTORIAL_FRUIT_CANNON_TITLE,
    message: tr.TUTORIAL_FRUIT_CANNON_MESSAGE,
    speed: 3,
    duration: 22000,
    scenario: scenario({
      cells: [own(4, 4, [EntityType.RUM_TRUFFLE_CANNON]), mimi(2, 2, [EntityType.CHOCOLATE_FOUNTAIN])],
    }),
    scripts: [[build(1000, EntityType.FRUIT_CANNON, 4, 4), shoot(16100, AttackType.FRUIT, 2, 3)], []],
    cues: [{ at: 13500, attack: AttackType.FRUIT }],
  },
  [DemoId.DONUT_FACTORY]: {
    title: tr.TUTORIAL_DONUT_FACTORY_TITLE,
    message: tr.TUTORIAL_DONUT_FACTORY_MESSAGE,
    speed: 4,
    duration: 38000,
    // this seed bakes a green donut on the first try
    seed: "demo-donut-factory-3",
    scenario: scenario(),
    scripts: [
      [build(1000, EntityType.DONUT_FACTORY, 4, 4), placeDonut(34000, EntityType.DONUT_HEALTH_GREEN, 2, 2)],
      [],
    ],
    cues: [],
  },
  [DemoId.DONUTS]: {
    title: tr.TUTORIAL_DONUTS_TITLE,
    message: tr.TUTORIAL_DONUTS_MESSAGE,
    speed: 3,
    duration: 26000,
    scenario: scenario({
      cells: [own(3, 3, [EntityType.CACAOTREE]), own(3, 2, [EntityType.CACAOTREE]), mimi(0, 0, [EntityType.RUM_TRUFFLE_CANNON])],
      donuts: [[EntityType.DONUT_CREAM_WHITE], []],
    }),
    scripts: [[placeDonut(1000, EntityType.DONUT_CREAM_WHITE, 3, 3)], [shoot(20500, AttackType.TRUFFLE, 3, 3)]],
    cues: [],
  },
};

const allDemos = Object.values(DemoId);

const demoMatch = (id, { playerName }) => {
  const demo = demos[id];
  const seed = demo.seed || `demo-${id}`;
  return {
    players: [
      { id: "player", name: playerName, type: PlayerType.HUMAN },
      { id: "ai-mimi-marzipan", name: "Mimi Marzipan", type: PlayerType.AI_TUTORIAL },
    ],
    boardSize: { rows: 6, cols: 6 },
    seed,
    scenario: demo.scenario,
    agents: demo.scripts.map((script, playerIndex) => ({
      kind: "ScriptedAgent",
      playerIndex,
      seed: `${seed}-${playerIndex}`,
      reactionTimeMs: 100,
      options: { script },
    })),
  };
};

export { DemoId, demos, allDemos, demoMatch };
