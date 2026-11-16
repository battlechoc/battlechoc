import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { ANDROID_PHONE, api } from "./helpers/players.js";
import { craftItem } from "./helpers/lab.js";
import {
  fakeWallet,
  walletAddressesOf,
  walletSignTx,
} from "./helpers/wallet.js";
import {
  chainBlocks,
  chainConfig,
  chainHolders,
  chainMinted,
  chainReset,
  chainRollback,
  chainState,
  mintingPlayer,
  mintThroughApi,
  operationOf,
  prepareMint,
  readiness,
  submitWitness,
} from "./helpers/chain.js";
import {
  DESKTOP_VIEWPORT,
  PHONE_VIEWPORT,
  adaIn,
  atStep,
  buttonMeasures,
  cancelOperation,
  closeContexts,
  closeDialog,
  keep,
  line,
  linesOf,
  markOf,
  mintDialog,
  openItemCard,
  rules,
  say,
  settle,
  shelfTile,
  shot,
  toWalletFromCheck,
  toWalletStep,
  wholeInView,
} from "./helpers/mint.js";

// The minting dialog in the browser (minting plan D, Task 9): the game's own dialog, item card
// and sign page against the browser tests' API, which mints for real on the chain double
// (helpers/chain.js). The fake wallet signs with real keys (helpers/wallet.js). Every screen is
// also shot for the owner when MINT_SHOTS_DIR is set (helpers/mint.js shot: German, as the owner's
// mockup; two French ones), at 1280×720 and 390×844.

const require = createRequire(import.meta.url);
const { TEST_POLICY_ID } = require("../../api/test/chainDouble.js");

const DE = "de";
const NBSP = String.fromCharCode(0xa0);
const BARREL = "HEAVY_BARREL";
const barrelDe = say(DE, `ITEM_${BARREL}`);

// the pages a test opened are closed (also after a failure: they would go on polling), then the
// double's faults, held mempool, waiting transactions and config, shared by every spec, are put
// back
test.afterEach(async ({ request }) => {
  await closeContexts();
  await chainReset(request);
});

// mintingPlayer's player, whose context closes after the test
const player = async (...args) => {
  const made = await mintingPlayer(...args);
  keep(made.context);
  return made;
};

// the operation of `who`'s item `itemId` as the stats mark it (minting or signing), or null
const markedOperation = async (request, who, itemId) => {
  const mark = await markOf(request, who, itemId);
  return mark ? mark.operationId || null : null;
};

const mintedState = async (request, who, itemId) => {
  const mark = await markOf(request, who, itemId);
  return mark ? mark.state : null;
};

// the step's primary button `testId` is wholly visible without scrolling, on the desktop and at
// a phone's size
const primaryInView = async (page, testId) => {
  const button = mintDialog(page).getByTestId(testId);
  await expect(button).toBeVisible();
  expect(await wholeInView(button), `${testId} at 1280×720`).toBe(true);
  const size = page.viewportSize();
  await page.setViewportSize(PHONE_VIEWPORT);
  await settle(page);
  expect(await wholeInView(button), `${testId} at 390×844`).toBe(true);
  await page.setViewportSize(size);
  await settle(page);
};

// what a player must read before the step's primary button `testId`: on costs every cost row
// and the stays-minted line, on the checklist every unmet line (`language` the page's)
const mustRead = async (page, step, language) => {
  const dialog = mintDialog(page);
  if (step === "costs") {
    return [
      ...[0, 1, 2].map((index) => dialog.getByTestId("mint-cost").nth(index)),
      dialog.getByText(say(language, "MINT_FINAL")),
    ];
  }
  const unmet = await dialog
    .locator("[data-testid=mint-line][data-met=false]")
    .all();
  expect(unmet.length, `${step}: an unmet line to read`).toBeGreaterThan(0);
  return unmet;
};

// whether every one of `locators` and the step's primary button is wholly in view
const allInView = async (page, locators, primary) => {
  const missing = [];
  for (const [index, locator] of [
    ...locators,
    mintDialog(page).getByTestId(primary),
  ].entries()) {
    if (!(await wholeInView(locator))) {
      missing.push(index === locators.length ? primary : index);
    }
  }
  return missing;
};

// at the page's size and at a phone's (`narrow`, a desktop page resized), the step's primary
// button and everything to read before it are wholly in view without scrolling
const readBeforeCommit = async (
  page,
  step,
  primary,
  { language = DE, narrow = true } = {}
) => {
  await expect(mintDialog(page).getByTestId(primary)).toBeVisible();
  const sizes = narrow
    ? [page.viewportSize(), PHONE_VIEWPORT]
    : [page.viewportSize()];
  const size = page.viewportSize();
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await settle(page);
    const missing = await allInView(
      page,
      await mustRead(page, step, language),
      primary
    );
    expect(missing, `${step} at ${viewport.width}×${viewport.height}`).toEqual(
      []
    );
  }
  await page.setViewportSize(size);
  await settle(page);
};

// the scroll area's cue: whether it shows more below / above ("true" or "false")
const cueOf = async (page) => {
  const area = mintDialog(page).getByTestId("mint-scroll");
  return {
    below: await area.getAttribute("data-more-below"),
    above: await area.getAttribute("data-more-above"),
  };
};

// a long language at 1280×720: everything to read before the step's primary button (on the
// checklist every line) is in view with it, or the scroll area shows that there is more; which
// of the two is noted on the test ("fits" / "cue")
const fitsOrCues = async (page, step, primary, language) => {
  const size = page.viewportSize();
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await settle(page);
  const lines = mintDialog(page).getByTestId("mint-line");
  const read =
    step === "costs"
      ? await mustRead(page, step, language)
      : [...Array(await lines.count()).keys()].map((index) => lines.nth(index));
  const missing = await allInView(page, read, primary);
  expect(missing, `${primary} at 1280×720`).not.toContain(primary);
  if (missing.length > 0) {
    expect((await cueOf(page)).below, `${language} ${step}: the cue`).toBe(
      "true"
    );
  }
  const verdict = `${language} ${step} at 1280×720: ${missing.length === 0 ? "fits" : "cue"}`;
  test.info().annotations.push({ type: "1280×720", description: verdict });
  console.log(verdict);
  await page.setViewportSize(size);
  await settle(page);
  return missing.length === 0;
};

// the ADA amount of a cost row as the dialog writes it in German
const aboutDe = (lovelace) => say(DE, "MINT_ABOUT", adaIn(DE, lovelace), "ADA");
const exactDe = (lovelace) =>
  say(DE, "MINT_AMOUNT", adaIn(DE, lovelace, { exact: true }), "ADA");
// what leaves the wallet: its minus on the number, inside the "≈" ("≈ −4,81 ADA")
const MINUS = "\u2212";
const givenAboutDe = (lovelace) =>
  say(DE, "MINT_ABOUT", `${MINUS}${adaIn(DE, lovelace)}`, "ADA");
const givenExactDe = (lovelace) =>
  say(
    DE,
    "MINT_AMOUNT",
    `${MINUS}${adaIn(DE, lovelace, { exact: true })}`,
    "ADA"
  );
// what the player keeps, an estimate rounded down
const keptAboutDe = (lovelace) =>
  say(DE, "MINT_ABOUT", adaIn(DE, lovelace, { round: "down" }), "ADA");

// holds the requests of `page` to `pattern` (method `method`) until the answer's release(); the
// first one held resolves `held`
const holdRequests = async (page, pattern, method) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let heldOne;
  const held = new Promise((resolve) => {
    heldOne = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) {
      return route.fallback();
    }
    heldOne(route.request());
    await gate;
    return route.fallback();
  });
  return { held, release: () => release() };
};

