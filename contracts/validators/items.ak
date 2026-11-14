//// The items policy: an item is a CIP-68 pair under this policy, a reference
//// token (label 100) locked at this same script's address with the item's
//// metadata, and a user token (label 222) in the player's wallet. Both names
//// end with the suffix of a seed the mint spends, so every pair is unique.
//// A mint needs the server's signature (it vouches for the item and its
//// tier) and the owner's, and pays the battlechoc fee the config names.
//// Salvaging burns whole pairs, by the holder alone: no config, no server,
//// no fee. A reference token leaves this address only burned, so an item's
//// metadata never changes.

use aiken/collection/dict.{Dict}
use aiken/collection/list
use aiken/collection/pairs
use aiken/fuzz
use aiken/primitive/bytearray
use battlechoc/fixtures.{
  ada_fee, admin_a, choc_policy, config_nft_input, config_nft_output,
  config_policy, config_ref, fee_output, held_user_input, item_cip68_datum,
  item_config, item_metadata, item_mint_redeemer, item_reference_name,
  item_reference_output, item_reference_ref, item_seed, item_suffix,
  item_user_name, item_user_output, item_user_ref, items_policy, key_address,
  other_policy, owner_key, pot_address, script_address, server_1, server_2,
  split_fee_config, stake_key, stored_reference_input, team_address,
  treasury_address, valid_item_burn_tx, valid_item_mint_tx, wallet_output,
}
use battlechoc/names.{reference_name, split_name, suffix, user_name}
use battlechoc/rules.{
  burns_in_pairs, fee_due, fee_paid, find_config, locks_reference_token,
  minted_exactly_pair, pays_user_token_to, signed_by_any,
}
use battlechoc/types.{
  BurnItems, Cip68Datum, ConfigDatum, FeeOption, ItemAction, MintItem,
  config_token_name, reference_label, tiers, user_label,
}
use cardano/address.{Address, Script}
use cardano/assets.{AssetName, Assets, PolicyId}
use cardano/transaction.{
  DatumHash, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}

validator items(config_policy: PolicyId) {
  mint(redeemer: ItemAction, own_policy: PolicyId, self: Transaction) {
    when redeemer is {
      MintItem { seed, owner, tier, fee } -> {
        // IM1: the config from a reference input
        expect Some(config) = find_config(self.reference_inputs, config_policy)
        let item = suffix(seed)
        and {
          // IM2: not paused
          !config.paused,
          // IM3: the seed is spent, so the pair's names are new
          list.any(self.inputs, fn(input) { input.output_reference == seed }),
          // IM4: exactly the pair, one each (no burn under the policy either)
          minted_exactly_pair(assets.tokens(self.mint, own_policy), item),
          // IM5: one of the server keys signed
          signed_by_any(config.server_keys, self.extra_signatories),
          // IM6: the owner signed
          list.has(self.extra_signatories, owner),
          // IM7: the user token to the owner's payment key
          pays_user_token_to(self.outputs, owner, own_policy, user_name(item)),
          // IM8: the reference token at the own address, CIP-68 inline datum
          locks_reference_token(self.outputs, own_policy, reference_name(item)),
          // IM9: a tier the fee amounts know, with or without fees
          tier >= 0,
          tier < tiers,
          // IM10: the battlechoc fee, unless there is none
          when config.fees is {
            [] -> True
            fees ->
              when list.at(fees, fee) is {
                Some(option) -> fee_paid(self.outputs, option, tier)
                None -> False
              }
          },
        }
      }
      // IB1, IB2: whole pairs only, nothing else (no config, no signature:
      // the holder spends the user token anyway)
      BurnItems -> burns_in_pairs(assets.tokens(self.mint, own_policy))
    }
  }

  /// The reference tokens' store: a reference token leaves it only burned,
  /// so its metadata never changes. Where the ADA goes is free.
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(store) = transaction.find_input(self.inputs, own_ref)
    // the own policy is the store's script, whatever its stake part
    expect Script(own_policy) = store.output.address.payment_credential
    // IS1: the store holds exactly one token of the own policy, a reference
    // token
    expect [Pair(name, 1)] = dict.to_pairs(
      assets.tokens(store.output.value, own_policy),
    )
    expect Some((label, _)) = split_name(name)
    and {
      label == reference_label,
      // IS2: it is burned here, and the policy, which then runs, burns whole
      // pairs only
      assets.quantity_of(self.mint, own_policy, name) == -1,
    }
  }

  else(_) {
    fail
  }
}

