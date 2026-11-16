// The salvage of a minted item (plan E, node --test): which step the dialog shows, the holder's
// wallet, the two ways to sign, the burn's own refusals and the operation's end, and that every
// minting text it may show has its salvage variant.
import { test } from "node:test";
import assert from "node:assert/strict";
import shared from "@battlechoc/battlechoc-shared-functions";
import {
  ChainApiError,
  ChainUnreachableError,
} from "../../src/api/chainClient.js";
import { WalletCancelledError } from "../../src/cardano/wallet.js";
import { WalletOtherAccountError } from "../../src/cardano/signTx.js";
import {
  canCancel,
  canSign,
  noSigning,
  walletStepView,
} from "../../src/ui/mint/mintFlow.js";
import {
  canConfirm,
  elsewhere,
  holderOf,
  initialSalvage,
  pathOf,
  salvageFlow,
  salvagePollTarget,
  salvageProblemOf,
  salvageRequest,
  signedHere,
  signerOf,
  walletWords,
} from "../../src/ui/mint/salvageFlow.js";
import {
  SALVAGE_VARIANTS,
  salvageKey,
} from "../../src/ui/mint/salvageTexts.js";

const { chain, translationKeys } = shared;
const NOW = Date.parse("2026-11-16T10:00:00.000Z");
const ITEM = {
  id: "item-4",
  item: "TURBO_CONVEYOR",
  serial: 4,
  minted: { state: "minted", assetName: "000de140aa" },
};
const ETERNL = {
  provider: "cardano",
  subject: "stake:aa",
  address: "stake_test1uqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  wallet: "eternl",
  items: 1,
};
const LACE = {
  provider: "cardano",
  subject: "stake:bb",
  address: "stake_test1uqbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  wallet: "lace",
  items: 0,
};
const DESKTOP = { wallets: ["eternl"], deeplink: false };
const PHONE = { wallets: [], deeplink: true };
const COSTS = {
  networkFee: 368106,
  gameFee: null,
  deposit: 3710910,
  deposits: { reference: 2448080, user: 1262830 },
};
const burn = (over = {}) => ({
  id: "op-7",
  kind: "burn",
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
  ownerConfirmed: true,
  ...over,
});
const PREPARED = {
  operation: burn(),
  tx: "84ab",
  signCode: "code-7",
  costs: COSTS,
  returns: { GOLDLEAF: 1, VANILLA: 2, MILK: 2 },
};
const apiError = (code, status, details = {}) =>
  new ChainApiError(code, { status, details });

const start = (over = {}) =>
  initialSalvage({
    item: ITEM,
    identities: [ETERNL, LACE],
    network: "Preprod",
    here: DESKTOP,
    ...over,
  });
const run = (state, ...events) => events.reduce(salvageFlow, state);

// the extension path up to the wallet step: the addresses, the burn, its 201
const atWallet = (over = {}) =>
  run(
    start(over),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01aa"], subject: "stake:aa" },
    { type: "request", what: "burn", path: "extension" },
    { type: "prepared", answer: PREPARED }
  );

test("the wallet that holds the item: the only key holding minted items, or the only key; none when they do not tell", () => {
  assert.equal(holderOf([ETERNL, LACE]).subject, "stake:aa");
  assert.deepEqual(holderOf([ETERNL, LACE]), {
    subject: "stake:aa",
    address: ETERNL.address,
    key: "eternl",
    name: "Eternl",
  });
  assert.equal(holderOf([{ ...ETERNL, items: undefined }]).subject, "stake:aa");
  assert.equal(holderOf([ETERNL, { ...LACE, items: 2 }]), null);
  assert.equal(holderOf([]), null);
  assert.equal(holderOf(null), null);
});

