// Backups of the recovery words (node --test): a password-protected file, a passkey (WebAuthn
// PRF, with a fake authenticator), confirming key changes, and which paths a platform offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import {
  encryptBackup,
  decryptBackup,
  saveBackup,
  BackupFileError,
} from "../../src/cardano/backupFile.js";
import {
  createPasskeyBackup,
  unlockWithPasskey,
  passkeySupport,
  PasskeyPrfError,
  PasskeyCancelledError,
  PasskeyExistsError,
  PasskeyUnknownError,
} from "../../src/cardano/passkey.js";
import {
  confirmWithWords,
  confirmWithPasskey,
} from "../../src/cardano/confirm.js";
import { createFeatures } from "../../src/cardano/features.js";
import { newRecoveryWords } from "../../src/cardano/keys.js";

const { preprod } = cardano.Networks;
const ABANDON = [...Array(23).fill("abandon"), "art"];

test("a backup file opens with its password and holds no word in the clear", async () => {
  const text = await encryptBackup(ABANDON, "choco-late-42");
  const file = JSON.parse(text);
  assert.equal(file.format, "battlechoc-recovery");
  assert.equal(file.version, 1);
  assert.equal(file.kdf.name, "PBKDF2");
  assert.equal(file.kdf.iterations, 600000);
  assert.equal(text.includes("abandon"), false);
  assert.deepEqual(await decryptBackup(text, "choco-late-42"), ABANDON);
});

test("a wrong password, another file or a damaged backup say so and nothing else", async () => {
  const text = await encryptBackup(ABANDON, "choco-late-42");
  const reason = async (promise) => {
    try {
      await promise;
    } catch (error) {
      assert.ok(error instanceof BackupFileError, String(error));
      return error.reason;
    }
    return "opened";
  };
  assert.equal(await reason(decryptBackup(text, "wrong")), "wrong-password");
  assert.equal(await reason(decryptBackup("not json", "x")), "not-a-backup");
  assert.equal(
    await reason(decryptBackup('{"format":"other"}', "x")),
    "not-a-backup"
  );
  assert.equal(
    await reason(
      decryptBackup('{"format":"battlechoc-recovery","version":9}', "x")
    ),
    "not-a-backup"
  );
  const damaged = JSON.parse(text);
  damaged.data = damaged.data.slice(0, -4) + "AAAA";
  assert.equal(
    await reason(decryptBackup(JSON.stringify(damaged), "choco-late-42")),
    "wrong-password"
  );
  // a file that asks for absurd work is refused before any is done
  const greedy = {
    ...JSON.parse(text),
    kdf: { ...JSON.parse(text).kdf, iterations: 1e9 },
  };
  assert.equal(
    await reason(decryptBackup(JSON.stringify(greedy), "x")),
    "not-a-backup"
  );
});

// an authenticator with PRF: one secret per credential, the same output for the same salt
const fakeAuthenticator = ({ prf = true, prfOnCreate = false } = {}) => {
  const credentials = new Map();
  let last;
  const secretFor = async (id, salt) => {
    const material = new Uint8Array([...id, ...new Uint8Array(salt)]);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  };
  const result = async (id, extensions) => {
    const salt = extensions?.prf?.eval?.first;
    const first = prf && salt ? await secretFor(id, salt) : undefined;
    return {
      prf: first ? { results: { first: first.buffer } } : { enabled: prf },
    };
  };
  return {
    created: credentials,
    create: async ({ publicKey }) => {
      const id = crypto.getRandomValues(new Uint8Array(16));
      credentials.set(Buffer.from(id).toString("hex"), publicKey);
      last = id;
      const extensions = prfOnCreate
        ? await result(id, publicKey.extensions)
        : { prf: { enabled: prf } };
      return { rawId: id.buffer, getClientExtensionResults: () => extensions };
    },
    get: async ({ publicKey }) => {
      const id = publicKey.allowCredentials?.length
        ? new Uint8Array(publicKey.allowCredentials[0].id)
        : last;
      const extensions = await result(id, publicKey.extensions);
      return { rawId: id.buffer, getClientExtensionResults: () => extensions };
    },
  };
};

