import { chain, Items } from "@battlechoc/battlechoc-shared-functions";
import { ChainApiError, ChainUnreachableError } from "../../api/chainClient.js";
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../../cardano/wallet.js";
import {
  OwnerNotConfirmedError,
  UnexpectedProofTextError,
  UnsupportedAddressError,
  WalletAccountChangedError,
  WalletCannotSignError,
  WalletOtherAccountError,
  WalletSignError,
} from "../../cardano/signTx.js";
import { walletLabel } from "../account/safetyState.js";
import {
  formatAda,
  roundUpLovelace,
  SELF_SEND_LOVELACE,
  sumLovelace,
  walletChange,
} from "./ada.js";

// The minting flow (spec section 4, the mockup's board 1) as a pure reducer: which step the
// dialog shows, what each event does, and the selectors the dialog renders from. No React and
// no requests here: MintDialog.jsx performs the effects (the readiness, Mint now, the wallet,
// the polling) and reports their answers as events. A `request` event (or Back on the wallet
// step) sets `pending` to the request the dialog then sends. Times come in with the events
// (`now`, ms); nothing here reads the clock. Plain data, so the rules have unit tests
// (test/unit/mintFlow.test.js).
//
// Steps: explain (Erklärung), check (Checkliste), costs (Kosten), wallet (Ankündigung: "Your
// wallet opens now"), sign (Unterschrift: waiting for the wallet), minting (Warten), done
// (Fertig), nothing (abgelehnt: nothing happened), failed.
//
// Texts are translation keys with their values by placeholder name. Values whose name ends in
// "Ada" (haveAda, needAda, missingAda, amountAda) are lovelace strings that shownValues formats
// as ADA; every other value is shown as it is (counts of matches and mints are numbers, `time`
// an ISO time, `item` an item key, `wallet` a wallet's name or null for "your wallet").

const OPEN = ["prepared", "submitted", "included"];
// an operation's states in the order they come; final, expired and cancelled are its last
const RANK = { prepared: 0, submitted: 1, included: 2, final: 3 };
const LAST = ["final", "expired", "cancelled"];
// the steps that follow a running operation (the poll); the first three also by the item's mark
const FOLLOWING = ["wallet", "sign", "minting", "nothing", "failed"];
const FOLLOWING_BY_MARK = ["wallet", "sign", "minting"];
// the steps before "Mint now": the operation of this item, should one turn up, takes over
const BEFORE = ["explain", "check", "costs"];
// a prepared operation keeps these steps (they show it: waiting, or after a "no" in the wallet)
const KEEPS_PREPARED = ["wallet", "sign", "nothing", "failed"];
// the steps on which a wallet is asked (a wallet's failure elsewhere is a late one)
const WALLET_STEPS = ["costs", "wallet", "sign"];
const WALLET_CALLS = ["connect", "addresses", "sign"];
const SIGN_PATHS = ["extension", "phone"];
// while one of these is out, the flow waits for its answer and takes no tap
const HOLDING = ["mint", "cancel"];
// a cancel may go out while one of these is (or nothing is)
const CANCEL_BESIDE = [null, "readiness", "addresses"];

// CIP-30 TxSignError 2: the player declined the signature itself
const USER_DECLINED = 2;

/**
 * A problem as the flows show it: { key, values, action, ends, reconnect, detail } (problemOf
 * says what each field means). The salvage of a minted item (salvageFlow.js) builds its own with
 * it.
 */
export const problem = (
  key,
  values = {},
  { action = null, ends = null, reconnect = false, detail = null } = {}
) => ({ key, values, action, ends, reconnect, detail });

export const RESUME_LOST = problem(
  "MINT_RESUME_LOST",
  {},
  { action: "cancel" }
);
const FEE_CHANGED = problem("MINT_FEE_CHANGED", {}, { action: "recheck" });
const SIGNED_UNHEARD = "MINT_SIGNED_UNHEARD";
// the poll could not tell where the operation stands (never "nothing happened": it may be signed)
export const STATUS_UNKNOWN = "MINT_STATUS_UNKNOWN";
// while one of these shows, signing is not offered (only Back, or the poll's answer)
const NO_SIGNING = [SIGNED_UNHEARD, "MINT_ADDRESSES_NEEDED"];
// the calls whose failure answers the request that is out (`pending`)
const CALLS_OF_PENDING = {
  readiness: ["readiness"],
  addresses: ["addresses", "connect"],
  mint: ["mint"],
  cancel: ["cancel"],
};

// keys whose sentence cannot do without the wallet's name, and their variant without it
const NAMELESS = {
  MINT_CHECK_WALLET_TEXT: "MINT_CHECK_WALLET_TEXT_NAMELESS",
  MINT_CHECK_WAITING: "MINT_CHECK_WAITING_NAMELESS",
  MINT_NO_ACCOUNT: "MINT_NO_ACCOUNT_NAMELESS",
  MINT_CHECK_ELSEWHERE_TEXT: "MINT_CHECK_ELSEWHERE_TEXT_NAMELESS",
};

// `key` with `values`, or its nameless variant (without `wallet`) when the name is unknown
const named = (key, values) => {
  if (values.wallet !== null || !NAMELESS[key]) {
    return { key, values };
  }
  const { wallet, ...rest } = values;
  return { key: NAMELESS[key], values: rest };
};

/** Whether `operation` is open: prepared, submitted or included. */
export const isOpen = (operation) =>
  Boolean(operation) && OPEN.includes(operation.state);

const tierOf = (item) => (Items[item.item] ? Items[item.item].tier : null);

// the wallets a mint can go to: the server's list without the words key (never a mint target)
const candidatesOf = (readiness, wordsSubject) =>
  readiness && Array.isArray(readiness.wallets)
    ? readiness.wallets.filter((entry) => entry.subject !== wordsSubject)
    : [];

// the picked wallet among `candidates`: the only one by itself, else the one named `subject`
const pickedOf = (candidates, subject) =>
  candidates.length === 1
    ? candidates[0]
    : candidates.find((entry) => entry.subject === subject) || null;

const pickedWallet = (state) =>
  pickedOf(candidatesOf(state.readiness, state.wordsSubject), state.subject);

const holding = (state) => HOLDING.includes(state.pending);

// Whether the wallet `picked` (a readiness entry) can sign on this device, `here`: { wallets (the
// CIP-30 keys this browser injected), deeplink (the device opens a phone's wallet app: the wallet
// door's "deeplink" path) }. A wallet injected here signs here; on a phone the wallet app signs on
// the sign page. A wallet of unknown name may be any injected one. A signature never goes through
// the QR code, so a desktop without the wallet's extension cannot sign. `here` null (not known):
// it can.
const reachable = (picked, here) => {
  if (!here || here.deeplink === true) {
    return true;
  }
  const wallets = Array.isArray(here.wallets) ? here.wallets : [];
  return typeof picked.name === "string" && picked.name !== ""
    ? wallets.includes(picked.name)
    : wallets.length > 0;
};

// the problem of a picked wallet that cannot sign on this device: mint where it is installed
const elsewhereOf = (picked) => {
  const text = named("MINT_CHECK_ELSEWHERE_TEXT", {
    wallet: walletLabel(picked.name),
  });
  return problem(text.key, text.values);
};

// ---------------------------------------------------------------------------------------------
// The checklist

const waiting = (entry, now) => {
  if (typeof entry.waitUntil !== "string") {
    return false;
  }
  const until = Date.parse(entry.waitUntil);
  // without a time to compare (or an unreadable one) the wait still counts
  return !(typeof now === "number" && now >= until);
};

