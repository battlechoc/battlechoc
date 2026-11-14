//// The config NFT: a one-shot policy mints one NFT named "config", and it
//// sits at this same script's address, whose datum (`ConfigDatum`) names
//// the server keys, the admins and the battlechoc fee options. Mint and spend
//// share one script hash, so the NFT's policy id is also its address's
//// payment credential. The NFT moves only with `threshold` admin signatures.

use aiken/cbor
use aiken/collection/dict
use aiken/collection/list
use aiken/option
use aiken/primitive/bytearray
use battlechoc/fixtures.{
  ada_fee, admin_a, admin_b, admin_c, admin_d, admin_e, base_config, choc_policy,
  config_nft_input, config_nft_output, config_policy, config_ref, config_seed,
  key_address, other_policy, script_address, server_1, server_2, treasury_hash,
  valid_config_mint_tx, valid_config_update_tx,
}
use battlechoc/rules.{config_output, count_signed}
use battlechoc/types.{ConfigDatum, FeeOption, config_token_name}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  DatumHash, InlineDatum, Input, Output, OutputReference, Transaction,
}

validator config(seed: OutputReference) {
  /// One-shot: mints the one config NFT to this script's address.
  mint(_redeemer: Data, own_policy: PolicyId, self: Transaction) {
    and {
      // CM1: the seed is spent, so this policy can mint only once
      list.any(self.inputs, fn(input) { input.output_reference == seed }),
      // CM2: exactly { config: 1 } under the own policy (no burn either)
      dict.to_pairs(assets.tokens(self.mint, own_policy)) == [
        Pair(config_token_name, 1),
      ],
      // CM3, CM4: to the own address with a well-formed inline datum
      option.is_some(config_output(self.outputs, own_policy)),
    }
  }

  /// An admin update: the NFT moves on to the own address with a new datum,
  /// signed by `threshold` admins of the current datum. `paused` does not
  /// stop the admins.
  spend(
    datum: Option<ConfigDatum>,
    _redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(current) = datum
    expect Some(own_input) = transaction.find_input(self.inputs, own_ref)
    expect Script(own_hash) = own_input.output.address.payment_credential
    and {
      // CS1: the spent input holds the NFT
      assets.quantity_of(own_input.output.value, own_hash, config_token_name) == 1,
      // CS2: `threshold` distinct admins of the input datum signed
      count_signed(current.admins, self.extra_signatories) >= current.threshold,
      // CS3: the NFT stays at the own address with a well-formed datum
      option.is_some(config_output(self.outputs, own_hash)),
    }
  }

  else(_) {
    fail
  }
}

// Tests

fn run_mint(tx: Transaction) -> Bool {
  config.mint(config_seed, Void, config_policy, tx)
}

/// Runs the spend of the config UTxO at `config_ref` whose datum is `current`.
fn run_spend(current: ConfigDatum, tx: Transaction) -> Bool {
  config.spend(config_seed, Some(current), Void, config_ref, tx)
}

/// The valid mint with `datum` as the config output's datum.
fn mint_with_datum(datum: ConfigDatum) -> Bool {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      outputs: [config_nft_output(datum)],
    },
  )
}

/// The valid mint with `fee` as the only fee option.
fn mint_with_fee(fee: FeeOption) -> Bool {
  mint_with_datum(ConfigDatum { ..base_config(), fees: [fee] })
}

/// The valid update of `base_config` (signed by `a` and `b`) to `datum`.
fn update_to(datum: ConfigDatum) -> Bool {
  let tx = valid_config_update_tx()
  run_spend(
    base_config(),
    Transaction {
      ..tx,
      outputs: [config_nft_output(datum), ..list.drop(tx.outputs, 1)],
    },
  )
}

// Happy paths

test config_mint_ok() {
  run_mint(valid_config_mint_tx())
}

test config_update_ok() {
  run_spend(base_config(), valid_config_update_tx())
}

test config_rotates_server_key_ok() {
  update_to(ConfigDatum { ..base_config(), server_keys: [server_2] })
}