test("the extension path: explainer, checklist, three costs, the wallet, minting, done", async ({
  browser,
  request,
}) => {
  // the wallet linked as a player links it: through the door
  const pia = await player(browser, request, "Pia", {
    equip: true,
    link: "door",
    language: DE,
  });
  const { page, item, wallet } = pia;
  await expect(page.locator("html")).toHaveAttribute("lang", DE);

  // the item card of a plain item: Mint under Equip
  await openItemCard(page);
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("mint-open")).toHaveText(
    say(DE, "MINT_ACTION")
  );
  await expect(card.getByText(say(DE, "MINT_ACTION_TEXT"))).toBeVisible();
  await expect(card.getByTestId("mint-status")).toHaveCount(0);
  await shot(page, "card-plain");

  // the explainer the first time
  await card.getByTestId("mint-open").click();
  await atStep(page, "explain");
  const dialog = mintDialog(page);
  await expect(dialog).toContainText(say(DE, "MINT_EXPLAIN_TEXT"));
  await expect(dialog).toContainText(say(DE, "MINT_FINAL"));
  // each step's primary button is in sight without scrolling, on the desktop and on a phone
  await primaryInView(page, "mint-how");
  await shot(page, "explain");

  // the checklist: every line met, in the mockup's order
  await dialog.getByTestId("mint-how").click();
  await atStep(page, "check");
  await expect(dialog.getByTestId("mint-line")).toHaveCount(4);
  expect(
    await dialog
      .getByTestId("mint-line")
      .evaluateAll((lines) =>
        lines.map((entry) => [entry.dataset.id, entry.dataset.met])
      )
  ).toEqual([
    ["matches", "true"],
    ["wallet", "true"],
    ["ada", "true"],
    ["limit", "true"],
  ]);
  await expect(line(page, "matches")).toContainText(
    say(DE, "MINT_CHECK_MATCHES_MET", rules.MINT_MIN_ONLINE_MATCHES)
  );
  await expect(line(page, "wallet")).toContainText("Eternl");
  await expect(line(page, "ada")).toContainText(say(DE, "MINT_CHECK_ADA"));
  await expect(line(page, "ada")).toContainText("20 ADA");
  await expect(line(page, "limit")).toContainText(
    say(DE, "MINT_CHECK_LEFT", rules.MINTS_PER_DAY)
  );
  await expect(dialog.getByTestId("mint-next")).toBeEnabled();
  await primaryInView(page, "mint-next");
  await shot(page, "check");

  // the costs: three rows; the battlechoc fee exact, the network fee and the deposit estimates
  const ready = await readiness(request, pia, item.id);
  await dialog.getByTestId("mint-next").click();
  await atStep(page, "costs");
  const rows = dialog.getByTestId("mint-cost");
  expect(
    await rows.evaluateAll((all) =>
      all.map((row) => [row.dataset.kind, row.dataset.exact])
    )
  ).toEqual([
    ["network", "false"],
    ["game", "true"],
    ["deposit", "false"],
  ]);
  const rowOf = (kind) =>
    dialog.locator(`[data-testid=mint-cost][data-kind=${kind}]`);
  // a RARE item: 2 ADA, exact (never "≈"); the others are estimates
  const amountOf = (kind) => rowOf(kind).locator(":scope > div").last();
  await expect(rowOf("game")).toContainText(say(DE, "MINT_GAME_FEE"));
  await expect(amountOf("game")).toHaveText("2 ADA");
  await expect(amountOf("network")).toHaveText(
    aboutDe(ready.estimate.networkFee)
  );
  await expect(amountOf("deposit")).toHaveText(aboutDe(ready.estimate.deposit));
  // German amounts: a decimal comma, never a point
  expect(await dialog.innerText()).not.toMatch(/\d\.\d+ ADA/);
  await expect(dialog.getByTestId("mint-fee")).toHaveCount(0);
  await primaryInView(page, "mint-now");
  // all three costs and "minted stays minted" are read before Mint now, without scrolling
  await readBeforeCommit(page, "costs", "mint-now");
  await shot(page, "costs");

  // Mint now: the wallet's addresses, then the wallet step with the prepared costs, exact
  await dialog.getByTestId("mint-now").click();
  await atStep(page, "wallet", 30000);
  const operationId = await markedOperation(request, pia, item.id);
  expect(operationId).toBeTruthy();
  const prepared = await operationOf(request, pia, operationId);
  expect(prepared).toMatchObject({ state: "prepared", ownerConfirmed: true });
  const { networkFee, gameFee, deposit, deposits } = prepared.costs;
  expect(gameFee).toEqual({ asset: "lovelace", label: "ADA", amount: 2000000 });
  // the deposit's two parts (D38): the reference token's stays at the items' script, the user
  // token's goes with the item into the wallet
  expect(deposits.reference + deposits.user).toBe(deposit);
  expect(deposits.user).toBeGreaterThan(0);
  // "You give": what leaves the wallet (a CIP-30 wallet shows the net change of its balance)
  await expect(dialog.getByTestId("mint-total")).toHaveText(
    givenExactDe(String(networkFee + gameFee.amount + deposits.reference))
  );
  // "You get": the item, and the ADA that stays with it in the wallet
  await expect(dialog.getByTestId("mint-stays")).toHaveText(
    say(DE, "MINT_GET_DEPOSIT", exactDe(String(deposits.user)))
  );
  await expect(dialog).toContainText(say(DE, "MINT_WALLET_TEXT"));
  await expect(dialog).not.toContainText(say(DE, "MINT_SIGN_TWICE"));
  await expect(dialog).toContainText(
    say(DE, "MINT_GET_ITEM", barrelDe, item.serial)
  );
  await expect(dialog.getByTestId("mint-time")).toHaveText(
    say(DE, "MINT_WALLET_TIME", rules.SIGN_WINDOW_MS / 60000)
  );
  // the readiness and the wallet's own addresses went out before the mint, no signature yet
  expect(wallet.asked("signTx")).toEqual([]);
  await primaryInView(page, "mint-open-wallet");
  await shot(page, "wallet");

  // Open wallet: while the sign info is on its way the dialog waits for the wallet
  const hold = await holdRequests(page, /\/chain\/sign\/[^/?]+$/, "GET");
  await dialog.getByTestId("mint-open-wallet").click();
  await hold.held;
  await atStep(page, "sign");
  await expect(dialog).toContainText(say(DE, "MINT_WALLET_CONFIRM"));
  await shot(page, "sign");
  hold.release();

  // the wallet signs the server's transaction once, as a partial signature; minting
  await atStep(page, "minting", 30000);
  expect(wallet.asked("signTx")).toEqual([
    { method: "signTx", tx: expect.any(String), partial: true },
  ]);
  const submitted = await operationOf(request, pia, operationId);
  expect(submitted.state).toBe("submitted");
  expect((await chainState(request)).mempool).toContain(submitted.txHash);
  await expect(dialog).toContainText(say(DE, "MINT_MINTING_TEXT"));
  await shot(page, "minting");

  // one block: minted, with its stamp and serial
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  await expect(dialog.getByTestId("item-stamp")).toBeVisible();
  await expect(dialog.getByTestId("item-serial-tag")).toHaveText(
    say(DE, "ITEM_SERIAL", item.serial)
  );
  await expect(dialog).toContainText(say(DE, "MINT_DONE_TEXT"));
  await shot(page, "done");
  expect(
    await chainHolders(request, TEST_POLICY_ID + submitted.assetName)
  ).toEqual([{ address: pia.keys.baseAddress, quantity: "1" }]);

  // the card: minted in the wallet it was linked as, the stamp and the serial tag, still equipped
  await dialog.getByTestId("mint-to-item").click();
  await expect(card.getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "minted"
  );
  await expect(card.getByTestId("mint-status")).toContainText(
    say(DE, "MINT_MARK_MINTED_TEXT", "Eternl")
  );
  await expect(card.getByTestId("item-stamp")).toBeVisible();
  await expect(card.getByTestId("item-serial-tag")).toHaveText(
    say(DE, "ITEM_SERIAL", item.serial)
  );
  await expect(card.getByTestId("item-equipped")).toBeVisible();
  await expect(card.getByTestId("mint-open")).toHaveCount(0);
  await shot(page, "card-minted");

  // the shelf's small icon wears the stamp ring
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  const tile = shelfTile(page, BARREL);
  await expect(tile.getByTestId("item-stamp")).toBeVisible();
  await expect(tile).toHaveAttribute(
    "aria-label",
    say(DE, "ITEM_MINTED_LABEL", barrelDe, item.serial)
  );
  await shot(page, "shelf-minted");

  // a match on the server carries the minted item
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText(say(DE, "START_GAME"), { exact: true }).first().click();
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.online &&
      window.__battlechoc.view &&
      window.__battlechoc.view(),
    null,
    { timeout: 30000 }
  );
  const own = await page.evaluate(() => {
    const view = window.__battlechoc.view();
    return view.players[view.viewer].loadout;
  });
  expect(Object.values(own).flat()).toContain(BARREL);
});

test("close the dialog while minting and come back", async ({
  browser,
  request,
}) => {
  const quill = await player(browser, request, "Quill", {
    language: DE,
  });
  const { page, item } = quill;
  await openItemCard(page);
  await toWalletStep(page);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  await mintDialog(page).getByTestId("mint-keep-playing").click();
  await expect(mintDialog(page)).toHaveCount(0);

  // a reload: the card and the shelf say it is being minted
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page);
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "minting"
  );
  await expect(card.getByTestId("mint-status")).toContainText(
    say(DE, "MINT_MARK_MINTING_TEXT")
  );
  await expect(card.getByTestId("item-minting")).toBeVisible();
  await expect(card.getByTestId("mint-open")).toHaveCount(0);
  await shot(page, "card-minting");
  await page.keyboard.press("Escape");
  await expect(
    shelfTile(page, BARREL).getByTestId("item-minting")
  ).toBeVisible();
  await shot(page, "shelf-minting");

  // one block: the watcher says so, and the shelf and the card show it minted
  await chainBlocks(request, 1);
  const toast = page.getByTestId("quick-message");
  await expect(toast).toContainText(
    say(DE, "MINT_DONE_TOAST", barrelDe, item.serial),
    { timeout: 20000 }
  );
  await expect(toast).toHaveAttribute("data-variant", "success");
  await expect(shelfTile(page, BARREL).getByTestId("item-stamp")).toBeVisible();
  await shot(page, "toast-minted");
  await shelfTile(page, BARREL).click();
  await expect(card.getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "minted"
  );
  expect(await mintedState(request, quill, item.id)).toBe("minted");
});

