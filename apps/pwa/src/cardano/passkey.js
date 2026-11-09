// The passkey backup of the recovery words: a passkey (WebAuthn) with the PRF extension gives a
// secret only it can give, for one fixed salt; through HKDF that is the AES-GCM key of the words.
// The server keeps the encrypted words per passkey and cannot read them. Unlocking needs the
// passkey and the player's fingerprint, face or PIN (user verification).
import { fromBase64Url, toBase64Url } from "./bytes.js";

const SALT_TEXT = "battlechoc recovery words v1";

/** The passkey gave no PRF secret (the authenticator cannot, or not in this flow). */
export class PasskeyPrfError extends Error {
  constructor() {
    super("the passkey gave no PRF secret");
    this.name = "PasskeyPrfError";
  }
}

/** The passkey guards no backup of words (removed, or a passkey of something else). */
export class PasskeyUnknownError extends Error {
  constructor() {
    super("the passkey guards no backup of recovery words");
    this.name = "PasskeyUnknownError";
  }
}

/** The player closed the passkey prompt (or it timed out): nothing to say, nothing happened. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super("the passkey prompt was closed");
    this.name = "PasskeyCancelledError";
  }
}

/** This device keeps a passkey for these words already (excludeCredentials). */
export class PasskeyExistsError extends Error {
  constructor() {
    super("this device has a passkey for the words already");
    this.name = "PasskeyExistsError";
  }
}

// the browser's errors as ours: a closed prompt, a passkey that exists
const typed = (failure) => {
  if (
    failure &&
    (failure.name === "NotAllowedError" || failure.name === "AbortError")
  ) {
    return new PasskeyCancelledError();
  }
  if (failure && failure.name === "InvalidStateError") {
    return new PasskeyExistsError();
  }
  return failure;
};

// bound into the encryption: the words of this kind of backup only
const ASSOCIATED = new TextEncoder().encode(SALT_TEXT);

const prfSalt = async () =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT_TEXT))
  );

const prfResults = (credential) => {
  const results = credential.getClientExtensionResults();
  return (results && results.prf) || {};
};

const prfOutput = (credential) => {
  const prf = prfResults(credential);
  return prf.results ? prf.results.first : undefined;
};

const asCredentials = (ids = []) =>
  ids.map((id) => ({ type: "public-key", id: fromBase64Url(id) }));

