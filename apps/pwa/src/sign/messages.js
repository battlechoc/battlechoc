// What the sign page (/sign/) tells the player when a signature does not get through: the cause
// in the player's words, named after the wallet, and what to do there. A "no" in the wallet says
// nothing (the player chose so: the buttons come back). The technical detail (link/diagnosis.js)
// shows only for causes the page cannot name. The texts are the minting dialog's where they fit;
// none names a button of the game, and none an action this page lacks (it has its wallets'
// buttons and, after a start that failed, Try again): those have sign-page variants.
import { ChainApiError, ChainUnreachableError } from "../api/chainClient.js";
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../cardano/wallet.js";
import {
  OwnerNotConfirmedError,
  UnexpectedProofTextError,
  UnsupportedAddressError,
  WalletAccountChangedError,
  WalletCannotSignError,
  WalletOtherAccountError,
} from "../cardano/signTx.js";
import { formatAda, SELF_SEND_LOVELACE } from "../ui/mint/ada.js";
import { salvageKey } from "../ui/mint/salvageTexts.js";

// the wallet's failures the page can name, each with the wallet's name as its one value
const NAMED_WALLET_FAILURES = [
  [WalletOtherAccountError, "MINT_OTHER_WALLET"],
  [WalletAccountChangedError, "MINT_ACCOUNT_CHANGED"],
  [WalletCannotSignError, "MINT_WALLET_CANNOT_SIGN"],
  [WalletWithoutAddressError, "MINT_NO_ADDRESS"],
  [UnsupportedAddressError, "MINT_ADDRESS_UNSUPPORTED"],
];

// the server's codes with a text of their own: (context) → [key, values]
const API_PROBLEMS = {
  "UNKNOWN SIGN CODE": () => ["MINT_SIGN_EXPIRED", []],
  // signed, cancelled, prepared again (another page's rebuild won) or its time ran out during the
  // signature: the item in battlechoc shows which
  "OPERATION NOT OPEN": () => ["MINT_SIGN_NOT_OPEN", []],
  // "tap your wallet again" (the page has no Check again)
  "NOT ENOUGH ADA": ({ failure, language }) => {
    const details = failure.details || {};
    // without its numbers, the sentence without them (never "about undefined ADA")
    if (details.needed == null || details.missing == null) {
      return ["MINT_SIGN_NOT_ENOUGH_ADA_PLAIN", []];
    }
    return [
      "MINT_SIGN_NOT_ENOUGH_ADA",
      [
        formatAda(details.needed, language),
        formatAda(details.missing, language),
      ],
    ];
  },
  "NO COLLATERAL": ({ wallet, language }) => [
    "MINT_NO_COLLATERAL",
    [wallet, formatAda(SELF_SEND_LOVELACE, language)],
  ],
  "WALLET TOO FULL": ({ wallet }) => ["MINT_WALLET_TOO_FULL", [wallet]],
  // "cancel it in battlechoc" (the page has no Cancel)
  "INVALID WITNESS": ({ wallet }) => ["MINT_SIGN_BAD_SIGNATURE", [wallet]],
  // the server did not accept the wallet's proof of its addresses
  "INVALID SIGNATURE": () => ["MINT_PROOF_REFUSED", []],
  "WALLET WAITING": () => ["MINT_CHECK_WAITING_TEXT", []],
  "NOT YOUR WALLET": () => ["MINT_NOT_YOUR_WALLET", []],
  "CHAIN PAUSED": () => ["MINT_PAUSED", []],
  "CHAIN OFF": () => ["MINT_OFF", []],
  // built without the wallet's addresses, and not built again here: only battlechoc can
  "ADDRESSES NEEDED": () => ["MINT_SIGN_START_AGAIN", []],
};

// no answer, or a failure that may pass: before the witness went out nothing happened; after it
// the minting may have gone out (the game finds out by itself)
const unreachable = (failure) =>
  failure instanceof ChainUnreachableError ||
  (failure instanceof ChainApiError &&
    failure.retryable === true &&
    !Object.prototype.hasOwnProperty.call(API_PROBLEMS, failure.code));

const maybeDone = (failure) =>
  failure instanceof ChainUnreachableError
    ? failure.reason !== "busy"
    : failure.status >= 500 && failure.code !== "CHAIN UNAVAILABLE";

