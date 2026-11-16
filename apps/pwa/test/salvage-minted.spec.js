import { test, expect } from "@playwright/test";
import { Address, KeyHash } from "@evolution-sdk/evolution";
import { ANDROID_PHONE } from "./helpers/players.js";
import { nodeKeys, signAs } from "./helpers/cardano.js";
import { fakeWallet } from "./helpers/wallet.js";
import { craftItem, statsOf } from "./helpers/lab.js";
import {
  chainBlocks,
  chainBurn,
  chainFund,
  chainMove,
  chainReset,
  chainRollback,
  chainState,
  mintingPlayer,
  mintThroughApi,
  operationOf,
} from "./helpers/chain.js";
import {
  PHONE_VIEWPORT,
  adaIn,
  closeContexts,
  keep,
  line,
  markOf,
  mintDialog,
  openItemCard,
  say,
  settle,
  wholeInView,
} from "./helpers/mint.js";
import {
  atSalvageStep,
  mintedPlayer,
  pantryOf,
  salvageDialog,
  shot,
  tokensOf,
} from "./helpers/salvage.js";

// The salvage of a minted item in the browser (plan E, Task 5): the item card, the salvage's
// dialog, the sign page and the title screen's notice against the browser tests' API, which
// burns for real on the chain double and credits the ingredients with its real watcher once the
// burn is final (CHAIN_K_FINAL blocks; every /test/chain POST runs the watcher). Each test
// asserts the state behind what the player sees: the operation, the item's mark, the tokens on
// the double, the pantry. Screens are shot for the owner with MINT_SHOTS_DIR (helpers/salvage.js
// shot: German, two French), at 1280×720 and 390×844, and on a phone.

const DE = "de";
const FR = "fr";
const TURBO = "TURBO_CONVEYOR";
// the turbo conveyor's recipe (recipes.sample.json: MILK 5, VANILLA 2, GOLDLEAF 1), salvaged
// minted: the legendary and the rare in full, the milk halved
const RETURNS = { GOLDLEAF: 1, VANILLA: 2, MILK: 2 };

// each test mints its item to final first (CHAIN_K_FINAL blocks) and then burns it to final
test.describe.configure({ timeout: 300000 });

test.afterEach(async ({ request }) => {
  await closeContexts();
  await chainReset(request);
});

const card = (page) => page.getByTestId("item-card");

// the shelf's card of the turbo conveyor, from the title screen or from inside the Choclab
const turboCard = async (page) => {
  if (await page.getByTestId("lab").isVisible()) {
    if (!(await page.getByTestId("item-shelf").isVisible())) {
      await page.getByTestId("item-shelf-tab").click();
    }
    await page
      .locator(`[data-testid=item-tile][data-item="${TURBO}"]`)
      .first()
      .click();
    await expect(card(page)).toBeVisible();
  } else {
    await openItemCard(page, TURBO);
  }
};

// from the item card to the confirmation
const toConfirm = async (page) => {
  await turboCard(page);
  await expect(card(page).getByTestId("item-salvage")).toHaveAttribute(
    "data-kind",
    "minted"
  );
  await card(page).getByTestId("item-salvage").click();
  await atSalvageStep(page, "confirm");
};

// from the confirmation to the wallet step (Yes, salvage)
const toWallet = async (page) => {
  await salvageDialog(page).getByTestId("salvage-confirm-button").click();
  await atSalvageStep(page, "wallet", 30000);
};

// the operation of the item as its mark names it
const operationIdOf = async (request, who) =>
  (await markOf(request, who, who.item.id)).operationId;

// the pantry `after` less `before`, the ingredients that changed
const gained = (before, after) =>
  Object.fromEntries(
    Object.keys({ ...before, ...after })
      .map((key) => [key, (after[key] || 0) - (before[key] || 0)])
      .filter(([, amount]) => amount !== 0)
  );