test("saying no in the wallet changes nothing", async ({
  browser,
  request,
}) => {
  const runa = await player(browser, request, "Runa", {
    language: DE,
    wallet: { declineTx: true },
  });
  const { page, item, wallet } = runa;
  await openItemCard(page);
  await toWalletStep(page);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "nothing", 30000);
  const dialog = mintDialog(page);
  await expect(dialog.getByTestId("mint-problem")).toHaveAttribute(
    "data-key",
    "MINT_CANCELLED"
  );
  await expect(dialog.getByTestId("mint-problem")).toHaveText(
    say(DE, "MINT_CANCELLED")
  );
  await expect(dialog.getByTestId("mint-again")).toBeVisible();
  await expect(dialog.getByTestId("mint-to-item")).toBeVisible();
  expect(wallet.asked("signTx")).toHaveLength(1);
  await shot(page, "nothing");

  // nothing reached the chain: the minting waits, prepared, for a signature within its window
  // (the brief's "the item plain" does not hold: the item is marked as waiting for one)
  const operationId = await markedOperation(request, runa, item.id);
  expect((await operationOf(request, runa, operationId)).state).toBe(
    "prepared"
  );
  expect((await chainState(request)).mempool).toEqual([]);
  expect(await markOf(request, runa, item.id)).toMatchObject({
    state: "minting",
    operationId,
    signing: true,
  });

  // Try again: the prepared minting is still open, so the wallet step offers it again
  await dialog.getByTestId("mint-again").click();
  await atStep(page, "wallet");
  // closed there, the card says the item waits for the signature, not minted
  await closeDialog(page);
  await expect(dialog).toHaveCount(0);
  await shelfTile(page, BARREL).click();
  const status = page.getByTestId("item-card").getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "signing");
  await expect(
    page.getByTestId("item-card").getByTestId("item-stamp")
  ).toHaveCount(0);
  await shot(page, "card-after-no");
  // Continue on the card, and this time the wallet signs
  await status.getByTestId("mint-continue").click();
  await atStep(page, "wallet");
  wallet.options.declineTx = false;
  await dialog.getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  expect(wallet.asked("signTx")).toHaveLength(2);
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
});

test("not enough ADA says how much is missing", async ({
  browser,
  request,
}) => {
  const sami = await player(browser, request, "Sami", {
    language: DE,
    funds: "short",
  });
  const { page, item } = sami;
  const ready = await readiness(request, sami, item.id);
  const [entry] = ready.wallets;
  expect(entry.enough).toBe(false);
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  await expect(line(page, "ada")).toHaveAttribute("data-met", "false");
  await expect(line(page, "ada")).toContainText(say(DE, "MINT_CHECK_LOW"));
  await expect(line(page, "ada")).toContainText(
    say(
      DE,
      "MINT_CHECK_LOW_TEXT",
      adaIn(DE, entry.lovelace, { round: "down" }),
      adaIn(DE, entry.needed),
      adaIn(DE, entry.missing)
    )
  );
  await expect(line(page, "ada")).toContainText("Es fehlen etwa");
  // the reason Continue is grey comes first, and is in view with it
  await expect(
    mintDialog(page).getByTestId("mint-line").first()
  ).toHaveAttribute("data-id", "ada");
  await readBeforeCommit(page, "check", "mint-next");
  await expect(mintDialog(page).getByTestId("mint-next")).toBeDisabled();
  await shot(page, "not-enough-ada");
});