test("how this device signs: the holder's extension, a phone's wallet app, or nowhere here", () => {
  assert.deepEqual(pathOf(start()), { path: "extension", wallet: "eternl" });
  assert.deepEqual(pathOf(start({ here: PHONE })), { path: "phone" });
  // a desktop without the holder's extension: salvage where the wallet is
  const away = start({ here: { wallets: ["lace"], deeplink: false } });
  assert.deepEqual(pathOf(away), { path: null });
  assert.deepEqual(elsewhere(away), {
    key: "MINT_CHECK_ELSEWHERE_TEXT",
    values: { wallet: "Eternl" },
    action: "recheck",
    ends: null,
    reconnect: false,
    detail: null,
  });
  assert.equal(salvageKey(elsewhere(away).key), "SALVAGE_ELSEWHERE_TEXT");
  assert.equal(canConfirm(away), false);
  assert.equal(run(away, { type: "request", what: "addresses" }), away);
  // Check again reads what this browser has anew: the holder's extension enabled since the
  // dialog opened is found without reopening it
  const found = run(away, { type: "retry", here: DESKTOP });
  assert.equal(found.step, "confirm");
  assert.equal(elsewhere(found), null);
  assert.equal(canConfirm(found), true);
  assert.deepEqual(pathOf(found), { path: "extension", wallet: "eternl" });
  // nothing new: still elsewhere, still Check again
  assert.equal(
    elsewhere(
      run(away, { type: "retry", here: { wallets: [], deeplink: false } })
    ).action,
    "recheck"
  );
  // no holder named: the nameless text, Check again too
  const nameless = start({
    identities: [ETERNL, { ...LACE, items: 3 }],
    here: { wallets: [], deeplink: false },
  });
  assert.equal(elsewhere(nameless).key, "MINT_CHECK_ELSEWHERE_TEXT_NAMELESS");
  assert.equal(elsewhere(nameless).action, "recheck");
  // the keys do not tell: any injected wallet may be it
  const unknown = start({ identities: [ETERNL, { ...LACE, items: 3 }] });
  assert.deepEqual(pathOf(unknown), { path: "extension", wallet: "eternl" });
  assert.equal(signerOf(start()).name, "Eternl");
});

test("the item's mark gives the first step: a salvage waiting for the signature, one being salvaged, else the confirmation", () => {
  assert.equal(start().step, "confirm");
  const waiting = {
    ...ITEM,
    minted: {
      ...ITEM.minted,
      operationId: "op-7",
      signing: true,
      kind: "burn",
    },
  };
  const resumed = start({ item: waiting, signCode: "code-7" });
  assert.equal(resumed.step, "wallet");
  assert.equal(resumed.operationId, "op-7");
  assert.equal(resumed.problem, null);
  assert.equal(salvagePollTarget(resumed), "op-7");
  // from the mark alone nothing of the build is known: the wallet step says neither "asks twice"
  // nor "the amounts can differ" until the first poll brings the operation
  assert.equal(resumed.operation, null);
  assert.equal(walletWords(resumed), "loading");
  assert.equal(
    walletWords(run(resumed, { type: "operation", operation: burn() })),
    "confirmed"
  );
  assert.equal(
    walletWords(
      run(resumed, {
        type: "operation",
        operation: burn({ ownerConfirmed: false }),
      })
    ),
    "unconfirmed"
  );
  assert.equal(walletWords(atWallet()), "confirmed");
  // another tab's: this tab cannot sign it, and says so with Cancel
  const lost = start({ item: waiting });
  assert.equal(lost.problem.key, "MINT_RESUME_LOST");
  assert.equal(salvageKey(lost.problem.key), "SALVAGE_RESUME_LOST");
  const burning = start({
    item: { ...ITEM, minted: { state: "burning", operationId: "op-7" } },
  });
  assert.equal(burning.step, "running");
  assert.equal(salvagePollTarget(burning), "op-7");
  // seen on the chain without an operation of the game: nothing to poll
  const outside = start({ item: { ...ITEM, minted: { state: "burning" } } });
  assert.equal(outside.step, "running");
  assert.equal(salvagePollTarget(outside), null);
  // a mint of the item (any other kind) is not this flow's
  assert.equal(
    start({ operation: burn({ kind: "mint", state: "submitted" }) }).step,
    "confirm"
  );
});

