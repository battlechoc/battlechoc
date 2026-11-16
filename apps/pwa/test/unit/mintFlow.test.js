// The minting flow's state (node --test): which step shows, what each event does, the checklist
// built from the server's readiness answer, the costs, the request "Mint now" sends, every
// failure as a message, and every way of coming back into the flow (src/ui/mint/mintFlow.js,
// src/ui/mint/ada.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chain } from "@battlechoc/battlechoc-shared-functions";
import {
  canCancel,
  canContinue,
  canSign,
  checklist,
  checklistOf,
  costLines,
  costRows,
  costsOf,
  elsewhere,
  feeChoice,
  initialState,
  mintFlow,
  mintRequest,
  noSigning,
  walletStepView,
  pollTarget,
  problemOf,
  shownValues,
  signWindow,
  walletTextKey,
} from "../../src/ui/mint/mintFlow.js";
import {
  adaText,
  formatAda,
  SELF_SEND_LOVELACE,
  sumLovelace,
  walletChange,
} from "../../src/ui/mint/ada.js";
import {
  ChainApiError,
  ChainUnreachableError,
} from "../../src/api/chainClient.js";
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../../src/cardano/wallet.js";
import {
  OwnerNotConfirmedError,
  UnexpectedProofTextError,
  UnsupportedAddressError,
  WalletAccountChangedError,
  WalletCannotSignError,
  WalletOtherAccountError,
  WalletSignError,
} from "../../src/cardano/signTx.js";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const MINUTE = 60 * 1000;

// a RARE item (index 1 of TIER_ORDER) of the player
const ITEM = { id: "item-1", item: "HEAVY_BARREL", serial: 17, minted: null };
const RARE = chain.TIER_ORDER.indexOf("RARE");

const ADA_FEE = {
  fee: 0,
  asset: "lovelace",
  label: "ADA",
  amounts: ["1000000", "2000000", "4000000"],
};
// a second option in a token (CHOC later): its index in the config is 3, not its position
const TOKEN_FEE = {
  fee: 3,
  asset: `${"ab".repeat(28)}43484f43`,
  label: "CHOC",
  amounts: ["50", "100", "200"],
};

const NEEDED = sumLovelace(
  chain.MINT_NEEDED_ESTIMATE_LOVELACE,
  ADA_FEE.amounts[RARE]
);

const wallet = (over = {}) => ({
  subject: "stake:aa",
  address: "stake_test1uqaa",
  name: "eternl",
  asked: true,
  lovelace: "12400000",
  enough: true,
  missing: "0",
  needed: NEEDED,
  collateral: true,
  waitUntil: null,
  ...over,
});
const WORDS = wallet({ subject: "stake:words", name: null });
const LACE = wallet({ subject: "stake:bb", name: "lace" });

const readiness = (over = {}) => ({
  enabled: true,
  ready: true,
  paused: false,
  matches: { have: 23, need: chain.MINT_MIN_ONLINE_MATCHES },
  mintsLeftToday: chain.MINTS_PER_DAY,
  wallets: [wallet()],
  estimate: {
    networkFee: String(chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE),
    deposit: String(chain.MINT_DEPOSIT_ESTIMATE_LOVELACE),
    needed: NEEDED,
  },
  gameFees: [ADA_FEE],
  operation: null,
  ...over,
});

const COSTS = {
  networkFee: 431234,
  gameFee: { asset: "lovelace", label: "ADA", amount: 2000000 },
  deposit: 3456789,
};
const operation = (over = {}) => ({
  id: "op-1",
  kind: "mint",
  state: "prepared",
  error: null,
  itemId: ITEM.id,
  item: { item: ITEM.item, serial: ITEM.serial },
  assetName: "000de140aa",
  txHash: "ab".repeat(32),
  subject: "stake:aa",
  signUntil: new Date(NOW + chain.SIGN_WINDOW_MS).toISOString(),
  costs: COSTS,
  slow: false,
  ...over,
});
const prepared = (over = {}) => ({
  operation: operation(over),
  tx: "84a400",
  signCode: "code-1",
  costs: operation(over).costs,
});

const start = (over = {}) =>
  initialState({
    item: ITEM,
    explained: true,
    network: "Preprod",
    wordsSubject: WORDS.subject,
    ...over,
  });
const run = (state, ...events) => events.reduce(mintFlow, state);
const apiError = (code, status, details = {}) =>
  new ChainApiError(code, { status, details });

// a flow on the cost screen with one wallet ready (readiness answered, Continue tapped)
const onCosts = (answer = readiness()) =>
  run(
    start(),
    { type: "readiness", itemId: ITEM.id, answer },
    { type: "next", now: NOW }
  );
// a flow that tapped "Mint now" and got the server's answer
const onWallet = (answer = readiness()) =>
  run(
    onCosts(answer),
    { type: "request", what: "mint", path: "phone" },
    { type: "prepared", answer: prepared() }
  );

// ---------------------------------------------------------------------------------------------
// ada.js

test("formatAda: at most two decimals, in the language's number format", () => {
  assert.equal(formatAda("520000", "en"), "0.52");
  assert.equal(formatAda("520000", "de"), "0,52");
  assert.equal(formatAda("1000000", "en"), "1");
  assert.equal(formatAda("12400000", "de"), "12,4");
  assert.equal(formatAda("1234567890000", "en"), "1,234,567.89");
  assert.equal(formatAda("1234567890000", "de"), "1.234.567,89");
  assert.equal(formatAda(4620000, "en"), "4.62");
  assert.equal(formatAda(4620000n, "en"), "4.62");
  assert.equal(formatAda("0", "en"), "0");
});

test("formatAda: a cost is rounded up, never to something that looks smaller; a balance down", () => {
  assert.equal(formatAda("431234", "en"), "0.44");
  assert.equal(formatAda("1", "en"), "0.01");
  assert.equal(formatAda("2000001", "en"), "2.01");
  assert.equal(formatAda("431234", "en", { round: "down" }), "0.43");
  assert.equal(formatAda("1", "en", { round: "down" }), "0");
  assert.equal(formatAda("12409999", "de", { round: "down" }), "12,4");
});

test("formatAda: no amount, a negative one, a fraction or an unknown rounding are mistakes", () => {
  for (const wrong of [null, undefined, "", "1.5", "abc", -1, "-1", 1.5, {}]) {
    assert.throws(() => formatAda(wrong, "en"), TypeError, String(wrong));
  }
  assert.throws(() => formatAda("1", "en", { round: "half" }), TypeError);
});

test("formatAda: an unknown language falls back to English", () => {
  assert.equal(formatAda("520000", "not a language!"), "0.52");
});

test("adaText: the flow's one text of an amount; what leaves the wallet carries its minus on the number, inside the ≈ (D47)", () => {
  // the wallet step's and the sign page's total: "≈ −4,81 ADA", never "− ≈ 4,81 ADA"
  assert.equal(adaText("4801234", "de", { given: true }), "≈ −4,81 ADA");
  assert.equal(adaText("4801234", "en", { given: true }), "≈ −4.81 ADA");
  assert.equal(
    adaText("4801234", "de", { given: true, exact: true }),
    "−4,801234 ADA"
  );
  assert.equal(adaText("4801234", "de", { exact: true }), "4,801234 ADA");
  assert.equal(adaText("2000000", "en", { exact: true }), "2 ADA");
  // an estimate rounds a cost up and what the player keeps down
  assert.equal(adaText("1271234", "de"), "≈ 1,28 ADA");
  assert.equal(adaText("1271234", "de", { round: "down" }), "≈ 1,27 ADA");
  assert.throws(() => adaText(null, "de"), TypeError);
});

test("sumLovelace: exact, as a string, beyond Number's precision", () => {
  assert.equal(sumLovelace("431234", 2000000, 3456789n), "5888023");
  assert.equal(sumLovelace(), "0");
  assert.equal(sumLovelace("9007199254740993", "1"), "9007199254740994");
  assert.throws(() => sumLovelace("1", null), TypeError);
});

// ---------------------------------------------------------------------------------------------
// Opening the flow

test("first time: the explainer; explained before: the checklist", () => {
  assert.equal(start({ explained: false }).step, "explain");
  assert.equal(start().step, "check");
  const state = start();
  assert.equal(state.readiness, null);
  assert.equal(state.problem, null);
  assert.equal(state.subject, null);
  assert.equal(state.fee, null);
});

test("explainer: How it works leads to the checklist and counts as explained; What is this? comes back to it", () => {
  const first = start({ explained: false });
  const checked = run(first, { type: "next" });
  assert.equal(checked.step, "check");
  assert.equal(checked.explained, true);
  // Back on a first explainer is the dialog's: it closes (the state stays)
  assert.equal(run(first, { type: "back" }).step, "explain");
  const again = run(checked, { type: "explain" });
  assert.equal(again.step, "explain");
  assert.equal(run(again, { type: "back" }).step, "check");
});

test("reopened with this item's prepared operation and its sign code in this tab: the wallet step, ready to sign", () => {
  const state = start({ operation: operation(), signCode: "code-1" });
  assert.equal(state.step, "wallet");
  assert.equal(state.signCode, "code-1");
  assert.equal(state.problem, null);
  assert.equal(state.subject, "stake:aa");
  assert.equal(canSign(state, NOW), true);
  assert.equal(canCancel(state), true);
  assert.equal(pollTarget(state), "op-1");
});

test("reopened with a prepared operation without its code (another device or tab): the wallet step with Cancel, never a dead end", () => {
  const state = start({ operation: operation() });
  assert.equal(state.step, "wallet");
  assert.deepEqual(state.problem.key, "MINT_RESUME_LOST");
  assert.equal(state.problem.action, "cancel");
  assert.equal(canSign(state, NOW), false);
  assert.equal(canCancel(state), true);
  // Cancel, then start again
  const cancelling = run(state, { type: "request", what: "cancel" });
  assert.equal(cancelling.pending, "cancel");
  assert.equal(canCancel(cancelling), false);
  const cancelled = run(cancelling, {
    type: "operation",
    operation: operation({ state: "cancelled", error: "cancelled" }),
  });
  assert.equal(cancelled.step, "nothing");
  assert.equal(cancelled.problem.key, "MINT_WAS_CANCELLED");
  assert.equal(cancelled.pending, null);
  const again = run(cancelled, { type: "retry" });
  assert.equal(again.step, "check");
  assert.equal(again.readiness, null);
  assert.equal(again.operation, null);
  assert.equal(pollTarget(again), null);
});

test("reopened while it is submitted: minting; included: done (the item is minted from its block on)", () => {
  assert.equal(
    start({ operation: operation({ state: "submitted" }) }).step,
    "minting"
  );
  assert.equal(
    pollTarget(start({ operation: operation({ state: "submitted" }) })),
    "op-1"
  );
  assert.equal(
    start({ operation: operation({ state: "included" }) }).step,
    "done"
  );
  assert.equal(
    start({ operation: operation({ state: "final" }) }).step,
    "done"
  );
});

test("reopened after the operation ended while the dialog was closed: its end, and Try again starts afresh", () => {
  const ends = [
    ["expired", "not-signed", "failed", "MINT_TIME_UP"],
    ["expired", "expired", "failed", "MINT_EXPIRED"],
    ["expired", "rejected", "failed", "MINT_NOT_TAKEN"],
    ["cancelled", "cancelled", "nothing", "MINT_WAS_CANCELLED"],
  ];
  for (const [state, error, step, key] of ends) {
    const opened = start({
      operation: operation({ state, error }),
      signCode: "code-1",
    });
    assert.equal(opened.step, step, error);
    assert.equal(opened.problem.key, key, error);
    assert.equal(opened.signCode, null, error);
    assert.equal(canCancel(opened), false, error);
    assert.equal(pollTarget(opened), null, error);
    const again = run(opened, { type: "retry" });
    assert.equal(again.step, "check", error);
    assert.equal(again.problem, null, error);
  }
});

test("reopened from the item's mark alone (stats say minting, the operation not read yet): the right step, and the operation is asked for", () => {
  const signing = start({
    item: {
      ...ITEM,
      minted: {
        assetName: null,
        state: "minting",
        operationId: "op-1",
        signing: true,
      },
    },
    signCode: "code-1",
  });
  assert.equal(signing.step, "wallet");
  assert.equal(signing.problem, null);
  assert.equal(pollTarget(signing), "op-1");
  // not signable before the operation (its window) is known
  assert.equal(canSign(signing, NOW), false);
  const known = run(signing, { type: "operation", operation: operation() });
  assert.equal(canSign(known, NOW), true);

  const lost = start({
    item: {
      ...ITEM,
      minted: {
        assetName: null,
        state: "minting",
        operationId: "op-1",
        signing: true,
      },
    },
  });
  assert.equal(lost.problem.key, "MINT_RESUME_LOST");
  assert.equal(canCancel(lost), false);
  assert.equal(
    canCancel(run(lost, { type: "operation", operation: operation() })),
    true
  );

  const minting = start({
    item: {
      ...ITEM,
      minted: {
        assetName: "x",
        state: "minting",
        operationId: "op-1",
        signing: false,
      },
    },
  });
  assert.equal(minting.step, "minting");
  assert.equal(pollTarget(minting), "op-1");
  // it ended while the dialog was closed, the stats did not know yet
  const ended = run(minting, {
    type: "operation",
    operation: operation({ state: "expired", error: "rejected" }),
  });
  assert.equal(ended.step, "failed");
  assert.equal(ended.problem.key, "MINT_NOT_TAKEN");
});

test("the sign window already over: no signing, no early failure; the server's answer decides", () => {
  const over = operation({
    signUntil: new Date(NOW - 1000).toISOString(),
  });
  const state = start({ operation: over, signCode: "code-1" });
  assert.equal(state.step, "wallet");
  assert.deepEqual(signWindow(state.operation, NOW), {
    over: true,
    minutes: 0,
  });
  assert.equal(canSign(state, NOW), false);
  assert.equal(pollTarget(state), "op-1");
  // signing is not accepted any more
  assert.equal(
    run(state, { type: "signing", via: "extension", now: NOW }).step,
    "wallet"
  );
  // the server expired it (or a phone signed it in the last second)
  assert.equal(
    run(state, {
      type: "operation",
      operation: operation({ state: "expired", error: "not-signed" }),
    }).problem.key,
    "MINT_TIME_UP"
  );
  assert.equal(
    run(state, {
      type: "operation",
      operation: operation({ state: "submitted" }),
    }).step,
    "minting"
  );
});

