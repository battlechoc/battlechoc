import { ChainApiError } from "../../api/chainClient.js";
import { WalletOtherAccountError } from "../../cardano/signTx.js";
import { walletLabel } from "../account/safetyState.js";
import {
  canCancel,
  isLate,
  isOpen,
  problem,
  problemEvent,
  problemOf,
  RESUME_LOST,
  signingTap,
  STATUS_UNKNOWN,
  unheard,
  validAddresses,
  walletAgainTap,
  withSignCode,
} from "./mintFlow.js";

// The salvage of a minted item (plan E, the owner's mockup board 2) as a pure reducer, the
// minting flow's sibling: the confirmation (Zerlegen?), "your wallet opens now", the signature,
// "being salvaged" (Wird zerlegt …), nothing happened, or failed. Its token is burned by the
// player's wallet; the ADA locked with the item comes back with that transaction, the
// ingredients a few minutes later (the server credits them once the burn is final). What both
// flows do alike is mintFlow.js's and used from there: the operation's late answers (isLate), a
// failure's handling (problemEvent) and its table (problemOf, with the salvage's own codes first
// and every minting text shown as its salvage variant: salvageTexts.js), this tab's sign code
// (withSignCode), Open wallet and its way back (signingTap, walletAgainTap), the wallet step's
// rules (walletStepView, canSign, canCancel, signWindow). SalvageMinted.jsx performs the effects
// and reports their answers as events, as MintDialog.jsx does for minting. Plain data, so the
// rules have unit tests (test/unit/salvageFlow.test.js).
//
// Steps: confirm, wallet, sign, running, nothing, failed.

// the steps that follow an open operation (the poll); the first three also by the item's mark
const FOLLOWING = ["wallet", "sign", "running", "nothing", "failed"];
const FOLLOWING_BY_MARK = ["wallet", "sign", "running"];
// a prepared operation keeps these steps
const KEEPS_PREPARED = ["wallet", "sign", "nothing", "failed"];
const PATHS = ["extension", "phone"];
// while one of these is out, the flow waits for its answer and takes no tap
const HOLDING = ["burn", "cancel"];

const ENDED = { signCode: null, via: null, pending: null, afterCancel: null };

// ---------------------------------------------------------------------------------------------
// The wallet that holds the item

// a linked key as the flow names it: its subject, address, CIP-30 key and the name players read
const walletOf = (identity) => ({
  subject: identity.subject,
  address: typeof identity.address === "string" ? identity.address : null,
  key:
    typeof identity.wallet === "string" && identity.wallet !== ""
      ? identity.wallet
      : null,
  name: walletLabel(identity.wallet),
});

const counted = (identity) => Number.isInteger(identity.items);

/**
 * The wallet that holds the player's minted item, from the account's linked keys
 * (`identities`, GET /user/identities: { subject, address, wallet, items }): the only key that
 * holds any minted item (`items`), or, from a server that sends no counts, the only key; null
 * when the keys do not tell (none, or several holding minted items).
 */
export const holderOf = (identities) => {
  const keys = Array.isArray(identities)
    ? identities.filter(
        (identity) => identity && typeof identity.subject === "string"
      )
    : [];
  const holders = keys.some(counted)
    ? keys.filter((identity) => counted(identity) && identity.items > 0)
    : keys;
  return holders.length === 1 ? walletOf(holders[0]) : null;
};

const walletNamed = (state, subject) =>
  state.wallets.find((wallet) => wallet.subject === subject) || null;

// the wallet that holds the item as far as the flow knows: the account's keys tell (`holder`),
// or the server named it (`namedHolder`: a NOT YOUR WALLET answer's `holder`, kept for the
// dialog's life); null when neither
const holderWallet = (state) =>
  state.holder ||
  (state.namedHolder
    ? walletNamed(state, state.namedHolder) || {
        subject: state.namedHolder,
        address: null,
        key: null,
        name: null,
      }
    : null);

// the wallet the phone path asks the server for: the holder as far as the flow knows, else one
// that holds a minted item, else the first key (the server names the holder when it is another
// of the player's wallets, and the flow asks once more with it); null without any key
const guessOf = (state) => {
  const holder = holderWallet(state);
  if (holder) {
    return holder.subject;
  }
  const keys = state.wallets;
  const holding = keys.find((wallet) => wallet.items > 0);
  return holding ? holding.subject : keys.length > 0 ? keys[0].subject : null;
};

