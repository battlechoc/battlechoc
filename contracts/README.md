# battlechoc contracts

The on-chain half of minting: a player can turn a game item into a CIP-68 token pair (a reference token with the item's datum, label 100, and the user token in the player's wallet, label 222). An [Aiken](https://aiken-lang.org) project for Plutus V3.

| Path | What |
| --- | --- |
| `aiken.toml`, `aiken.lock` | The project: compiler v1.1.24, `aiken-lang/stdlib` v4.0.0, `aiken-lang/fuzz` v3.0.0 (the lock is written by Aiken) |
| `lib/battlechoc/types.ak` | The shared types and constants: the config datum with the fee options, the items redeemer, the CIP-68 datum, the labels |
| `lib/battlechoc/names.ak` | The asset names: `label ‖ blake2b_224(cbor(seed))`, where the seed is the output reference the mint spends |

The validators `config`, `treasury` and `items` are in `validators/`, and the compiled blueprint in `plutus.json` (unapplied: the parameters are applied off chain).

## Check and build

Install Aiken v1.1.24 exactly, with [aikup](https://aiken-lang.org/installation-instructions): `aikup install v1.1.24` (a plain `aikup` installs the latest release, and another compiler writes another `plutus.json`), then:

```sh
npm run check:contracts   # from the repo root: format, tests, then the blueprint check
cd contracts
aiken check               # the tests (the first run downloads the dependencies into build/)
aiken fmt                 # formats the .ak files
aiken build --trace-level silent   # writes plutus.json
```

CI runs the same checks (the `contracts` job in `.github/workflows/ci.yml`), with 500 runs per property test. Aiken is not an npm tool, so these checks are not part of `npm run verify`. Prettier leaves this folder alone (`.prettierignore`): Aiken writes `plutus.json` and formats the `.ak` files itself.

`plutus.json` is committed. CI and `check:contracts` rebuild it with `aiken build --trace-level silent` and fail when it differs from the committed file, so rebuild and commit it with every change to the contracts.

The test `suffix_vector` pins the seed's CBOR encoding: the same suffix as the API's test of it (`SUFFIX_VECTOR` in `apps/api/test/chain.blueprint.test.js`), so the contracts and the API name an item alike.

## Deploying to preprod

The contracts go onto the test network preprod once, by hand, with your own key. The scripts read the chain and submit through [Koios](https://koios.rest)'s public tier, which needs no account and no key; Blockfrost is the alternative (below). Three scripts in `apps/api/scripts/chain/` do it; run them from the repo root. None of them prints a key, a recovery word or the provider's key.

| Script | What |
| --- | --- |
| `new-key.js --kind key\|wallet --out <file>` | A new key file (one line `ed25519_sk1…`, mode 600; never over an existing file). `key` prints the key hash and its address; `wallet` writes 24 recovery words (for the e2e players) and prints the base address and `stake:<hash>` |
| `deploy.js --admin-key <file> --server-key-hash <hex> [--dry-run] [--again \| --new-seed]`, `deploy.js --confirm [--dry-run]` | One transaction from the admin's address: spends its largest ADA-only UTxO (the seed), mints the config NFT and locks it at the config address with the first config datum (the server key, the admin, threshold 1, not paused, a fee of 1, 2 or 4 ADA by tier, all of it to the treasury). Right before the submit it reads the block 20 below the tip: there the server's chain index will start (`indexStart` in the record: its height, slot and hash). Writes `contracts/deployments/preprod.json` (public data only) with `"status": "submitted"`, waits for the block, rewrites it with `"status": "confirmed"` and the block height, and prints the lines for the server's `.env`: `CHAIN_POLICY_ID`, `CHAIN_CONFIG_REF`, `CHAIN_CONFIG_POLICY_ID`, `YACI_SYNC_START_SLOT` and `YACI_SYNC_START_BLOCKHASH`. `--confirm` only waits for the transaction of a submitted record and confirms it (with `--dry-run` it says what it would confirm and changes no file) |
| `update-config.js --admin-key <file> (--pause \| --resume \| --add-server-key <hex> \| --remove-server-key <hex> \| --fees <json file>) [--dry-run]` | Moves the config NFT on with a new datum, signed by the admin; prints the new `CHAIN_CONFIG_REF` |

Each needs `CARDANO_NETWORK=preprod` (anything else, mainnet too, is refused in this version) and `CHAIN_PROVIDER_URL=https://preprod.koios.rest/api/v1`. With a Koios token of a paid tier, `CHAIN_PROVIDER_KEY=<token>` as well (optional). To use Blockfrost instead: `CHAIN_PROVIDER_KIND=blockfrost`, `CHAIN_PROVIDER_URL=https://cardano-preprod.blockfrost.io/api/v0` and `CHAIN_PROVIDER_KEY=<your Blockfrost project id>` (a free project for preprod; required then). `--dry-run` builds and signs the transaction, prints all of it (inputs, mint, outputs, the datum, the fee) and submits nothing. A datum the validator would refuse (a typo in a fee file, removing the last server key) is refused before anything is built.

The treasury needs no transaction of its own: it is the script address of the `treasury` validator applied to the config policy, and the deploy prints it. The items policy needs none either: its script travels in each mint. The API finds the config by its NFT, so an update does not require a change to the server's environment; `CHAIN_CONFIG_REF` is kept current there all the same.

The steps, once:

1. Nothing to sign up for: Koios's public tier needs no key (for Blockfrost instead, get a free project for **preprod** and keep its id in your password manager).
2. Make two keys outside the repository (next to the recipes): `node apps/api/scripts/chain/new-key.js --kind key --out ../battlechoc-private/chain/preprod-admin.sk` and the same with `preprod-server.sk`. Each prints a key hash and an address; nothing secret is printed.
3. Send test ADA to the admin's address from the Cardano testnet faucet (choose Preprod; 20 tADA are plenty).
4. Nothing to choose for the fee: it goes into the treasury, which the script sets up itself and prints (`treasury address`). The fee collects there; only your admin key can spend it in this version (fees in CHOC and USDCx and the season rollover are a later plan). Amounts and receiver can be changed later with `update-config.js --fees` without a new policy.
5. Dry run: `CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://preprod.koios.rest/api/v1 node apps/api/scripts/chain/deploy.js --admin-key ../battlechoc-private/chain/preprod-admin.sk --server-key-hash <server key hash> --dry-run`. Then the same without `--dry-run`. It waits for the block and prints, last, the five lines for the server's `.env` (none of them is a secret).
6. Copy the five lines into the server's `.env` (`deploy/README.md`, "Chain features"); `deploy.js --confirm` prints them again from the record at any time. Copy `preprod-server.sk` to the VPS as `/opt/battlechoc/private/chain-server.key` (the name `deploy/README.md` and `.env.example` use for `CHAIN_SERVER_KEY_PATH`), then `sudo chown 1000:1000` and `sudo chmod 600` it (as with the recipes). The admin key stays on your machine only.
7. Tell Claude when it is done: `contracts/deployments/preprod.json` gets committed, but only once it says `"status": "confirmed"` (if it says `submitted`, see below); you push.
8. Later: pausing, a new server key or other fees is `update-config.js`; it prints a new `CHAIN_CONFIG_REF`, which then goes into `.env`. It does not rewrite `contracts/deployments/preprod.json`: the record's `configRef`, `serverKeyHashes` and `fees` describe the first deployment, and the scripts and the API find the current config by its NFT.
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

The index's start point is fixed by the first record that has one: a retry with `--again`, `--new-seed`, `--confirm` and an adopted earlier attempt keep the earliest recorded start point, and `update-config.js` never touches it, so an index rebuilt later still starts before the first mint. (A record from before start points were recorded gets the block 20 below the one its transaction landed in when `--confirm` confirms it.)

Over a confirmed record, `deploy.js` refuses to run: deploying again would make a second config policy. `--again` does that only when you mean to replace the deployment, and keeps the earlier record as `preprod.replaced-<date>.json`. `update-config.js` works only from a confirmed record.

No argument of these scripts may have the shape of a key or of recovery words (a key in bech32 or hex, 12 or more words, also as part of a path): such an argument is refused before anything is read or created, and is never repeated.

A provider failure names what went wrong: "the provider refused the token" (Koios) or "the provider refused the project id" (Blockfrost; check `CHAIN_PROVIDER_KEY` in both cases), "could not reach <host>" (check `CHAIN_PROVIDER_URL`), a request limit (Koios's public tier allows 100 requests in 10 seconds; the scripts make a handful), "the provider refused the request for its size (413)" (Koios's public tier limits a request's body to 1 kB, and the deploy transaction is about 2.9 kB, a mint 2 to 3 kB: register a free token at koios.rest and put it into `CHAIN_PROVIDER_KEY`, which raises the limit to 5 kB; if a transaction is still too large, run the script through Blockfrost or a submit endpoint of your own), or the status with the provider's message. Whether Koios's submit enforces the size limit has not been tried yet: the first real deploy shows it.

## The end-to-end run on preprod

`apps/api/scripts/chain/e2e.js` proves on the real chain what the offline tests prove locally, once per release. It uses the API's transaction module as the API does (the server builds, the player's wallet signs, the server checks the wallet's witness and signs last); the players sign with their recovery words, in the shape a CIP-30 wallet answers. The steps:

1. It reads the live config (by its NFT) and builds the mint of `DARK_WALLS` (a RARE item, serial = the time in seconds) for player A.
2. It checks that the mint's body names the server key as a required signer, and submits it with A's signature and without the server's: the node must refuse it, for the server's missing signature. Only the ledger's refusal naming the server key counts; a 403, a request limit or another ledger failure fails the step. This shows that the ledger refuses the transaction the game builds when the server has not signed it (the check of a required signer). It does not show on the chain that the items validator itself refuses a mint whose body leaves the server out: that rests on the contracts' Aiken tests. **If the node takes that mint, the run ends with `STOP THE RELEASE`**: the server's signature was not enforced, and the deployment must not be released. That is the one result of this script that stops a release; report it with the transaction's explorer link.
3. The server signs, the mint is submitted and lands: A's stake key holds the user token, the store holds the reference token with the item's datum, and the treasury holds a datum-less 2 ADA output of this transaction.
4. A sends the user token to B (a plain transaction).
5. The game's burn for B: its body names the server key as a required signer, and B and the server sign it. Both tokens are gone, the store's ADA is back at B.
6. A second mint for A, then a burn by A alone: its body requires no other signer and carries only A's signature, and the validator lets the holder burn.
7. A summary: each step passed or failed with its transaction and explorer link, the network fees, deposits and game fees the chain charged beside the estimates in `packages/shared/chain.js` (a warning, not a failure, for one above its estimate), and the treasury's fee output with its minimum UTxO.

What you need, besides the confirmed deployment (`contracts/deployments/preprod.json` with `"status": "confirmed"`; the script refuses to start without it and takes the ids from it), and the server key file:

- Two player wallets, made outside the repository: `node apps/api/scripts/chain/new-key.js --kind wallet --out ../battlechoc-private/chain/e2e-player-a.words`, and the same with `e2e-player-b.words`. Each prints its `wallet addr`.
- About 30 tADA at each of the two addresses (the faucet, Preprod). A run spends about 6 tADA in all: four network fees of about 0.4 tADA, the transfer's fee, and the two game fees of 2 tADA, which go to your treasury.
- A run directory for its state, outside the repository, new for each run: for instance `../battlechoc-private/chain/e2e-<date>/`.

Then, from the repo root:

```sh
CARDANO_NETWORK=preprod CHAIN_PROVIDER_URL=https://preprod.koios.rest/api/v1 \
node apps/api/scripts/chain/e2e.js --player-a ../battlechoc-private/chain/e2e-player-a.words \
  --player-b ../battlechoc-private/chain/e2e-player-b.words --server-key ../battlechoc-private/chain/preprod-server.sk \
  --run-dir ../battlechoc-private/chain/e2e-<date> --dry-run
```

`--dry-run` reads the chain, builds the first mint, shows it and stops before the first submit; it writes nothing. Then the same without `--dry-run`. It takes a few minutes (one block for each of the five transactions) and ends with the summary; the exit code is 0 only if every step passed. Paste the summary to Claude: its fees go into the plan's ledger, and a fee above its estimate means measuring again. `CHAIN_POLICY_ID` and `CHAIN_CONFIG_REF` are not needed; if `CHAIN_POLICY_ID` is set, it must be the recorded items policy.

The run keeps its state in `<run-dir>/e2e-preprod.json` (public data only: transaction ids, asset names, fees, verdicts), written before each submit. If it stops (a failed step, a provider failure, Ctrl-C), run the same command again: it goes on where it stopped. A step that passed is not run again. A transaction it submitted, step 2's included, is looked for on the chain: in a block, it is judged; still valid, it is waited for (the message says so; run it again later); only once it can no longer land (in no block, and the chain past its validity of 20 minutes) is it built anew, and a mint only while the wallet still holds the UTxO it spent (its seed). If the seed is spent, one of the run's attempts landed after all, and it is taken as the step's transaction; if none did, something else spent the seed, and the run stops without building (look the seed up on a preprod explorer, then start a new run with a new `--run-dir`). So a rerun never mints a second item by accident. The ids of the attempts a step replaced stay in the state file. A submit the provider refused reached nothing and is built anew. A step whose verdict failed stays failed (its transaction is on the chain): report it. After `STOP THE RELEASE`, every rerun of that run directory stops the same way. For a new run, name a new `--run-dir`; the script refuses a run directory made with other wallets, another server key or another deployment.
