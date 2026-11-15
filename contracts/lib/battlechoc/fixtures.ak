//// Test transactions for the validators' tests: each `valid_…_tx` passes, and
//// a test changes one field (`Transaction { ..tx, field: value }`) to break
//// exactly one rule.

use aiken/builtin
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use battlechoc/names.{reference_name, suffix, user_name}
use battlechoc/types.{
  Cip68Datum, ConfigDatum, FeeOption, ItemAction, MintItem, config_token_name,
}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}

// Keys and hashes (28 bytes each)

pub const admin_a: VerificationKeyHash =
  #"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

pub const admin_b: VerificationKeyHash =
  #"a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2"

pub const admin_c: VerificationKeyHash =
  #"a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3"

/// Not an admin of `base_config`: for a datum that hands the config over.
pub const admin_d: VerificationKeyHash =
  #"a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4"

/// Not an admin of `base_config`: for a datum that hands the config over.
pub const admin_e: VerificationKeyHash =
  #"a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5"

pub const server_1: VerificationKeyHash =
  #"51515151515151515151515151515151515151515151515151515151"

pub const server_2: VerificationKeyHash =
  #"52525252525252525252525252525252525252525252525252525252"

/// A player's key.
pub const owner_key: VerificationKeyHash =
  #"0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e"

/// The config NFT's policy id, which is also its address's script hash.
pub const config_policy: PolicyId =
  #"c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0"

/// Another script, for UTxOs that look like the config but are not.
pub const other_policy: PolicyId =
  #"0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c"

pub const treasury_hash: ScriptHash =
  #"7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e"

/// The policy of a fungible token a later fee option could ask for.
pub const choc_policy: PolicyId =
  #"c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4"

/// The items validator's hash in the tests: the policy id of every item token
/// and the payment credential of the address the reference tokens sit at.
pub const items_policy: PolicyId =
  #"1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d"

/// The prize pool's script, a receiver of the split fee.
pub const pot_hash: ScriptHash =
  #"90909090909090909090909090909090909090909090909090909090"

/// The team's key, the other receiver of the split fee.
pub const team_key: VerificationKeyHash =
  #"3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a"

/// A stake key, for addresses with a delegation part.
pub const stake_key: VerificationKeyHash =
  #"5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c"

// Output references

/// The output reference the config mint spends (the validator's parameter).
pub const config_seed =
  OutputReference {
    transaction_id: #"5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
    output_index: 0,
  }

/// Where the config NFT sits before an update.
pub const config_ref =
  OutputReference {
    transaction_id: #"cfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcf",
    output_index: 0,
  }

/// A fee output at the treasury.
pub const treasury_ref =
  OutputReference {
    transaction_id: #"7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f",
    output_index: 3,
  }

/// The seed an item mint spends: a UTxO of the player's wallet.
pub const item_seed =
  OutputReference {
    transaction_id: #"5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d",
    output_index: 2,
  }

/// Where the item's reference token sits after the mint (the store).
pub const item_reference_ref =
  OutputReference {
    transaction_id: #"1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e",
    output_index: 0,
  }

/// Where the item's user token sits after the mint, in the owner's wallet.
pub const item_user_ref =
  OutputReference {
    transaction_id: #"1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e",
    output_index: 1,
  }

// Addresses and outputs

pub fn key_address(key: VerificationKeyHash) -> Address {
  address.from_verification_key(key)
}

pub fn script_address(hash: ScriptHash) -> Address {
  address.from_script(hash)
}

/// The treasury's enterprise script address (no stake part): the receiver of
/// the preprod fee.
pub const treasury_address: Address = script_address(treasury_hash)

/// The prize pool's address, a receiver of `split_fee_config`.
pub const pot_address: Address = script_address(pot_hash)

/// The team's address, a receiver of `split_fee_config`.
pub const team_address: Address = key_address(team_key)

/// An output of `lovelace` at a key address, without datum or tokens.
pub fn wallet_output(key: VerificationKeyHash, lovelace: Int) -> Output {
  Output {
    address: key_address(key),
    value: assets.from_lovelace(lovelace),
    datum: NoDatum,
    reference_script: None,
  }
}

// Config datums

