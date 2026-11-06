// Runs the tutorial demos and the lesson setup headless on the real engine (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, EntityType, AttackType, BoardCellTypes } from "@battlechoc/battlechoc-shared-functions";
import { demos, allDemos, demoMatch } from "../../src/tutorial/demos.js";
import { lessonMatch, lessonSteps } from "../../src/tutorial/lesson.js";

const cell = (match, player, row, col) => engine.cellAt(match, player, row, col);
const has = (target, type) => target.occupiedBy.some((entity) => entity.type === type);

// plays a demo like the tutorial host does, collecting rejected scripted actions
const play = (id) => {
  const setup = demoMatch(id, { playerName: "Tester" });
  const match = engine.createMatch({ players: setup.players, boardSize: setup.boardSize, seed: setup.seed });
  engine.prepareScenario(match, setup.scenario);
  const agents = setup.agents.map((descriptor) => engine.createAgent(descriptor));
  const rejected = [];
  let next = engine.nextWakeAt(match, agents);
  while (next !== null && next <= demos[id].duration) {
    engine.advanceTo(match, next);
    engine.runDueAgents(match, agents, { onRejected: (error, action) => rejected.push({ error: error.message, action }) });
    next = engine.nextWakeAt(match, agents);
  }
  engine.advanceTo(match, demos[id].duration);
  return { match, agents, rejected };
};

for (const id of allDemos) {
  test(`demo ${id} plays every scripted action within its duration`, () => {
    const { match, agents, rejected } = play(id);
    assert.deepEqual(rejected, []);
    assert.ok(agents.every((agent) => agent.done));
    assert.equal(match.phase, engine.MatchPhase.RUNNING);
  });
}

test("each demo shows its effect", () => {
  let { match } = play("TutorialDemo.FactoryExtension");
  assert.ok(has(cell(match, 0, 2, 3), EntityType.FACTORY_EXTENSION));
  assert.ok(has(cell(match, 0, 0, 4), EntityType.CACAOTREE));

  ({ match } = play("TutorialDemo.EasterBunny"));
  assert.ok(!has(cell(match, 1, 3, 4), EntityType.CREAM));
  assert.ok(!has(cell(match, 1, 3, 3), EntityType.CREAM));

  ({ match } = play("TutorialDemo.XmasFactory"));
  assert.ok(has(cell(match, 0, 4, 4), EntityType.HOT_CHOCOLATE_BALLISTA));
  assert.ok(!has(cell(match, 1, 0, 0), EntityType.SPYING_EASTER_BUNNY));

  ({ match } = play("TutorialDemo.HotChocolateBallista"));
  assert.equal(cell(match, 1, 2, 3).molten, true);
  assert.ok(!has(cell(match, 1, 2, 3), EntityType.FACTORY));

  ({ match } = play("TutorialDemo.ChocolateFountain"));
  const fountain = cell(match, 0, 2, 1).occupiedBy.find((entity) => entity.type === EntityType.CHOCOLATE_FOUNTAIN);
  const factory = cell(match, 0, 2, 2).occupiedBy.find((entity) => entity.type === EntityType.FACTORY);
  assert.ok(fountain.hp < fountain.maxHp);
  assert.equal(factory.hp, factory.maxHp);

  ({ match } = play("TutorialDemo.FruitCannon"));
  const shield = cell(match, 1, 2, 2).occupiedBy.find((entity) => entity.type === EntityType.CHOCOLATE_FOUNTAIN);
  assert.ok(shield.hp < shield.maxHp);

  ({ match } = play("TutorialDemo.DonutFactory"));
  assert.ok(has(cell(match, 0, 2, 2), EntityType.DONUT_HEALTH_GREEN));

  ({ match } = play("TutorialDemo.Donuts"));
  assert.ok(has(cell(match, 0, 1, 1), EntityType.CREAM));
  assert.ok(has(cell(match, 0, 5, 5), EntityType.CREAM));
});

test("the lesson can be played through and won", () => {
  const setup = lessonMatch({ playerName: "Tester" });
  const match = engine.createMatch({ players: setup.players, boardSize: setup.boardSize, seed: setup.seed, balance: setup.balance });
  engine.prepareScenario(match, setup.scenario);
  assert.equal(match.fieldChooser, 0);
  const act = (t, type, payload) => {
    const result = engine.applyAction(match, { type, player: 0, t, payload });
    assert.ok(result.ok, result.error && result.error.message);
  };
  act(1000, engine.MatchActionTypes.placeFactory, { row: 5, col: 5 });
  engine.advanceTo(match, 5000);
  assert.equal(match.phase, engine.MatchPhase.RUNNING);
  act(5000, engine.MatchActionTypes.build, { entityType: EntityType.CACAOTREE, row: 4, col: 4 });
  act(5100, engine.MatchActionTypes.build, { entityType: EntityType.RUM_TRUFFLE_CANNON, row: 4, col: 3 });
  // the tree first: Mimi is still in the match
  act(15200, engine.MatchActionTypes.attack, { attackType: "AttackType.TRUFFLE", row: 3, col: 4, allowRush: true });
  // the third building waits for the factory's next slot (15 s after the start)
  act(19100, engine.MatchActionTypes.build, { entityType: EntityType.CREAM, row: 4, col: 3 });
  assert.equal(match.phase, engine.MatchPhase.RUNNING);
  // the factory: without it she cannot build anymore and loses
  act(35300, engine.MatchActionTypes.attack, { attackType: "AttackType.TRUFFLE", row: 1, col: 1, allowRush: false });
  assert.equal(match.phase, engine.MatchPhase.ENDED);
  assert.deepEqual(match.outcome.winners, [0]);
  assert.deepEqual(lessonSteps.map((step) => step.id), ["welcome", "factory", "slots", "tree", "cacao", "cannon", "cream", "charge", "fire", "win"]);
});

