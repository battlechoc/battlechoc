const path = require("path");

process.env.JEST_PUPPETEER_CONFIG ??= path.join(
  __dirname,
  "jest-puppeteer.config.cjs"
);

module.exports = {
  rootDir: "..",
  preset: "jest-puppeteer",
  testMatch: ["<rootDir>/test/**/*.test.cjs"],
  // the suites share one browser and origin, and WebGL runs in software: run them one after
  // the other so they neither race for IndexedDB nor for the CPU
  maxWorkers: 1,
  transform: {},
};