// everything the confirmation says before Yes, and Yes itself, in view without scrolling at the
// page's size and at a phone's
const confirmInView = async (page) => {
  const dialog = salvageDialog(page);
  const parts = [
    dialog.getByText(say(DE, "SALVAGE_MINTED_INTRO")),
    ...(await dialog.getByTestId("salvage-row").all()),
    dialog.getByTestId("salvage-deposit"),
    dialog.getByText(say(DE, "SALVAGE_MINTED_WHEN")),
    dialog.getByTestId("salvage-advantage"),
    dialog.getByTestId("salvage-wallet"),
    dialog.getByTestId("salvage-confirm-button"),
  ];
  const size = page.viewportSize();
  for (const viewport of [size, PHONE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await settle(page);
    const missing = [];
    for (const [index, part] of parts.entries()) {
      if (!(await wholeInView(part))) {
        missing.push(index);
      }
    }
    expect(missing, `${viewport.width}×${viewport.height}`).toEqual([]);
  }
  await page.setViewportSize(size);
  await settle(page);
};

// holds every `method` request to `pattern` until released: { held (the first), release }
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

// the fake wallet's calls from now on (the mint before the test made some): { calls(), asked(method) }
const fromNow = (wallet) => {
  const start = wallet.calls.length;
  const calls = () => wallet.calls.slice(start);
  return {
    calls,
    asked: (method) => calls().filter((call) => call.method === method),
  };
};

// the bodies of the game's POST /chain/burn
const burnRequests = (page) => {
  const bodies = [];
  page.on("request", (sent) => {
    if (
      sent.method() === "POST" &&
      new URL(sent.url()).pathname === "/chain/burn"
    ) {
      bodies.push(sent.postDataJSON());
    }
  });
  return bodies;
};

// back from the Choclab to the title screen
const toTitle = async (page) => {
  // the Hud's back button: the visible one outside the lab (the lab has back arrows of its own)
  const backs = page.locator("[data-icon=back]:visible");
  for (let index = 0; index < (await backs.count()); index += 1) {
    const back = backs.nth(index);
    if (await back.evaluate((button) => !button.closest("[data-testid=lab]"))) {
      await back.click({ timeout: 10000 });
      break;
    }
  }
  await expect(page.getByTestId("lab")).toHaveCount(0);
};

test("the extension path: the confirmation, the wallet, being salvaged, then the ingredients on the shelf and in a notice", async ({
  browser,
  request,
}) => {
  const salma = await mintedPlayer(browser, request, "Salma", {
    equip: true,
    language: DE,
  });
  const { page, wallet, item, assetName } = salma;
  const signs = fromNow(wallet);
  const pantryBefore = await pantryOf(request, salma);
  const burns = burnRequests(page);

  // the card of the minted item: its stamp, Equip and Salvage; the Choclab (on the factory)
  // counts it in its slot and its budget
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "minted"
  );
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    TURBO
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "5");
  await expect(card(page).getByTestId("item-salvage")).toBeVisible();
  await shot(page, "card-minted");

  // Salvage: what is destroyed, what comes back and when, what it costs, which wallet signs
  await card(page).getByTestId("item-salvage").click();
  await atSalvageStep(page, "confirm");
  const dialog = salvageDialog(page);
  const confirm = dialog.getByTestId("salvage-confirm");
  await expect(confirm).toHaveAttribute("data-kind", "minted");
  const rows = confirm.getByTestId("salvage-row");
  await expect(rows).toHaveCount(3);
  expect(
    await rows.evaluateAll((all) =>
      all.map((row) => [
        row.dataset.ingredient,
        row.dataset.amount,
        row.dataset.rule,
      ])
    )
  ).toEqual([
    ["GOLDLEAF", "1", "full"],
    ["VANILLA", "2", "full"],
    ["MILK", "2", "half"],
  ]);
  await expect(rows.nth(0)).toContainText(say(DE, "SALVAGE_LEGENDARY_FULL"));
  await expect(rows.nth(1)).toContainText(say(DE, "SALVAGE_RARE_FULL"));
  await expect(rows.nth(2)).toContainText(say(DE, "SALVAGE_HALF"));
  // the deposit that comes back: the estimate of its reference part, never the 3.72 of both
  const deposit = confirm.getByTestId("salvage-deposit");
  await expect(deposit).toContainText(say(DE, "SALVAGE_DEPOSIT"));
  await expect(deposit).toContainText(
    say(DE, "MINT_ABOUT", adaIn(DE, "2450000", { round: "down" }), "ADA")
  );
  await expect(deposit).not.toContainText("3,72");
  await expect(confirm.getByTestId("salvage-advantage")).toContainText(
    say(DE, "SALVAGE_MINTED_COMPARE", `1 ${say(DE, "INGREDIENT_VANILLA")}`)
  );
  await expect(confirm.getByTestId("salvage-wallet")).toContainText(
    say(DE, "SALVAGE_MINTED_WALLET", adaIn(DE, "410000"))
  );
  await expect(confirm.getByTestId("salvage-wallet")).toContainText("Eternl");
  await expect(confirm).toContainText(say(DE, "SALVAGE_MINTED_INTRO"));
  await expect(confirm).toContainText(say(DE, "SALVAGE_MINTED_WHEN"));
  // equipped: it is taken off
  await expect(confirm.getByTestId("salvage-unequips")).toBeVisible();
  await confirmInView(page);
  // nothing asked of the wallet, nothing prepared before Yes
  expect(signs.calls()).toEqual([]);
  expect(burns).toEqual([]);
  await shot(page, "confirm");

  // Yes: the wallet's own addresses with the burn, the exact amounts of the built burn
  await toWallet(page);
  expect(burns).toEqual([
    { itemId: item.id, subject: salma.subject, addresses: salma.addresses },
  ]);
  const operationId = await operationIdOf(request, salma);
  const prepared = await operationOf(request, salma, operationId);
  expect(prepared).toMatchObject({
    kind: "burn",
    state: "prepared",
    ownerConfirmed: true,
  });
  expect(await markOf(request, salma, item.id)).toMatchObject({
    state: "minted",
    signing: true,
    kind: "burn",
    operationId,
  });
  const { networkFee, deposits } = prepared.costs;
  await expect(dialog.getByTestId("salvage-give")).toHaveText(
    say(DE, "SALVAGE_GIVE_ITEM", say(DE, `ITEM_${TURBO}`), item.serial)
  );
  await expect(dialog.getByTestId("salvage-get")).toContainText(
    say(
      DE,
      "MINT_AMOUNT",
      `+${adaIn(DE, String(deposits.reference - networkFee), { exact: true })}`,
      "ADA"
    )
  );
  await expect(dialog.getByTestId("salvage-fee")).toHaveText(
    say(
      DE,
      "SALVAGE_FEE_DEDUCTED",
      say(
        DE,
        "MINT_AMOUNT",
        adaIn(DE, String(networkFee), { exact: true }),
        "ADA"
      )
    )
  );
  await expect(dialog.getByTestId("salvage-free")).toContainText(
    adaIn(DE, String(deposits.user), { exact: true })
  );
  expect(signs.asked("signTx")).toEqual([]);
  await shot(page, "wallet");

  // Open wallet: the signature is held at the server's door, so the waiting step shows
  const signing = await holdRequests(page, /\/chain\/sign\/[^/?]+$/, "POST");
  await dialog.getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "sign");
  await signing.held;
  await shot(page, "sign");
  signing.release();

  // signed: being salvaged; the deposit comes back with it, the ingredients later
  await atSalvageStep(page, "running", 30000);
  expect(signs.asked("signTx")).toHaveLength(1);
  expect(signs.asked("signTx")[0].partial).toBe(true);
  await expect(dialog.getByTestId("salvage-running")).toContainText(
    say(DE, "SALVAGE_MINTED_DEPOSIT_BACK")
  );
  await expect(dialog.getByTestId("salvage-running")).toContainText(
    say(DE, "SALVAGE_MINTED_FEW_MINUTES")
  );
  expect((await operationOf(request, salma, operationId)).state).toBe(
    "submitted"
  );
  expect(await markOf(request, salma, item.id)).toMatchObject({
    state: "burning",
    operationId,
  });
  await shot(page, "running");

  // Keep playing: the card says it is being salvaged and offers nothing
  await dialog.getByTestId("salvage-play-on").click();
  await expect(salvageDialog(page)).toHaveCount(0);
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "burning"
  );
  await expect(card(page).getByTestId("mint-status")).toHaveText(
    say(DE, "ITEM_BURNING")
  );
  for (const id of ["item-equip", "item-salvage", "item-remove"]) {
    await expect(card(page).getByTestId(id)).toHaveCount(0);
  }
  await shot(page, "card-burning");
  await card(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();
  // the Choclab counts it for nothing while it is being salvaged, as the server and the matches
  // do: its slot is empty, the budget 5 lower, and no slot says "over budget"
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    ""
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "0");
  await expect(
    page.locator("[data-testid^=equipment-slot-][data-inactive=true]")
  ).toHaveCount(0);
  for (const index of [0, 1]) {
    await expect(
      page.getByTestId(`equipment-slot-${index}`)
    ).not.toHaveAttribute(
      "aria-label",
      new RegExp(
        say(DE, "LAB_OVER_BUDGET").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      )
    );
  }
  await shot(page, "lab-burning");

  // one block: both tokens are burned, the ADA is back; nothing credited before it is final
  await page.clock.install();
  await chainBlocks(request, 1);
  expect(await tokensOf(request, assetName)).toEqual({
    user: [],
    reference: [],
  });
  expect((await operationOf(request, salma, operationId)).state).toBe(
    "included"
  );
  const { kFinal } = await chainState(request);
  await chainBlocks(request, kFinal - 1);
  expect(gained(pantryBefore, await pantryOf(request, salma))).toEqual({});
  await chainBlocks(request, 1);
  expect((await operationOf(request, salma, operationId)).state).toBe("final");
  // credited once: the ingredients by today's recipe, the item gone
  expect(gained(pantryBefore, await pantryOf(request, salma))).toEqual(RETURNS);
  expect(
    (await statsOf(request, salma)).items.map((entry) => entry.id)
  ).not.toContain(item.id);

  // the game hears of it by itself (the watcher follows the burn in its block every 30 s): the
  // shelf no longer has it, and the title screen shows what came back
  await page.clock.fastForward(31000);
  await expect(
    page.locator(`[data-testid=item-tile][data-item="${TURBO}"]`)
  ).toHaveCount(0, { timeout: 15000 });
  await toTitle(page);
  const notice = page.getByTestId("item-notice");
  await expect(notice).toHaveAttribute("data-kind", "salvaged", {
    timeout: 15000,
  });
  await expect(notice.getByTestId("salvage-arrived")).toBeVisible();
  await expect(notice).toContainText(
    say(DE, "SALVAGE_ARRIVED_FROM", say(DE, `ITEM_${TURBO}`), item.serial)
  );
  const arrived = notice.getByTestId("salvage-arrived-row");
  expect(
    await arrived.evaluateAll((all) =>
      Object.fromEntries(
        all.map((row) => [row.dataset.ingredient, Number(row.dataset.amount)])
      )
    )
  ).toEqual(RETURNS);
  await expect(
    arrived.filter({ hasText: say(DE, "INGREDIENT_GOLDLEAF") })
  ).toContainText(say(DE, "SALVAGE_FRESH_FOR", "3 d"));
  await shot(page, "arrived");
  const seen = page.waitForResponse(
    (answer) =>
      answer.url().endsWith("/user/notices/seen") &&
      answer.request().method() === "POST"
  );
  await notice.getByTestId("item-notice-shelf").click();
  expect((await seen).status()).toBe(204);
  // the Choclab opens with its pantry, where the ingredients now are
  await expect(page.getByTestId("lab")).toBeVisible();
  await expect(page.getByTestId("pantry")).toBeVisible();
});

