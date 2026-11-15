// What the sign page tells the player when a signature does not get through (node --test): the
// cause in the player's words, named after the wallet, nothing for a "no" in the wallet, and the
// technical detail only for causes it cannot name (src/sign/messages.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { problemOf } from "../../src/sign/messages.js";
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

const context = { wallet: "Vespr", network: "Preprod", language: "en" };
const apiError = (code, status, details = {}) =>
  new ChainApiError(code, { status, details, response: { status } });
const at = (step, failure) => problemOf(failure, { step, ...context });

test("the wallet's own failures, table-driven, before and at the signature", () => {
  const table = [
    // a refusal while connecting is how a wallet without an account (or a locked one) answers
    [
      "enable",
      new WalletCancelledError({ code: -3 }),
      "MINT_NO_ACCOUNT",
      ["Vespr", "Preprod"],
    ],
    [
      "sign",
      new WalletNetworkError(0, 1),
      "MINT_WRONG_NETWORK",
      ["Vespr", "Preprod"],
    ],
    [
      "sign",
      new WalletNetworkError(0, 2),
      "MINT_WRONG_NETWORK",
      ["Vespr", "Preprod"],
    ],
    [
      "sign",
      new WalletOtherAccountError("stake:aa", "stake:bb"),
      "MINT_OTHER_WALLET",
      ["Vespr"],
    ],
    [
      "sign",
      new WalletAccountChangedError({ code: -4 }),
      "MINT_ACCOUNT_CHANGED",
      ["Vespr"],
    ],
    [
      "sign",
      new WalletCannotSignError({ code: 1 }),
      "MINT_WALLET_CANNOT_SIGN",
      ["Vespr"],
    ],
    ["sign", new WalletWithoutAddressError(), "MINT_NO_ADDRESS", ["Vespr"]],
    [
      "sign",
      new UnsupportedAddressError("e1", "script"),
      "MINT_ADDRESS_UNSUPPORTED",
      ["Vespr"],
    ],
  ];
  for (const [step, failure, key, values] of table) {
    assert.deepEqual(
      at(step, failure),
      { key, values, technical: false },
      failure.name
    );
  }
});

test("a 'no' in the wallet, to the proof or to the signature, says nothing: the buttons come back", () => {
  assert.equal(at("sign", new WalletCancelledError({ code: 2 })), null);
  assert.equal(at("sign", new WalletCancelledError({ code: 3 })), null);
  assert.equal(at("sign", new WalletCancelledError("user declined")), null);
});

test("the page is too old (an unknown code); an operation no longer waiting for a signature is not: the item tells", () => {
  for (const step of ["info", "sign", "submit"]) {
    assert.deepEqual(at(step, apiError("UNKNOWN SIGN CODE", 404)), {
      key: "MINT_SIGN_EXPIRED",
      values: [],
      technical: false,
    });
    // signed, cancelled or its time ran out: never "start again" (it may be going through)
    assert.deepEqual(at(step, apiError("OPERATION NOT OPEN", 409)), {
      key: "MINT_SIGN_NOT_OPEN",
      values: [],
      technical: false,
    });
  }
});

test("the server's refusals in the player's words; amounts as ADA", () => {
  assert.deepEqual(
    at(
      "sign",
      apiError("NOT ENOUGH ADA", 400, { needed: "7300000", missing: "2150001" })
    ),
    // the page's own text: "tap your wallet again", never a Check again it does not have
    {
      key: "MINT_SIGN_NOT_ENOUGH_ADA",
      values: ["7.3", "2.16"],
      technical: false,
    }
  );
  assert.deepEqual(at("sign", apiError("NO COLLATERAL", 400)), {
    key: "MINT_NO_COLLATERAL",
    values: ["Vespr", "5"],
    technical: false,
  });
  assert.deepEqual(at("sign", apiError("WALLET TOO FULL", 400)), {
    key: "MINT_WALLET_TOO_FULL",
    values: ["Vespr"],
    technical: false,
  });
  // "cancel it in battlechoc": the page has no Cancel
  assert.deepEqual(at("submit", apiError("INVALID WITNESS", 400)), {
    key: "MINT_SIGN_BAD_SIGNATURE",
    values: ["Vespr"],
    technical: false,
  });
  assert.equal(
    at("sign", apiError("WALLET WAITING", 409)).key,
    "MINT_CHECK_WAITING_TEXT"
  );
  assert.equal(
    at("sign", apiError("NOT YOUR WALLET", 403)).key,
    "MINT_NOT_YOUR_WALLET"
  );
  assert.equal(at("sign", apiError("CHAIN PAUSED", 503)).key, "MINT_PAUSED");
  // minting switched off on the server: said so, never a technical failure
  for (const step of ["info", "sign", "submit"]) {
    assert.deepEqual(at(step, apiError("CHAIN OFF", 404)), {
      key: "MINT_OFF",
      values: [],
      technical: false,
    });
    assert.deepEqual(at(step, apiError("CHAIN OFF", 503)), {
      key: "MINT_OFF",
      values: [],
      technical: false,
    });
  }
  // built without the wallet's addresses: only battlechoc can start it again
  assert.equal(
    at("submit", apiError("ADDRESSES NEEDED", 409)).key,
    "MINT_SIGN_START_AGAIN"
  );
});

