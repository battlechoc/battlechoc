// Runs the tutorial demos and the lesson setup headless on the real engine (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, EntityType } from "@battlechoc/battlechoc-shared-functions";
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
  const setup = lessonMatch({ playerName: "Tester", level: undefined });
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