// Tests

fn run_mint(redeemer: ItemAction, tx: Transaction) -> Bool {
  items.mint(config_policy, redeemer, items_policy, tx)
}

/// The valid mint's redeemer (seed and owner) with `tier` and `fee`.
fn redeemer(tier: Int, fee: Int) -> ItemAction {
  MintItem { seed: item_seed, owner: owner_key, tier, fee }
}

/// The valid mint's redeemer with `tx`.
fn mint_tx(tx: Transaction) -> Bool {
  run_mint(item_mint_redeemer(), tx)
}

/// The valid mint with `mint` as what it mints.
fn minting(mint: Assets) -> Bool {
  mint_tx(Transaction { ..valid_item_mint_tx(), mint })
}

/// The valid mint with `extra_signatories`.
fn signed_by(signatories: List<ByteArray>) -> Bool {
  mint_tx(
    Transaction { ..valid_item_mint_tx(), extra_signatories: signatories },
  )
}

/// The valid mint's reference and user outputs.
fn locked_reference() -> Output {
  item_reference_output(InlineDatum(item_cip68_datum()))
}

fn owner_user_output() -> Output {
  item_user_output(key_address(owner_key))
}

/// A mint of `redeemer` against `config` whose outputs are the valid
/// reference and user outputs followed by `payments`.
fn mint_paying(
  config: ConfigDatum,
  redeemer: ItemAction,
  payments: List<Output>,
) -> Bool {
  run_mint(
    redeemer,
    Transaction {
      ..valid_item_mint_tx(),
      reference_inputs: [config_nft_input(config)],
      outputs: [locked_reference(), owner_user_output(), ..payments],
    },
  )
}

/// The valid mint (RARE, option 0 of `item_config`) with `payments`.
fn mint_rare_paying(payments: List<Output>) -> Bool {
  mint_paying(item_config(), item_mint_redeemer(), payments)
}

/// The valid mint with `outputs`.
fn with_outputs(outputs: List<Output>) -> Bool {
  mint_tx(Transaction { ..valid_item_mint_tx(), outputs })
}

/// The valid mint's fee to the treasury and the owner's change.
fn fee_and_change() -> List<Output> {
  [fee_output(treasury_address, 2_000_000), wallet_output(owner_key, 4_300_000)]
}

/// The valid mint with `reference` as the reference token's output.
fn with_reference(reference: Output) -> Bool {
  with_outputs([reference, owner_user_output(), ..fee_and_change()])
}

/// The valid mint with `user` as the user token's output (the owner's change,
/// an output at the owner's key without the token, stays).
fn with_user(user: Output) -> Bool {
  with_outputs([locked_reference(), user, ..fee_and_change()])
}

/// The valid mint with the reference token's metadata replaced.
fn with_metadata(metadata: Pairs<ByteArray, Data>) -> Bool {
  with_reference(
    item_reference_output(
      InlineDatum(Cip68Datum { ..item_cip68_datum(), metadata }),
    ),
  )
}

/// The pair of `s` as a mint value, with the given quantities.
fn pair_of(s: ByteArray, reference_quantity: Int, user_quantity: Int) -> Assets {
  assets.from_asset(items_policy, reference_name(s), reference_quantity)
    |> assets.add(items_policy, user_name(s), user_quantity)
}

/// The valid mint with the config's tier `tier` and no fees.
fn mint_tier_without_fees(tier: Int) -> Bool {
  mint_paying(ConfigDatum { ..item_config(), fees: [] }, redeemer(tier, 0), [])
}

// Happy paths

test mint_ok() {
  mint_tx(valid_item_mint_tx())
}

test mint_with_second_server_key_ok() {
  signed_by([server_2, owner_key])
}