// The chain line, null when the chain does not stand in the way. `ready: false` has several
// causes the answer does not name: the index, the config, the server's key, no payable fee
// option, or a wallet the provider did not answer for in time. The last does not block (the
// mint asks the provider for the chosen wallet again and answers for itself), so a
// `ready: false` blocks only when the config was read and every asked wallet was read too.
const chainLine = (readiness) => {
  const line = (key) => ({
    id: "chain",
    met: false,
    key,
    text: `${key}_TEXT`,
    values: {},
    action: "recheck",
  });
  if (readiness.paused === true) {
    return line("MINT_CHECK_PAUSED");
  }
  const estimate = readiness.estimate || {};
  if (
    Array.isArray(readiness.gameFees) &&
    readiness.gameFees.length === 0 &&
    estimate.needed == null
  ) {
    return line("MINT_CHECK_CANNOT_MINT");
  }
  if (readiness.ready !== false) {
    return null;
  }
  if (!Array.isArray(readiness.gameFees)) {
    return line("MINT_CHECK_CHAIN");
  }
  const unread = (readiness.wallets || []).some(
    (entry) => entry.asked !== false && entry.lovelace === null
  );
  return unread ? null : line("MINT_CHECK_CHAIN");
};

const matchesLine = ({ have, need }) => {
  if (have >= need) {
    return {
      id: "matches",
      met: true,
      key: "MINT_CHECK_MATCHES_MET",
      text: "MINT_CHECK_MATCHES_HAVE",
      values: { need, have },
    };
  }
  const missing = need - have;
  return {
    id: "matches",
    met: false,
    key: missing === 1 ? "MINT_CHECK_MATCHES_ONE" : "MINT_CHECK_MATCHES",
    text: "MINT_CHECK_MATCHES_TEXT",
    values: { missing, need, have },
  };
};

const walletLine = (candidates, picked, { network, now, here }) => {
  const options =
    candidates.length > 1
      ? candidates.map((entry) => ({
          subject: entry.subject,
          name: walletLabel(entry.name),
          address: entry.address,
          picked: picked !== null && entry.subject === picked.subject,
        }))
      : [];
  const line = {
    id: "wallet",
    subject: picked ? picked.subject : null,
    options,
  };
  if (candidates.length === 0) {
    return {
      ...line,
      met: false,
      key: "MINT_CHECK_NO_WALLET",
      text: "MINT_CHECK_NO_WALLET_TEXT",
      values: {},
      action: "connect",
    };
  }
  if (!picked) {
    return {
      ...line,
      met: false,
      key: "MINT_CHECK_PICK",
      text: null,
      values: {},
    };
  }
  const wallet = walletLabel(picked.name);
  if (waiting(picked, now)) {
    const title = named("MINT_CHECK_WAITING", {
      wallet,
      time: picked.waitUntil,
    });
    return {
      ...line,
      met: false,
      key: title.key,
      text: "MINT_CHECK_WAITING_TEXT",
      values: title.values,
    };
  }
  if (!reachable(picked, here)) {
    // the earliest honest place: this device cannot sign with it (no Mint now that ends nowhere)
    const elsewhere = elsewhereOf(picked);
    return {
      ...line,
      met: false,
      key: "MINT_CHECK_ELSEWHERE",
      text: elsewhere.key,
      values: elsewhere.values,
    };
  }
  const text = named("MINT_CHECK_WALLET_TEXT", {
    wallet,
    address: picked.address,
    network,
  });
  return {
    id: "wallet",
    met: true,
    key: "MINT_CHECK_WALLET",
    text: text.key,
    values: text.values,
    subject: picked.subject,
    options,
  };
};

// the ADA line of the picked wallet, from the server's fields for it (never computed here)
const adaLine = (readiness, candidates, picked) => {
  const line = (met, key, text, values, action) => ({
    id: "ada",
    met,
    key,
    text,
    values,
    ...(action ? { action } : {}),
  });
  if (!picked) {
    const need = readiness.estimate ? readiness.estimate.needed : null;
    // no wallet yet: checked once one is connected; several: once one is chosen
    const text =
      candidates.length === 0
        ? "MINT_CHECK_ADA_LATER_TEXT"
        : "MINT_CHECK_ADA_CHOOSE_TEXT";
    return need == null
      ? line(null, "MINT_CHECK_ADA_PENDING", text, {})
      : line(null, "MINT_CHECK_ADA_LATER", text, { needAda: need });
  }
  if (picked.asked === false) {
    return line(
      null,
      "MINT_CHECK_ADA_NOT_ASKED",
      "MINT_CHECK_ADA_NOT_ASKED_TEXT",
      {}
    );
  }
  if (picked.lovelace === null) {
    return line(
      null,
      "MINT_CHECK_ADA_UNKNOWN",
      "MINT_CHECK_ADA_UNKNOWN_TEXT",
      {},
      "recheck"
    );
  }
  if (picked.enough === null) {
    // what it holds is known, what it needs is not (the config could not be read)
    return line(null, "MINT_CHECK_ADA_HAVE", null, {
      haveAda: picked.lovelace,
    });
  }
  if (picked.enough === true) {
    return line(true, "MINT_CHECK_ADA", "MINT_CHECK_ADA_TEXT", {
      haveAda: picked.lovelace,
      needAda: picked.needed,
    });
  }
  if (picked.missing !== null && BigInt(picked.missing) > 0n) {
    return line(
      false,
      "MINT_CHECK_LOW",
      "MINT_CHECK_LOW_TEXT",
      {
        haveAda: picked.lovelace,
        needAda: picked.needed,
        missingAda: picked.missing,
      },
      "getAda"
    );
  }
  if (picked.collateral === false) {
    // nothing is missing, but none of its ADA lies on its own
    return line(
      false,
      "MINT_CHECK_COLLATERAL",
      "MINT_CHECK_COLLATERAL_TEXT",
      { wallet: walletLabel(picked.name), amountAda: SELF_SEND_LOVELACE },
      "recheck"
    );
  }
  // not enough, but no reason given: the mint answers for itself
  return line(
    null,
    "MINT_CHECK_ADA_UNKNOWN",
    "MINT_CHECK_ADA_UNKNOWN_TEXT",
    {},
    "recheck"
  );
};

// the line of another item's open operation (one per player), null without one
const operationLine = (readiness, itemId) => {
  const running = readiness.operation;
  const burn = Boolean(running) && running.kind === "burn";
  if (!isOpen(running) || (running.itemId === itemId && !burn)) {
    return null;
  }
  return {
    id: "operation",
    met: false,
    // a salvage that runs (plan E) is another operation, never this flow's
    key: burn ? "MINT_CHECK_RUNNING_BURN" : "MINT_CHECK_RUNNING",
    text: "MINT_CHECK_RUNNING_TEXT",
    values: { item: running.item.item, serial: running.item.serial },
    action: "goTo",
    operation: { id: running.id, itemId: running.itemId },
  };
};

const limitLine = (left) =>
  left > 0
    ? {
        id: "limit",
        met: true,
        key: left === 1 ? "MINT_CHECK_LEFT_ONE" : "MINT_CHECK_LEFT",
        text: null,
        values: { left },
      }
    : {
        id: "limit",
        met: false,
        key: "MINT_CHECK_NONE_LEFT",
        text: "MINT_CHECK_NONE_LEFT_TEXT",
        values: { count: chain.MINTS_PER_DAY },
      };

