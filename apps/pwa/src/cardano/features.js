// What of signing in with Cardano this build shows. Off without VITE_CARDANO_NETWORK. In the
// Android app (the TWA starts the site with ?app_runs_as=twa) saving progress works, but nothing
// visibly crypto shows until the Play Store's Financial features declaration is done.
import { cardano } from "@battlechoc/battlechoc-shared-functions";

/**
 * The switches for a network name and whether the game runs in the Android app (`androidApp`: a
 * boolean, or a function asked each time).
 */
export const createFeatures = ({ network, androidApp = false }) => {
  const known = cardano.networkOf(network);
  const inAndroidApp = () =>
    typeof androidApp === "function" ? androidApp() : androidApp;
  return {
    enabled: () => known !== null,
    network: () => known,
    inAndroidApp,
    showPreprodBadge: () =>
      known !== null && known.name !== "mainnet" && !inAndroidApp(),
    // the wallet door comes with plan 3 (CIP-30, CIP-45, CIP-158)
    showWalletDoor: () => false,
  };
};