test mint_user_token_to_owner_with_stake_ok() {
  with_user(
    item_user_output(
      key_address(owner_key) |> address.with_delegation_key(stake_key),
    ),
  )
}

// IM1: the config from a reference input

test mint_without_config_fails() fail {
  mint_tx(Transaction { ..valid_item_mint_tx(), reference_inputs: [] })
}

test mint_with_config_spent_not_referenced_fails() fail {
  let tx = valid_item_mint_tx()
  mint_tx(
    Transaction {
      ..tx,
      inputs: list.concat(tx.inputs, tx.reference_inputs),
      reference_inputs: [],
    },
  )
}

test mint_with_fake_config_fails() fail {
  // the same datum and NFT name, but under another policy at another script
  let look_alike = Input {
    output_reference: config_ref,
    output: Output {
      ..config_nft_output(item_config()),
      address: script_address(other_policy),
      value: assets.from_lovelace(2_000_000)
        |> assets.add(other_policy, config_token_name, 1),
    },
  }
  mint_tx(
    Transaction { ..valid_item_mint_tx(), reference_inputs: [look_alike] },
  )
}

// IM2: not paused

test mint_while_paused_fails() fail {
  mint_tx(
    Transaction {
      ..valid_item_mint_tx(),
      reference_inputs: [
        config_nft_input(ConfigDatum { ..item_config(), paused: True }),
      ],
    },
  )
}

// IM3: the seed is spent

test mint_without_seed_input_fails() fail {
  // the seed is only referenced; another UTxO of the owner is spent
  let tx = valid_item_mint_tx()
  let other_input = Input {
    output_reference: OutputReference { ..item_seed, output_index: 3 },
    output: wallet_output(owner_key, 10_000_000),
  }
  mint_tx(
    Transaction {
      ..tx,
      inputs: [other_input],
      reference_inputs: list.concat(tx.reference_inputs, tx.inputs),
    },
  )
}

// IM4: exactly the pair, one each

test mint_wrong_suffix_fails() fail {
  let other_seed = OutputReference { ..item_seed, output_index: 3 }
  minting(pair_of(suffix(other_seed), 1, 1))
}

test mint_only_user_token_fails() fail {
  minting(assets.from_asset(items_policy, item_user_name(), 1))
}

test mint_only_reference_token_fails() fail {
  minting(assets.from_asset(items_policy, item_reference_name(), 1))
}

test mint_extra_token_fails() fail {
  minting(pair_of(item_suffix(), 1, 1) |> assets.add(items_policy, "extra", 1))
}

test mint_quantity_two_fails() fail {
  minting(pair_of(item_suffix(), 1, 2))
}

test mint_labels_swapped_fails() fail {
  // label and suffix in the wrong order: suffix ‖ label
  let s = item_suffix()
  minting(
    assets.from_asset(items_policy, bytearray.concat(s, reference_label), 1)
      |> assets.add(items_policy, bytearray.concat(s, user_label), 1),
  )
}

// IM5: one of `server_keys` signed

test mint_without_server_signature_fails() fail {
  signed_by([owner_key])
}

test mint_with_removed_server_key_fails() fail {
  // server_1 still signs, but the config no longer lists it
  mint_tx(
    Transaction {
      ..valid_item_mint_tx(),
      reference_inputs: [
        config_nft_input(
          ConfigDatum { ..item_config(), server_keys: [server_2] },
        ),
      ],
    },
  )
}

// IM6: `owner` signed

test mint_without_owner_signature_fails() fail {
  signed_by([server_1])
}

// IM7: the user token to `owner`'s payment key

test mint_user_token_to_other_key_fails() fail {
  with_user(item_user_output(key_address(admin_a)))
}

test mint_user_token_to_script_with_owner_hash_fails() fail {
  with_user(item_user_output(script_address(owner_key)))
}

// IM8: the reference token at the own address, with a CIP-68 inline datum

test mint_reference_token_to_key_address_fails() fail {
  with_reference(
    Output { ..locked_reference(), address: key_address(owner_key) },
  )
}

