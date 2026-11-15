import { signCodeKey } from "./mintSettings.js";

// This tab's sign codes (sessionStorage, by operation): the code of a prepared mint lets this tab
// sign it, and only this tab (another tab or device has its own storage and cannot). A code is
// kept the moment Mint now's answer arrives, also when the dialog that asked has stopped waiting
// for it or is closed; a dialog open on that operation hears of it (`onCode`). No React: node
// tests it (test/unit/signCodes.test.js).

const listeners = new Set();

const session = () => {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
};

/** This tab's sign code of operation `id`, or null. */
export const readCode = (id) => {
  const store = session();
  try {
    return (store && id && store.getItem(signCodeKey(id))) || null;
  } catch {
    return null;
  }
};

/** Keeps `code` as this tab's sign code of operation `id` and tells every listener. */
export const keepCode = (id, code) => {
  if (!id || typeof code !== "string" || code === "") {
    return;
  }
  const store = session();
  try {
    if (store) {
      store.setItem(signCodeKey(id), code);
    }
  } catch {
    // not kept: the dialogs that listen still hear of it
  }
  listeners.forEach((listener) => listener(id, code));
};

/** Drops this tab's sign code of operation `id`. */
export const dropCode = (id) => {
  const store = session();
  try {
    if (store && id) {
      store.removeItem(signCodeKey(id));
    }
  } catch {
    // nothing to drop
  }
};

/** Calls `listener(id, code)` for every code kept from now on; returns the unsubscribe. */
export const onCode = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