/// The preprod fee: 1, 2 or 4 ADA by tier, all of it to the treasury.
pub fn ada_fee() -> FeeOption {
  FeeOption {
    policy: #"",
    name: #"",
    amounts: [1_000_000, 2_000_000, 4_000_000],
    receivers: [(treasury_address, 1)],
  }
}

/// One server key, admins `a, b, c` with threshold 2, not paused, the ADA fee.
pub fn base_config() -> ConfigDatum {
  ConfigDatum {
    server_keys: [server_1],
    admins: [admin_a, admin_b, admin_c],
    threshold: 2,
    paused: False,
    fees: [ada_fee()],
  }
}

/// The config an item mint reads: two server keys, not paused, the ADA fee.
pub fn item_config() -> ConfigDatum {
  ConfigDatum { ..base_config(), server_keys: [server_1, server_2] }
}

/// `item_config` with one ADA option split 9:1 between the prize pool and the
/// team: the validator pays any receivers, even though preprod has only one.
pub fn split_fee_config() -> ConfigDatum {
  ConfigDatum {
    ..item_config(),
    fees: [
      FeeOption {
        ..ada_fee(),
        receivers: [(pot_address, 9), (team_address, 1)],
      },
    ],
  }
}

/// The config NFT at the config address with `datum` inline.
pub fn config_nft_output(datum: ConfigDatum) -> Output {
  Output {
    address: script_address(config_policy),
    value: assets.from_lovelace(2_000_000)
      |> assets.add(config_policy, config_token_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

/// The config NFT's UTxO at `config_ref`.
pub fn config_nft_input(datum: ConfigDatum) -> Input {
  Input { output_reference: config_ref, output: config_nft_output(datum) }
}

// The item `valid_item_mint_tx` mints

/// The suffix both of the item's names end with.
pub fn item_suffix() -> ByteArray {
  suffix(item_seed)
}

/// The name of the item's reference token (label 100).
pub fn item_reference_name() -> AssetName {
  reference_name(item_suffix())
}

/// The name of the item's user token (label 222).
pub fn item_user_name() -> AssetName {
  user_name(item_suffix())
}

/// The item's CIP-68 metadata: a RARE "Dark Walls" with serial 7.
pub fn item_metadata() -> Pairs<ByteArray, Data> {
  let name: Data = "Dark Walls"
  let image: Data = "https://battlechoc.com/items/DARK_WALLS.png"
  let media_type: Data = "image/png"
  let description: Data = "A battlechoc item."
  let item: Data = "DARK_WALLS"
  let serial: Data = 7
  [
    Pair("name", name), Pair("image", image), Pair("mediaType", media_type),
    Pair("description", description), Pair("item", item), Pair("serial", serial),
  ]
}

/// The reference token's datum: CIP-68 version 1, an empty list as `extra`.
pub fn item_cip68_datum() -> Cip68Datum {
  Cip68Datum {
    metadata: item_metadata(),
    version: 1,
    extra: builtin.list_data([]),
  }
}

/// The item's reference token at the items address with `datum`.
pub fn item_reference_output(datum: Datum) -> Output {
  Output {
    address: script_address(items_policy),
    value: assets.from_lovelace(2_000_000)
      |> assets.add(items_policy, item_reference_name(), 1),
    datum,
    reference_script: None,
  }
}

/// The item's user token at `address`.
pub fn item_user_output(address: Address) -> Output {
  Output {
    address,
    value: assets.from_lovelace(1_500_000)
      |> assets.add(items_policy, item_user_name(), 1),
    datum: NoDatum,
    reference_script: None,
  }
}

/// The reference token of the item with suffix `s`, locked at the items
/// address with the item's datum, as the input at `at`.
pub fn stored_reference_input(s: ByteArray, at: OutputReference) -> Input {
  Input {
    output_reference: at,
    output: Output {
      address: script_address(items_policy),
      value: assets.from_lovelace(2_000_000)
        |> assets.add(items_policy, reference_name(s), 1),
      datum: InlineDatum(item_cip68_datum()),
      reference_script: None,
    },
  }
}

/// The user token of the item with suffix `s` in the owner's wallet, as the
/// input at `at`.
pub fn held_user_input(s: ByteArray, at: OutputReference) -> Input {
  Input {
    output_reference: at,
    output: Output {
      address: key_address(owner_key),
      value: assets.from_lovelace(1_500_000)
        |> assets.add(items_policy, user_name(s), 1),
      datum: NoDatum,
      reference_script: None,
    },
  }
}

/// A fee payment: `lovelace` to `address`, without a datum.
pub fn fee_output(address: Address, lovelace: Int) -> Output {
  Output {
    address,
    value: assets.from_lovelace(lovelace),
    datum: NoDatum,
    reference_script: None,
  }
}

// Transactions

/// Spends the seed from admin `a`'s wallet and mints the config NFT to the
/// config address with `base_config`.
pub fn valid_config_mint_tx() -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs: [
      Input {
        output_reference: config_seed,
        output: wallet_output(admin_a, 10_000_000),
      },
    ],
    outputs: [
      config_nft_output(base_config()),
      wallet_output(admin_a, 7_800_000),
    ],
    mint: assets.from_asset(config_policy, config_token_name, 1),
    fee: 200_000,
  }
}

/// Spends the config (`base_config`) and pauses the game, signed by `a`
/// and `b` (threshold 2 of 3).
pub fn valid_config_update_tx() -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs: [
      config_nft_input(base_config()),
      Input {
        output_reference: OutputReference {
          transaction_id: config_seed.transaction_id,
          output_index: 1,
        },
        output: wallet_output(admin_a, 5_000_000),
      },
    ],
    outputs: [
      config_nft_output(ConfigDatum { ..base_config(), paused: True }),
      wallet_output(admin_a, 4_800_000),
    ],
    extra_signatories: [admin_a, admin_b],
    fee: 200_000,
  }
}