/**
 * How this device signs the salvage: { path: "extension", wallet (the CIP-30 key to connect) },
 * { path: "phone" } (the wallet app signs on the sign page, opened by the wallet door) or
 * { path: null } (neither: the holder's wallet is not in this browser and the device opens no
 * phone wallet app). `here`: { wallets (the keys this browser injected), deeplink }; null (not
 * known): the holder's wallet, as an extension.
 */
export const pathOf = (state) => {
  const holder = holderWallet(state);
  const here = state.here;
  if (!here) {
    return { path: "extension", wallet: holder ? holder.key : null };
  }
  const injected = Array.isArray(here.wallets) ? here.wallets : [];
  if (holder && holder.key) {
    if (injected.includes(holder.key)) {
      return { path: "extension", wallet: holder.key };
    }
  } else if (injected.length > 0) {
    // a wallet of unknown name may be any injected one
    return { path: "extension", wallet: injected[0] };
  }
  return here.deeplink === true ? { path: "phone" } : { path: null };
};

/**
 * What the wallet step says around the burn's amounts: "loading" while the operation is not known
 * yet (Continue on the card starts from the mark alone, until the first poll), "confirmed" once a
 * wallet vouched for its addresses (exact amounts, one signature), else "unconfirmed" (the
 * amounts can differ, the wallet asks twice).
 */
export const walletWords = (state) => {
  if (!state.operation) {
    return "loading";
  }
  return state.operation.ownerConfirmed === true ? "confirmed" : "unconfirmed";
};

/**
 * The wallet that signs, as the confirmation names it: { name, address } of the holder, or of the
 * wallet the flow sent; null when not known.
 */
export const signerOf = (state) => {
  const wallet =
    holderWallet(state) ||
    (state.subject ? walletNamed(state, state.subject) : null);
  return wallet ? { name: wallet.name, address: wallet.address } : null;
};

// ---------------------------------------------------------------------------------------------
// Failures

// the item is in another of the player's wallets (`subject`): that one is to be connected, so
// the wallet's api is asked for anew (as the mint's MINT_OTHER_WALLET): another account chosen in
// the same extension is then the one read
const wrongWallet = (state, subject) => {
  const holder = subject ? walletNamed(state, subject) : null;
  return holder && holder.address
    ? problem(
        "SALVAGE_WRONG_WALLET",
        { address: holder.address },
        { reconnect: true }
      )
    : problem("SALVAGE_WRONG_WALLET_NAMELESS", {}, { reconnect: true });
};

// the operation's `error` values (chain_ops.error) that the salvage words itself; the others are
// the minting's (shown as their salvage variants)
const OPERATION_PROBLEMS = {
  cancelled: problem(
    "MINT_WAS_CANCELLED",
    {},
    { action: "retry", ends: "nothing" }
  ),
  // the token moved after the burn was prepared (the signature's check cancelled it)
  "token-moved": problem(
    "SALVAGE_TOKEN_MOVED",
    {},
    { action: "retry", ends: "failed" }
  ),
  "wallet-unlinked": problem("SALVAGE_WALLET_UNLINKED", {}, { ends: "failed" }),
  // the holder burned the token outside the game: credited like any salvage
  "burned-elsewhere": problem(
    "SALVAGE_BURNED_ELSEWHERE",
    {},
    { ends: "running" }
  ),
};

// the API's codes that the salvage words itself (the others are the minting's)
const API_PROBLEMS = {
  "NOT ENOUGH ADA": (failure) => {
    const details = failure.details || {};
    return details.missing == null
      ? problem("SALVAGE_NOT_ENOUGH_ADA_PLAIN")
      : problem("SALVAGE_NOT_ENOUGH_ADA", { missingAda: details.missing });
  },
  "ITEM LEFT WALLET": () =>
    problem("SALVAGE_LEFT_WALLET", {}, { ends: "failed" }),
  // at the signature the operation was cancelled (the wallet moved the item: start again); at
  // the prepare nothing was prepared: the wallet holds the item at an address battlechoc cannot
  // use (one it did not name, or a base address of a wallet without a stake key, ruling E21: send
  // it to the wallet's own receiving address); at the sign page's rebuild nothing changed: the
  // item is not at the addresses the wallet named (try again, or cancel the salvage)
  "ITEM MOVED": (failure, { during }) => {
    if (during === "submit") {
      return problem(
        "SALVAGE_TOKEN_MOVED",
        {},
        { action: "retry", ends: "failed" }
      );
    }
    return during === "burn"
      ? problem("SALVAGE_ITEM_MOVED_PREPARE")
      : problem("SALVAGE_ITEM_ELSEWHERE");
  },
  "NOT MINTED": () => problem("SALVAGE_NOT_MINTED", {}, { ends: "failed" }),
  "NO RECIPE": () => problem("SALVAGE_NO_RECIPE", {}, { ends: "failed" }),
  "NOT YOUR ITEM": () => problem("SALVAGE_GONE", {}, { ends: "failed" }),
};

