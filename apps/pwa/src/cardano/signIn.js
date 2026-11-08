// Signs a challenge of the battlechoc API with the key of the recovery words: links the key to
// the device's player ("link") or signs in as the player it is linked to ("sign-in").
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import { keysFromWords, signMessage } from "./keys.js";

/** The game was built for another network than the server runs on: nothing is signed. */
export class NetworkMismatchError extends Error {
  constructor(expected, actual) {
    super(`the game runs on ${expected}, the server on ${actual}`);
    this.name = "NetworkMismatchError";
  }
}

/** The server sent a text to sign that is not battlechoc's challenge: nothing is signed. */
export class UnexpectedChallengeError extends Error {
  constructor() {
    super("the text to sign is not a battlechoc challenge");
    this.name = "UnexpectedChallengeError";
  }
}

// the challenge text of shared/cardano/message.js for this address, purpose, network and nonce;
// only the two times (the last two lines) are the server's
const DATED_LINES = 2;
const isOurChallenge = (message, { address, purpose, network, nonce }) => {
  const expected = cardano
    .challengeMessage({
      address,
      purpose,
      network,
      nonce,
      issuedAt: new Date(0),
      expiresAt: new Date(0),
    })
    .split("\n");
  const lines = String(message).split("\n");
  const fixed = expected.length - DATED_LINES;
  return (
    lines.length === expected.length &&
    lines.slice(0, fixed).every((line, i) => line === expected[i]) &&
    lines[fixed].startsWith("Issued At: ") &&
    lines[fixed + 1].startsWith("Expiration Time: ")
  );
};

/**
 * Asks `api` (src/api/cardano.js) for a challenge for the words' reward address on `network`
 * (shared cardano.Networks), signs its text and sends the signature; resolves with the server's
 * answer to /auth/cardano/verify.
 */
export const signChallenge = async (words, purpose, { api, network }) => {
  const serverNetwork = await api.network();
  if (serverNetwork !== network.name) {
    throw new NetworkMismatchError(network.name, serverNetwork);
  }
  const keys = await keysFromWords(words, network);
  const challenge = await api.challenge(purpose, keys.rewardAddress);
  // the words may also open a wallet one day: sign battlechoc's challenge, nothing else
  if (
    !isOurChallenge(challenge.message, {
      address: keys.rewardAddress,
      purpose,
      network,
      nonce: challenge.nonce,
    })
  ) {
    throw new UnexpectedChallengeError();
  }
  const signed = await signMessage(keys, challenge.message);
  return api.verify({ nonce: challenge.nonce, ...signed }, purpose);
};
