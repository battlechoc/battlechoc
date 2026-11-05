// The live lobby state of challenges (node --test): the challenger's own challenge, a friend's
// view of one, and the kind of the running match.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  liveReducer,
  challengeUpdated,
  challengeViewed,
  challengeCleared,
  challengeDismissed,
  challengeRequested,
  liveMatchStarted,
} from "../../src/match/liveSlice.js";
import {
  matchReducer,
  matchHosted,
  matchCleared,
} from "../../src/match/matchSlice.js";

const initial = liveReducer(undefined, { type: "init" });
const waiting = {
  code: "K7Q2M9XD",
  state: "waiting",
  expiresAt: 120000,
  readers: 0,
};

test("the challenger's challenge is stored as the server sends it", () => {
  const state = liveReducer(initial, challengeUpdated(waiting));
  assert.deepEqual(state.challenge, waiting);
});

test("a challenge the server no longer knows (a restart) is lost while it waited, else gone", () => {
  for (const status of ["waiting", "reading", "accepted"]) {
    const state = liveReducer(
      liveReducer(initial, challengeUpdated({ ...waiting, state: status })),
      challengeUpdated(null)
    );
    assert.equal(state.challenge.state, "lost");
    assert.equal(state.challenge.code, "K7Q2M9XD");
  }
  for (const status of ["expired", "declined", "missed", "lost"]) {
    const state = liveReducer(
      liveReducer(initial, challengeUpdated({ ...waiting, state: status })),
      challengeUpdated(null)
    );
    assert.equal(state.challenge, null);
  }
});

test("a friend's view of a challenge is stored; a match clears both", () => {
  const view = { code: "K7Q2M9XD", state: "open", from: "Anna" };
  let state = liveReducer(initial, challengeViewed(view));
  state = liveReducer(state, challengeUpdated(waiting));
  assert.deepEqual(state.challengeView, view);
  state = liveReducer(state, liveMatchStarted());
  assert.equal(state.challenge, null);
  assert.equal(state.challengeView, null);
});

test("the match kind comes with the host", () => {
  let state = matchReducer(
    undefined,
    matchHosted({ online: true, kind: "challenge" })
  );
  assert.equal(state.kind, "challenge");
  state = matchReducer(state, matchCleared());
  assert.equal(state.kind, undefined);
});

test("cancelling clears the challenge, so the server's answer does not count as lost", () => {
  let state = liveReducer(initial, challengeUpdated(waiting));
  state = liveReducer(state, challengeCleared());
  state = liveReducer(state, challengeUpdated(null));
  assert.equal(state.challenge, null);
});

test("a challenge dismissed before the server made it is cancelled when it arrives, not shown", () => {
  let state = liveReducer(initial, challengeDismissed());
  state = liveReducer(state, challengeUpdated(waiting));
  assert.equal(state.challenge, null);
  assert.equal(state.challengeToCancel, "K7Q2M9XD");
  state = liveReducer(state, challengeCleared());
  assert.equal(state.challengeToCancel, null);
  // the next challenge the player makes shows as usual
  state = liveReducer(state, challengeUpdated(waiting));
  assert.deepEqual(state.challenge, waiting);
});

test("opening the dialog again before the answer keeps the challenge", () => {
  let state = liveReducer(initial, challengeDismissed());
  state = liveReducer(state, challengeRequested());
  state = liveReducer(state, challengeUpdated(waiting));
  assert.deepEqual(state.challenge, waiting);
  assert.equal(state.challengeToCancel, null);
});

test("a match that comes back (a reload) keeps a friend's challenge that is still being asked", () => {
  for (const status of ["connecting", "busy"]) {
    let state = liveReducer(
      initial,
      challengeViewed({ code: "K7Q2M9XD", state: status })
    );
    state = liveReducer(state, liveMatchStarted());
    assert.equal(state.challengeView.state, status);
  }
});