test("the phone path: the sign page shows the burn, the wallet proves its addresses, then signs", async ({
  browser,
  request,
}) => {
  const pia = await mintedPlayer(browser, request, "Pialotta", {
    wallet: false,
    device: ANDROID_PHONE,
    language: DE,
  });
  const { page, item, walletContext, appWallet } = pia;
  await page.evaluate(() => {
    window.__battlechocRecordDeepLinks = true;
  });
  const burns = burnRequests(page);
  await toConfirm(page);
  await confirmInView(page);
  await shot(page, "phone-confirm", { kind: "phone" });

  // no wallet in this browser: the burn is prepared for the holder, without addresses
  await toWallet(page);
  expect(burns).toEqual([{ itemId: item.id, subject: pia.subject }]);
  const dialog = salvageDialog(page);
  await expect(dialog).toContainText(
    say(DE, "SALVAGE_WALLET_TEXT_UNCONFIRMED")
  );
  await expect(dialog).toContainText(say(DE, "SALVAGE_SIGN_TWICE"));
  // before the wallet vouched for its addresses nothing of the burn is named the wallet's
  await expect(dialog.getByTestId("salvage-get")).toBeVisible();
  await expect(dialog.getByTestId("salvage-free")).toHaveCount(0);
  const operationId = await operationIdOf(request, pia);
  expect(await operationOf(request, pia, operationId)).toMatchObject({
    kind: "burn",
    state: "prepared",
    ownerConfirmed: false,
  });
  await shot(page, "phone-wallet", { kind: "phone" });

  // Open wallet: the door; Eternl opens the sign page
  await dialog.getByTestId("salvage-open-wallet").click();
  const door = page.getByTestId("wallet-door");
  await expect(door).toBeVisible();
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
  const signUrl = new URL(decodeURIComponent(deepLink.split("uri=")[1]));
  expect(signUrl.pathname).toBe("/sign/");
  await atSalvageStep(page, "sign");
  await expect(dialog).toContainText(say(DE, "SALVAGE_SIGN_PHONE"));
  await shot(page, "phone-sign", { kind: "phone" });

  // the wallet app's browser: the burn, what comes back, that the wallet asks twice
  const signPage = await walletContext.newPage();
  await signPage.goto(signUrl.pathname + signUrl.search, {
    waitUntil: "networkidle",
  });
  await expect(signPage.locator("h2")).toHaveText(
    say(DE, "SALVAGE_SIGN_TITLE")
  );
  await expect(signPage.getByTestId("salvage-sign-costs")).toBeVisible();
  const returns = signPage.getByTestId("salvage-sign-returns");
  for (const ingredient of Object.keys(RETURNS)) {
    await expect(
      returns.locator(`[data-ingredient=${ingredient}]`)
    ).toContainText(`+ ${RETURNS[ingredient]}`);
  }
  await expect(signPage.locator("body")).toContainText(
    say(DE, "SALVAGE_SIGN_TWICE")
  );
  // nothing of the burn named the wallet's before it vouched for its addresses
  await expect(signPage.getByTestId("salvage-sign-free")).toHaveCount(0);
  const before = appWallet.calls.length;
  await shot(signPage, "sign-page-before", { kind: "phone" });

  await signPage
    .locator("[data-testid=mint-sign-wallet][data-wallet=eternl]")
    .click();
  await expect(signPage.getByTestId("mint-sign-done")).toHaveText(
    say(DE, "SALVAGE_SIGN_DONE"),
    { timeout: 30000 }
  );
  // the wallet was asked twice, in this order: the burn's address proof, then the transaction
  const asked = appWallet.calls
    .slice(before)
    .map((call) => call.method)
    .filter((method) => ["signData", "signTx"].includes(method));
  expect(asked).toEqual(["signData", "signTx"]);
  const proof = appWallet.signed.at(-1);
  expect(proof).toContain("Action: burn-addresses");
  expect(proof).toContain(`Operation: ${operationId}`);
  await expect(signPage.getByTestId("salvage-sign-free")).toBeVisible();
  await shot(signPage, "sign-page-done", { kind: "phone" });
  expect(await operationOf(request, pia, operationId)).toMatchObject({
    state: "submitted",
    ownerConfirmed: true,
  });

  // the phone's dialog moves on by itself
  await atSalvageStep(page, "running", 30000);
  await shot(page, "phone-running", { kind: "phone" });

  // the wallet app's browser loads the page again (its code is used now): the page cannot know
  // the kind, so it shows the brand and the neutral text only, never a minting title
  await signPage.reload({ waitUntil: "networkidle" });
  await expect(signPage.getByTestId("mint-sign-problem")).toHaveAttribute(
    "data-key",
    "MINT_SIGN_EXPIRED"
  );
  await expect(signPage.locator("h1")).toHaveText("battlechoc");
  await expect(signPage.locator("h2")).toHaveCount(0);
  await expect(signPage.locator("body")).not.toContainText(/präg|mint/i, {
    useInnerText: true,
  });
  await shot(signPage, "sign-page-no-kind", { kind: "phone" });
});