test("the phone path through the sign page: the wallet confirms its addresses, then signs", async ({
  browser,
  request,
}) => {
  // an Android phone without a wallet in its browser: the wallet is an app with a browser of its
  // own
  const ines = await player(browser, request, "Inessa", {
    wallet: false,
    device: ANDROID_PHONE,
    language: DE,
  });
  const { page, item } = ines;
  await page.evaluate(() => {
    window.__battlechocRecordDeepLinks = true;
  });
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  const dialog = mintDialog(page);
  await dialog.getByTestId("mint-how").click();
  await atStep(page, "check");
  await expect(dialog.getByTestId("mint-next")).toBeEnabled();
  await dialog.getByTestId("mint-next").click();
  await atStep(page, "costs");
  // on the phone itself: the three costs and "minted stays minted" with Mint now
  await readBeforeCommit(page, "costs", "mint-now", { narrow: false });
  await shot(page, "phone-costs", { kind: "phone" });

  // no wallet in this browser: the minting is prepared without its addresses, and the wallet
  // step says that the wallet will ask twice
  await dialog.getByTestId("mint-now").click();
  await atStep(page, "wallet", 30000);
  await expect(dialog).toContainText(say(DE, "MINT_WALLET_TEXT_UNCONFIRMED"));
  await expect(dialog).toContainText(say(DE, "MINT_SIGN_TWICE"));
  const operationId = await markedOperation(request, ines, item.id);
  const unconfirmed = await operationOf(request, ines, operationId);
  expect(unconfirmed).toMatchObject({
    state: "prepared",
    ownerConfirmed: false,
  });
  // not confirmed by the wallet yet: the sign page may build it anew for the wallet's own
  // addresses, so the total is an estimate
  const { networkFee, gameFee, deposits } = unconfirmed.costs;
  await expect(dialog.getByTestId("mint-total")).toHaveText(
    givenAboutDe(String(networkFee + gameFee.amount + deposits.reference))
  );
  await expect(dialog.getByTestId("mint-stays")).toHaveText(
    say(DE, "MINT_GET_DEPOSIT", keptAboutDe(String(deposits.user)))
  );
  const box = dialog.getByTestId("mint-wallet-box");
  expect(await linesOf(box, say(DE, "MINT_YOU_GIVE"))).toBe(1);
  expect(await linesOf(box, say(DE, "MINT_YOU_GET"))).toBe(1);
  await shot(page, "phone-wallet", { kind: "phone" });

  // Open wallet: the door lists the phone's wallet apps; Eternl opens the sign page. The door's
  // chunk (not precached) does not arrive the first time, as on a flaky phone connection: it is
  // asked for again, and the game never falls to its recovery screen
  let doorChunks = 0;
  await page.route(/\/assets\/WalletDoor-[^/]+\.js$/, (route) => {
    doorChunks += 1;
    return doorChunks === 1
      ? route.abort("internetdisconnected")
      : route.fallback();
  });
  await dialog.getByTestId("mint-open-wallet").click();
  const door = page.getByTestId("wallet-door");
  await expect(door).toBeVisible();
  expect(doorChunks).toBe(2);
  await expect(page.getByText(say(DE, "ERROR_RECOVERY_TEXT"))).toHaveCount(0);
  await expect(door).toContainText(say(DE, "MINT_SIGN_DOOR_TEXT"));
  await shot(page, "phone-door", { kind: "phone" });
  await door.getByText("Eternl", { exact: false }).first().click();
  let deepLink;
  await expect
    .poll(async () => {
      deepLink = await page.evaluate(
        () => (window.__battlechocDeepLinks || [])[0]
      );
      return deepLink;
    })
    .toBeTruthy();
  expect(deepLink).toMatch(/^web\+cardano:\/\/browse\/v1\?uri=/);
  const signUrl = new URL(decodeURIComponent(deepLink.split("uri=")[1]));
  expect(signUrl.pathname).toBe("/sign/");
  expect(signUrl.searchParams.get("code")).toBeTruthy();
  await atStep(page, "sign");
  await expect(dialog).toContainText(say(DE, "MINT_SIGN_PHONE"));
  // the waiting step offers the wallet again beside Cancel
  await expect(dialog.getByTestId("mint-open-wallet")).toBeVisible();
  await expect(dialog.getByTestId("mint-cancel")).toBeVisible();
  await shot(page, "phone-sign", { kind: "phone" });
  // the deep link led nowhere (or the player came back before signing): Open wallet again
  // brings the door back, nothing is cancelled, and Eternl opens the same sign page
  await dialog.getByTestId("mint-open-wallet").click();
  await expect(door).toBeVisible();
  await atStep(page, "wallet");
  expect((await operationOf(request, ines, operationId)).state).toBe(
    "prepared"
  );
  await door.getByText("Eternl", { exact: false }).first().click();
  await atStep(page, "sign");
  await expect
    .poll(() =>
      page.evaluate(() => (window.__battlechocDeepLinks || []).length)
    )
    .toBe(2);
  expect(await page.evaluate(() => window.__battlechocDeepLinks[1])).toBe(
    deepLink
  );

  // the wallet app's own browser: no session, the same words
  const walletContext = keep(
    await browser.newContext({ ...ANDROID_PHONE, locale: "de-DE" })
  );
  await walletContext.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const wallet = await fakeWallet(walletContext, ines.keys);
  // a second wallet in that browser (it is never asked): one button per wallet
  await walletContext.addInitScript(() => {
    window.cardano = window.cardano || {};
    window.cardano.lace = {
      name: "lace",
      apiVersion: "0.1.0",
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      enable: async () => {
        throw { code: -3, info: "not this one" };
      },
      isEnabled: async () => false,
    };
  });
  const signPage = await walletContext.newPage();
  await signPage.goto(signUrl.pathname + signUrl.search, {
    waitUntil: "networkidle",
  });
  const buttons = signPage.getByTestId("mint-sign-wallet");
  await expect(buttons).toHaveCount(2);
  expect(
    await buttons.evaluateAll((all) => all.map((one) => one.dataset.wallet))
  ).toEqual(["eternl", "lace"]);
  const button = signPage.locator(
    "[data-testid=mint-sign-wallet][data-wallet=eternl]"
  );
  await expect(button).toHaveText(say(DE, "MINT_SIGN_WITH", "Eternl"));
  await expect(
    signPage.locator("[data-testid=mint-sign-wallet][data-wallet=lace]")
  ).toHaveText(say(DE, "MINT_SIGN_WITH", "Lace"));
  // before any prompt: the item, its costs and that the wallet asks twice
  await expect(signPage.locator("body")).toContainText(
    `${barrelDe} ${say(DE, "ITEM_SERIAL", item.serial)}`
  );
  await expect(signPage.getByTestId("mint-sign-costs")).toBeVisible();
  // not vouched for yet: the network fee and the deposit "≈" (as in the game), the battlechoc
  // fee exact; what the wallet shows: the fees and the reference deposit given, the item's own
  // deposit staying with it
  const signCost = (kind) =>
    signPage.locator(
      `[data-testid=mint-sign-costs] [data-kind=${kind}] span:last-child`
    );
  await expect(signCost("network")).toHaveText(aboutDe(String(networkFee)));
  await expect(signCost("game")).toHaveText("2 ADA");
  await expect(signCost("deposit")).toHaveText(
    aboutDe(String(unconfirmed.costs.deposit))
  );
  await expect(signPage.getByTestId("mint-sign-give")).toHaveText(
    givenAboutDe(String(networkFee + gameFee.amount + deposits.reference))
  );
  await expect(signPage.getByTestId("mint-sign-stays")).toHaveText(
    say(DE, "MINT_GET_DEPOSIT", keptAboutDe(String(deposits.user)))
  );
  await expect(signPage.locator("body")).toContainText(
    say(DE, "MINT_SIGN_TWICE")
  );
  expect(wallet.asked("signData")).toEqual([]);
  await shot(signPage, "sign-page-before", { kind: "phone" });

  // between the two prompts: the proof is on its way to battlechoc
  const proof = await holdRequests(
    signPage,
    /\/chain\/sign\/[^/?]+\/addresses$/,
    "POST"
  );
  let proofs = 0;
  signPage.on("request", (sent) => {
    if (
      /\/addresses$/.test(sent.url()) &&
      sent.method() === "POST" &&
      (sent.postDataJSON() || {}).proof
    ) {
      proofs += 1;
    }
  });
  // the wallet is asked within the tap, before the page reads the sign info again (D47: some
  // in-app browsers drop a tap's user activation over a round trip)
  await signPage.evaluate(() => {
    const eternl = window.cardano.eternl;
    const enable = eternl.enable;
    eternl.enable = (...args) => {
      window.walletEnabledAtTap = true;
      return enable(...args);
    };
  });
  const reread = await holdRequests(signPage, /\/chain\/sign\/[^/?]+$/, "GET");
  await button.click();
  await reread.held;
  expect(
    await signPage.evaluate(() => window.walletEnabledAtTap === true)
  ).toBe(true);
  reread.release();
  await expect(signPage.getByTestId("mint-sign-waiting")).toBeVisible();
  await proof.held;
  // while the wallet is asked, no wallet button can be tapped, and none looks as if it could: grey,
  // as the game's disabled buttons
  for (const one of await buttons.all()) {
    await expect(one).toBeDisabled();
    expect(
      await one.evaluate((element) => getComputedStyle(element).filter)
    ).toBe("grayscale(1)");
  }
  await shot(signPage, "sign-page-waiting", { kind: "phone" });
  proof.release();

  await expect(signPage.getByTestId("mint-sign-done")).toHaveText(
    say(DE, "MINT_SIGN_DONE"),
    { timeout: 30000 }
  );
  expect(proofs).toBe(1);
  // the wallet was asked twice, in this order: the address proof, then the transaction
  expect(
    wallet.calls
      .filter((call) => ["signData", "signTx"].includes(call.method))
      .map((call) => call.method)
  ).toEqual(["signData", "signTx"]);
  // the proof is signed with the account's stake key (its reward address)
  expect(wallet.asked("signData")[0].address).toBe(ines.keys.rewardAddressHex);
  expect(wallet.asked("signTx")[0].partial).toBe(true);
  await expect(signPage.getByTestId("mint-sign-done")).toHaveAttribute(
    "role",
    "status"
  );
  // what was signed, exact: the wallet vouched, and the minting was built for its addresses
  const signedCosts = (await operationOf(request, ines, operationId)).costs;
  await expect(signCost("network")).toHaveText(
    exactDe(String(signedCosts.networkFee))
  );
  await expect(signCost("deposit")).toHaveText(
    exactDe(String(signedCosts.deposit))
  );
  await expect(signPage.getByTestId("mint-sign-give")).toHaveText(
    givenExactDe(
      String(
        signedCosts.networkFee +
          signedCosts.gameFee.amount +
          signedCosts.deposits.reference
      )
    )
  );
  await expect(signPage.getByTestId("mint-sign-stays")).toHaveText(
    say(DE, "MINT_GET_DEPOSIT", exactDe(String(signedCosts.deposits.user)))
  );
  await shot(signPage, "sign-page-done", { kind: "phone" });

  // the phone's dialog moves on by itself; one block: minted, on the chain at the wallet
  await atStep(page, "minting", 20000);
  await shot(page, "phone-minting", { kind: "phone" });
  const submitted = await operationOf(request, ines, operationId);
  expect(submitted).toMatchObject({ state: "submitted", ownerConfirmed: true });
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  await shot(page, "phone-done", { kind: "phone" });
  expect(
    await chainHolders(request, TEST_POLICY_ID + submitted.assetName)
  ).toEqual([{ address: ines.keys.baseAddress, quantity: "1" }]);
});

test("the sign page for a code that no longer signs says it is too old", async ({
  browser,
  request,
}) => {
  const vera = await player(browser, request, "Vera", {
    language: DE,
  });
  const { page, item } = vera;
  const answer = await prepareMint(request, vera, { itemId: item.id });
  expect(answer.status(), await answer.text()).toBe(201);
  const { operation, signCode } = await answer.json();
  expect((await cancelOperation(request, vera, operation.id)).state).toBe(
    "cancelled"
  );
  await page.goto(`/sign/?code=${encodeURIComponent(signCode)}`, {
    waitUntil: "networkidle",
  });
  const problem = page.getByTestId("mint-sign-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_SIGN_EXPIRED");
  await expect(problem).toHaveText(say(DE, "MINT_SIGN_EXPIRED"));
  await expect(page.getByTestId("mint-sign-wallet")).toHaveCount(0);
  // the code is of no more use: no Try again either
  await expect(page.getByTestId("mint-sign-again")).toHaveCount(0);
  await shot(page, "sign-page-expired");
});

test("in the Android app there is no Mint", async ({ browser, request }) => {
  const wim = await player(browser, request, "Wim", { language: DE });
  const { page, item } = wim;
  // in the browser the card offers it
  await openItemCard(page);
  await expect(page.getByTestId("mint-open")).toBeVisible();
  // the TWA's start address (apps/android/twa-manifest.json)
  await page.goto("/index.html?app_runs_as=twa&app_version=1", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await openItemCard(page);
  await expect(page.getByTestId("item-card")).toContainText(
    say(DE, "ITEM_SERIAL", item.serial)
  );
  await expect(page.getByTestId("mint-open")).toHaveCount(0);
  await expect(page.getByTestId("mint-status")).toHaveCount(0);
  await shot(page, "android-app");
});

test("a rolled-back block puts the card back to minting", async ({
  browser,
  request,
}) => {
  const xenia = await player(browser, request, "Xenia", {
    language: DE,
  });
  const { page, item } = xenia;
  // the watcher follows a minting in a block every 30 s until it is final: the page's clock
  // jumps instead of the test waiting
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page);
  await toWalletStep(page);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  const operationId = await markedOperation(request, xenia, item.id);
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  expect((await operationOf(request, xenia, operationId)).state).toBe(
    "included"
  );
  await mintDialog(page).getByTestId("mint-to-item").click();
  const status = page.getByTestId("item-card").getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "minted");

  // the block is rolled back: the mint waits in the mempool again
  await chainRollback(request, 1);
  expect((await operationOf(request, xenia, operationId)).state).toBe(
    "submitted"
  );
  await page.clock.fastForward(31000);
  await expect(status).toHaveAttribute("data-state", "minting", {
    timeout: 15000,
  });
  await expect(
    page.getByTestId("item-card").getByTestId("item-minting")
  ).toBeVisible();
  await shot(page, "rolled-back");

  // the next block: minted again
  await chainBlocks(request, 1);
  await page.clock.fastForward(6000);
  await expect(status).toHaveAttribute("data-state", "minted", {
    timeout: 15000,
  });
  expect(await mintedState(request, xenia, item.id)).toBe("minted");
});

