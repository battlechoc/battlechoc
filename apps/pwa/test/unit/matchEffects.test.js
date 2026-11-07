// What the scene plays for the match's events and changes (src/3d/matchEffects.js), the floating
// infos' pictures (src/3d/infoPops.js) and the donuts above the units (src/3d/weaponIndicators.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  engine,
  EntityType,
  AttackType,
} from "@battlechoc/battlechoc-shared-functions";
import { Vector3 } from "@babylonjs/core";
import {
  playMatchEvents,
  showProduction,
  visibleFountain,
  boardPosition,
} from "../../src/3d/matchEffects.js";
import { indicatorDonuts } from "../../src/3d/weaponIndicators.js";
import { InfoType } from "../../src/3d/InfoType.js";
import { infoPicture } from "../../src/3d/infoPops.js";
import { runningMatch, viewAt, entityOf } from "./matchSetup.js";

const {
  FACTORY,
  CACAOTREE,
  CHOCOLATE_FOUNTAIN,
  RUM_TRUFFLE_CANNON,
  DONUT_STOP_PINK,
} = EntityType;

// the effects as a list of [name, ...arguments], positions as [x, y, z]
const recorder = () => {
  const log = [];
  const plain = (value) =>
    value && typeof value.x === "number" ? [value.x, value.y, value.z] : value;
  const record =
    (name) =>
    (...args) =>
      log.push([name, ...args.map(plain)]);
  const fx = Object.fromEntries(
    [
      "playSound",
      "spawnInfo",
      "detonate",
      "chocolateFlash",
      "showEnergyBar",
      "newDonuts",
    ].map((name) => [name, record(name)])
  );
  return { log, fx };
};

test("cells sit at the base of the boards, the opponent's 12 to the side", () => {
  assert.deepEqual(boardPosition(2, 3, true).asArray(), [2, 0, 3]);
  assert.deepEqual(boardPosition(2, 3, false).asArray(), [-10, 0, 15]);
  assert.ok(boardPosition(0, 0, true) instanceof Vector3);
});

test("a visible fountain covers its own cell and the eight around it", () => {
  const match = runningMatch([
    { player: 1, row: 2, col: 2, entities: [CHOCOLATE_FOUNTAIN] },
  ]);
  const view = viewAt(match);
  assert.equal(visibleFountain(view, 1, 3, 3).type, CHOCOLATE_FOUNTAIN);
  assert.equal(visibleFountain(view, 1, 2, 2).type, CHOCOLATE_FOUNTAIN);
  assert.equal(visibleFountain(view, 1, 4, 4), undefined);
  assert.equal(visibleFountain(view, 0, 2, 2), undefined);
});

test("own shot: explosion on the opponent's board, the trap's icon, the survivor's energy bar", () => {
  const view = viewAt(
    runningMatch([{ player: 1, row: 1, col: 4, entities: [CACAOTREE] }])
  );
  const { log, fx } = recorder();
  const result = { traps: ["DonutEffect.PINK"], shielded: false };
  playMatchEvents(
    [
      {
        type: "attack",
        player: 0,
        data: { row: 1, col: 4, attackType: AttackType.TRUFFLE, result },
      },
    ],
    view,
    fx
  );
  const tree = entityOf(view, CACAOTREE, false);
  assert.deepEqual(log, [
    ["playSound", "ATTACK_EXPLOSION"],
    ["detonate", 1, 4, false],
    [
      "spawnInfo",
      InfoType.DONUT_TRAP,
      [-11, 0, 16],
      undefined,
      DONUT_STOP_PINK,
    ],
    ["showEnergyBar", tree, [-11, 0, 16]],
  ]);
});

test("a shield that takes the opponent's shot: a chocolate flash and the fountain's bar", () => {
  const view = viewAt(
    runningMatch([
      { player: 0, row: 3, col: 3, entities: [CHOCOLATE_FOUNTAIN] },
    ])
  );
  const { log, fx } = recorder();
  const result = { traps: [], shielded: true, fountainDestroyed: false };
  playMatchEvents(
    [
      {
        type: "attack",
        player: 1,
        data: { row: 2, col: 2, attackType: AttackType.TRUFFLE, result },
      },
    ],
    view,
    fx
  );
  assert.deepEqual(log, [
    ["playSound", "ATTACK_EXPLOSION"],
    ["detonate", 2, 2, true],
    ["chocolateFlash", [2, 0, 2]],
    ["showEnergyBar", entityOf(view, CHOCOLATE_FOUNTAIN), [3, 0, 3]],
  ]);
});

test("bunnies: caught ones show it to their owner's opponent, the others only sound", () => {
  const view = viewAt(runningMatch([]));
  const { log, fx } = recorder();
  const bunny = (player, caught) => ({
    type: "attack",
    player,
    data: { row: 0, col: 1, attackType: AttackType.BUNNY, result: { caught } },
  });
  playMatchEvents([bunny(0, true), bunny(1, true), bunny(0, false)], view, fx);
  assert.deepEqual(log, [
    ["playSound", "BUNNY_CAUGHT"],
    ["spawnInfo", InfoType.BUNNY_CAUGHT, [-12, 0, 13]],
    ["playSound", "BUNNY_CAUGHT"],
    ["playSound", "ATTACK_BUNNY"],
  ]);
});

