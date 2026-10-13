import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT || 3000);

// The tests run against the production build (`npm run build` first), served by vite preview.
// They never leave the machine: every host except the preview server resolves to nothing, so
// the app runs as it does offline (no account, no API).
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
  webServer: {
    command: `vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