// what the wallet step must not say once signing is ruled out (the signature went out, or the
// minting must start again): its own texts, the window's time, Open wallet
const noWalletPrompts = async (page) => {
  const dialog = mintDialog(page);
  await expect(page.getByText(say(DE, "MINT_STATUS_TITLE"))).toBeVisible();
  await expect(page.getByText(say(DE, "MINT_WALLET_TITLE"))).toHaveCount(0);
  for (const key of [
    "MINT_WALLET_TEXT",
    "MINT_WALLET_TEXT_UNCONFIRMED",
    "MINT_SIGN_TWICE",
    "MINT_WALLET_CONFIRM",
  ]) {
    await expect(dialog.getByText(say(DE, key))).toHaveCount(0);
  }
  await expect(dialog.getByTestId("mint-time")).toHaveCount(0);
  await expect(dialog.getByTestId("mint-open-wallet")).toHaveCount(0);
  // what was signed for stays
  await expect(dialog.getByTestId("mint-wallet-box")).toBeVisible();
};

test("the answer after the signature is lost: no second signature, and the poll carries on", async ({
  browser,
  request,
}) => {
  const yara = await player(browser, request, "Yara", {
    language: DE,
  });
  const { page, item, wallet } = yara;
  await openItemCard(page);
  await toWalletStep(page);
  const operationId = await markedOperation(request, yara, item.id);
  const preparedView = await operationOf(request, yara, operationId);
  // the dialog's polls of the operation are held, so the test decides when one answers
  const polls = [];
  // every poll the page sent, held or not
  let pollsSent = 0;
  const pollPattern = new RegExp(`/chain/operations/${operationId}$`);
  await page.route(pollPattern, (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    pollsSent += 1;
    polls.push(route);
    return undefined;
  });
  // the witness reaches the server; its answer never reaches the page
  let reached = 0;
  await page.route(/\/chain\/sign\/[^/?]+$/, async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    const answer = await route.fetch();
    expect(answer.status()).toBe(200);
    reached += 1;
    return route.abort("connectionreset");
  });
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  const dialog = mintDialog(page);
  const problem = dialog.getByTestId("mint-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_SIGNED_UNHEARD", {
    timeout: 30000,
  });
  expect(reached).toBe(1);
  await expect(problem).toContainText(say(DE, "MINT_SIGNED_UNHEARD"));
  await expect(dialog).toHaveAttribute("data-step", "wallet");
  // no second signature, no cancel, nothing that asks for the wallet
  await expect(dialog.getByTestId("mint-cancel")).toHaveCount(0);
  await expect(dialog.getByTestId("mint-back")).toHaveCount(0);
  await noWalletPrompts(page);
  // the serial stays with its "Nr." in the wallet box: no line break may come between them
  // (it did at 1280 px with "Nr. 9": a no-break space joins them)
  expect(await dialog.getByTestId("mint-wallet-box").textContent()).toContain(
    `Nr.${NBSP}${item.serial}`
  );
  expect(
    await linesOf(
      dialog.getByTestId("mint-wallet-box"),
      say(DE, "ITEM_SERIAL", item.serial)
    )
  ).toBe(1);
  expect(wallet.asked("signTx")).toHaveLength(1);
  const submitted = await operationOf(request, yara, operationId);
  expect(submitted.state).toBe("submitted");
  expect((await chainState(request)).mempool).toContain(submitted.txHash);
  await shot(page, "answer-lost");

  // a poll answers "prepared" late, after the witness arrived: still no signature offered, the
  // problem stays. The page drops a poll held over ANSWER_MS (20 s) and asks again 5 s later, so
  // an old held poll proves nothing: wait for one just sent and answer that one
  const sentBefore = pollsSent;
  await expect
    .poll(() => pollsSent, { timeout: 30000 })
    .toBeGreaterThan(sentBefore);
  const answered = pollsSent;
  await polls.pop().fulfill({ json: preparedView });
  // the answer was taken in: the next poll comes MIN_POLL_MS (5 s) after it, where a dropped
  // one would come only 25 s after it was sent (operationPoll)
  await expect
    .poll(() => pollsSent, { timeout: 15000 })
    .toBeGreaterThan(answered);
  await settle(page);
  await expect(problem).toHaveAttribute("data-key", "MINT_SIGNED_UNHEARD");
  await expect(dialog.getByTestId("mint-cancel")).toHaveCount(0);
  await expect(dialog.getByTestId("mint-back")).toHaveCount(0);
  await noWalletPrompts(page);

  // the polls go through again: it is submitted, minting; one block: done
  await page.unroute(pollPattern);
  for (const held of polls.splice(0)) {
    await held.fallback();
  }
  await atStep(page, "minting", 20000);
  await shot(page, "answer-lost-minting");
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  expect(wallet.asked("signTx")).toHaveLength(1);
});

test("a minting that must start again (the server wants the wallet's addresses) offers no signature, only Back", async ({
  browser,
  request,
}) => {
  const kasimir = await player(browser, request, "Kasimir", {
    language: DE,
  });
  const { page, item } = kasimir;
  await openItemCard(page);
  await toWalletStep(page);
  const operationId = await markedOperation(request, kasimir, item.id);
  // the server refuses the signature: it needs the wallet's addresses first
  await page.route(/\/chain\/sign\/[^/?]+$/, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 409, json: { error: "ADDRESSES NEEDED" } })
      : route.fallback()
  );
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  const dialog = mintDialog(page);
  const problem = dialog.getByTestId("mint-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_ADDRESSES_NEEDED", {
    timeout: 30000,
  });
  await expect(problem).toContainText(say(DE, "MINT_ADDRESSES_NEEDED"));
  await noWalletPrompts(page);
  // the problem's own Back, which cancels and starts over
  const back = problem.getByTestId("mint-back");
  await expect(back).toBeEnabled();
  await shot(page, "addresses-needed");
  await back.click();
  await expect
    .poll(async () => (await operationOf(request, kasimir, operationId)).state)
    .toBe("cancelled");
  await atStep(page, "costs");
});

test("cancel before signing: on the card and with Back; the item is plain again, and minting again works", async ({
  browser,
  request,
}) => {
  const zeno = await player(browser, request, "Zeno", {
    language: DE,
  });
  const { page, item } = zeno;
  const card = page.getByTestId("item-card");
  const status = card.getByTestId("mint-status");
  // the card of a plain item: Mint, no mark
  const plainCard = async () => {
    await expect(card.getByTestId("mint-open")).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(card.getByTestId("item-minting")).toHaveCount(0);
  };
  await openItemCard(page);
  await toWalletStep(page);
  const first = await markedOperation(request, zeno, item.id);

  // closed on the wallet step: the card waits for the signature, with the minutes left
  await closeDialog(page);
  await expect(mintDialog(page)).toHaveCount(0);
  await shelfTile(page, BARREL).click();
  await expect(status).toHaveAttribute("data-state", "signing");
  await expect(status).toContainText(
    say(DE, "MINT_MARK_WAITING", rules.SIGN_WINDOW_MS / 60000)
  );
  await expect(status.getByTestId("mint-continue")).toBeVisible();
  // on a phone the minutes stay with their unit
  await page.setViewportSize(PHONE_VIEWPORT);
  expect(
    await linesOf(
      status,
      say(DE, "MINT_MARK_WAITING", rules.SIGN_WINDOW_MS / 60000)
        .split(" · ")[1]
        .replace(/^noch./, "")
    )
  ).toBe(1);
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await shot(page, "card-signing");

  // the card's own Cancel: the operation is cancelled and the card is plain again
  await status.getByTestId("mint-cancel").click();
  await plainCard();
  expect((await operationOf(request, zeno, first)).state).toBe("cancelled");
  expect(await markOf(request, zeno, item.id)).toBeNull();
  await shot(page, "card-plain-again");

  // again to the wallet step (the explainer was read: the checklist first); Back there cancels
  await card.getByTestId("mint-open").click();
  await toWalletFromCheck(page);
  const second = await markedOperation(request, zeno, item.id);
  expect(second).not.toBe(first);
  await mintDialog(page).getByTestId("mint-back").click();
  await expect
    .poll(async () => (await operationOf(request, zeno, second)).state)
    .toBe("cancelled");
  await atStep(page, "costs");
  expect((await readiness(request, zeno, item.id)).operation).toBeNull();
  await closeDialog(page);
  await shelfTile(page, BARREL).click();
  await plainCard();
  expect(await markOf(request, zeno, item.id)).toBeNull();

  // minting again works: a new operation, signed, one block
  await card.getByTestId("mint-open").click();
  await toWalletFromCheck(page);
  const third = await markedOperation(request, zeno, item.id);
  expect([first, second]).not.toContain(third);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  expect(await mintedState(request, zeno, item.id)).toBe("minted");
});

