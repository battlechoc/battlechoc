// What the link page tells the player when the wallet does not get through (owner 2026-11-14:
// "say that no account is set up in the wallet app, or that it is on the wrong network"). The
// texts name the wallet and the step to take there; the technical detail (diagnosis.js) shows
// only for causes the page cannot name.
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../cardano/wallet.js";

const MAINNET = 1;

/**
 * The problem behind `failure` after `step` (the last traced call: "enable" while the wallet is
 * asked to connect), for the wallet named `wallet` and the game's network label `network`:
 * { key, values, technical } (a translation key and its values; technical: show the detail
 * line), or null when there is nothing to say (the player declined to sign).
 */
export const problemOf = (failure, { step, wallet, network }) => {
  const named = (key, technical = false) => ({
    key,
    values: [wallet, network],
    technical,
  });
  const plain = (key, technical = false) => ({ key, values: [], technical });
  const connecting = step === "enable";

  if (failure instanceof WalletCancelledError) {
    // a "no" to connecting is how a wallet without an account (or a locked one) answers; a "no"
    // to signing was the player's choice
    return connecting ? named("LINK_NO_ACCOUNT") : null;
  }
  if (failure instanceof WalletNetworkError) {
    return named(
      failure.actual === MAINNET
        ? "LINK_WALLET_ON_MAINNET"
        : "LINK_WALLET_OTHER_NETWORK"
    );
  }
  if (failure instanceof WalletWithoutAddressError) {
    return named("LINK_NO_ACCOUNT");
  }
  const answer = failure && failure.response;
  const error = answer && answer.data && answer.data.error;
  if (error === "UNKNOWN LINK CODE" || error === "CHALLENGE EXPIRED") {
    return plain("LINK_EXPIRED");
  }
  if (error === "IDENTITY TAKEN") {
    return plain("WALLET_TAKEN");
  }
  if (connecting) {
    return named("LINK_NO_ACCOUNT", true);
  }
  return plain("WALLET_FAILED", true);
};
