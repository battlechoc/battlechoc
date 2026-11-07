// The game's log (node --test): it keeps the last messages of each level for a problem report
// and prints only where asked to.
import { test } from "node:test";
import assert from "node:assert/strict";
import logger, { Logger, LIMIT } from "../../src/helper/logger.js";

test("each level keeps only its last messages", () => {
  const log = new Logger({ limit: 3, print: false });
  for (let i = 0; i < 5; i++) {
    log.info("info", i);
  }
  log.warn("careful");
  log.error("broken", 1);
  const { infos, warnings, errors } = log.summarize();
  assert.deepEqual(
    infos.map((entry) => entry.message),
    [
      ["info", 2],
      ["info", 3],
      ["info", 4],
    ]
  );
  assert.deepEqual(
    warnings.map((entry) => entry.message),
    [["careful"]]
  );
  assert.deepEqual(
    errors.map((entry) => entry.message),
    [["broken", 1]]
  );
  assert.equal(typeof infos[0].time, "number");
});

test("the game's log holds 500 per level and prints nothing outside the dev server", () => {
  assert.equal(LIMIT, 500);
  assert.equal(logger.limit, 500);
  // node has no import.meta.env: like the published game
  assert.equal(logger.print, false);
});

test("a printing log writes to the console", (t) => {
  const printed = [];
  t.mock.method(console, "warn", (...args) => printed.push(args));
  new Logger({ print: true }).warn("visible", 2);
  assert.deepEqual(printed, [["visible", 2]]);
});
