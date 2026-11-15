// This tab's sign codes and the wait on a minting request (node --test; src/ui/mint/signCodes.js,
// src/ui/mint/held.js): a code is kept the moment Mint now's answer arrives, however late, and
// a dialog open on that operation hears of it; a request that hangs counts as unanswered, while
// its late answer still reaches whoever hangs on the request itself.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  dropCode,
  keepCode,
  onCode,
  readCode,
} from "../../src/ui/mint/signCodes.js";
import { ANSWER_MS, held } from "../../src/ui/mint/held.js";
import { ChainUnreachableError } from "../../src/api/chainClient.js";
import { signCodeKey } from "../../src/ui/mint/mintSettings.js";

const fakeSession = () => {
  const entries = new Map();
  return {
    entries,
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
};

test("a kept code is this tab's, and every dialog listening hears of it", () => {
  const store = fakeSession();
  globalThis.sessionStorage = store;
  try {
    const heard = [];
    const stop = onCode((id, code) => heard.push([id, code]));
    assert.equal(readCode("op-1"), null);
    keepCode("op-1", "code-1");
    assert.equal(readCode("op-1"), "code-1");
    assert.equal(store.entries.get(signCodeKey("op-1")), "code-1");
    assert.deepEqual(heard, [["op-1", "code-1"]]);
    // nothing to keep: no id or no code
    keepCode(null, "code-2");
    keepCode("op-2", undefined);
    keepCode("op-2", "");
    assert.deepEqual(heard, [["op-1", "code-1"]]);
    stop();
    keepCode("op-3", "code-3");
    assert.deepEqual(heard, [["op-1", "code-1"]]);
    dropCode("op-1");
    assert.equal(readCode("op-1"), null);
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("without a session store (or one that throws) a code is still heard, and nothing throws", () => {
  const heard = [];
  const stop = onCode((id, code) => heard.push([id, code]));
  keepCode("op-1", "code-1");
  assert.equal(readCode("op-1"), null);
  globalThis.sessionStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  try {
    keepCode("op-2", "code-2");
    assert.equal(readCode("op-2"), null);
    dropCode("op-2");
  } finally {
    delete globalThis.sessionStorage;
    stop();
  }
  assert.deepEqual(heard, [
    ["op-1", "code-1"],
    ["op-2", "code-2"],
  ]);
});

test("held: an answer within the time passes, a request that hangs counts as unanswered, and its late answer still reaches the request", async () => {
  assert.equal(ANSWER_MS, 20000);
  assert.equal(await held(Promise.resolve("answer")), "answer");
  await assert.rejects(held(Promise.reject(new Error("no"))), /no/);
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let answer;
    const call = new Promise((resolve) => {
      answer = resolve;
    });
    let late = null;
    call.then((value) => {
      late = value;
    });
    const waiting = held(call);
    mock.timers.tick(ANSWER_MS);
    await assert.rejects(
      waiting,
      (error) =>
        error instanceof ChainUnreachableError && error.reason === "network"
    );
    answer({ signCode: "code-1" });
    await call;
    assert.deepEqual(late, { signCode: "code-1" });
  } finally {
    mock.timers.reset();
  }
});
