// Which wallet the item card names for a minted item (node --test): the linked wallet that holds
// the player's minted items, by the account's identities; none when they do not tell
// (src/ui/mint/mintedWallet.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintedWalletName } from "../../src/ui/mint/mintedWallet.js";

const words = { subject: "stake:words", wallet: null, items: 0 };
const eternl = { subject: "stake:aa", wallet: "eternl", items: 2 };
const lace = { subject: "stake:bb", wallet: "lace", items: 0 };

test("the one linked wallet that holds minted items is named", () => {
  assert.equal(mintedWalletName([words, eternl, lace]), "Eternl");
  assert.equal(mintedWalletName([words, { ...lace, items: 1 }]), "Lace");
});

test("one wallet with a name and no counts from the server: that one", () => {
  assert.equal(
    mintedWalletName([
      { subject: "stake:words", wallet: null },
      { subject: "stake:aa", wallet: "typhoncip30" },
    ]),
    "Typhon"
  );
});

test("no name when the identities do not tell which wallet it is", () => {
  assert.equal(mintedWalletName(null), null);
  assert.equal(mintedWalletName([]), null);
  // two wallets hold minted items
  assert.equal(mintedWalletName([eternl, { ...lace, items: 3 }]), null);
  // the holder was linked before plan C: no stored name
  assert.equal(mintedWalletName([{ ...eternl, wallet: null }, lace]), null);
  // two named wallets, no counts
  assert.equal(
    mintedWalletName([
      { subject: "stake:aa", wallet: "eternl" },
      { subject: "stake:bb", wallet: "lace" },
    ]),
    null
  );
});
