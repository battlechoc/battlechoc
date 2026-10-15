import {
  engine,
  EntityType,
  BoardCellTypes,
} from "@battlechoc/battlechoc-shared-functions";

const { MatchPhase } = engine;
const { BLACK, BROWN, WHITE } = BoardCellTypes;

// Real-time matches that start from a prepared board (see engine.prepareScenario).
// `opponent` names the AI agent; the scenario is applied right after the match is created.
const scenarios = {
  // the first match of a new player: a running game with a few own buildings in place
  firstGame: {
    boardSize: { rows: 6, cols: 6 },
    opponent: "TomToffee",
    scenario: {
      phase: MatchPhase.RUNNING,
      cacao: [200, 50],
      cells: [
        { row: 0, col: 0, type: BLACK, cream: true, entities: [EntityType.FACTORY] },
        { row: 3, col: 4, type: BROWN, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
        { row: 0, col: 1, type: BROWN, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
        { row: 1, col: 4, type: BLACK, cream: true, entities: [EntityType.CACAOTREE] },
        { row: 5, col: 5, type: BROWN, cream: false, entities: [EntityType.CACAOTREE] },
        { player: 1, row: 3, col: 0, type: BROWN, cream: true, entities: [EntityType.FACTORY] },
      ],
    },
  },
  // /situation/d41d8cd98f00b204e9800998ecf8427e: factory placement on black, brown and white cells
  buildFactoryTest: {
    boardSize: { rows: 8, cols: 8 },
    opponent: "TomToffee",
    scenario: {
      cells: [
        { row: 7, col: 7, type: BLACK, cream: true },
        { row: 6, col: 7, type: BROWN, cream: true },
        { row: 5, col: 7, type: WHITE, cream: true },
      ],
    },
  },
  // /situation/2042050de74e855affdb312da85badbf: extensions, fruit cannons and donuts in play
  factoryExtensionTest: {
    boardSize: { rows: 10, cols: 10 },
    opponent: "TomToffee",
    scenario: {
      phase: MatchPhase.RUNNING,
      loadouts: [{ [EntityType.DONUT_FACTORY]: ["GLAZED_OVEN", "SPRINKLE_SORTER"] }],
      cacao: [2000, 1000],
      cells: [
        { row: 0, col: 0, type: BROWN, cream: false, entities: [EntityType.DONUT_SURPRISE_YELLOW, EntityType.XMAS_FACTORY] },
        { row: 3, col: 4, type: BLACK, cream: true },
        { row: 3, col: 3, type: BLACK, cream: true },
        { row: 3, col: 2, type: BLACK, cream: true },
        { row: 5, col: 3, type: BLACK, cream: true },
        { row: 4, col: 3, type: BLACK, cream: false, entities: [EntityType.FRUIT_CANNON] },
        { row: 3, col: 1, type: WHITE, cream: true, entities: [EntityType.FRUIT_CANNON] },
        { row: 4, col: 1, type: WHITE, cream: true, entities: [EntityType.FRUIT_CANNON] },
        { row: 5, col: 1, type: WHITE, cream: true, entities: [EntityType.FRUIT_CANNON] },
        { row: 6, col: 6, type: BLACK, cream: false, entities: [EntityType.FACTORY] },
        { row: 7, col: 6, type: BROWN, cream: true, entities: [EntityType.DONUT_FACTORY] },
        { row: 0, col: 2, type: WHITE, cream: true },
        { player: 1, row: 0, col: 0, type: BLACK, cream: false, entities: [EntityType.FACTORY] },
      ],
    },
  },
};

const debugScenarios = {
  d41d8cd98f00b204e9800998ecf8427e: scenarios.buildFactoryTest,
  "2042050de74e855affdb312da85badbf": scenarios.factoryExtensionTest,
};

export { scenarios, debugScenarios };