test("signWindow: the minutes left, rounded up; a missing or unreadable time is over", () => {
  const op = operation();
  assert.deepEqual(signWindow(op, NOW), { over: false, minutes: 10 });
  assert.deepEqual(signWindow(op, NOW + 9 * MINUTE + 1), {
    over: false,
    minutes: 1,
  });
  assert.deepEqual(signWindow(op, NOW + 10 * MINUTE), {
    over: true,
    minutes: 0,
  });
  assert.deepEqual(signWindow({ ...op, signUntil: "soon" }, NOW), {
    over: true,
    minutes: 0,
  });
  assert.equal(signWindow(null, NOW), null);
  assert.equal(signWindow(operation({ state: "submitted" }), NOW), null);
});

test("an open operation of another item: this item cannot start; the checklist names that item and offers to go to it", () => {
  const other = operation({
    id: "op-9",
    itemId: "item-9",
    item: { item: "LONG_EARS", serial: 4 },
    state: "submitted",
  });
  // passed in when opening, it changes nothing for this item
  const opened = start({ operation: other, signCode: "code-9" });
  assert.equal(opened.step, "check");
  assert.equal(opened.operation, null);
  assert.equal(opened.signCode, null);
  const state = run(opened, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness({ operation: other }),
  });
  assert.equal(state.step, "check");
  const line = checklistOf(state, NOW).find(
    (entry) => entry.id === "operation"
  );
  assert.deepEqual(line, {
    id: "operation",
    met: false,
    key: "MINT_CHECK_RUNNING",
    text: "MINT_CHECK_RUNNING_TEXT",
    values: { item: "LONG_EARS", serial: 4 },
    action: "goTo",
    operation: { id: "op-9", itemId: "item-9" },
  });
  assert.equal(canContinue(checklistOf(state, NOW)), false);
  assert.equal(run(state, { type: "next", now: NOW }).step, "check");
});

test("a readiness answer that carries this item's open operation (started in another tab) takes the flow to it", () => {
  const state = run(start({ explained: false }), {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness({ operation: operation() }),
  });
  assert.equal(state.step, "wallet");
  assert.equal(state.problem.key, "MINT_RESUME_LOST");
  assert.equal(
    run(start(), {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ operation: operation({ state: "submitted" }) }),
    }).step,
    "minting"
  );
});

test("readiness failing on reopen: the checklist says so and Check again asks anew", () => {
  const state = run(
    start(),
    { type: "request", what: "readiness", itemId: ITEM.id },
    {
      type: "problem",
      failure: new ChainUnreachableError("network"),
      during: "readiness",
    }
  );
  assert.equal(state.step, "check");
  assert.equal(state.pending, null);
  assert.equal(state.problem.key, "MINT_UNAVAILABLE");
  assert.equal(state.problem.action, "recheck");
  assert.deepEqual(checklistOf(state, NOW), []);
  assert.equal(canContinue(checklistOf(state, NOW)), false);
  const again = run(state, { type: "retry" });
  assert.equal(again.problem, null);
  assert.equal(again.readiness, null);
  const answered = run(again, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(canContinue(checklistOf(answered, NOW)), true);
});

test("readiness failing while the flow follows an operation: the operation's step stays, without an alert", () => {
  const state = run(start({ operation: operation({ state: "submitted" }) }), {
    type: "problem",
    failure: new ChainUnreachableError("server", { status: 502 }),
    during: "readiness",
  });
  assert.equal(state.step, "minting");
  assert.equal(state.problem, null);
});

// ---------------------------------------------------------------------------------------------
// The checklist

const lineOf = (lines, id) => lines.find((line) => line.id === id);
const listFor = (answer, options = {}) =>
  checklist(answer, {
    wordsSubject: WORDS.subject,
    network: "Preprod",
    itemId: ITEM.id,
    now: NOW,
    ...options,
  });

test("checklist: all met, in the mockup's order, with the server's numbers", () => {
  const lines = listFor(readiness());
  assert.deepEqual(
    lines.map((line) => line.id),
    ["matches", "wallet", "ada", "limit"]
  );
  assert.equal(canContinue(lines), true);
  assert.deepEqual(lineOf(lines, "matches"), {
    id: "matches",
    met: true,
    key: "MINT_CHECK_MATCHES_MET",
    text: "MINT_CHECK_MATCHES_HAVE",
    values: { need: chain.MINT_MIN_ONLINE_MATCHES, have: 23 },
  });
  assert.deepEqual(lineOf(lines, "wallet"), {
    id: "wallet",
    met: true,
    key: "MINT_CHECK_WALLET",
    text: "MINT_CHECK_WALLET_TEXT",
    values: {
      wallet: "Eternl",
      address: "stake_test1uqaa",
      network: "Preprod",
    },
    subject: "stake:aa",
    options: [],
  });
  assert.deepEqual(lineOf(lines, "ada"), {
    id: "ada",
    met: true,
    key: "MINT_CHECK_ADA",
    text: "MINT_CHECK_ADA_TEXT",
    values: { haveAda: "12400000", needAda: NEEDED },
  });
  assert.deepEqual(lineOf(lines, "limit"), {
    id: "limit",
    met: true,
    key: "MINT_CHECK_LEFT",
    text: null,
    values: { left: chain.MINTS_PER_DAY },
  });
});

test("checklist: 9 matches → unmet, one more to play (its singular form)", () => {
  const nine = lineOf(
    listFor(
      readiness({ matches: { have: 9, need: chain.MINT_MIN_ONLINE_MATCHES } })
    ),
    "matches"
  );
  assert.equal(nine.met, false);
  assert.equal(nine.key, "MINT_CHECK_MATCHES_ONE");
  assert.equal(nine.text, "MINT_CHECK_MATCHES_TEXT");
  assert.deepEqual(nine.values, {
    missing: 1,
    need: chain.MINT_MIN_ONLINE_MATCHES,
    have: 9,
  });
  const three = lineOf(
    listFor(
      readiness({ matches: { have: 3, need: chain.MINT_MIN_ONLINE_MATCHES } })
    ),
    "matches"
  );
  assert.equal(three.key, "MINT_CHECK_MATCHES");
  assert.equal(three.values.missing, chain.MINT_MIN_ONLINE_MATCHES - 3);
});

test("checklist: no wallet → unmet with the connect action; the words key alone is no wallet", () => {
  for (const wallets of [[], [WORDS]]) {
    const lines = listFor(readiness({ wallets }));
    const line = lineOf(lines, "wallet");
    assert.equal(line.met, false);
    assert.equal(line.key, "MINT_CHECK_NO_WALLET");
    assert.equal(line.text, "MINT_CHECK_NO_WALLET_TEXT");
    assert.equal(line.action, "connect");
    // the ADA is checked once a wallet is connected: not known, not blocking by itself
    assert.deepEqual(lineOf(lines, "ada"), {
      id: "ada",
      met: null,
      key: "MINT_CHECK_ADA_LATER",
      text: "MINT_CHECK_ADA_LATER_TEXT",
      values: { needAda: NEEDED },
    });
    assert.equal(canContinue(lines), false);
  }
});

test("checklist: two wallets, none picked → unmet with both as options; picked → met; the words key is never one", () => {
  const answer = readiness({ wallets: [WORDS, wallet(), LACE] });
  const state = run(start(), { type: "readiness", itemId: ITEM.id, answer });
  assert.equal(state.subject, null);
  const line = lineOf(checklistOf(state, NOW), "wallet");
  assert.equal(line.met, false);
  assert.equal(line.key, "MINT_CHECK_PICK");
  assert.deepEqual(line.options, [
    {
      subject: "stake:aa",
      name: "Eternl",
      address: "stake_test1uqaa",
      picked: false,
    },
    {
      subject: "stake:bb",
      name: "Lace",
      address: "stake_test1uqaa",
      picked: false,
    },
  ]);
  assert.equal(lineOf(checklistOf(state, NOW), "ada").met, null);
  assert.equal(canContinue(checklistOf(state, NOW)), false);
  assert.equal(run(state, { type: "next", now: NOW }).step, "check");

  const picked = run(state, { type: "pickWallet", subject: "stake:bb" });
  assert.equal(picked.subject, "stake:bb");
  const pickedLine = lineOf(checklistOf(picked, NOW), "wallet");
  assert.equal(pickedLine.met, true);
  assert.equal(pickedLine.values.wallet, "Lace");
  assert.equal(pickedLine.options[1].picked, true);
  assert.equal(canContinue(checklistOf(picked, NOW)), true);
  assert.equal(run(picked, { type: "next", now: NOW }).step, "costs");

  // the words key and unknown subjects cannot be picked
  assert.equal(
    run(state, { type: "pickWallet", subject: WORDS.subject }).subject,
    null
  );
  assert.equal(
    run(state, { type: "pickWallet", subject: "stake:zz" }).subject,
    null
  );
});

test("checklist: one wallet is picked by itself; a picked wallet that went away is dropped on a new answer", () => {
  const one = run(start(), {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(one.subject, "stake:aa");
  const two = run(
    start(),
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ wallets: [wallet(), LACE] }),
    },
    { type: "pickWallet", subject: "stake:bb" },
    { type: "retry" },
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ wallets: [wallet()] }),
    }
  );
  assert.equal(two.subject, "stake:aa");
  const kept = run(
    start(),
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ wallets: [wallet(), LACE] }),
    },
    { type: "pickWallet", subject: "stake:bb" },
    { type: "retry" },
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ wallets: [wallet(), LACE] }),
    }
  );
  assert.equal(kept.subject, "stake:bb");
});

test("checklist: a picked wallet that waits after a move from another account → unmet until its time, from `now`", () => {
  const waitUntil = new Date(NOW + 3 * 60 * MINUTE).toISOString();
  const answer = readiness({ wallets: [wallet({ waitUntil })] });
  const line = lineOf(listFor(answer), "wallet");
  assert.deepEqual(
    { met: line.met, key: line.key, text: line.text, values: line.values },
    {
      met: false,
      key: "MINT_CHECK_WAITING",
      text: "MINT_CHECK_WAITING_TEXT",
      values: { wallet: "Eternl", time: waitUntil },
    }
  );
  // the time has come (the dialog stayed open): it counts
  assert.equal(
    lineOf(listFor(answer, { now: NOW + 3 * 60 * MINUTE }), "wallet").met,
    true
  );
  // `next` takes the time from its event
  const state = run(start(), { type: "readiness", itemId: ITEM.id, answer });
  assert.equal(run(state, { type: "next", now: NOW }).step, "check");
  assert.equal(
    run(state, { type: "next", now: NOW + 3 * 60 * MINUTE }).step,
    "costs"
  );
});

test("checklist: too little ADA → unmet with the server's have, need and missing (no arithmetic here)", () => {
  const short = wallet({
    lovelace: "2100000",
    enough: false,
    missing: "4990000",
    needed: "7090000",
  });
  const line = lineOf(listFor(readiness({ wallets: [short] })), "ada");
  assert.deepEqual(line, {
    id: "ada",
    met: false,
    key: "MINT_CHECK_LOW",
    text: "MINT_CHECK_LOW_TEXT",
    values: {
      haveAda: "2100000",
      needAda: "7090000",
      missingAda: "4990000",
    },
    action: "getAda",
  });
});

test("checklist: the ADA but none of it on its own → its own unmet line with the amount to send oneself", () => {
  const bundled = wallet({ enough: false, missing: "0", collateral: false });
  const line = lineOf(listFor(readiness({ wallets: [bundled] })), "ada");
  assert.deepEqual(line, {
    id: "ada",
    met: false,
    key: "MINT_CHECK_COLLATERAL",
    text: "MINT_CHECK_COLLATERAL_TEXT",
    values: { wallet: "Eternl", amountAda: SELF_SEND_LOVELACE },
    action: "recheck",
  });
  // what the player sends themselves covers the security and its change
  assert.ok(
    BigInt(SELF_SEND_LOVELACE) >= BigInt(chain.COLLATERAL_LOVELACE) + 1000000n
  );
});

test("checklist: a wallet the server did not ask, or whose ADA it could not read, stays pickable and does not block", () => {
  const notAsked = wallet({
    asked: false,
    lovelace: null,
    enough: null,
    missing: null,
    needed: null,
    collateral: null,
  });
  const lines = listFor(readiness({ wallets: [notAsked] }));
  assert.equal(lineOf(lines, "wallet").met, true);
  assert.deepEqual(lineOf(lines, "ada"), {
    id: "ada",
    met: null,
    key: "MINT_CHECK_ADA_NOT_ASKED",
    text: "MINT_CHECK_ADA_NOT_ASKED_TEXT",
    values: {},
  });
  assert.equal(canContinue(lines), true);

  // two wallets, one of them read in time: ready is false only because of the other
  const unread = {
    ...notAsked,
    asked: true,
    subject: "stake:bb",
    name: "lace",
  };
  const answer = readiness({ ready: false, wallets: [wallet(), unread] });
  const state = run(
    start(),
    { type: "readiness", itemId: ITEM.id, answer },
    { type: "pickWallet", subject: "stake:bb" }
  );
  const picked = checklistOf(state, NOW);
  assert.equal(lineOf(picked, "chain"), undefined);
  assert.deepEqual(lineOf(picked, "ada"), {
    id: "ada",
    met: null,
    key: "MINT_CHECK_ADA_UNKNOWN",
    text: "MINT_CHECK_ADA_UNKNOWN_TEXT",
    values: {},
    action: "recheck",
  });
  assert.equal(canContinue(picked), true);
  const costs = run(state, { type: "next", now: NOW });
  assert.equal(costs.step, "costs");
  assert.deepEqual(mintRequest(costs), {
    itemId: ITEM.id,
    subject: "stake:bb",
    fee: 0,
  });
  // the mint's answer is the real one
  const refused = run(
    costs,
    { type: "request", what: "mint", path: "phone" },
    {
      type: "problem",
      failure: apiError("NOT ENOUGH ADA", 400, {
        missing: "1500000",
        needed: "7090000",
      }),
      during: "mint",
    }
  );
  assert.equal(refused.step, "costs");
  assert.equal(refused.problem.key, "MINT_NOT_ENOUGH_ADA");
  assert.deepEqual(refused.problem.values, {
    needAda: "7090000",
    missingAda: "1500000",
  });
});