/// Spends a fee output (no datum) from the treasury to admin `a`'s wallet,
/// with the config as a reference input, signed by `a` and `b`.
pub fn valid_treasury_spend_tx() -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs: [
      Input {
        output_reference: treasury_ref,
        output: Output {
          address: script_address(treasury_hash),
          value: assets.from_lovelace(4_000_000),
          datum: NoDatum,
          reference_script: None,
        },
      },
    ],
    reference_inputs: [config_nft_input(base_config())],
    outputs: [wallet_output(admin_a, 3_800_000)],
    extra_signatories: [admin_a, admin_b],
    fee: 200_000,
  }
}

/// The redeemer of `valid_item_mint_tx`: the owner mints a RARE item (tier 1)
/// and pays with fee option 0.
pub fn item_mint_redeemer() -> ItemAction {
  MintItem { seed: item_seed, owner: owner_key, tier: 1, fee: 0 }
}

/// Spends the seed from the owner's wallet, reads `item_config` from a
/// reference input and mints the item's pair: the reference token locked at
/// the items address with its CIP-68 datum, the user token to the owner, the
/// RARE fee (2 ADA) to the treasury; signed by `server_1` and the owner.
pub fn valid_item_mint_tx() -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs: [
      Input {
        output_reference: item_seed,
        output: wallet_output(owner_key, 10_000_000),
      },
    ],
    reference_inputs: [config_nft_input(item_config())],
    outputs: [
      item_reference_output(InlineDatum(item_cip68_datum())),
      item_user_output(key_address(owner_key)),
      fee_output(treasury_address, 2_000_000),
      wallet_output(owner_key, 4_300_000),
    ],
    mint: assets.from_asset(items_policy, item_reference_name(), 1)
      |> assets.add(items_policy, item_user_name(), 1),
    extra_signatories: [server_1, owner_key],
    fee: 200_000,
  }
}

/// The owner salvages the item `valid_item_mint_tx` minted: spends its
/// reference token from the store and its user token from the wallet, burns
/// both and takes the deposits (3.5 ADA less the fee) to the wallet. No
/// config, no fee, no signature beyond the wallet's own witness.
pub fn valid_item_burn_tx() -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs: [
      stored_reference_input(item_suffix(), item_reference_ref),
      held_user_input(item_suffix(), item_user_ref),
    ],
    outputs: [wallet_output(owner_key, 3_300_000)],
    mint: assets.from_asset(items_policy, item_reference_name(), -1)
      |> assets.add(items_policy, item_user_name(), -1),
    fee: 200_000,
  }
}