test("a cancel's problem stays with its copy: another copy's card does not show it", async ({
  browser,
  request,
}) => {
  const lotte = await player(browser, request, "Lotte", { language: DE });
  const { page, item } = lotte;
  // a second barrel, minted; the first waits for a signature
  const other = await craftItem(request, lotte, BARREL);
  await chainMinted(request, {
    username: lotte.username,
    itemId: other.id,
    to: lotte.keys.baseAddress,
  });
  const answer = await prepareMint(request, lotte, { itemId: item.id });
  expect(answer.status(), await answer.text()).toBe(201);
  const { operation } = await answer.json();
  // the server says the cancel came too late
  await page.route(new RegExp(`/chain/operations/${operation.id}$`), (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 409, json: { error: "OPERATION NOT OPEN" } })
      : route.fallback()
  );
  // the page reads the new state
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page, BARREL);
  const card = page.getByTestId("item-card");
  const chip = (serial) =>
    card.locator(`[data-testid=item-instance][data-serial="${serial}"]`);
  await chip(item.serial).click();
  const status = card.getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "signing");
  await status.getByTestId("mint-cancel").click();
  await expect(card.getByTestId("mint-problem")).toHaveText(
    say(DE, "MINT_CANCEL_TOO_LATE")
  );
  // the minted copy: its mark, without the other copy's problem
  await chip(other.serial).click();
  await expect(status).toHaveAttribute("data-state", "minted");
  await expect(card.getByTestId("mint-problem")).toHaveCount(0);
});

test("the dialog stays open when the connection blips during a mint, and the mint completes", async ({
  browser,
  request,
}) => {
  const mats = await player(browser, request, "Mats", { language: DE });
  const { page, context, item } = mats;
  // the page hears the browser's offline event, and React has drawn what followed
  const goOffline = async () => {
    await page.evaluate(() => {
      window.__wentOffline = new Promise((resolve) =>
        window.addEventListener(
          "offline",
          () =>
            setTimeout(
              () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
              0
            ),
          { once: true }
        )
      );
    });
    await context.setOffline(true);
    await page.evaluate(() => window.__wentOffline);
    await settle(page);
  };
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  await mintDialog(page).getByTestId("mint-next").click();
  await atStep(page, "costs");

  // a blip while Mint now is out: the server may be preparing the minting, the dialog stays
  const mintOut = await holdRequests(page, /\/chain\/mint$/, "POST");
  await mintDialog(page).getByTestId("mint-now").click();
  await mintOut.held;
  await goOffline();
  await expect(mintDialog(page)).toHaveAttribute("data-step", "costs");
  await context.setOffline(false);
  mintOut.release();
  await atStep(page, "wallet", 30000);

  // a blip on the wallet step (the stats just marked the item as being minted: the watcher's
  // code may be loading right then): the game goes on, no crash screen
  await goOffline();
  await expect(mintDialog(page)).toHaveAttribute("data-step", "wallet");
  await expect(page.getByText(say(DE, "ERROR_RECOVERY_TEXT"))).toHaveCount(0);
  await shot(page, "wallet-offline");
  // back online: the mint goes on
  await context.setOffline(false);
  await expect(page.getByText(say(DE, "ERROR_RECOVERY_TEXT"))).toHaveCount(0);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  await chainBlocks(request, 1);
  await atStep(page, "done", 30000);
  expect(await mintedState(request, mats, item.id)).toBe("minted");
});

test("minting is paused: the checklist says so and nothing can be minted", async ({
  browser,
  request,
}) => {
  await chainConfig(request, { paused: true });
  const odo = await player(browser, request, "Odo", { language: DE });
  const { page, item } = odo;
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  await expect(line(page, "chain")).toHaveAttribute("data-met", "false");
  await expect(line(page, "chain")).toContainText(say(DE, "MINT_CHECK_PAUSED"));
  await expect(line(page, "chain")).toContainText(
    say(DE, "MINT_CHECK_PAUSED_TEXT")
  );
  await expect(mintDialog(page).getByTestId("mint-next")).toBeDisabled();
  await expect(
    mintDialog(page).getByTestId("mint-line").first()
  ).toHaveAttribute("data-id", "chain");
  await readBeforeCommit(page, "check", "mint-next");
  await shot(page, "paused");
  const refused = await prepareMint(request, odo, { itemId: item.id });
  expect(refused.status()).toBe(503);
  expect(await refused.json()).toEqual({ error: "CHAIN PAUSED" });
  expect(await mintedState(request, odo, item.id)).toBeNull();
});

test("no mints left today: the checklist says so", async ({
  browser,
  request,
}) => {
  test.slow();
  const ugo = await player(browser, request, "Ugo", {
    language: DE,
    lovelace: 100_000_000,
  });
  const { page } = ugo;
  const minted = [ugo.item];
  for (let i = 1; i < rules.MINTS_PER_DAY; i++) {
    minted.push(await craftItem(request, ugo, BARREL));
  }
  const last = await craftItem(request, ugo, "TURBO_CONVEYOR");
  // the server counts the day's mints on the real clock's UTC day: close to midnight UTC the
  // test waits for the new day (at most a minute), as mintApi.spec.js's limit test does
  const DAY_MS = 24 * 60 * 60 * 1000;
  const utcDay = () => Math.floor(Date.now() / DAY_MS);
  const untilMidnight = (utcDay() + 1) * DAY_MS - Date.now();
  if (untilMidnight < 120000) {
    test.setTimeout(test.info().timeout + untilMidnight + 10000);
    await page.waitForTimeout(untilMidnight + 1000);
  }
  const day = utcDay();
  for (const item of minted) {
    await mintThroughApi(page, request, ugo, item, { final: true });
  }
  expect((await readiness(request, ugo, last.id)).mintsLeftToday).toBe(0);
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page, "TURBO_CONVEYOR");
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  await expect(line(page, "limit")).toHaveAttribute("data-met", "false");
  await expect(line(page, "limit")).toContainText(
    say(DE, "MINT_CHECK_NONE_LEFT")
  );
  await expect(line(page, "limit")).toContainText(
    say(DE, "MINT_CHECK_NONE_LEFT_TEXT", rules.MINTS_PER_DAY)
  );
  await expect(mintDialog(page).getByTestId("mint-next")).toBeDisabled();
  // the reason Continue is grey comes first, and is in view with it
  await expect(
    mintDialog(page).getByTestId("mint-line").first()
  ).toHaveAttribute("data-id", "limit");
  await readBeforeCommit(page, "check", "mint-next");
  await shot(page, "limit");
  expect(utcDay(), "the mints and the checklist fell on two UTC days").toBe(
    day
  );
});

test("the chain is off on the server: no Mint, and not one chain request even for a mint in flight", async ({
  browser,
  request,
}) => {
  const gesa = await player(browser, request, "Gesa", {
    language: DE,
  });
  const { page, item } = gesa;
  // a mint in flight (signed and sent, no block yet): with minting on, the game's watcher would
  // follow it
  const prepared = await prepareMint(request, gesa, {
    itemId: item.id,
    addresses: await walletAddressesOf(page),
  });
  expect(prepared.status(), await prepared.text()).toBe(201);
  const { tx, signCode } = await prepared.json();
  const signed = await walletSignTx(page, tx);
  expect(
    (await submitWitness(request, signCode, signed.witness)).status()
  ).toBe(200);
  expect(await markOf(request, gesa, item.id)).toMatchObject({
    state: "minting",
    signing: false,
  });

  // the server's minting switch is off; the page's clock jumps past every poll's gap
  let statusAsked = 0;
  await page.route(/\/chain\/status$/, (route) => {
    statusAsked += 1;
    return route.fulfill({ json: { enabled: false } });
  });
  const chainCalls = [];
  page.on("request", (sent) => {
    const url = new URL(sent.url());
    if (
      url.pathname.startsWith("/chain/") &&
      url.pathname !== "/chain/status"
    ) {
      chainCalls.push(`${sent.method()} ${url.pathname}`);
    }
  });
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page);
  await expect.poll(() => statusAsked).toBe(1);
  const card = page.getByTestId("item-card");
  await expect(card).toContainText(say(DE, "ITEM_SERIAL", item.serial));
  // the card: the item's pulsing rim (it is being minted), but no Mint and no minting box
  await expect(card.getByTestId("item-minting")).toBeVisible();
  await expect(card.getByTestId("mint-open")).toHaveCount(0);
  await expect(card.getByTestId("mint-status")).toHaveCount(0);
  await shot(page, "chain-off");
  for (const gap of [6000, 31000, 31000]) {
    await page.clock.fastForward(gap);
    await settle(page);
  }
  await page.waitForLoadState("networkidle");
  expect(chainCalls).toEqual([]);
  // asked once a session
  expect(statusAsked).toBe(1);
  // the mint lands, here and not in the next test
  await chainBlocks(request, 1);
});

