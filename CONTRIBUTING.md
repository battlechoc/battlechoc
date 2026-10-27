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
   - Follow the existing code style (Prettier defaults with `trailingComma: "es5"`; the PWA uses `.jsx` for React files; the shared rules engine uses 4-space indentation and CommonJS).
   - UI text goes through `translate(translationKeys.X)` from the shared package; add new keys to all 8 files in `packages/shared/translations/`.
   - Submit a pull request with a clear description of your changes.

5. **Testing**
   Test your changes before opening a pull request:

   ```bash
   npm install
   npm test            # shared rules engine unit tests
   npm run test:api    # API tests (in-memory Postgres)
   npm run build       # PWA production build
   npx playwright install chromium   # once, for the end-to-end tests
   npm run test:e2e    # Playwright end-to-end tests (builds its own test build first)
   ```

## Licensing of contributions

Code is licensed under [AGPL-3.0-or-later](LICENSE). Art and music are licensed under [CC BY-NC-SA 4.0](LICENSE-ASSETS). By signing the CLA you agree that your contribution is provided under the terms described there.

## Need help?

Open an issue or write to **[info@battlechoc.dev](mailto:info@battlechoc.dev)**.
