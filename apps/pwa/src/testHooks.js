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