test("the extension path: the wallet's addresses first, then the burn for that wallet; the 201 is the wallet step", () => {
  let state = run(start(), { type: "request", what: "addresses" });
  assert.equal(state.pending, "addresses");
  // the burn waits for the addresses
  assert.equal(
    run(state, { type: "request", what: "burn", path: "extension" }),
    state
  );
  state = run(state, {
    type: "addresses",
    addresses: ["01aa"],
    subject: "stake:aa",
  });
  assert.deepEqual(salvageRequest(state), {
    itemId: ITEM.id,
    subject: "stake:aa",
    addresses: ["01aa"],
  });
  // the phone's way is not this device's
  assert.equal(
    run(state, { type: "request", what: "burn", path: "phone" }),
    state
  );
  state = run(state, { type: "request", what: "burn", path: "extension" });
  assert.equal(state.pending, "burn");
  // nothing is tapped while it is out
  assert.equal(run(state, { type: "retry" }), state);
  state = run(state, { type: "prepared", answer: PREPARED });
  assert.equal(state.step, "wallet");
  assert.equal(state.signCode, "code-7");
  assert.equal(canSign(state, NOW), true);
  assert.deepEqual(walletStepView(state), { prompts: true, back: true });
  assert.equal(salvagePollTarget(state), "op-7");
});