test config_changes_fees_ok() {
  let choc_fee = FeeOption {
    policy: choc_policy,
    name: "CHOC",
    amounts: [10, 20, 40],
    receivers: [(script_address(treasury_hash), 4), (key_address(admin_a), 1)],
  }
  update_to(ConfigDatum { ..base_config(), fees: [ada_fee(), choc_fee] })
}

// CM1: the seed is spent

test config_mint_without_seed_fails() fail {
  let tx = valid_config_mint_tx()
  let other_input = Input {
    output_reference: OutputReference {
      transaction_id: config_seed.transaction_id,
      output_index: 1,
    },
    output: fixtures.wallet_output(admin_a, 10_000_000),
  }
  run_mint(
    Transaction { ..tx, inputs: [other_input], reference_inputs: tx.inputs },
  )
}

// CM2: exactly { config: 1 } under the own policy

test config_mint_two_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      mint: assets.from_asset(config_policy, config_token_name, 2),
    },
  )
}

test config_mint_other_name_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      mint: assets.from_asset(config_policy, "other", 1),
    },
  )
}

test config_mint_extra_token_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      mint: assets.from_asset(config_policy, config_token_name, 1)
        |> assets.add(config_policy, "extra", 1),
    },
  )
}

test config_burn_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      mint: assets.from_asset(config_policy, config_token_name, -1),
    },
  )
}

// CM3: the NFT goes to the own script address

test config_mint_to_key_address_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      outputs: [
        Output {
          ..config_nft_output(base_config()),
          address: key_address(admin_a),
        },
      ],
    },
  )
}

test config_mint_to_other_script_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      outputs: [
        Output {
          ..config_nft_output(base_config()),
          address: script_address(other_policy),
        },
      ],
    },
  )
}

// CM4: a well-formed inline datum

test config_mint_threshold_zero_fails() fail {
  mint_with_datum(ConfigDatum { ..base_config(), threshold: 0 })
}

test config_mint_threshold_above_admins_fails() fail {
  mint_with_datum(ConfigDatum { ..base_config(), threshold: 4 })
}

test config_mint_threshold_above_unique_admins_fails() fail {
  mint_with_datum(
    ConfigDatum {
      ..base_config(),
      admins: [admin_a, admin_a, admin_b],
      threshold: 3,
    },
  )
}

test config_mint_without_admins_fails() fail {
  mint_with_datum(ConfigDatum { ..base_config(), admins: [], threshold: 1 })
}

test config_mint_without_server_key_fails() fail {
  mint_with_datum(ConfigDatum { ..base_config(), server_keys: [] })
}

test config_mint_datum_hash_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      outputs: [
        Output {
          ..config_nft_output(base_config()),
          datum: DatumHash(
            #"d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
          ),
        },
      ],
    },
  )
}

test config_mint_datum_not_a_config_fails() fail {
  run_mint(
    Transaction {
      ..valid_config_mint_tx(),
      outputs: [
        Output { ..config_nft_output(base_config()), datum: InlineDatum(42) },
      ],
    },
  )
}

test config_mint_short_key_fails() fail {
  mint_with_datum(
    ConfigDatum { ..base_config(), server_keys: [bytearray.take(server_1, 27)] },
  )
}

test config_mint_short_admin_key_fails() fail {
  mint_with_datum(
    ConfigDatum {
      ..base_config(),
      admins: [admin_a, admin_b, bytearray.take(admin_c, 27)],
    },
  )
}

test config_mint_fee_two_amounts_fails() fail {
  mint_with_fee(FeeOption { ..ada_fee(), amounts: [1_000_000, 2_000_000] })
}

test config_mint_fee_negative_amount_fails() fail {
  mint_with_fee(FeeOption { ..ada_fee(), amounts: [-1, 2_000_000, 4_000_000] })
}

test config_mint_fee_without_receivers_fails() fail {
  mint_with_fee(FeeOption { ..ada_fee(), receivers: [] })
}

test config_mint_fee_zero_share_fails() fail {
  mint_with_fee(
    FeeOption {
      ..ada_fee(),
      receivers: [(script_address(treasury_hash), 1), (key_address(admin_a), 0)],
    },
  )
}

