// The link page's technical detail under an error (node --test): which step failed and what the
// wallet or the API answered, so a failure on a real phone explains itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detailOf, traced } from "../../src/link/diagnosis.js";

test("an API answer shows the step, the status and the API's error", () => {
  const failure = Object.assign(
    new Error("Request failed with status code 400"),
    {
      response: { status: 400, data: { error: "INVALID SIGNATURE" } },
    }
  );
  assert.equal(
    detailOf(failure, "verifyForCode"),
    "verifyForCode · 400 INVALID SIGNATURE"
  );
});

test("an API answer without an error shows the status", () => {
  assert.equal(
    detailOf({ response: { status: 502, data: "<html>" } }, "network"),
    "network · 502"
  );
});

test("a request that got no answer shows its code", () => {
  const failure = Object.assign(new Error("Network Error"), {
    code: "ERR_NETWORK",
  });
  assert.equal(
    detailOf(failure, "challengeForCode"),
    "challengeForCode · Error: Network Error (ERR_NETWORK)"
  );
});

test("a CIP-30 error from the wallet shows its code and info", () => {
  assert.equal(
    detailOf({ code: -1, info: "account changed" }, "signData"),
    "signData · code -1: account changed"
  );
});

test("an error of the game shows its name and message", () => {
  class UnexpectedChallengeError extends Error {
    constructor() {
      super("not our challenge");
      this.name = "UnexpectedChallengeError";
    }
  }
  assert.equal(
    detailOf(new UnexpectedChallengeError(), "challengeForCode ok"),
    "challengeForCode ok · UnexpectedChallengeError: not our challenge"
  );
});

test("anything else is shown as text, and a long detail is cut", () => {
  assert.equal(detailOf("gone", "enable"), "enable · gone");
  assert.equal(detailOf(undefined), "undefined");
  const long = detailOf(new Error("x".repeat(500)), "enable");
  assert.equal(long.length, 160);
  assert.ok(long.endsWith("…"));
});

test("traced calls go through with the object as this and note the step", async () => {
  const steps = [];
  const wallet = {
    id: 0,
    getNetworkId() {
      return Promise.resolve(this.id);
    },
    signData() {
      return Promise.reject(new Error("no"));
    },
  };
  const api = traced(wallet, ["getNetworkId", "signData"], (step) =>
    steps.push(step)
  );
  assert.equal(await api.getNetworkId(), 0);
  await assert.rejects(api.signData("addr", "00"), /no/);
  assert.deepEqual(steps, ["getNetworkId", "getNetworkId ok", "signData"]);
});
