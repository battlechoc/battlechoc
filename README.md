# battlechoc

A chocolate-themed two-player strategy game. Each player owns a board of chocolate cells, builds a chocolate factory, cacao trees, cannons and special buildings, hides them under cream, and tries to destroy the opponent's economy. Playable against AI opponents and online, as a progressive web app.

## Repository layout

| Path | What |
| --- | --- |
| `apps/pwa` | The game client: React, Redux Toolkit, Babylon.js, Vite, Workbox |
| `packages/shared` | Rules engine shared by client and server (entities, board, reducers, validation, awards, translations) |
| `apps/server` | Legacy Firebase Cloud Functions backend (to be replaced by a Node.js service) |

## Development

Requires Node `^20.19` or `>=22.12`.

```sh
npm install          # installs all workspaces
npm run dev          # Vite dev server for the PWA on port 3000
npm test             # unit tests of the shared rules engine
npm run build        # production build of the PWA into apps/pwa/build
npm run test:e2e     # Playwright end-to-end tests against the production build (run the build
                     # first, and `npx playwright install chromium` once)
```

## License

- **Code:** [GNU Affero General Public License v3.0 or later](LICENSE). If you run a modified version of battlechoc as a network service, you must offer its source code to its users.
- **Art and music** (images, 3D models, music, sounds and their sources): [CC BY-NC-SA 4.0](LICENSE-ASSETS). They may not be used commercially. These files are source-available, not open source.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). All contributors must sign the [Contributor License Agreement](CLA.md) before a pull request can be merged; the CLA bot guides you through it.
