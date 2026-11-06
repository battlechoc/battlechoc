# battlechoc PWA

The game client of [battlechoc](../../README.md): a progressive web app built with React, Redux Toolkit, Babylon.js and Vite. Matches against the AI opponents run on the device itself, also offline; live matches against other players, accounts and the lab need the [API](../api).

## Running and testing

Run these from the repository root, after `npm install` there. The [root README](../../README.md#development) has the setup and how to run the API next to the game.

| Command | What |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000. It opens a browser tab; `BROWSER=none npm run dev` does not. |
| `npm run build` | Production build into `apps/pwa/build` |
| `npm run test:unit` | Headless tests of the client's logic (`test/unit`, `node --test`), such as the tutorial on the real engine |
| `npm run test:e2e` | Playwright end-to-end tests (`test/*.spec.js`). Builds the e2e build first, the production build plus test hooks, into `apps/pwa/build-e2e`. Run `npx playwright install chromium` once. |

The game talks to `https://api.battlechoc.com` unless `VITE_API_URL` names another API at build time or for the dev server.

## Where things live

| Path | What |
| --- | --- |
| `src/3d` | The Babylon.js scene: boards, models, cameras and light |
| `src/match` | The match hosts. `LocalMatchHost` runs the rules engine on the device against the AIs; `RemoteMatchHost` and the `live*` files play a live match over the API's WebSocket. |
| `src/tutorial` | The tutorial: a first lesson against Mimi Marzipan and short scripted demos, all on the real engine |
| `src/situations` | Matches that start from a prepared board |
| `src/ui` | The React UI: HUD, match controls, dialogs, the lab |
| `src/service-worker.js` | The service worker (Workbox): keeps the game playable offline and shows Web Push messages |
| `src/testHooks.js` | What the end-to-end tests drive the game with. Only the dev server and the e2e build have these hooks. |
| `public` | Files served as they are: models, images, music, sounds, fonts and the web app manifest |
| `dev` | Art sources (Blender, GIMP) and the scripts that turn them into the files in `public` |
| `test` | Playwright specs, and the headless tests in `test/unit` |

The rules, the AI opponents and all UI text come from [`packages/shared`](../../packages/shared).

## License

Code under AGPL-3.0-or-later, art and music under CC BY-NC-SA 4.0, fonts under the SIL Open Font License. The [root README](../../README.md#license) has the details.