test mint_reference_token_to_other_script_fails() fail {
  with_reference(
    Output { ..locked_reference(), address: script_address(other_policy) },
  )
}

test mint_reference_token_twice_locked_fails() fail {
  with_outputs(
    [
      locked_reference(),
      locked_reference(),
      owner_user_output(),
      ..fee_and_change()
    ],
  )
}

test mint_reference_token_not_with_the_datum_fails() fail {
  // a well-formed datum at the own address, but the token in the wallet
  let datum_without_token = Output {
    ..locked_reference(),
    value: assets.from_lovelace(2_000_000),
  }
  let token_in_wallet = Output {
    ..locked_reference(),
    address: key_address(owner_key),
  }
  with_outputs(
    [
      datum_without_token,
      token_in_wallet,
      owner_user_output(),
      ..fee_and_change()
    ],
  )
}

test mint_reference_without_datum_fails() fail {
  with_reference(item_reference_output(NoDatum))
}

test mint_reference_datum_hash_fails() fail {
  with_reference(
    item_reference_output(
      DatumHash(
        #"d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
      ),
    ),
  )
}

test mint_reference_version_two_fails() fail {
  with_reference(
    item_reference_output(
      InlineDatum(Cip68Datum { ..item_cip68_datum(), version: 2 }),
    ),
  )
}

test mint_reference_not_cip68_fails() fail {
  // the metadata alone, without the CIP-68 wrapper
  with_reference(item_reference_output(InlineDatum(item_metadata())))
}

test mint_reference_without_name_fails() fail {
  with_metadata(pairs.delete_all(item_metadata(), "name"))
}

test mint_reference_without_image_fails() fail {
  with_metadata(pairs.delete_all(item_metadata(), "image"))
}

test mint_reference_name_not_bytes_fails() fail {
  let seven: Data = 7
  with_metadata(
    [Pair("name", seven), ..pairs.delete_all(item_metadata(), "name")],
  )
}

test mint_reference_image_not_bytes_fails() fail {
  let seven: Data = 7
  with_metadata(
    [Pair("image", seven), ..pairs.delete_all(item_metadata(), "image")],
  )
}

// IM9: `tier` in 0..2, also without fees (with fees, `fee_due` would refuse
// the tier as well and hide the rule)

test mint_tier_three_fails() fail {
  mint_tier_without_fees(3)
}

test mint_tier_negative_fails() fail {
  mint_tier_without_fees(-1)
}

test mint_tier_epic_without_fees_ok() {
  mint_tier_without_fees(2)
}

// IM10: the battlechoc fee

test mint_without_fee_output_fails() fail {
  mint_rare_paying([])
}

test mint_fee_too_little_fails() fail {
  mint_rare_paying([fee_output(treasury_address, 1_990_000)])
}

test mint_fee_to_wrong_receiver_fails() fail {
  mint_rare_paying([fee_output(key_address(admin_a), 2_000_000)])
}

test mint_fee_to_treasury_with_stake_part_fails() fail {
  // the treasury's script, but someone else's stake key: not its address
  mint_rare_paying(
    [
      fee_output(
        treasury_address |> address.with_delegation_key(stake_key),
        2_000_000,
      ),
    ],
  )
}

test mint_fee_for_lower_tier_fails() fail {
  // the COMMON fee for a RARE item
  mint_rare_paying([fee_output(treasury_address, 1_000_000)])
}

test mint_fee_index_out_of_range_fails() fail {
  mint_paying(
    item_config(),
    redeemer(1, 1),
    [fee_output(treasury_address, 2_000_000)],
  )
}

test mint_fee_index_negative_fails() fail {
  mint_paying(
    item_config(),
    redeemer(1, -1),
    [fee_output(treasury_address, 2_000_000)],
  )
}

test mint_fee_split_over_two_receivers_ok() {
  // EPIC: 9:1 of 4 ADA
  mint_paying(
    split_fee_config(),
    redeemer(2, 0),
    [fee_output(pot_address, 3_600_000), fee_output(team_address, 400_000)],
  )
}

