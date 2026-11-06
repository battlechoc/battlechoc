// The loader of the on-demand chunks (node --test, src/ui/onDemand.js uses it): a chunk is asked
// for once, and one that does not arrive is asked for again until it does, so React.lazy never
// gets a failed import.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { loadChunk } from "../../src/helper/loadChunk.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a chunk is loaded once, however often it is asked for", async () => {
  let calls = 0;
  const load = loadChunk(async () => {
    calls += 1;
    return { default: "Lab" };
  });
  assert.equal(calls, 0);
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(first.default, "Lab");
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test("a chunk that does not arrive is asked for again until it does", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let calls = 0;
    const load = loadChunk(
      async () => {
        calls += 1;
        if (calls < 4) {
          throw new TypeError("Failed to fetch dynamically imported module");
        }
        return { default: "Tutorial" };
      },
      [1000, 3000]
    );
    let result;
    let failed = false;
    load().then(
      (module) => (result = module),
      () => (failed = true)
    );
    await settle();
    assert.equal(calls, 1);
    // not before the first pause is over
    mock.timers.tick(999);
    await settle();
    assert.equal(calls, 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(calls, 2);
    // the last pause repeats
    mock.timers.tick(3000);
    await settle();
    assert.equal(calls, 3);
    assert.equal(result, undefined);
    mock.timers.tick(3000);
    await settle();
    assert.equal(calls, 4);
    assert.equal(result.default, "Tutorial");
    assert.equal(failed, false);
  } finally {
    mock.timers.reset();
  }
});
