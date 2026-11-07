// A tap on a board cell becomes a match action (src/match/boardActions.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  engine,
  EntityType,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";
import { tapOwnCell, tapOpponentCell } from "../../src/match/boardActions.js";
import { runningMatch, viewAt } from "./matchSetup.js";

const { MatchPhase, MatchActionTypes } = engine;

// records what the scene would do; `outcome` is what the host answers to a submission
const effects = (outcome = () => Promise.resolve()) => {
  const log = [];
  return {
    log,
    submit: (type, payload) => {
      log.push(["submit", type, payload]);
      return outcome(type, payload);
    },
    ignoreRuleErrors: (error) =>
      log.push(["ignored", error.code || error.ruleName]),
    factoryPlaced: () => log.push(["factoryPlaced"]),
    donutPlaced: (next) => log.push(["donutPlaced", next]),
    built: (costs) => log.push(["built", costs]),
    denied: (attackType) => log.push(["denied", attackType]),
  };
};
const ruleError = (fields) =>
  Promise.reject(Object.assign(new Error("refused"), fields));

const running = () =>
  viewAt(
    runningMatch([
      { player: 0, row: 0, col: 0, entities: [EntityType.FACTORY] },
    ])
  );

test("before the match runs, a tap on the own board places the factory", async () => {
  const view = viewAt(runningMatch([], { phase: MatchPhase.PLACEMENT }));
  const fx = effects();
  await tapOwnCell(view, EntityType.CACAOTREE, { row: 2, col: 3 }, fx);
  assert.deepEqual(fx.log, [
    ["submit", MatchActionTypes.placeFactory, { row: 2, col: 3 }],
    ["factoryPlaced"],
  ]);
});

test("in a running match a tap without a selected building does nothing", () => {
  const fx = effects();
  assert.equal(
    tapOwnCell(running(), undefined, { row: 1, col: 1 }, fx),
    undefined
  );
  assert.deepEqual(fx.log, []);
});

test("a tap builds the selected building and reports what it cost before", async () => {
  const view = running();
  const costs = engine.buildCosts(view, view.viewer, EntityType.CACAOTREE);
  assert.ok(costs > 0);
  const fx = effects();
  await tapOwnCell(view, EntityType.CACAOTREE, { row: 1, col: 1 }, fx);
  assert.deepEqual(fx.log, [
    [
      "submit",
      MatchActionTypes.build,
      { entityType: EntityType.CACAOTREE, row: 1, col: 1 },
    ],
    ["built", costs],
  ]);
});

test("a donut goes on the tapped cell; after the blue portal the red one is next", async () => {
  const fx = effects();
  await tapOwnCell(
    running(),
    EntityType.DONUT_PORTAL_BLUE,
    { row: 4, col: 5 },
    fx
  );
  await tapOwnCell(
    running(),
    EntityType.DONUT_STOP_PINK,
    { row: 5, col: 5 },
    fx
  );
  assert.deepEqual(fx.log, [
    [
      "submit",
      MatchActionTypes.placeDonut,
      { donutType: EntityType.DONUT_PORTAL_BLUE, row: 4, col: 5 },
    ],
    ["donutPlaced", EntityType.DONUT_PORTAL_RED],
    [
      "submit",
      MatchActionTypes.placeDonut,
      { donutType: EntityType.DONUT_STOP_PINK, row: 5, col: 5 },
    ],
    ["donutPlaced", undefined],
  ]);
});

test("a refused build is a rule error, nothing follows", async () => {
  const fx = effects(() => ruleError({ code: "BuildNotPossibleError" }));
  await tapOwnCell(running(), EntityType.CACAOTREE, { row: 0, col: 0 }, fx);
  assert.deepEqual(fx.log.slice(1), [["ignored", "BuildNotPossibleError"]]);
});

test("a tap on the opponent's board fires the selected weapon, early if need be", async () => {
  const fx = effects();
  await tapOpponentCell(running(), AttackType.TRUFFLE, { row: 3, col: 2 }, fx);
  assert.deepEqual(fx.log, [
    [
      "submit",
      MatchActionTypes.attack,
      { attackType: AttackType.TRUFFLE, row: 3, col: 2, allowRush: true },
    ],
  ]);
  // no weapon selected, or the match does not run: nothing
  assert.equal(
    tapOpponentCell(running(), undefined, { row: 3, col: 2 }, fx),
    undefined
  );
  const placement = viewAt(runningMatch([], { phase: MatchPhase.PLACEMENT }));
  assert.equal(
    tapOpponentCell(placement, AttackType.TRUFFLE, { row: 3, col: 2 }, fx),
    undefined
  );
  assert.equal(fx.log.length, 1);
});

test("no shot available flashes the weapon's button, offline and online; other refusals do not", async () => {
  for (const refusal of [
    { code: "WeaponNotReadyError" },
    { ruleName: "NoCacaoLeftError" },
    { code: "StunnedError" },
  ]) {
    const fx = effects(() => ruleError(refusal));
    await tapOpponentCell(running(), AttackType.FRUIT, { row: 0, col: 0 }, fx);
    assert.deepEqual(fx.log.slice(1), [
      ["denied", AttackType.FRUIT],
      ["ignored", refusal.code || refusal.ruleName],
    ]);
  }
  const fx = effects(() => ruleError({ code: "InvalidTargetError" }));
  await tapOpponentCell(running(), AttackType.FRUIT, { row: 0, col: 0 }, fx);
  assert.deepEqual(fx.log.slice(1), [["ignored", "InvalidTargetError"]]);
});