const aesKeyFrom = async (secret) => {
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("battlechoc recovery words"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

const random = (size) => crypto.getRandomValues(new Uint8Array(size));

/**
 * Whether this browser can make passkeys with PRF: its own answer when it gives one
 * (getClientCapabilities), else whether a platform authenticator with user verification exists.
 */
export const passkeySupport = async (win = globalThis) => {
  const credential = win.PublicKeyCredential;
  if (!credential) {
    return false;
  }
  try {
    if (typeof credential.getClientCapabilities === "function") {
      const capabilities = await credential.getClientCapabilities();
      if (capabilities && "extension:prf" in capabilities) {
        return capabilities["extension:prf"] === true;
      }
    }
    if (
      typeof credential.isUserVerifyingPlatformAuthenticatorAvailable ===
      "function"
    ) {
      return await credential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    return false;
  }
  return false;
};

const defaults = () => ({
  rpId: globalThis.location ? globalThis.location.hostname : undefined,
  credentials: globalThis.navigator
    ? globalThis.navigator.credentials
    : undefined,
  // asks the password manager to drop a passkey that guards nothing (Chrome 132+, Safari 26)
  signalUnknownCredential: (options) =>
    globalThis.PublicKeyCredential &&
    typeof globalThis.PublicKeyCredential.signalUnknownCredential === "function"
      ? globalThis.PublicKeyCredential.signalUnknownCredential(options)
      : undefined,
});

const settings = (given) => {
  const options = { ...defaults() };
  Object.entries(given).forEach(([name, value]) => {
    if (typeof value !== "undefined") {
      options[name] = value;
    }
  });
  return options;
};

/**
 * Makes a passkey and encrypts the words with its PRF secret: { credentialId, subject, iv, data }
 * for POST /user/passkeys. PasskeyPrfError when the passkey gives no PRF secret (it is then
 * forgotten again), PasskeyCancelledError when the player closes a prompt, PasskeyExistsError
 * when one of `excludeCredentialIds` (the player's passkeys) is on this device already.
 */
export const createPasskeyBackup = async (
  words,
  {
    playerName,
    subject,
    rpId,
    credentials,
    signalUnknownCredential,
    excludeCredentialIds = [],
  } = {}
) => {
  const options = settings({ rpId, credentials, signalUnknownCredential });
  const salt = await prfSalt();
  const name = playerName || "battlechoc";
  let created;
  try {
    created = await options.credentials.create({
      publicKey: {
        rp: { id: options.rpId, name: "battlechoc" },
        user: { id: random(16), name, displayName: name },
        challenge: random(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        excludeCredentials: asCredentials(excludeCredentialIds),
        hints: ["client-device"],
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (failure) {
    throw typed(failure);
  }
  const credentialId = toBase64Url(created.rawId);
  // a passkey that cannot guard the words is told to the password manager to forget
  const forget = () =>
    Promise.resolve(
      options.signalUnknownCredential &&
        options.signalUnknownCredential({ rpId: options.rpId, credentialId })
    ).catch(() => {});
  let secret = prfOutput(created);
  if (!secret && prfResults(created).enabled === false) {
    await forget();
    throw new PasskeyPrfError();
  }
  if (!secret) {
    // many authenticators give the PRF secret only when the passkey is used
    const transports =
      created.response && typeof created.response.getTransports === "function"
        ? created.response.getTransports()
        : undefined;
    try {
      const used = await options.credentials.get({
        publicKey: {
          challenge: random(32),
          rpId: options.rpId,
          allowCredentials: [
            {
              type: "public-key",
              id: created.rawId,
              ...(transports ? { transports } : {}),
            },
          ],
          userVerification: "required",
          extensions: { prf: { eval: { first: salt } } },
        },
      });
      secret = prfOutput(used);
    } catch (failure) {
      await forget();
      throw typed(failure);
    }
  }
  if (!secret) {
    await forget();
    throw new PasskeyPrfError();
  }
  const iv = random(12);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ASSOCIATED },
    await aesKeyFrom(secret),
    new TextEncoder().encode(words.join(" "))
  );
  return {
    credentialId,
    subject,
    iv: toBase64Url(iv),
    data: toBase64Url(data),
  };
};

/**
 * Asks for one of the player's passkeys (`allowCredentialIds`: only these; else the browser
 * offers all of battlechoc's) and opens the words it guards: `fetchBackup(credentialId)` gives
 * { iv, data } (GET /auth/cardano/passkeys/:id). PasskeyPrfError without a PRF secret,
 * PasskeyCancelledError when the prompt is closed, PasskeyUnknownError when the passkey guards
 * no backup that opens.
 */
export const unlockWithPasskey = async (
  fetchBackup,
  { rpId, credentials, allowCredentialIds } = {}
) => {
  const options = settings({ rpId, credentials });
  let used;
  try {
    used = await options.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: options.rpId,
        ...(allowCredentialIds
          ? { allowCredentials: asCredentials(allowCredentialIds) }
          : {}),
        userVerification: "required",
        extensions: { prf: { eval: { first: await prfSalt() } } },
      },
    });
  } catch (failure) {
    throw typed(failure);
  }
  const secret = prfOutput(used);
  if (!secret) {
    throw new PasskeyPrfError();
  }
  const backup = await fetchBackup(toBase64Url(used.rawId));
  if (!backup) {
    throw new PasskeyUnknownError();
  }
  let words;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(backup.iv),
        additionalData: ASSOCIATED,
      },
      await aesKeyFrom(secret),
      fromBase64Url(backup.data)
    );
    words = new TextDecoder().decode(plain).split(" ");
  } catch {
    throw new PasskeyUnknownError();
  }
  if (words.length !== 24) {
    throw new PasskeyUnknownError();
  }
  return words;
};
