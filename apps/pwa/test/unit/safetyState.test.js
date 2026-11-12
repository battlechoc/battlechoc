// The account safety's rules (node --test): which of the profile's three states shows, which
// rows the "Account safety" dialog has and their one action, and which keys are wallets
// (src/ui/account/safetyState.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountSafety,
  MAX_PASSKEYS,
  shortAddress,
  networkLabel,
} from "../../src/ui/account/safetyState.js";

const WORDS = Array.from({ length: 24 }, () => "cocoa");
const own = { subject: "stake:own", address: "stake_test1own" };
const walletKey = { subject: "stake:wallet", address: "stake_test1wallet" };
const otherWallet = { subject: "stake:other", address: "stake_test1other" };

const device = (methods = []) => ({
  words: WORDS,
  subject: own.subject,
  methods,
});
const noWords = { words: null, subject: null, methods: [] };

test("no linked key: not saved", () => {
  const state = accountSafety({ identities: [], local: noWords, passkeys: [] });
  assert.equal(state.profile, "unsaved");
  assert.equal(state.words, null);
});

test("own words kept nowhere: finish the backup; any mark or an own passkey: saved", () => {
  const unfinished = accountSafety({
    identities: [own],
    local: device(),
    passkeys: [],
  });
  assert.equal(unfinished.profile, "unfinished");
  assert.deepEqual(unfinished.words, { backedUp: false });
  for (const methods of [["words"], ["file"]]) {
    const state = accountSafety({
      identities: [own],
      local: device(methods),
      passkeys: [],
    });
    assert.equal(state.profile, "saved");
    assert.deepEqual(state.words, { backedUp: true });
  }
  const withPasskey = accountSafety({
    identities: [own],
    local: device(),
    passkeys: [{ subject: own.subject, credentialId: "a" }],
  });
  assert.equal(withPasskey.profile, "saved");
  // the passkey guards the words, it is no copy of them: the words row still asks for one
  assert.deepEqual(withPasskey.words, { backedUp: false });
});

test("words of another account on this device are not the player's: saved, no words row", () => {
  const state = accountSafety({
    identities: [walletKey],
    local: device(),
    passkeys: [],
    canPasskey: true,
    walletDoor: true,
    details: true,
  });
  assert.equal(state.profile, "saved");
  assert.equal(state.ownWords, false);
  assert.equal(state.words, null);
  assert.equal(state.passkey, null);
  assert.deepEqual(
    state.keys.map((key) => key.kind),
    ["wallet"]
  );
});

test("the passkey row: only with own words, a device that can and readable passkeys", () => {
  const base = { identities: [own], local: device(["words"]), passkeys: [] };
  assert.equal(accountSafety({ ...base, canPasskey: false }).passkey, null);
  assert.equal(
    accountSafety({ ...base, canPasskey: true, passkeys: null }).passkey,
    null
  );
  assert.deepEqual(accountSafety({ ...base, canPasskey: true }).passkey, {
    count: 0,
    action: "setup",
  });
  assert.deepEqual(
    accountSafety({
      ...base,
      canPasskey: true,
      passkeys: [{ subject: own.subject }, { subject: "stake:elsewhere" }],
    }).passkey,
    { count: 1, action: "add" }
  );
  const full = Array.from({ length: MAX_PASSKEYS }, () => ({
    subject: own.subject,
  }));
  assert.deepEqual(
    accountSafety({ ...base, canPasskey: true, passkeys: full }).passkey,
    { count: MAX_PASSKEYS, action: null }
  );
});

test("the wallet row: connect, disconnect the one beside the words, connect another beside two", () => {
  const row = (identities) =>
    accountSafety({
      identities,
      local: device(["words"]),
      passkeys: [],
      walletDoor: true,
    }).wallet;
  assert.deepEqual(row([own]), {
    count: 0,
    action: "connect",
    subject: null,
  });
  assert.deepEqual(row([own, walletKey]), {
    count: 1,
    action: "disconnect",
    subject: walletKey.subject,
  });
  assert.deepEqual(row([own, walletKey, otherWallet]), {
    count: 2,
    action: "connect",
    subject: null,
  });
  // the only key cannot go
  assert.deepEqual(
    accountSafety({
      identities: [walletKey],
      local: noWords,
      passkeys: [],
      walletDoor: true,
    }).wallet,
    { count: 1, action: "connect", subject: null }
  );
  assert.equal(
    accountSafety({ identities: [own], local: device(), passkeys: [] }).wallet,
    null
  );
});

test("technical details: labelled keys, Remove only with more than one key", () => {
  const one = accountSafety({
    identities: [own],
    local: device(["words"]),
    passkeys: [],
    details: true,
  });
  assert.deepEqual(
    one.keys.map(({ kind, removable }) => ({ kind, removable })),
    [{ kind: "words", removable: false }]
  );
  const two = accountSafety({
    identities: [own, walletKey],
    local: device(["words"]),
    passkeys: [],
    details: true,
  });
  assert.deepEqual(
    two.keys.map(({ kind, removable }) => ({ kind, removable })),
    [
      { kind: "words", removable: true },
      { kind: "wallet", removable: true },
    ]
  );
  // not in the Android app
  assert.equal(
    accountSafety({ identities: [own], local: device(), passkeys: [] }).keys,
    null
  );
});

test("a long address is cut in the middle, a short one stays", () => {
  const address = "stake_test1uqtabcdefghijklmnopqrstuvwxyzagvc8lxs";
  assert.equal(shortAddress(address), "stake_test1uqt…agvc8lxs");
  assert.equal(shortAddress("stake_test1own"), "stake_test1own");
});

test("a network's name as players read it", () => {
  assert.equal(networkLabel("preprod"), "Preprod");
  assert.equal(networkLabel(""), "");
});