test("a no in the wallet: nothing happened, the item is minted and usable, and trying again works", async ({
  browser,
  request,
}) => {
  const nora = await mintedPlayer(browser, request, "Norabel", {
    language: DE,
  });
  const { page, wallet, item, assetName } = nora;
  const signs = fromNow(wallet);
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, nora);
  wallet.options.declineTx = true;
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "nothing");
  await expect(
    salvageDialog(page).getByTestId("salvage-error")
  ).toHaveAttribute("data-key", "MINT_CANCELLED");
  // nothing changed: the burn still waits, the item minted, its token in the wallet
  expect((await operationOf(request, nora, operationId)).state).toBe(
    "prepared"
  );
  expect(await markOf(request, nora, item.id)).toMatchObject({
    state: "minted",
  });
  const tokens = await tokensOf(request, assetName);
  expect(tokens.user).toHaveLength(1);
  expect(tokens.reference).toHaveLength(1);
  await shot(page, "nothing");

  // Try again: the wallet step, and the signature goes through
  wallet.options.declineTx = false;
  await salvageDialog(page).getByTestId("salvage-again").click();
  await atSalvageStep(page, "wallet");
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "running", 30000);
  expect(signs.asked("signTx")).toHaveLength(2);
  expect((await operationOf(request, nora, operationId)).state).toBe(
    "submitted"
  );
});

