// The game's Cardano key (node --test): 24 recovery words, the stake key and reward address they
// give, CIP-30 signData with it, the key store on the device, and signing a server challenge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COSE, KeyHash, RewardAccount } from "@evolution-sdk/evolution";
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import {
  newRecoveryWords,
  normalizeWords,
  wordsAreValid,
  keysFromWords,
  rewardAddressOf,
  signMessage,
} from "../../src/cardano/keys.js";
import {
  createKeyStore,
  KeyStoreError,
  KeyAlreadyStoredError,
} from "../../src/cardano/keyStore.js";
import {
  rememberAndroidApp,
  isAndroidApp,
} from "../../src/cardano/androidApp.js";
import {
  signChallenge,
  NetworkMismatchError,
  UnexpectedChallengeError,
} from "../../src/cardano/signIn.js";
import { createFeatures } from "../../src/cardano/features.js";

const { preprod, mainnet } = cardano.Networks;
// abandon x 23 + art: a valid 24-word phrase; its stake address checked with PyCardano 0.x
// (HDWallet.from_mnemonic(...).derive_from_path("m/1852'/1815'/0'/2/0")) on 2026-11-08
const ABANDON = [...Array(23).fill("abandon"), "art"];

const bytesOfBech32Key = async (bech32Text) => {
  const { bech32 } = await import("@scure/base");
  return Uint8Array.from(bech32.fromWords(bech32.decode(bech32Text).words));
};

test("rewardAddressOf encodes the CIP-19 stake key", async () => {
  const vkey = await bytesOfBech32Key(
    "stake_vk1px4j0r2fk7ux5p23shz8f3y5y2qam7s954rgf3lg5merqcj6aetsft99wu"
  );
  assert.equal(
    await rewardAddressOf(vkey, preprod),
    "stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn"
  );
  assert.equal(
    await rewardAddressOf(vkey, mainnet),
    "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw"
  );
});

test("keysFromWords derives the CIP-1852 stake key (1852'/1815'/0'/2/0)", async () => {
  const onPreprod = await keysFromWords(ABANDON, preprod);
  const onMainnet = await keysFromWords(ABANDON, mainnet);
  assert.equal(
    onPreprod.rewardAddress,
    "stake_test1urp0gksk5e59v9h9vmqqlsyplevl30t6keu7u90fecsrg3stmmepg"
  );
  assert.equal(
    onMainnet.rewardAddress,
    "stake1u8p0gksk5e59v9h9vmqqlsyplevl30t6keu7u90fecsrg3sv33m94"
  );
  assert.equal(
    onPreprod.stakeKeyHashHex,
    "c2f45a16a6685616e566c00fc081fe59f8bd7ab679ee15e9ce203446"
  );
  assert.equal(onMainnet.stakeKeyHashHex, onPreprod.stakeKeyHashHex);
});

test("new recovery words: 24 valid ones, different every time", async () => {
  const words = await newRecoveryWords();
  assert.equal(words.length, 24);
  assert.equal(await wordsAreValid(words), true);
  assert.notDeepEqual(await newRecoveryWords(), words);
});

test("normalizeWords takes words typed or pasted loosely", () => {
  assert.deepEqual(normalizeWords("  Test  TEST\ntest, 4) sauce"), [
    "test",
    "test",
    "test",
    "sauce",
  ]);
  assert.deepEqual(normalizeWords("1. abandon\n2) ability 3 able"), [
    "abandon",
    "ability",
    "able",
  ]);
  assert.deepEqual(normalizeWords("   "), []);
  assert.deepEqual(
    normalizeWords(
      "1.abandon - ability \u2022 able (4) about #5 above 6: absent. absorb/abstract\u200b"
    ),
    [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
    ]
  );
});

test("wordsAreValid: the checksum catches one wrong word", async () => {
  assert.equal(await wordsAreValid(ABANDON), true);
  assert.equal(
    await wordsAreValid([...ABANDON.slice(0, 23), "abandon"]),
    false
  );
  assert.equal(await wordsAreValid(ABANDON.slice(0, 12)), false);
  assert.equal(
    await wordsAreValid([...ABANDON.slice(0, 23), "chocolate"]),
    false
  );
});

test("signMessage gives a CIP-30 DataSignature that verifies for the reward address", async () => {
  const keys = await keysFromWords(ABANDON, preprod);
  const message = "battlechoc.com wants you to sign in";
  const { signature, key } = await signMessage(keys, message);
  const account = RewardAccount.fromBech32(keys.rewardAddress);
  const signed = {
    signature: Uint8Array.from(Buffer.from(signature, "hex")),
    key: Uint8Array.from(Buffer.from(key, "hex")),
  };
  const verify = (text) =>
    COSE.SignData.verifyData(
      RewardAccount.toHex(account),
      KeyHash.toHex(account.stakeCredential),
      COSE.Utils.fromText(text),
      signed
    );
  assert.equal(verify(message), true);
  assert.equal(verify(message + "!"), false);
});