test("checklist: no mints left today → the limit line is unmet", () => {
  const line = lineOf(listFor(readiness({ mintsLeftToday: 0 })), "limit");
  assert.deepEqual(line, {
    id: "limit",
    met: false,
    key: "MINT_CHECK_NONE_LEFT",
    text: "MINT_CHECK_NONE_LEFT_TEXT",
    values: { count: chain.MINTS_PER_DAY },
  });
  assert.equal(
    lineOf(listFor(readiness({ mintsLeftToday: 1 })), "limit").key,
    "MINT_CHECK_LEFT_ONE"
  );
});

test("checklist: the chain cannot be read (ready: false) → the chain line first, blocking", () => {
  const lines = listFor(readiness({ ready: false }));
  assert.equal(lines[0].id, "chain");
  assert.deepEqual(lines[0], {
    id: "chain",
    met: false,
    key: "MINT_CHECK_CHAIN",
    text: "MINT_CHECK_CHAIN_TEXT",
    values: {},
    action: "recheck",
  });
  assert.equal(canContinue(lines), false);
  // a wallet the provider did not answer for in time (or a provider down): it does not block;
  // the wallet stays pickable, its ADA is not known yet, and the mint answers for itself
  const down = wallet({
    lovelace: null,
    enough: null,
    missing: null,
    needed: null,
    collateral: null,
  });
  const timedOut = listFor(readiness({ ready: false, wallets: [down] }));
  assert.equal(lineOf(timedOut, "chain"), undefined);
  assert.equal(lineOf(timedOut, "wallet").met, true);
  assert.equal(lineOf(timedOut, "ada").key, "MINT_CHECK_ADA_UNKNOWN");
  assert.equal(canContinue(timedOut), true);
  // the config could not be read
  assert.equal(
    listFor(
      readiness({
        ready: false,
        gameFees: null,
        estimate: { ...readiness().estimate, needed: null },
        wallets: [
          wallet({
            enough: null,
            missing: null,
            needed: null,
            collateral: null,
          }),
        ],
      })
    )[0].key,
    "MINT_CHECK_CHAIN"
  );
});

test("checklist: paused, no payable fee option, or minting switched off → the chain line with its own text", () => {
  const paused = listFor(readiness({ paused: true }));
  assert.equal(paused[0].key, "MINT_CHECK_PAUSED");
  assert.equal(paused[0].text, "MINT_CHECK_PAUSED_TEXT");
  assert.equal(canContinue(paused), false);

  const unpayable = listFor(
    readiness({
      ready: false,
      gameFees: [],
      estimate: { ...readiness().estimate, needed: null },
      wallets: [wallet({ enough: null, missing: null, needed: null })],
    })
  );
  assert.equal(unpayable[0].key, "MINT_CHECK_CANNOT_MINT");
  assert.equal(unpayable[0].text, "MINT_CHECK_CANNOT_MINT_TEXT");
  assert.equal(canContinue(unpayable), false);
  // the ADA it holds is known, what it needs is not
  assert.deepEqual(lineOf(unpayable, "ada"), {
    id: "ada",
    met: null,
    key: "MINT_CHECK_ADA_HAVE",
    text: null,
    values: { haveAda: "12400000" },
  });

  // no fee at all is no problem
  assert.equal(canContinue(listFor(readiness({ gameFees: [] }))), true);

  const off = listFor({ enabled: false });
  assert.deepEqual(off, [
    {
      id: "chain",
      met: false,
      key: "MINT_CHECK_OFF",
      text: "MINT_CHECK_OFF_TEXT",
      values: {},
    },
  ]);
  assert.equal(canContinue(off), false);
});

test("canContinue: only when no line is unmet, and never without lines", () => {
  assert.equal(canContinue([]), false);
  assert.equal(canContinue([{ met: true }, { met: null }]), true);
  assert.equal(canContinue([{ met: true }, { met: false }]), false);
});

// ---------------------------------------------------------------------------------------------
// Fees and costs

test("no fee option: no battlechoc fee and no choice; Mint now sends fee 0", () => {
  assert.deepEqual(feeChoice([]), { show: false });
  const state = onCosts(readiness({ gameFees: [] }));
  const costs = costsOf(state);
  assert.equal(costs.gameFee, null);
  assert.equal(costs.exact, false);
  assert.equal(
    costs.total,
    sumLovelace(
      chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE,
      chain.MINT_DEPOSIT_ESTIMATE_LOVELACE
    )
  );
  assert.equal(mintRequest(state).fee, 0);
});

test("one ADA option: no choice, the item's tier's amount, counted into the total", () => {
  assert.deepEqual(feeChoice([ADA_FEE]), { show: false });
  const costs = costsOf(onCosts());
  assert.deepEqual(costs, {
    networkFee: String(chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE),
    gameFee: {
      asset: "lovelace",
      label: "ADA",
      amount: ADA_FEE.amounts[RARE],
      ada: true,
      // the config's amount: exact before the build too
      exact: true,
    },
    deposit: String(chain.MINT_DEPOSIT_ESTIMATE_LOVELACE),
    total: sumLovelace(
      chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE,
      chain.MINT_DEPOSIT_ESTIMATE_LOVELACE,
      ADA_FEE.amounts[RARE]
    ),
    // an estimate: what the wallet shows is only known once it is built
    give: sumLovelace(
      chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE,
      chain.MINT_DEPOSIT_ESTIMATE_LOVELACE,
      ADA_FEE.amounts[RARE]
    ),
    stays: null,
    exact: false,
    confirmed: false,
  });
  assert.equal(
    costLines({
      estimate: readiness().estimate,
      gameFees: [ADA_FEE],
      tier: "EPIC",
    }).gameFee.amount,
    ADA_FEE.amounts[chain.TIER_ORDER.indexOf("EPIC")]
  );
});

test("two options (ADA and a token): a choice; picking the second uses its amount and label, not in the ADA total, and the mint names its config index", () => {
  const answer = readiness({ gameFees: [ADA_FEE, TOKEN_FEE] });
  assert.deepEqual(feeChoice(answer.gameFees), {
    show: true,
    options: [
      { fee: 0, label: "ADA", asset: "lovelace" },
      { fee: 3, label: "CHOC", asset: TOKEN_FEE.asset },
    ],
  });
  const state = onCosts(answer);
  assert.equal(state.fee, null);
  assert.equal(mintRequest(state).fee, 0);
  const picked = run(state, { type: "pickFee", fee: 3 });
  assert.equal(picked.fee, 3);
  const costs = costsOf(picked);
  assert.deepEqual(costs.gameFee, {
    asset: TOKEN_FEE.asset,
    label: "CHOC",
    amount: TOKEN_FEE.amounts[RARE],
    ada: false,
    // the config's amount: exact before the build too
    exact: true,
  });
  assert.equal(
    costs.total,
    sumLovelace(
      chain.MINT_NETWORK_FEE_ESTIMATE_LOVELACE,
      chain.MINT_DEPOSIT_ESTIMATE_LOVELACE
    )
  );
  assert.deepEqual(mintRequest(picked), {
    itemId: ITEM.id,
    subject: "stake:aa",
    fee: TOKEN_FEE.fee,
  });
  // a fee that is no option changes nothing
  assert.equal(run(picked, { type: "pickFee", fee: 2 }).fee, 3);
  assert.equal(run(picked, { type: "pickFee", fee: -1 }).fee, 3);
  // a new answer without the picked option: the first one again, and a notice
  const refreshed = run(picked, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(refreshed.fee, null);
  assert.equal(mintRequest(refreshed).fee, 0);
  assert.equal(refreshed.problem.key, "MINT_FEE_CHANGED");
});

test("costLines before and after Mint now: the estimate (about) and then the operation's exact costs", () => {
  const before = costsOf(onCosts());
  assert.equal(before.exact, false);
  const after = costsOf(onWallet());
  assert.deepEqual(after, {
    networkFee: String(COSTS.networkFee),
    gameFee: {
      asset: "lovelace",
      label: "ADA",
      amount: String(COSTS.gameFee.amount),
      ada: true,
      // the config's amount: exact before the build too
      exact: true,
    },
    deposit: String(COSTS.deposit),
    total: sumLovelace(COSTS.networkFee, COSTS.gameFee.amount, COSTS.deposit),
    // an answer without the deposit's two parts (an older server): the whole sum
    give: sumLovelace(COSTS.networkFee, COSTS.gameFee.amount, COSTS.deposit),
    stays: null,
    exact: true,
    confirmed: false,
  });
  // an operation without a battlechoc fee
  assert.equal(
    costLines({ costs: { ...COSTS, gameFee: null } }).total,
    sumLovelace(COSTS.networkFee, COSTS.deposit)
  );
  // nothing known yet
  assert.equal(costsOf(start()), null);
});

test("mintRequest: the wallet's own addresses when the flow has them (the extension), none on the phone path", () => {
  const phone = onCosts();
  assert.deepEqual(mintRequest(phone), {
    itemId: ITEM.id,
    subject: "stake:aa",
    fee: 0,
  });
  assert.equal("addresses" in mintRequest(phone), false);
  const extension = run(
    phone,
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01aa", "01bb"] }
  );
  assert.equal(extension.pending, null);
  assert.deepEqual(mintRequest(extension), {
    itemId: ITEM.id,
    subject: "stake:aa",
    fee: 0,
    addresses: ["01aa", "01bb"],
  });
  // an empty or broken list is no list
  assert.equal(
    run(phone, { type: "addresses", addresses: [] }).addresses,
    null
  );
  assert.equal(
    run(phone, { type: "addresses", addresses: "01aa" }).addresses,
    null
  );
});

// ---------------------------------------------------------------------------------------------
// Through the steps

test("the whole way with an extension: costs → wallet → sign → minting → done", () => {
  let state = onCosts();
  assert.equal(state.step, "costs");
  assert.equal(run(state, { type: "back" }).step, "check");
  // the extension's own addresses first, then Mint now with them
  state = run(state, { type: "request", what: "addresses" });
  assert.equal(state.pending, "addresses");
  state = run(state, { type: "addresses", addresses: ["01aa", "00bb"] });
  assert.equal(state.pending, null);
  state = run(state, { type: "request", what: "mint", path: "extension" });
  assert.equal(state.pending, "mint");
  assert.deepEqual(mintRequest(state).addresses, ["01aa", "00bb"]);
  // a double tap sends nothing more
  assert.equal(
    run(state, { type: "request", what: "mint", path: "extension" }),
    state
  );
  state = run(state, {
    type: "prepared",
    answer: prepared({ ownerConfirmed: true }),
  });
  assert.equal(walletTextKey(state), "MINT_WALLET_TEXT");
  assert.equal(state.step, "wallet");
  assert.equal(state.signCode, "code-1");
  assert.equal(state.operation.id, "op-1");
  assert.equal(state.pending, null);
  assert.equal(canSign(state, NOW), true);
  // Back is no way out of a prepared operation: Cancel is
  assert.equal(run(state, { type: "back" }).step, "wallet");
  state = run(state, { type: "signing", via: "extension", now: NOW });
  assert.equal(state.step, "sign");
  assert.equal(state.via, "extension");
  assert.equal(pollTarget(state), "op-1");
  state = run(state, {
    type: "signed",
    answer: {
      state: "submitted",
      operation: operation({ state: "submitted" }),
    },
  });
  assert.equal(state.step, "minting");
  assert.equal(state.signCode, null);
  assert.equal(canCancel(state), false);
  assert.equal(pollTarget(state), "op-1");
  state = run(state, {
    type: "operation",
    operation: operation({ state: "submitted", slow: true }),
  });
  assert.equal(state.step, "minting");
  assert.equal(state.operation.slow, true);
  state = run(state, {
    type: "operation",
    operation: operation({ state: "included" }),
  });
  assert.equal(state.step, "done");
  assert.equal(pollTarget(state), null);
});

test("the phone path: the sign step waits for the server, which reports the signature", () => {
  let state = run(onWallet(), { type: "signing", via: "phone", now: NOW });
  assert.equal(state.step, "sign");
  assert.equal(state.via, "phone");
  state = run(state, { type: "operation", operation: operation() });
  assert.equal(state.step, "sign");
  // cancelling is still possible while the phone has not signed
  assert.equal(canCancel(state), true);
  state = run(state, {
    type: "operation",
    operation: operation({ state: "submitted" }),
  });
  assert.equal(state.step, "minting");
});

test("a prepared operation can be cancelled from every step the flow shows for it", () => {
  const steps = {
    wallet: onWallet(),
    "wallet without its code": start({ operation: operation() }),
    sign: run(onWallet(), { type: "signing", via: "phone", now: NOW }),
    "nothing (declined)": run(
      onWallet(),
      { type: "signing", via: "extension", now: NOW },
      {
        type: "problem",
        failure: new WalletCancelledError({ code: 2, info: "user declined" }),
        during: "sign",
      }
    ),
    "wallet with a problem": run(onWallet(), {
      type: "problem",
      failure: new ChainUnreachableError("busy", { status: 429 }),
      during: "submit",
    }),
  };
  for (const [name, state] of Object.entries(steps)) {
    assert.equal(state.operation.state, "prepared", name);
    assert.equal(canCancel(state), true, name);
    const cancelled = run(
      state,
      { type: "request", what: "cancel" },
      {
        type: "operation",
        operation: operation({ state: "cancelled", error: "cancelled" }),
      }
    );
    assert.equal(cancelled.step, "nothing", name);
    assert.equal(cancelled.problem.key, "MINT_WAS_CANCELLED", name);
  }
});

test("a cancel that comes too late: the problem shows and the poll tells where the operation stands", () => {
  const state = run(
    onWallet(),
    { type: "request", what: "cancel" },
    {
      type: "problem",
      failure: apiError("OPERATION NOT OPEN", 409),
      during: "cancel",
    }
  );
  assert.equal(state.step, "wallet");
  assert.equal(state.problem.key, "MINT_NOT_OPEN");
  assert.equal(state.pending, null);
  assert.equal(pollTarget(state), "op-1");
  assert.equal(
    run(state, {
      type: "operation",
      operation: operation({ state: "submitted" }),
    }).step,
    "minting"
  );
});

test("operation events: included → done; expired with not-signed, expired, rejected → failed with its text; cancelled → nothing", () => {
  const signing = run(onWallet(), { type: "signing", via: "phone", now: NOW });
  assert.equal(
    run(signing, {
      type: "operation",
      operation: operation({ state: "included" }),
    }).step,
    "done"
  );
  const ends = [
    [{ state: "expired", error: "not-signed" }, "failed", "MINT_TIME_UP"],
    [{ state: "expired", error: "expired" }, "failed", "MINT_EXPIRED"],
    [{ state: "expired", error: "rejected" }, "failed", "MINT_NOT_TAKEN"],
    [{ state: "expired", error: "something new" }, "failed", "MINT_FAILED"],
    [
      { state: "cancelled", error: "cancelled" },
      "nothing",
      "MINT_WAS_CANCELLED",
    ],
  ];
  for (const [over, step, key] of ends) {
    const ended = run(signing, {
      type: "operation",
      operation: operation(over),
    });
    assert.equal(ended.step, step, over.error);
    assert.equal(ended.problem.key, key, over.error);
    assert.equal(ended.signCode, null, over.error);
    assert.equal(ended.via, null, over.error);
  }
  // another item's operation, or a state this build does not know, changes nothing
  assert.equal(
    run(signing, {
      type: "operation",
      operation: operation({ itemId: "item-9", state: "included" }),
    }),
    signing
  );
  assert.equal(
    run(signing, {
      type: "operation",
      operation: operation({ state: "frozen" }),
    }).step,
    "sign"
  );
});

test("a rollback (included back to submitted) shows minting again", () => {
  const done = run(onWallet(), {
    type: "operation",
    operation: operation({ state: "included" }),
  });
  assert.equal(
    run(done, {
      type: "operation",
      operation: operation({ state: "submitted" }),
    }).step,
    "minting"
  );
});

test("the player says no in the wallet → nothing happened; Try again goes back to the same signature while its window is open", () => {
  const declined = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: new WalletCancelledError({ code: 2, info: "user declined" }),
      during: "sign",
    }
  );
  assert.equal(declined.step, "nothing");
  assert.equal(declined.problem.key, "MINT_CANCELLED");
  assert.equal(declined.problem.action, "retry");
  assert.equal(declined.problem.reconnect, false);
  assert.equal(declined.signCode, "code-1");
  // the poll goes on: the window may run out, or another device sign
  assert.equal(pollTarget(declined), "op-1");
  const again = run(declined, { type: "retry" });
  assert.equal(again.step, "wallet");
  assert.equal(again.problem, null);
  assert.equal(canSign(again, NOW), true);
});

