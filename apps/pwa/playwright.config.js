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
    // the tests do not cover the service worker, it only makes page loads less deterministic
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
      testIgnore: /iphone\.spec\.js/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
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
      // --open false: vite preview inherits server.open and would open a tab in the default browser
      command: `vite preview --outDir build-e2e --host 127.0.0.1 --port ${port} --strictPort --open false`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      // the dev server too: it serves the linked shared package differently than the build
      // its own dependency cache, apart from a dev server the developer may be running (vite.config.js)
      command: `vite --host 127.0.0.1 --port ${devPort} --strictPort --open false`,
      env: { VITE_CACHE_DIR: "node_modules/.vite-e2e" },
      url: `http://127.0.0.1:${devPort}`,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "node ../api/src/server.js",
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
      },
    },
  ],
});
