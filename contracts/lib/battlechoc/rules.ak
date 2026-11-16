//// Pure predicates the validators share: what a well-formed config is, who
//// signed, where the config NFT is in a transaction, what an item mint
//// mints and where its tokens go, the battlechoc fee, and what a burn burns.

use aiken/collection/dict.{Dict}
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use battlechoc/fixtures.{
  ada_fee, admin_a, admin_b, admin_c, base_config, config_nft_input,
  config_policy, item_suffix, other_policy, pot_address, server_1, server_2,
  team_address, treasury_address,
}
use battlechoc/names.{reference_name, split_name, user_name}
use battlechoc/types.{
  Cip68Datum, ConfigDatum, FeeOption, config_token_name, tiers,
}
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{Datum, InlineDatum, Input, Output}

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

/// Whether `tokens` (what is minted under the items policy) is exactly the
/// pair of `suffix`: its reference token and its user token, one each.
pub fn minted_exactly_pair(
  tokens: Dict<AssetName, Int>,
  suffix: ByteArray,
) -> Bool {
  // a dict is sorted by key: label 100 (000643b0) before label 222 (000de140)
  dict.to_pairs(tokens) == [
    Pair(reference_name(suffix), 1),
    Pair(user_name(suffix), 1),
  ]
}

/// Whether an output whose payment credential is `owner`'s key (any stake
/// part) holds exactly one `name` of `own_policy`.
pub fn pays_user_token_to(
  outputs: List<Output>,
  owner: VerificationKeyHash,
  own_policy: PolicyId,
  name: AssetName,
) -> Bool {
  list.any(
    outputs,
    fn(output) {
      and {
        output.address.payment_credential == VerificationKey(owner),
        assets.quantity_of(output.value, own_policy, name) == 1,
      }
    },
  )
}

/// A CIP-68 version 1 datum, inline, whose metadata has a byte-string `name`
/// and a byte-string `image`.
pub fn well_formed_cip68(datum: Datum) -> Bool {
  when datum is {
    InlineDatum(data) ->
      if data is Cip68Datum {
        and {
          data.version == 1,
          has_bytes(data.metadata, "name"),
          has_bytes(data.metadata, "image"),
        }
      } else {
        False
      }
    _ -> False
  }
}

fn has_bytes(metadata: Pairs<ByteArray, Data>, key: ByteArray) -> Bool {
  when pairs.get_first(metadata, key) is {
    Some(value) ->
      if value is ByteArray {
        True
      } else {
        False
      }
    None -> False
  }
}

/// Whether exactly one output at the own script address (`Script(own_policy)`,
/// any stake part) holds the reference token `name`, with a well-formed
/// CIP-68 datum.
pub fn locks_reference_token(
  outputs: List<Output>,
  own_policy: PolicyId,
  name: AssetName,
) -> Bool {
  let locked = list.filter(
    outputs,
    fn(output) {
      and {
        output.address.payment_credential == Script(own_policy),
        assets.quantity_of(output.value, own_policy, name) == 1,
      }
    },
  )
  when locked is {
    [output] -> well_formed_cip68(output.datum)
    _ -> False
  }
}

/// Whether `tokens` (what is minted under the items policy) burns whole pairs
/// only: something, every quantity -1, every name an item's name (label 100
/// or 222 and a suffix), and for each suffix both of its names.
pub fn burns_in_pairs(tokens: Dict<AssetName, Int>) -> Bool {
  and {
    !dict.is_empty(tokens),
    list.all(dict.values(tokens), fn(quantity) { quantity == -1 }),
    list.all(
      dict.keys(tokens),
      fn(name) {
        when split_name(name) is {
          Some((_, s)) -> and {
              dict.has_key(tokens, reference_name(s)),
              dict.has_key(tokens, user_name(s)),
            }
          None -> False
        }
      },
    ),
  }
}

/// What each receiver of `option` is due for an item of `tier`: the floor of
/// its share of `amounts[tier]`, and the first receiver also gets what the
/// floors leave over, so the dues add up to the amount. `None` for a tier
/// outside `0..2` and for an option without receivers.
pub fn fee_due(option: FeeOption, tier: Int) -> Option<List<(Address, Int)>> {
  if tier < 0 || tier >= tiers {
    None
  } else {
    when (list.at(option.amounts, tier), option.receivers) is {
      (Some(amount), [(first, _), ..others]) -> {
        let total = list.foldl(option.receivers, 0, fn(r, sum) { sum + r.2nd })
        let others_due = list.map(
          others,
          fn(r) { (r.1st, amount * r.2nd / total) },
        )
        let first_due = amount - list.foldl(
          others_due,
          0,
          fn(due, sum) { sum + due.2nd },
        )
        Some([(first, first_due), ..others_due])
      }
      _ -> None
    }
  }
}

/// Whether the outputs pay every receiver of `option` its due for `tier`:
/// summed over the outputs at the receiver's exact address, the quantity of
/// the option's asset (for ADA, the lovelace) is at least the due.
pub fn fee_paid(outputs: List<Output>, option: FeeOption, tier: Int) -> Bool {
  when fee_due(option, tier) is {
    Some(dues) ->
      list.all(
        dues,
        fn(due) {
          let (receiver, amount) = due
          let paid = list.foldl(
            outputs,
            0,
            fn(output, sum) {
              if output.address == receiver {
                sum + assets.quantity_of(
                  output.value,
                  option.policy,
                  option.name,
                )
              } else {
                sum
              }
            },
          )
          paid >= amount
        },
      )
    None -> False
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

test fee_due_gives_the_remainder_to_the_first_receiver() {
  let option = FeeOption {
    ..ada_fee(),
    amounts: [1_000_000, 2_000_000, 4_000_000],
    receivers: [(treasury_address, 1), (pot_address, 1), (team_address, 1)],
  }
  fee_due(option, 0) == Some(
    [
      (treasury_address, 333_334), (pot_address, 333_333),
      (team_address, 333_333),
    ],
  )
}

test fee_due_refuses_a_tier_outside_0_to_2() {
  // even when an option has more amounts than tiers
  let option = FeeOption { ..ada_fee(), amounts: [1, 2, 4, 8] }
  and {
    fee_due(option, 3) == None,
    fee_due(option, -1) == None,
    fee_due(option, 2) == Some([(treasury_address, 4)]),
  }
}

test fee_due_without_receivers_is_none() {
  fee_due(FeeOption { ..ada_fee(), receivers: [] }, 1) == None
}

test fee_paid_refuses_a_tier_outside_0_to_2() {
  let option = FeeOption { ..ada_fee(), amounts: [1, 2, 4, 8] }
  let paid = [fixtures.fee_output(treasury_address, 10)]
  and {
    !fee_paid(paid, option, 3),
    !fee_paid(paid, option, -1),
    fee_paid(paid, option, 2),
  }
}

test burns_in_pairs_refuses_nothing() {
  !burns_in_pairs(dict.empty)
}

test burns_in_pairs_accepts_one_pair() {
  burns_in_pairs(
    dict.empty
      |> dict.insert(reference_name(item_suffix()), -1)
      |> dict.insert(user_name(item_suffix()), -1),
  )
}