test("cancel before signing: Back on the wallet step, or Cancel on the card; the item is minted as before", async ({
  browser,
  request,
}) => {
  const cleo = await mintedPlayer(browser, request, "Cleomie", {
    language: DE,
  });
  const { page, wallet, item } = cleo;
  const signs = fromNow(wallet);
  await toConfirm(page);
  await toWallet(page);
  const first = await operationIdOf(request, cleo);
  await salvageDialog(page).getByTestId("salvage-back").click();
  await atSalvageStep(page, "confirm");
  expect(await operationOf(request, cleo, first)).toMatchObject({
    state: "cancelled",
    error: "cancelled",
  });
  expect(await markOf(request, cleo, item.id)).toEqual(
    expect.objectContaining({ state: "minted" })
  );
  expect((await markOf(request, cleo, item.id)).kind).toBeUndefined();

  // prepared again, the dialog closed: the card waits for the signature with Continue and Cancel
  await toWallet(page);
  const second = await operationIdOf(request, cleo);
  await salvageDialog(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();
  await expect(salvageDialog(page)).toHaveCount(0);
  await turboCard(page);
  const status = card(page).getByTestId("mint-status");
  await expect(status).toHaveAttribute("data-state", "salvage-signing");
  await expect(status.getByTestId("mint-continue")).toBeVisible();
  await expect(card(page).getByTestId("item-equip")).toBeEnabled();
  await shot(page, "card-salvage-waiting");
  await status.getByTestId("mint-cancel").click();
  await expect(status).toHaveAttribute("data-state", "minted");
  expect((await operationOf(request, cleo, second)).state).toBe("cancelled");
  expect(signs.asked("signTx")).toEqual([]);
  await expect(card(page).getByTestId("item-salvage")).toBeVisible();
});

test("the token left the wallet between the confirmation and the signature: nothing was salvaged", async ({
  browser,
  request,
}) => {
  const lia = await mintedPlayer(browser, request, "Liavelle", {
    language: DE,
  });
  const { page, assetName } = lia;
  const pantryBefore = await pantryOf(request, lia);
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, lia);
  await chainMove(request, { assetName, to: "stranger" });
  await chainBlocks(request, 1);
  // the dialog's poll held from here: only the signature's own answer can tell the dialog that
  // the server cancelled the burn (else the poll's "cancelled" would remove Cancel anyway)
  const polls = await holdRequests(page, /\/chain\/operations\/[^/?]+$/, "GET");
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "failed", 30000);
  const error = salvageDialog(page).getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_LEFT_WALLET");
  await expect(error).toContainText(say(DE, "SALVAGE_LEFT_WALLET"));
  // the server cancelled the burn there: no Cancel is offered, only the way back to the item
  await expect(
    salvageDialog(page).getByTestId("salvage-cancel-operation")
  ).toHaveCount(0);
  await expect(
    salvageDialog(page).getByTestId("salvage-to-item")
  ).toBeVisible();
  polls.release();
  expect(await operationOf(request, lia, operationId)).toMatchObject({
    state: "cancelled",
    error: "token-moved",
  });
  // nothing burned, nothing credited: the token is the stranger's, both tokens still exist
  const tokens = await tokensOf(request, assetName);
  expect(tokens.user).toHaveLength(1);
  expect(tokens.reference).toHaveLength(1);
  const { kFinal } = await chainState(request);
  await chainBlocks(request, kFinal);
  expect(gained(pantryBefore, await pantryOf(request, lia))).toEqual({});
  await shot(page, "left-wallet");
});

test("from a phone, the item left the wallet before the signature: the sign page says nothing was salvaged and the salvage was cancelled, offers no button; the game shows the item minted, no burn running", async ({
  browser,
  request,
}) => {
  const pia = await mintedPlayer(browser, request, "Pialuna", {
    wallet: false,
    device: ANDROID_PHONE,
    language: DE,
  });
  const { page, item, assetName, walletContext } = pia;
  // a second wallet of Pia's, where the item goes (so it stays hers): a further key needs a
  // fresh signature by one already linked
  const second = nodeKeys();
  const confirmed = await (
    await signAs(request, pia.accessToken, pia.keys, "confirm")
  ).json();
  expect(
    (
      await signAs(
        request,
        pia.accessToken,
        second,
        "link",
        { "x-battlechoc-confirm": confirmed.confirmToken },
        { wallet: "lace" }
      )
    ).status()
  ).toBe(200);
  await page.evaluate(() => {
    window.__battlechocRecordDeepLinks = true;
  });
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, pia);
  const dialog = salvageDialog(page);
  await dialog.getByTestId("salvage-open-wallet").click();
  const door = page.getByTestId("wallet-door");
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
  const signUrl = new URL(decodeURIComponent(deepLink.split("uri=")[1]));

  // the sign page proves the addresses and signs; its witness is held until the item has left
  const signPage = await walletContext.newPage();
  await signPage.goto(signUrl.pathname + signUrl.search, {
    waitUntil: "networkidle",
  });
  const witness = await holdRequests(
    signPage,
    /\/chain\/sign\/[^/?]+$/,
    "POST"
  );
  await signPage
    .locator("[data-testid=mint-sign-wallet][data-wallet=eternl]")
    .click();
  await witness.held;
  await chainMove(request, { assetName, to: second.baseAddress });
  await chainBlocks(request, 1);
  witness.release();

  const problem = signPage.getByTestId("mint-sign-problem");
  await expect(problem).toHaveAttribute(
    "data-key",
    "SALVAGE_SIGN_LEFT_WALLET_CANCELLED",
    { timeout: 30000 }
  );
  await expect(problem).toContainText(
    say(DE, "SALVAGE_SIGN_LEFT_WALLET_CANCELLED")
  );
  // nothing on the page can work any more: no button
  await expect(signPage.locator("button")).toHaveCount(0);
  await expect(signPage.getByTestId("mint-sign-done")).toHaveCount(0);
  expect(await operationOf(request, pia, operationId)).toMatchObject({
    state: "cancelled",
    error: "token-moved",
  });

  // the game: the item is still Pia's, minted, and no burn of it runs
  await expect
    .poll(async () => await markOf(request, pia, item.id))
    .toEqual({ assetName, state: "minted" });
  const tokens = await tokensOf(request, assetName);
  expect(tokens.user).toHaveLength(1);
  await page.goto("/", { waitUntil: "networkidle" });
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "minted"
  );
  await expect(card(page).getByTestId("item-salvage")).toBeVisible();
});

test("the minting dialog while a salvage runs: the checklist names the item being salvaged, no sentence calls it minting", async ({
  browser,
  request,
}) => {
  const mia = await mintedPlayer(browser, request, "Miabelle", {
    language: DE,
  });
  const { page, item } = mia;
  const plain = await craftItem(request, mia, "SUGAR_FERTILIZER");
  await page.goto("/", { waitUntil: "networkidle" });
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, mia);
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "running", 30000);
  expect((await operationOf(request, mia, operationId)).state).toBe(
    "submitted"
  );
  await salvageDialog(page).getByTestId("salvage-play-on").click();
  await expect(salvageDialog(page)).toHaveCount(0);

  // the plain item's card: Mint, and its checklist
  if (!(await page.getByTestId("item-shelf").isVisible())) {
    await page.getByTestId("item-shelf-tab").click();
  }
  await page
    .locator(`[data-testid=item-tile][data-item="${plain.item}"]`)
    .first()
    .click();
  await expect(card(page)).toBeVisible();
  await card(page).getByTestId("mint-open").click();
  const mint = mintDialog(page);
  await expect(mint).toHaveAttribute("data-step", /^(explain|check)$/);
  if ((await mint.getAttribute("data-step")) === "explain") {
    await mint.getByTestId("mint-how").click();
  }
  await expect(mint).toHaveAttribute("data-step", "check");
  const running = line(page, "operation");
  await expect(running).toHaveAttribute("data-met", "false");
  await expect(running).toContainText(say(DE, "MINT_CHECK_RUNNING_BURN"));
  await expect(running).toContainText(
    say(DE, "MINT_CHECK_RUNNING_TEXT", say(DE, `ITEM_${TURBO}`), item.serial)
  );
  await expect(mint).not.toContainText(say(DE, "MINT_CHECK_RUNNING"));
});