/**
 * The checklist's lines for the readiness answer `readiness` (null: not answered yet, no lines):
 * [{ id, met, key, text, values, action?, … }] in this order: chain (only when the chain stands
 * in the way: paused, no payable fee, `ready: false` not explained by an unread wallet; alone
 * when minting is off), matches, wallet, ada, operation (only while another item's operation
 * runs), limit. `met`: true, false (blocks Continue) or null (not known yet; does not block by
 * itself). `key` is the line's title, `text` the sentence under it (or null). `action`:
 * "connect" (the wallet door), "recheck" (Check again), "getAda" (the guide, and Check again),
 * "goTo" (the running operation's item, `operation`). The wallet line has `subject` (the picked
 * one) and `options` (several wallets: [{ subject, name, address, picked }]).
 *
 * `subject`: the player's pick; `wordsSubject`: the key of this device's recovery words (never a
 * wallet to mint to); `network`: the network's label; `itemId`: the item of the flow; `now`: ms,
 * for a wallet's wait; `here`: what this device can sign with ({ wallets, deeplink }; null: not
 * known), a picked wallet it cannot sign with is unmet (MINT_CHECK_ELSEWHERE).
 */
export const checklist = (
  readiness,
  {
    subject = null,
    wordsSubject = null,
    network = null,
    itemId = null,
    now,
    here = null,
  } = {}
) => {
  if (!readiness) {
    return [];
  }
  if (readiness.enabled === false) {
    return [
      {
        id: "chain",
        met: false,
        key: "MINT_CHECK_OFF",
        text: "MINT_CHECK_OFF_TEXT",
        values: {},
      },
    ];
  }
  const candidates = candidatesOf(readiness, wordsSubject);
  const picked = pickedOf(candidates, subject);
  return [
    chainLine(readiness),
    matchesLine(readiness.matches),
    walletLine(candidates, picked, { network, now, here }),
    adaLine(readiness, candidates, picked),
    operationLine(readiness, itemId),
    limitLine(readiness.mintsLeftToday),
  ].filter(Boolean);
};

/** The checklist of the flow's state at `now` (ms). */
export const checklistOf = (state, now) =>
  checklist(state.readiness, {
    subject: state.subject,
    wordsSubject: state.wordsSubject,
    network: state.network,
    itemId: state.item.id,
    now,
    here: state.here,
  });

/**
 * The problem of the cost screen when the picked wallet cannot sign on this device (its
 * extension is not in this browser and the device opens no phone wallet app): Mint now is off,
 * nothing is prepared. Null when it can, or when no wallet is picked.
 */
export const elsewhere = (state) => {
  const picked = state.readiness ? pickedWallet(state) : null;
  return picked && !reachable(picked, state.here) ? elsewhereOf(picked) : null;
};

/** Whether Continue may be tapped: there are lines and none is unmet. */
export const canContinue = (lines) =>
  lines.length > 0 && lines.every((line) => line.met !== false);

// ---------------------------------------------------------------------------------------------
// Fees and costs

/**
 * Whether the cost screen offers a choice of the battlechoc fee: none or one option, no choice
 * ({ show: false }); two or more, { show: true, options: [{ fee (the option's index in the
 * config, what pickFee takes), label, asset }] }.
 */
export const feeChoice = (gameFees) =>
  Array.isArray(gameFees) && gameFees.length > 1
    ? {
        show: true,
        options: gameFees.map(({ fee, label, asset }) => ({
          fee,
          label,
          asset,
        })),
      }
    : { show: false };

// the option of `gameFees` with the config index `fee`; without one (none picked, or gone), the
// first; null without options
const optionOf = (gameFees, fee) => {
  if (!Array.isArray(gameFees) || gameFees.length === 0) {
    return null;
  }
  return gameFees.find((option) => option.fee === fee) || gameFees[0];
};

// a fee option's amount for `tier` (a key of TIER_ORDER); for a tier the game does not know,
// its largest, as the server's estimate takes it
const amountFor = (option, tier) => {
  const index = chain.TIER_ORDER.indexOf(tier);
  if (index !== -1) {
    return option.amounts[index];
  }
  return option.amounts.reduce((largest, amount) =>
    BigInt(amount) > BigInt(largest) ? amount : largest
  );
};

/**
 * The cost screen's numbers (lovelace strings): { networkFee, gameFee: { asset, label, amount,
 * ada } | null, deposit, total, give, stays, exact, confirmed }. `total` is the sum of the cost
 * rows; `give` and `stays` are what the wallet shows (ada.js walletChange): with an operation's
 * costs that carry `deposits`, `give` leaves out the user token's deposit, which `stays` names
 * (it goes with the item to the player's address); otherwise `give` is `total` and `stays` null.
 * - With `costs` (an operation's, after Mint now: what the transaction pays): `exact`, each
 *   amount as it is, `total` their exact sum (shown with formatAda's `exact`). `confirmed`:
 *   `ownerConfirmed`, the operation was built from addresses the wallet vouched for, so the
 *   wallet will show exactly these amounts.
 * - Else from the readiness `estimate` and the option `fee` (a config index; the first when it
 *   is not among `gameFees`) for the item's `tier`, the network fee and the deposit
 *   rounded up to the next hundredth ("about"), the battlechoc fee exact (the config's amount,
 *   `gameFee.exact`), `total` their sum, so it is the sum of the shown lines (an estimate:
 *   `exact` false).
 * A battlechoc fee in another asset than ADA (`ada: false`, its amount in that asset) is its own
 * line, never rounded and not in `total`.
 */
export const costLines = ({
  estimate,
  costs,
  gameFees,
  tier,
  fee = null,
  ownerConfirmed = false,
}) => {
  let lines;
  let change = null;
  if (costs) {
    change = walletChange(costs);
    lines = {
      networkFee: String(costs.networkFee),
      gameFee: costs.gameFee
        ? {
            asset: costs.gameFee.asset,
            label: costs.gameFee.label,
            amount: String(costs.gameFee.amount),
            ada: costs.gameFee.asset === "lovelace",
            exact: true,
          }
        : null,
      deposit: String(costs.deposit),
      exact: true,
      confirmed: ownerConfirmed === true,
    };
  } else {
    const option = optionOf(gameFees, fee);
    const ada = option !== null && option.asset === "lovelace";
    const amount = option ? amountFor(option, tier) : null;
    lines = {
      networkFee: roundUpLovelace(estimate.networkFee),
      // the config's amount: exact before the build too
      gameFee: option
        ? {
            asset: option.asset,
            label: option.label,
            amount: String(amount),
            ada,
            exact: true,
          }
        : null,
      deposit: roundUpLovelace(estimate.deposit),
      exact: false,
      confirmed: false,
    };
  }
  const feeInAda =
    lines.gameFee && lines.gameFee.ada ? [lines.gameFee.amount] : [];
  const total = sumLovelace(lines.networkFee, lines.deposit, ...feeInAda);
  return {
    networkFee: lines.networkFee,
    gameFee: lines.gameFee,
    deposit: lines.deposit,
    total,
    give: change ? change.give : total,
    stays: change ? change.stays : null,
    exact: lines.exact,
    confirmed: lines.confirmed,
  };
};

/**
 * The cost screen's rows of `costs` (costLines'), in the mockup's order: [{ kind ("network",
 * "game", "deposit"), name, text (translation keys), amount, ada (in lovelace, else in the fee's
 * asset), unit ("ADA" or the asset's label), exact (shown with every decimal; else "≈") }]. The
 * battlechoc fee is always exact (the config's amount); the network fee and the deposit only
 * once the minting is built. No game row without a fee.
 */
export const costRows = (costs) =>
  [
    {
      kind: "network",
      name: "MINT_NETWORK_FEE",
      text: "MINT_NETWORK_FEE_TEXT",
      amount: costs.networkFee,
      ada: true,
      unit: "ADA",
      exact: costs.exact,
    },
    costs.gameFee
      ? {
          kind: "game",
          name: "MINT_GAME_FEE",
          text: "MINT_GAME_FEE_TEXT",
          amount: costs.gameFee.amount,
          ada: costs.gameFee.ada,
          unit: costs.gameFee.ada ? "ADA" : costs.gameFee.label,
          exact: true,
        }
      : null,
    {
      kind: "deposit",
      name: "MINT_DEPOSIT",
      text: "MINT_DEPOSIT_TEXT",
      amount: costs.deposit,
      ada: true,
      unit: "ADA",
      exact: costs.exact,
    },
  ].filter(Boolean);