test("a passkey backup opens with the same passkey, also when PRF answers only on get", async () => {
  for (const prfOnCreate of [true, false]) {
    const authenticator = fakeAuthenticator({ prfOnCreate });
    const stored = new Map();
    const backup = await createPasskeyBackup(ABANDON, {
      playerName: "Carolin",
      subject: "stake:abc",
      rpId: "battlechoc.com",
      credentials: authenticator,
    });
    assert.equal(backup.subject, "stake:abc");
    assert.match(backup.credentialId, /^[A-Za-z0-9_-]+$/);
    assert.equal(JSON.stringify(backup).includes("abandon"), false);
    stored.set(backup.credentialId, backup);
    const [options] = [...authenticator.created.values()];
    assert.equal(options.authenticatorSelection.residentKey, "required");
    assert.equal(options.authenticatorSelection.userVerification, "required");
    const words = await unlockWithPasskey(async (id) => stored.get(id), {
      rpId: "battlechoc.com",
      credentials: authenticator,
    });
    assert.deepEqual(words, ABANDON);
  }
});

test("an authenticator without PRF: PasskeyPrfError, nothing to store", async () => {
  const authenticator = fakeAuthenticator({ prf: false });
  await assert.rejects(
    createPasskeyBackup(ABANDON, {
      playerName: "Carolin",
      subject: "stake:abc",
      rpId: "battlechoc.com",
      credentials: authenticator,
    }),
    PasskeyPrfError
  );
  await assert.rejects(
    unlockWithPasskey(async () => undefined, {
      rpId: "battlechoc.com",
      credentials: authenticator,
    }),
    PasskeyPrfError
  );
});

test("passkey support: the browser's PRF capability when it says, else a platform authenticator", async () => {
  assert.equal(await passkeySupport({}), false);
  const said = (prf) => ({
    PublicKeyCredential: {
      getClientCapabilities: async () => ({ "extension:prf": prf }),
    },
  });
  assert.equal(await passkeySupport(said(true)), true);
  assert.equal(await passkeySupport(said(false)), false);
  const platform = {
    PublicKeyCredential: {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    },
  };
  assert.equal(await passkeySupport(platform), true);
});

// an api like src/api/cardano.js for confirming (the challenge text is the real one)
const confirmApi = () => {
  const calls = [];
  return {
    calls,
    network: async () => "preprod",
    challenge: async (purpose, address) => {
      calls.push(["challenge", purpose]);
      return {
        nonce: "n1",
        message: cardano.challengeMessage({
          address,
          purpose,
          network: preprod,
          nonce: "n1",
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 300000),
        }),
      };
    },
    verify: async (body, purpose) => {
      calls.push(["verify", purpose]);
      return { confirmToken: "token-1", expiresIn: 300 };
    },
    passkeyBackup: async () => undefined,
  };
};

test("confirming with the words signs a confirm challenge and gives its token", async () => {
  const api = confirmApi();
  assert.equal(
    await confirmWithWords(ABANDON, { api, network: preprod }),
    "token-1"
  );
  assert.deepEqual(api.calls, [
    ["challenge", "confirm"],
    ["verify", "confirm"],
  ]);
});

test("confirming with the passkey unlocks the words first", async () => {
  const authenticator = fakeAuthenticator({ prfOnCreate: true });
  const words = await newRecoveryWords();
  const backup = await createPasskeyBackup(words, {
    playerName: "Carolin",
    subject: "stake:abc",
    rpId: "battlechoc.com",
    credentials: authenticator,
  });
  const api = { ...confirmApi(), passkeyBackup: async () => backup };
  const token = await confirmWithPasskey({
    api,
    network: preprod,
    rpId: "battlechoc.com",
    credentials: authenticator,
  });
  assert.equal(token, "token-1");
});

