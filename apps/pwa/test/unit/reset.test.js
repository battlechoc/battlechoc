// "Reset battlechoc" in the Settings (node --test): which warning the player reads about the
// account, and what the reset removes from the device and what it keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetWarning,
  resetDevice,
  KEEP_LOCAL,
  KEEP_SESSION,
} from "../../src/reset.js";

test("the warning follows the account: saved, not saved, unknown, no saving in this build", () => {
  assert.equal(
    resetWarning({ canSave: true, online: true, profile: "saved" }),
    "saved"
  );
  assert.equal(
    resetWarning({ canSave: true, online: true, profile: "unsaved" }),
    "unsaved"
  );
  // a key is linked, but its words are kept nowhere: the reset takes them with it
  assert.equal(
    resetWarning({ canSave: true, online: true, profile: "unfinished" }),
    "unsaved"
  );
  // without the server the linked keys cannot be read
  assert.equal(
    resetWarning({ canSave: true, online: false, profile: null }),
    "unknown"
  );
  assert.equal(
    resetWarning({ canSave: true, online: true, profile: null }),
    "unknown"
  );
  // a build without saving (no VITE_CARDANO_NETWORK) has no way to keep the account
  assert.equal(
    resetWarning({ canSave: false, online: true, profile: null }),
    "noBackup"
  );
});

// window.localStorage / sessionStorage in memory
const fakeStorage = (entries) => {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    removeItem: (key) => map.delete(key),
    entries: () => Object.fromEntries(map),
  };
};

const devices = () => {
  const calls = [];
  const local = fakeStorage({
    "battlechoc.apiUrl": "http://127.0.0.1:8091",
    "peer-connect-dapp-id": "abc",
    "some-library": "x",
  });
  const session = fakeStorage({
    "battlechoc.androidApp": "1",
    "battlechoc.link": "y",
  });
  return {
    calls,
    local,
    session,
    deps: {
      erase: async () => calls.push("erase"),
      endSession: async () => calls.push("endSession"),
      local: () => local,
      session: () => session,
    },
  };
};

test("the reset ends the session, erases the stores and empties web storage but for what the device needs", async () => {
  const { calls, local, session, deps } = devices();
  await resetDevice(deps);
  assert.deepEqual(calls, ["endSession", "erase"]);
  // a developer's API address and the Android app's launch mark are no player data
  assert.deepEqual(KEEP_LOCAL, ["battlechoc.apiUrl"]);
  assert.deepEqual(KEEP_SESSION, ["battlechoc.androidApp"]);
  assert.deepEqual(local.entries(), {
    "battlechoc.apiUrl": "http://127.0.0.1:8091",
  });
  assert.deepEqual(session.entries(), { "battlechoc.androidApp": "1" });
});

test("a server that fails or does not answer does not stop the reset", async () => {
  const failing = devices();
  failing.deps.endSession = async () => {
    throw new Error("Network Error");
  };
  await resetDevice(failing.deps);
  assert.deepEqual(failing.calls, ["erase"]);

  const silent = devices();
  silent.deps.endSession = () => new Promise(() => {});
  const started = Date.now();
  await resetDevice({ ...silent.deps, timeoutMs: 50 });
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(silent.calls, ["erase"]);
});

test("blocked web storage (all site data blocked) does not stop the reset", async () => {
  const { calls, deps } = devices();
  const blocked = () => {
    throw new Error("SecurityError");
  };
  await resetDevice({ ...deps, local: blocked, session: blocked });
  assert.deepEqual(calls, ["endSession", "erase"]);
});