/**
 * What the player reads for `failure` in the salvage ({ key, values, action, ends, reconnect,
 * detail }, as problemOf): an operation's own `error` values ("token-moved", "wallet-unlinked",
 * "burned-elsewhere" besides the minting's), the burn's refusals (NOT ENOUGH ADA with what is
 * missing, ITEM LEFT WALLET, ITEM MOVED, NOT MINTED, NO RECIPE, NOT YOUR ITEM, NOT YOUR WALLET
 * with the holder), a prepare that may have been done unheard ("burn"), another account in the
 * wallet than the holder's (WalletOtherAccountError: the holder's wallet is to be connected);
 * anything else as problemOf says (its keys shown as their salvage variants, salvageKey).
 * `state`: the flow's, for the holder's address.
 */
export const salvageProblemOf = (failure, context = {}, state = null) => {
  if (typeof failure === "string") {
    return OPERATION_PROBLEMS[failure] || problemOf(failure);
  }
  if (context.during === "burn" && unheard(failure)) {
    // the burn may be prepared (and lock the item): the item's card shows it
    return problem("MINT_ANSWER_LOST", {}, { ends: "failed" });
  }
  if (failure instanceof ChainApiError) {
    if (failure.code === "NOT YOUR WALLET" && state && failure.holder) {
      return wrongWallet(state, failure.holder);
    }
    if (Object.prototype.hasOwnProperty.call(API_PROBLEMS, failure.code)) {
      return API_PROBLEMS[failure.code](failure, context);
    }
  }
  if (failure instanceof WalletOtherAccountError && state) {
    return wrongWallet(state, failure.expected);
  }
  return problemOf(failure, context);
};

// ---------------------------------------------------------------------------------------------
// Selectors

/**
 * The body of POST /chain/burn for the state: { itemId, subject, addresses (the extension path:
 * the wallet's own) }; null while no wallet is known.
 */
export const salvageRequest = (state) =>
  state.subject
    ? {
        itemId: state.item.id,
        subject: state.subject,
        ...(state.addresses ? { addresses: state.addresses } : {}),
      }
    : null;

/**
 * The problem of the confirmation when the salvage cannot start on this device: no way to sign
 * here (pathOf: no path; salvage where the wallet is installed, with Check again: a wallet
 * extension enabled since the dialog opened is found by reading `here` anew), or the phone path
 * without any key of the account to ask for (their read failed: say so, with Try again, which
 * reads them again: "reread"; none read: "unavailable"); null when it can.
 */
export const elsewhere = (state) => {
  const way = pathOf(state).path;
  if (way === "phone" && guessOf(state) === null) {
    return state.keysRead === false
      ? problem("SALVAGE_KEYS_UNREAD", {}, { action: "reread" })
      : problem("MINT_UNAVAILABLE");
  }
  if (way !== null) {
    return null;
  }
  const holder = holderWallet(state);
  const name = holder ? holder.name : null;
  return name
    ? problem(
        "MINT_CHECK_ELSEWHERE_TEXT",
        { wallet: name },
        { action: "recheck" }
      )
    : problem("MINT_CHECK_ELSEWHERE_TEXT_NAMELESS", {}, { action: "recheck" });
};

/** Whether "Yes, salvage" may be tapped: the confirmation, nothing out, a way to sign here. */
export const canConfirm = (state) =>
  state.step === "confirm" &&
  state.pending === null &&
  elsewhere(state) === null;

/**
 * The operation the dialog polls (GET /chain/operations/:id) while it shows it (the wallet step,
 * the signature, "being salvaged"; nothing and failed while it is still open), or knows it only
 * by the item's mark; null otherwise.
 */