/** The costs of the flow's state: the operation's once there is one, else the estimate; null before either. */
export const costsOf = (state) => {
  const operation = state.operation;
  const costs = operation && operation.costs ? operation.costs : null;
  const estimate = state.readiness ? state.readiness.estimate : null;
  if (!costs && !estimate) {
    return null;
  }
  return costLines({
    estimate,
    costs,
    gameFees: state.readiness ? state.readiness.gameFees : null,
    tier: tierOf(state.item),
    fee: state.fee,
    ownerConfirmed: Boolean(costs) && operation.ownerConfirmed === true,
  });
};

/**
 * The text over the wallet step's amounts: MINT_WALLET_TEXT ("There you will see exactly this")
 * once the operation was built from addresses the wallet vouched for (`ownerConfirmed`), else
 * MINT_WALLET_TEXT_UNCONFIRMED (the sign page may still rebuild it for the wallet).
 */
export const walletTextKey = (state) =>
  state.operation && state.operation.ownerConfirmed === true
    ? "MINT_WALLET_TEXT"
    : "MINT_WALLET_TEXT_UNCONFIRMED";

/**
 * The body of POST /chain/mint for the state: { itemId, subject, fee (the picked option's index
 * in the config, 0 without options), addresses (the wallet's own, once the flow has them: on
 * the extension path always) }; null while no wallet is picked.
 */
export const mintRequest = (state) => {
  const picked = state.readiness ? pickedWallet(state) : null;
  if (!picked) {
    return null;
  }
  const option = optionOf(state.readiness.gameFees, state.fee);
  return {
    itemId: state.item.id,
    subject: picked.subject,
    fee: option ? option.fee : 0,
    ...(state.addresses ? { addresses: state.addresses } : {}),
  };
};

// ---------------------------------------------------------------------------------------------
// Time

/**
 * The sign window of a prepared `operation` at `now` (ms): { over, minutes } (the minutes left,
 * rounded up; 0 once it is over, or when the time cannot be read); null for anything that is not
 * a prepared operation.
 */
export const signWindow = (operation, now) => {
  if (!operation || operation.state !== "prepared") {
    return null;
  }
  const left = Date.parse(operation.signUntil) - now;
  if (!(left > 0)) {
    return { over: true, minutes: 0 };
  }
  return { over: false, minutes: Math.ceil(left / 60000) };
};

// whether the signature may have gone out unheard: the poll decides first
const unheardSignature = (state) =>
  Boolean(state.problem) && state.problem.key === SIGNED_UNHEARD;

/**
 * Whether the problem shown rules out signing this operation again (the signature may have gone
 * out unheard; the minting must be started again: MINT_ADDRESSES_NEEDED).
 */
export const noSigning = (state) =>
  Boolean(state.problem) && NO_SIGNING.includes(state.problem.key);

/**
 * What the wallet step shows (D47): `prompts`, its texts, the time left and Open wallet, only
 * with this tab's sign code and no problem that rules signing out; without them the step shows
 * its problem (MINT_RESUME_LOST, or the poll's text while it cannot tell) and the wallet box.
 * `back`: the step's own Back (it cancels): always beside the prompts, else only where the
 * operation can be cancelled, no problem rules it out and the problem offers no Cancel of its own.
 */
export const walletStepView = (state) => {
  const prompts = Boolean(state.signCode) && !noSigning(state);
  if (prompts) {
    return { prompts, back: true };
  }
  return {
    prompts,
    back:
      canCancel(state) &&
      !noSigning(state) &&
      !(state.problem && state.problem.action === "cancel"),
  };
};

/**
 * Whether Open wallet may be tapped at `now`: the wallet step, this tab's sign code, the window
 * open, and no problem that rules signing out (a signature that may have gone out unheard; an
 * operation that must be started again: MINT_ADDRESSES_NEEDED).
 */
export const canSign = (state, now) => {
  if (
    state.step !== "wallet" ||
    state.pending !== null ||
    !state.signCode ||
    noSigning(state)
  ) {
    return false;
  }
  const signing = signWindow(state.operation, now);
  return signing !== null && !signing.over;
};

/**
 * Whether Cancel (or Back on the wallet step) may be tapped: this item's operation is prepared,
 * no Mint now or cancel is out (a readiness or address request may be), and no signature may
 * have gone out unheard.
 */
export const canCancel = (state) =>
  Boolean(state.operation) &&
  state.operation.state === "prepared" &&
  state.operation.itemId === state.item.id &&
  CANCEL_BESIDE.includes(state.pending) &&
  !unheardSignature(state);

/**
 * The operation the dialog polls (GET /chain/operations/:id) while it is open and the flow
 * shows it (wallet, sign, minting; nothing and failed after a "no" in the wallet, until its
 * window is over), or is known only by the item's mark; null otherwise.
 */
export const pollTarget = (state) => {
  if (state.operation) {
    return FOLLOWING.includes(state.step) && isOpen(state.operation)
      ? state.operation.id
      : null;
  }
  return FOLLOWING_BY_MARK.includes(state.step) ? state.operationId : null;
};

// ---------------------------------------------------------------------------------------------
// Failures

// the operation's `error` values (chain_ops.error) when it ended
const OPERATION_PROBLEMS = {
  "not-signed": problem(
    "MINT_TIME_UP",
    { minutes: chain.SIGN_WINDOW_MS / 60000 },
    { action: "retry", ends: "failed" }
  ),
  expired: problem("MINT_EXPIRED", {}, { action: "retry", ends: "failed" }),
  // the network refused it: not necessarily because the wallet's ADA was spent elsewhere
  rejected: problem("MINT_NOT_TAKEN", {}, { action: "retry", ends: "failed" }),
  cancelled: problem(
    "MINT_WAS_CANCELLED",
    {},
    { action: "retry", ends: "nothing" }
  ),
};

const unavailable = () =>
  problem("MINT_UNAVAILABLE", {}, { action: "recheck" });
const gone = (key) => () => problem(key, {}, { ends: "failed" });
const recheck = (key) => () => problem(key, {}, { action: "recheck" });
const notOpen = () => problem("MINT_NOT_OPEN");