// an api like src/api/cardano.js that records what it was asked
const fakeApi = ({ network = "preprod", tamper = (text) => text } = {}) => {
  const calls = [];
  return {
    calls,
    network: async () => {
      calls.push("network");
      return network;
    },
    challenge: async (purpose, address) => {
      calls.push(["challenge", purpose, address]);
      const message = cardano.challengeMessage({
        address,
        purpose,
        network: preprod,
        nonce: "n1",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 300000),
      });
      return { nonce: "n1", message: tamper(message), expiresAt: "" };
    },
    verify: async (body) => {
      calls.push(["verify", body]);
      return { identity: { subject: "stake:x" } };
    },
  };
};

test("signChallenge asks for a challenge for the reward address, signs its text and sends it", async () => {
  const api = fakeApi();
  const answer = await signChallenge(ABANDON, "link", {
    api,
    network: preprod,
  });
  assert.deepEqual(answer, { identity: { subject: "stake:x" } });
  const keys = await keysFromWords(ABANDON, preprod);
  assert.deepEqual(api.calls[1], ["challenge", "link", keys.rewardAddress]);
  const [, body] = api.calls[2];
  assert.equal(body.nonce, "n1");
  const { message } = await api.challenge("link", keys.rewardAddress);
  assert.ok(message.includes(keys.rewardAddress));
  assert.equal(body.signature.length > 100, true);
});

test("signChallenge signs only battlechoc's challenge text, for this address, purpose and network", async () => {
  const tampered = [
    (text) => text.replace("battlechoc.com wants", "evil.example wants"),
    (text) => text.replace("Action: link", "Action: sign-in"),
    (text) => text.replace("Network: preprod", "Network: mainnet"),
    (text) => text.replace("Nonce: n1", "Nonce: n2"),
    (text) => `${text}\nAlso: send everything`,
  ];
  for (const tamper of tampered) {
    const api = fakeApi({ tamper });
    await assert.rejects(
      signChallenge(ABANDON, "link", { api, network: preprod }),
      UnexpectedChallengeError
    );
    assert.equal(
      api.calls.some((call) => call[0] === "verify"),
      false
    );
  }
});

test("signChallenge refuses to sign when the server runs another network", async () => {
  const api = fakeApi({ network: "mainnet" });
  await assert.rejects(
    signChallenge(ABANDON, "sign-in", { api, network: preprod }),
    NetworkMismatchError
  );
  assert.deepEqual(api.calls, ["network"]);
});

// a store like OfflineStore.playerStore, in memory
const memoryStore = () => {
  const map = new Map();
  return {
    map,
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    // like IndexedDB's add: refuses a key that exists (also when another tab wrote it)
    add: async (key, value) => {
      await Promise.resolve();
      if (map.has(key)) {
        throw new DOMException("exists", "ConstraintError");
      }
      map.set(key, value);
    },
    delete: async (key) => {
      map.delete(key);
    },
  };
};

test("the key store keeps the words encrypted and gives them back", async () => {
  const store = memoryStore();
  const keyStore = createKeyStore(store);
  assert.equal(await keyStore.has(), false);
  assert.equal(await keyStore.load(), null);
  await keyStore.save(ABANDON);
  assert.equal(await keyStore.has(), true);
  assert.deepEqual(await keyStore.load(), ABANDON);
  const kept = JSON.stringify([...store.map.values()], (key, value) =>
    value instanceof Uint8Array || value instanceof ArrayBuffer
      ? "bytes"
      : value
  );
  assert.equal(kept.includes("abandon"), false);
  await keyStore.clear();
  assert.equal(await keyStore.has(), false);
});

test("the key store never overwrites a stored key", async () => {
  const keyStore = createKeyStore(memoryStore());
  await keyStore.save(ABANDON);
  await assert.rejects(
    keyStore.save(await newRecoveryWords()),
    KeyAlreadyStoredError
  );
  assert.deepEqual(await keyStore.load(), ABANDON);
});

test("two saves at once (two tabs, a double tap): one wins, the other is told", async () => {
  const store = memoryStore();
  const other = await newRecoveryWords();
  const results = await Promise.allSettled([
    createKeyStore(store).save(ABANDON),
    createKeyStore(store).save(other),
  ]);
  const won = results.filter((result) => result.status === "fulfilled");
  const lost = results.filter((result) => result.status === "rejected");
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.ok(lost[0].reason instanceof KeyAlreadyStoredError);
  const stored = await createKeyStore(store).load();
  assert.deepEqual(stored, results[0].status === "fulfilled" ? ABANDON : other);
});

test("a key the store cannot give back is removed again, so saving can be tried again", async () => {
  const store = memoryStore();
  let broken = true;
  const flaky = {
    ...store,
    get: async (key) => {
      const record = await store.get(key);
      return broken && record ? { ...record, data: new Uint8Array(4) } : record;
    },
  };
  const keyStore = createKeyStore(flaky);
  await assert.rejects(keyStore.save(ABANDON), KeyStoreError);
  assert.equal(store.map.size, 0);
  broken = false;
  await keyStore.save(ABANDON);
  assert.deepEqual(await keyStore.load(), ABANDON);
});

