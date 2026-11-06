# battlechoc shared package

`@battlechoc/battlechoc-shared-functions` is what the game client ([`apps/pwa`](../../apps/pwa)) and the backend ([`apps/api`](../../apps/api)) of [battlechoc](../../README.md) share: the real-time rules engine, the AI opponents, the balance, the live match protocol and the translations. It is CommonJS without runtime dependencies, and both apps get it through the npm workspace.

## Testing

From the repository root, after `npm install` there:

```sh
npm test                                   # Jest unit tests (tests/)
npm run test:coverage -w packages/shared   # the same, with a coverage report in packages/shared/coverage
npm run simulate -w packages/shared        # plays many matches AI against AI and prints statistics
```

`scripts/simulate.js` explains the arguments of the simulation at its top.

## Where things live

| Path | What |
| --- | --- |
| `index.js` | The exports of the package: constants, the values of the buildings per Choclab level, errors, `translate` and `translationKeys` |
| `engine/` | The real-time rules engine. It never reads a clock, and a match is reproducible from its seed and its action log. |
| `engine/ai/` | The AI opponents Gustav Ganache (strong) and Tom Toffee (easy), and the scripted player of the tutorial demos |
| `balance.js` | Every timing and amount of the engine |
| `live/` | The messages of the live match WebSocket, clock sync and challenge codes |
| `equipment.js`, `ingredients.js`, `progression.js` | The lab: ingredients, the equipment crafted from them, Choclab costs and the drops after a match |
| `rating.js` | Glicko-2 ratings |
| `translations/` | The UI text in 8 languages. A new key goes into all 8 files; a test checks that. |
| `tests/` | The Jest tests |

## License

AGPL-3.0-or-later, see the [root README](../../README.md#license).
