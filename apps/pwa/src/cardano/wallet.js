// Signing battlechoc's challenge with a Cardano wallet (plan 3): the CIP-30 api of an extension,
// of a phone wallet connected by QR code (CIP-45: peer-connect injects it in window.cardano too)
// or of a phone wallet's own browser. The Cardano Foundation's component lists and connects the
// wallets; the signing is ours: its signMessage hex-encodes the text without padding, which breaks
// the challenge's line breaks, and never falls back to a payment key.
import { addressToBech32 } from "./keys.js";
import {
  isOurChallenge,
  NetworkMismatchError,
  UnexpectedChallengeError,
} from "./signIn.js";

/** The wallet is on another network than the game: nothing was asked or signed. */
export class WalletNetworkError extends Error {
  constructor(expected, actual) {
    super(`the wallet is on network ${actual}, the game on ${expected}`);
    this.name = "WalletNetworkError";
  }
}

/** The player said no in the wallet (CIP-30: refused, or the signature declined). */
export class WalletCancelledError extends Error {
  constructor(cause) {
    super("the wallet was not allowed to sign");
    this.name = "WalletCancelledError";
    this.cause = cause;
  }
}

// CIP-30 APIError code -3 (Refused) and DataSignError code 3 (UserDeclined)
const isRefusal = (failure) =>
  failure !== null &&
  typeof failure === "object" &&
  (failure.code === -3 || failure.code === 3);

const utf8Hex = (text) =>
  Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

/** The CIP-30 api of the wallet `walletName` in `wallets` (window.cardano). */
export const walletApiOf = async (
  walletName,
  wallets = globalThis.window && globalThis.window.cardano
) => {
  const wallet = wallets && wallets[walletName];
  if (!wallet || typeof wallet.enable !== "function") {
    throw new Error(`no wallet ${walletName}`);
  }
  try {
    return await wallet.enable();
  } catch (failure) {
    throw isRefusal(failure) ? new WalletCancelledError(failure) : failure;
  }
};

// the address that signs: the reward address (the stake key), else a payment address
const signingAddress = async (walletApi) => {
  const [reward] = (await walletApi.getRewardAddresses()) || [];
  if (reward) {
    return reward;
  }
  const [used] = (await walletApi.getUsedAddresses()) || [];
  return used || walletApi.getChangeAddress();
};

/**
 * Signs a `purpose` challenge ("connect", "link", "confirm") with the wallet's CIP-30 api and
 * sends it; resolves with the server's answer. `code`: the link page signs for a link code, without
 * a token (the code says what it is for; `purpose` is not used then). `confirmToken` goes with a change to a player who has keys.
 */
export const signWithWallet = async (
  walletApi,
  purpose,
  { api, network, confirmToken, code }
) => {
  const walletNetwork = await walletApi.getNetworkId();
  if (walletNetwork !== network.networkId) {
    throw new WalletNetworkError(network.networkId, walletNetwork);
  }
  const serverNetwork = await api.network();
  if (serverNetwork !== network.name) {
    throw new NetworkMismatchError(network.name, serverNetwork);
  }
  const address = await signingAddress(walletApi);
  const challenge =
    typeof code === "string"
      ? await api.challengeForCode(code, address)
      : await api.challenge(purpose, address);
  const bech32 = await addressToBech32(address);
  // the link page knows only the code, not what it is for: the code's challenge is a connect or a
  // link, and always carries the warning that it acts for the device that opened the page
  const purposes = typeof code === "string" ? ["connect", "link"] : [purpose];
  if (
    !purposes.some((expected) =>
      isOurChallenge(challenge.message, {
        address: bech32,
        purpose: expected,
        network,
        nonce: challenge.nonce,
        onAnotherDevice: typeof code === "string",
      })
    )
  ) {
    throw new UnexpectedChallengeError();
  }
  let signed;
  try {
    signed = await walletApi.signData(address, utf8Hex(challenge.message));
  } catch (failure) {
    throw isRefusal(failure) ? new WalletCancelledError(failure) : failure;
  }
  const body = {
    nonce: challenge.nonce,
    signature: signed.signature,
    key: signed.key,
  };
  return typeof code === "string"
    ? api.verifyForCode(body)
    : api.verify(body, purpose, { confirmToken });
};

const FINAL = ["linked", "known", "confirm", "failed"];

/**
 * Polls a link code (`poll()`: its state) every `every` ms, and at once when the page becomes
 * visible again (the player comes back from the wallet), until it has an outcome; rejects with an
 * AbortError when `signal` aborts (the door closed).
 */
export const waitForLinkCode = (
  poll,
  { signal, every = 2000, page = globalThis.document } = {}
) =>
  new Promise((resolve, reject) => {
    let timer;
    let polling = false;
    const stop = () => {
      clearTimeout(timer);
      if (page) {
        page.removeEventListener("visibilitychange", now);
      }
      if (signal) {
        signal.removeEventListener("abort", aborted);
      }
    };
    const aborted = () => {
      stop();
      reject(new DOMException("the door was closed", "AbortError"));
    };
    const check = async () => {
      if (polling || (signal && signal.aborted)) {
        return;
      }
      polling = true;
      clearTimeout(timer);
      try {
        const answer = await poll();
        if (signal && signal.aborted) {
          return;
        }
        if (FINAL.includes(answer.state)) {
          stop();
          resolve(answer);
          return;
        }
      } catch (failure) {
        stop();
        reject(failure);
        return;
      } finally {
        polling = false;
      }
      timer = setTimeout(check, every);
    };
    const now = () => {
      if (!page || page.visibilityState !== "hidden") {
        check();
      }
    };
    if (signal && signal.aborted) {
      aborted();
      return;
    }
    if (signal) {
      signal.addEventListener("abort", aborted);
    }
    if (page) {
      page.addEventListener("visibilitychange", now);
    }
    check();
  });

/** The link page a phone wallet's own browser opens for a link code (CIP-158). */
export const linkPageUrl = (code, origin = globalThis.location.origin) =>
  `${origin}/link/?code=${encodeURIComponent(code)}`;
