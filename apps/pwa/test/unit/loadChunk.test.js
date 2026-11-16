// The loader of the on-demand chunks (node --test, src/ui/onDemand.js uses it): a chunk is asked
// for once, and one that does not arrive is asked for again until it does, while the page is open
// (a fast round, then every minute; at once when the page or the device comes back), so React.lazy
// never gets a failed import.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  loadChunk,
  wakeChunks,
  wakeOnReturn,
} from "../../src/helper/loadChunk.js";

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
    const load = loadChunk(async () => {
      calls += 1;
      if (calls < 4) {
        throw new TypeError("Failed to fetch dynamically imported module");
      }
      return { default: "Tutorial" };
    }, [1000, 3000]);
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

// a loader of a chunk that fails until `arrives()` says so; `wakes`: the wake callbacks it holds
const failing = (arrives, options = {}) => {
  const wakes = [];
  let calls = 0;
  const load = loadChunk(
    async () => {
      calls += 1;
      if (!arrives()) {
        throw new TypeError("Failed to fetch dynamically imported module");
      }
      return { default: "MintDialog" };
    },
    [1000, 3000],
    {
      maxTries: 3,
      slowMs: 60000,
      wake: (callback) => {
        wakes.push(callback);
        return () => wakes.splice(wakes.indexOf(callback), 1);
      },
      ...options,
    }
  );
  return { load, wakes, calls: () => calls };
};

const outcome = (promise) => {
  const seen = { result: undefined, failed: false };
  promise.then(
    (module) => (seen.result = module),
    () => (seen.failed = true)
  );
  return seen;
};

test("after the fast round a chunk is asked for every minute, for as long as the page is open", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let arrives = false;
    const chunk = failing(() => arrives);
    const seen = outcome(chunk.load());
    await settle();
    mock.timers.tick(1000);
    await settle();
    mock.timers.tick(3000);
    await settle();
    // the fast round: three tries
    assert.equal(chunk.calls(), 3);
    // then one a minute, not sooner
    mock.timers.tick(59999);
    await settle();
    assert.equal(chunk.calls(), 3);
    mock.timers.tick(1);
    await settle();
    assert.equal(chunk.calls(), 4);
    for (let minute = 0; minute < 60; minute++) {
      mock.timers.tick(60000);
      await settle();
    }
    assert.equal(chunk.calls(), 64);
    assert.equal(seen.result, undefined);
    assert.equal(seen.failed, false);
    // the network came back without a word: the next minute's try loads it
    arrives = true;
    mock.timers.tick(60000);
    await settle();
    assert.equal(chunk.calls(), 65);
    assert.equal(seen.result.default, "MintDialog");
    assert.equal(chunk.wakes.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("a wake (the page shown, the device online) asks at once and starts a fast round; one try at a time", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let arrives = false;
    const chunk = failing(() => arrives);
    const seen = outcome(chunk.load());
    await settle();
    mock.timers.tick(1000);
    await settle();
    mock.timers.tick(3000);
    await settle();
    assert.equal(chunk.calls(), 3);
    assert.equal(chunk.wakes.length, 1);
    // woken in the slow minute: at once, no tick
    chunk.wakes[0]();
    await settle();
    assert.equal(chunk.calls(), 4);
    // a fast round again: the next try after the first pause, and the slow timer is gone
    mock.timers.tick(1000);
    await settle();
    assert.equal(chunk.calls(), 5);
    // two wakes while one try is out: one request
    arrives = true;
    chunk.wakes[0]();
    chunk.wakes[0]();
    await settle();
    assert.equal(chunk.calls(), 6);
    assert.equal(seen.result.default, "MintDialog");
    // loaded: nothing waits any more, and nothing is asked again
    assert.equal(chunk.wakes.length, 0);
    mock.timers.tick(10 * 60000);
    await settle();
    assert.equal(chunk.calls(), 6);
  } finally {
    mock.timers.reset();
  }
});

test("a wake that calls back at once, and a loader that throws, never break the promise", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let calls = 0;
    let arrives = false;
    const load = loadChunk(
      () => {
        calls += 1;
        if (!arrives) {
          throw new TypeError("not even a promise");
        }
        return Promise.resolve({ default: "Lab" });
      },
      [1000],
      {
        maxTries: 2,
        // a wake source that calls back while it is being subscribed
        wake: (callback) => {
          callback();
          return () => {};
        },
      }
    );
    const seen = outcome(load());
    await settle();
    // the first try failed, the wake asked again at once (no ReferenceError, no second timer)
    assert.equal(calls, 2);
    assert.equal(seen.failed, false);
    arrives = true;
    mock.timers.tick(1000);
    await settle();
    assert.equal(calls, 3);
    assert.equal(seen.result.default, "Lab");
  } finally {
    mock.timers.reset();
  }
});

test("wakeOnReturn: the window's online, the page shown again and wakeChunks() call back; a hidden page and an unsubscribed one do not", () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.hidden = false;
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;
  try {
    let woken = 0;
    const stop = wakeOnReturn(() => {
      woken += 1;
    });
    windowTarget.dispatchEvent(new Event("online"));
    assert.equal(woken, 1);
    documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    assert.equal(woken, 1);
    documentTarget.hidden = false;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    assert.equal(woken, 2);
    // the game's connectivity says online (index.jsx)
    wakeChunks();
    assert.equal(woken, 3);
    stop();
    windowTarget.dispatchEvent(new Event("online"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    wakeChunks();
    assert.equal(woken, 3);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
  // outside a browser: only wakeChunks
  let woken = 0;
  const stop = wakeOnReturn(() => {
    woken += 1;
  });
  wakeChunks();
  stop();
  wakeChunks();
  assert.equal(woken, 1);
});
