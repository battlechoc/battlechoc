// How the game follows a minting operation (node --test): one poll every 5 s at most, none while
// the page is hidden, none once it ended, and only from one place at a time (the dialog, else
// the watcher on the title screen and in the Choclab) (src/ui/mint/operationPoll.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFollowing,
  MIN_POLL_MS,
  pollOperation,
} from "../../src/ui/mint/operationPoll.js";

// timers that run when told to, and a page whose visibility the test sets
const fakeClock = () => {
  let now = 0;
  let next = 1;
  const waiting = new Map();
  return {
    timers: {
      setTimeout: (run, ms) => {
        const id = next++;
        waiting.set(id, { run, at: now + ms });
        return id;
      },
      clearTimeout: (id) => waiting.delete(id),
    },
    pending: () => waiting.size,
    // moves the clock by `ms`, running what is due
    advance: async (ms) => {
      const until = now + ms;
      for (;;) {
        const due = [...waiting.entries()]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) {
          break;
        }
        waiting.delete(due[0]);
        now = due[1].at;
        due[1].run();
        await settle();
      }
      now = until;
    },
  };
};
const fakePage = (hidden = false) => {
  const listeners = new Set();
  return {
    get hidden() {
      return hidden;
    },
    addEventListener: (name, listener) =>
      name === "visibilitychange" && listeners.add(listener),
    removeEventListener: (name, listener) => listeners.delete(listener),
    set: async (value) => {
      hidden = value;
      listeners.forEach((listener) => listener());
      await settle();
    },
    listeners,
  };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

const ended = (answer) =>
  ["included", "expired", "cancelled"].includes(answer.state);

const poller = (answers, { page = fakePage(), clock = fakeClock() } = {}) => {
  const seen = [];
  const failures = [];
  let calls = 0;
  const stop = pollOperation({
    fetch: async () => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    onAnswer: (answer) => seen.push(answer.state),
    onFailure: (failure) => failures.push(failure),
    ended,
    page,
    timers: clock.timers,
  });
  return { seen, failures, calls: () => calls, stop, clock, page };
};

test("no faster than every 5 s, and never once the operation ended", async () => {
  assert.equal(MIN_POLL_MS, 5000);
  const poll = poller([
    { state: "submitted" },
    { state: "submitted" },
    { state: "included" },
  ]);
  await settle();
  assert.equal(poll.calls(), 1);
  await poll.clock.advance(4999);
  assert.equal(poll.calls(), 1);
  await poll.clock.advance(1);
  assert.equal(poll.calls(), 2);
  await poll.clock.advance(5000);
  assert.deepEqual(poll.seen, ["submitted", "submitted", "included"]);
  await poll.clock.advance(60000);
  assert.equal(poll.calls(), 3);
  assert.equal(poll.clock.pending(), 0);
  assert.equal(poll.page.listeners.size, 0);
});

test("a hidden page is not polled; visible again, one poll at once, then the 5 s again", async () => {
  const page = fakePage(true);
  const poll = poller([{ state: "submitted" }], { page });
  await settle();
  await poll.clock.advance(60000);
  assert.equal(poll.calls(), 0);
  await page.set(false);
  assert.equal(poll.calls(), 1);
  await page.set(true);
  await poll.clock.advance(60000);
  assert.equal(poll.calls(), 1);
  // visible again within 5 s of the last poll: it waits for them
  await page.set(false);
  assert.equal(poll.calls(), 2);
  await page.set(true);
  await page.set(false);
  assert.equal(poll.calls(), 2);
  await poll.clock.advance(5000);
  assert.equal(poll.calls(), 3);
});

test("a failure that may pass is tried again on the next round; any other ends the poll and is told", async () => {
  const unreachable = Object.assign(new Error("no answer"), {
    retryable: true,
  });
  const notFound = Object.assign(new Error("404 NOT FOUND"), {
    retryable: false,
    response: { status: 404 },
  });
  const poll = poller([unreachable, { state: "submitted" }, notFound]);
  await settle();
  await poll.clock.advance(5000);
  await poll.clock.advance(5000);
  assert.deepEqual(poll.seen, ["submitted"]);
  assert.deepEqual(poll.failures, [notFound]);
  await poll.clock.advance(60000);
  assert.equal(poll.calls(), 3);
});

test("stopped, it asks nothing more and drops an answer still on its way", async () => {
  const poll = poller([{ state: "submitted" }]);
  poll.stop();
  await settle();
  // the first request went out at once; its answer comes after the stop
  assert.deepEqual(poll.seen, []);
  await poll.clock.advance(60000);
  assert.equal(poll.calls(), 1);
  assert.equal(poll.clock.pending(), 0);
});

test("one place follows an operation at a time: the dialog's hold wins over the watcher's", () => {
  const following = createFollowing();
  const changes = [];
  following.subscribe(() => changes.push(following.isHeld("op-1")));
  assert.equal(following.isHeld("op-1"), false);
  const release = following.hold("op-1");
  assert.equal(following.isHeld("op-1"), true);
  assert.equal(following.isHeld("op-2"), false);
  release();
  release();
  assert.equal(following.isHeld("op-1"), false);
  assert.deepEqual(changes, [true, false]);
  // whether a minting dialog is open at all (the watcher's toast waits then)
  assert.equal(following.dialogOpen(), false);
  const close = following.openDialog();
  assert.equal(following.dialogOpen(), true);
  close();
  assert.equal(following.dialogOpen(), false);
});

test("the last view heard of an operation is kept for the item card", () => {
  const following = createFollowing();
  let told = 0;
  following.subscribe(() => {
    told += 1;
  });
  assert.equal(following.noted("op-1"), null);
  following.note({ id: "op-1", state: "prepared" });
  following.note(null);
  assert.deepEqual(following.noted("op-1"), { id: "op-1", state: "prepared" });
  assert.equal(told, 1);
});

test("a settled answer (included) is followed slowly until the operation ends; going back speeds up again", async () => {
  const clock = fakeClock();
  const answers = [
    { state: "submitted" },
    { state: "included" },
    { state: "included" },
    { state: "submitted" },
    { state: "final" },
  ];
  let calls = 0;
  const seen = [];
  pollOperation({
    fetch: async () => answers[Math.min(calls++, answers.length - 1)],
    onAnswer: (answer) => seen.push(answer.state),
    ended: (answer) => answer.state === "final",
    settled: (answer) => answer.state === "included",
    slowEvery: 30000,
    page: fakePage(),
    timers: clock.timers,
  });
  await settle();
  await clock.advance(5000);
  assert.deepEqual(seen, ["submitted", "included"]);
  // included: the next poll only after 30 s
  await clock.advance(29999);
  assert.equal(calls, 2);
  await clock.advance(1);
  assert.equal(calls, 3);
  await clock.advance(30000);
  // back to submitted (a rollback): every 5 s again
  assert.deepEqual(seen, ["submitted", "included", "included", "submitted"]);
  await clock.advance(5000);
  assert.deepEqual(seen.at(-1), "final");
  await clock.advance(120000);
  assert.equal(calls, 5);
});

test("an operation last heard included lingers until it is final, ended or rolled back", () => {
  const following = createFollowing();
  following.note({ id: "op-1", state: "submitted" });
  following.note({ id: "op-2", state: "included" });
  following.note({ id: "op-3", state: "included" });
  following.note({ id: "op-3", state: "final" });
  assert.deepEqual(following.lingering(), ["op-2"]);
  following.note({ id: "op-2", state: "submitted" });
  assert.deepEqual(following.lingering(), []);
});
