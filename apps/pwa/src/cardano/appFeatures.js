// What of Cardano this build shows on this device (features.js): the build's network
// (VITE_CARDANO_NETWORK), the confirmed device paths, iOS or Android, and the Android app. Small
// on purpose: the title screen and the item icons ask it, so it must not bring the key store,
// the passkeys and the wallets into their chunks (those stay in index.js).
import { createFeatures } from "./features.js";
import { isAndroidApp } from "./androidApp.js";

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