// the lesson's finger: each step points at where to tap, from the player's view
test("the lesson points at where to tap", () => {
  const setup = lessonMatch({ playerName: "Tester" });
  const match = engine.createMatch({ players: setup.players, boardSize: setup.boardSize, seed: setup.seed, balance: setup.balance });
  engine.prepareScenario(match, setup.scenario);
  const step = (id) => lessonSteps.find((candidate) => candidate.id === id);
  const point = (id, now, selectedAttack) => step(id).point({ view: engine.getPlayerView(match, 0), now, memory: {}, selectedAttack });
  const own = ({ row, col }) => engine.cellAt(match, 0, row, col);
  const act = (t, type, payload) => {
    const result = engine.applyAction(match, { type, player: 0, t, payload });
    assert.ok(result.ok, result.error && result.error.message);
  };

  // the info steps point at nothing
  ["welcome", "slots", "cacao", "charge"].forEach((id) => assert.equal(step(id).point, undefined, id));
  // the factory on dark chocolate
  let target = point("factory", 0);
  assert.equal(target.board, "own");
  assert.equal(own(target).type, BoardCellTypes.BLACK);
  act(1000, engine.MatchActionTypes.placeFactory, { row: target.row, col: target.col });
  engine.advanceTo(match, 5000);
  // the tree on a free white field (the board's own cream does not count, a building may go under it)
  const building = (cell) => cell.occupiedBy.some((entity) => entity.type !== EntityType.CREAM);
  target = point("tree", 5000);
  assert.equal(target.board, "own");
  assert.equal(own(target).type, BoardCellTypes.WHITE);
  assert.ok(!building(own(target)));
  act(5000, engine.MatchActionTypes.build, { entityType: EntityType.CACAOTREE, row: target.row, col: target.col });
  // the cannon on a free field, next to the factory
  target = point("cannon", 5100);
  assert.ok(!building(own(target)));
  const factory = point("factory", 0);
  assert.ok(Math.abs(target.row - factory.row) <= 1 && Math.abs(target.col - factory.col) <= 1, "next to the factory");
  act(5100, engine.MatchActionTypes.build, { entityType: EntityType.RUM_TRUFFLE_CANNON, row: target.row, col: target.col });
  // the cream (the dark factory gave three slots) hides what lies open: no cell hides more
  const creamed = (cell) => cell.occupiedBy.some((entity) => entity.type === EntityType.CREAM);
  const hides = ({ row, col }) => engine.creamFootprint(match, 0, row, col).filter((cell) => !creamed(cell) && building(cell)).length;
  const grid = match.board.fields[match.players[0].fieldIndex].grid;
  target = point("cream", 5200);
  assert.ok(hides(target) >= 1);
  assert.equal(hides(target), Math.max(...grid.map(hides)));
  act(5200, engine.MatchActionTypes.build, { entityType: EntityType.CREAM, row: target.row, col: target.col });
  // no slot left: nothing to point at until the next one comes
  assert.equal(point("cream", 5300), null);
  engine.advanceTo(match, 19100);
  assert.notEqual(point("cream", 19100), null);
  // fire: the cannon button, then (the attack picked) Mimi's tree
  assert.deepEqual(point("fire", 19200), { weapon: AttackType.TRUFFLE });
  assert.deepEqual(point("fire", 19200, AttackType.TRUFFLE), { board: "opponent", row: 3, col: 4 });
  act(19200, engine.MatchActionTypes.attack, { attackType: AttackType.TRUFFLE, row: 3, col: 4, allowRush: true });
  // win: nothing while the cannon loads, then Mimi's factory
  assert.equal(point("win", 19300, AttackType.TRUFFLE), null);
  engine.advanceTo(match, 40000);
  assert.deepEqual(point("win", 40000, AttackType.TRUFFLE), { board: "opponent", row: 1, col: 1 });
  assert.deepEqual(point("win", 40000), { weapon: AttackType.TRUFFLE });
});
