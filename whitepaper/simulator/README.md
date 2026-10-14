# CHOC economy simulator

An agent-based model of the economy described in the [whitepaper](../whitepaper.md). One step is one monthly season. CHOC has no decimals, so every amount is a whole coin and every split rounds down. Plain Node.js (20 or later), no dependencies.

| File | Content |
| --- | --- |
| `model.js` | the model: issuance schedules, players, market, registration, payouts, crafting, pantry |
| `scenarios.js` | player scenarios (baseline, hoarding, boom, bust), policy variants, issuance variants |
| `run.js` | runs every scenario × policy × seed on worker threads; writes `../figures/*.svg` and `results.md` |
| `charts.js` | small SVG chart helpers |
| `flowdiagram.js` | the animated token-flow diagram |
| `results.md` | generated results table (do not edit) |
| `test/` | tests: supply conservation, whole coins, determinism, fee rules, pot flows, payouts |

```
node whitepaper/simulator/run.js [--seeds 8] [--years 25]
node --test 'whitepaper/simulator/test/*.test.js'
```

## What one season does

1. Players leave (5 % per month); part of their coins is sold on the way out, the rest stays in their wallets (20 % of that is lost for good). New players join to follow the scenario's population curve.
2. Earlier prizes are claimed; unclaimed ones return to the pot after the claim period, and so do prizes that departed players left in the pantry.
3. The season's coins are minted into the pot.
4. Players decide whether to enter and whether to craft. With a fee, entry depends on last season's prize per entrant plus the fun of playing.
5. A market without prices: players who are short of coins buy from the team, from leaving players, from players with a surplus and from former players.
6. Registration (fee split 95/5), payout (15 % evenly, 85 % by 1/rank), crafting (fee split 90/10).

## Limits

No prices, fixed behaviour profiles, constant churn, no returning players, no equipment effects, no multi-accounting. The model shows how the rules behave under very different conditions; it is not a forecast.
