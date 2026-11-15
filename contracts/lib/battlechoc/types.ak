//// The types and constants the validators share.

use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{OutputReference}

/// CIP-67 label 100: the reference token, which carries the CIP-68 datum.
pub const reference_label = #"000643b0"

/// CIP-67 label 222: the user token, the one the player holds.
pub const user_label = #"000de140"

/// The asset name of the config NFT: "config" in UTF-8.
pub const config_token_name = "config"

/// How many item tiers the fee amounts are indexed by: COMMON 0, RARE 1,
/// EPIC 2 (the order of `Tier` in `packages/shared/equipment.js`).
pub const tiers = 3

/// One way to pay the battlechoc fee: an asset (ADA is the empty policy with
/// the empty name), the amount per tier, and the receivers with their shares.
pub type FeeOption {
  policy: PolicyId,
  name: AssetName,
  amounts: List<Int>,
  receivers: List<(Address, Int)>,
}

/// The datum of the config NFT. The field order is the on-chain encoding.
pub type ConfigDatum {
  server_keys: List<VerificationKeyHash>,
  admins: List<VerificationKeyHash>,
  threshold: Int,
  paused: Bool,
  fees: List<FeeOption>,
}

/// The redeemer of the items policy.
pub type ItemAction {
  /// Mint one item's token pair. `seed` is spent by the transaction and names
  /// the pair; `fee` is the index of the chosen option in the config's `fees`.
  MintItem {
    seed: OutputReference,
    owner: VerificationKeyHash,
    tier: Int,
    fee: Int,
  }
  BurnItems
}

/// The CIP-68 datum of a reference token.
pub type Cip68Datum {
  metadata: Pairs<ByteArray, Data>,
  version: Int,
  extra: Data,
}

test config_token_name_is_config_in_utf8() {
  config_token_name == #"636f6e666967"
}