test("a refusal the flow cannot tell from a lost connection: nothing happened, and connecting again is offered", () => {
  for (const cause of [{ code: -3, info: "refused" }, "user canceled"]) {
    const state = run(
      onWallet(),
      { type: "signing", via: "extension", now: NOW },
      {
        type: "problem",
        failure: new WalletCancelledError(cause),
        during: "sign",
      }
    );
    assert.equal(state.step, "nothing");
    assert.equal(state.problem.key, "MINT_WALLET_SAID_NO");
    assert.equal(state.problem.reconnect, true);
    assert.deepEqual(state.problem.values, { wallet: "Eternl" });
  }
});

test("a refusal before any signature (reading the addresses) is a lost connection: the cost step stays", () => {
  const state = run(
    onCosts(),
    { type: "request", what: "addresses" },
    {
      type: "problem",
      failure: new WalletCancelledError({ code: -3, info: "refused" }),
      during: "addresses",
    }
  );
  assert.equal(state.step, "costs");
  assert.equal(state.problem.key, "MINT_WALLET_LOST");
  assert.equal(state.problem.reconnect, true);
  assert.equal(state.pending, null);
});

test("a wallet problem while signing goes back to the wallet step with its text; the code stays usable", () => {
  const state = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: new WalletNetworkError(0, 1),
      during: "sign",
    }
  );
  assert.equal(state.step, "wallet");
  assert.equal(state.via, null);
  assert.equal(state.problem.key, "MINT_WRONG_NETWORK");
  assert.deepEqual(state.problem.values, {
    wallet: "Eternl",
    network: "Preprod",
  });
  assert.equal(canSign(state, NOW), true);
  // the wallet that opened (the sign door's choice) names the text
  assert.deepEqual(
    run(
      onWallet(),
      { type: "signing", via: "extension", now: NOW },
      {
        type: "problem",
        failure: new WalletOtherAccountError("stake:aa", "stake:cc"),
        during: "sign",
        wallet: "typhoncip30",
      }
    ).problem.values,
    { wallet: "Typhon" }
  );
});

test("no answer after the signature: never 'nothing happened'; the wallet step waits for the poll", () => {
  const unheard = [
    new ChainUnreachableError("network"),
    new ChainUnreachableError("server", { status: 502 }),
    new ChainUnreachableError("not-json", { status: 200 }),
    apiError("INTERNAL SERVER ERROR", 500),
  ];
  for (const failure of unheard) {
    const state = run(
      onWallet(),
      { type: "signing", via: "extension", now: NOW },
      { type: "problem", failure, during: "submit" }
    );
    assert.equal(state.step, "wallet", failure.message);
    assert.equal(state.problem.key, "MINT_SIGNED_UNHEARD", failure.message);
    assert.equal(pollTarget(state), "op-1", failure.message);
    assert.equal(
      run(state, {
        type: "operation",
        operation: operation({ state: "submitted" }),
      }).step,
      "minting"
    );
  }
  // refused before anything was done: those keep their own texts
  for (const [failure, key] of [
    [new ChainUnreachableError("busy", { status: 429 }), "MINT_UNAVAILABLE"],
    [apiError("TOO MANY REQUESTS", 429), "MINT_UNAVAILABLE"],
    [apiError("CHAIN UNAVAILABLE", 503), "MINT_UNAVAILABLE"],
  ]) {
    assert.equal(
      problemOf(failure, { during: "submit" }).key,
      key,
      failure.message
    );
  }
  // no answer to the readiness is just that
  assert.equal(
    problemOf(new ChainUnreachableError("network"), { during: "readiness" })
      .key,
    "MINT_UNAVAILABLE"
  );
});

test("a sign code the server no longer takes: the code is dropped and the poll decides", () => {
  for (const code of ["UNKNOWN SIGN CODE", "OPERATION NOT OPEN"]) {
    const state = run(
      onWallet(),
      { type: "signing", via: "extension", now: NOW },
      {
        type: "problem",
        failure: apiError(code, code === "UNKNOWN SIGN CODE" ? 404 : 409),
        during: "submit",
      }
    );
    assert.equal(state.step, "wallet", code);
    assert.equal(state.problem.key, "MINT_NOT_OPEN", code);
    assert.equal(state.signCode, null, code);
    assert.equal(canSign(state, NOW), false, code);
    assert.equal(pollTarget(state), "op-1", code);
  }
});

test("a refused mint stays on the cost step with the reason; Check again goes back to the checklist", () => {
  const state = run(
    onCosts(),
    { type: "request", what: "mint", path: "phone" },
    { type: "problem", failure: apiError("MINT LIMIT", 409), during: "mint" }
  );
  assert.equal(state.step, "costs");
  assert.equal(state.pending, null);
  assert.equal(state.problem.key, "MINT_CHECK_NONE_LEFT_TEXT");
  // a new attempt hides the old message
  assert.equal(
    run(state, { type: "request", what: "mint", path: "phone" }).problem,
    null
  );
  const busy = run(onCosts(), {
    type: "problem",
    failure: apiError("ITEM BUSY", 409),
    during: "mint",
  });
  assert.equal(busy.problem.action, "recheck");
  const again = run(busy, { type: "retry" });
  assert.equal(again.step, "check");
  assert.equal(again.readiness, null);
  assert.equal(again.subject, "stake:aa");
});

test("the item is gone, minted already or minting is off: the flow ends in failed, without Try again", () => {
  for (const [code, status, key] of [
    ["NOT YOUR ITEM", 400, "MINT_ITEM_GONE"],
    ["NOT FOUND", 404, "MINT_ITEM_GONE"],
    ["ALREADY MINTED", 409, "MINT_ALREADY_MINTED"],
    ["ITEM MINTED", 409, "MINT_ALREADY_MINTED"],
    ["CHAIN OFF", 404, "MINT_OFF"],
  ]) {
    const state = run(onCosts(), {
      type: "problem",
      failure: apiError(code, status),
      during: "mint",
    });
    assert.equal(state.step, "failed", code);
    assert.equal(state.problem.key, key, code);
    assert.equal(state.problem.action, null, code);
  }
});

