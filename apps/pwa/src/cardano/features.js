// What of signing in with Cardano this build shows. Off without VITE_CARDANO_NETWORK. In the
// Android app (the TWA starts the site with ?app_runs_as=twa) saving progress works, but nothing
// visibly crypto shows until the Play Store's Financial features declaration is done.
import { cardano } from "@battlechoc/battlechoc-shared-functions";

/**
 * The switches for a network name, whether the game runs in the Android app (`androidApp`) and on
 * iOS (`ios`) — each a boolean or a function asked each time — and the device-only paths the
 * owner confirmed (`confirmed`: VITE_CARDANO_CONFIRMED, e.g. "passkey-ios,file-ios").
 */
export const createFeatures = ({
  network,
  androidApp = false,
  ios = false,
  android = false,
  confirmed = "",
}) => {
  const known = cardano.networkOf(network);
  const ask = (value) => (typeof value === "function" ? value() : value);
  const inAndroidApp = () => ask(androidApp);
  const confirmedPaths = new Set(
    String(confirmed || "")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean)
  );
  const isConfirmed = (path) => confirmedPaths.has(path);
  return {
    enabled: () => known !== null,
    network: () => known,
    inAndroidApp,
    isIos: () => ask(ios),
    confirmed: isConfirmed,
    showPreprodBadge: () =>
      known !== null && known.name !== "mainnet" && !inAndroidApp(),
    /** The wallet door (plan 3): not in the Android app until the Play Store's declaration. */
    showWalletDoor: () => known !== null && !inAndroidApp(),
    /**
     * The ways into the wallet door on this device: "extension" (a wallet is injected: an
     * extension, or a phone wallet's own browser), "qr" (CIP-45, not on phones, in the Android
     * app once `cip45-app` is confirmed), "deeplink" (CIP-158, phones once `cip158` is confirmed,
     * not inside a wallet's own browser).
     */
    walletPaths: ({ injected }) => {
      const paths = new Set();
      if (known === null || inAndroidApp()) {
        return paths;
      }
      const mobile = ask(ios) || ask(android);
      if (injected) {
        paths.add("extension");
      }
      if (!mobile && (!inAndroidApp() || isConfirmed("cip45-app"))) {
        paths.add("qr");
      }
      if (mobile && !injected && isConfirmed("cip158")) {
        paths.add("deeplink");
      }
      return paths;
    },
    /** A passkey backup: where the browser supports it (`support`, passkeySupport), on iOS once confirmed. */
    offerPasskey: async (support) =>
      known !== null &&
      (!ask(ios) || isConfirmed("passkey-ios")) &&
      (await support()),
    /** Saving the backup file: on iOS (the share sheet) once confirmed. */
    offerFileShare: () =>
      known !== null && (!ask(ios) || isConfirmed("file-ios")),
    /** A phone or tablet: the share sheet saves the backup file (a desktop downloads it). */
    isMobile: () => ask(ios) || ask(android),
  };
};