export const salvagePollTarget = (state) => {
  if (state.operation) {
    return FOLLOWING.includes(state.step) && isOpen(state.operation)
      ? state.operation.id
      : null;
  }
  return FOLLOWING_BY_MARK.includes(state.step) ? state.operationId : null;
};

// ---------------------------------------------------------------------------------------------
// The state and its events

const isThisItems = (state, operation) =>
  Boolean(operation) &&
  operation.itemId === state.item.id &&
  operation.kind === "burn";

// what problemEvent needs of this flow (mintFlow.js's MINT_PROBLEMS for minting)
const flowOf = (state) => ({
  callsOfPending: {
    addresses: ["addresses", "connect"],
    burn: ["burn"],
    cancel: ["cancel"],
  },
  holding: HOLDING,
  walletSteps: ["confirm", "wallet", "sign"],
  prepare: "burn",
  walletName: (current) => {
    const signer = signerOf(current);
    return signer ? signer.name : null;
  },
  pollTarget: salvagePollTarget,
  describe: (failure, context) => salvageProblemOf(failure, context, state),
});

// the state with `operation` (a view of this item's burn) taken in: the step it stands for
const withBurn = (state, operation) => {
  const rebuilt =
    state.operation &&
    state.operation.id === operation.id &&
    state.operation.txHash !== operation.txHash;
  const next = {
    ...state,
    operation,
    operationId: operation.id,
    subject: operation.subject || state.subject,
    pastTxHashes: rebuilt
      ? [...state.pastTxHashes, state.operation.txHash]
      : state.pastTxHashes,
    problem:
      state.problem && state.problem.key === STATUS_UNKNOWN
        ? state.step === "wallet" &&
          operation.state === "prepared" &&
          !state.signCode
          ? RESUME_LOST
          : null
        : state.problem,
  };
  const keepsFailure = state.step === "failed" && next.problem !== null;
  switch (operation.state) {
    case "prepared":
      if (KEEPS_PREPARED.includes(state.step)) {
        return next;
      }
      return {
        ...next,
        step: "wallet",
        pending: state.pending === "burn" ? null : state.pending,
        problem: state.signCode ? null : RESUME_LOST,
      };
    case "submitted":
    case "included":
    case "final":
      return { ...next, ...ENDED, step: "running", problem: null };
    case "expired":
    case "cancelled": {
      if (operation.state === "cancelled" && state.afterCancel === "confirm") {
        // Back on the wallet step: the cancel is confirmed, the confirmation again
        return {
          ...next,
          ...ENDED,
          step: "confirm",
          operation: null,
          operationId: null,
          addresses: null,
          subject: null,
          pastOperations: [...state.pastOperations, operation.id],
          problem: null,
        };
      }
      if (keepsFailure) {
        return { ...next, ...ENDED };
      }
      const shown = salvageProblemOf(
        operation.error ||
          (operation.state === "cancelled" ? "cancelled" : "expired"),
        {},
        state
      );
      return {
        ...next,
        ...ENDED,
        step: shown.ends || "failed",
        problem: shown,
      };
    }
    default:
      return state;
  }
};

const takeOperation = (state, operation) =>
  isThisItems(state, operation) && !isLate(state, operation)
    ? withBurn(state, operation)
    : state;

// the account's keys as the flow keeps them (`identities`, GET /user/identities; null: their read
// failed): the wallets, the one that holds the item, and whether they were read
const keysOf = (identities) => ({
  wallets: Array.isArray(identities)
    ? identities
        .filter((identity) => identity && typeof identity.subject === "string")
        .map((identity) => ({
          ...walletOf(identity),
          items: counted(identity) ? identity.items : 0,
        }))
    : [],
  holder: holderOf(identities),
  keysRead: Array.isArray(identities),
});

/**
 * The flow's first state when the dialog opens for `item` (an entry of stats.items, minted):
 * `identities` (GET /user/identities, for the wallet that holds it; null: not read), `operation`
 * (this item's burn as the server has it, when known), `signCode` (this tab's for it),
 * `network` (the network's label), `here` (what this device can sign with: { wallets, deeplink };
 * null: not known). A burn of the item: prepared → wallet (without this tab's code: with
 * MINT_RESUME_LOST and Cancel), submitted, included or final → running, ended → its text. Without
 * one, the item's mark: a salvage waiting for the signature (`kind` "burn", `signing`) → wallet;
 * "burning" → running (followed by its operationId, when it has one). Else the confirmation.
 */