test("Mint now, signing and the answers only count on their own steps", () => {
  const check = run(start(), {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(
    run(check, { type: "request", what: "mint", path: "phone" }),
    check
  );
  assert.equal(run(check, { type: "prepared", answer: prepared() }), check);
  assert.equal(run(check, { type: "signing", via: "phone", now: NOW }), check);
  assert.equal(run(check, { type: "request", what: "unknown" }), check);
  assert.equal(run(check, { type: "nonsense" }), check);
  // no cancel without a prepared operation
  assert.equal(run(check, { type: "request", what: "cancel" }), check);
  // signing needs the code and an open window
  const lost = start({ operation: operation() });
  assert.equal(
    run(lost, { type: "signing", via: "extension", now: NOW }),
    lost
  );
  // a cost step without a wallet makes no mint request
  assert.equal(mintRequest(start()), null);
});

test("the explainer is not reachable once an operation runs", () => {
  const state = onWallet();
  assert.equal(run(state, { type: "explain" }), state);
});

// ---------------------------------------------------------------------------------------------
// problemOf

const context = {
  wallet: "Eternl",
  network: "Preprod",
  readiness: readiness({
    wallets: [
      wallet({ lovelace: "2100000", waitUntil: "2026-11-16T09:30:00.000Z" }),
    ],
  }),
  subject: "stake:aa",
};

test("problemOf: every API code of the chain routes, table-driven", () => {
  const rows = [
    [
      ["NOT ENOUGH ADA", 400, { missing: "4990000", needed: "7090000" }],
      "MINT_NOT_ENOUGH_ADA",
      { needAda: "7090000", missingAda: "4990000" },
      "recheck",
      null,
    ],
    [
      ["NO COLLATERAL", 400],
      "MINT_NO_COLLATERAL",
      { wallet: "Eternl", amountAda: SELF_SEND_LOVELACE },
      "recheck",
      null,
    ],
    [
      ["WALLET TOO FULL", 400],
      "MINT_WALLET_TOO_FULL",
      { wallet: "Eternl" },
      "recheck",
      null,
    ],
    [["NOT YOUR WALLET", 400], "MINT_NOT_YOUR_WALLET", {}, "recheck", null],
    [["WALLET WAITING", 409], "MINT_CHECK_WAITING_TEXT", {}, "recheck", null],
    [
      ["NOT ENOUGH MATCHES", 403],
      "MINT_CHECK_MATCHES_TEXT",
      { need: chain.MINT_MIN_ONLINE_MATCHES, have: 23 },
      "recheck",
      null,
    ],
    [
      ["MINT LIMIT", 409],
      "MINT_CHECK_NONE_LEFT_TEXT",
      { count: chain.MINTS_PER_DAY },
      "recheck",
      null,
    ],
    [["OPERATION RUNNING", 409], "MINT_BUSY", {}, "recheck", null],
    [["ITEM BUSY", 409], "MINT_BUSY", {}, "recheck", null],
    [["NOT YOUR ITEM", 400], "MINT_ITEM_GONE", {}, null, "failed"],
    [["NOT FOUND", 404], "MINT_ITEM_GONE", {}, null, "failed"],
    [["ALREADY MINTED", 409], "MINT_ALREADY_MINTED", {}, null, "failed"],
    [["ITEM MINTED", 409], "MINT_ALREADY_MINTED", {}, null, "failed"],
    [["CHAIN OFF", 404], "MINT_OFF", {}, null, "failed"],
    [["CHAIN PAUSED", 503], "MINT_PAUSED", {}, "recheck", null],
    [["CHAIN UNAVAILABLE", 503], "MINT_UNAVAILABLE", {}, "recheck", null],
    // a 500 can come after the operation was prepared: Check again finds it
    [["INTERNAL SERVER ERROR", 500], "MINT_ANSWER_LOST", {}, "recheck", null],
    [["TOO MANY REQUESTS", 429], "MINT_UNAVAILABLE", {}, "recheck", null],
    [["UNKNOWN FEE", 400], "MINT_FEE_CHANGED", {}, "recheck", null],
    [["UNKNOWN SIGN CODE", 404], "MINT_NOT_OPEN", {}, null, null],
    [["OPERATION NOT OPEN", 409], "MINT_NOT_OPEN", {}, null, null],
    [
      ["INVALID WITNESS", 400],
      "MINT_BAD_SIGNATURE",
      { wallet: "Eternl" },
      null,
      null,
    ],
    [["INVALID REQUEST PARAMETERS", 400], "MINT_FAILED", {}, "recheck", null],
    [["session ended", 401], "MINT_FAILED", {}, "recheck", null],
  ];
  for (const [[code, status, details], key, values, action, ends] of rows) {
    const problem = problemOf(apiError(code, status, details), {
      ...context,
      during: "mint",
    });
    assert.equal(problem.key, key, code);
    assert.deepEqual(problem.values, values, code);
    assert.equal(problem.action, action, code);
    assert.equal(problem.ends, ends, code);
  }
});

test("problemOf: NOT ENOUGH ADA without a known balance names what is needed and missing only", () => {
  const problem = problemOf(
    apiError("NOT ENOUGH ADA", 400, { missing: "1", needed: "7090000" }),
    { ...context, readiness: null }
  );
  assert.equal(problem.key, "MINT_NOT_ENOUGH_ADA");
  assert.deepEqual(problem.values, { needAda: "7090000", missingAda: "1" });
});

test("problemOf: an API code it does not know, by whether asking again may help; the unreachable server", () => {
  const later = problemOf(apiError("SOMETHING NEW", 503), context);
  assert.equal(later.key, "MINT_UNAVAILABLE");
  const never = problemOf(apiError("SOMETHING NEW", 400), context);
  assert.equal(never.key, "MINT_FAILED");
  assert.equal(never.detail, "400 SOMETHING NEW");
  for (const reason of ["network", "server", "busy", "not-json"]) {
    assert.equal(
      problemOf(new ChainUnreachableError(reason), context).key,
      "MINT_UNAVAILABLE",
      reason
    );
  }
});

test("problemOf: every wallet error class, table-driven", () => {
  const rows = [
    [
      new WalletNetworkError(0, 1),
      "sign",
      "MINT_WRONG_NETWORK",
      { wallet: "Eternl", network: "Preprod" },
      null,
      false,
    ],
    [
      new WalletOtherAccountError("stake:aa", "stake:cc"),
      "sign",
      "MINT_OTHER_WALLET",
      { wallet: "Eternl" },
      null,
      false,
    ],
    [
      new WalletAccountChangedError({ code: -4 }),
      "sign",
      "MINT_ACCOUNT_CHANGED",
      { wallet: "Eternl" },
      null,
      true,
    ],
    [
      new WalletAccountChangedError({ code: -4 }),
      "addresses",
      "MINT_ACCOUNT_CHANGED",
      { wallet: "Eternl" },
      null,
      true,
    ],
    [
      new WalletCannotSignError({ code: 1 }),
      "sign",
      "MINT_WALLET_CANNOT_SIGN",
      { wallet: "Eternl" },
      null,
      false,
    ],
    [
      new WalletCancelledError({ code: 2 }),
      "sign",
      "MINT_CANCELLED",
      {},
      "nothing",
      false,
    ],
    [
      new WalletCancelledError({ code: -3 }),
      "sign",
      "MINT_WALLET_SAID_NO",
      { wallet: "Eternl" },
      "nothing",
      true,
    ],
    [
      new WalletCancelledError("declined"),
      "sign",
      "MINT_WALLET_SAID_NO",
      { wallet: "Eternl" },
      "nothing",
      true,
    ],
    [
      new WalletCancelledError({ code: -3 }),
      "addresses",
      "MINT_WALLET_LOST",
      { wallet: "Eternl" },
      null,
      true,
    ],
    [
      new WalletCancelledError({ code: -3 }),
      "connect",
      "MINT_NO_ACCOUNT",
      { wallet: "Eternl", network: "Preprod" },
      null,
      true,
    ],
    [
      new WalletWithoutAddressError(),
      "sign",
      "MINT_NO_ADDRESS",
      { wallet: "Eternl" },
      null,
      false,
    ],
    [
      new WalletWithoutAddressError(),
      "addresses",
      "MINT_NO_ADDRESS",
      { wallet: "Eternl" },
      null,
      false,
    ],
    [
      new UnsupportedAddressError("f0aa", "script"),
      "sign",
      "MINT_ADDRESS_UNSUPPORTED",
      { wallet: "Eternl" },
      null,
      false,
    ],
    [
      new WalletSignError({ code: -2 }, "code -2: internal"),
      "sign",
      "MINT_FAILED",
      {},
      null,
      false,
    ],
    [
      new TypeError("the transaction to sign is no CBOR hex"),
      "sign",
      "MINT_FAILED",
      {},
      null,
      false,
    ],
    [
      new Error("no wallet eternl"),
      "connect",
      "MINT_NO_ACCOUNT",
      { wallet: "Eternl", network: "Preprod" },
      null,
      true,
    ],
  ];
  for (const [failure, during, key, values, ends, reconnect] of rows) {
    const problem = problemOf(failure, { ...context, during });
    const name = `${failure.name} ${during}`;
    assert.equal(problem.key, key, name);
    assert.deepEqual(problem.values, values, name);
    assert.equal(problem.ends, ends, name);
    assert.equal(problem.reconnect, reconnect, name);
  }
  assert.equal(
    problemOf(new WalletSignError({ code: -2 }, "code -2: internal"), context)
      .detail,
    "code -2: internal"
  );
  assert.equal(
    problemOf(new Error("no wallet eternl"), { ...context, during: "connect" })
      .detail,
    "Error: no wallet eternl"
  );
});

test("problemOf: every operation error value", () => {
  const rows = [
    ["not-signed", "MINT_TIME_UP", "failed"],
    ["expired", "MINT_EXPIRED", "failed"],
    ["rejected", "MINT_NOT_TAKEN", "failed"],
    ["cancelled", "MINT_WAS_CANCELLED", "nothing"],
    ["unheard of", "MINT_FAILED", "failed"],
  ];
  for (const [error, key, ends] of rows) {
    const problem = problemOf(error, context);
    assert.equal(problem.key, key, error);
    assert.equal(problem.ends, ends, error);
    assert.equal(problem.action, "retry", error);
  }
});

test("problemOf: a wallet without a name is named null (the dialog says 'your wallet')", () => {
  assert.deepEqual(
    problemOf(new WalletOtherAccountError("a", "b"), {
      ...context,
      wallet: null,
    }).values,
    { wallet: null }
  );
});

test("the reducer names the picked wallet in its problems", () => {
  const state = run(
    start(),
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ wallets: [wallet(), LACE] }),
    },
    { type: "pickWallet", subject: "stake:bb" },
    { type: "next", now: NOW },
    {
      type: "problem",
      failure: apiError("WALLET TOO FULL", 400),
      during: "mint",
    }
  );
  assert.deepEqual(state.problem.values, { wallet: "Lace" });
});

test("shownValues: the …Ada values as ADA in the language (a balance rounded down, the rest up), a missing wallet name as the fallback, the other values as they are", () => {
  assert.deepEqual(
    shownValues(
      {
        haveAda: "2109999",
        needAda: "7090001",
        missingAda: "4980002",
        wallet: "Eternl",
        count: 3,
      },
      "de"
    ),
    {
      haveAda: "2,1",
      needAda: "7,1",
      missingAda: "4,99",
      wallet: "Eternl",
      count: 3,
    }
  );
  assert.deepEqual(shownValues({ amountAda: SELF_SEND_LOVELACE }, "en"), {
    amountAda: formatAda(SELF_SEND_LOVELACE, "en"),
  });
  assert.deepEqual(shownValues({ haveAda: null }, "en"), { haveAda: null });
  assert.deepEqual(
    shownValues({ wallet: null }, "de", { wallet: "deine Wallet" }),
    { wallet: "deine Wallet" }
  );
  assert.deepEqual(shownValues({ wallet: null }, "de"), { wallet: null });
  assert.deepEqual(
    shownValues({ wallet: "Eternl" }, "de", { wallet: "deine Wallet" }),
    { wallet: "Eternl" }
  );
});

// ---------------------------------------------------------------------------------------------
// Fix round 1: the review's probes as tests

test("F1: the matches line's counts stay counts through shownValues; only ADA values become ADA", () => {
  const matches = lineOf(
    listFor(
      readiness({ matches: { have: 9, need: chain.MINT_MIN_ONLINE_MATCHES } })
    ),
    "matches"
  );
  assert.deepEqual(shownValues(matches.values, "en"), {
    missing: 1,
    need: chain.MINT_MIN_ONLINE_MATCHES,
    have: 9,
  });
  const problem = problemOf(apiError("NOT ENOUGH MATCHES", 403), context);
  assert.deepEqual(shownValues(problem.values, "en"), {
    need: chain.MINT_MIN_ONLINE_MATCHES,
    have: 23,
  });
});

// a flow that has followed this item's operation into `state` (and `step`)
const followed = (...answers) =>
  run(
    onWallet(),
    { type: "signing", via: "phone", now: NOW },
    ...answers.map((over) => ({
      type: "operation",
      operation: operation(over),
    }))
  );
const SUBMITTED = { state: "submitted" };
const INCLUDED = { state: "included" };
const FINAL = { state: "final" };
const EXPIRED = { state: "expired", error: "not-signed" };
const CANCELLED = { state: "cancelled", error: "cancelled" };
const PREPARED = { state: "prepared" };

test("F2: a late answer never moves the flow backwards; a rollback (included → submitted) does", () => {
  const rows = [
    // [the answers that came in, the late answer, the step after, the operation's state after]
    [[SUBMITTED], PREPARED, "minting", "submitted"],
    [[INCLUDED], PREPARED, "done", "included"],
    [[INCLUDED], SUBMITTED, "minting", "submitted"],
    [[FINAL], INCLUDED, "done", "final"],
    [[FINAL], SUBMITTED, "done", "final"],
    [[FINAL], PREPARED, "done", "final"],
    [[SUBMITTED, EXPIRED], SUBMITTED, "failed", "expired"],
    [[SUBMITTED, EXPIRED], PREPARED, "failed", "expired"],
    [[CANCELLED], PREPARED, "nothing", "cancelled"],
    [[CANCELLED], SUBMITTED, "nothing", "cancelled"],
    // forward moves still count
    [[SUBMITTED], INCLUDED, "done", "included"],
    [[SUBMITTED], EXPIRED, "failed", "expired"],
    [[INCLUDED], FINAL, "done", "final"],
  ];
  for (const [before, late, step, state] of rows) {
    const name = `${before.map((over) => over.state).join(" → ")} then ${late.state}`;
    const after = run(followed(...before), {
      type: "operation",
      operation: operation(late),
    });
    assert.equal(after.step, step, name);
    assert.equal(after.operation.state, state, name);
  }
  // the signature's own answer after the poll had seen more
  const included = followed(INCLUDED);
  assert.equal(
    run(included, {
      type: "signed",
      answer: { state: "submitted", operation: operation(SUBMITTED) },
    }).step,
    "done"
  );
  // a prepared answer after the signature (a poll sent while signing)
  const signed = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "signed",
      answer: { state: "submitted", operation: operation(SUBMITTED) },
    },
    { type: "operation", operation: operation(PREPARED) }
  );
  assert.equal(signed.step, "minting");
  assert.equal(signed.problem, null);
  assert.equal(canCancel(signed), false);
  // a late answer about an operation the flow has left (cancelled, then started afresh)
  const fresh = run(followed(CANCELLED), { type: "retry" });
  for (const late of [CANCELLED, PREPARED, SUBMITTED]) {
    const after = run(fresh, { type: "operation", operation: operation(late) });
    assert.equal(after.step, "check", late.state);
    assert.equal(after.operation, null, late.state);
  }
});

test("F3: while Mint now is out, Back, What is this?, Check again and the picks wait; the 201 still lands", () => {
  const out = run(onCosts(), { type: "request", what: "mint", path: "phone" });
  assert.equal(out.pending, "mint");
  for (const event of [
    { type: "back" },
    { type: "explain" },
    { type: "retry" },
    { type: "pickFee", fee: 0 },
    { type: "pickWallet", subject: "stake:aa" },
  ]) {
    assert.equal(run(out, event), out, event.type);
  }
  // a readiness answer meanwhile that already lists the new operation does not take it over
  const listed = run(out, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness({ operation: operation() }),
  });
  assert.equal(listed.step, "costs");
  assert.equal(listed.pending, "mint");
  const landed = run(listed, { type: "prepared", answer: prepared() });
  assert.equal(landed.step, "wallet");
  assert.equal(landed.signCode, "code-1");
  assert.equal(landed.problem, null);
});

const THREE_FEES = [
  { ...ADA_FEE, fee: 0 },
  { ...ADA_FEE, fee: 1, amounts: ["1500000", "2500000", "4500000"] },
  { ...ADA_FEE, fee: 2, amounts: ["1700000", "2700000", "4700000"] },
];

test("F5: the fee pick is the option's config index; gone after a refresh, the first option and a notice", () => {
  const state = onCosts(readiness({ gameFees: THREE_FEES }));
  assert.equal(mintRequest(state).fee, 0);
  const picked = run(state, { type: "pickFee", fee: 1 });
  assert.equal(mintRequest(picked).fee, 1);
  assert.equal(costsOf(picked).gameFee.amount, THREE_FEES[1].amounts[RARE]);
  // the same option at another position: still the player's choice
  const moved = run(picked, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness({ gameFees: [THREE_FEES[2], THREE_FEES[1]] }),
  });
  assert.equal(mintRequest(moved).fee, 1);
  assert.equal(moved.problem, null);
  // the option is gone: the first one, and the player is told
  const gone = run(picked, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness({ gameFees: [THREE_FEES[0], THREE_FEES[2]] }),
  });
  assert.equal(mintRequest(gone).fee, 0);
  assert.equal(gone.problem.key, "MINT_FEE_CHANGED");
  // an option that does not exist cannot be picked
  assert.equal(run(state, { type: "pickFee", fee: 7 }), state);
});

test("F6 and R2: the estimate's lines are rounded up and the total is their sum; exact amounts are shown exactly", () => {
  const costs = costLines({
    estimate: { networkFee: "171234", deposit: "1241210" },
    gameFees: [{ ...ADA_FEE, amounts: ["2000000", "2000000", "2000000"] }],
    tier: "RARE",
  });
  const shown = [costs.networkFee, costs.deposit, costs.gameFee.amount].map(
    (amount) => formatAda(amount, "en")
  );
  assert.deepEqual(shown, ["0.18", "1.25", "2"]);
  assert.equal(formatAda(costs.total, "en"), "3.43");
  assert.equal(costs.total, sumLovelace("180000", "1250000", "2000000"));
  // after Mint now: every digit, the total the exact sum, as the wallet shows it
  assert.equal(formatAda("431234", "en", { exact: true }), "0.431234");
  assert.equal(formatAda("1241210", "de", { exact: true }), "1,24121");
  assert.equal(formatAda("2000000", "en", { exact: true }), "2");
  assert.equal(formatAda("1", "en", { exact: true }), "0.000001");
  const exact = costLines({ costs: COSTS });
  assert.equal(
    formatAda(exact.total, "en", { exact: true }),
    formatAda(
      sumLovelace(COSTS.networkFee, COSTS.gameFee.amount, COSTS.deposit),
      "en",
      { exact: true }
    )
  );
  assert.equal(exact.total, "5888023");
});