// the API's codes (apps/api/src/errors.js) and what the player reads for each
const API_PROBLEMS = {
  // every number from the refusal itself (the build's verdict), none from the readiness
  "NOT ENOUGH ADA": (failure) => {
    const details = failure.details || {};
    // a refusal without its numbers: the sentence without them (never "about undefined ADA")
    if (details.needed == null || details.missing == null) {
      return problem("MINT_NOT_ENOUGH_ADA_PLAIN", {}, { action: "recheck" });
    }
    return problem(
      "MINT_NOT_ENOUGH_ADA",
      { needAda: details.needed, missingAda: details.missing },
      { action: "recheck" }
    );
  },
  "NO COLLATERAL": (failure, { wallet }) =>
    problem(
      "MINT_NO_COLLATERAL",
      { wallet, amountAda: SELF_SEND_LOVELACE },
      { action: "recheck" }
    ),
  "WALLET TOO FULL": (failure, { wallet }) =>
    problem("MINT_WALLET_TOO_FULL", { wallet }, { action: "recheck" }),
  // with the extension's addresses sent: the extension is open on another account than the
  // one picked (the server found no address of that wallet among them)
  "NOT YOUR WALLET": (failure, { wallet, addressesSent }) =>
    addressesSent
      ? problem("MINT_OTHER_WALLET", { wallet }, { reconnect: true })
      : problem("MINT_NOT_YOUR_WALLET", {}, { action: "recheck" }),
  "WALLET WAITING": recheck("MINT_CHECK_WAITING_TEXT"),
  "NOT ENOUGH MATCHES": (failure, { readiness }) => {
    const matches = (readiness && readiness.matches) || {};
    const need = matches.need ?? chain.MINT_MIN_ONLINE_MATCHES;
    // without the count played, the sentence without it (never "You have null.")
    return matches.have == null
      ? problem("MINT_CHECK_MATCHES_NEED", { need }, { action: "recheck" })
      : problem(
          "MINT_CHECK_MATCHES_TEXT",
          { need, have: matches.have },
          { action: "recheck" }
        );
  },
  "MINT LIMIT": () =>
    problem(
      "MINT_CHECK_NONE_LEFT_TEXT",
      { count: chain.MINTS_PER_DAY },
      { action: "recheck" }
    ),
  "OPERATION RUNNING": recheck("MINT_BUSY"),
  "ITEM BUSY": recheck("MINT_BUSY"),
  "NOT YOUR ITEM": gone("MINT_ITEM_GONE"),
  // an operation that is not the player's, or whose item is gone (salvaged meanwhile)
  "NOT FOUND": gone("MINT_ITEM_GONE"),
  "ALREADY MINTED": gone("MINT_ALREADY_MINTED"),
  "ITEM MINTED": gone("MINT_ALREADY_MINTED"),
  "CHAIN OFF": gone("MINT_OFF"),
  "CHAIN PAUSED": recheck("MINT_PAUSED"),
  "CHAIN UNAVAILABLE": unavailable,
  "INTERNAL SERVER ERROR": unavailable,
  "TOO MANY REQUESTS": unavailable,
  "UNKNOWN FEE": recheck("MINT_FEE_CHANGED"),
  "UNKNOWN SIGN CODE": notOpen,
  "OPERATION NOT OPEN": notOpen,
  "INVALID WITNESS": (failure, { wallet }) =>
    problem("MINT_BAD_SIGNATURE", { wallet }),
  // the server did not accept the wallet's proof of its addresses (the sign page's rebuild)
  "INVALID SIGNATURE": () => problem("MINT_PROOF_REFUSED"),
  // the operation was built without addresses the wallet vouched for (the phone path); the
  // game's own path always sends them: cancel it and start again (Back on the wallet step)
  "ADDRESSES NEEDED": () =>
    problem("MINT_ADDRESSES_NEEDED", {}, { action: "back" }),
};

// A failure after which the server may still have done what was asked: no answer, a server
// error (a proxy's 502 can come after the API answered), an answer that is not the API's. A
// limit (429) or the server's own CHAIN UNAVAILABLE / CHAIN PAUSED came before anything was done.
export const unheard = (failure) => {
  if (failure instanceof ChainUnreachableError) {
    return failure.reason !== "busy";
  }
  return (
    failure instanceof ChainApiError &&
    failure.status >= 500 &&
    !["CHAIN UNAVAILABLE", "CHAIN PAUSED"].includes(failure.code)
  );
};

// what a call that may have been done unheard says, by the call
const UNHEARD = {
  // the signature may have gone out: never "nothing happened"; the poll tells
  submit: () => problem(SIGNED_UNHEARD),
  // the operation may be prepared (and lock the item): Check again finds it
  mint: () => problem("MINT_ANSWER_LOST", {}, { action: "recheck" }),
  // the cancel may have happened: the poll tells
  cancel: () => problem("MINT_CANCEL_ANSWER_LOST"),
};

const WALLET_ERRORS = [
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
  UnsupportedAddressError,
  WalletAccountChangedError,
  WalletCannotSignError,
  WalletOtherAccountError,
  WalletSignError,
];

const isWalletFailure = (failure, during) =>
  WALLET_CALLS.includes(during) ||
  WALLET_ERRORS.some((kind) => failure instanceof kind);

const detailOf = (failure) =>
  failure instanceof Error
    ? `${failure.name}: ${failure.message}`
    : String(failure);

const walletProblem = (failure, { during, wallet, network }) => {
  if (during === "connect") {
    // connecting (enable): a "no" there is how a wallet without an account, or a locked one,
    // answers; anything else keeps its detail
    const text = named("MINT_NO_ACCOUNT", { wallet, network });
    return problem(text.key, text.values, {
      reconnect: true,
      detail:
        failure instanceof WalletCancelledError ? null : detailOf(failure),
    });
  }
  if (failure instanceof WalletCancelledError) {
    if (during !== "sign") {
      // before any signature (reading the addresses): the game lost its access to the wallet
      return problem("MINT_WALLET_LOST", { wallet }, { reconnect: true });
    }
    const cause = failure.cause;
    if (
      cause !== null &&
      typeof cause === "object" &&
      cause.code === USER_DECLINED
    ) {
      return problem(
        "MINT_CANCELLED",
        {},
        { action: "retry", ends: "nothing" }
      );
    }
    // a refusal (-3) or a "no" in words: at the signature or before it, which the error does not
    // tell; nothing happened either way, and connecting anew is offered
    return problem(
      "MINT_WALLET_SAID_NO",
      { wallet },
      { action: "retry", ends: "nothing", reconnect: true }
    );
  }
  if (failure instanceof WalletNetworkError) {
    return problem("MINT_WRONG_NETWORK", { wallet, network });
  }
  if (failure instanceof WalletOtherAccountError) {
    return problem("MINT_OTHER_WALLET", { wallet });
  }
  if (failure instanceof WalletAccountChangedError) {
    return problem("MINT_ACCOUNT_CHANGED", { wallet }, { reconnect: true });
  }
  if (failure instanceof WalletCannotSignError) {
    return problem("MINT_WALLET_CANNOT_SIGN", { wallet });
  }
  if (failure instanceof WalletWithoutAddressError) {
    return problem("MINT_NO_ADDRESS", { wallet });
  }
  if (failure instanceof UnsupportedAddressError) {
    return problem("MINT_ADDRESS_UNSUPPORTED", { wallet });
  }
  if (failure instanceof WalletSignError) {
    return problem("MINT_FAILED", {}, { detail: failure.detail });
  }
  if (failure instanceof OwnerNotConfirmedError) {
    // the server's rebuilt answer was not this operation's confirmed one: battlechoc's fault,
    // nothing was signed (signing may be tried again)
    return problem("MINT_OWNER_NOT_CONFIRMED", {}, { detail: failure.reason });
  }
  if (failure instanceof UnexpectedProofTextError) {
    // the text to sign was not battlechoc's address proof for this mint (an expiry beyond the
    // sign window too): the wallet was not asked
    return problem("MINT_PROOF_TEXT", {}, { detail: failure.field });
  }
  return null;
};

/**
 * What the player reads for `failure`: { key, values, action, ends, reconnect, detail }.
 *
 * `failure`: a ChainApiError (by its `code`; an unknown code by `retryable`), a
 * ChainUnreachableError, a wallet error of cardano/wallet.js or cardano/signTx.js, an operation's
 * `error` value (a string: "not-signed", "expired", "rejected", "cancelled"), or anything else.
 * `during`: the call that failed: "readiness", "addresses" (walletAddresses), "connect" (the
 * wallet's enable), "mint", "sign" (signMintTx), "submit" (POST /chain/sign/:code), "cancel",
 * "operation" (the poll). `wallet`: the wallet's name as players read it (null: the dialog says
 * "your wallet", or the key has a nameless variant); `network`: the network's label;
 * `readiness`: the flow's, for the numbers of a refusal; `addressesSent`: the mint request
 * carried the wallet's own addresses (the extension path).
 *
 * `action`: what the problem offers besides the step's own button: "recheck" (Check again: the
 * retry event), "retry" (Try again), "cancel" (Cancel the prepared operation), "back" (Back on
 * the wallet step: cancel, then the cost screen), or null. `ends`: "nothing" or "failed" when
 * the flow ends there, null when it stays on its step (from the sign step: back to the wallet
 * step). `reconnect`: the dialog drops the wallet's api it holds and connects anew on the next
 * tap. `detail`: a technical line for causes without a name.
 */
