// Signing in with Cardano as the game uses it: the build's network (VITE_CARDANO_NETWORK), the
// key store on the device's player store, and signing challenges of the battlechoc API.
import { EmptyPlayerStats } from "@battlechoc/battlechoc-shared-functions";
import OfflineStore from "../OfflineStore.js";
import { account } from "../api/account.js";
import { fetchOwnProfile } from "../api/profile.js";
import { multiplayer } from "../Multiplayer.js";
import logger from "../helper/logger.js";
import { cardanoApi } from "../api/cardano.js";
import { createKeyStore } from "./keyStore.js";
import { createFeatures } from "./features.js";
import { signChallenge as signWith } from "./signIn.js";
import {
  confirmWithWords as confirmWords,
  confirmWithPasskey as confirmPasskey,
} from "./confirm.js";
import { unlockWithPasskey } from "./passkey.js";
import { isAndroidApp } from "./androidApp.js";
import { keysFromWords } from "./keys.js";

// an Android phone or tablet
const onAndroid = () => {
  try {
    return /Android/.test(navigator.userAgent || "");
  } catch {
    return false;
  }
};

// iPhone, iPad, and an iPad that says it is a Mac (it has touch points)
const onIos = () => {
  try {
    const agent = navigator.userAgent || "";
    return (
      /iPhone|iPad|iPod/.test(agent) ||
      (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
};

export const features = createFeatures({
  network: import.meta.env.VITE_CARDANO_NETWORK,
  ios: onIos,
  android: onAndroid,
  confirmed: import.meta.env.VITE_CARDANO_CONFIRMED,
  // remembered at launch (boot.js), before the address is cleaned up
  androidApp: () => isAndroidApp(() => window.sessionStorage),
});

export const keyStore = createKeyStore(OfflineStore.playerStore);

/** Signs a challenge ("link" or "sign-in") with the words on the build's network. */
const deps = () => {
  if (!features.enabled()) {
    throw new Error("signing in with Cardano is off in this build");
  }
  return { api: cardanoApi, network: features.network() };
};

/**
 * Signs a challenge ("link", "sign-in", "confirm") with the words on the build's network;
 * `confirmToken` goes with a further link (a key change).
 */
export const signChallenge = async (words, purpose, { confirmToken } = {}) =>
  signWith(words, purpose, { ...deps(), confirmToken });

/** A confirm token for a key change, signed with the words. */
export const confirmWithWords = async (words) => confirmWords(words, deps());

/** A confirm token for a key change, from the passkey (`credentialIds`: the player's passkeys). */
export const confirmWithPasskey = async (credentialIds) =>
  confirmPasskey({ ...deps(), allowCredentialIds: credentialIds });

/** Tells the password manager to drop a passkey that guards nothing (Chrome 132+, Safari 26). */
export const forgetPasskey = async (credentialId) => {
  try {
    if (
      typeof PublicKeyCredential !== "undefined" &&
      typeof PublicKeyCredential.signalUnknownCredential === "function"
    ) {
      await PublicKeyCredential.signalUnknownCredential({
        rpId: location.hostname,
        credentialId,
      });
    }
  } catch {
    // nothing to do: it stays in the password manager
  }
};

/** The words the player's passkey guards (`credentialIds`: the player's passkeys). */
export const wordsFromPasskey = (credentialIds) =>
  unlockWithPasskey((id) => cardanoApi.passkeyBackup(id), {
    allowCredentialIds: credentialIds,
  });

/** The identity subject ("stake:<key hash>") of the words, as the server lists it. */
export const subjectOfWords = async (words) =>
  `stake:${(await keysFromWords(words, features.network())).stakeKeyHashHex}`;

/**
 * "I already have an account": signs in with the words and makes this device that player. It runs
 * in the game's stats lock (Multiplayer.exclusive), so a merge or name sync that is still going
 * finishes first and none runs halfway through the switch. The words are kept on the device,
 * backed up the way they came (`source`): "words" typed in, "file" a backup file, "passkey" a
 * passkey (the server knows that backup, nothing is marked here). The device's stats become the saved player's (from the
 * server, so nothing looks lost until the next merge) plus the matches that never reached the
 * server, which the next start sends to the signed-in account (Multiplayer.mergePlayerStats). The
 * caller reloads the game afterwards, also when a step after the sign-in failed.
 */
export const connectAccount = (words, { source = "words" } = {}) =>
  multiplayer.exclusive(async () => {
    const session = await signChallenge(words, "sign-in");
    await account.adopt(session);
    // from here on this device is the saved player: nothing below may undo that
    try {
      await keyStore.clear();
      await keyStore.save(words);
      if (source === "words" || source === "file") {
        await keyStore.markBackedUp(source);
      }
    } catch (failure) {
      logger.warn("could not keep the words on this device", failure);
    }
    try {
      const stats = await OfflineStore.playerStore
        .get("stats")
        .catch(() => undefined);
      const unsynced = (stats && stats.trackRecord) || [];
      const saved = await fetchOwnProfile()
        .then((answer) => answer.stats)
        .catch(() => undefined);
      await OfflineStore.playerStore.set("stats", {
        ...(saved || EmptyPlayerStats),
        trackRecord: unsynced,
      });
    } catch (failure) {
      logger.warn("could not prepare the stats of the saved player", failure);
    }
  });

export { cardanoApi };
export { newRecoveryWords, normalizeWords, wordsAreValid } from "./keys.js";
export { KeyStoreError, KeyAlreadyStoredError } from "./keyStore.js";
export { NetworkMismatchError, UnexpectedChallengeError } from "./signIn.js";
export {
  createPasskeyBackup,
  passkeySupport,
  PasskeyPrfError,
  PasskeyCancelledError,
  PasskeyExistsError,
  PasskeyUnknownError,
} from "./passkey.js";
export {
  encryptBackup,
  decryptBackup,
  saveBackup,
  isBackupFile,
  BackupFileError,
} from "./backupFile.js";
