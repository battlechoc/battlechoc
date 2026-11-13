// The wallets the wallet door lists (node --test): on a phone only the wallets whose app opens
// the link page (CIP-158); elsewhere the registry's and whatever the browser injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  injectedWalletKeys,
  listedWallets,
  REGISTRY_WALLETS,
} from "../../src/cardano/walletList.js";

// the facts of the Cardano Foundation's registry (core 0.2.12) the door depends on: the core
// itself needs a browser window, so the test carries them
const REGISTRY = {
  eternl: { hasCIP158Support: true, playStoreUrl: "eternl" },
  vespr: { hasCIP158Support: true, playStoreUrl: "vespr" },
  begin: { hasCIP158Support: false, playStoreUrl: "begin" },
  yoroi: { hasCIP158Support: false, playStoreUrl: "yoroi" },
  flint: { mobileDeepLinkPrefix: "https://flint-wallet.app.link/browse" },
  lace: { chromeExtensionId: "lace" },
  nufi: { chromeExtensionId: "nufi" },
  typhoncip30: { chromeExtensionId: "typhon" },
  gerowallet: { chromeExtensionId: "gero" },
  nami: { chromeExtensionId: "nami" },
};
const configOf = (key) => REGISTRY[key];

test("on a phone the door lists only the wallets whose app opens the link page", () => {
  assert.deepEqual(listedWallets({ deeplink: true, configOf }), [
    "eternl",
    "vespr",
  ]);
});

test("on a phone a wallet the registry does not know is not listed", () => {
  assert.deepEqual(
    listedWallets({ deeplink: true, configOf: () => undefined }),
    []
  );
});

test("elsewhere the door lists the registry's wallets and the injected ones, each once", () => {
  assert.deepEqual(
    listedWallets({
      deeplink: false,
      injected: ["eternl", "brandnew"],
      configOf,
    }),
    [...REGISTRY_WALLETS, "brandnew"]
  );
});

test("the injected wallets are those with a CIP-30 enable()", () => {
  const enable = () => {};
  assert.deepEqual(
    injectedWalletKeys({
      eternl: { enable },
      vespr: { enable },
      broken: { enable: "no" },
      empty: null,
    }),
    ["eternl", "vespr"]
  );
  assert.deepEqual(injectedWalletKeys(undefined), []);
});
