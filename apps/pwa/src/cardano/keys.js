// The player's Cardano key: 24 recovery words (BIP-39), the CIP-1852 stake key they give
// (1852'/1815'/0'/2/0) and its reward address, and CIP-30 signData with it. The Evolution SDK is
// loaded only when one of these runs (a separate chunk, never on the first load).

let evolution;

/**
 * The parts of the Evolution SDK the key needs, imported once on first use (by module, not the
 * whole SDK: 127 instead of 283 kB gzip).
 */
export const loadEvolution = () => {
  if (typeof evolution === "undefined") {
    evolution = Promise.all([
      import("@evolution-sdk/evolution/PrivateKey"),
      import("@evolution-sdk/evolution/KeyHash"),
      import("@evolution-sdk/evolution/RewardAccount"),
      import("@evolution-sdk/evolution/VKey"),
      import("@evolution-sdk/evolution/cose"),
    ]).then(([PrivateKey, KeyHash, RewardAccount, VKey, COSE]) => ({
      PrivateKey,
      KeyHash,
      RewardAccount,
      VKey,
      COSE,
    }));
  }
  return evolution;
};

const hex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** 24 new recovery words. */
export const newRecoveryWords = async () => {
  const { PrivateKey } = await loadEvolution();
  return PrivateKey.generateMnemonic(256).split(" ");
};

/**
 * The words of a text typed or pasted loosely: the recovery words are plain a to z, so whatever
 * else is around them (numbering like "1." or "(4)", bullets, dashes, punctuation, line breaks,
 * invisible characters) only separates them.
 */
export const normalizeWords = (text) =>
  String(text)
    .toLowerCase()
    .normalize("NFKD")
    .match(/[a-z]+/g) || [];

/** Whether the words are 24 recovery words that fit together (the BIP-39 checksum). */
export const wordsAreValid = async (words) => {
  if (!Array.isArray(words) || words.length !== 24) {
    return false;
  }
  const { PrivateKey } = await loadEvolution();
  return PrivateKey.validateMnemonic(words.join(" "));
};

const rewardAddressFor = (sdk, hash, network) =>
  new sdk.RewardAccount.RewardAccount({
    networkId: network.networkId,
    stakeCredential: hash,
  });

/**
 * The stake key of the words and its reward address on `network` (shared cardano.Networks):
 * { stakeKey, stakeKeyHashHex, rewardAddress, rewardAddressHex }.
 */
export const keysFromWords = async (words, network) => {
  const sdk = await loadEvolution();
  const stakeKey = sdk.PrivateKey.fromMnemonicCardano(words.join(" "), {
    role: 2,
  });
  const hash = sdk.KeyHash.fromVKey(sdk.PrivateKey.toPublicKey(stakeKey));
  const account = rewardAddressFor(sdk, hash, network);
  return {
    stakeKey,
    stakeKeyHashHex: sdk.KeyHash.toHex(hash),
    rewardAddress: sdk.RewardAccount.toBech32(account),
    rewardAddressHex: sdk.RewardAccount.toHex(account),
  };
};

/** The reward address of a stake verification key (32 bytes) on `network`. */
export const rewardAddressOf = async (vkeyBytes, network) => {
  const sdk = await loadEvolution();
  const hash = sdk.KeyHash.fromVKey(sdk.VKey.fromBytes(vkeyBytes));
  return sdk.RewardAccount.toBech32(rewardAddressFor(sdk, hash, network));
};

/**
 * CIP-30 signData of `message` (text) with the stake key, for its reward address: the
 * DataSignature { signature, key } as hex, what a wallet's signData answers.
 */
export const signMessage = async (keys, message) => {
  const { COSE } = await loadEvolution();
  const signed = COSE.SignData.signData(
    keys.rewardAddressHex,
    COSE.Utils.fromText(message),
    keys.stakeKey
  );
  return { signature: hex(signed.signature), key: hex(signed.key) };
};
