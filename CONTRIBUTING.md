# Contributing to battlechoc

Thank you for your interest in contributing to battlechoc! Please follow these guidelines to keep the contribution process smooth.

## Guidelines

1. **Open an issue first**
   Before starting work on a feature or larger change, open an issue to align it with the project's direction. This avoids duplicate work and makes sure your contribution fits the game.

2. **Semantic commits**
   Use [conventional commit messages](https://www.conventionalcommits.org/), for example:

   - `feat: add a cooldown indicator to the attack palette`
   - `fix: keep the cream on molten cells`
   - `docs: explain the balance config`
   - `build(deps): update vite`

   [release-please](https://github.com/googleapis/release-please) turns them into the next version and `CHANGELOG.md`: `feat` raises the minor version, `fix` and `perf` the patch version, a `!` (breaking change) the major version.

3. **Sign the CLA**
   All contributors must sign the [Contributor License Agreement](./CLA.md) before their contributions can be merged. When you open a pull request, [cla-bot](https://colineberhardt.github.io/cla-bot/) checks whether we have your agreement on file. If not, it comments on the pull request: reply there that you have read the CLA and agree to its terms, and a maintainer adds your GitHub username to [`.clabot`](./.clabot), the list of contributors who signed. The check then passes (maintainers can re-run it with a comment `@cla-bot check`).

4. **Pull requests**

   - Fork the repository and create a branch for your changes.
   - Follow the existing code style; [`.editorconfig`](./.editorconfig) states it for your editor. The PWA is formatted with Prettier (2 spaces, double quotes, `trailingComma: "es5"`) and uses `.jsx` only for files with JSX. The API and the shared rules engine use 4 spaces, single quotes and CommonJS; they are not formatted with Prettier, so do not run it on them.
   - `npm run format:check` checks with [Prettier](https://prettier.io/) the PWA, the root configuration files, the workflows and the whitepaper's simulator (`npm run format` fixes them); [`.prettierignore`](./.prettierignore) lists what it leaves alone.
   - `npm run lint` runs [ESLint](https://eslint.org/) with correctness rules only (names that do not exist, unused code, the rules of hooks; no style rules). CI fails on any finding.
   - UI text goes through `translate(translationKeys.X)` from the shared package; add new keys to all 8 files in `packages/shared/translations/`.
   - Submit a pull request with a clear description of your changes.

5. **Testing**
   Test your changes before opening a pull request. One command runs what the CI job `test-and-build` checks:

   ```bash
   npm install
   npm run verify
   ```

   It runs these, which you can also run one at a time:

   ```bash
   npm run format:check     # Prettier, for the files it covers
   npm run test:changelog   # tests of the CI script that writes a pull request's changelog
   npm test                 # shared rules engine unit tests
   npm run test:unit        # the client's headless tests: tutorial scenarios on the engine, board view, live state
   npm run test:whitepaper  # economy simulator of the whitepaper
   npm run test:api         # API tests (in-memory Postgres)
   npm run build            # PWA production build
   npm run check:build      # the production build carries no test hooks
   ```

   CI also runs the API tests on Postgres 17 (set `TEST_DATABASE_URL` to do the same) and, in separate jobs, the end-to-end tests:

   ```bash
   npx playwright install chromium   # once
   npm run test:e2e         # Playwright end-to-end tests (builds its own test build first)
   ```

## Licensing of contributions

Code is licensed under [AGPL-3.0-or-later](LICENSE). Art and music are licensed under [CC BY-NC-SA 4.0](LICENSE-ASSETS). By signing the CLA you agree that your contribution is provided under the terms described there.

## Need help?

Open an issue or write to **[hello@battlechoc.com](mailto:hello@battlechoc.com)**. Please report a security problem privately, as [SECURITY.md](SECURITY.md) describes.
