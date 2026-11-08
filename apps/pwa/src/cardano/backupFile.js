// The backup file of the recovery words: JSON the player keeps in Google Drive, iCloud Drive or
// anywhere, always protected by a password of their own (PBKDF2-SHA-256, AES-GCM). It works
// without the passkey, since both usually hang on the same Google or Apple account.
import { fromBase64Url, toBase64Url } from "./bytes.js";

const FORMAT = "battlechoc-recovery";
const VERSION = 1;
const ITERATIONS = 600000;
// a file may ask for more work, but not for absurd amounts (a crafted file would freeze the game)
const MAX_ITERATIONS = 5000000;
export const BACKUP_FILE_NAME = "battlechoc-recovery.json";
// Android's share sheet takes no JSON files: the same text as a .txt file opens just as well
const TEXT_FILE_NAME = "battlechoc-recovery.txt";
// bound into the encryption: the file's own words cannot be swapped into another format
const ASSOCIATED = new TextEncoder().encode(`${FORMAT} v${VERSION}`);

/** The file cannot be opened: `reason` is "not-a-backup" or "wrong-password". */
export class BackupFileError extends Error {
  constructor(reason) {
    super(`the backup file cannot be opened: ${reason}`);
    this.name = "BackupFileError";
    this.reason = reason;
  }
}

const keyFrom = async (password, salt, iterations) => {
  const material = await crypto.subtle.importKey(
    "raw",
    // the same password typed with another Unicode form (é as one or two code points) opens it
    new TextEncoder().encode(String(password).normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

/** The words in a backup file (JSON text) protected by `password`. */
export const encryptBackup = async (words, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ASSOCIATED },
    key,
    new TextEncoder().encode(words.join(" "))
  );
  return JSON.stringify(
    {
      format: FORMAT,
      version: VERSION,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: ITERATIONS,
        salt: toBase64Url(salt),
      },
      cipher: { name: "AES-GCM", iv: toBase64Url(iv) },
      data: toBase64Url(data),
    },
    null,
    2
  );
};

// the parts of a backup file, or null when the text is no backup of this version
const parseBackup = (text) => {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  const isObject = (value) => value !== null && typeof value === "object";
  const kdf = isObject(file) && isObject(file.kdf) ? file.kdf : {};
  const cipher = isObject(file) && isObject(file.cipher) ? file.cipher : {};
  const fitting =
    isObject(file) &&
    file.format === FORMAT &&
    file.version === VERSION &&
    kdf.name === "PBKDF2" &&
    kdf.hash === "SHA-256" &&
    Number.isInteger(kdf.iterations) &&
    kdf.iterations > 0 &&
    kdf.iterations <= MAX_ITERATIONS &&
    cipher.name === "AES-GCM" &&
    typeof kdf.salt === "string" &&
    typeof cipher.iv === "string" &&
    typeof file.data === "string";
  return fitting ? { kdf, cipher, data: file.data } : null;
};

/** Whether the text is a backup file this game can open (before asking for its password). */
export const isBackupFile = (text) => parseBackup(text) !== null;

/** The words of a backup file; BackupFileError when it is no backup or the password is wrong. */
export const decryptBackup = async (text, password) => {
  const file = parseBackup(text);
  if (!file) {
    throw new BackupFileError("not-a-backup");
  }
  const { kdf, cipher } = file;
  let salt;
  let iv;
  let data;
  try {
    salt = fromBase64Url(kdf.salt);
    iv = fromBase64Url(cipher.iv);
    data = fromBase64Url(file.data);
  } catch {
    throw new BackupFileError("not-a-backup");
  }
  let plain;
  try {
    const key = await keyFrom(password, salt, kdf.iterations);
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: ASSOCIATED },
      key,
      data
    );
  } catch {
    // AES-GCM cannot tell a wrong password from a changed file
    throw new BackupFileError("wrong-password");
  }
  const words = new TextDecoder().decode(plain).split(" ");
  if (words.length !== 24) {
    throw new BackupFileError("not-a-backup");
  }
  return words;
};

/**
 * Hands the file to the player. On a phone (`mobile`) the share sheet (Drive, iCloud Drive,
 * Files), as JSON or, where only text files can be shared (Android), as text; a desktop downloads
 * it, and so does a phone whose share sheet refuses (the tap was too long ago). Resolves with
 * "shared", "downloaded" or "cancelled" (the player closed the share sheet: nothing was saved).
 */
export const saveBackup = async (
  text,
  {
    mobile = false,
    navigator: nav = globalThis.navigator,
    document: doc = globalThis.document,
    URL: urls = globalThis.URL,
  } = {}
) => {
  if (mobile && nav && typeof nav.canShare === "function") {
    const file = [
      new File([text], BACKUP_FILE_NAME, { type: "application/json" }),
      new File([text], TEXT_FILE_NAME, { type: "text/plain" }),
    ].find((candidate) => nav.canShare({ files: [candidate] }));
    if (file) {
      try {
        await nav.share({ files: [file], title: BACKUP_FILE_NAME });
        return "shared";
      } catch (failure) {
        if (failure && failure.name === "AbortError") {
          return "cancelled";
        }
        // NotAllowedError (the tap expired) and others: the download below
      }
    }
  }
  const blob = new File([text], BACKUP_FILE_NAME, { type: "application/json" });
  const url = urls.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = BACKUP_FILE_NAME;
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  setTimeout(() => urls.revokeObjectURL(url), 1000);
  return "downloaded";
};
