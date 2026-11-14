# battlechoc contracts

The on-chain half of minting: a player can turn a game item into a CIP-68 token pair (a reference token with the item's datum, label 100, and the user token in the player's wallet, label 222). An [Aiken](https://aiken-lang.org) project for Plutus V3.

| Path | What |
| --- | --- |
| `aiken.toml`, `aiken.lock` | The project: compiler v1.1.24, `aiken-lang/stdlib` v4.0.0, `aiken-lang/fuzz` v3.0.0 (the lock is written by Aiken) |
| `lib/battlechoc/types.ak` | The shared types and constants: the config datum with the fee options, the items redeemer, the CIP-68 datum, the labels |
| `lib/battlechoc/names.ak` | The asset names: `label ‖ blake2b_224(cbor(seed))`, where the seed is the output reference the mint spends |

The validators `config`, `treasury` and `items` follow in `validators/`, and the compiled blueprint in `plutus.json`.

## Check and build

Install Aiken v1.1.24 ([aikup](https://aiken-lang.org/installation-instructions) or `cargo install`), then:

```sh
npm run check:contracts   # from the repo root: aiken fmt --check && aiken check --deny
cd contracts
aiken check               # the tests (the first run downloads the dependencies into build/)
aiken fmt                 # formats the .ak files
aiken build               # writes plutus.json
```

CI runs the same checks (the `contracts` job in `.github/workflows/ci.yml`), with 500 runs per property test. Aiken is not an npm tool, so these checks are not part of `npm run verify`. Prettier leaves this folder alone (`.prettierignore`): Aiken writes `plutus.json` and formats the `.ak` files itself.

The test `suffix_vector` pins the seed's CBOR encoding against the API's: until the API's value is written into it, it fails.