test("French on a phone: the costs and the wallet step's buttons fit on one line", async ({
  browser,
  request,
}) => {
  const tilda = await player(browser, request, "Tilda", {
    language: "fr",
    device: { viewport: PHONE_VIEWPORT },
  });
  const { page } = tilda;
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  // at 1280×720 the French checklist and costs fit, or show that there is more
  expect(await fitsOrCues(page, "check", "mint-next", "fr")).toBe(true);
  await mintDialog(page).getByTestId("mint-next").click();
  await atStep(page, "costs");
  await expect(mintDialog(page).getByTestId("mint-now")).toHaveText(
    say("fr", "MINT_NOW")
  );
  expect(await fitsOrCues(page, "costs", "mint-now", "fr")).toBe(true);

  const fits = async (texts) => {
    const measures = await buttonMeasures(mintDialog(page));
    for (const text of texts) {
      // (innerText as shown: the game's buttons are upper case)
      const measure = measures.find(
        (entry) => entry.text.toLowerCase() === text.toLowerCase()
      );
      expect(measure, `${text}: ${JSON.stringify(measures)}`).toBeTruthy();
      expect(measure.lines, `${text} on one line`).toBe(1);
      expect(measure.overflows, `${text} inside its button`).toBe(false);
      expect(measure.height, `${text} 44 px high`).toBeGreaterThanOrEqual(44);
    }
    for (const measure of measures) {
      expect(measure.overflows, JSON.stringify(measure)).toBe(false);
    }
  };
  await shot(page, "fr-costs", { kind: "phone" });
  await fits([say("fr", "MINT_NOW"), say("fr", "MINT_BACK")]);

  await mintDialog(page).getByTestId("mint-now").click();
  await atStep(page, "wallet", 30000);
  await shot(page, "fr-wallet", { kind: "phone" });
  await fits([say("fr", "MINT_OPEN_WALLET"), say("fr", "MINT_BACK")]);
  // the wallet box's labels stay on one line
  const box = mintDialog(page).getByTestId("mint-wallet-box");
  expect(await linesOf(box, say("fr", "MINT_YOU_GIVE"))).toBe(1);
  expect(await linesOf(box, say("fr", "MINT_YOU_GET"))).toBe(1);
});

test("a short window: the scroll area shows that more is below, and above once scrolled; Vietnamese at 1280×720", async ({
  browser,
  request,
}) => {
  const ilse = await player(browser, request, "Ilse", { language: "vi" });
  const { page } = ilse;
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  expect(await fitsOrCues(page, "check", "mint-next", "vi")).toBe(true);
  await mintDialog(page).getByTestId("mint-next").click();
  await atStep(page, "costs");
  expect(await fitsOrCues(page, "costs", "mint-now", "vi")).toBe(true);
  // nothing hidden, no cue
  expect(await cueOf(page)).toEqual({ below: "false", above: "false" });

  // a window too short for the costs: the cue below, the button still in view
  await page.setViewportSize({ width: 1280, height: 560 });
  await settle(page);
  await expect(mintDialog(page).getByTestId("mint-scroll")).toHaveAttribute(
    "data-more-below",
    "true"
  );
  expect(await cueOf(page)).toEqual({ below: "true", above: "false" });
  expect(await wholeInView(mintDialog(page).getByTestId("mint-now"))).toBe(
    true
  );
  // scrolled to the end: no cue below, one above
  await mintDialog(page)
    .getByTestId("mint-scroll")
    .evaluate((area) => {
      area.scrollTop = area.scrollHeight;
    });
  await expect(mintDialog(page).getByTestId("mint-scroll")).toHaveAttribute(
    "data-more-below",
    "false"
  );
  expect(await cueOf(page)).toEqual({ below: "false", above: "true" });
});

// ---------------------------------------------------------------------------------------------
// The fix wave after the whole-branch review (C-…: the client seat's findings)

// this tab's sign code of operation `id` (sessionStorage), or null
const tabCode = (page, id) =>
  page.evaluate(
    (key) => window.sessionStorage.getItem(key),
    `battlechoc.mintSign.${id}`
  );

test("a desktop without the linked wallet's extension: the checklist says where to mint, and nothing is prepared", async ({
  browser,
  request,
}) => {
  // Eternl was linked (as from a phone through the QR code), but this browser has no wallet
  const nele = await player(browser, request, "Nele", {
    language: DE,
    wallet: false,
  });
  const { page, item } = nele;
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  const walletLine = line(page, "wallet");
  await expect(walletLine).toHaveAttribute("data-met", "false");
  await expect(walletLine).toContainText(say(DE, "MINT_CHECK_ELSEWHERE"));
  await expect(walletLine).toContainText(
    say(DE, "MINT_CHECK_ELSEWHERE_TEXT", "Eternl")
  );
  // the reason Continue is grey comes first, and is in view with it
  await expect(
    mintDialog(page).getByTestId("mint-line").first()
  ).toHaveAttribute("data-id", "wallet");
  await expect(mintDialog(page).getByTestId("mint-next")).toBeDisabled();
  await readBeforeCommit(page, "check", "mint-next");
  await shot(page, "elsewhere");
  // nothing was prepared, the item is free
  expect((await readiness(request, nele, item.id)).operation).toBeNull();
  expect(await markOf(request, nele, item.id)).toBeNull();
  // the player enables Eternl's extension now: Check again reads the browser's wallets anew
  // (D47), and the line is met
  await page.evaluate(() => {
    window.cardano = {
      eternl: {
        name: "eternl",
        apiVersion: "0.1.0",
        enable: async () => {
          throw { code: -3, info: "not asked in this test" };
        },
        isEnabled: async () => false,
      },
    };
  });
  await mintDialog(page).getByTestId("mint-recheck").click();
  await expect(walletLine).toHaveAttribute("data-met", "true");
  await expect(walletLine).toContainText(say(DE, "MINT_CHECK_WALLET"));
});

test("a minting dialog whose chunk does not arrive says that it loads, and one closed meanwhile does not open by itself", async ({
  browser,
  request,
}) => {
  const odette = await player(browser, request, "Odette", { language: DE });
  const { page } = odette;
  // the dialog's chunk does not arrive (a phone without a connection, a deploy that replaced it)
  let failing = true;
  let served = 0;
  await page.route(/\/assets\/MintDialog-[^/]+\.js$/, (route) => {
    if (failing) {
      return route.abort("internetdisconnected");
    }
    served += 1;
    return route.fallback();
  });
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  // the tap shows the dialog's frame at once, with its close
  const waiting = page.getByTestId("chunk-waiting");
  await expect(waiting).toHaveText(say(DE, "MINT_LOADING"));
  await expect(page.getByText(say(DE, "MINT_CHECK_TITLE"))).toBeVisible();
  await expect(page.getByText(say(DE, "ERROR_RECOVERY_TEXT"))).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(waiting).toHaveCount(0);
  // the chunk arrives on a later try: the dialog the player closed stays closed
  failing = false;
  await expect.poll(() => served, { timeout: 20000 }).toBe(1);
  await settle(page);
  await expect(mintDialog(page)).toHaveCount(0);
  await expect(waiting).toHaveCount(0);
  // asked for again, it opens
  await shelfTile(page).click();
  await expect(page.getByTestId("item-card")).toBeVisible();
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
});