test("F4: a refusal by the network says only that the network did not take it", () => {
  const problem = problemOf("rejected", context);
  assert.equal(problem.key, "MINT_NOT_TAKEN");
  assert.equal(problem.ends, "failed");
  assert.equal(problem.action, "retry");
});

test("F7: NOT YOUR WALLET after the extension's addresses were sent: the other account is open in the wallet", () => {
  const sent = run(
    onCosts(),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01aa"] },
    { type: "request", what: "mint", path: "extension" },
    {
      type: "problem",
      failure: apiError("NOT YOUR WALLET", 400),
      during: "mint",
    }
  );
  assert.equal(sent.step, "costs");
  assert.equal(sent.problem.key, "MINT_OTHER_WALLET");
  assert.deepEqual(sent.problem.values, { wallet: "Eternl" });
  assert.equal(sent.problem.reconnect, true);
  // the addresses are read anew with the new connection
  assert.equal(sent.addresses, null);
  // without addresses (the phone path) it is the checklist's matter
  const phone = run(onCosts(), {
    type: "problem",
    failure: apiError("NOT YOUR WALLET", 400),
    during: "mint",
  });
  assert.equal(phone.problem.key, "MINT_NOT_YOUR_WALLET");
  assert.equal(phone.problem.action, "recheck");
});

test("R3: the extension path never sends a mint without the wallet's addresses", () => {
  const costs = onCosts();
  assert.equal(
    run(costs, { type: "request", what: "mint", path: "extension" }),
    costs
  );
  // the addresses could not be read: the wallet's failure shows, no mint goes out
  const failed = run(
    costs,
    { type: "request", what: "addresses" },
    {
      type: "problem",
      failure: new WalletAccountChangedError({ code: -4 }),
      during: "addresses",
    }
  );
  assert.equal(failed.problem.key, "MINT_ACCOUNT_CHANGED");
  assert.equal(
    run(failed, { type: "request", what: "mint", path: "extension" }),
    failed
  );
  const read = run(costs, { type: "addresses", addresses: ["01aa"] });
  assert.equal(
    run(read, { type: "request", what: "mint", path: "extension" }).pending,
    "mint"
  );
  // a path the flow does not know is no request
  assert.equal(run(read, { type: "request", what: "mint" }), read);
});

test("R3: ADDRESSES NEEDED at the signature offers going back (cancel, the cost screen) to start again", () => {
  const state = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: apiError("ADDRESSES NEEDED", 409),
      during: "submit",
    }
  );
  assert.equal(state.step, "wallet");
  assert.equal(state.problem.key, "MINT_ADDRESSES_NEEDED");
  assert.equal(state.problem.action, "back");
  assert.equal(run(state, { type: "back" }).pending, "cancel");
});

test("R3: an operation rebuilt for the wallet replaces the shown costs and the transaction this tab holds; the wallet text promises the exact amounts only once the wallet vouched", () => {
  const state = onWallet();
  assert.equal(walletTextKey(state), "MINT_WALLET_TEXT_UNCONFIRMED");
  assert.equal(costsOf(state).confirmed, false);
  const rebuiltCosts = { ...COSTS, networkFee: 441111 };
  const rebuilt = run(state, {
    type: "operation",
    operation: operation({
      txHash: "cd".repeat(32),
      costs: rebuiltCosts,
      ownerConfirmed: true,
    }),
  });
  assert.equal(rebuilt.step, "wallet");
  assert.equal(costsOf(rebuilt).networkFee, "441111");
  assert.equal(costsOf(rebuilt).confirmed, true);
  assert.deepEqual(rebuilt.pastTxHashes, [state.operation.txHash]);
  assert.equal(walletTextKey(rebuilt), "MINT_WALLET_TEXT");
  // the same transaction again is no rebuild
  const same = run(state, { type: "operation", operation: operation() });
  assert.deepEqual(same.pastTxHashes, []);
  // the extension path: the 201 already vouches
  const vouched = run(
    onCosts(),
    { type: "addresses", addresses: ["01aa"] },
    { type: "request", what: "mint", path: "extension" },
    { type: "prepared", answer: prepared({ ownerConfirmed: true }) }
  );
  assert.equal(walletTextKey(vouched), "MINT_WALLET_TEXT");
});

test("R1: Back on the wallet step cancels the prepared operation and lands on the cost screen once confirmed", () => {
  const back = run(onWallet(), { type: "back" });
  assert.equal(back.step, "wallet");
  assert.equal(back.pending, "cancel");
  // while the cancel is out, no tap is taken
  for (const event of [
    { type: "back" },
    { type: "retry" },
    { type: "signing", via: "extension", now: NOW },
    { type: "request", what: "cancel" },
    { type: "request", what: "readiness", itemId: ITEM.id },
  ]) {
    assert.equal(run(back, event), back, event.type);
  }
  const confirmed = run(back, {
    type: "operation",
    operation: operation({ state: "cancelled", error: "cancelled" }),
  });
  assert.equal(confirmed.step, "costs");
  assert.equal(confirmed.problem, null);
  assert.equal(confirmed.operation, null);
  assert.equal(confirmed.signCode, null);
  assert.equal(confirmed.pending, null);
  assert.equal(costsOf(confirmed).exact, false);
  // a late answer about the cancelled operation changes nothing
  assert.equal(
    run(confirmed, { type: "operation", operation: operation() }),
    confirmed
  );
  // Mint now again makes a new one
  assert.equal(
    run(
      confirmed,
      { type: "request", what: "mint", path: "phone" },
      { type: "prepared", answer: prepared({ id: "op-2" }) }
    ).operation.id,
    "op-2"
  );
  // the cancel refused because it was signed meanwhile: the flow follows the operation
  const refused = run(back, {
    type: "problem",
    failure: apiError("OPERATION NOT OPEN", 409),
    during: "cancel",
  });
  assert.equal(refused.problem.key, "MINT_NOT_OPEN");
  assert.equal(refused.afterCancel, null);
  assert.equal(
    run(refused, {
      type: "operation",
      operation: operation({ state: "submitted" }),
    }).step,
    "minting"
  );
  // the phone signed while the cancel was out
  assert.equal(
    run(back, {
      type: "operation",
      operation: operation({ state: "submitted" }),
    }).step,
    "minting"
  );
  // the cancel itself, from the Cancel button, still ends in nothing
  assert.equal(
    run(
      onWallet(),
      { type: "request", what: "cancel" },
      {
        type: "operation",
        operation: operation({ state: "cancelled", error: "cancelled" }),
      }
    ).step,
    "nothing"
  );
});

test("M2: a cancel can go out while a readiness request is", () => {
  const state = run(onWallet(), {
    type: "request",
    what: "readiness",
    itemId: ITEM.id,
  });
  assert.equal(canCancel(state), true);
  const cancelling = run(state, { type: "request", what: "cancel" });
  assert.equal(cancelling.pending, "cancel");
});

test("M3: after a 'no' in the wallet the poll goes on, and the end of the window shows", () => {
  const declined = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: new WalletCancelledError({ code: 2 }),
      during: "sign",
    }
  );
  assert.equal(pollTarget(declined), "op-1");
  const over = run(declined, {
    type: "operation",
    operation: operation({ state: "expired", error: "not-signed" }),
  });
  assert.equal(over.step, "failed");
  assert.equal(over.problem.key, "MINT_TIME_UP");
  assert.equal(pollTarget(over), null);
});

test("M4: a lost answer to Mint now or to a cancel never says 'nothing happened'", () => {
  const mint = run(
    onCosts(),
    { type: "request", what: "mint", path: "phone" },
    {
      type: "problem",
      failure: new ChainUnreachableError("network"),
      during: "mint",
    }
  );
  assert.equal(mint.problem.key, "MINT_ANSWER_LOST");
  assert.equal(mint.problem.action, "recheck");
  // Check again finds the prepared operation and offers Cancel
  const found = run(
    mint,
    { type: "retry" },
    {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ operation: operation() }),
    }
  );
  assert.equal(found.step, "wallet");
  assert.equal(found.problem.key, "MINT_RESUME_LOST");
  assert.equal(canCancel(found), true);
  const cancel = run(
    onWallet(),
    { type: "request", what: "cancel" },
    {
      type: "problem",
      failure: new ChainUnreachableError("network"),
      during: "cancel",
    }
  );
  assert.equal(cancel.problem.key, "MINT_CANCEL_ANSWER_LOST");
  assert.equal(pollTarget(cancel), "op-1");
  // a limit came before anything was done
  assert.equal(
    problemOf(apiError("TOO MANY REQUESTS", 429), { during: "mint" }).key,
    "MINT_UNAVAILABLE"
  );
});

test("M5: while a signature may have gone out unheard, neither Open wallet nor Cancel", () => {
  const state = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: new ChainUnreachableError("network"),
      during: "submit",
    }
  );
  assert.equal(state.problem.key, "MINT_SIGNED_UNHEARD");
  assert.equal(canSign(state, NOW), false);
  assert.equal(canCancel(state), false);
  assert.equal(run(state, { type: "back" }), state);
  assert.equal(run(state, { type: "request", what: "cancel" }), state);
});

test("M6: a wallet's late failure does not override minting or done", () => {
  for (const state of [followed(SUBMITTED), followed(INCLUDED)]) {
    for (const failure of [
      new WalletCancelledError({ code: 2 }),
      new WalletNetworkError(0, 1),
    ]) {
      assert.equal(
        run(state, { type: "problem", failure, during: "sign" }),
        state
      );
    }
  }
});

test("M9: the security line comes from the server's collateral field; no wallet chosen yet has its own text", () => {
  const bundled = wallet({ enough: false, missing: "0", collateral: false });
  assert.equal(
    lineOf(listFor(readiness({ wallets: [bundled] })), "ada").key,
    "MINT_CHECK_COLLATERAL"
  );
  // not enough, nothing missing, the security fine: no reason the game could name
  const odd = wallet({ enough: false, missing: "0", collateral: true });
  assert.equal(
    lineOf(listFor(readiness({ wallets: [odd] })), "ada").key,
    "MINT_CHECK_ADA_UNKNOWN"
  );
  // ADA missing and no security: the missing ADA first (receiving it in one payment fixes both)
  const both = wallet({ enough: false, missing: "100", collateral: false });
  assert.equal(
    lineOf(listFor(readiness({ wallets: [both] })), "ada").key,
    "MINT_CHECK_LOW"
  );
  // two wallets, none chosen: checked once one is chosen
  const two = listFor(readiness({ wallets: [wallet(), LACE] }));
  assert.deepEqual(lineOf(two, "ada"), {
    id: "ada",
    met: null,
    key: "MINT_CHECK_ADA_LATER",
    text: "MINT_CHECK_ADA_CHOOSE_TEXT",
    values: { needAda: NEEDED },
  });
  const unknownNeed = listFor(
    readiness({
      wallets: [wallet(), LACE],
      estimate: { ...readiness().estimate, needed: null },
    })
  );
  assert.deepEqual(lineOf(unknownNeed, "ada"), {
    id: "ada",
    met: null,
    key: "MINT_CHECK_ADA_PENDING",
    text: "MINT_CHECK_ADA_CHOOSE_TEXT",
    values: {},
  });
});

test("M11: a readiness answer or request for another item is ignored", () => {
  const state = start();
  assert.equal(
    run(state, { type: "readiness", itemId: "item-9", answer: readiness() }),
    state
  );
  assert.equal(run(state, { type: "readiness", answer: readiness() }), state);
  assert.equal(
    run(state, { type: "request", what: "readiness", itemId: "item-9" }),
    state
  );
});

test("R4: a wallet without a name: the sentences that need one have a nameless variant", () => {
  const nameless = wallet({ name: null });
  const lines = listFor(readiness({ wallets: [nameless] }));
  assert.equal(lineOf(lines, "wallet").text, "MINT_CHECK_WALLET_TEXT_NAMELESS");
  assert.deepEqual(lineOf(lines, "wallet").values, {
    address: "stake_test1uqaa",
    network: "Preprod",
  });
  const waitUntil = new Date(NOW + MINUTE).toISOString();
  const waits = lineOf(
    listFor(readiness({ wallets: [wallet({ name: null, waitUntil })] })),
    "wallet"
  );
  assert.equal(waits.key, "MINT_CHECK_WAITING_NAMELESS");
  assert.deepEqual(waits.values, { time: waitUntil });
  const connect = problemOf(new WalletCancelledError({ code: -3 }), {
    during: "connect",
    wallet: null,
    network: "Preprod",
  });
  assert.equal(connect.key, "MINT_NO_ACCOUNT_NAMELESS");
  assert.deepEqual(connect.values, { network: "Preprod" });
  // with a name, the named sentence
  assert.equal(
    problemOf(new WalletCancelledError({ code: -3 }), {
      during: "connect",
      wallet: "Eternl",
      network: "Preprod",
    }).key,
    "MINT_NO_ACCOUNT"
  );
});

// ---------------------------------------------------------------------------------------------
// Task 8's wiring: the defects the re-review of Task 7 left (H1–H6), and what the dialog needs

const NOT_FOUND = () => apiError("NOT FOUND", 404);