test("device-only paths: on iOS only once the owner confirmed them", async () => {
  const web = createFeatures({ network: "preprod", ios: false, confirmed: "" });
  assert.equal(web.offerFileShare(), true);
  assert.equal(await web.offerPasskey(async () => true), true);
  assert.equal(await web.offerPasskey(async () => false), false);
  const iphone = createFeatures({
    network: "preprod",
    ios: true,
    confirmed: "",
  });
  assert.equal(iphone.offerFileShare(), false);
  assert.equal(await iphone.offerPasskey(async () => true), false);
  const confirmed = createFeatures({
    network: "preprod",
    ios: true,
    confirmed: "passkey-ios, file-ios",
  });
  assert.equal(confirmed.confirmed("passkey-ios"), true);
  assert.equal(confirmed.offerFileShare(), true);
  assert.equal(await confirmed.offerPasskey(async () => true), true);
  assert.equal(
    await createFeatures({ network: undefined }).offerPasskey(async () => true),
    false
  );
});

const reasonOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof BackupFileError, String(error));
    return error.reason;
  }
  return "opened";
};

test("a backup file without its parts, or with broken base64, is not a backup (no other error)", async () => {
  const good = JSON.parse(await encryptBackup(ABANDON, "choco-late-42"));
  const broken = [
    { format: "battlechoc-recovery", version: 1 },
    { ...good, kdf: null },
    { ...good, cipher: null },
    { ...good, kdf: { ...good.kdf, salt: "%%%" } },
    { ...good, data: "%%%" },
  ];
  for (const file of broken) {
    assert.equal(
      await reasonOf(decryptBackup(JSON.stringify(file), "choco-late-42")),
      "not-a-backup"
    );
  }
});

test("a password typed with another Unicode form still opens the file", async () => {
  const text = await encryptBackup(ABANDON, "Schokolade-\u00e9");
  assert.deepEqual(await decryptBackup(text, "Schokolade-e\u0301"), ABANDON);
});

// a page around saveBackup: what it shares, downloads and puts into the document
const page = ({ shareable = () => true, share = async () => {} } = {}) => {
  const happened = [];
  const body = {
    appendChild: (link) => happened.push(["append", link.download]),
    removeChild: () => happened.push(["remove"]),
  };
  return {
    happened,
    navigator: {
      canShare: ({ files }) => shareable(files[0]),
      share: async ({ files }) => {
        await share();
        happened.push(["share", files[0].name, files[0].type]);
      },
    },
    document: {
      body,
      createElement: () => ({
        click() {
          happened.push(["click", this.download]);
        },
      }),
    },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  };
};

test("a desktop downloads the file; a phone shares it, as text when JSON cannot be shared", async () => {
  const desktop = page();
  assert.equal(
    await saveBackup("{}", { ...desktop, mobile: false }),
    "downloaded"
  );
  assert.deepEqual(
    desktop.happened.map((step) => step[0]),
    ["append", "click", "remove"]
  );

  const iphone = page();
  assert.equal(await saveBackup("{}", { ...iphone, mobile: true }), "shared");
  assert.deepEqual(iphone.happened, [
    ["share", "battlechoc-recovery.json", "application/json"],
  ]);

  const android = page({ shareable: (file) => file.type === "text/plain" });
  assert.equal(await saveBackup("{}", { ...android, mobile: true }), "shared");
  assert.deepEqual(android.happened, [
    ["share", "battlechoc-recovery.txt", "text/plain"],
  ]);
});

test("a share refused (tap expired) falls back to a download; a cancelled share saves nothing", async () => {
  const refused = page({
    share: async () => {
      throw new DOMException("no tap", "NotAllowedError");
    },
  });
  assert.equal(
    await saveBackup("{}", { ...refused, mobile: true }),
    "downloaded"
  );
  const cancelled = page({
    share: async () => {
      throw new DOMException("closed", "AbortError");
    },
  });
  assert.equal(
    await saveBackup("{}", { ...cancelled, mobile: true }),
    "cancelled"
  );
  assert.deepEqual(cancelled.happened, []);
});