export const problemOf = (
  failure,
  {
    during,
    wallet = null,
    network = null,
    readiness = null,
    addressesSent = false,
  } = {}
) => {
  const context = { during, wallet, network, readiness, addressesSent };
  if (typeof failure === "string") {
    return (
      OPERATION_PROBLEMS[failure] ||
      problem("MINT_FAILED", {}, { action: "retry", ends: "failed" })
    );
  }
  if (UNHEARD[during] && unheard(failure)) {
    return UNHEARD[during]();
  }
  if (failure instanceof ChainApiError) {
    const known = Object.prototype.hasOwnProperty.call(
      API_PROBLEMS,
      failure.code
    )
      ? API_PROBLEMS[failure.code]
      : null;
    if (known) {
      return known(failure, context);
    }
    return failure.retryable
      ? unavailable()
      : problem(
          "MINT_FAILED",
          {},
          { action: "recheck", detail: failure.message }
        );
  }
  if (failure instanceof ChainUnreachableError) {
    return unavailable();
  }
  return (
    walletProblem(failure, context) ||
    problem("MINT_FAILED", {}, { detail: detailOf(failure) })
  );
};

/**
 * `values` of a line or a problem as the text shows them in `language`: the values named
 * "…Ada" as ADA (haveAda, what a wallet holds, rounded down; the others rounded up, at most two
 * decimals: they are estimates or amounts to send), a `wallet` that is null as `wallet` (the
 * dialog's "your wallet" in that language) when given, the rest as it is.
 */
export const shownValues = (values, language, { wallet } = {}) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      if (name.endsWith("Ada") && value != null) {
        const round = name === "haveAda" ? "down" : "up";
        return [name, formatAda(value, language, { round })];
      }
      if (name === "wallet" && value === null && wallet !== undefined) {
        return [name, wallet];
      }
      return [name, value];
    })
  );

// ---------------------------------------------------------------------------------------------
// The state and its events

const ENDED = {
  signCode: null,
  via: null,
  pending: null,
  afterCancel: null,
};

// the state with `operation` (a view of this item's operation) taken in: the step it stands for
const withOperation = (state, operation) => {
  const rebuilt =
    state.operation &&
    state.operation.id === operation.id &&
    state.operation.txHash !== operation.txHash;
  const next = {
    ...state,
    operation,
    operationId: operation.id,
    subject: operation.subject || state.subject,
    // the sign page rebuilt it for the wallet: an answer about the old transaction is late
    pastTxHashes: rebuilt
      ? [...state.pastTxHashes, state.operation.txHash]
      : state.pastTxHashes,
    // an answer of the poll: it can tell where the operation stands again (a prepared one this
    // tab has no code for: that it cannot sign it, as before the poll failed)
    problem:
      state.problem && state.problem.key === STATUS_UNKNOWN
        ? state.step === "wallet" &&
          operation.state === "prepared" &&
          !state.signCode
          ? RESUME_LOST
          : null
        : state.problem,
  };
  // the flow ended on a reason of its own (the item is gone, …): the operation's end keeps it
  const keepsFailure = state.step === "failed" && next.problem !== null;
  switch (operation.state) {
    case "prepared":
      if (KEEPS_PREPARED.includes(state.step)) {
        return next;
      }
      return {
        ...next,
        step: "wallet",
        pending: state.pending === "mint" ? null : state.pending,
        problem: state.signCode ? null : RESUME_LOST,
      };
    case "submitted":
      return { ...next, ...ENDED, step: "minting", problem: null };
    case "included":
    case "final":
      return { ...next, ...ENDED, step: "done", problem: null };
    case "expired":
      return {
        ...next,
        ...ENDED,
        step: "failed",
        problem: keepsFailure ? next.problem : problemOf(operation.error),
      };
    case "cancelled":
      if (state.afterCancel === "costs") {
        // Back on the wallet step: the cancel is confirmed, the cost screen again
        return {
          ...next,
          ...ENDED,
          step: "costs",
          operation: null,
          operationId: null,
          addresses: null,
          pastOperations: [...state.pastOperations, operation.id],
          problem: null,
        };
      }
      if (keepsFailure) {
        return { ...next, ...ENDED };
      }
      return {
        ...next,
        ...ENDED,
        step: "nothing",
        problem: problemOf("cancelled"),
      };
    default:
      // a state this build does not know: what the dialog shows stays
      return state;
  }
};

// a salvage of the item (kind "burn", plan E) is never this flow's operation
const isThisItems = (state, operation) =>
  Boolean(operation) &&
  operation.itemId === state.item.id &&
  operation.kind !== "burn";

// Whether `operation` is an answer that came too late: about an operation the flow has left, or
// of a lower state than the one the flow already has for it (a poll sent before the signature
// that arrives after it). Nothing comes after its last state. The one move back that happens
// is a rollback: included → submitted.
export const isLate = (state, operation) => {
  if (state.pastOperations.includes(operation.id)) {
    return true;
  }
  const current = state.operation;
  if (!current || current.id !== operation.id) {
    return false;
  }
  if (state.pastTxHashes.includes(operation.txHash)) {
    // about the transaction before the sign page built it again for the wallet
    return true;
  }
  if (LAST.includes(current.state)) {
    return true;
  }
  if (LAST.includes(operation.state)) {
    return false;
  }
  if (current.state === "included" && operation.state === "submitted") {
    return false;
  }
  return RANK[operation.state] < RANK[current.state];
};

// an answer about this item's operation, taken in unless it is late
const takeOperation = (state, operation) =>
  isThisItems(state, operation) && !isLate(state, operation)
    ? withOperation(state, operation)
    : state;

/**
 * The flow's first state, when the dialog opens for `item` (an entry of stats.items: { id, item,
 * serial, minted }).
 *
 * - `explained`: the player has seen the explainer (settings' mintExplained);
 * - `operation`: this item's operation as the server has it, when the dialog knows it (another
 *   item's is left to the checklist);
 * - `signCode`: this tab's sign code of that operation (sessionStorage);
 * - `network`: the network's label; `wordsSubject`: the key of this device's recovery words;
 * - `here`: what this device can sign with, { wallets (the CIP-30 keys this browser injected),
 *   deeplink (it opens a phone's wallet app) }; null when not known (taken as able).
 *
 * An operation of this item: prepared → wallet (without this tab's code: with MINT_RESUME_LOST
 * and Cancel); submitted → minting; included or final → done; expired → failed, cancelled →
 * nothing, each with its text. Without one, the item's mark (`minted.state` "minting", the
 * server's operationId) gives the step until the operation is read. Else check, or explain the
 * first time.
 */
