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
  walletLabel,
} from "../../src/ui/account/safetyState.js";
import { GUIDE_ONLINE, guideLink } from "../../src/cardano/guide.js";

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
  // the row's one action (what it shows about the wallets' items: the tests below)
  const actionOf = ({ count, action, subject }) => ({ count, action, subject });
  const row = (identities) =>
    actionOf(
      accountSafety({
        identities,
        local: device(["words"]),
        passkeys: [],
        walletDoor: true,
      }).wallet
    );
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
    actionOf(
      accountSafety({
        identities: [walletKey],
        local: noWords,
        passkeys: [],
        walletDoor: true,
      }).wallet
    ),
    { count: 1, action: "connect", subject: null }
  );
  assert.equal(
    accountSafety({ identities: [own], local: device(), passkeys: [] }).wallet,
    null
  );
});

test("the wallet row lists each wallet with its name, its minted items and its wait", () => {
  const state = accountSafety({
    identities: [
      { ...own, wallet: null, items: 2, waitUntil: null },
      { ...walletKey, wallet: "eternl", items: 3, waitUntil: null },
      {
        ...otherWallet,
        wallet: "typhoncip30",
        items: 0,
        waitUntil: "2026-11-16T13:00:20.000Z",
      },
    ],
    local: device(["words"]),
    passkeys: [],
    walletDoor: true,
  });
  // the words key is no wallet: it is not in the list, but its items count in the game
  assert.deepEqual(state.wallet.list, [
    {
      subject: walletKey.subject,
      address: walletKey.address,
      name: "Eternl",
      items: 3,
      waitUntil: null,
    },
    {
      subject: otherWallet.subject,
      address: otherWallet.address,
      name: "Typhon",
      items: 0,
      waitUntil: "2026-11-16T13:00:20.000Z",
    },
  ]);
  assert.equal(state.wallet.items, 5);
  assert.equal(state.wallet.count, 2);
  assert.equal(state.wallet.describesItems, true);
});

test("the wallet row says the minted items live there only once a key holds one or its items wait", () => {
  const row = (identities) =>
    accountSafety({
      identities,
      local: device(["words"]),
      passkeys: [],
      walletDoor: true,
    }).wallet.describesItems;
  // nothing minted yet (nothing can be minted before the mint ships): the row as it was
  assert.equal(row([own, walletKey]), false);
  assert.equal(
    row([
      { ...own, items: 0, waitUntil: null },
      { ...walletKey, items: 0, waitUntil: null },
    ]),
    false
  );
  // a minted item in a wallet, or on the words key
  assert.equal(row([own, { ...walletKey, items: 1 }]), true);
  assert.equal(row([{ ...own, items: 2 }, walletKey]), true);
  // a wallet that moved from another player: its items wait
  assert.equal(
    row([
      own,
      { ...walletKey, items: 0, waitUntil: "2026-11-16T13:00:20.000Z" },
    ]),
    true
  );
});

test("the wallet row without the new fields (an older API): no names, no items, no wait", () => {
  const state = accountSafety({
    identities: [own, walletKey],
    local: device(["words"]),
    passkeys: [],
    walletDoor: true,
  });
  assert.deepEqual(state.wallet.list, [
    {
      subject: walletKey.subject,
      address: walletKey.address,
      name: null,
      items: 0,
      waitUntil: null,
    },
  ]);
  assert.equal(state.wallet.items, 0);
  // a count that is no number counts nothing
  const odd = accountSafety({
    identities: [{ ...walletKey, items: "3", wallet: 7 }],
    local: noWords,
    passkeys: [],
    walletDoor: true,
  });
  assert.equal(odd.wallet.items, 0);
  assert.equal(odd.wallet.list[0].items, 0);
  assert.equal(odd.wallet.list[0].name, null);
});

test("a wallet's name as players know it", () => {
  assert.equal(walletLabel("eternl"), "Eternl");
  assert.equal(walletLabel("vespr"), "Vespr");
  assert.equal(walletLabel("lace"), "Lace");
  assert.equal(walletLabel("typhoncip30"), "Typhon");
  assert.equal(walletLabel("gerowallet"), "Gero");
  assert.equal(walletLabel("nufi"), "NuFi");
  assert.equal(walletLabel("begin"), "Begin");
  assert.equal(walletLabel(null), null);
  assert.equal(walletLabel(""), null);
  assert.equal(walletLabel(undefined), null);
});

test("no guide link while the guide is not on the website", () => {
  assert.equal(GUIDE_ONLINE, false);
  assert.equal(guideLink("wallet", "de"), null);
  assert.equal(guideLink("ada"), null);
});

test("the guide's section in German or English, once it is online", () => {
  assert.equal(guideLink("wallet", "de", true), "/guide/#wallet-de");
  assert.equal(guideLink("ada", "en", true), "/guide/#ada-en");
  assert.equal(guideLink("costs", "ja", true), "/guide/#costs-en");
  assert.equal(guideLink("selling", "fr", true), "/guide/#selling-en");
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