test mint_fee_split_short_by_one_lovelace_fails() fail {
  mint_paying(
    split_fee_config(),
    redeemer(2, 0),
    [fee_output(pot_address, 3_600_000), fee_output(team_address, 399_999)],
  )
}

test mint_fee_more_than_due_ok() {
  mint_rare_paying([fee_output(treasury_address, 5_000_000)])
}

test mint_fee_over_two_outputs_ok() {
  mint_rare_paying(
    [
      fee_output(treasury_address, 1_500_000),
      fee_output(treasury_address, 500_000),
    ],
  )
}

test mint_with_empty_fees_needs_no_payment_ok() {
  // any `fee` index then
  mint_paying(ConfigDatum { ..item_config(), fees: [] }, redeemer(1, 7), [])
}

test mint_fee_in_a_token_ok() {
  // option 1 asks for 20 CHOC for a RARE item; the output's 1.5 ADA would
  // not pay option 0
  let choc_fee = FeeOption {
    policy: choc_policy,
    name: "CHOC",
    amounts: [10, 20, 40],
    receivers: [(treasury_address, 1)],
  }
  mint_paying(
    ConfigDatum { ..item_config(), fees: [ada_fee(), choc_fee] },
    redeemer(1, 1),
    [
      Output {
        ..fee_output(treasury_address, 1_500_000),
        value: assets.from_lovelace(1_500_000)
          |> assets.add(choc_policy, "CHOC", 20),
      },
    ],
  )
}

test mint_fee_token_option_paid_in_ada_fails() fail {
  // option 1 asks for 20 CHOC; 2 ADA do not pay it
  let choc_fee = FeeOption {
    policy: choc_policy,
    name: "CHOC",
    amounts: [10, 20, 40],
    receivers: [(treasury_address, 1)],
  }
  mint_paying(
    ConfigDatum { ..item_config(), fees: [ada_fee(), choc_fee] },
    redeemer(1, 1),
    [fee_output(treasury_address, 2_000_000)],
  )
}

// Properties: only the pair

test prop_mint_rejects_any_extra_token(name via fuzz.bytearray_between(0, 32)) {
  let s = item_suffix()
  let tokens = dict.empty
    |> dict.insert(reference_name(s), 1)
    |> dict.insert(user_name(s), 1)
    |> dict.insert(name, 1)
  if name == reference_name(s) || name == user_name(s) {
    minted_exactly_pair(tokens, s)
  } else {
    !minted_exactly_pair(tokens, s)
  }
}

test prop_mint_rejects_other_quantities(q via fuzz.int_between(-5, 5)) {
  let s = item_suffix()
  let with_reference = fn(quantity) {
    dict.empty
      |> dict.insert(reference_name(s), quantity)
      |> dict.insert(user_name(s), 1)
  }
  let with_user = fn(quantity) {
    dict.empty
      |> dict.insert(reference_name(s), 1)
      |> dict.insert(user_name(s), quantity)
  }
  if q == 1 {
    minted_exactly_pair(with_reference(q), s) && minted_exactly_pair(
      with_user(q),
      s,
    )
  } else {
    !minted_exactly_pair(with_reference(q), s) && !minted_exactly_pair(
      with_user(q),
      s,
    )
  }
}

// Properties: shares

/// An ADA option of `amount` for every tier, one receiver per share, each at
/// its own address.
fn option_with_shares(amount: Int, shares: List<Int>) -> FeeOption {
  FeeOption {
    ..ada_fee(),
    amounts: [amount, amount, amount],
    receivers: list.indexed_map(
      shares,
      fn(i, share) {
        (key_address(bytearray.from_int_big_endian(i, 28)), share)
      },
    ),
  }
}

fn amount_and_shares() -> Fuzzer<(Int, List<Int>)> {
  fuzz.both(
    fuzz.int_between(0, 1_000_000_000),
    fuzz.list_between(fuzz.int_between(1, 100), 1, 5),
  )
}

test prop_fee_shares_add_up((amount, shares) via amount_and_shares()) {
  expect Some(dues) = fee_due(option_with_shares(amount, shares), 1)
  and {
    list.length(dues) == list.length(shares),
    list.foldl(dues, 0, fn(due, sum) { sum + due.2nd }) == amount,
    list.all(dues, fn(due) { due.2nd >= 0 }),
  }
}

