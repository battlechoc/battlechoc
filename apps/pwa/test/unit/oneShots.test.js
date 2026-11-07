// One-shot effects end once, whoever ends them, and stopAll leaves no timer behind
// (src/3d/oneShots.js).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OneShots } from "../../src/3d/oneShots.js";

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
test.afterEach(() => mock.timers.reset());

test("an effect stops once, by its end, its timer or stopAll", () => {
  const effects = new OneShots();
  let stops = 0;
  const end = effects.start(() => (stops += 1));
  effects.later(end, 100);
  assert.equal(effects.size, 1);
  end();
  end();
  mock.timers.tick(100);
  effects.stopAll();
  assert.equal(stops, 1);
  assert.equal(effects.size, 0);
});

test("an effect that ends itself from its own clean-up stops once", () => {
  const effects = new OneShots();
  let stops = 0;
  // like scene.stopAnimation, which raises the animation's end, which ends the effect
  const end = effects.start(() => {
    stops += 1;
    end();
  });
  effects.stopAll();
  assert.equal(stops, 1);
});

test("stopAll cancels the timers and runs their cancel instead", () => {
  const effects = new OneShots();
  const log = [];
  effects.later(
    () => log.push("ran"),
    1000,
    () => log.push("cancelled")
  );
  effects.later(() => log.push("ran early"), 10);
  mock.timers.tick(10);
  effects.stopAll();
  mock.timers.tick(5000);
  assert.deepEqual(log, ["ran early", "cancelled"]);
});
