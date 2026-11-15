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
      import("@evolution-sdk/evolution/Address"),
    ]).then(([PrivateKey, KeyHash, RewardAccount, VKey, COSE, Address]) => ({
      PrivateKey,
      KeyHash,
      RewardAccount,
      VKey,
      COSE,
      Address,
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

/**
 * The bech32 form of an address a CIP-30 wallet gives as hex: a reward address (header type
 * 0xe/0xf), else a base or enterprise address. The kind is read from the header first, as the
 * server does (apps/api/src/cardano.js): the SDK's reward parser also reads an enterprise address.
 */
export const addressToBech32 = async (addressHex) => {
  const { RewardAccount, Address } = await loadEvolution();
  return /^[ef]/i.test(addressHex)
    ? RewardAccount.toBech32(RewardAccount.fromHex(addressHex))
    : Address.toBech32(Address.fromHex(addressHex));
};

/**
 * An address battlechoc cannot sign for: `reason` "script" (a script's credential where the key
 * should be) or "unreadable" (no reward, base or enterprise address: Byron, a pointer address,
 * nonsense); `address` is the address as given.
 */
export class UnsupportedAddressError extends Error {
  constructor(address, reason, cause) {
    super(
      reason === "script"
        ? "the address has no key to sign with: it is a script's"
        : "the address cannot be read",
      typeof cause === "undefined" ? undefined : { cause }
    );
    this.name = "UnsupportedAddressError";
    this.address = address;
    this.reason = reason;
  }
}

/**
 * The identity subject of an address a CIP-30 wallet gives as hex, by the server's rule
 * (apps/api/src/cardano.js keyOfAddress): a reward address (header type 0xe/0xf) is its stake key,
 * "stake:<hash>"; a base or enterprise address its payment key, "pay:<hash>". Rejects with
 * UnsupportedAddressError for a script's address and for anything that is no such address.
 */
export const subjectOfAddress = async (addressHex) => {
  const { RewardAccount, Address, KeyHash } = await loadEvolution();
  const reward = /^[ef]/i.test(addressHex);
  let parsed;
  try {
    parsed = reward
      ? RewardAccount.fromHex(addressHex)
      : Address.fromHex(addressHex);
  } catch (failure) {
    throw new UnsupportedAddressError(addressHex, "unreadable", failure);
  }
  const credential = reward ? parsed.stakeCredential : parsed.paymentCredential;
  if (!(credential instanceof KeyHash.KeyHash)) {
    throw new UnsupportedAddressError(addressHex, "script");
  }
  return `${reward ? "stake" : "pay"}:${KeyHash.toHex(credential)}`;
};

// bytes as hex: an even number of hex digits
const HEX_BYTES = /^(?:[0-9a-f]{2})+$/i;

/**
 * The bytes (lower-case hex) of an address given as hex or as bech32 (a reward address
 * "stake…", else a base or enterprise address); rejects for anything else.
 */
export const addressBytesHex = async (address) => {
  if (typeof address !== "string") {
    throw new TypeError("an address is a text");
  }
  if (HEX_BYTES.test(address)) {
    return address.toLowerCase();
  }
  const { RewardAccount, Address } = await loadEvolution();
  return /^stake(_test)?1/i.test(address)
    ? RewardAccount.toHex(RewardAccount.fromBech32(address)).toLowerCase()
    : Address.toHex(Address.fromBech32(address)).toLowerCase();
};

/**
 * The address the server names for a subject on `network` (apps/api/src/cardano.js
 * addressOfSubject): the reward address of a stake key ("stake:<hash>"), the enterprise address
 * of a payment key ("pay:<hash>"), bech32. Rejects for anything that is no subject.
 */
export const addressOfSubject = async (subject, network) => {
  const match = /^(stake|pay):([0-9a-fA-F]{56})$/.exec(
    typeof subject === "string" ? subject : ""
  );
  if (!match) {
    throw new TypeError("no subject");
  }
  const sdk = await loadEvolution();
  const hash = sdk.KeyHash.fromHex(match[2].toLowerCase());
  return match[1] === "stake"
    ? sdk.RewardAccount.toBech32(rewardAddressFor(sdk, hash, network))
    : sdk.Address.toBech32(
        new sdk.Address.Address({
          networkId: network.networkId,
          paymentCredential: hash,
        })
      );
};