test prop_fee_one_lovelace_short_fails(
  (amount, shares, short) via fuzz.tuple3(
    fuzz.int_between(0, 1_000_000_000),
    fuzz.list_between(fuzz.int_between(1, 100), 1, 5),
    fuzz.int_between(0, 4),
  ),
) {
  let option = option_with_shares(amount, shares)
  expect Some(dues) = fee_due(option, 1)
  let short = short % list.length(dues)
  expect Some((_, short_due)) = list.at(dues, short)
  let pay = fn(i, due: (Address, Int)) {
    if i == short {
      fee_output(due.1st, due.2nd - 1)
    } else {
      fee_output(due.1st, due.2nd)
    }
  }
  let exact = list.map(dues, fn(due) { fee_output(due.1st, due.2nd) })
  and {
    fee_paid(exact, option, 1),
    short_due == 0 || !fee_paid(list.indexed_map(dues, pay), option, 1),
  }
}

// Burning: helpers

/// The whole burn `tx` passes: the policy with `BurnItems`, and the store's
/// spend for every input at the items script.
fn burn_tx(tx: Transaction) -> Bool {
  items.mint(config_policy, BurnItems, items_policy, tx) && list.all(
    tx.inputs,
    fn(input) {
      if input.output.address.payment_credential == Script(items_policy) {
        run_spend(input.output_reference, tx)
      } else {
        True
      }
    },
  )
}

/// The store's spend of the input at `own_ref`, with that input's datum.
fn run_spend(own_ref: OutputReference, tx: Transaction) -> Bool {
  expect Some(input) = transaction.find_input(tx.inputs, own_ref)
  let datum = when input.output.datum is {
    InlineDatum(data) -> Some(data)
    _ -> None
  }
  items.spend(config_policy, datum, Void, own_ref, tx)
}

/// The valid burn with `mint` as what it burns.
fn burning(mint: Assets) -> Bool {
  burn_tx(Transaction { ..valid_item_burn_tx(), mint })
}

/// The valid burn with `reference_inputs`.
fn burn_referencing(reference_inputs: List<Input>) -> Bool {
  burn_tx(Transaction { ..valid_item_burn_tx(), reference_inputs })
}

/// A second item, B, minted from another seed of the owner.
fn other_suffix() -> ByteArray {
  suffix(OutputReference { ..item_seed, output_index: 3 })
}

/// Where B's tokens sit.
const other_reference_ref =
  OutputReference { ..item_reference_ref, output_index: 5 }

const other_user_ref = OutputReference { ..item_user_ref, output_index: 6 }

fn other_store() -> Input {
  stored_reference_input(other_suffix(), other_reference_ref)
}

fn other_user() -> Input {
  held_user_input(other_suffix(), other_user_ref)
}

/// The valid burn's store and user inputs.
fn item_store() -> Input {
  stored_reference_input(item_suffix(), item_reference_ref)
}

fn item_user() -> Input {
  held_user_input(item_suffix(), item_user_ref)
}

/// The valid burn's store spent in `tx`.
fn spend_store(tx: Transaction) -> Bool {
  run_spend(item_reference_ref, tx)
}

/// The valid burn whose store, at `item_reference_ref`, holds `value`
/// instead, spent alone with `mint`.
fn spend_store_holding(value: Assets, mint: Assets) -> Bool {
  let store = Input {
    ..item_store(),
    output: Output { ..item_store().output, value },
  }
  spend_store(
    Transaction { ..valid_item_burn_tx(), inputs: [store, item_user()], mint },
  )
}

// Burning: happy paths

test burn_pair_ok() {
  burn_tx(valid_item_burn_tx())
}

test burn_two_pairs_ok() {
  let tx = valid_item_burn_tx()
  burn_tx(
    Transaction {
      ..tx,
      inputs: list.concat(tx.inputs, [other_store(), other_user()]),
      mint: assets.merge(tx.mint, pair_of(other_suffix(), -1, -1)),
    },
  )
}