test("blocked storage, already when looking: KeyStoreError", async () => {
  const blocked = {
    get: async () => {
      throw new DOMException("blocked", "UnknownError");
    },
    add: async () => {},
    delete: async () => {},
  };
  await assert.rejects(createKeyStore(blocked).save(ABANDON), KeyStoreError);
});

test("a store that refuses the key: KeyStoreError, nothing kept", async () => {
  const refusing = {
    get: async () => undefined,
    add: async () => {
      throw new DOMException("blocked", "InvalidStateError");
    },
    delete: async () => {},
  };
  await assert.rejects(createKeyStore(refusing).save(ABANDON), KeyStoreError);
});

test("features: off without a network; the preprod badge not on mainnet and not in the Android app", () => {
  assert.equal(createFeatures({ network: undefined }).enabled(), false);
  const web = createFeatures({ network: "preprod", androidApp: false });
  assert.equal(web.enabled(), true);
  assert.equal(web.showPreprodBadge(), true);
  // plan 3: the wallet door shows on the web, not in the Android app (cardanoWallet.test.js)
  assert.equal(web.showWalletDoor(), true);
  const app = createFeatures({ network: "preprod", androidApp: true });
  assert.equal(app.enabled(), true);
  assert.equal(app.inAndroidApp(), true);
  assert.equal(app.showPreprodBadge(), false);
  assert.equal(app.showWalletDoor(), false);
  assert.equal(
    createFeatures({
      network: "mainnet",
      androidApp: false,
    }).showPreprodBadge(),
    false
  );
  assert.equal(createFeatures({ network: "testnet" }).enabled(), false);
});

test("the Android app is remembered at launch, before the address is cleaned up", () => {
  const storage = new Map();
  const session = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  };
  assert.equal(
    isAndroidApp(() => session),
    false
  );
  rememberAndroidApp({
    search: "?app_runs_as=twa&app_version=1",
    referrer: "",
    storage: () => session,
  });
  assert.equal(
    isAndroidApp(() => session),
    true
  );
  const other = new Map();
  const otherSession = {
    getItem: (key) => other.get(key) ?? null,
    setItem: (key, value) => other.set(key, value),
  };
  rememberAndroidApp({
    search: "",
    referrer: "android-app://com.battlechoc.game/",
    storage: () => otherSession,
  });
  assert.equal(
    isAndroidApp(() => otherSession),
    true
  );
  const web = new Map();
  const webSession = {
    getItem: (key) => web.get(key) ?? null,
    setItem: (key, value) => web.set(key, value),
  };
  rememberAndroidApp({
    search: "?challenge=K7Q2",
    referrer: "https://google.com/",
    storage: () => webSession,
  });
  assert.equal(
    isAndroidApp(() => webSession),
    false
  );
  assert.equal(
    isAndroidApp(() => ({
      getItem: () => {
        throw new Error("blocked");
      },
    })),
    false
  );
});

test("the backup mark belongs to the stored key and goes with it", async () => {
  const keyStore = createKeyStore(memoryStore());
  assert.equal(await keyStore.backedUp(), false);
  await keyStore.save(ABANDON);
  assert.equal(await keyStore.backedUp(), false);
  await keyStore.markBackedUp();
  assert.equal(await keyStore.backedUp(), true);
  await keyStore.clear();
  assert.equal(await keyStore.backedUp(), false);
  await keyStore.save(await newRecoveryWords());
  assert.equal(await keyStore.backedUp(), false);
});

test("the storage is asked for inside the guard: blocked storage, where even reading window.sessionStorage throws, does not stop the game", () => {
  const kept = new Map();
  const session = () => ({
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => kept.set(key, value),
  });
  rememberAndroidApp({
    search: "?app_runs_as=twa",
    referrer: "",
    storage: session,
  });
  assert.equal(isAndroidApp(session), true);

  const blocked = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  assert.equal(
    rememberAndroidApp({
      search: "?app_runs_as=twa",
      referrer: "",
      storage: blocked,
    }),
    true
  );
  assert.equal(isAndroidApp(blocked), false);
});

test("the backup mark lists how the words were backed up on this device", async () => {
  const keyStore = createKeyStore(memoryStore());
  await keyStore.save(ABANDON);
  assert.deepEqual(await keyStore.backupMethods(), []);
  await keyStore.markBackedUp("file");
  await keyStore.markBackedUp("words");
  await keyStore.markBackedUp("file");
  assert.deepEqual(await keyStore.backupMethods(), ["file", "words"]);
  assert.equal(await keyStore.backedUp(), true);
  await keyStore.clear();
  assert.deepEqual(await keyStore.backupMethods(), []);
});
