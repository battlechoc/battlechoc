const path = require("path");

process.env.JEST_PUPPETEER_CONFIG ??= path.join(
  __dirname,
  "jest-puppeteer.config.cjs"
);

module.exports = {
  rootDir: "..",
  preset: "jest-puppeteer",
  testMatch: ["<rootDir>/test/**/*.test.cjs"],
  transform: {},
};