test("the answer after the signature is lost: no second signature, the game shows the outcome by itself", async ({
  browser,
  request,
}) => {
  const ada = await mintedPlayer(browser, request, "Adalind", { language: DE });
  const { page, wallet } = ada;
  const signs = fromNow(wallet);
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, ada);
  // the signature reaches the server; its answer never reaches the game
  await page.route(/\/chain\/sign\/[^/?]+$/, async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await route.fetch();
    return route.abort("connectionreset");
  });
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  const error = salvageDialog(page).getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_SIGNED_UNHEARD", {
    timeout: 30000,
  });
  // signing is not offered again
  await expect(
    salvageDialog(page).getByTestId("salvage-open-wallet")
  ).toHaveCount(0);
  expect(signs.asked("signTx")).toHaveLength(1);
  await shot(page, "answer-lost");
  // the poll finds it signed
  await atSalvageStep(page, "running", 30000);
  expect(signs.asked("signTx")).toHaveLength(1);
  expect((await operationOf(request, ada, operationId)).state).toBe(
    "submitted"
  );
});

test("a rollback before the credit: the salvage waits for the network again, lands again and is credited once; a burn outside the game rolled back is minted again", async ({
  browser,
  request,
}) => {
  const rosa = await mintedPlayer(browser, request, "Rosalind", {
    equip: true,
    language: DE,
  });
  const { page, item, assetName } = rosa;
  const pantryBefore = await pantryOf(request, rosa);
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, rosa);
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "running", 30000);
  await chainBlocks(request, 3);
  expect((await operationOf(request, rosa, operationId)).state).toBe(
    "included"
  );

  // the three blocks are rolled back: the burn is back in the mempool; still being salvaged,
  // never "failed", nothing credited
  await chainRollback(request, 3);
  expect((await operationOf(request, rosa, operationId)).state).toBe(
    "submitted"
  );
  expect(await markOf(request, rosa, item.id)).toMatchObject({
    state: "burning",
  });
  const tokens = await tokensOf(request, assetName);
  expect(tokens.user).toHaveLength(1);
  // (the open dialog stopped polling at included, plan D's rule, so it cannot tell a rollback:
  // the card, the Choclab and the mark carry the claim)
  await salvageDialog(page).getByTestId("salvage-play-on").click();
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveAttribute(
    "data-state",
    "burning"
  );
  // still burning: its slot stays empty and counts nothing, as the server's loadout has it
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    ""
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "0");
  expect((await statsOf(request, rosa)).loadout).toEqual({});
  await shot(page, "rolled-back");
  expect(gained(pantryBefore, await pantryOf(request, rosa))).toEqual({});

  // it lands again, and is credited once at its own depth
  const { kFinal } = await chainState(request);
  await chainBlocks(request, 1 + kFinal);
  expect((await operationOf(request, rosa, operationId)).state).toBe("final");
  expect(gained(pantryBefore, await pantryOf(request, rosa))).toEqual(RETURNS);
  await chainBlocks(request, 2);
  expect(gained(pantryBefore, await pantryOf(request, rosa))).toEqual(RETURNS);
  const notices = (await statsOf(request, rosa)).notices.filter(
    (notice) => notice.kind === "salvaged"
  );
  expect(notices).toHaveLength(1);

  // a burn made outside the game (no operation), rolled back: minted again once the server's
  // watcher ran (every /test/chain POST runs it)
  const other = await mintedPlayer(browser, request, "Rosalba", {
    equip: true,
    language: DE,
  });
  await chainBurn(request, { assetName: other.assetName });
  await chainBlocks(request, 1);
  expect(await markOf(request, other, other.item.id)).toMatchObject({
    state: "burning",
    operationId: null,
  });
  await chainRollback(request, 1, { drop: true });
  await chainBlocks(request, 1);
  await expect
    .poll(async () => (await markOf(request, other, other.item.id)).state)
    .toBe("minted");
  await other.page.goto("/", { waitUntil: "networkidle" });
  await turboCard(other.page);
  await expect(card(other.page).getByTestId("item-salvage")).toBeVisible();
  // minted again: back in its slot (the server kept the id there) and in the budget
  await expect(other.page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    TURBO
  );
  await expect(other.page.getByTestId("budget")).toHaveAttribute(
    "data-used",
    "5"
  );
});

