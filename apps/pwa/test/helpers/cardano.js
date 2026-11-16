// Signing from the test itself (Node, the Evolution SDK), as the game does: for keys the test
// links through the API, e.g. a second key of a player.
import {
  Address,
  PrivateKey,
  KeyHash,
  RewardAccount,
  COSE,
} from "@evolution-sdk/evolution";
import { api } from "./players.js";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/**
 * The stake key and reward address (preprod unless `networkId` 1) of 24 words (new ones unless
 * given), and the words' first payment key with the base address of it and that stake key: where
 * the wallet receives tokens and ADA (the chain double's /test/chain routes send them there), the
 * address its CIP-30 api names as used and as change (helpers/wallet.js), and the key that signs
 * a transaction spending from it. Hex forms are the address bytes as CIP-30 gives them.
 */
export const nodeKeys = (
  words = PrivateKey.generateMnemonic(256).split(" "),
  { networkId = 0 } = {}
) => {
  const stakeKey = PrivateKey.fromMnemonicCardano(words.join(" "), { role: 2 });
  const hash = KeyHash.fromVKey(PrivateKey.toPublicKey(stakeKey));
  const account = new RewardAccount.RewardAccount({
    networkId,
    stakeCredential: hash,
  });
  const paymentKey = PrivateKey.fromMnemonicCardano(words.join(" "), {
    role: 0,
  });
  const paymentHash = KeyHash.fromVKey(PrivateKey.toPublicKey(paymentKey));
  const base = new Address.Address({
    networkId,
    paymentCredential: paymentHash,
    stakingCredential: hash,
  });
  return {
    words,
    stakeKey,
    subject: `stake:${KeyHash.toHex(hash)}`,
    rewardAddress: RewardAccount.toBech32(account),
    rewardAddressHex: RewardAccount.toHex(account),
    paymentKey,
    paymentKeyHashHex: KeyHash.toHex(paymentHash),
    baseAddress: Address.toBech32(base),
    baseAddressHex: Address.toHex(base),
  };
};

/**
 * Signs a `purpose` challenge for `keys` as the player of `accessToken`; the answer of /verify.
 * `wallet`: the CIP-30 name of the wallet that signed (e.g. "eternl"), as the game sends it when
 * a wallet links (the server then names the wallet); none: a key of words.
 */
export const signAs = async (
  request,
  accessToken,
  keys,
  purpose,
  headers = {},
  { wallet } = {}
) => {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const challenge = await (
    await request.post(`${api}/auth/cardano/challenge`, {
      headers: auth,
      data: { purpose, address: keys.rewardAddress },
    })
  ).json();
  const signed = COSE.SignData.signData(
    keys.rewardAddressHex,
    COSE.Utils.fromText(challenge.message),
    keys.stakeKey
  );
  return request.post(`${api}/auth/cardano/verify`, {
    headers: { ...auth, ...headers },
    data: {
      nonce: challenge.nonce,
      signature: hex(signed.signature),
      key: hex(signed.key),
      ...(wallet ? { wallet } : {}),
    },
  });
};

/** Links a second key to the player whose words are `words`: a confirm with them, then the link. */
export const linkSecondKey = async (request, accessToken, words) => {
  const confirmed = await (
    await signAs(request, accessToken, nodeKeys(words), "confirm")
  ).json();
  const second = nodeKeys();
  const linked = await signAs(request, accessToken, second, "link", {
    "X-Battlechoc-Confirm": confirmed.confirmToken,
  });
  return { second, status: linked.status() };
};