test("H1: a problem of a call the flow does not wait for keeps the hold and the target after a cancel", () => {
  // Back on the wallet step: the cancel is out; a poll fails meanwhile
  const back = run(onWallet(), { type: "back" });
  const polled = run(back, {
    type: "problem",
    failure: NOT_FOUND(),
    during: "operation",
  });
  assert.equal(polled.pending, "cancel");
  assert.equal(polled.afterCancel, "costs");
  assert.equal(canSign(polled, NOW), false);
  // the cancel's answer still lands on the cost screen
  assert.equal(
    run(polled, {
      type: "operation",
      operation: operation({ state: "cancelled", error: "cancelled" }),
    }).step,
    "costs"
  );
  // a wallet's failure while Mint now is out waits too
  const minting = run(onCosts(), {
    type: "request",
    what: "mint",
    path: "phone",
  });
  assert.equal(
    run(minting, {
      type: "problem",
      failure: new WalletNetworkError(0, 1),
      during: "connect",
    }).pending,
    "mint"
  );
  // a problem of another call while readiness is out shows, and readiness's answer still counts
  const asking = run(onCosts(), {
    type: "request",
    what: "readiness",
    itemId: ITEM.id,
  });
  const lost = run(asking, {
    type: "problem",
    failure: new WalletCancelledError({ code: -3 }),
    during: "addresses",
  });
  assert.equal(lost.problem.key, "MINT_WALLET_LOST");
  assert.equal(lost.pending, "readiness");
  // the problem of the call waited for releases the hold
  const refused = run(back, {
    type: "problem",
    failure: apiError("OPERATION NOT OPEN", 409),
    during: "cancel",
  });
  assert.equal(refused.pending, null);
  assert.equal(refused.afterCancel, null);
});

test("H1: a poll that fails says the flow cannot see where the minting stands, never 'nothing happened', and leaves the step", () => {
  const signing = run(onWallet(), { type: "signing", via: "phone", now: NOW });
  const state = run(signing, {
    type: "problem",
    failure: apiError("UNAUTHORIZED", 401),
    during: "operation",
  });
  assert.equal(state.step, "sign");
  assert.equal(state.via, "phone");
  assert.equal(state.problem.key, "MINT_STATUS_UNKNOWN");
  assert.equal(state.problem.ends, null);
  assert.equal(state.signCode, signing.signCode);
  assert.equal(canCancel(state), true);
  const minting = run(followed(SUBMITTED), {
    type: "problem",
    failure: apiError("UNAUTHORIZED", 401),
    during: "operation",
  });
  assert.equal(minting.step, "minting");
  assert.equal(minting.problem.key, "MINT_STATUS_UNKNOWN");
  // the next answer of the poll clears it
  assert.equal(
    run(minting, {
      type: "operation",
      operation: operation({ state: "included" }),
    }).problem,
    null
  );
});

test("H2: on the failed step a later end of the operation keeps the specific problem shown", () => {
  const gone = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: apiError("NOT YOUR ITEM", 409),
      during: "submit",
    }
  );
  assert.equal(gone.step, "failed");
  assert.equal(gone.problem.key, "MINT_ITEM_GONE");
  for (const end of [
    operation({ state: "expired", error: "item-gone" }),
    operation({ state: "expired", error: "not-signed" }),
    operation({ state: "cancelled", error: "cancelled" }),
  ]) {
    const after = run(gone, { type: "operation", operation: end });
    assert.equal(after.step, "failed", end.error);
    assert.equal(after.problem.key, "MINT_ITEM_GONE", end.error);
    assert.equal(pollTarget(after), null, end.error);
  }
  // the same answer while it is still prepared changes nothing shown either
  assert.equal(
    run(gone, { type: "operation", operation: operation() }).problem.key,
    "MINT_ITEM_GONE"
  );
});

test("H3: asking for the addresses, or picking another wallet, drops the addresses read before", () => {
  const read = run(onCosts(), { type: "addresses", addresses: ["01aa"] });
  assert.deepEqual(read.addresses, ["01aa"]);
  assert.equal(
    run(read, { type: "request", what: "addresses" }).addresses,
    null
  );
  const two = readiness({ wallets: [wallet(), LACE] });
  const picked = run(
    start(),
    { type: "readiness", itemId: ITEM.id, answer: two },
    { type: "pickWallet", subject: "stake:aa" },
    { type: "next", now: NOW },
    { type: "addresses", addresses: ["01aa"] },
    { type: "back" }
  );
  assert.deepEqual(picked.addresses, ["01aa"]);
  // the same wallet again keeps them; another drops them
  assert.deepEqual(
    run(picked, { type: "pickWallet", subject: "stake:aa" }).addresses,
    ["01aa"]
  );
  assert.equal(
    run(picked, { type: "pickWallet", subject: LACE.subject }).addresses,
    null
  );
});

test("H4: while ADDRESSES NEEDED shows, signing is not offered again: only Back", () => {
  const state = run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: apiError("ADDRESSES NEEDED", 409),
      during: "submit",
    }
  );
  assert.equal(canSign(state, NOW), false);
  assert.equal(
    run(state, { type: "signing", via: "extension", now: NOW }),
    state
  );
  assert.equal(canCancel(state), true);
  assert.equal(run(state, { type: "back" }).pending, "cancel");
});

test("H5: a poll answer from before a rebuild does not bring the old costs back", () => {
  const rebuiltCosts = { ...COSTS, networkFee: 441111 };
  const rebuilt = run(onWallet(), {
    type: "operation",
    operation: operation({
      txHash: "cd".repeat(32),
      costs: rebuiltCosts,
      ownerConfirmed: true,
    }),
  });
  const late = run(rebuilt, { type: "operation", operation: operation() });
  assert.equal(late, rebuilt);
  assert.equal(costsOf(late).networkFee, "441111");
  assert.equal(walletTextKey(late), "MINT_WALLET_TEXT");
  // the rebuilt one again is taken in as before, and so is its signature
  assert.equal(
    run(rebuilt, {
      type: "operation",
      operation: operation({
        state: "submitted",
        txHash: "cd".repeat(32),
        costs: rebuiltCosts,
      }),
    }).step,
    "minting"
  );
});

test("the address proof: a fault on battlechoc's side or the device's clock, never the player's; INVALID SIGNATURE", () => {
  // the rebuilt answer was not usable: battlechoc's fault, signing may be tried again
  const owner = new OwnerNotConfirmedError({ ownerConfirmed: false }, "tx");
  assert.deepEqual(problemOf(owner, { during: "sign" }), {
    key: "MINT_OWNER_NOT_CONFIRMED",
    values: {},
    action: null,
    ends: null,
    reconnect: false,
    detail: "tx",
  });
  const signing = run(onWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const ownerState = run(signing, {
    type: "problem",
    failure: owner,
    during: "sign",
  });
  assert.equal(ownerState.step, "wallet");
  assert.equal(canSign(ownerState, NOW), true);
  // the server's text was not battlechoc's proof for this operation: nothing was asked
  const text = problemOf(new UnexpectedProofTextError("digest"), {
    during: "sign",
  });
  assert.equal(text.key, "MINT_PROOF_TEXT");
  assert.equal(text.detail, "digest");
  assert.equal(text.action, null);
  // an expiry beyond the sign window is the server's text gone wrong like any other field (the
  // device's clock no longer decides anything): nothing was asked, signing may be tried again
  const late = run(signing, {
    type: "problem",
    failure: new UnexpectedProofTextError("expires"),
    during: "sign",
  });
  assert.equal(late.problem.key, "MINT_PROOF_TEXT");
  assert.equal(late.problem.detail, "expires");
  assert.equal(late.step, "wallet");
  assert.equal(canSign(late, NOW), true);
  // the server did not accept the wallet's proof
  assert.deepEqual(
    problemOf(apiError("INVALID SIGNATURE", 400), { during: "sign" }),
    {
      key: "MINT_PROOF_REFUSED",
      values: {},
      action: null,
      ends: null,
      reconnect: false,
      detail: null,
    }
  );
});

test("the time ran out: the text takes the sign window's minutes", () => {
  assert.deepEqual(problemOf("not-signed").values, {
    minutes: chain.SIGN_WINDOW_MS / MINUTE,
  });
});

// ---------------------------------------------------------------------------------------------
// Task 8, fix round 1

const unheard = () =>
  run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: new ChainUnreachableError("network"),
      during: "submit",
    }
  );
const addressesNeeded = () =>
  run(
    onWallet(),
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: apiError("ADDRESSES NEEDED", 409),
      during: "submit",
    }
  );
// a dialog opened on a prepared minting that this tab has no sign code for (another tab's)
const resumeLost = () => start({ operation: operation() });

const pollFails = (state) =>
  run(state, {
    type: "problem",
    failure: apiError("UNAUTHORIZED", 401),
    during: "operation",
  });

test("round 1, I1: a problem that forbids signing survives a poll that fails", () => {
  for (const [name, make, cancel] of [
    ["MINT_SIGNED_UNHEARD", unheard, false],
    ["MINT_ADDRESSES_NEEDED", addressesNeeded, true],
  ]) {
    const before = make();
    assert.equal(before.problem.key, name);
    const after = pollFails(before);
    assert.equal(after.problem.key, name, name);
    assert.equal(canSign(after, NOW), false, name);
    assert.equal(canCancel(after), cancel, name);
  }
  // with nothing shown before, the poll's own text, and the guards as they were
  const plain = onWallet();
  const unknown = pollFails(plain);
  assert.equal(unknown.problem.key, "MINT_STATUS_UNKNOWN");
  assert.equal(canSign(unknown, NOW), canSign(plain, NOW));
  assert.equal(canCancel(unknown), canCancel(plain));
});

test("9b: noSigning names the problems under which the wallet step offers no signature (what the dialog shows then)", () => {
  for (const make of [unheard, addressesNeeded]) {
    const state = make();
    assert.equal(noSigning(state), true, state.problem.key);
    assert.equal(canSign(state, NOW), false, state.problem.key);
  }
  assert.equal(noSigning(onWallet()), false);
  assert.equal(noSigning(pollFails(onWallet())), false);
});

test("D47: the wallet step without this tab's sign code shows no prompts; a failed poll may replace MINT_RESUME_LOST, and the view stays without them", () => {
  // a dialog from a second tab: the problem, the wallet box and the problem's Cancel only
  const lost = resumeLost();
  assert.equal(lost.step, "wallet");
  assert.equal(lost.problem.key, "MINT_RESUME_LOST");
  assert.deepEqual(walletStepView(lost), { prompts: false, back: false });
  // the poll cannot tell where it stands: its text, never "prepared … no ADA spent" as a fact; the
  // view still offers no signature, and the step's Back cancels (the problem offers none)
  const unknown = pollFails(lost);
  assert.equal(unknown.problem.key, "MINT_STATUS_UNKNOWN");
  assert.equal(canSign(unknown, NOW), false);
  assert.deepEqual(walletStepView(unknown), { prompts: false, back: true });
  // the poll answers again: the problem is back
  assert.equal(
    run(unknown, { type: "operation", operation: operation() }).problem.key,
    "MINT_RESUME_LOST"
  );
  // the problems that rule signing out: their own action only
  for (const make of [unheard, addressesNeeded]) {
    assert.deepEqual(walletStepView(make()), { prompts: false, back: false });
  }
  // with this tab's code: the step as it is
  assert.deepEqual(walletStepView(onWallet()), { prompts: true, back: true });
});

test("round 1, I2: the battlechoc fee is exact before the build too; only the network fee, the deposit and their total are estimates", () => {
  const fee = { ...ADA_FEE, amounts: ["1234567", "1234567", "1234567"] };
  const costs = costLines({
    estimate: { networkFee: "171234", deposit: "1241210" },
    gameFees: [fee],
    tier: "RARE",
  });
  assert.equal(costs.gameFee.amount, "1234567");
  assert.equal(costs.gameFee.exact, true);
  assert.equal(costs.exact, false);
  assert.equal(costs.total, sumLovelace("180000", "1250000", "1234567"));
  assert.deepEqual(
    costRows(costs).map(({ kind, amount, exact }) => [kind, amount, exact]),
    [
      ["network", "180000", false],
      ["game", "1234567", true],
      ["deposit", "1250000", false],
    ]
  );
  // after the build every row is exact
  assert.deepEqual(
    costRows(costLines({ costs: COSTS })).map((row) => row.exact),
    [true, true, true]
  );
  // a fee in a token: its own unit, exact
  const token = costRows(
    costLines({
      estimate: { networkFee: "171234", deposit: "1241210" },
      gameFees: [TOKEN_FEE],
      fee: TOKEN_FEE.fee,
      tier: "RARE",
    })
  ).find((row) => row.kind === "game");
  assert.deepEqual(
    [token.amount, token.ada, token.unit, token.exact],
    ["100", false, "CHOC", true]
  );
  // no fee: two rows
  assert.deepEqual(
    costRows(
      costLines({
        estimate: { networkFee: "1", deposit: "1" },
        gameFees: [],
        tier: "RARE",
      })
    ).map((row) => row.kind),
    ["network", "deposit"]
  );
});

test("round 1, I3: the outcome of a signature for another operation changes nothing", () => {
  const second = run(
    onCosts(),
    { type: "request", what: "mint", path: "phone" },
    { type: "prepared", answer: prepared({ id: "op-2" }) }
  );
  assert.equal(second.operationId, "op-2");
  for (const failure of [
    apiError("OPERATION NOT OPEN", 409),
    new WalletCancelledError({ code: 2 }),
  ]) {
    assert.equal(
      run(second, {
        type: "problem",
        failure,
        during: "submit",
        operationId: "op-1",
      }),
      second
    );
  }
  // its own operation's outcome counts
  const own = run(
    second,
    { type: "signing", via: "extension", now: NOW },
    {
      type: "problem",
      failure: apiError("OPERATION NOT OPEN", 409),
      during: "submit",
      operationId: "op-2",
    }
  );
  assert.equal(own.problem.key, "MINT_NOT_OPEN");
});

test("round 1, minor 5: a reopened dialog that learns its operation takes this tab's code for it", () => {
  const lost = start({ operation: operation() });
  assert.equal(lost.problem.key, "MINT_RESUME_LOST");
  assert.equal(canSign(lost, NOW), false);
  assert.equal(
    run(lost, { type: "signCode", operationId: "op-9", signCode: "x" }),
    lost
  );
  const found = run(lost, {
    type: "signCode",
    operationId: "op-1",
    signCode: "code-1",
  });
  assert.equal(found.signCode, "code-1");
  assert.equal(found.problem, null);
  assert.equal(canSign(found, NOW), true);
  // a code is never replaced, and an operation that is not prepared takes none
  const held = onWallet();
  assert.equal(
    run(held, { type: "signCode", operationId: "op-1", signCode: "other" }),
    held
  );
  const minting = followed(SUBMITTED);
  assert.equal(
    run(minting, { type: "signCode", operationId: "op-1", signCode: "x" }),
    minting
  );
});

