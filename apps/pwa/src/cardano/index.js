// Signing in with Cardano as the game uses it: the build's network (VITE_CARDANO_NETWORK), the
// key store on the device's player store, and signing challenges of the battlechoc API.
import OfflineStore from "../OfflineStore.js";
import { cardanoApi } from "../api/cardano.js";
import { createKeyStore } from "./keyStore.js";
import { createFeatures } from "./features.js";
import { signChallenge as signWith } from "./signIn.js";
import { isAndroidApp } from "./androidApp.js";

export const features = createFeatures({
  network: import.meta.env.VITE_CARDANO_NETWORK,
  // remembered at launch (boot.js), before the address is cleaned up
  androidApp: () => isAndroidApp(window.sessionStorage),
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

export { cardanoApi };
export { newRecoveryWords, normalizeWords, wordsAreValid } from "./keys.js";
export { KeyStoreError, KeyAlreadyStoredError } from "./keyStore.js";
export { NetworkMismatchError, UnexpectedChallengeError } from "./signIn.js";
