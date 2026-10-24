// What the e2e tests drive the game with: `?testclock` (a manual match clock), the debug boards
// under /situation/ and window.__battlechoc (match host and engine). Only the dev server and builds
// made with VITE_TEST_HOOKS=true (the e2e build) have them; the published game has none.
export const testHooksEnabled =
  import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === "true";

/** Hands the running match to the tests as window.__battlechoc (test builds only). */
export const exposeForTests = (hooks) => {
  if (testHooksEnabled) {
    window.__battlechoc = hooks;
  }
};

/** ?env=, ?fill=, ?sun=, ?exposure= override the light of the 3D scenes (src/3d/look.js) to tune
 * it; read on load, before App resets the URL (test builds only). */
export const requestedLight = (() => {
  if (!testHooksEnabled || typeof location === "undefined") {
    return {};
  }
  const query = new URLSearchParams(location.search);
  return Object.fromEntries(
    ["env", "fill", "sun", "exposure"]
      .filter((key) => query.has(key))
      .map((key) => [key, Number(query.get(key))])
  );
})();