test("another wallet than the holder in the extension: nothing is prepared, the holder's address is named", () => {
  const state = run(
    start(),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01bb"], subject: "stake:bb" }
  );
  assert.equal(state.step, "confirm");
  assert.equal(state.pending, null);
  assert.equal(state.problem.key, "SALVAGE_WRONG_WALLET");
  assert.deepEqual(state.problem.values, { address: ETERNL.address });
  // as the mint's MINT_OTHER_WALLET: the wallet's api is asked for anew (another account chosen
  // in the same extension is then the one read)
  assert.equal(state.problem.reconnect, true);
  assert.equal(salvageRequest(state), null);
  assert.equal(
    run(state, { type: "request", what: "burn", path: "extension" }),
    state
  );
  // the server's answer for the same: its holder, named by the player's own keys
  const unknown = run(
    start({ identities: [ETERNL, { ...LACE, items: 2 }] }),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01bb"], subject: "stake:bb" },
    { type: "request", what: "burn", path: "extension" },
    {
      type: "problem",
      during: "burn",
      failure: apiError("NOT YOUR WALLET", 400, { holder: "stake:aa" }),
    }
  );
  assert.equal(unknown.problem.key, "SALVAGE_WRONG_WALLET");
  assert.deepEqual(unknown.problem.values, { address: ETERNL.address });
  assert.equal(unknown.problem.reconnect, true);
  assert.equal(unknown.pending, null);
  // the wallet asked to sign is on another account than the holder's
  const atSign = run(atWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const other = run(atSign, {
    type: "problem",
    during: "sign",
    operationId: "op-7",
    failure: new WalletOtherAccountError("stake:aa", "stake:bb"),
  });
  assert.equal(other.step, "wallet");
  assert.equal(other.problem.key, "SALVAGE_WRONG_WALLET");
  assert.equal(other.problem.reconnect, true);
  // a holder the player's keys do not name: the nameless text, reconnecting as well
  const nameless = salvageProblemOf(
    new WalletOtherAccountError("stake:cc", "stake:bb"),
    {},
    start()
  );
  assert.equal(nameless.key, "SALVAGE_WRONG_WALLET_NAMELESS");
  assert.equal(nameless.reconnect, true);
});

test("the phone path asks for the holder's wallet; when the keys guessed wrong, once more for the one the server names", () => {
  const phone = start({
    here: PHONE,
    identities: [
      { ...LACE, items: 1 },
      { ...ETERNL, items: 1 },
    ],
  });
  let state = run(phone, { type: "request", what: "burn", path: "phone" });
  assert.deepEqual(salvageRequest(state), {
    itemId: ITEM.id,
    subject: "stake:bb",
  });
  state = run(state, {
    type: "problem",
    during: "burn",
    failure: apiError("NOT YOUR WALLET", 400, { holder: "stake:aa" }),
  });
  assert.equal(state.pending, "burn");
  assert.equal(state.problem, null);
  assert.deepEqual(salvageRequest(state), {
    itemId: ITEM.id,
    subject: "stake:aa",
  });
  // only once: a second refusal is shown
  const again = run(state, {
    type: "problem",
    during: "burn",
    failure: apiError("NOT YOUR WALLET", 400, { holder: "stake:bb" }),
  });
  assert.equal(again.pending, null);
  assert.equal(again.problem.key, "SALVAGE_WRONG_WALLET");
  state = run(state, {
    type: "prepared",
    answer: {
      ...PREPARED,
      operation: burn({ ownerConfirmed: false }),
    },
  });
  assert.equal(state.step, "wallet");
});

test("signed: being salvaged until it is final, through a rollback; Keep playing closes nothing", () => {
  let state = run(atWallet(), { type: "signing", via: "extension", now: NOW });
  assert.equal(state.step, "sign");
  state = run(state, {
    type: "signed",
    answer: { state: "submitted", operation: burn({ state: "submitted" }) },
  });
  assert.equal(state.step, "running");
  assert.equal(state.signCode, null);
  state = run(state, {
    type: "operation",
    operation: burn({ state: "included" }),
  });
  assert.equal(state.step, "running");
  // a rollback: in the mempool again, still being salvaged
  state = run(state, {
    type: "operation",
    operation: burn({ state: "submitted" }),
  });
  assert.equal(state.step, "running");
  state = run(state, {
    type: "operation",
    operation: burn({ state: "final" }),
  });
  assert.equal(state.step, "running");
  assert.equal(salvagePollTarget(state), null);
  // a late answer of before changes nothing
  assert.equal(
    run(state, { type: "operation", operation: burn({ state: "submitted" }) }),
    state
  );
});

test("a no in the wallet: nothing happened, the burn still prepared; Try again goes back to the wallet step", () => {
  const signing = run(atWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const no = run(signing, {
    type: "problem",
    during: "sign",
    operationId: "op-7",
    failure: new WalletCancelledError({ code: 2, info: "user declined" }),
  });
  assert.equal(no.step, "nothing");
  assert.equal(no.problem.key, "MINT_CANCELLED");
  // its text says nothing of minting: shown as it is
  assert.equal(salvageKey(no.problem.key), "MINT_CANCELLED");
  const again = run(no, { type: "retry" });
  assert.equal(again.step, "wallet");
  assert.equal(canSign(again, NOW), true);
});

test("Back on the wallet step cancels the prepared burn; the confirmation once the cancel is confirmed", () => {
  let state = run(atWallet(), { type: "back" });
  assert.equal(state.pending, "cancel");
  assert.equal(canCancel(state), false);
  state = run(state, {
    type: "operation",
    operation: burn({ state: "cancelled", error: "cancelled" }),
  });
  assert.equal(state.step, "confirm");
  assert.equal(state.operation, null);
  assert.equal(state.subject, null);
  assert.equal(canConfirm(state), true);
});

test("the burn's refusals: what is missing, the item gone from the wallet, moved within it, busy, not minted", () => {
  const atBurn = run(
    start(),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01aa"], subject: "stake:aa" },
    { type: "request", what: "burn", path: "extension" }
  );
  const refused = (failure, during = "burn", state = atBurn) =>
    run(state, { type: "problem", during, failure, operationId: undefined });
  const poor = refused(
    apiError("NOT ENOUGH ADA", 400, { missing: "120000", needed: "2120000" })
  );
  assert.equal(poor.step, "confirm");
  assert.equal(poor.problem.key, "SALVAGE_NOT_ENOUGH_ADA");
  assert.deepEqual(poor.problem.values, { missingAda: "120000" });
  assert.equal(canConfirm(poor), true);
  assert.equal(
    refused(apiError("NOT ENOUGH ADA", 400)).problem.key,
    "SALVAGE_NOT_ENOUGH_ADA_PLAIN"
  );
  const left = refused(apiError("ITEM LEFT WALLET", 409));
  assert.equal(left.step, "failed");
  assert.equal(left.problem.key, "SALVAGE_LEFT_WALLET");
  assert.equal(refused(apiError("ITEM BUSY", 409)).problem.key, "MINT_BUSY");
  // one text for both flows: "Another minting or salvage of yours is still running"
  assert.equal(salvageKey("MINT_BUSY"), "MINT_BUSY");
  assert.equal(
    refused(apiError("OPERATION RUNNING", 409)).problem.key,
    "MINT_BUSY"
  );
  assert.equal(
    refused(apiError("NOT MINTED", 409)).problem.key,
    "SALVAGE_NOT_MINTED"
  );
  assert.equal(
    refused(apiError("NOT YOUR ITEM", 400)).problem.key,
    "SALVAGE_GONE"
  );
  // no answer to the prepare: it may lock the item, the card shows it (never "nothing happened")
  const lost = refused(new ChainUnreachableError("network"));
  assert.equal(lost.step, "failed");
  assert.equal(salvageKey(lost.problem.key), "SALVAGE_ANSWER_LOST");
  // at the signature: the token left the wallet, or moved within it (the operation was cancelled)
  const signing = run(atWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const gone = run(signing, {
    type: "problem",
    during: "submit",
    operationId: "op-7",
    failure: apiError("ITEM LEFT WALLET", 409),
  });
  assert.equal(gone.step, "failed");
  assert.equal(gone.problem.key, "SALVAGE_LEFT_WALLET");
  // the server cancelled it there: nothing offers a cancel, nothing is polled
  assert.equal(gone.operation.state, "cancelled");
  assert.equal(canCancel(gone), false);
  assert.equal(salvagePollTarget(gone), null);
  // its poll then answers cancelled: the text stays
  assert.equal(
    run(gone, {
      type: "operation",
      operation: burn({ state: "cancelled", error: "token-moved" }),
    }).problem.key,
    "SALVAGE_LEFT_WALLET"
  );
  const moved = run(signing, {
    type: "problem",
    during: "submit",
    operationId: "op-7",
    failure: apiError("ITEM MOVED", 409),
  });
  assert.equal(moved.step, "failed");
  assert.equal(moved.problem.key, "SALVAGE_TOKEN_MOVED");
  assert.equal(moved.problem.action, "retry");
  // at the sign page's rebuild: nothing changed, the burn stays prepared (try again, or cancel)
  const elsewhereNow = run(signing, {
    type: "problem",
    during: "sign",
    operationId: "op-7",
    failure: apiError("ITEM MOVED", 409),
  });
  assert.equal(elsewhereNow.step, "wallet");
  assert.equal(elsewhereNow.problem.key, "SALVAGE_ITEM_ELSEWHERE");
  assert.equal(canCancel(elsewhereNow), true);
  // at the prepare (ruling E21): the wallet holds the item at an address battlechoc cannot use;
  // nothing was prepared, so nothing "moved after the salvage was prepared"
  const atPrepare = run(
    start(),
    { type: "request", what: "addresses" },
    { type: "addresses", addresses: ["01aa"], subject: "stake:aa" },
    { type: "request", what: "burn", path: "extension" },
    { type: "problem", during: "burn", failure: apiError("ITEM MOVED", 409) }
  );
  assert.equal(atPrepare.step, "confirm");
  assert.equal(atPrepare.pending, null);
  assert.equal(atPrepare.problem.key, "SALVAGE_ITEM_MOVED_PREPARE");
  assert.equal(salvageKey(atPrepare.problem.key), "SALVAGE_ITEM_MOVED_PREPARE");
  assert.ok(translationKeys.SALVAGE_ITEM_MOVED_PREPARE);
  assert.equal(
    salvageProblemOf(apiError("ITEM MOVED", 409), { during: "burn" }).key,
    "SALVAGE_ITEM_MOVED_PREPARE"
  );
  assert.equal(
    salvageProblemOf(apiError("ITEM MOVED", 409), { during: "submit" }).key,
    "SALVAGE_TOKEN_MOVED"
  );
});

test("the answer after the signature is lost: no second signature, the poll tells", () => {
  const signing = run(atWallet(), {
    type: "signing",
    via: "extension",
    now: NOW,
  });
  const unheard = run(signing, {
    type: "problem",
    during: "submit",
    operationId: "op-7",
    failure: new ChainUnreachableError("network"),
  });
  assert.equal(unheard.step, "wallet");
  assert.equal(unheard.problem.key, "MINT_SIGNED_UNHEARD");
  assert.equal(salvageKey(unheard.problem.key), "SALVAGE_SIGNED_UNHEARD");
  assert.equal(noSigning(unheard), true);
  assert.equal(canSign(unheard, NOW), false);
  assert.equal(canCancel(unheard), false);
  assert.equal(salvagePollTarget(unheard), "op-7");
  const landed = run(unheard, {
    type: "operation",
    operation: burn({ state: "submitted" }),
  });
  assert.equal(landed.step, "running");
  assert.equal(landed.problem, null);
});

test("the operation's end words itself: cancelled, the token moved, the wallet unlinked, salvaged outside the game", () => {
  const ended = (error, state = "cancelled") =>
    run(atWallet(), {
      type: "operation",
      operation: burn({ state, error }),
    });
  assert.equal(ended("cancelled").step, "nothing");
  assert.equal(
    salvageKey(ended("cancelled").problem.key),
    "SALVAGE_WAS_CANCELLED"
  );
  assert.equal(ended("token-moved").step, "failed");
  assert.equal(ended("token-moved").problem.key, "SALVAGE_TOKEN_MOVED");
  assert.equal(ended("wallet-unlinked").problem.key, "SALVAGE_WALLET_UNLINKED");
  assert.equal(
    salvageKey(ended("not-signed", "expired").problem.key),
    "MINT_TIME_UP"
  );
  assert.equal(
    salvageKey(ended("expired", "expired").problem.key),
    "SALVAGE_EXPIRED"
  );
  assert.equal(
    salvageKey(ended("rejected", "expired").problem.key),
    "SALVAGE_NOT_TAKEN"
  );
  // the holder burned it outside the game: its ingredients come as for any salvage
  const outside = ended("burned-elsewhere", "expired");
  assert.equal(outside.step, "running");
  assert.equal(outside.problem.key, "SALVAGE_BURNED_ELSEWHERE");
  // the burn signed here did not go through: "signed, the deposit comes back with it" is not shown
  assert.equal(signedHere(outside), false);
  assert.equal(
    signedHere(
      run(atWallet(), {
        type: "operation",
        operation: burn({ state: "submitted" }),
      })
    ),
    true
  );
  // Try again after an end: the confirmation, anew
  const again = run(ended("token-moved"), { type: "retry" });
  assert.equal(again.step, "confirm");
  assert.equal(again.operation, null);
  assert.equal(again.addresses, null);
});

test("every minting text the salvage may show has its salvage variant in the translations, and the salvage's own keys exist", () => {
  for (const [mint, salvage] of Object.entries(SALVAGE_VARIANTS)) {
    assert.ok(translationKeys[mint], mint);
    assert.ok(translationKeys[salvage], salvage);
  }
  const own = [
    "SALVAGE_WRONG_WALLET",
    "SALVAGE_WRONG_WALLET_NAMELESS",
    "SALVAGE_TOKEN_MOVED",
    "SALVAGE_WALLET_UNLINKED",
    "SALVAGE_BURNED_ELSEWHERE",
    "SALVAGE_NOT_ENOUGH_ADA",
    "SALVAGE_NOT_ENOUGH_ADA_PLAIN",
    "SALVAGE_LEFT_WALLET",
    "SALVAGE_ITEM_ELSEWHERE",
    "SALVAGE_NOT_MINTED",
  ];
  for (const key of own) {
    assert.ok(translationKeys[key], key);
  }
  // no minting sentence among what salvageProblemOf gives for the burn's codes
  for (const code of Object.keys({
    "NOT ENOUGH ADA": 1,
    "ITEM LEFT WALLET": 1,
    "NO COLLATERAL": 1,
    "WALLET TOO FULL": 1,
    "CHAIN UNAVAILABLE": 1,
    "CHAIN OFF": 1,
    "INVALID WITNESS": 1,
    "OPERATION NOT OPEN": 1,
  })) {
    const shown = salvageKey(
      salvageProblemOf(apiError(code, 400), { during: "burn" }).key
    );
    assert.ok(translationKeys[shown], `${code}: ${shown}`);
    assert.doesNotMatch(
      shared.translate(translationKeys[shown]),
      /\bmint(ing)?\b/i,
      `${code}: ${shown}`
    );
  }
});

test("Try again reads anew what the device can sign with: a wallet enabled since the dialog opened is used", () => {
  const away = start({ here: { wallets: [], deeplink: false } });
  assert.equal(canConfirm(away), false);
  const failed = run(
    away,
    { type: "request", what: "addresses" },
    {
      type: "problem",
      during: "connect",
      failure: new Error("no wallet"),
    }
  );
  const again = run(failed, { type: "retry", here: DESKTOP });
  assert.deepEqual(again.here, DESKTOP);
  assert.equal(canConfirm(again), true);
  assert.deepEqual(pathOf(again), { path: "extension", wallet: "eternl" });
  // also on the confirmation with no problem shown
  assert.equal(canConfirm(run(away, { type: "retry", here: DESKTOP })), true);
  // without `here`, the known one stays
  assert.deepEqual(run(away, { type: "retry" }).here, away.here);
});

test("the holder the server named stays known: after Back and Yes again the phone path asks for it at once", () => {
  const phone = start({
    here: PHONE,
    identities: [
      { ...LACE, items: 1 },
      { ...ETERNL, items: 1 },
    ],
  });
  let state = run(
    phone,
    { type: "request", what: "burn", path: "phone" },
    {
      type: "problem",
      during: "burn",
      failure: apiError("NOT YOUR WALLET", 400, { holder: "stake:aa" }),
    },
    {
      type: "prepared",
      answer: { ...PREPARED, operation: burn({ ownerConfirmed: false }) },
    },
    { type: "back" },
    {
      type: "operation",
      operation: burn({ state: "cancelled", error: "cancelled" }),
    }
  );
  assert.equal(state.step, "confirm");
  state = run(state, { type: "request", what: "burn", path: "phone" });
  assert.deepEqual(salvageRequest(state), {
    itemId: ITEM.id,
    subject: "stake:aa",
  });
  // and the confirmation names it
  assert.equal(signerOf(state).name, "Eternl");
});

test("the phone path without the account's keys (their read failed): says so (not the network), no Yes; Try again reads them again", () => {
  const unknown = start({ here: PHONE, identities: null });
  assert.equal(canConfirm(unknown), false);
  assert.equal(elsewhere(unknown).key, "SALVAGE_KEYS_UNREAD");
  assert.equal(elsewhere(unknown).action, "reread");
  assert.ok(translationKeys.SALVAGE_KEYS_UNREAD);
  assert.equal(
    run(unknown, { type: "request", what: "burn", path: "phone" }),
    unknown
  );
  // read again and failed again: the same
  const failedAgain = run(unknown, { type: "identities", identities: null });
  assert.equal(elsewhere(failedAgain).key, "SALVAGE_KEYS_UNREAD");
  // read: the holder's wallet is asked for, Yes is open
  const read = run(unknown, {
    type: "identities",
    identities: [ETERNL, LACE],
  });
  assert.equal(elsewhere(read), null);
  assert.equal(canConfirm(read), true);
  assert.equal(signerOf(read).name, "Eternl");
  assert.deepEqual(
    salvageRequest(run(read, { type: "request", what: "burn", path: "phone" })),
    { itemId: ITEM.id, subject: "stake:aa" }
  );
  // the keys answer only the confirmation: anywhere else they change nothing
  const atWalletStep = atWallet();
  assert.equal(
    run(atWalletStep, { type: "identities", identities: [LACE] }),
    atWalletStep
  );
});

test("the prepare's answer keeps no `returns` the dialog never shows", () => {
  const state = atWallet();
  assert.equal(Object.prototype.hasOwnProperty.call(state, "returns"), false);
});

test("a wallet in its wait and another account in the wallet have the salvage's own words", () => {
  assert.equal(salvageKey("MINT_CHECK_WAITING_TEXT"), "SALVAGE_WALLET_WAITING");
  assert.equal(salvageKey("MINT_OTHER_WALLET"), "SALVAGE_OTHER_WALLET");
  const waiting = salvageProblemOf(apiError("WALLET WAITING", 409), {
    during: "burn",
  });
  assert.equal(salvageKey(waiting.key), "SALVAGE_WALLET_WAITING");
});
