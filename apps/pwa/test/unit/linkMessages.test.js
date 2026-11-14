// What the link page tells the player when a wallet does not get through (node --test): the
// cause in the player's words, named after the wallet, and the technical detail only for causes
// it cannot name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { problemOf } from "../../src/link/messages.js";
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../../src/cardano/wallet.js";

const context = { wallet: "Vespr", network: "Preprod" };
const answered = (status, error) =>
  Object.assign(new Error("Request failed"), {
    response: { status, data: { error } },
  });

test("a wallet on mainnet: switch that wallet to Preprod", () => {
  assert.deepEqual(
    problemOf(new WalletNetworkError(0, 1), {
      step: "getNetworkId ok",
      ...context,
    }),
    {
      key: "LINK_WALLET_ON_MAINNET",
      values: ["Vespr", "Preprod"],
      technical: false,
    }
  );
});

test("a wallet on another test network: switch it too", () => {
  assert.equal(
    problemOf(new WalletNetworkError(0, 2), {
      step: "getNetworkId ok",
      ...context,
    }).key,
    "LINK_WALLET_OTHER_NETWORK"
  );
});

test("a wallet that refuses to connect has no account set up (or is locked)", () => {
  const refused = new WalletCancelledError({ code: -3, info: "refused" });
  assert.deepEqual(problemOf(refused, { step: "enable", ...context }), {
    key: "LINK_NO_ACCOUNT",
    values: ["Vespr", "Preprod"],
    technical: false,
  });
});

test("a wallet without an address has no account set up", () => {
  assert.equal(
    problemOf(new WalletWithoutAddressError(), {
      step: "getChangeAddress ok",
      ...context,
    }).key,
    "LINK_NO_ACCOUNT"
  );
});

test("an unknown failure while connecting points to the account and keeps the detail", () => {
  assert.deepEqual(
    problemOf({ code: -1, info: "internal" }, { step: "enable", ...context }),
    { key: "LINK_NO_ACCOUNT", values: ["Vespr", "Preprod"], technical: true }
  );
});

test("declining to sign says nothing: the player chose so", () => {
  const declined = new WalletCancelledError({ code: 3, info: "declined" });
  assert.equal(problemOf(declined, { step: "signData", ...context }), null);
});

test("the server's answers keep their own texts", () => {
  assert.deepEqual(
    problemOf(answered(404, "UNKNOWN LINK CODE"), {
      step: "challengeForCode",
      ...context,
    }),
    { key: "LINK_EXPIRED", values: [], technical: false }
  );
  assert.equal(
    problemOf(answered(400, "CHALLENGE EXPIRED"), {
      step: "verifyForCode",
      ...context,
    }).key,
    "LINK_EXPIRED"
  );
  assert.equal(
    problemOf(answered(409, "IDENTITY TAKEN"), {
      step: "verifyForCode",
      ...context,
    }).key,
    "WALLET_TAKEN"
  );
});

test("anything else: the general text with the detail", () => {
  assert.deepEqual(
    problemOf(answered(400, "INVALID SIGNATURE"), {
      step: "verifyForCode",
      ...context,
    }),
    { key: "WALLET_FAILED", values: [], technical: true }
  );
});
