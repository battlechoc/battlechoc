import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT || 3000);
// the local API for the online tests (in-memory database, short live timings)
const apiPort = Number(process.env.API_PORT || 8091);
const devPort = Number(process.env.DEV_PORT || 3001);

// The tests run against the e2e build (`npm run build:e2e`, the production build with the test
// hooks of src/testHooks.js, in build-e2e/; `npm test` builds it first), served by vite preview.
// They never leave the machine: every host except 127.0.0.1/localhost resolves to nothing, so
// the app runs as it does offline (no account, no API). The online tests point the app at the
// local API below through localStorage "battlechoc.apiUrl".
export default defineConfig({
  testDir: "./test",
  // Only the specs: test/unit/*.test.js belong to node's test runner (npm run test:unit). By
  // default Playwright loads them too, and node:test then runs them inside Playwright's own
  // process while it collects, all files at once: one file's mocked timers held another's real
  // timeout, and the suite never started.
  testMatch: "**/*.spec.js",
  outputDir: "./test/results",
  // WebGL runs in software, so parallel workers mostly fight over the CPU
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-US",
    // only the service-worker project runs the worker; everywhere else it would make page loads
    // less deterministic
    serviceWorkers: "block",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        // chrome no longer falls back to software webgl on its own
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
      ],
    },
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /(iphone|service-worker)\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      // the service worker for real (installing, offline, a new build); the spec serves the e2e
      // build itself, with the cache headers of GitHub Pages
      name: "service-worker",
      testMatch: /service-worker\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        serviceWorkers: "allow",
      },
    },
    {
      name: "iphone",
      testMatch: /iphone\.spec\.js/,
      // the iPhone viewport and user agent, rendered by chromium (WebGL via swiftshader)
      use: { ...devices["iPhone 6 landscape"], browserName: "chromium" },
    },
  ],
  webServer: [
    {
      // vite preview inherits server.open: BROWSER=none keeps it from opening a tab in the
      // default browser (`--open false` does not: vite takes "false" as a path and opens /false)
      command: `vite preview --outDir build-e2e --host 127.0.0.1 --port ${port} --strictPort`,
      env: { BROWSER: "none" },
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      // the dev server too: it serves the linked shared package differently than the build
      // its own dependency cache, apart from a dev server the developer may be running (vite.config.js)
      command: `vite --host 127.0.0.1 --port ${devPort} --strictPort`,
      env: { VITE_CACHE_DIR: "node_modules/.vite-e2e", BROWSER: "none" },
      url: `http://127.0.0.1:${devPort}`,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "node ../api/test/e2eServer.js",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: true,
      timeout: 30000,
      env: {
        PORT: String(apiPort),
        DATABASE_URL: "memory",
        JWT_SECRET: "e2e-only-secret-e2e-only-secret-e2e",
        CORS_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`,
        // long enough for the "opponent left" warning to be seen: on CI the software-rendered
        // page blocks for seconds at a time, and a reload must fit in it too
        LIVE_DISCONNECT_GRACE_MS: "20000",
        LIVE_AI_FALLBACK_MS: "3000",
        // signing in with a Cardano key (test/signin.spec.js); the build has VITE_CARDANO_NETWORK
        CARDANO_NETWORK: "preprod",
        // test/signin.spec.js creates many devices from one address in a minute
        ACCOUNTS_PER_MINUTE: "500",
        CARDANO_PER_MINUTE: "1000",
      },
    },
  ],
});
