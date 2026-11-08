// Keeps the recovery words on the device: in the IndexedDB store it is given (the game's player
// store), encrypted with AES-GCM under a WebCrypto key that cannot be exported. That keeps the
// words out of what a page or devtools can dump as data (the key cannot be exported or shown);
// it does not protect them from a script running in the page, which can still have them
// decrypted, nor from a copy of the browser's profile folder, which holds the key's bytes too.

const RECORD_KEY = "cardanoKey";
// set once the player showed they wrote the words down (the check in RecoveryWords.jsx)
const BACKED_UP_KEY = "cardanoKeyBackedUp";

/** The device refused to keep the key (private mode, blocked or full storage). */
export class KeyStoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "KeyStoreError";
    this.cause = cause;
  }
}

/** A key is stored already (another tab or a second tap was first): use that one. */
export class KeyAlreadyStoredError extends KeyStoreError {
  constructor() {
    super("a key is stored already");
    this.name = "KeyAlreadyStoredError";
  }
}

const sameWords = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  a.every((word, i) => word === b[i]);

/**
 * A key store on `store` ({ get, set, add, delete }, like OfflineStore.playerStore; `add` refuses
 * a key that exists, atomically, also across tabs): { save(words), load(), has(), clear(),
 * backedUp(), markBackedUp() }.
 */
export const createKeyStore = (store, subtle = globalThis.crypto.subtle) => {
  const has = async () => typeof (await store.get(RECORD_KEY)) !== "undefined";

  const load = async () => {
    const record = await store.get(RECORD_KEY);
    if (typeof record === "undefined") {
      return null;
    }
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      record.key,
      record.data
    );
    return new TextDecoder().decode(plain).split(" ");
  };

  const save = async (words) => {
    let record;
    try {
      if (await has()) {
        throw new KeyAlreadyStoredError();
      }
      const key = await subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const data = await subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(words.join(" "))
      );
      record = { key, iv, data: new Uint8Array(data) };
    } catch (error) {
      throw error instanceof KeyStoreError
        ? error
        : new KeyStoreError("the device did not keep the key", error);
    }
    try {
      await store.add(RECORD_KEY, record);
    } catch (error) {
      if (error && error.name === "ConstraintError") {
        throw new KeyAlreadyStoredError();
      }
      throw new KeyStoreError("the device did not keep the key", error);
    }
    // read back: a store that "kept" a key it cannot give back counts as refusing, and the
    // broken record goes again, so the next try can store the key
    if (!sameWords(await load().catch(() => null), words)) {
      await store.delete(RECORD_KEY).catch(() => {});
      throw new KeyStoreError("the device did not keep the key");
    }
  };

  // the mark goes with the key: a new key is never taken for backed up
  const clear = async () => {
    await store.delete(BACKED_UP_KEY);
    await store.delete(RECORD_KEY);
  };

  const backedUp = async () =>
    (await has()) && (await store.get(BACKED_UP_KEY)) === true;

  const markBackedUp = () => store.set(BACKED_UP_KEY, true);

  return { save, load, has, clear, backedUp, markBackedUp };
};
