//// Pure predicates the validators share: what a well-formed config is, who
//// signed, and where the config NFT is in a transaction.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use battlechoc/fixtures.{
  admin_a, admin_b, admin_c, base_config, config_nft_input, config_policy,
  other_policy, server_1, server_2,
}
use battlechoc/types.{ConfigDatum, FeeOption, config_token_name, tiers}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Input, Output}

/// A config datum the validators can rely on: at least one server key, at
/// least one admin, every key 28 bytes, `1 <= threshold <= ` the number of
/// distinct admins (so `admins` is never empty), and every fee option well
/// formed. `fees` may be empty: then there is no fee.
pub fn well_formed_config(d: ConfigDatum) -> Bool {
  and {
    d.server_keys != [],
    list.all(d.server_keys, is_key_hash),
    list.all(d.admins, is_key_hash),
    d.threshold >= 1,
    d.threshold <= list.length(list.unique(d.admins)),
    list.all(d.fees, well_formed_fee),
  }
}

/// One amount per tier, none negative; at least one receiver, every share
/// positive, no receiver address twice; ADA is the empty policy with the
/// empty name.
fn well_formed_fee(fee: FeeOption) -> Bool {
  let addresses = list.map(fee.receivers, fn(receiver) { receiver.1st })
  and {
    list.length(fee.amounts) == tiers,
    list.all(fee.amounts, fn(amount) { amount >= 0 }),
    fee.receivers != [],
    list.all(fee.receivers, fn(receiver) { receiver.2nd > 0 }),
    list.length(list.unique(addresses)) == list.length(addresses),
    fee.policy != #"" || fee.name == #"",
  }
}

fn is_key_hash(key: VerificationKeyHash) -> Bool {
  bytearray.length(key) == 28
}

/// How many distinct `keys` signed: a key listed twice counts once.
pub fn count_signed(
  keys: List<VerificationKeyHash>,
  signatories: List<VerificationKeyHash>,
) -> Int {
  list.unique(keys) |> list.count(fn(key) { list.has(signatories, key) })
}

/// Whether at least one of `keys` signed.
pub fn signed_by_any(
  keys: List<VerificationKeyHash>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  list.any(keys, fn(key) { list.has(signatories, key) })
}

/// The datum of the output that holds the config NFT, if that output is at
/// the config's own script address (`Script(own_policy)`, any stake part) and
/// its datum is inline and well formed. An inline datum that is not a
/// `ConfigDatum` fails the script.
pub fn config_output(
  outputs: List<Output>,
  own_policy: PolicyId,
) -> Option<ConfigDatum> {
  let holds_nft = fn(output: Output) {
    assets.quantity_of(output.value, own_policy, config_token_name) == 1
  }
  when list.find(outputs, holds_nft) is {
    Some(Output { address, datum: InlineDatum(data), .. }) ->
      if address.payment_credential == Script(own_policy) {
        expect d: ConfigDatum = data
        if well_formed_config(d) {
          Some(d)
        } else {
          None
        }
      } else {
        None
      }
    _ -> None
  }
}

/// The config datum from the reference input that holds the config NFT of
/// `config_policy`. The NFT is unique and the config validator keeps it at
/// its own address with a well-formed datum, so holding it is enough.
pub fn find_config(
  reference_inputs: List<Input>,
  config_policy: PolicyId,
) -> Option<ConfigDatum> {
  when
    list.find(
      reference_inputs,
      fn(input) {
        assets.quantity_of(input.output.value, config_policy, config_token_name) == 1
      },
    )
  is {
    Some(Input { output: Output { datum: InlineDatum(data), .. }, .. }) -> {
      expect d: ConfigDatum = data
      Some(d)
    }
    _ -> None
  }
}

// Tests

test well_formed_config_accepts_the_base_config() {
  well_formed_config(base_config())
}

test well_formed_config_accepts_threshold_equal_to_unique_admins() {
  well_formed_config(
    ConfigDatum {
      ..base_config(),
      admins: [admin_a, admin_b, admin_a],
      threshold: 2,
    },
  )
}

test well_formed_config_accepts_no_fees() {
  well_formed_config(ConfigDatum { ..base_config(), fees: [] })
}

test count_signed_counts_signing_keys() {
  and {
    count_signed([admin_a, admin_b, admin_c], [admin_a, admin_c]) == 2,
    count_signed([admin_a, admin_b, admin_c], []) == 0,
    count_signed([], [admin_a]) == 0,
  }
}

test count_signed_counts_a_key_listed_twice_once() {
  count_signed([admin_a, admin_a, admin_b], [admin_a]) == 1
}

test count_signed_ignores_other_signers() {
  count_signed([admin_a, admin_b], [server_1, admin_b, server_2]) == 1
}

test signed_by_any_needs_one_of_the_keys() {
  and {
    signed_by_any([server_1, server_2], [admin_a, server_2]),
    !signed_by_any([server_1, server_2], [admin_a, admin_b]),
    !signed_by_any([], [admin_a]),
  }
}

test find_config_reads_the_nft_holder() {
  find_config([config_nft_input(base_config())], config_policy) == Some(
    base_config(),
  )
}

test find_config_ignores_other_policies() {
  find_config([config_nft_input(base_config())], other_policy) == None
}

test find_config_without_reference_inputs_is_none() {
  find_config([], config_policy) == None
}
