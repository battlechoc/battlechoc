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
  const showMintMarks = () => known !== null && !inAndroidApp();
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
     * The marks of minted items (plan C): the stamp, the notices on the title screen and what the
     * wallet row says about the wallets' items. Not in the Android app, where minted items stay
     * usable but nothing says they are minted. Minting itself (plan D) builds on this.
     */
    showMintMarks,
    /**
     * Minting (plan D): the Mint action, the flow and the sign page's links. Where the marks show
     * and the server has the chain features on (`serverEnabled`: GET /chain/status `enabled`,
     * see createChainEnabled).
     */
    showMinting: ({ serverEnabled } = {}) =>
      showMintMarks() && serverEnabled === true,
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

/**
 * Whether the server has the chain features on (`status()`: chainApi.status, GET /chain/status
 * `{ enabled }`, which the server answers without asking the chain), asked once per session.
 * Nothing is asked while `features.showMintMarks()` is off (no network, the Android app) or
 * `online()` is false.
 * - `ask()` resolves with it: the first call sends the request, every later one answers what it
 *   answered (also while it is out). Only a definite answer is remembered: the route's own answer,
 *   or a 404 (an API without the route: off). Any other failure (no answer, a timeout, a 5xx or a
 *   429 during a deploy) counts as off for now and leaves it unknown, so the next ask (the next
 *   Choclab) sends one request again; a caller asks once per mount, never in a loop.
 * - `retry()` asks again, meant for when the device is back online: at most one request per
 *   call, none while one is out (it answers that one) and none once the answer was on.
 * - `serverEnabled()` is the known value (false before), `subscribe(listener)` tells when it
 *   changes (returns the unsubscribe).
 */
export const createChainEnabled = ({ status, features, online }) => {
  let known;
  let asking;
  const listeners = new Set();
  const settle = (value) => {
    if (value !== known) {
      known = value;
      listeners.forEach((listener) => listener());
    }
    return value;
  };
  const allowed = () => features.showMintMarks() && online();
  // a failure that answers the question: the API has no such route (an older server: 404)
  const definite = (failure) =>
    Boolean(failure) && typeof failure === "object" && failure.status === 404;
  // one request (sent at once, so a caller sees it out), its answer remembered
  const request = () => {
    let call;
    try {
      call = Promise.resolve(status());
    } catch (failure) {
      call = Promise.reject(failure);
    }
    asking = call
      .then(
        (answer) => settle(Boolean(answer) && answer.enabled === true),
        (failure) => (definite(failure) ? settle(false) : false)
      )
      .finally(() => {
        asking = undefined;
      });
    return asking;
  };
  return {
    serverEnabled: () => known === true,
    ask: () => {
      if (!features.showMintMarks()) {
        return Promise.resolve(false);
      }
      if (typeof asking !== "undefined") {
        return asking;
      }
      if (typeof known !== "undefined") {
        return Promise.resolve(known);
      }
      return online() ? request() : Promise.resolve(false);
    },
    retry: () => {
      if (!allowed()) {
        return Promise.resolve(known === true);
      }
      if (typeof asking !== "undefined") {
        return asking;
      }
      return known === true ? Promise.resolve(true) : request();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