test("closed while it runs, the page loaded anew: the card says it is being salvaged, and the notice arrives", async ({
  browser,
  request,
}) => {
  const ida = await mintedPlayer(browser, request, "Idalene", { language: DE });
  const { page, item } = ida;
  await toConfirm(page);
  await toWallet(page);
  await salvageDialog(page).getByTestId("salvage-open-wallet").click();
  await atSalvageStep(page, "running", 30000);
  await salvageDialog(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveText(
    say(DE, "ITEM_BURNING")
  );

  const { kFinal } = await chainState(request);
  await chainBlocks(request, 1 + kFinal);
  expect(
    (await statsOf(request, ida)).items.map((entry) => entry.id)
  ).not.toContain(item.id);
  // the watcher reads the stats again while an item is being salvaged
  await page.clock.fastForward(31000);
  await page.clock.fastForward(31000);
  await card(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();
  await expect(
    page.locator(`[data-testid=item-tile][data-item="${TURBO}"]`)
  ).toHaveCount(0, { timeout: 15000 });
  await toTitle(page);
  await expect(page.getByTestId("item-notice")).toHaveAttribute(
    "data-kind",
    "salvaged",
    {
      timeout: 15000,
    }
  );
});

test("in the Android app a minted item has Equip and no Salvage", async ({
  browser,
  request,
}) => {
  const ana = await mintedPlayer(browser, request, "Anatolia", {
    language: DE,
  });
  const { page } = ana;
  await turboCard(page);
  await expect(card(page).getByTestId("item-salvage")).toBeVisible();
  await page.goto("/index.html?app_runs_as=twa&app_version=1", {
    waitUntil: "networkidle",
  });
  await openItemCard(page, TURBO);
  await expect(card(page).getByTestId("item-equip")).toBeVisible();
  await expect(card(page).getByTestId("item-salvage")).toHaveCount(0);
  await expect(card(page).getByTestId("mint-status")).toHaveCount(0);
  await shot(page, "android-app");
});

test("the server's chain off: no Salvage for a minted item", async ({
  browser,
  request,
}) => {
  const otto = await mintedPlayer(browser, request, "Ottilie", {
    language: DE,
  });
  const { page } = otto;
  let statusAsked = 0;
  await page.route(/\/chain\/status$/, (route) => {
    statusAsked += 1;
    return route.fulfill({ json: { enabled: false } });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await openItemCard(page, TURBO);
  await expect.poll(() => statusAsked).toBeGreaterThan(0);
  await expect(card(page).getByTestId("item-equip")).toBeVisible();
  await expect(card(page).getByTestId("item-salvage")).toHaveCount(0);
  await shot(page, "chain-off");
});

test("another wallet than the one holding the item: its address is named, nothing is prepared", async ({
  browser,
  request,
}) => {
  // the item is minted to Hana's first wallet (A); her browser's extension is her second (B)
  const holder = nodeKeys();
  const hana = await mintingPlayer(browser, request, "Hanalore", {
    item: TURBO,
    language: DE,
  });
  keep(hana.context);
  // a further key needs a fresh signature by one already linked
  const confirmed = await (
    await signAs(request, hana.accessToken, hana.keys, "confirm")
  ).json();
  expect(
    (
      await signAs(
        request,
        hana.accessToken,
        holder,
        "link",
        { "x-battlechoc-confirm": confirmed.confirmToken },
        { wallet: "eternl" }
      )
    ).status()
  ).toBe(200);
  await chainFund(request, {
    address: holder.baseAddress,
    lovelace: 20_000_000,
  });
  await chainBlocks(request, 1);
  const other = keep(await browser.newContext());
  await fakeWallet(other, holder);
  const signer = await other.newPage();
  await signer.goto("/", { waitUntil: "domcontentloaded" });
  await mintThroughApi(
    signer,
    request,
    { ...hana, subject: holder.subject },
    hana.item,
    {
      final: true,
    }
  );
  const { page } = hana;
  const burns = burnRequests(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await toConfirm(page);
  await expect(salvageDialog(page).getByTestId("salvage-wallet")).toContainText(
    holder.rewardAddress.slice(0, 14)
  );
  await salvageDialog(page).getByTestId("salvage-confirm-button").click();
  const error = salvageDialog(page).getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_WRONG_WALLET");
  await expect(error).toContainText(holder.rewardAddress.slice(0, 14));
  await atSalvageStep(page, "confirm");
  expect(burns).toEqual([]);
  expect(await markOf(request, hana, hana.item.id)).toEqual(
    expect.objectContaining({ state: "minted" })
  );
  expect((await markOf(request, hana, hana.item.id)).kind).toBeUndefined();
  await shot(page, "wrong-wallet");
});

test("a device without the holder's wallet: salvage where it is, with Check again, which finds the wallet extension enabled since the dialog opened", async ({
  browser,
  request,
}) => {
  const kai = await mintedPlayer(browser, request, "Kaimana", {
    language: DE,
  });
  const { page } = kai;
  // the extension switched off: this browser has no wallet when the dialog opens
  await page.evaluate(() => {
    window.__battlechocHiddenWallets = window.cardano;
    delete window.cardano;
  });
  await toConfirm(page);
  const dialog = salvageDialog(page);
  const error = dialog.getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_ELSEWHERE_TEXT");
  await expect(error).toContainText(
    say(DE, "SALVAGE_ELSEWHERE_TEXT", "Eternl")
  );
  const again = dialog.getByTestId("salvage-again");
  await expect(again).toHaveText(say(DE, "MINT_RECHECK"));
  await expect(dialog.getByTestId("salvage-confirm-button")).toBeDisabled();
  await shot(page, "check-again");
  // nothing new: the same
  await again.click();
  await expect(error).toHaveAttribute("data-key", "SALVAGE_ELSEWHERE_TEXT");
  // the extension switched on: Check again finds it, without reopening the dialog
  await page.evaluate(() => {
    window.cardano = window.__battlechocHiddenWallets;
  });
  await again.click();
  await expect(error).toHaveCount(0);
  await expect(dialog.getByTestId("salvage-confirm-button")).toBeEnabled();
  await atSalvageStep(page, "confirm");
});

test("the wallet holds the item at an address it did not name: at the prepare, the game says where it is and how to fix it; nothing prepared", async ({
  browser,
  request,
}) => {
  const ivo = await mintedPlayer(browser, request, "Ivolina", {
    language: DE,
  });
  const { page, item, assetName } = ivo;
  const burns = burnRequests(page);
  // another address of Ivo's own stake key, one his wallet does not name as its own
  const own = Address.toBech32(
    new Address.Address({
      networkId: 0,
      paymentCredential: KeyHash.fromHex(nodeKeys().paymentKeyHashHex),
      stakingCredential: KeyHash.fromHex(ivo.subject.slice("stake:".length)),
    })
  );
  await chainMove(request, { assetName, to: own });
  await chainBlocks(request, 1);
  expect(await markOf(request, ivo, item.id)).toEqual({
    assetName,
    state: "minted",
  });
  await toConfirm(page);
  await salvageDialog(page).getByTestId("salvage-confirm-button").click();
  const error = salvageDialog(page).getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_ITEM_MOVED_PREPARE");
  await expect(error).toContainText(say(DE, "SALVAGE_ITEM_MOVED_PREPARE"));
  await expect(error).not.toContainText(say(DE, "SALVAGE_TOKEN_MOVED"));
  await atSalvageStep(page, "confirm");
  expect(burns).toEqual([
    { itemId: item.id, subject: ivo.subject, addresses: ivo.addresses },
  ]);
  // nothing prepared: the item minted, no operation of it
  expect(await markOf(request, ivo, item.id)).toEqual({
    assetName,
    state: "minted",
  });
  await shot(page, "item-moved-prepare");
});

test("too little ADA: how much is missing, nothing prepared; and the confirmation in French", async ({
  browser,
  request,
}) => {
  const tim = await mintedPlayer(browser, request, "Timothea", {
    language: DE,
  });
  const { page } = tim;
  // the server's refusal as POST /chain/burn answers it (400 NOT ENOUGH ADA, lovelace strings)
  await page.route(/\/chain\/burn$/, (route) =>
    route.fulfill({
      status: 400,
      json: { error: "NOT ENOUGH ADA", missing: "1234567", needed: "3000000" },
    })
  );
  await toConfirm(page);
  await salvageDialog(page).getByTestId("salvage-confirm-button").click();
  const error = salvageDialog(page).getByTestId("salvage-error");
  await expect(error).toHaveAttribute("data-key", "SALVAGE_NOT_ENOUGH_ADA");
  await expect(error).toHaveText(
    say(DE, "SALVAGE_NOT_ENOUGH_ADA", adaIn(DE, "1234567"))
  );
  await atSalvageStep(page, "confirm");
  await expect(
    salvageDialog(page).getByTestId("salvage-confirm-button")
  ).toBeEnabled();
  await shot(page, "not-enough-ada");

  // French, the longest buttons: the confirmation and the wallet step
  await page.unroute(/\/chain\/burn$/);
  const fr = await mintedPlayer(browser, request, "Fleurine", { language: FR });
  await toConfirm(fr.page);
  await shot(fr.page, "fr-confirm");
  await toWallet(fr.page);
  await shot(fr.page, "fr-wallet");
});

test("a burn made outside the game: the card says it is being salvaged, and the stats' own loop brings the ingredients without a page load", async ({
  browser,
  request,
}) => {
  const olga = await mintedPlayer(browser, request, "Olgarina", {
    language: DE,
  });
  const { page, item, assetName } = olga;
  const pantryBefore = await pantryOf(request, olga);
  // the holder burns the token with its wallet, not through battlechoc: no operation of the game
  await chainBurn(request, { assetName });
  await chainBlocks(request, 1);
  expect(await markOf(request, olga, item.id)).toMatchObject({
    state: "burning",
    operationId: null,
  });
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await turboCard(page);
  await expect(card(page).getByTestId("mint-status")).toHaveText(
    say(DE, "ITEM_BURNING")
  );
  await expect(card(page).getByTestId("item-salvage")).toHaveCount(0);
  await shot(page, "outside-burn-card");
  await card(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();

  // credited at its depth; the page has no operation to poll: only the stats' loop hears of it
  const { kFinal } = await chainState(request);
  await chainBlocks(request, 1 + kFinal);
  expect(gained(pantryBefore, await pantryOf(request, olga))).toEqual(RETURNS);
  await expect(
    page.locator(`[data-testid=item-tile][data-item="${TURBO}"]`)
  ).toHaveCount(1);
  await page.clock.fastForward(31000);
  await expect(
    page.locator(`[data-testid=item-tile][data-item="${TURBO}"]`)
  ).toHaveCount(0, { timeout: 15000 });
  await toTitle(page);
  const notice = page.getByTestId("item-notice");
  await expect(notice).toHaveAttribute("data-kind", "salvaged", {
    timeout: 15000,
  });
  expect(
    await notice
      .getByTestId("salvage-arrived-row")
      .evaluateAll((all) =>
        Object.fromEntries(
          all.map((row) => [row.dataset.ingredient, Number(row.dataset.amount)])
        )
      )
  ).toEqual(RETURNS);
  await shot(page, "outside-burn-arrived");
});

test("the game's burn ended because the item was salvaged outside the game: no 'signed' box, the outside burn's words", async ({
  browser,
  request,
}) => {
  const bea = await mintedPlayer(browser, request, "Beatrixa", {
    language: DE,
  });
  const { page } = bea;
  await toConfirm(page);
  await toWallet(page);
  const operationId = await operationIdOf(request, bea);
  const prepared = await operationOf(request, bea, operationId);
  // the operation as the server answers it once its burn expired because another transaction
  // burned the token (plan E Task 2's `burned-elsewhere`; the double cannot reach that end
  // within a test: it needs the burn's validity to pass)
  await page.route(/\/chain\/operations\/[^/?]+$/, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: { ...prepared, state: "expired", error: "burned-elsewhere" },
        })
      : route.fallback()
  );
  await atSalvageStep(page, "running", 30000);
  const dialog = salvageDialog(page);
  await expect(dialog.getByTestId("salvage-error")).toHaveText(
    say(DE, "SALVAGE_BURNED_ELSEWHERE")
  );
  await expect(dialog.getByTestId("salvage-signed")).toHaveCount(0);
  await expect(dialog).not.toContainText(
    say(DE, "SALVAGE_MINTED_DEPOSIT_BACK")
  );
  await expect(dialog).toContainText(say(DE, "SALVAGE_MINTED_ON_THE_WAY"));
  await shot(page, "burned-elsewhere");
});