export const initialState = ({
  item,
  explained = false,
  operation = null,
  signCode = null,
  network = null,
  wordsSubject = null,
  here = null,
}) => {
  const mark = item.minted || null;
  const base = {
    step: explained ? "check" : "explain",
    item,
    explained: Boolean(explained),
    network,
    wordsSubject,
    here,
    readiness: null,
    subject: null,
    // the picked battlechoc fee option's index in the config; null: the first option
    fee: null,
    addresses: null,
    operation: null,
    operationId: null,
    // operations of this item the flow has left (late answers about them are ignored)
    pastOperations: [],
    // transactions of the operation that were built again for the wallet (answers about them are
    // late)
    pastTxHashes: [],
    signCode: null,
    via: null,
    pending: null,
    // "costs" while a cancel sent by Back on the wallet step is out
    afterCancel: null,
    problem: null,
  };
  if (isThisItems(base, operation)) {
    return withOperation({ ...base, signCode }, operation);
  }
  if (mark && mark.state === "minting" && mark.operationId) {
    return {
      ...base,
      step: mark.signing ? "wallet" : "minting",
      operationId: mark.operationId,
      signCode: mark.signing ? signCode : null,
      problem: mark.signing && !signCode ? RESUME_LOST : null,
    };
  }
  if (mark && mark.state === "minted") {
    return { ...base, step: "done" };
  }
  return base;
};

/** `addresses` when it is a list of addresses (non-empty strings), else null. */
export const validAddresses = (addresses) =>
  Array.isArray(addresses) &&
  addresses.length > 0 &&
  addresses.every((address) => typeof address === "string" && address !== "")
    ? addresses
    : null;

const requestAllowed = (state, { what, itemId, path }) => {
  if (what === "cancel") {
    return canCancel(state);
  }
  if (state.pending !== null) {
    return false;
  }
  switch (what) {
    case "readiness":
      return itemId === state.item.id;
    case "addresses":
      return state.step === "costs";
    case "mint":
      // the extension path never sends a mint without the wallet's own addresses
      return (
        state.step === "costs" &&
        SIGN_PATHS.includes(path) &&
        (path === "phone" || state.addresses !== null) &&
        mintRequest(state) !== null &&
        elsewhere(state) === null
      );
    default:
      return false;
  }
};

const onReadiness = (state, { answer, itemId }) => {
  if (itemId !== state.item.id) {
    // an answer about another item (the dialog moved on)
    return state;
  }
  const next = {
    ...state,
    readiness: answer,
    pending: state.pending === "readiness" ? null : state.pending,
    problem: state.step === "check" ? null : state.problem,
  };
  if (!isOpen(state.operation)) {
    const candidates = candidatesOf(answer, state.wordsSubject);
    const picked = pickedOf(candidates, state.subject);
    next.subject = picked ? picked.subject : null;
  }
  const gameFees = answer ? answer.gameFees : null;
  if (
    state.fee !== null &&
    Array.isArray(gameFees) &&
    !gameFees.some((option) => option.fee === state.fee)
  ) {
    // the picked option is gone: the first one, and the player is told
    next.fee = null;
    if (BEFORE.includes(state.step)) {
      next.problem = FEE_CHANGED;
    }
  }
  const running = answer ? answer.operation : null;
  if (
    isOpen(running) &&
    BEFORE.includes(state.step) &&
    state.pending !== "mint"
  ) {
    // this item's operation, started elsewhere (Mint now's own answer is the 201)
    return takeOperation(next, running);
  }
  return next;
};

// a poll that failed for good (pollOperation tries the others again): for an operation the
// flow follows, the step stays as it is; an end already shown keeps its text. An operation the
// server no longer has for the player (its item was salvaged meanwhile) ends the flow there.
const onPollProblem = (state, failure, flow) => {
  if (
    flow.pollTarget(state) === null ||
    (["nothing", "failed"].includes(state.step) && state.problem)
  ) {
    return state;
  }
  if (failure instanceof ChainApiError && failure.code === "NOT FOUND") {
    const id = state.operationId;
    return {
      ...state,
      ...ENDED,
      step: "failed",
      operation: null,
      operationId: null,
      pastOperations: id ? [...state.pastOperations, id] : state.pastOperations,
      problem: flow.describe(failure, { during: "operation" }),
    };
  }
  if (noSigning(state)) {
    // a problem that rules signing (and maybe cancelling) out stays: the poll knows no better
    return state;
  }
  return { ...state, problem: problem(STATUS_UNKNOWN) };
};

// what problemEvent needs of a flow: the calls whose failure answers the request that is out
// (by `pending`), the requests during which no other failure counts (`holding`), the steps on
// which a wallet is asked, the request that prepares the operation (`prepare`), the wallet's
// name as players read it, the poll's target and the text of a failure (`describe`: problemOf's
// arguments)
const MINT_PROBLEMS = {
  callsOfPending: CALLS_OF_PENDING,
  holding: HOLDING,
  walletSteps: WALLET_STEPS,
  prepare: "mint",
  walletName: (state) => {
    const picked = pickedWallet(state);
    return picked ? picked.name : null;
  },
  pollTarget: (state) => pollTarget(state),
  describe: (failure, context) => problemOf(failure, context),
};

/**
 * The state after a `problem` event ({ failure, during, wallet, operationId }: see mintFlow) for
 * the flow `flow` (the minting's by default; the salvage of a minted item passes its own: its
 * calls, steps, poll and texts, salvageFlow.js): a late outcome of an operation the flow left or
 * that ended is dropped, a failure beside a held request waits for that request's answer, a
 * wallet's failure off the wallet steps is late, a poll that failed keeps the step (an operation
 * that is gone ends it); else the problem shows, ending the flow where it says so.
 */
export const problemEvent = (
  state,
  { failure, during, wallet, operationId },
  flow = MINT_PROBLEMS
) => {
  if (operationId !== undefined && operationId !== state.operationId) {
    // the outcome of a signature or a cancel for an operation the flow has left
    return state;
  }
  if (
    operationId !== undefined &&
    state.operation &&
    state.operation.id === operationId &&
    LAST.includes(state.operation.state)
  ) {
    // a late failure for an operation that has ended: its end (cancelled, expired, final) and
    // its text stay
    return state;
  }
  const call = during || (state.step === "sign" ? "sign" : undefined);
  // whether the failed call is the request the flow waits for
  const own =
    state.pending !== null &&
    (flow.callsOfPending[state.pending] || []).includes(call);
  if (flow.holding.includes(state.pending) && !own) {
    // Mint now or a cancel is out: its answer decides, not another call's failure
    return state;
  }
  if (call === "operation") {
    return onPollProblem(state, failure, flow);
  }
  if (call === "readiness" && !["check", "costs"].includes(state.step)) {
    // the checklist's answer is not what these steps show: the operation is
    return state.pending === "readiness" ? { ...state, pending: null } : state;
  }
  if (
    isWalletFailure(failure, call) &&
    !flow.walletSteps.includes(state.step)
  ) {
    // a wallet's late answer: the flow has moved on
    return state;
  }
  const shown = flow.describe(failure, {
    during: call,
    wallet: walletLabel(wallet || flow.walletName(state)),
    network: state.network,
    readiness: state.readiness,
    addressesSent: call === flow.prepare && state.addresses !== null,
  });
  let step = shown.ends || state.step;
  if (!shown.ends && state.step === "sign") {
    step = "wallet";
  }
  return {
    ...state,
    step,
    problem: shown,
    // a request of another call that is still out keeps its mark until its own answer
    pending: own ? null : state.pending,
    afterCancel: own ? null : state.afterCancel,
    via: step === "sign" ? state.via : null,
    // a code the server no longer takes is of no use
    signCode: shown.key === "MINT_NOT_OPEN" ? null : state.signCode,
    // a new connection reads the wallet's addresses anew
    addresses: shown.reconnect ? null : state.addresses,
  };
};

// this tab's sign code for an operation the flow learned without one (sessionStorage kept it)
/** The state with this tab's sign code `signCode` for its prepared operation `operationId` (a `signCode` event). */
export const withSignCode = (state, { operationId, signCode }) => {
  if (
    typeof signCode !== "string" ||
    signCode === "" ||
    state.signCode ||
    !state.operation ||
    state.operation.id !== operationId ||
    state.operation.state !== "prepared"
  ) {
    return state;
  }
  return {
    ...state,
    signCode,
    problem:
      state.problem && state.problem.key === RESUME_LOST.key
        ? null
        : state.problem,
  };
};