test("no answer: before the signature nothing happened; after it, battlechoc checks where it stands", () => {
  for (const failure of [
    new ChainUnreachableError("network"),
    apiError("CHAIN UNAVAILABLE", 503),
    apiError("TOO MANY REQUESTS", 429),
  ]) {
    assert.deepEqual(at("info", failure), {
      key: "MINT_UNAVAILABLE",
      values: [],
      technical: false,
    });
    assert.equal(at("sign", failure).key, "MINT_UNAVAILABLE");
  }
  assert.equal(
    at("submit", new ChainUnreachableError("network")).key,
    "MINT_SIGNED_UNHEARD"
  );
  assert.equal(
    at("submit", apiError("INTERNAL SERVER ERROR", 500)).key,
    "MINT_SIGNED_UNHEARD"
  );
  // a limit came before anything was done
  assert.equal(
    at("submit", new ChainUnreachableError("busy", { status: 429 })).key,
    "MINT_UNAVAILABLE"
  );
});

test("anything else: it did not work, with the detail line", () => {
  for (const failure of [
    new WalletSignError({ code: -2 }, "code -2"),
    new TypeError("the transaction to sign is no CBOR hex"),
    apiError("SOMETHING NEW", 400),
    { code: -1, info: "internal" },
  ]) {
    assert.deepEqual(at("sign", failure), {
      key: "MINT_FAILED",
      values: [],
      technical: true,
    });
  }
  // an unknown failure while connecting points to the account, with the detail
  assert.deepEqual(at("enable", { code: -1, info: "internal" }), {
    key: "MINT_NO_ACCOUNT",
    values: ["Vespr", "Preprod"],
    technical: true,
  });
  // without the wallet's name, the sentence without it
  assert.deepEqual(
    problemOf(new WalletCancelledError({ code: -3 }), {
      step: "enable",
      ...context,
      wallet: null,
    }),
    { key: "MINT_NO_ACCOUNT_NAMELESS", values: ["Preprod"], technical: false }
  );
});

test("the address proof: battlechoc's fault, never the player's (an expiry beyond the window too); a proof the server refused", () => {
  assert.deepEqual(
    at("sign", new OwnerNotConfirmedError({ ownerConfirmed: false }, "tx")),
    { key: "MINT_OWNER_NOT_CONFIRMED", values: [], technical: true }
  );
  assert.deepEqual(at("sign", new UnexpectedProofTextError("digest")), {
    key: "MINT_PROOF_TEXT",
    values: [],
    technical: true,
  });
  assert.deepEqual(at("sign", new UnexpectedProofTextError("expires")), {
    key: "MINT_PROOF_TEXT",
    values: [],
    technical: true,
  });
  assert.deepEqual(at("sign", apiError("INVALID SIGNATURE", 400)), {
    key: "MINT_PROOF_REFUSED",
    values: [],
    technical: false,
  });
});

test("a refusal without its numbers never writes a missing amount", () => {
  for (const details of [{}, { needed: "7300000" }, { missing: "1" }]) {
    assert.deepEqual(at("sign", apiError("NOT ENOUGH ADA", 400, details)), {
      key: "MINT_SIGN_NOT_ENOUGH_ADA_PLAIN",
      values: [],
      technical: false,
    });
  }
});