test config_mint_fee_same_receiver_twice_fails() fail {
  mint_with_fee(
    FeeOption {
      ..ada_fee(),
      receivers: [
        (script_address(treasury_hash), 1),
        (script_address(treasury_hash), 1),
      ],
    },
  )
}

test config_mint_fee_ada_with_name_fails() fail {
  mint_with_fee(FeeOption { ..ada_fee(), name: "CHOC" })
}

test config_mint_without_fees_ok() {
  mint_with_datum(ConfigDatum { ..base_config(), fees: [] })
}

// CS1: the spent input holds the NFT

test config_spend_without_nft_fails() fail {
  let tx = valid_config_update_tx()
  let without_nft = Input {
    output_reference: config_ref,
    output: Output {
      ..config_nft_output(base_config()),
      value: assets.from_lovelace(2_000_000),
    },
  }
  run_spend(
    base_config(),
    Transaction { ..tx, inputs: [without_nft, ..list.drop(tx.inputs, 1)] },
  )
}

// CS2: `threshold` distinct admins of the input datum signed

test config_update_below_threshold_fails() fail {
  run_spend(
    base_config(),
    Transaction { ..valid_config_update_tx(), extra_signatories: [admin_a] },
  )
}

test config_duplicate_admin_counts_once() fail {
  let current = ConfigDatum {
    ..base_config(),
    admins: [admin_a, admin_a, admin_b],
  }
  let tx = valid_config_update_tx()
  run_spend(
    current,
    Transaction {
      ..tx,
      inputs: [config_nft_input(current), ..list.drop(tx.inputs, 1)],
      extra_signatories: [admin_a],
    },
  )
}

test config_update_signed_by_new_admins_only_fails() fail {
  let tx = valid_config_update_tx()
  run_spend(
    base_config(),
    Transaction {
      ..tx,
      outputs: [
        config_nft_output(
          ConfigDatum { ..base_config(), admins: [admin_d, admin_e] },
        ),
        ..list.drop(tx.outputs, 1)
      ],
      extra_signatories: [admin_d, admin_e],
    },
  )
}

// CS3: the NFT stays at the own address with a well-formed datum

test config_update_moves_nft_away_fails() fail {
  let tx = valid_config_update_tx()
  run_spend(
    base_config(),
    Transaction {
      ..tx,
      outputs: [
        Output {
          ..config_nft_output(ConfigDatum { ..base_config(), paused: True }),
          address: key_address(admin_a),
        },
        ..list.drop(tx.outputs, 1)
      ],
    },
  )
}

test config_update_bad_datum_fails() fail {
  update_to(ConfigDatum { ..base_config(), threshold: 0 })
}

test config_update_splits_nft_fails() fail {
  let datum_without_nft = Output {
    ..config_nft_output(ConfigDatum { ..base_config(), paused: True }),
    value: assets.from_lovelace(2_000_000),
  }
  let nft_to_wallet = Output {
    ..fixtures.wallet_output(admin_a, 4_800_000),
    value: assets.from_lovelace(4_800_000)
      |> assets.add(config_policy, config_token_name, 1),
  }
  run_spend(
    base_config(),
    Transaction {
      ..valid_config_update_tx(),
      outputs: [datum_without_nft, nft_to_wallet],
    },
  )
}

// `paused` does not stop the admins

test config_update_while_paused_ok() {
  let current = ConfigDatum { ..base_config(), paused: True }
  let tx = valid_config_update_tx()
  run_spend(
    current,
    Transaction {
      ..tx,
      inputs: [config_nft_input(current), ..list.drop(tx.inputs, 1)],
      outputs: [config_nft_output(base_config()), ..list.drop(tx.outputs, 1)],
    },
  )
}

// The encoding the API reproduces: apps/api/test/chain.blueprint.test.js pins
// the same bytes for its encodeConfigDatum (the preprod-shaped fee option).

test config_datum_vector() {
  cbor.serialise(base_config()) == #"d8799f9f581c51515151515151515151515151515151515151515151515151515151ff9f581ca1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1581ca2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2581ca3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3ff02d879809fd8799f40409f1a000f42401a001e84801a003d0900ff9f9fd8799fd87a9f581c7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7effd87a80ff01ffffffffff"
}
