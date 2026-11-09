// Signing from the test itself (Node, the Evolution SDK), as the game does: for keys the test
// links through the API, e.g. a second key of a player.
import {
  PrivateKey,
  KeyHash,
  RewardAccount,
  COSE,
} from "@evolution-sdk/evolution";
import { api } from "./players.js";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/** The stake key and reward address (preprod unless `networkId` 1) of 24 words (new ones unless given). */
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
  return {
    words,
    stakeKey,
    subject: `stake:${KeyHash.toHex(hash)}`,
    rewardAddress: RewardAccount.toBech32(account),
    rewardAddressHex: RewardAccount.toHex(account),
  };
};

/** Signs a `purpose` challenge for `keys` as the player of `accessToken`; the answer of /verify. */
export const signAs = async (
  request,
  accessToken,
  keys,
  purpose,
  headers = {}
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