// the burn's own refusals on this page (plan E, the salvage of a minted item): (context) → [key,
// values]; the page cannot cancel (no session): where that helps, the text says to cancel in
// battlechoc
const BURN_PROBLEMS = {
  "NOT ENOUGH ADA": ({ failure, language }) => {
    const details = failure.details || {};
    return details.missing == null
      ? ["SALVAGE_SIGN_NOT_ENOUGH_ADA_PLAIN", []]
      : ["SALVAGE_SIGN_NOT_ENOUGH_ADA", [formatAda(details.missing, language)]];
  },
  // at the rebuild the burn stays prepared: the wallet names its addresses again (try again), or
  // it is cancelled in battlechoc; at the signature it was cancelled: start again there
  "ITEM MOVED": ({ step }) =>
    step === "submit"
      ? ["SALVAGE_SIGN_TOKEN_MOVED", []]
      : ["SALVAGE_SIGN_ITEM_ELSEWHERE", []],
  // at the rebuild the burn stays prepared (cancel it in battlechoc, or it ends by itself); at
  // the signature the server cancelled it (token-moved)
  "ITEM LEFT WALLET": ({ step }) =>
    step === "submit"
      ? ["SALVAGE_SIGN_LEFT_WALLET_CANCELLED", []]
      : ["SALVAGE_SIGN_LEFT_WALLET", []],
};

/** The problems after which a burn's page offers no button any more (nothing a retry can mend). */
export const BURN_LAST_WORDS = [
  "SALVAGE_SIGN_TOKEN_MOVED",
  "SALVAGE_SIGN_LEFT_WALLET",
  "SALVAGE_SIGN_LEFT_WALLET_CANCELLED",
];

/**
 * The problem behind `failure` at `step` ("info": reading the sign code; "enable": connecting the
 * wallet; "sign": signPrepared, the proof and the signature; "submit": posting the witness), for
 * the wallet named `wallet` and the network label `network`, amounts in `language`:
 * { key, values, technical } (a translation key, its values in placeholder order; technical: show
 * the detail line), or null when there is nothing to say (the player said no in the wallet).
 * `kind` "burn" (the salvage of a minted item): its own refusals first, and every minting text
 * as its salvage variant (salvageTexts.js); `base` is then the minting's key.
 */
export const problemOf = (failure, context) => {
  if (context.kind !== "burn") {
    return mintProblemOf(failure, context);
  }
  if (
    failure instanceof ChainApiError &&
    Object.prototype.hasOwnProperty.call(BURN_PROBLEMS, failure.code)
  ) {
    const [key, values] = BURN_PROBLEMS[failure.code]({
      failure,
      step: context.step,
      language: context.language,
    });
    return { key, values, technical: false, base: key };
  }
  const problem = mintProblemOf(failure, context);
  return problem === null
    ? null
    : { ...problem, key: salvageKey(problem.key), base: problem.key };
};

const mintProblemOf = (failure, { step, wallet, network, language }) => {
  const plain = (key, values = [], technical = false) => ({
    key,
    values,
    technical,
  });
  if (step === "enable") {
    // a "no" to connecting is how a wallet without an account (or a locked one) answers
    const technical = !(failure instanceof WalletCancelledError);
    return wallet
      ? plain("MINT_NO_ACCOUNT", [wallet, network], technical)
      : plain("MINT_NO_ACCOUNT_NAMELESS", [network], technical);
  }
  if (failure instanceof WalletCancelledError) {
    return null;
  }
  if (failure instanceof WalletNetworkError) {
    return plain("MINT_WRONG_NETWORK", [wallet, network]);
  }
  for (const [kind, key] of NAMED_WALLET_FAILURES) {
    if (failure instanceof kind) {
      return plain(key, [wallet]);
    }
  }
  if (failure instanceof OwnerNotConfirmedError) {
    // the server's rebuilt answer was not usable: battlechoc's fault, never the player's
    return plain("MINT_OWNER_NOT_CONFIRMED", [], true);
  }
  if (failure instanceof UnexpectedProofTextError) {
    // not battlechoc's address proof for this mint (an expiry beyond the sign window too): the
    // wallet was not asked
    return plain("MINT_PROOF_TEXT", [], true);
  }
  if (unreachable(failure)) {
    return plain(
      step === "submit" && maybeDone(failure)
        ? "MINT_SIGNED_UNHEARD"
        : "MINT_UNAVAILABLE"
    );
  }
  if (
    failure instanceof ChainApiError &&
    Object.prototype.hasOwnProperty.call(API_PROBLEMS, failure.code)
  ) {
    const [key, values] = API_PROBLEMS[failure.code]({
      failure,
      wallet,
      language,
    });
    return plain(key, values);
  }
  return plain("MINT_FAILED", [], true);
};