test burn_without_config_ok() {
  burn_referencing([])
}

test burn_without_server_signature_ok() {
  // the config names the server keys; only the holder signs
  burn_tx(
    Transaction {
      ..valid_item_burn_tx(),
      reference_inputs: [config_nft_input(item_config())],
      extra_signatories: [owner_key],
    },
  )
}

test burn_while_paused_ok() {
  burn_referencing(
    [config_nft_input(ConfigDatum { ..item_config(), paused: True })],
  )
}

test burn_pays_no_fee_ok() {
  // a config with fees, and no output to the treasury
  burn_referencing([config_nft_input(item_config())])
}

test burn_store_with_stake_part_ok() {
  // the reference token may sit at the items script with any stake part
  let staked = Input {
    ..item_store(),
    output: Output {
      ..item_store().output,
      address: script_address(items_policy)
        |> address.with_delegation_key(stake_key),
    },
  }
  burn_tx(Transaction { ..valid_item_burn_tx(), inputs: [staked, item_user()] })
}

// IB1: every quantity negative

test burn_mixed_with_mint_fails() fail {
  // B's whole pair +1 beside A's burn: only the sign is wrong
  burning(
    pair_of(item_suffix(), -1, -1)
      |> assets.merge(pair_of(other_suffix(), 1, 1)),
  )
}

// IB2: in pairs, -1 each

test burn_only_user_token_fails() fail {
  burn_tx(
    Transaction {
      ..valid_item_burn_tx(),
      inputs: [item_user()],
      mint: assets.from_asset(items_policy, item_user_name(), -1),
    },
  )
}

test burn_only_reference_token_fails() fail {
  burn_tx(
    Transaction {
      ..valid_item_burn_tx(),
      inputs: [item_store()],
      mint: assets.from_asset(items_policy, item_reference_name(), -1),
    },
  )
}

test burn_quantity_minus_two_fails() fail {
  burning(pair_of(item_suffix(), -1, -2))
}

