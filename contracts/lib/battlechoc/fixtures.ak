//// Test transactions for the validators' tests: each `valid_…_tx` passes, and
//// a test changes one field (`Transaction { ..tx, field: value }`) to break
//// exactly one rule.

use aiken/crypto.{ScriptHash, VerificationKeyHash}
use battlechoc/types.{ConfigDatum, FeeOption, config_token_name}
use cardano/address.{Address}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
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

// Addresses and outputs

pub fn key_address(key: VerificationKeyHash) -> Address {
  address.from_verification_key(key)
}

pub fn script_address(hash: ScriptHash) -> Address {
  address.from_script(hash)
}

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
    receivers: [(script_address(treasury_hash), 1)],
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