test("Mint now's answer after the dialog stopped waiting: its sign code is kept, and the dialog opened again signs with it", async ({
  browser,
  request,
}) => {
  const bruno = await player(browser, request, "Bruno", { language: DE });
  const { page, item, wallet } = bruno;
  // the dialog waits 20 s for Mint now's answer: the page's clock jumps instead of the test
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page);
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await atStep(page, "check");
  await mintDialog(page).getByTestId("mint-next").click();
  await atStep(page, "costs");
  // the server prepares the minting at once; its answer reaches the page when the test says so
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let answered;
  const preparedAnswer = new Promise((resolve) => {
    answered = resolve;
  });
  await page.route(/\/chain\/mint$/, async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    const response = await route.fetch();
    answered(await response.json());
    await gate;
    return route.fulfill({ response });
  });
  await mintDialog(page).getByTestId("mint-now").click();
  const answer = await preparedAnswer;
  expect(answer.operation.state).toBe("prepared");
  const operationId = answer.operation.id;
  await page.clock.fastForward(21000);
  const problem = mintDialog(page).getByTestId("mint-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_ANSWER_LOST");

  // closed: the card reads the stats again, and shows the minting waiting for a signature
  await closeDialog(page);
  await expect(mintDialog(page)).toHaveCount(0);
  await shelfTile(page, BARREL).click();
  const status = page.getByTestId("item-card").getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "signing");
  // opened again before the answer arrived: this tab has no code for it yet
  await status.getByTestId("mint-continue").click();
  await atStep(page, "wallet");
  await expect(problem).toHaveAttribute("data-key", "MINT_RESUME_LOST");
  // signing is ruled out until the code comes: the problem, the wallet box, its Cancel (D47)
  await noWalletPrompts(page);
  await expect(problem.getByTestId("mint-cancel")).toBeEnabled();
  expect(await tabCode(page, operationId)).toBeNull();

  // the late answer: its code is this tab's, and the open dialog takes it
  release();
  await expect(problem).toHaveCount(0);
  await expect(mintDialog(page).getByTestId("mint-open-wallet")).toBeEnabled();
  expect(await tabCode(page, operationId)).toBe(answer.signCode);
  await shot(page, "late-answer");
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  expect(wallet.asked("signTx")).toHaveLength(1);
  await chainBlocks(request, 1);
  await page.clock.fastForward(6000);
  await atStep(page, "done", 20000);
  expect(await mintedState(request, bruno, item.id)).toBe("minted");
});

test("a reload on the wallet step: the card's Continue, and Open wallet signs with this tab's code", async ({
  browser,
  request,
}) => {
  const cora = await player(browser, request, "Cora", { language: DE });
  const { page, item, wallet } = cora;
  await openItemCard(page);
  await toWalletStep(page);
  const operationId = await markedOperation(request, cora, item.id);
  expect(await tabCode(page, operationId)).toBeTruthy();
  await page.reload({ waitUntil: "networkidle" });
  await openItemCard(page);
  const status = page.getByTestId("item-card").getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "signing");
  await status.getByTestId("mint-continue").click();
  await atStep(page, "wallet");
  // the code this tab kept: no "cannot sign here", Open wallet as before the reload
  await expect(mintDialog(page).getByTestId("mint-problem")).toHaveCount(0);
  await expect(mintDialog(page).getByTestId("mint-open-wallet")).toBeEnabled();
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  await atStep(page, "minting", 30000);
  expect(wallet.asked("signTx")).toHaveLength(1);
  // signed: the tab lets go of the code
  expect(await tabCode(page, operationId)).toBeNull();
  await chainBlocks(request, 1);
  await atStep(page, "done", 20000);
  expect(await mintedState(request, cora, item.id)).toBe("minted");
});

test("a second page on the same minting cannot sign it, but can cancel it", async ({
  browser,
  request,
}) => {
  const dario = await player(browser, request, "Dario", { language: DE });
  const { page, context, item, wallet } = dario;
  await openItemCard(page);
  await toWalletStep(page);
  const operationId = await markedOperation(request, dario, item.id);
  // another tab of the same browser: the same player, but not this tab's sign code
  const second = await context.newPage();
  await second.goto("/", { waitUntil: "networkidle" });
  await openItemCard(second);
  const status = second.getByTestId("item-card").getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "signing");
  await status.getByTestId("mint-continue").click();
  await atStep(second, "wallet");
  const problem = mintDialog(second).getByTestId("mint-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_RESUME_LOST");
  await expect(problem).toContainText(say(DE, "MINT_RESUME_LOST"));
  // this tab cannot sign: no prompts, no grey Open wallet, no Back; the problem's Cancel (D47)
  await noWalletPrompts(second);
  await expect(mintDialog(second).getByTestId("mint-back")).toHaveCount(0);
  const cancel = problem.getByTestId("mint-cancel");
  await expect(cancel).toBeEnabled();
  await shot(second, "second-tab");
  await cancel.click();
  await expect
    .poll(async () => (await operationOf(request, dario, operationId)).state)
    .toBe("cancelled");
  await atStep(second, "nothing");
  // the first tab hears of it through its poll: nothing happened, and no wallet was asked
  await atStep(page, "nothing", 20000);
  await expect(mintDialog(page).getByTestId("mint-problem")).toHaveAttribute(
    "data-key",
    "MINT_WAS_CANCELLED"
  );
  expect(wallet.asked("signTx")).toEqual([]);
  expect(await markOf(request, dario, item.id)).toBeNull();
});

test("a wallet on another network at Open wallet: said so, and nothing is signed", async ({
  browser,
  request,
}) => {
  const elli = await player(browser, request, "Elli", {
    language: DE,
    wallet: { networkId: 1 },
  });
  const { page, item, wallet } = elli;
  await openItemCard(page);
  await toWalletStep(page);
  const operationId = await markedOperation(request, elli, item.id);
  await mintDialog(page).getByTestId("mint-open-wallet").click();
  const problem = mintDialog(page).getByTestId("mint-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_WRONG_NETWORK", {
    timeout: 30000,
  });
  await expect(problem).toHaveText(
    say(DE, "MINT_WRONG_NETWORK", "Eternl", "Preprod")
  );
  await atStep(page, "wallet");
  // asked for its network, never to sign anything
  expect(wallet.asked("signTx")).toEqual([]);
  expect(wallet.asked("signData")).toEqual([]);
  expect((await operationOf(request, elli, operationId)).state).toBe(
    "prepared"
  );
  expect((await chainState(request)).mempool).toEqual([]);
  await shot(page, "wrong-network");
});

test("the sign page: Try again when the server cannot be reached and while no wallet is there; a page that is no minting sends to battlechoc", async ({
  browser,
}) => {
  const context = keep(
    await browser.newContext({ ...ANDROID_PHONE, locale: "de-DE" })
  );
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const page = await context.newPage();
  const info = {
    kind: "mint",
    operationId: "d7f82642-e5c8-4876-85fe-796938dc0a50",
    ownerConfirmed: false,
    item: { item: BARREL, serial: 3 },
    tx: "84a400",
    network: "preprod",
    costs: {
      networkFee: 400000,
      gameFee: { asset: "lovelace", label: "ADA", amount: 2000000 },
      deposit: 3000000,
      deposits: { reference: 1800000, user: 1200000 },
    },
    subject: `stake:${"ab".repeat(28)}`,
    address: "addr_test1qq",
    signUntil: new Date(Date.now() + 600000).toISOString(),
  };
  // the server's answers to GET /chain/sign/:code, one per request
  const answers = [
    (route) => route.abort("internetdisconnected"),
    (route) => route.fulfill({ json: info }),
    // a kind this build does not sign (a burn is signed since plan E)
    (route) => route.fulfill({ json: { ...info, kind: "trade" } }),
  ];
  let asked = 0;
  await page.route(/\/chain\/sign\/[^/?]+$/, (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    const answer = answers[Math.min(asked, answers.length - 1)];
    asked += 1;
    return answer(route);
  });
  await page.goto("/sign/?code=abc", { waitUntil: "networkidle" });
  const problem = page.getByTestId("mint-sign-problem");
  await expect(problem).toHaveAttribute("data-key", "MINT_UNAVAILABLE");
  const again = page.getByTestId("mint-sign-again");
  await expect(again).toHaveText(say(DE, "MINT_AGAIN"));

  // again: the minting, but no wallet in this browser (after its 3 s): Try again once more
  await again.click();
  await expect(problem).toHaveAttribute("data-key", "LINK_NO_WALLET", {
    timeout: 10000,
  });
  expect(asked).toBe(2);
  await expect(page.getByTestId("mint-sign-costs")).toBeVisible();
  await expect(page.getByTestId("mint-sign-give")).toHaveText(
    givenAboutDe("4200000")
  );
  await expect(page.getByTestId("mint-sign-stays")).toHaveText(
    say(DE, "MINT_GET_DEPOSIT", keptAboutDe("1200000"))
  );
  await expect(again).toBeVisible();
  // the box keeps to the page's width: the item and what stays with it wrap inside it
  expect(
    await page.getByTestId("mint-sign-change").evaluate((box) =>
      [...box.querySelectorAll("*")]
        .map((node) => {
          const outer = box.getBoundingClientRect();
          const inner = node.getBoundingClientRect();
          return (
            inner.right <= outer.right + 0.5 && inner.left >= outer.left - 0.5
          );
        })
        .every(Boolean)
    )
  ).toBe(true);
  await shot(page, "sign-page-no-wallet", { kind: "phone" });

  // a sign info of another kind (a cached page of a later version): only the way back
  await again.click();
  await expect(page.locator("body")).toContainText(
    say(DE, "MINT_SIGN_OTHER_KIND")
  );
  expect(asked).toBe(3);
  await expect(page.getByTestId("mint-sign-costs")).toHaveCount(0);
  await expect(page.getByTestId("mint-sign-wallet")).toHaveCount(0);
  await expect(page.getByTestId("mint-sign-again")).toHaveCount(0);
});
