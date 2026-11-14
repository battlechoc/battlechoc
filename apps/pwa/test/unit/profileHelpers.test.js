// The e2e helpers that read and write the game's IndexedDB (test/helpers/profile.js), on a fake
// page (node --test): a read that a reload cuts off is tried again in the new page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readEntry, writeEntry } from "../helpers/profile.js";

// a page whose first `cutOff` evaluations are destroyed by a navigation (Playwright's error)
const reloadingPage = (cutOff, answer) => {
  const calls = { evaluate: 0, waitForLoadState: 0 };
  return {
    calls,
    evaluate: async () => {
      calls.evaluate += 1;
      if (calls.evaluate <= cutOff) {
        throw new Error(
          "page.evaluate: Execution context was destroyed, most likely because of a navigation"
        );
      }
      return answer;
    },
    waitForLoadState: async () => {
      calls.waitForLoadState += 1;
    },
  };
};

test("a read cut off by a reload is read again in the new page", async () => {
  const page = reloadingPage(1, ["the key"]);
  assert.equal(await readEntry(page, "player", "cardanoKey"), "the key");
  assert.deepEqual(page.calls, { evaluate: 2, waitForLoadState: 1 });
});

test("a write cut off by a reload is written again", async () => {
  const page = reloadingPage(2, []);
  await writeEntry(page, "player", "cardanoKeyBackedUp", []);
  assert.deepEqual(page.calls, { evaluate: 3, waitForLoadState: 2 });
});

test("other failures are not tried again", async () => {
  const page = {
    evaluate: async () => {
      throw new Error("NotFoundError: no such object store");
    },
    waitForLoadState: async () => assert.fail("no wait expected"),
  };
  await assert.rejects(readEntry(page, "nope", "key"), /NotFoundError/);
});

test("a page that keeps reloading fails after five tries", async () => {
  const page = reloadingPage(99, []);
  await assert.rejects(
    readEntry(page, "player", "account"),
    /Execution context was destroyed/
  );
  assert.equal(page.calls.evaluate, 5);
});