// `here`: what this device can sign with, read again by the dialog at the tap (an extension
// enabled since the dialog opened); without it the known one stays
const onRetry = (state, { here } = {}) => {
  if (["sign", "minting", "done"].includes(state.step)) {
    return state;
  }
  const operation = state.operation;
  if (isOpen(operation)) {
    if (operation.state === "prepared") {
      return {
        ...state,
        step: "wallet",
        problem: state.signCode ? null : RESUME_LOST,
      };
    }
    return withOperation({ ...state, step: "check" }, operation);
  }
  if (!operation && state.operationId) {
    // known only by the item's mark: the poll tells where it stands
    return state;
  }
  return {
    ...state,
    step: "check",
    readiness: null,
    problem: null,
    operation: null,
    operationId: null,
    pastOperations: operation
      ? [...state.pastOperations, operation.id]
      : state.pastOperations,
    signCode: null,
    addresses: null,
    via: null,
    pending: null,
    here: here === undefined ? state.here : here,
  };
};

const onBack = (state) => {
  if (state.step === "costs" || (state.step === "explain" && state.explained)) {
    return { ...state, step: "check", problem: null };
  }
  if (state.step === "wallet" && canCancel(state)) {
    // cancel the prepared operation; the cost screen once the cancel is confirmed
    return {
      ...state,
      pending: "cancel",
      afterCancel: "costs",
      problem: null,
    };
  }
  return state;
};

/** Open wallet (`{ via, now }`, "extension" or "phone"): the sign step, where canSign allows it. */
export const signingTap = (state, event) => {
  if (!SIGN_PATHS.includes(event.via) || !canSign(state, event.now)) {
    return state;
  }
  return { ...state, step: "sign", via: event.via, problem: null };
};

/**
 * Open wallet again on the phone path's waiting step: back to the wallet step, the prepared
 * operation untouched (the deep link failed, or the player came back before signing); Open
 * wallet there as canSign says.
 */
export const walletAgainTap = (state) =>
  state.step === "sign" && state.via === "phone"
    ? { ...state, step: "wallet", via: null, problem: null }
    : state;

// the taps, which wait while Mint now or a cancel is out
const TAPS = {
  pickWallet: (state, event) => {
    const candidates = candidatesOf(state.readiness, state.wordsSubject);
    if (
      state.step !== "check" ||
      !candidates.some((entry) => entry.subject === event.subject)
    ) {
      return state;
    }
    return {
      ...state,
      subject: event.subject,
      // another wallet's addresses are not this one's
      addresses: event.subject === state.subject ? state.addresses : null,
      problem: null,
    };
  },
  pickFee: (state, event) => {
    const gameFees = state.readiness && state.readiness.gameFees;
    if (
      !["check", "costs"].includes(state.step) ||
      !Array.isArray(gameFees) ||
      !gameFees.some((option) => option.fee === event.fee)
    ) {
      return state;
    }
    return { ...state, fee: event.fee, problem: null };
  },
  explain: (state) =>
    ["check", "costs"].includes(state.step) && !isOpen(state.operation)
      ? { ...state, step: "explain" }
      : state,
  next: (state, event) => {
    if (state.step === "explain") {
      return { ...state, step: "check", explained: true };
    }
    if (state.step === "check" && canContinue(checklistOf(state, event.now))) {
      return { ...state, step: "costs", problem: null };
    }
    return state;
  },
  back: onBack,
  signing: (state, event) => signingTap(state, event),
  retry: onRetry,
  walletAgain: (state) => walletAgainTap(state),
};

/**
 * The next state of the flow after `event` (pure; an event that does not apply to the state
 * answers the state itself).
 *
 * Taps (none is taken while Mint now or a cancel is out):
 * - `{ type: 'pickWallet', subject }`, `{ type: 'pickFee', fee }` (an option's config index);
 * - `{ type: 'explain' }` (What is this?), `{ type: 'next', now }`;
 * - `{ type: 'back' }`: costs → check; on the wallet step it cancels the prepared operation
 *   (`pending: 'cancel'`) and lands on costs once the cancel is confirmed;
 * - `{ type: 'signing', via, now }`: Open wallet ("extension" or "phone");
 * - `{ type: 'walletAgain' }`: Open wallet again on the phone path's waiting step (back to the
 *   wallet step, nothing cancelled);
 * - `{ type: 'retry', here? }`: Check again, Try again (`here`: what the device can sign with now).
 *
 * Requests (`pending` is set to the request the dialog then sends):
 * - `{ type: 'request', what, itemId?, path? }`: "readiness" (`itemId`: the flow's item),
 *   "addresses", "mint" (`path`: "extension", which needs the wallet's addresses, or "phone"),
 *   "cancel" (also while readiness or addresses are out).
 *
 * Answers:
 * - `{ type: 'readiness', answer, itemId }`: GET /chain/readiness answered for `itemId`;
 * - `{ type: 'addresses', addresses }`: the wallet's own (the extension path, before Mint now);
 * - `{ type: 'prepared', answer }`: POST /chain/mint's 201 ({ operation, tx, signCode, costs });
 * - `{ type: 'signed', answer }`: POST /chain/sign/:code's answer ({ state, operation });
 * - `{ type: 'operation', operation }`: this item's operation as the server has it (the poll, a
 *   cancel's answer); a late one (a lower state than known, after its last) is ignored, but a
 *   rollback (included → submitted);
 * - `{ type: 'problem', failure, during, wallet, operationId }`: a call failed (problemOf);
 *   `wallet`: the CIP-30 name of the wallet that was asked, when it is not the picked one;
 *   `operationId`: the operation a signature or a cancel was for (another one's is ignored);
 * - `{ type: 'signCode', operationId, signCode }`: this tab's code for the prepared operation
 *   the flow learned without one.
 */
export const mintFlow = (state, event) => {
  const type = event && event.type;
  if (Object.prototype.hasOwnProperty.call(TAPS, type)) {
    return holding(state) ? state : TAPS[type](state, event);
  }
  switch (type) {
    case "readiness":
      return onReadiness(state, event);
    case "request":
      if (!requestAllowed(state, event)) {
        return state;
      }
      return {
        ...state,
        pending: event.what,
        // a new attempt drops what the last one said; the readiness only reads the checklist
        // (the dialog asks for it when it opens, also on a step that shows a problem: a minting
        // this tab cannot sign keeps saying so, with its Cancel)
        problem: event.what === "readiness" ? state.problem : null,
        // read anew: what was read before may be another wallet's (or account's)
        addresses: event.what === "addresses" ? null : state.addresses,
      };
    case "addresses":
      return {
        ...state,
        addresses: validAddresses(event.addresses),
        pending: state.pending === "addresses" ? null : state.pending,
      };
    case "prepared": {
      const answer = event.answer;
      if (
        state.step !== "costs" ||
        !answer ||
        !isThisItems(state, answer.operation)
      ) {
        return state;
      }
      return withOperation(
        {
          ...state,
          signCode: answer.signCode,
          pending: null,
          problem: null,
        },
        answer.operation
      );
    }
    case "signed": {
      const operation = event.answer && event.answer.operation;
      if (
        !["wallet", "sign"].includes(state.step) ||
        !isThisItems(state, operation) ||
        isLate(state, operation)
      ) {
        return state;
      }
      return withOperation({ ...state, signCode: null }, operation);
    }
    case "operation":
      return takeOperation(state, event.operation);
    case "signCode":
      return withSignCode(state, event);
    case "problem":
      return problemEvent(state, event);
    default:
      return state;
  }
};