test("new donuts sound and announce themselves", () => {
  const { log, fx } = recorder();
  playMatchEvents(
    [
      { type: "donutsSpawned", player: 0, data: {} },
      { type: "built", player: 0, data: {} },
    ],
    viewAt(runningMatch([])),
    fx
  );
  assert.deepEqual(log, [["playSound", "UI_ACCEPT"], ["newDonuts"]]);
});

test("production: +cacao over a harvesting producer, +1 beside a factory with a new slot", () => {
  const match = runningMatch([
    { player: 0, row: 1, col: 1, entities: [CACAOTREE] },
    { player: 0, row: 4, col: 4, entities: [FACTORY] },
  ]);
  match.players[0].buildTokens = 0;
  const before = viewAt(match, 1000);
  const tree = entityOf(before, CACAOTREE);
  const factory = entityOf(before, FACTORY);
  // past the tree's and the factory's next harvest and slot
  const after = viewAt(match, Math.max(tree.cacaoAt, factory.buildAt) + 1);
  const infos = [];
  showProduction(before, after, (...info) => infos.push(info));
  const amount = (entity) => engine.producerStats(after, 0, entity).amount;
  const sorted = infos
    .map(([type, position, n]) => [type, position, n])
    .sort((a, b) => a[1].row - b[1].row);
  assert.deepEqual(sorted, [
    [InfoType.CACAO_HARVESTED, { row: 1, col: 1 }, amount(tree)],
    [InfoType.CACAO_HARVESTED, { row: 4, col: 4 }, amount(factory)],
    [InfoType.BUILDING_READY, { row: 4.6, col: 3.4 }, 1],
  ]);
  // only between two views of a running match
  const nothing = [];
  showProduction(undefined, after, (...info) => nothing.push(info));
  showProduction(
    before,
    { ...after, phase: engine.MatchPhase.ENDED },
    (...info) => nothing.push(info)
  );
  assert.deepEqual(nothing, []);
});

test("each floating info has its picture, colour and text", () => {
  assert.deepEqual(infoPicture(InfoType.CACAO_HARVESTED, 15), {
    image: "/images/cacao.svg",
    color: "gain",
    text: "+15",
  });
  assert.deepEqual(infoPicture(InfoType.CACAO_CONSUMED, 40), {
    image: "/images/cacao.svg",
    color: "cost",
    text: "-40",
  });
  assert.deepEqual(infoPicture(InfoType.BUILDING_READY, 1), {
    image: "/images/buildings-icon.svg",
    color: "gain",
    text: "+1",
    plain: true,
  });
  assert.equal(
    infoPicture(InfoType.SHOT_READY, 1, AttackType.FRUIT).image,
    "/images/fruit-cannon-icon.svg"
  );
  assert.equal(
    infoPicture(InfoType.SHOT_READY, 1, AttackType.HOT_CHOCOLATE).image,
    "/images/ballista-icon.svg"
  );
  assert.equal(
    infoPicture(InfoType.SHOT_READY, 1).image,
    "/images/truffle-cannon-icon.svg"
  );
  assert.deepEqual(infoPicture(InfoType.BUNNY_CAUGHT), {
    image: "/images/bunny-caught.svg",
  });
  assert.deepEqual(
    infoPicture(InfoType.DONUT_TRAP, undefined, EntityType.DONUT_HEALTH_GREEN),
    {
      image: "/images/health-donut-icon.svg",
      plain: true,
    }
  );
  assert.equal(
    infoPicture(InfoType.DONUT_TRAP, undefined, DONUT_STOP_PINK).image,
    "/images/stop-donut-icon.svg"
  );
  // both portals show the portal picture (the red one showed the stop donut until 2026-11)
  for (const portal of [
    EntityType.DONUT_PORTAL_RED,
    EntityType.DONUT_PORTAL_BLUE,
  ]) {
    assert.equal(
      infoPicture(InfoType.DONUT_TRAP, undefined, portal).image,
      "/images/portal-donut-icon.svg"
    );
  }
  assert.equal(infoPicture("InfoType.UNKNOWN", 1), undefined);
});

test("indicator donuts: a weapon's charge, and a factory's next slot or a full storage", () => {
  const match = runningMatch([
    { player: 0, row: 0, col: 0, entities: [FACTORY] },
    { player: 0, row: 2, col: 2, entities: [RUM_TRUFFLE_CANNON] },
  ]);
  let view = viewAt(match);
  const cannon = entityOf(view, RUM_TRUFFLE_CANNON);
  const weapon = cannon.weapons[0];
  // fired just now: charging again from zero
  weapon.chargedAt = view.t;
  const [charging] = indicatorDonuts(view, cannon, view.t);
  assert.equal(charging.progress, 0);
  assert.equal(charging.state, engine.weaponStatus(view, weapon, view.t).state);
  const [later] = indicatorDonuts(view, cannon, view.t + weapon.cooldownMs);
  assert.deepEqual(later, { progress: 1, state: "ready" });

  // the storage is full: the factory's donut is whole and green
  const factory = entityOf(view, FACTORY);
  assert.deepEqual(indicatorDonuts(view, factory, view.t), [
    { progress: 1, state: "ready" },
  ]);
  // with room: it grows toward the next slot
  match.players[0].buildTokens = 0;
  view = viewAt(match);
  const growing = entityOf(view, FACTORY);
  const intervalMs = engine.generatorStats(view, 0, growing).intervalMs;
  const [half] = indicatorDonuts(
    view,
    growing,
    growing.buildAt - intervalMs / 2
  );
  assert.equal(half.state, "charging");
  assert.ok(Math.abs(half.progress - 0.5) < 1e-9);
});