// an authenticator that records what it is asked, for the failure paths
const recording = ({ createResult, getError, createError } = {}) => {
  const calls = [];
  const signals = [];
  return {
    calls,
    signals,
    credentials: {
      create: async ({ publicKey }) => {
        calls.push(["create", publicKey]);
        if (createError) {
          throw createError;
        }
        return {
          rawId: new Uint8Array([1, 2, 3]).buffer,
          response: { getTransports: () => ["internal"] },
          getClientExtensionResults: () => createResult,
        };
      },
      get: async ({ publicKey }) => {
        calls.push(["get", publicKey]);
        if (getError) {
          throw getError;
        }
        return {
          rawId: new Uint8Array([1, 2, 3]).buffer,
          getClientExtensionResults: () => ({
            prf: { results: { first: new Uint8Array(32).buffer } },
          }),
        };
      },
    },
    signalUnknownCredential: async (options) => signals.push(options),
  };
};

const backupWith = (authenticator, extra = {}) =>
  createPasskeyBackup(ABANDON, {
    playerName: "Carolin",
    subject: "stake:abc",
    rpId: "battlechoc.com",
    credentials: authenticator.credentials,
    signalUnknownCredential: authenticator.signalUnknownCredential,
    ...extra,
  });

test("a passkey that says it has no PRF: no second prompt, the browser is told to forget it", async () => {
  const authenticator = recording({
    createResult: { prf: { enabled: false } },
  });
  await assert.rejects(backupWith(authenticator), PasskeyPrfError);
  assert.deepEqual(
    authenticator.calls.map((call) => call[0]),
    ["create"]
  );
  assert.deepEqual(authenticator.signals, [
    { rpId: "battlechoc.com", credentialId: "AQID" },
  ]);
});

test("cancelling the second prompt: PasskeyCancelledError, the new passkey is forgotten", async () => {
  const authenticator = recording({
    createResult: { prf: { enabled: true } },
    getError: new DOMException("cancelled", "NotAllowedError"),
  });
  await assert.rejects(backupWith(authenticator), PasskeyCancelledError);
  const [, get] = authenticator.calls;
  assert.deepEqual(get[1].allowCredentials[0].transports, ["internal"]);
  assert.equal(authenticator.signals.length, 1);
});

test("cancelling the first prompt, or a passkey this device has already: typed errors", async () => {
  await assert.rejects(
    backupWith(
      recording({
        createError: new DOMException("cancelled", "NotAllowedError"),
      })
    ),
    PasskeyCancelledError
  );
  await assert.rejects(
    backupWith(
      recording({
        createError: new DOMException("exists", "InvalidStateError"),
      }),
      {
        excludeCredentialIds: ["AQID"],
      }
    ),
    PasskeyExistsError
  );
  const authenticator = recording({
    createError: new DOMException("exists", "InvalidStateError"),
  });
  await assert.rejects(
    backupWith(authenticator, { excludeCredentialIds: ["AQID"] }),
    PasskeyExistsError
  );
  assert.deepEqual(authenticator.calls[0][1].excludeCredentials, [
    { type: "public-key", id: new Uint8Array([1, 2, 3]) },
  ]);
});

test("unlocking asks only for the given passkeys; a backup that does not open is unknown", async () => {
  const authenticator = recording({ createResult: { prf: { enabled: true } } });
  await assert.rejects(
    unlockWithPasskey(
      async () => ({ iv: "AAAAAAAAAAAAAAAA", data: "AAAAAAAAAAAAAAAAAAAAAA" }),
      {
        rpId: "battlechoc.com",
        credentials: authenticator.credentials,
        allowCredentialIds: ["AQID"],
      }
    ),
    PasskeyUnknownError
  );
  const [[, get]] = authenticator.calls;
  assert.deepEqual(get.allowCredentials, [
    { type: "public-key", id: new Uint8Array([1, 2, 3]) },
  ]);
});
