import logger from "./helper/logger.js";

// "Reset battlechoc" (Settings, dialogs/ResetDialog.jsx): the device forgets the player, as if
// the game were newly installed. Plain functions with their dependencies passed in, so the rules
// have unit tests (test/unit/reset.test.js).

// web storage that is no player data and stays: a developer's API address (src/api/apiUrl.js,
// also how the e2e tests reach their API) and the Android app's launch mark
// (src/cardano/androidApp.js: the app hides the wallet door, also after a reset)
export const KEEP_LOCAL = ["battlechoc.apiUrl"];
export const KEEP_SESSION = ["battlechoc.androidApp"];

// how long the server gets to end the session before the reset goes on without it
const END_SESSION_MS = 3000;

/**
 * What the dialog says about the account: "saved" (a backup opens it again), "unsaved" (it is
 * lost with the reset; "unfinished" too, its words are kept nowhere), "unknown" (the server could
 * not be asked) or "noBackup" (this build cannot save an account). `profile` is
 * accountSafety(...).profile (ui/account/safetyState.js), null when it could not be read.
 */
export const resetWarning = ({ canSave, online, profile }) => {
  if (!canSave) {
    return "noBackup";
  }
  if (!online || !profile) {
    return "unknown";
  }
  return profile === "saved" ? "saved" : "unsaved";
};

// removes every key of a Storage except `keep`; blocked storage (all site data blocked) throws
// already when it is asked for, so `storage` is a getter
const emptyStorage = (storage, keep) => {
  try {
    const store = storage();
    const keys = [];
    for (let i = 0; i < store.length; i++) {
      keys.push(store.key(i));
    }
    keys
      .filter((key) => key !== null && !keep.includes(key))
      .forEach((key) => store.removeItem(key));
  } catch (error) {
    logger.warn("could not empty the web storage", String(error));
  }
};

/**
 * The reset itself; the caller then loads the game anew.
 *
 * - `endSession()`: the server ends this device's session (POST /accounts/logout); a server that
 *   fails or does not answer within `timeoutMs` does not stop the reset
 * - `erase()`: empties the game's database and lets no write through afterwards
 *   (OfflineStore.eraseAll)
 * - `local()`, `session()`: window.localStorage and window.sessionStorage
 */
export const resetDevice = async ({
  erase,
  endSession,
  local,
  session,
  timeoutMs = END_SESSION_MS,
}) => {
  let timer;
  try {
    await Promise.race([
      endSession(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch (error) {
    logger.warn("could not end the session on the server", String(error));
  } finally {
    clearTimeout(timer);
  }
  await erase();
  emptyStorage(local, KEEP_LOCAL);
  emptyStorage(session, KEEP_SESSION);
};
