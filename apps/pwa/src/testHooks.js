// What the e2e tests drive the game with: `?testclock` (a manual match clock), the debug boards
// under /situation/ and window.__battlechoc (match host and engine). Only the dev server and builds
// made with VITE_TEST_HOOKS=true (the e2e build) have them; the published game has none.
export const testHooksEnabled =
  import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === "true";

/** The 3D scene component as window.__battlechocScene, for visual checks that move its cameras
 * (test builds only). */
export const exposeSceneForTests = (scene) => {
  if (testHooksEnabled) {
    window.__battlechocScene = scene;
  }
};

/** Hands the running match to the tests as window.__battlechoc (test builds only). */
export const exposeForTests = (hooks) => {
  if (testHooksEnabled) {
    window.__battlechoc = hooks;
  }
};

/** ?env=, ?fill=, ?sun=, ?exposure=, ?saturation=, ?tonemap= override the light of the 3D scenes
 * (src/3d/look.js) to tune it; read on load, before App resets the URL (test builds only). */
export const requestedLight = (() => {
  if (!testHooksEnabled || typeof location === "undefined") {
    return {};
  }
  const query = new URLSearchParams(location.search);
  const light = Object.fromEntries(
    ["env", "fill", "sun", "exposure", "saturation"]
      .filter((key) => query.has(key))
      .map((key) => [key, Number(query.get(key))])
  );
  return query.has("tonemap")
    ? { ...light, tonemap: query.get("tonemap") }
    : light;
})();

/**
 * Opens a deep link (CIP-158: the phone hands it to a wallet app, the game stays). When a test
 * sets window.__battlechocRecordDeepLinks, a test build keeps the links in
 * window.__battlechocDeepLinks instead: a headless browser would show an error page for it.
 */
export const openDeepLink = (url) => {
  if (testHooksEnabled && window.__battlechocRecordDeepLinks) {
    window.__battlechocDeepLinks = [
      ...(window.__battlechocDeepLinks || []),
      url,
    ];
    return;
  }
  window.location.href = url;
};
