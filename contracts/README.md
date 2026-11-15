# battlechoc contracts

The on-chain half of minting: a player can turn a game item into a CIP-68 token pair (a reference token with the item's datum, label 100, and the user token in the player's wallet, label 222). An [Aiken](https://aiken-lang.org) project for Plutus V3.

| Path | What |
| --- | --- |
| `aiken.toml`, `aiken.lock` | The project: compiler v1.1.24, `aiken-lang/stdlib` v4.0.0, `aiken-lang/fuzz` v3.0.0 (the lock is written by Aiken) |
| `lib/battlechoc/types.ak` | The shared types and constants: the config datum with the fee options, the items redeemer, the CIP-68 datum, the labels |
| `lib/battlechoc/names.ak` | The asset names: `label ‖ blake2b_224(cbor(seed))`, where the seed is the output reference the mint spends |

The validators `config`, `treasury` and `items` are in `validators/`, and the compiled blueprint in `plutus.json` (unapplied: the parameters are applied off chain).

## Check and build

Install Aiken v1.1.24 ([aikup](https://aiken-lang.org/installation-instructions) or `cargo install`), then:

```sh
npm run check:contracts   # from the repo root: format, tests, then the blueprint check
cd contracts
aiken check               # the tests (the first run downloads the dependencies into build/)
aiken fmt                 # formats the .ak files
aiken build --trace-level silent   # writes plutus.json
```

CI runs the same checks (the `contracts` job in `.github/workflows/ci.yml`), with 500 runs per property test. Aiken is not an npm tool, so these checks are not part of `npm run verify`. Prettier leaves this folder alone (`.prettierignore`): Aiken writes `plutus.json` and formats the `.ak` files itself.

`plutus.json` is committed. CI and `check:contracts` rebuild it with `aiken build --trace-level silent` and fail when it differs from the committed file, so rebuild and commit it with every change to the contracts.

The test `suffix_vector` pins the seed's CBOR encoding against the API's: until the API's value is written into it, it fails.

## Deploying to preprod

The contracts go onto the test network preprod once, by hand, with your own key and your own Blockfrost project id. Three scripts in `apps/api/scripts/chain/` do it; run them from the repo root. None of them prints a key, a recovery word or the project id.

| Script | What |
| --- | --- |
| `new-key.js --kind key\|wallet --out <file>` | A new key file (one line `ed25519_sk1…`, mode 600; never over an existing file). `key` prints the key hash and its address; `wallet` writes 24 recovery words (for the e2e players) and prints the base address and `stake:<hash>` |
| `deploy.js --admin-key <file> --server-key-hash <hex> [--dry-run] [--again \| --new-seed]`, `deploy.js --confirm` | One transaction from the admin's address: spends its largest ADA-only UTxO (the seed), mints the config NFT and locks it at the config address with the first config datum (the server key, the admin, threshold 1, not paused, a fee of 1, 2 or 4 ADA by tier, all of it to the treasury). Writes `contracts/deployments/preprod.json` (public data only) with `"status": "submitted"`, waits for the block, rewrites it with `"status": "confirmed"` and the block height, and prints `CHAIN_POLICY_ID` and `CHAIN_CONFIG_REF`. `--confirm` only waits for the transaction of a submitted record and confirms it |
| `update-config.js --admin-key <file> (--pause \| --resume \| --add-server-key <hex> \| --remove-server-key <hex> \| --fees <json file>) [--dry-run]` | Moves the config NFT on with a new datum, signed by the admin; prints the new `CHAIN_CONFIG_REF` |

Each needs `CARDANO_NETWORK=preprod` (anything else, mainnet too, is refused in this version), `CHAIN_PROVIDER_URL=https://cardano-preprod.blockfrost.io/api/v0` and `CHAIN_PROVIDER_KEY=<your Blockfrost project id>`. `--dry-run` builds and signs the transaction, prints all of it (inputs, mint, outputs, the datum, the fee) and submits nothing. A datum the validator would refuse (a typo in a fee file, removing the last server key) is refused before anything is built.

The treasury needs no transaction of its own: it is the script address of the `treasury` validator applied to the config policy, and the deploy prints it. The items policy needs none either: its script travels in each mint. The API finds the config by its NFT, so an update does not require a change to the server's environment; `CHAIN_CONFIG_REF` is kept current there all the same.

The steps, once:

1. Get a free Blockfrost project for **preprod**; keep the project id in your password manager.
2. Make two keys outside the repository (next to the recipes): `node apps/api/scripts/chain/new-key.js --kind key --out ../battlechoc-private/chain/preprod-admin.sk` and the same with `preprod-server.sk`. Each prints a key hash and an address; nothing secret is printed.
3. Send test ADA to the admin's address from the Cardano testnet faucet (choose Preprod; 20 tADA are plenty).
4. Nothing to choose for the fee: it goes into the treasury, which the script sets up itself and prints (`treasury address`). The fee collects there; only your admin key can spend it in this version (fees in CHOC and USDCx and the season rollover are a later plan). Amounts and receiver can be changed later with `update-config.js --fees` without a new policy.
5. Dry run: `CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://cardano-preprod.blockfrost.io/api/v0 CHAIN_PROVIDER_KEY=<id> node apps/api/scripts/chain/deploy.js --admin-key ../battlechoc-private/chain/preprod-admin.sk --server-key-hash <server key hash> --dry-run`. Then the same without `--dry-run`. It waits for the block and prints `CHAIN_POLICY_ID` and `CHAIN_CONFIG_REF`.
6. Keep the two lines for the server's `.env` (plan D wires them). Copy `preprod-server.sk` to the VPS as `/opt/battlechoc/private/chain-server.sk`, then `sudo chown 1000:1000` and `sudo chmod 600` it (as with the recipes). The admin key stays on your machine only.
7. Tell Claude when it is done: `contracts/deployments/preprod.json` gets committed, but only once it says `"status": "confirmed"` (if it says `submitted`, see below); you push.
8. Later: pausing, a new server key or other fees is `update-config.js`; it prints a new `CHAIN_CONFIG_REF`, which then goes into `.env`.
9. Add the CI job `contracts` to the required checks of ruleset `default` (repo settings, or the `PUT rulesets/25836978` with the current rules plus `contracts`).

A fee file for `--fees` is the list `fees` of the deployment record: `[]` for no fee, or options like

```json
[{ "asset": "lovelace", "amounts": [1000000, 2000000, 4000000], "receivers": [{ "address": "addr_test1w…", "share": 1 }] }]
```

with one amount per tier (COMMON, RARE, EPIC), none negative, at least one receiver, each share above 0 and no address twice; `asset` is `lovelace` or a policy id (56 hex) followed by the asset name in hex. The API's builder takes only ADA options until the treasury plan.

Once the provider may have the deploy transaction, `deploy.js` prints the ids ("submitted, not yet confirmed": config policy, items policy, config ref, treasury) and writes `contracts/deployments/preprod.json` with `"status": "submitted"` before it waits for the block, so a failure after that loses nothing. When the block is seen, the record says `"status": "confirmed"` and `"block": <height>`. A submit the provider refused (the message carries the ledger's reason) deploys nothing and writes no record.

If the run stops while the record says `submitted`, look up its `configTx` on a preprod explorer:

- It is in a block: run `deploy.js --confirm` (the same environment, no key needed). It waits for that transaction and confirms the record; nothing new is submitted.
- It never reached the chain (it is valid for 20 minutes): run the deploy again with `--again`. It spends the same seed, so the policy ids stay the same.

If the seed is spent (`--again` and `--confirm` check), they look whether the recorded transaction is in a block, or the transaction of an earlier attempt of the same deploy set aside as `preprod.replaced-*.json`. Only a record that is still `submitted` and has the same seed, admin key and network counts: only such a transaction can have spent this seed. A record set aside for another reason (a confirmed deployment you replaced with `--again`, another seed from an earlier `--new-seed`, another admin key or network) is never taken back; the message names each one and says why it does not count. If one attempt is in a block, its record becomes the deployment, confirmed: an earlier attempt's record takes the place of `preprod.json`, and the later one is set aside. Nothing new is submitted. If none is, something else spent the seed (the admin's UTxO used elsewhere, or a transaction whose record you no longer have): look up the seed on a preprod explorer.
- If the transaction that spent it is a config tx of this deploy and you have its record, put that record back as `preprod.json` and run `--confirm`.
- Otherwise the one way on is a fresh deployment with a new seed: the same command with `--new-seed` instead of `--again`. Its policy ids differ from the recorded ones, and the record is kept aside. `--new-seed` is refused while the seed is unspent (then `--again` is the retry) and over a confirmed record.

Over a confirmed record, `deploy.js` refuses to run: deploying again would make a second config policy. `--again` does that only when you mean to replace the deployment, and keeps the earlier record as `preprod.replaced-<date>.json`. `update-config.js` works only from a confirmed record.

No argument of these scripts may have the shape of a key or of recovery words (a key in bech32 or hex, 12 or more words, also as part of a path): such an argument is refused before anything is read or created, and is never repeated.

A provider failure names what went wrong: "the provider refused the project id" (check `CHAIN_PROVIDER_KEY`), "could not reach <host>" (check `CHAIN_PROVIDER_URL`), a request limit, or the status with Blockfrost's message.
