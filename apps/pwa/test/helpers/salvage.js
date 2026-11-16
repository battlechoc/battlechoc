import { expect } from "@playwright/test";
import { createRequire } from "node:module";
import { ANDROID_PHONE, api } from "./players.js";
import { fakeWallet } from "./wallet.js";
import { chainHolders, mintingPlayer, mintThroughApi } from "./chain.js";
import { keep, shotsOf } from "./mint.js";
import { statsOf } from "./lab.js";

// The salvage of a minted item in the browser (plan E, Task 5): a player with a minted item on
// the chain double, the salvage's dialog and its screenshots (MINT_SHOTS_DIR, e-<nn>-<name>-<kind>).

const require = createRequire(import.meta.url);
const { TEST_POLICY_ID } = require("../../../api/test/chainDouble.js");

// every screen in the order a player meets it
const FLOW = [
  "card-minted",
  "confirm",
  "wallet",
  "sign",
  "running",
  "card-burning",
  "arrived",
  "phone-confirm",
  "phone-wallet",
  "phone-sign",
  "sign-page-before",
  "sign-page-done",
  "phone-running",
  "nothing",
  "card-salvage-waiting",
  "left-wallet",
  "answer-lost",
  "rolled-back",
  "wrong-wallet",
  "not-enough-ada",
  "android-app",
  "chain-off",
  "fr-confirm",
  "fr-wallet",
  "burned-elsewhere",
  "outside-burn-card",
  "outside-burn-arrived",
  "lab-burning",
  "sign-page-no-kind",
  "check-again",
  "item-moved-prepare",
];

/** The salvage's screenshots (helpers/mint.js shot, its own flow and prefix "e"). */
export const shot = shotsOf("e", FLOW);

/** The salvage's dialog. */
export const salvageDialog = (page) => page.getByTestId("salvage-minted");

/** Waits until the salvage's dialog shows `step` (its data-step). */
export const atSalvageStep = (page, step, timeout = 15000) =>
  expect(salvageDialog(page)).toHaveAttribute("data-step", step, { timeout });

/** The units of a minted item's two tokens on the double: { user, reference }. */
export const unitsOf = (assetName) => ({
  user: `${TEST_POLICY_ID}${assetName}`,
  reference: `${TEST_POLICY_ID}000643b0${assetName.slice(8)}`,
});

/** Who holds each of the item's two tokens: { user, reference } (holder lists, [] for nobody). */
export const tokensOf = async (request, assetName) => {
  const units = unitsOf(assetName);
  return {
    user: await chainHolders(request, units.user),
    reference: await chainHolders(request, units.reference),
  };
};

/** The player's pantry (GET /user). */
export const pantryOf = async (request, player) =>
  (await statsOf(request, player)).pantry || {};

/**
 * A player with a minted item to salvage: mintingPlayer's (`options` as there; the turbo
 * conveyor, whose recipe has a legendary, a rare and a common ingredient, unless `item` says
 * otherwise), its item minted to final through the API (mintThroughApi), and the page loaded
 * anew (the stats mark the item minted). With `wallet: false` (a phone whose wallet is an app)
 * the mint is signed in a context of its own with the player's keys (`walletContext`, also
 * returned: the wallet app's browser, with its page `walletPage` and its fakeWallet `appWallet`),
 * else in the player's page. `{ …player, assetName, mint (the mint's operation), … }`; the contexts close after the test (keep).
 */
export const mintedPlayer = async (browser, request, name, options = {}) => {
  const phone = options.wallet === false;
  const player = await mintingPlayer(browser, request, name, {
    item: "TURBO_CONVEYOR",
    ...options,
  });
  keep(player.context);
  let signer = player.page;
  let walletContext = null;
  let appWallet = null;
  if (phone) {
    walletContext = keep(
      await browser.newContext({
        ...ANDROID_PHONE,
        locale: options.language === "de" ? "de-DE" : "en-US",
      })
    );
    // the wallet app's browser reaches the browser tests' API, as the sign page does there
    await walletContext.addInitScript(
      (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
      api
    );
    appWallet = await fakeWallet(walletContext, player.keys);
    signer = await walletContext.newPage();
    await signer.goto("/", { waitUntil: "domcontentloaded" });
  }
  const mint = await mintThroughApi(signer, request, player, player.item, {
    final: true,
  });
  await player.page.goto("/", { waitUntil: "networkidle" });
  return {
    ...player,
    assetName: mint.assetName,
    mint,
    walletContext,
    walletPage: phone ? signer : null,
    appWallet,
  };
};