export const initialSalvage = ({
  item,
  identities = null,
  operation = null,
  signCode = null,
  network = null,
  here = null,
}) => {
  const mark = item.minted || null;
  const base = {
    step: "confirm",
    item,
    network,
    here,
    ...keysOf(identities),
    // the wallet the burn is asked for (the extension's own, or the holder's on a phone)
    subject: null,
    // the holder as the server named it (a NOT YOUR WALLET answer's `holder`), kept
    namedHolder: null,
    addresses: null,
    readiness: null,
    operation: null,
    operationId: null,
    pastOperations: [],
    pastTxHashes: [],
    signCode: null,
    via: null,
    pending: null,
    afterCancel: null,
    problem: null,
  };
  if (isThisItems(base, operation)) {
    return withBurn({ ...base, signCode }, operation);
  }
  if (
    mark &&
    mark.state === "minted" &&
    mark.kind === "burn" &&
    typeof mark.operationId === "string"
  ) {
    return {
      ...base,
      step: "wallet",
      operationId: mark.operationId,
      signCode,
      problem: signCode ? null : RESUME_LOST,
    };
  }
  if (mark && mark.state === "burning") {
    return {
      ...base,
      step: "running",
      operationId:
        typeof mark.operationId === "string" ? mark.operationId : null,
    };
  }
  return base;
};

const requestAllowed = (state, { what, path }) => {
  if (what === "cancel") {
    return canCancel(state);
  }
  if (state.pending !== null || !canConfirm(state)) {
    return false;
  }
  switch (what) {
    case "addresses":
      return pathOf(state).path === "extension";
    case "burn":
      // the extension path never sends a burn without the wallet's own addresses
      return (
        PATHS.includes(path) &&
        path === pathOf(state).path &&
        (path === "phone"
          ? guessOf(state) !== null
          : salvageRequest(state) !== null)
      );
    default:
      return false;
  }
};

const onRequest = (state, event) => {
  if (!requestAllowed(state, event)) {
    return state;
  }
  const next = { ...state, pending: event.what, problem: null };
  if (event.what === "addresses") {
    return { ...next, addresses: null, subject: null };
  }
  if (event.what === "burn" && event.path === "phone") {
    return { ...next, subject: guessOf(state), addresses: null };
  }
  return next;
};

// the extension's own addresses and subject: the holder's wallet, or the item is elsewhere
const onAddresses = (state, { addresses, subject }) => {
  if (state.pending !== "addresses") {
    return state;
  }
  const own = validAddresses(addresses);
  const holder = holderWallet(state);
  if (holder && subject !== holder.subject) {
    // nothing is prepared: the wallet that holds the item is another one
    return {
      ...state,
      pending: null,
      problem: wrongWallet(state, holder.subject),
    };
  }
  return {
    ...state,
    pending: null,
    addresses: own,
    subject: own && typeof subject === "string" ? subject : null,
  };
};

const onProblem = (state, event) => {
  const { failure, during } = event;
  // the server named the wallet that holds the item (the player's own): the flow keeps it
  const named =
    during === "burn" &&
    failure instanceof ChainApiError &&
    failure.code === "NOT YOUR WALLET" &&
    typeof failure.holder === "string"
      ? failure.holder
      : null;
  // the phone path asked for a wallet that does not hold the item: it asks once more, for the
  // one the server named (not when it asked for a named one already: no loop)
  if (
    named &&
    state.pending === "burn" &&
    state.addresses === null &&
    named !== state.subject &&
    state.subject !== state.namedHolder
  ) {
    return { ...state, subject: named, namedHolder: named };
  }
  let next = problemEvent(state, event, flowOf(state));
  if (named && next !== state) {
    next = { ...next, namedHolder: named };
  }
  // at the signature the server checked the token and cancelled the burn (token-moved): it is
  // over, so nothing offers to cancel it (the poll then confirms it, and the text stays)
  if (
    during === "submit" &&
    next !== state &&
    failure instanceof ChainApiError &&
    ["ITEM LEFT WALLET", "ITEM MOVED"].includes(failure.code) &&
    next.operation &&
    next.operation.id === event.operationId &&
    next.operation.state === "prepared"
  ) {
    return {
      ...next,
      operation: {
        ...next.operation,
        state: "cancelled",
        error: "token-moved",
      },
      signCode: null,
    };
  }
  return next;
};

