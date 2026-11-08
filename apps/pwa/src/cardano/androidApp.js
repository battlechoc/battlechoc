// Whether the game runs in the Android app (TWA). The app starts the site with
// /index.html?app_runs_as=twa (apps/android/twa-manifest.json) and an android-app:// referrer;
// the game cleans the address up at boot (boot.js), so the start is remembered for the tab first.

const ANDROID_APP_KEY = "battlechoc.androidApp";

/** At launch: remembers in `storage` (sessionStorage) when the start was the Android app's. */
export const rememberAndroidApp = ({ search, referrer, storage }) => {
  const launched =
    new URLSearchParams(search).get("app_runs_as") === "twa" ||
    String(referrer || "").startsWith("android-app://");
  if (launched) {
    try {
      storage.setItem(ANDROID_APP_KEY, "1");
    } catch {
      // blocked storage: this page still knows it from the launch
    }
  }
  return launched;
};

/** Whether the tab was started by the Android app (false when storage is blocked). */
export const isAndroidApp = (storage) => {
  try {
    return storage.getItem(ANDROID_APP_KEY) === "1";
  } catch {
    return false;
  }
};