test("round 1: a value that is missing is never written into a text: the variant without it", () => {
  const matches = problemOf(apiError("NOT ENOUGH MATCHES", 403), {
    during: "mint",
    readiness: null,
  });
  assert.deepEqual(
    [matches.key, matches.values],
    ["MINT_CHECK_MATCHES_NEED", { need: chain.MINT_MIN_ONLINE_MATCHES }]
  );
  assert.equal(
    problemOf(apiError("NOT ENOUGH MATCHES", 403), {
      during: "mint",
      readiness: readiness({ matches: { have: 4, need: 10 } }),
    }).key,
    "MINT_CHECK_MATCHES_TEXT"
  );
  for (const details of [{}, { needed: "7090000" }, { missing: "1" }]) {
    const ada = problemOf(apiError("NOT ENOUGH ADA", 400, details), {
      during: "mint",
    });
    assert.deepEqual([ada.key, ada.values], ["MINT_NOT_ENOUGH_ADA_PLAIN", {}]);
  }
});

// ---------------------------------------------------------------------------------------------
// The fix wave after the whole-branch review (C-…: the client seat's findings)

test("C-I3: the phone path's waiting step goes back to the wallet step without cancelling; Open wallet there as canSign says", () => {
  const waiting = run(onWallet(), { type: "signing", via: "phone", now: NOW });
  assert.equal(waiting.step, "sign");
  const again = run(waiting, { type: "walletAgain" });
  assert.equal(again.step, "wallet");
  assert.equal(again.via, null);
  assert.equal(again.pending, null);
  assert.equal(again.signCode, waiting.signCode);
  assert.equal(again.operation, waiting.operation);
  assert.equal(canSign(again, NOW), true);
  assert.equal(canCancel(again), true);
  // past the window: back on the wallet step, but no signature offered
  assert.equal(
    canSign(again, Date.parse(waiting.operation.signUntil) + 1),
    false
  );
  // only from the phone path's waiting step
  const extension = run(onWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  assert.equal(run(extension, { type: "walletAgain" }), extension);
  assert.equal(run(onWallet(), { type: "walletAgain" }).step, "wallet");
  // not while a cancel is out
  const cancelling = run(waiting, { type: "request", what: "cancel" });
  assert.equal(cancelling.pending, "cancel");
  assert.equal(run(cancelling, { type: "walletAgain" }), cancelling);
});

test("C-M1: a late failure for an operation that has ended keeps its end and its text", () => {
  const signing = run(onWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const cancelled = run(
    signing,
    { type: "request", what: "cancel" },
    {
      type: "operation",
      operation: operation({ state: "cancelled", error: "cancelled" }),
    }
  );
  assert.equal(cancelled.step, "nothing");
  assert.equal(cancelled.problem.key, "MINT_WAS_CANCELLED");
  for (const [failure, during] of [
    [apiError("OPERATION NOT OPEN", 409), "submit"],
    [new WalletCancelledError({ code: 2 }), "sign"],
    [apiError("OPERATION NOT OPEN", 409), "cancel"],
  ]) {
    assert.equal(
      run(cancelled, { type: "problem", failure, during, operationId: "op-1" }),
      cancelled,
      `${failure.message} during ${during}`
    );
  }
  // an open operation's failure still shows
  assert.equal(
    run(signing, {
      type: "problem",
      failure: apiError("OPERATION NOT OPEN", 409),
      during: "submit",
      operationId: "op-1",
    }).problem.key,
    "MINT_NOT_OPEN"
  );
});

test("C-M5: a poll answered 404 (the item was salvaged) ends the flow with MINT_ITEM_GONE, not 'status unknown'", () => {
  for (const before of [
    onWallet(),
    run(onWallet(), { type: "signing", via: "phone", now: NOW }),
    followed(SUBMITTED),
  ]) {
    const gone = run(before, {
      type: "problem",
      failure: NOT_FOUND(),
      during: "operation",
    });
    assert.equal(gone.step, "failed", before.step);
    assert.equal(gone.problem.key, "MINT_ITEM_GONE");
    assert.equal(gone.operation, null);
    assert.equal(gone.signCode, null);
    assert.equal(pollTarget(gone), null);
    assert.equal(canCancel(gone), false);
    assert.deepEqual(gone.pastOperations, ["op-1"]);
    // a late answer about it changes nothing
    assert.equal(
      run(gone, { type: "operation", operation: operation() }),
      gone
    );
  }
  // even under a problem that rules signing out: the item is gone
  assert.equal(
    run(unheard(), {
      type: "problem",
      failure: NOT_FOUND(),
      during: "operation",
    }).problem.key,
    "MINT_ITEM_GONE"
  );
});

test("C-I2: a picked wallet this device cannot sign with is unmet on the checklist, and the cost screen prepares nothing", () => {
  const desktop = { wallets: [], deeplink: false };
  const lines = (here, answer = readiness()) =>
    checklist(answer, {
      wordsSubject: WORDS.subject,
      network: "Preprod",
      here,
    });
  const walletOf = (here, answer) =>
    lines(here, answer).find((entry) => entry.id === "wallet");
  // a desktop without Eternl's extension (linked through the QR code from a phone)
  const away = walletOf(desktop);
  assert.equal(away.met, false);
  assert.equal(away.key, "MINT_CHECK_ELSEWHERE");
  assert.equal(away.text, "MINT_CHECK_ELSEWHERE_TEXT");
  assert.deepEqual(away.values, { wallet: "Eternl" });
  assert.equal(canContinue(lines(desktop)), false);
  // another wallet's extension does not sign for Eternl
  assert.equal(walletOf({ wallets: ["lace"], deeplink: false }).met, false);
  // Eternl's extension, a phone that opens wallet apps, or nothing known: met
  for (const here of [
    { wallets: ["eternl"], deeplink: false },
    { wallets: [], deeplink: true },
    null,
  ]) {
    assert.equal(walletOf(here).met, true, JSON.stringify(here));
    assert.equal(canContinue(lines(here)), true);
  }
  // a wallet of unknown name: any injected one may be it; none: the nameless text
  const nameless = readiness({ wallets: [wallet({ name: null })] });
  assert.equal(
    walletOf({ wallets: ["lace"], deeplink: false }, nameless).met,
    true
  );
  const unknown = walletOf(desktop, nameless);
  assert.equal(unknown.met, false);
  assert.equal(unknown.text, "MINT_CHECK_ELSEWHERE_TEXT_NAMELESS");
  assert.deepEqual(unknown.values, {});
  // several wallets: the line keeps its choice, so another one can be picked
  const two = readiness({ wallets: [wallet(), LACE] });
  const picking = checklist(two, {
    subject: LACE.subject,
    wordsSubject: WORDS.subject,
    here: { wallets: ["eternl"], deeplink: false },
  }).find((entry) => entry.id === "wallet");
  assert.equal(picking.met, false);
  assert.equal(picking.options.length, 2);
  // the flow reads it from its state: no Continue
  const blocked = run(
    start({ here: desktop }),
    { type: "readiness", itemId: ITEM.id, answer: readiness() },
    { type: "next", now: NOW }
  );
  assert.equal(blocked.step, "check");
  // the cost screen (the device changed since the checklist): the problem, and no Mint now
  const costs = { ...onCosts(), here: desktop };
  assert.deepEqual(elsewhere(costs), {
    key: "MINT_CHECK_ELSEWHERE_TEXT",
    values: { wallet: "Eternl" },
    action: null,
    ends: null,
    reconnect: false,
    detail: null,
  });
  for (const path of ["phone", "extension"]) {
    const asked = run(
      { ...costs, addresses: ["01aa"] },
      { type: "request", what: "mint", path }
    );
    assert.equal(asked.pending, null, path);
  }
  assert.equal(elsewhere(onCosts()), null);
  assert.equal(
    elsewhere({ ...onCosts(), here: { wallets: ["eternl"] } }),
    null
  );
});

test("D47-3: Check again reads anew what this device can sign with (an extension enabled meanwhile)", () => {
  const desktop = { wallets: [], deeplink: false };
  const away = run(start({ here: desktop }), {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(canContinue(checklistOf(away, NOW)), false);
  // the player enables Eternl's extension and taps Check again: the checklist asks anew with it
  const again = run(away, {
    type: "retry",
    here: { wallets: ["eternl"], deeplink: false },
  });
  assert.equal(again.step, "check");
  assert.equal(again.readiness, null);
  assert.deepEqual(again.here, { wallets: ["eternl"], deeplink: false });
  const answered = run(again, {
    type: "readiness",
    itemId: ITEM.id,
    answer: readiness(),
  });
  assert.equal(canContinue(checklistOf(answered, NOW)), true);
  // a retry that says nothing about the device keeps what was known
  assert.deepEqual(run(away, { type: "retry" }).here, desktop);
});

test("C-M11: the flow keeps no transaction of its own (the wallet signs what the server's sign info holds)", () => {
  assert.equal("prepared" in start(), false);
  assert.equal("prepared" in onWallet(), false);
});

test("D38: the wallet gives the fees and the reference token's deposit; the user token's deposit stays with the item in the wallet", () => {
  const deposits = { reference: 2267510, user: 1189279 };
  const costs = { ...COSTS, deposits };
  assert.equal(deposits.reference + deposits.user, COSTS.deposit);
  assert.deepEqual(walletChange(costs), {
    give: sumLovelace(
      COSTS.networkFee,
      COSTS.gameFee.amount,
      deposits.reference
    ),
    stays: "1189279",
  });
  // the flow's costs of such an operation: the rows unchanged, the give and the stay apart
  const state = run(
    onCosts(),
    { type: "request", what: "mint", path: "phone" },
    { type: "prepared", answer: prepared({ costs }) }
  );
  const shown = costsOf(state);
  assert.equal(shown.deposit, String(COSTS.deposit));
  assert.equal(
    shown.total,
    sumLovelace(COSTS.networkFee, COSTS.gameFee.amount, COSTS.deposit)
  );
  assert.equal(
    shown.give,
    sumLovelace(COSTS.networkFee, COSTS.gameFee.amount, deposits.reference)
  );
  assert.equal(shown.stays, "1189279");
  assert.deepEqual(
    costRows(shown).map((row) => [row.kind, row.amount]),
    [
      ["network", String(COSTS.networkFee)],
      ["game", String(COSTS.gameFee.amount)],
      ["deposit", String(COSTS.deposit)],
    ]
  );
  // a battlechoc fee in a token is not ADA given
  assert.deepEqual(
    walletChange({
      ...costs,
      gameFee: { asset: TOKEN_FEE.asset, label: "CHOC", amount: 100 },
    }),
    {
      give: sumLovelace(COSTS.networkFee, deposits.reference),
      stays: "1189279",
    }
  );
  // no fee; amounts as strings
  assert.deepEqual(
    walletChange({
      networkFee: "400000",
      gameFee: null,
      deposit: "3000000",
      deposits: { reference: "1800000", user: "1200000" },
    }),
    { give: "2200000", stays: "1200000" }
  );
  // without the parts, or with parts that do not add up: the whole deposit is given (the old text)
  for (const odd of [
    undefined,
    null,
    {},
    { reference: 1 },
    { reference: "x", user: 1 },
    { reference: -1, user: COSTS.deposit + 1 },
    { reference: 1, user: 1 },
  ]) {
    assert.deepEqual(
      walletChange({ ...COSTS, deposits: odd }),
      {
        give: sumLovelace(
          COSTS.networkFee,
          COSTS.gameFee.amount,
          COSTS.deposit
        ),
        stays: null,
      },
      JSON.stringify(odd)
    );
  }
});

test("C-I6: a dialog opened on a minting this tab cannot sign keeps saying so when it asks for the readiness", () => {
  const marked = {
    ...ITEM,
    minted: { state: "minting", operationId: "op-1", signing: true },
  };
  const opened = initialState({ item: marked, explained: true });
  assert.equal(opened.step, "wallet");
  assert.equal(opened.problem.key, "MINT_RESUME_LOST");
  // the dialog's first request: the readiness, which does not answer this problem
  const asking = run(opened, {
    type: "request",
    what: "readiness",
    itemId: ITEM.id,
  });
  assert.equal(asking.pending, "readiness");
  assert.equal(asking.problem.key, "MINT_RESUME_LOST");
  const answered = run(
    asking,
    { type: "readiness", itemId: ITEM.id, answer: readiness() },
    { type: "operation", operation: operation() }
  );
  assert.equal(answered.problem.key, "MINT_RESUME_LOST");
  assert.equal(answered.problem.action, "cancel");
  assert.equal(canCancel(answered), true);
  assert.equal(canSign(answered, NOW), false);
  // another request is a new attempt: what the last one said goes
  const costs = { ...onCosts(), problem: { key: "MINT_UNAVAILABLE" } };
  assert.equal(
    run(costs, { type: "request", what: "mint", path: "phone" }).problem,
    null
  );
});

test("a salvage that runs (kind burn) is another operation: one line, never this flow's steps, also for this item", () => {
  for (const itemId of ["item-9", ITEM.id]) {
    const burn = operation({
      id: "op-burn",
      kind: "burn",
      state: "submitted",
      itemId,
      item: { item: "LONG_EARS", serial: 4 },
    });
    // passed in when opening, or in the readiness: the flow stays on its checklist
    const opened = start({ operation: burn, signCode: "code-9" });
    assert.equal(opened.step, "check");
    assert.equal(opened.operation, null);
    const state = run(opened, {
      type: "readiness",
      itemId: ITEM.id,
      answer: readiness({ operation: burn }),
    });
    assert.equal(state.step, "check");
    assert.equal(state.operation, null);
    const line = checklistOf(state, NOW).find(
      (entry) => entry.id === "operation"
    );
    assert.deepEqual(line, {
      id: "operation",
      met: false,
      key: "MINT_CHECK_RUNNING_BURN",
      text: "MINT_CHECK_RUNNING_TEXT",
      values: { item: "LONG_EARS", serial: 4 },
      action: "goTo",
      operation: { id: "op-burn", itemId },
    });
    assert.equal(canContinue(checklistOf(state, NOW)), false);
    // a poll's answer about it changes nothing either
    assert.equal(run(state, { type: "operation", operation: burn }), state);
  }
});