test burn_unknown_label_fails() fail {
  // label 333 with A's suffix, beside A's whole pair
  burning(
    pair_of(item_suffix(), -1, -1)
      |> assets.add(
          items_policy,
          bytearray.concat(#"0014df10", item_suffix()),
          -1,
        ),
  )
}

test burn_halves_of_two_items_fails() fail {
  // A's reference token and B's user token
  burn_tx(
    Transaction {
      ..valid_item_burn_tx(),
      inputs: [item_store(), other_user()],
      mint: assets.from_asset(items_policy, item_reference_name(), -1)
        |> assets.add(items_policy, user_name(other_suffix()), -1),
    },
  )
}

// IS1: the spent store holds a reference token

test spend_input_without_reference_token_fails() fail {
  // ADA someone paid to the items address, spent beside the valid burn
  let paid = Input {
    output_reference: OutputReference { ..item_reference_ref, output_index: 7 },
    output: Output {
      ..item_store().output,
      value: assets.from_lovelace(5_000_000),
      datum: NoDatum,
    },
  }
  let tx = valid_item_burn_tx()
  run_spend(
    paid.output_reference,
    Transaction { ..tx, inputs: [paid, ..tx.inputs] },
  )
}

test spend_store_holding_a_user_token_fails() fail {
  // A's user token sent to the items address, burned with A's pair
  spend_store_holding(
    assets.from_lovelace(2_000_000)
      |> assets.add(items_policy, item_user_name(), 1),
    pair_of(item_suffix(), -1, -1),
  )
}

/// A store holding A's and B's reference tokens: burning one pair would free
/// the other reference token. Both ways round, so that neither the first nor
/// the last token of the store can stand for all of them.
fn spend_store_of_two_burning(s: ByteArray) -> Bool {
  spend_store_holding(
    item_store().output.value
      |> assets.add(items_policy, reference_name(other_suffix()), 1),
    pair_of(s, -1, -1),
  )
}

test spend_store_of_two_reference_tokens_burning_a_fails() fail {
  spend_store_of_two_burning(item_suffix())
}

test spend_store_of_two_reference_tokens_burning_b_fails() fail {
  spend_store_of_two_burning(other_suffix())
}

test spend_store_holding_the_reference_token_twice_fails() fail {
  spend_store_holding(
    assets.from_lovelace(2_000_000)
      |> assets.add(items_policy, item_reference_name(), 2),
    pair_of(item_suffix(), -1, -1),
  )
}

// IS2: that token is burned here

test spend_reference_without_burn_fails() fail {
  spend_store(Transaction { ..valid_item_burn_tx(), mint: assets.zero })
}

test spend_reference_burning_other_item_fails() fail {
  // A's store spent beside B's burn
  spend_store(
    Transaction {
      ..valid_item_burn_tx(),
      inputs: [item_store(), other_store(), other_user()],
      mint: pair_of(other_suffix(), -1, -1),
    },
  )
}

test spend_reference_burned_twice_fails() fail {
  // cannot happen on chain (one reference token exists), but -1 is the rule
  spend_store(
    Transaction { ..valid_item_burn_tx(), mint: pair_of(item_suffix(), -2, -1) },
  )
}

test spend_reference_burning_other_policy_fails() fail {
  // the same names burned under another policy
  spend_store(
    Transaction {
      ..valid_item_burn_tx(),
      mint: assets.from_asset(other_policy, item_reference_name(), -1)
        |> assets.add(other_policy, item_user_name(), -1),
    },
  )
}

test metadata_cannot_be_updated() fail {
  // the 100 token paid back to the store with a new datum, nothing burned
  let renamed: Data = "Darker Walls"
  let new_datum = Cip68Datum {
    ..item_cip68_datum(),
    metadata: [
      Pair("name", renamed),
      ..pairs.delete_all(item_metadata(), "name")
    ],
  }
  spend_store(
    Transaction {
      ..valid_item_burn_tx(),
      inputs: [item_store()],
      outputs: [Output { ..item_store().output, datum: InlineDatum(new_datum) }],
      mint: assets.zero,
    },
  )
}

// The redeemer mix-up

test mint_redeemer_with_burn_fails() fail {
  // the valid mint of A, burning B under `MintItem` in the same transaction
  let tx = valid_item_mint_tx()
  mint_tx(
    Transaction {
      ..tx,
      inputs: list.concat(tx.inputs, [other_store(), other_user()]),
      mint: assets.merge(tx.mint, pair_of(other_suffix(), -1, -1)),
    },
  )
}

// Properties: whole pairs only

/// The pairs of `suffixes`, burned.
fn burned_pairs(suffixes: List<ByteArray>) -> Dict<AssetName, Int> {
  list.foldl(
    suffixes,
    dict.empty,
    fn(s, tokens) {
      tokens
        |> dict.insert(reference_name(s), -1)
        |> dict.insert(user_name(s), -1)
    },
  )
}

/// Some pairs and one name of one of them.
fn pairs_and_a_half() -> Fuzzer<(List<ByteArray>, AssetName)> {
  let suffixes <- fuzz.and_then(
    fuzz.set_between(fuzz.bytearray_fixed(28), 1, 4),
  )
  let (_, s) <- fuzz.and_then(fuzz.pick(suffixes))
  let reference <- fuzz.map(fuzz.bool())
  if reference {
    (suffixes, reference_name(s))
  } else {
    (suffixes, user_name(s))
  }
}

test prop_burn_accepts_complete_pairs(
  suffixes via fuzz.set_between(fuzz.bytearray_fixed(28), 1, 4),
) {
  burns_in_pairs(burned_pairs(suffixes))
}

test prop_burn_rejects_a_missing_half((suffixes, half) via pairs_and_a_half()) {
  !burns_in_pairs(dict.delete(burned_pairs(suffixes), half))
}

test prop_burn_rejects_positive(q via fuzz.int_at_least(0)) {
  let s = item_suffix()
  let pair = fn(reference_quantity, user_quantity) {
    dict.empty
      |> dict.insert(reference_name(s), reference_quantity)
      |> dict.insert(user_name(s), user_quantity)
  }
  !burns_in_pairs(pair(q, -1)) && !burns_in_pairs(pair(-1, q))
}
