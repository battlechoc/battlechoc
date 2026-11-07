// ESLint for the whole repository: npm run lint.
//
// Correctness only: names that do not exist, code that is never used, the rules of hooks. There
// are no style rules; indentation and quotes differ per package (.editorconfig) and stay as
// they are. Each block below gives one kind of file its module system and its globals.
//
// ESLint 10 follows JSX itself (<Component /> uses Component), so there is no
// eslint-plugin-react: its last release (7.37.5) does not install next to ESLint 10.
const js = require("@eslint/js");
const globals = require("globals");
const reactHooks = require("eslint-plugin-react-hooks");

// CommonJS on Node: require, module, __dirname and the Node globals
const nodeCommonJs = { sourceType: "commonjs", globals: globals.node };

module.exports = [
  {
    name: "battlechoc/ignores",
    ignores: [
      // build output and reports
      "**/build/",
      "**/build-e2e/",
      "**/dist/",
      "**/coverage/",
      "apps/pwa/test/results/",
      "apps/pwa/test/results-local/",
      "apps/pwa/test/output/",
      "apps/pwa/playwright-report/",
      // art sources with their one-off scripts, and files served as they are
      "apps/pwa/dev/",
      "apps/pwa/public/",
      // local Claude Code files: its worktrees are whole copies of the repository
      ".claude/",
    ],
  },

  js.configs.recommended,
  {
    name: "battlechoc/unused",
    rules: {
      // a leading underscore marks what is unused on purpose; `const { a, ...rest } = x` may
      // name `a` only to keep it out of `rest`
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // The game client: ES modules and JSX in the browser. Vite compiles JSX with the automatic
  // runtime (@vitejs/plugin-react), so a file that only writes JSX needs no React import.
  {
    name: "battlechoc/pwa",
    files: ["apps/pwa/src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // The service worker (Workbox, built by vite-plugin-pwa) has its own globals.
  {
    name: "battlechoc/pwa-service-worker",
    files: ["apps/pwa/src/service-worker.js"],
    languageOptions: { globals: globals.serviceworker },
  },

  // Playwright specs: Node, and the functions they hand to page.evaluate() run in the browser.
  {
    name: "battlechoc/pwa-playwright",
    files: ["apps/pwa/test/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // The client's headless tests (node:test) and its configuration files: ES modules on Node.
  {
    name: "battlechoc/pwa-node",
    files: [
      "apps/pwa/test/unit/**/*.js",
      "apps/pwa/*.js",
      "apps/pwa/scripts/**/*.mjs",
    ],
    languageOptions: { sourceType: "module", globals: globals.node },
  },

  // The API, the CI scripts, the whitepaper's simulator (their tests run on node:test and
  // import it) and this file: CommonJS on Node.
  {
    name: "battlechoc/node-commonjs",
    files: [
      "apps/api/**/*.js",
      ".github/scripts/**/*.js",
      "whitepaper/simulator/**/*.js",
      "eslint.config.js",
    ],
    languageOptions: nodeCommonJs,
  },
  // The shared package is CommonJS that runs in the browser and on Node: only what both have.
  {
    name: "battlechoc/shared",
    files: ["packages/shared/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.commonjs, ...globals["shared-node-browser"] },
    },
  },
  {
    name: "battlechoc/shared-node",
    files: ["packages/shared/scripts/**/*.js", "packages/shared/tests/**/*.js"],
    languageOptions: nodeCommonJs,
  },
  // Jest tests
  {
    name: "battlechoc/jest",
    files: ["apps/api/test/**/*.js", "packages/shared/tests/**/*.js"],
    languageOptions: { globals: globals.jest },
  },
];
