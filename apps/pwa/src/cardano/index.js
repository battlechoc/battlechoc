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
import { isAndroidApp } from "./androidApp.js";
import { keysFromWords } from "./keys.js";

export const features = createFeatures({
  network: import.meta.env.VITE_CARDANO_NETWORK,
  // remembered at launch (boot.js), before the address is cleaned up
  androidApp: () => isAndroidApp(() => window.sessionStorage),
});

export const keyStore = createKeyStore(OfflineStore.playerStore);

/** Signs a challenge ("link" or "sign-in") with the words on the build's network. */
export const signChallenge = (words, purpose) => {
  if (!features.enabled()) {
    return Promise.reject(
      new Error("signing in with Cardano is off in this build")
    );
  }
  return signWith(words, purpose, {
    api: cardanoApi,
    network: features.network(),
  });
};

/** The identity subject ("stake:<key hash>") of the words, as the server lists it. */
export const subjectOfWords = async (words) =>
  `stake:${(await keysFromWords(words, features.network())).stakeKeyHashHex}`;

/**
 * "I already have an account": signs in with the words and makes this device that player. It runs
 * in the game's stats lock (Multiplayer.exclusive), so a merge or name sync that is still going
 * finishes first and none runs halfway through the switch. The words are kept on the device
 * (backed up: the player just typed them). The device's stats become the saved player's (from the
 * server, so nothing looks lost until the next merge) plus the matches that never reached the
 * server, which the next start sends to the signed-in account (Multiplayer.mergePlayerStats). The
 * caller reloads the game afterwards, also when a step after the sign-in failed.
 */
export const connectAccount = (words) =>
  multiplayer.exclusive(async () => {
    const session = await signChallenge(words, "sign-in");
    await account.adopt(session);
    // from here on this device is the saved player: nothing below may undo that
    try {
      await keyStore.clear();
      await keyStore.save(words);
      await keyStore.markBackedUp();
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