// Try again; `here`: what the device can sign with, read anew at the tap (a wallet extension
// enabled since the dialog opened); without it the known one stays
const onRetry = (state, { here } = {}) => {
  if (here !== undefined && !["sign", "running"].includes(state.step)) {
    return onRetry({ ...state, here }, {});
  }
  if (["sign", "running"].includes(state.step)) {
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
    return withBurn({ ...state, step: "confirm" }, operation);
  }
  if (!operation && state.operationId) {
    // known only by the item's mark: the poll tells where it stands
    return state;
  }
  return {
    ...state,
    step: "confirm",
    problem: null,
    operation: null,
    operationId: null,
    pastOperations: operation
      ? [...state.pastOperations, operation.id]
      : state.pastOperations,
    signCode: null,
    addresses: null,
    subject: null,
    via: null,
    pending: null,
  };
};

const TAPS = {
  signing: signingTap,
  walletAgain: walletAgainTap,
  retry: onRetry,
  // Back on the wallet step cancels the prepared burn; the confirmation once that is confirmed
  back: (state) =>
    state.step === "wallet" && canCancel(state)
      ? { ...state, pending: "cancel", afterCancel: "confirm", problem: null }
      : state,
};

/**
 * The next state of the salvage after `event` (pure; an event that does not apply answers the
 * state itself).
 *
 * Taps (none is taken while the burn's request or a cancel is out): `{ type: 'signing', via, now
 * }` (Open wallet), `{ type: 'walletAgain' }`, `{ type: 'retry' }` (Try again), `{ type: 'back' }`
 * (the wallet step: cancel the prepared burn).
 *
 * Requests (`pending` is set to the request the dialog then sends): `{ type: 'request', what:
 * 'addresses' }` (the extension's addresses and subject, before the burn), `{ type: 'request',
 * what: 'burn', path }` ("extension": with the wallet's addresses; "phone": for the holder),
 * `{ type: 'request', what: 'cancel' }`.
 *
 * Answers: `{ type: 'addresses', addresses, subject }` (the extension's own; another wallet than
 * the holder's ends there, nothing prepared); `{ type: 'prepared', answer }` (POST /chain/burn's
 * 201 { operation, tx, signCode, costs, returns }); `{ type: 'signed', answer }`; `{ type:
 * 'operation', operation }`; `{ type: 'signCode', operationId, signCode }`; `{ type:
 * 'identities', identities }` (the account's keys read again; null: failed again); `{ type:
 * 'problem', failure, during, wallet, operationId }` (mintFlow's problemEvent with this flow's table; on the
 * phone path a NOT YOUR WALLET that names the holder asks once more for it: `pending` stays
 * "burn" with the holder as `subject`, and the dialog sends it again).
 */
export const salvageFlow = (state, event) => {
  const type = event && event.type;
  if (Object.prototype.hasOwnProperty.call(TAPS, type)) {
    return HOLDING.includes(state.pending) ? state : TAPS[type](state, event);
  }
  switch (type) {
    case "request":
      return onRequest(state, event);
    case "addresses":
      return onAddresses(state, event);
    case "prepared": {
      const answer = event.answer;
      if (
        state.step !== "confirm" ||
        state.pending !== "burn" ||
        !answer ||
        !isThisItems(state, answer.operation)
      ) {
        return state;
      }
      return withBurn(
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
      return withBurn({ ...state, signCode: null }, operation);
    }
    case "operation":
      return takeOperation(state, event.operation);
    case "identities":
      // the account's keys read again (Try again on the confirmation): only there, nothing out
      if (state.step !== "confirm" || state.pending !== null) {
        return state;
      }
      return { ...state, ...keysOf(event.identities) };
    case "signCode":
      return withSignCode(state, event);
    case "problem":
      return onProblem(state, event);
    default:
      return state;
  }
};

/**
 * Whether "being salvaged" may say that the burn signed here goes through (signed, the deposit
 * comes back with it): not when the item was salvaged outside the game and the burn signed here
 * ended without going through ("burned-elsewhere").
 */
export const signedHere = (state) =>
  !(state.problem && state.problem.key === "SALVAGE_BURNED_ELSEWHERE");
