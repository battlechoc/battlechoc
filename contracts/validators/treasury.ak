//// The battlechoc treasury: the fee of a mint is a plain ADA output to this
//// script's address, without a datum. In this version only the admins can
//// spend it: `threshold` of the config's `admins` sign, the config read from
//// a reference input. Seasons, prize pool and other assets are a later plan.

use aiken/collection/list
use battlechoc/fixtures.{
  admin_a, admin_b, admin_c, base_config, config_nft_input, config_nft_output,
  config_policy, config_ref, other_policy, owner_key, script_address, server_1,
  treasury_ref, valid_treasury_spend_tx,
}
use battlechoc/rules.{count_signed, find_config}
use battlechoc/types.{ConfigDatum, config_token_name}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}

validator treasury(config_policy: PolicyId) {
  /// Any output at the treasury, with or without a datum: `threshold`
  /// distinct admins of the config (a reference input) signed.
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(config) = find_config(self.reference_inputs, config_policy)
    count_signed(config.admins, self.extra_signatories) >= config.threshold
  }

  else(_) {
    fail
  }
}

// Tests

fn run_spend(datum: Option<Data>, tx: Transaction) -> Bool {
  treasury.spend(config_policy, datum, Void, treasury_ref, tx)
}

test treasury_spend_with_threshold_ok() {
  // an output someone paid with a datum is spendable as well
  let tx = valid_treasury_spend_tx()
  expect [fee_input] = tx.inputs
  let datum: Data = "a fee with a datum"
  let with_datum = Input {
    ..fee_input,
    output: Output { ..fee_input.output, datum: InlineDatum(datum) },
  }
  run_spend(Some(datum), Transaction { ..tx, inputs: [with_datum] })
}

test treasury_spend_without_datum_ok() {
  // the fee outputs a mint pays have no datum
  run_spend(None, valid_treasury_spend_tx())
}

test treasury_spend_by_all_admins_ok() {
  run_spend(
    None,
    Transaction {
      ..valid_treasury_spend_tx(),
      extra_signatories: [admin_a, admin_b, admin_c],
    },
  )
}

test treasury_spend_without_admin_signature_fails() fail {
  run_spend(
    None,
    Transaction { ..valid_treasury_spend_tx(), extra_signatories: [] },
  )
}

test treasury_spend_below_threshold_fails() fail {
  run_spend(
    None,
    Transaction { ..valid_treasury_spend_tx(), extra_signatories: [admin_b] },
  )
}

test treasury_duplicate_admin_counts_once() fail {
  let config = ConfigDatum {
    ..base_config(),
    admins: [admin_a, admin_a, admin_b],
  }
  run_spend(
    None,
    Transaction {
      ..valid_treasury_spend_tx(),
      reference_inputs: [config_nft_input(config)],
      extra_signatories: [admin_a],
    },
  )
}

test treasury_spend_without_config_reference_fails() fail {
  run_spend(
    None,
    Transaction { ..valid_treasury_spend_tx(), reference_inputs: [] },
  )
}

test treasury_spend_with_wrong_config_reference_fails() fail {
  // the same datum and NFT name, but under another policy at another script
  let look_alike = Input {
    output_reference: config_ref,
    output: Output {
      ..config_nft_output(base_config()),
      address: script_address(other_policy),
      value: assets.from_lovelace(2_000_000)
        |> assets.add(other_policy, config_token_name, 1),
    },
  }
  run_spend(
    None,
    Transaction { ..valid_treasury_spend_tx(), reference_inputs: [look_alike] },
  )
}

test treasury_spend_with_config_spent_not_referenced_fails() fail {
  let tx = valid_treasury_spend_tx()
  run_spend(
    None,
    Transaction {
      ..tx,
      inputs: list.concat(tx.inputs, tx.reference_inputs),
      reference_inputs: [],
    },
  )
}

test treasury_server_key_cannot_spend_fails() fail {
  run_spend(
    None,
    Transaction { ..valid_treasury_spend_tx(), extra_signatories: [server_1] },
  )
}

test treasury_spend_with_one_admin_and_others_fails() fail {
  // only admin signatures count towards the threshold
  run_spend(
    None,
    Transaction {
      ..valid_treasury_spend_tx(),
      extra_signatories: [admin_a, server_1, owner_key],
    },
  )
}
