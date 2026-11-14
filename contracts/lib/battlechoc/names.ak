//// The CIP-68 asset names of an item: a 4-byte CIP-67 label followed by a
//// 28-byte suffix that the seed (the output reference the mint spends) fixes.

use aiken/cbor
use aiken/crypto.{blake2b_224}
use aiken/fuzz
use aiken/primitive/bytearray
use battlechoc/types.{reference_label, user_label}
use cardano/assets.{AssetName}
use cardano/fuzz as cardano_fuzz
use cardano/transaction.{OutputReference}

/// The 28 bytes both names of an item end with: blake2b-224 of the seed's
/// CBOR (the Plutus data encoding, which the API must reproduce byte for byte).
pub fn suffix(seed: OutputReference) -> ByteArray {
  blake2b_224(cbor.serialise(seed))
}

/// The name of the reference token (label 100).
pub fn reference_name(suffix: ByteArray) -> AssetName {
  bytearray.concat(reference_label, suffix)
}

/// The name of the user token (label 222).
pub fn user_name(suffix: ByteArray) -> AssetName {
  bytearray.concat(user_label, suffix)
}

/// Splits an item's asset name into its label and its suffix; `None` for any
/// name that is not 32 bytes long or has neither of the two labels.
pub fn split_name(name: AssetName) -> Option<(ByteArray, ByteArray)> {
  if bytearray.length(name) == 32 {
    let label = bytearray.take(name, 4)
    if label == reference_label || label == user_label {
      Some((label, bytearray.drop(name, 4)))
    } else {
      None
    }
  } else {
    None
  }
}

// Tests

const example_seed =
  OutputReference {
    transaction_id: #"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    output_index: 1,
  }

test suffix_is_28_bytes() {
  bytearray.length(suffix(example_seed)) == 28
}

test names_are_32_bytes_with_their_labels() {
  let s = suffix(example_seed)
  let reference = reference_name(s)
  let user = user_name(s)
  and {
    bytearray.length(reference) == 32,
    bytearray.length(user) == 32,
    reference == bytearray.concat(#"000643b0", s),
    user == bytearray.concat(#"000de140", s),
  }
}

test split_name_round_trip() {
  let s = suffix(example_seed)
  and {
    split_name(reference_name(s)) == Some((reference_label, s)),
    split_name(user_name(s)) == Some((user_label, s)),
  }
}

test split_name_rejects_other_labels() {
  let s = suffix(example_seed)
  and {
    // label 333 (fungible token), as CIP-67 writes it
    split_name(bytearray.concat(#"0014df10", s)) == None,
    // the same, shifted by one byte
    split_name(bytearray.concat(#"000014df", s)) == None,
    // label 100 and 222 with a byte changed
    split_name(bytearray.concat(#"000643b1", s)) == None,
    split_name(bytearray.concat(#"100de140", s)) == None,
  }
}

test split_name_rejects_short_names() {
  let s = suffix(example_seed)
  and {
    split_name(#"") == None,
    split_name(reference_label) == None,
    split_name(bytearray.concat(user_label, bytearray.take(s, 27))) == None,
  }
}

test split_name_rejects_long_names() {
  let s = suffix(example_seed)
  split_name(bytearray.concat(reference_name(s), #"00")) == None
}

// Pins the CBOR encoding of the seed: the API computes the same suffix
// (apps/api/test/chain.blueprint.test.js pins this value too).
test suffix_vector() {
  suffix(example_seed) == #"8131afd50ec08843dc8e60d31df11c1e9a4c2299f2096d9bfef16ad9"
}

test prop_distinct_seeds_distinct_suffixes(
  (a, b) via fuzz.both(
    cardano_fuzz.output_reference(),
    cardano_fuzz.output_reference(),
  ),
) {
  a == b || suffix(a) != suffix(b)
}

test prop_split_name_inverts_names(seed via cardano_fuzz.output_reference()) {
  let s = suffix(seed)
  and {
    split_name(reference_name(s)) == Some((reference_label, s)),
    split_name(user_name(s)) == Some((user_label, s)),
  }
}
