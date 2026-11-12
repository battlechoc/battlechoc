// What the profile and the "Account safety" dialog show for the player's keys (spec
// docs/superpowers/specs/2026-11-12-account-safety-design.md): plain data, no React, so the
// rules have unit tests (test/unit/safetyState.test.js).

// the server keeps at most this many passkeys per player (apps/api/src/cardano.js)
export const MAX_PASSKEYS = 10;

/** A stake address short enough for a phone: its start and its end. */
export const shortAddress = (address) =>
  address.length > 24
    ? `${address.slice(0, 14)}…${address.slice(-8)}`
    : address;

/**
 * The state of the player's account safety.
 *
 * - `identities`: the linked keys ({ subject, address }) from the server
 * - `local`: the words on this device, the key they make (`subject`) and their backup marks
 *   (`methods`: "words", "file")
 * - `passkeys`: the player's passkey backups (null when they could not be read)
 * - `canPasskey`: this device can make a passkey (features.offerPasskey)
 * - `walletDoor`: the build shows the wallet door here (features.showWalletDoor)
 * - `details`: technical details may show here (not in the Android app)
 *
 * `profile` is "unsaved" (no key), "unfinished" (the own words are kept nowhere yet) or "saved".
 * The rows are null where they do not apply.
 */
export const accountSafety = ({
  identities,
  local,
  passkeys,
  canPasskey = false,
  walletDoor = false,
  details = false,
}) => {
  const saved = identities.length > 0;
  // the words on this device are this account's (not those of an account the device had before)
  const ownWords =
    local.words !== null &&
    local.subject !== null &&
    identities.some((identity) => identity.subject === local.subject);
  const ownPasskeys = (passkeys || []).filter(
    (passkey) => passkey.subject === local.subject
  );
  const wordsKept = local.methods.includes("words");
  const fileKept = local.methods.includes("file");

  let profile = "saved";
  if (!saved) {
    profile = "unsaved";
  } else if (ownWords && !wordsKept && !fileKept && ownPasskeys.length === 0) {
    profile = "unfinished";
  }

  // Every key that is not this device's own words counts as a wallet. Known limit: a device
  // without its own words cannot tell another device's words key from a wallet's key, so it
  // calls all of them wallets.
  const keys = identities.map((identity) => ({
    ...identity,
    kind: ownWords && identity.subject === local.subject ? "words" : "wallet",
  }));
  const wallets = keys.filter((key) => key.kind === "wallet");

  const words = ownWords ? { backedUp: wordsKept || fileKept } : null;

  let passkey = null;
  if (ownWords && canPasskey && passkeys !== null) {
    let action = null;
    if (passkeys.length < MAX_PASSKEYS) {
      action = ownPasskeys.length > 0 ? "add" : "setup";
    }
    passkey = { count: ownPasskeys.length, action };
  }

  let wallet = null;
  if (walletDoor) {
    // the one wallet can go while another key stays; with two or more, removing one is in the
    // technical details, and the row offers another
    const disconnect = wallets.length === 1 && identities.length > 1;
    wallet = {
      count: wallets.length,
      action: disconnect ? "disconnect" : "connect",
      subject: disconnect ? wallets[0].subject : null,
    };
  }

  return {
    profile,
    ownWords,
    ownPasskeys,
    wordsKept,
    fileKept,
    words,
    passkey,
    wallet,
    // the last key never goes: Remove shows only while there is more than one
    keys: details
      ? keys.map((key) => ({ ...key, removable: identities.length > 1 }))
      : null,
  };
};

/** A Cardano network's name as players read it ("preprod" → "Preprod"). */
export const networkLabel = (name) =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
