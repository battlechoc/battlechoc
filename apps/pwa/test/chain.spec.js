import { test, expect } from "@playwright/test";
import { ANDROID_PHONE, api, labPlayer, ok } from "./helpers/players.js";
import { readEntry, seedStats } from "./helpers/profile.js";
import { nodeKeys, signAs } from "./helpers/cardano.js";
import { fakeWallet } from "./helpers/wallet.js";
import {
  chainBlocks,
  chainMinted,
  chainMove,
  chainReset,
} from "./helpers/chain.js";
import {
  chooseBuilding,
  craftItem,
  equipItem,
  openChoclab,
  statsOf,
} from "./helpers/lab.js";

// Minted items in the game (minting plan C): the stamp on an item whose token is in the player's
// wallet, the notices on the title screen when a token leaves the wallet or comes back, and what
// Account safety says about a wallet's items. The local API reads the chain double of
// apps/api/test/e2eServer.js; test/helpers/chain.js mints, moves and adds blocks there, and each
// of its routes runs the server's ownership sync before it answers. Tokens go to the base address
// of the player's linked stake key (helpers/cardano.js nodeKeys), so that key makes the player
// their owner.

// the double's faults and held mempool are shared by every spec: none outlives a test
test.afterEach(async ({ request }) => {
  await chainReset(request);
});

const titleScreen = (page) =>
  expect(page.getByText("Start Game", { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });

// A player who finished the tutorial (the starter kit) and four matches (the Choclab is open),
// with a fresh stake key linked through the API unless `wallet` is false (the test links one in
// the game). `device`: options of the browser context. A retry gets new names: the first attempt
// took them on the server.
const newPlayer = async (
  browser,
  request,
  name,
  { device = {}, wallet = true } = {}
) => {
  const player = await labPlayer(browser, request, name, { device });
  const keys = nodeKeys();
  if (wallet) {
    expect(
      (await signAs(request, player.accessToken, keys, "link")).status()
    ).toBe(200);
  }
  return { ...player, keys };
};

// a heavy rum barrel for the rum truffle cannon (the sample recipe RUM 3, CREAM 3, SPRINKLES 1),
// crafted through the API as the lab table does it: the item ({ id, serial, … }). Not the light
// barrel: lab.spec.js discovers that one itself and expects to be the first.
const craftBarrel = (request, player) =>
  craftItem(request, player, "HEAVY_BARREL");

const cannonSlot = async (page) => {
  await chooseBuilding(page, "Rum truffle cannon");
  return page.getByTestId("equipment-slot-0");
};

const openProfile = (page) =>
  page.locator("[data-icon=user]:visible").first().click();

// "Saved · Manage" in the profile: Account safety
const manage = async (page) => {
  await page
    .getByTestId("save-progress")
    .getByRole("button", { name: /Manage/ })
    .click();
  await expect(page.getByTestId("account-safety")).toBeVisible();
};

// the answer of a notice: the game posts it as seen
const seenPosted = (page) =>
  page.waitForResponse(
    (answer) =>
      answer.url().endsWith("/user/notices/seen") &&
      answer.request().method() === "POST"
  );

const notice = (page) => page.getByTestId("item-notice");

// The game asks for the player's rank only after it has applied the server's stats at the start
// (Multiplayer.accountReady: the merge, then the rank): a positive sign that the stats, with
// their notices, have reached the page. Ask before the page loads.
const statsApplied = (page) =>
  page.waitForRequest(
    (sent) => sent.url().endsWith("/rank") && sent.method() === "GET"
  );

test("a minted item shows the gold ring in the slot and the picker", async ({
  browser,
  request,
}) => {
  const mira = await newPlayer(browser, request, "Mira");
  const { page } = mira;
  const item = await craftBarrel(request, mira);
  await equipItem(request, mira, item);

  // not minted: the tier ring, no stamp
  await page.goto("/", { waitUntil: "networkidle" });
  await openChoclab(page);
  const slot = await cannonSlot(page);
  await expect(slot).toHaveAttribute("data-item", "HEAVY_BARREL");
  await expect(
    slot.locator('[role=img][aria-label="Heavy rum barrel"]')
  ).toBeVisible();
  await expect(page.getByTestId("item-stamp")).toHaveCount(0);

  await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: mira.keys.baseAddress,
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await openChoclab(page);
  await cannonSlot(page);
  // the ring alone in the slot: the serial tag is for the large views
  await expect(slot.getByTestId("item-stamp")).toBeVisible();
  await expect(slot.getByTestId("item-serial-tag")).toHaveCount(0);
  await expect(
    slot.locator(
      `[role=img][aria-label="Heavy rum barrel, minted, No.\u00a0${item.serial}"]`
    )
  ).toBeVisible();

  // the picker of the slot: the row of an all-minted type wears the ring too
  await slot.click();
  const row = page
    .getByTestId("inventory")
    .locator('[data-item="HEAVY_BARREL"]');
  await expect(row.getByTestId("item-stamp")).toBeVisible();
  await expect(row.getByTestId("item-serial-tag")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inventory")).toBeHidden();

  // the shelf's tile (small) and the item card (large, with the tag)
  await page.getByTestId("item-shelf-tab").click();
  const tile = page.getByTestId("item-shelf").getByTestId("item-tile");
  await expect(tile.getByTestId("item-stamp")).toBeVisible();
  await expect(tile.getByTestId("item-serial-tag")).toHaveCount(0);
  await expect(tile).toHaveAttribute(
    "aria-label",
    `Heavy rum barrel, minted, No.\u00a0${item.serial}`
  );
  await tile.click();
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("item-stamp")).toBeVisible();
  await expect(card.getByTestId("item-serial-tag")).toHaveText(
    `No. ${item.serial}`
  );
  await mira.context.close();
});

test("an item sold leaves with a notice on the title screen", async ({
  browser,
  request,
}) => {
  const mira = await newPlayer(browser, request, "MiraSold");
  const { page } = mira;
  const item = await craftBarrel(request, mira);
  await equipItem(request, mira, item);
  const assetName = await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: mira.keys.baseAddress,
  });

  // sold: the token goes to an address nobody plays with; a departure counts at once (depth 0)
  await chainMove(request, { assetName, to: "stranger" });
  await chainBlocks(request, 1);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(notice(page)).toHaveAttribute("data-kind", "departed", {
    timeout: 30000,
  });
  await expect(page.getByText("No longer in your wallet")).toBeVisible();
  await expect(notice(page)).toContainText(
    `Heavy rum barrel No. ${item.serial}`
  );
  await expect(notice(page)).toContainText(
    "It was equipped: Rum truffle cannon. It has been taken off."
  );
  await expect(notice(page).getByTestId("item-stamp")).toHaveCount(0);
  const seen = seenPosted(page);
  await notice(page).getByTestId("item-notice-ok").click();
  expect((await seen).status()).toBe(204);
  await expect(notice(page)).toHaveCount(0);

  // read: not again after a reload (a notice would cover the title screen and its Choclab
  // button), and the slot is empty
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await openChoclab(page);
  await expect(notice(page)).toHaveCount(0);
  const slot = await cannonSlot(page);
  await expect(slot).toHaveAttribute("data-item", "");
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "0");

  // the next match (against the server AI: the player has at most 100 XP) has no heavy barrel
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.online &&
      window.__battlechoc.view &&
      window.__battlechoc.view(),
    null,
    { timeout: 15000 }
  );
  const own = await page.evaluate(() => {
    const view = window.__battlechoc.view();
    return view.players[view.viewer].loadout;
  });
  // the match has the player's loadout, without the barrel
  expect(own).toBeTruthy();
  expect(Object.values(own).flat()).not.toContain("HEAVY_BARREL");
  await mira.context.close();
});

test("an item that comes back arrives", async ({ browser, request }) => {
  const mira = await newPlayer(browser, request, "MiraBack");
  const { page } = mira;
  const item = await craftBarrel(request, mira);
  await equipItem(request, mira, item);
  const assetName = await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: mira.keys.baseAddress,
  });
  await chainMove(request, { assetName, to: "stranger" });
  await chainBlocks(request, 1);
  // the departure was read on another device
  const departed = (await statsOf(request, mira)).notices.find(
    (entry) => entry.kind === "departed"
  );
  expect(departed).toBeTruthy();
  await ok(
    await request.post(`${api}/user/notices/seen`, {
      headers: mira.headers,
      data: { ids: [departed.id] },
    })
  );

  // back in the wallet: an arrival counts with one block on top of the one that holds it
  await chainMove(request, { assetName, to: mira.keys.baseAddress });
  await chainBlocks(request, 1);
  const atDepthZero = await statsOf(request, mira);
  expect(atDepthZero.items.map((entry) => entry.id)).not.toContain(item.id);
  await chainBlocks(request, 1);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(notice(page)).toHaveAttribute("data-kind", "arrived", {
    timeout: 30000,
  });
  await expect(page.getByText("New in your wallet")).toBeVisible();
  await expect(notice(page)).toContainText(
    `Heavy rum barrel No. ${item.serial}`
  );
  await expect(notice(page).getByTestId("item-stamp")).toBeVisible();
  await expect(notice(page).getByTestId("item-serial-tag")).toHaveText(
    `No. ${item.serial}`
  );
  const seen = seenPosted(page);
  await notice(page).getByTestId("item-notice-choclab").click();
  expect((await seen).status()).toBe(204);
  await expect(page.getByTestId("lab")).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  // in the slot it had before it left
  const slot = await cannonSlot(page);
  await expect(slot).toHaveAttribute("data-item", "HEAVY_BARREL");
  await expect(slot.getByTestId("item-stamp")).toBeVisible();
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "3");
  await mira.context.close();
});

test("Account safety names the wallet and counts its items", async ({
  browser,
  request,
}) => {
  const mira = await newPlayer(browser, request, "MiraWallet", {
    wallet: false,
  });
  const { context, page, keys } = mira;
  // the wallet links in the game, so the server learns its name
  await fakeWallet(context, keys);
  await page.reload({ waitUntil: "networkidle" });
  await openProfile(page);
  await page.getByRole("button", { name: "I already have an account" }).click();
  await page.getByRole("button", { name: "Use a Cardano wallet" }).click();
  await page
    .getByTestId("wallet-door")
    .getByText("Eternl", { exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Your wallet is now linked to this player.")
  ).toBeVisible({ timeout: 15000 });

  // nothing minted yet: the wallet row reads as it did before minting; the guide's wallet
  // section is linked below it (src/cardano/guide.js)
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await openProfile(page);
  await manage(page);
  await expect(page.getByTestId("wallet-entry")).toHaveCount(1);
  await expect(page.getByTestId("wallet-entry")).toContainText("Eternl");
  await expect(page.getByTestId("safety-wallet")).not.toContainText(
    "Your minted items live here."
  );
  await expect(page.getByTestId("wallet-items")).toHaveCount(0);
  await expect(page.getByTestId("wallet-guide")).toHaveAttribute(
    "href",
    "/guide/#wallet-en"
  );

  const item = await craftBarrel(request, mira);
  await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: keys.baseAddress,
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await openProfile(page);
  await manage(page);
  await expect(page.getByTestId("safety-wallet")).toContainText(
    "Your minted items live here."
  );
  const entry = page.getByTestId("wallet-entry");
  await expect(entry).toHaveCount(1);
  await expect(entry).toHaveAttribute("data-subject", keys.subject);
  await expect(entry).toContainText("Eternl");
  await expect(entry).toContainText("Preprod");
  const items = entry.getByTestId("wallet-items");
  await expect(items).toHaveAttribute("data-count", "1");
  await expect(items).toHaveText("1 minted item");
  await expect(entry.getByTestId("wallet-remove-note")).toBeVisible();
  await expect(entry.getByTestId("wallet-wait")).toHaveCount(0);
  await expect(page.getByTestId("wallet-guide")).toHaveAttribute(
    "href",
    "/guide/#wallet-en"
  );
  await mira.context.close();
});

// the answer to "is minting on?" (GET /chain/status), which the profile's guide link asks
const statusAnswer = (page) =>
  page.waitForResponse(
    (answer) => new URL(answer.url()).pathname === "/chain/status"
  );

test("Account safety links the guide only while the server's minting is on", async ({
  browser,
  request,
}) => {
  const nia = await newPlayer(browser, request, "NiaGuide");
  const { page } = nia;

  // the server's switch off: once its answer is in and the row has rendered, no link
  await page.route("**/chain/status", (route) =>
    route.fulfill({ json: { enabled: false } })
  );
  let status = statusAnswer(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await openProfile(page);
  await manage(page);
  expect(await (await status).json()).toEqual({ enabled: false });
  await expect(page.getByTestId("safety-wallet")).toBeVisible();
  // the link's component marks when the switch is decided (useMintingDecided)
  await expect(page.getByTestId("wallet-guide-decided")).toHaveAttribute(
    "data-minting",
    "false"
  );
  await expect(page.getByTestId("wallet-guide")).toHaveCount(0);

  // the server's own answer (on): the link to the guide's wallet section
  await page.unroute("**/chain/status");
  status = statusAnswer(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await openProfile(page);
  await manage(page);
  expect(await (await status).json()).toEqual({ enabled: true });
  await expect(page.getByTestId("wallet-guide")).toHaveAttribute(
    "href",
    "/guide/#wallet-en"
  );
  await nia.context.close();
});

test("a notice waits while the Info dialog is open", async ({
  browser,
  request,
}) => {
  const mira = await newPlayer(browser, request, "MiraInfo");
  const { page } = mira;
  const item = await craftBarrel(request, mira);
  const assetName = await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: mira.keys.baseAddress,
  });
  // the device stores the stats of a full start (tutorial done, no notice)
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await chainMove(request, { assetName, to: "stranger" });
  await chainBlocks(request, 1);

  // the game starts from its stored stats (no notice yet) and merges them with the server's: that
  // answer, which brings the notice, waits until the Info dialog is open
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let asked;
  const merging = new Promise((resolve) => (asked = resolve));
  await page.route("**/user/merge", async (route) => {
    asked();
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await titleScreen(page);
  await merging;
  await page.locator("[data-icon=info]:visible").click();
  await expect(
    page.getByText("About battlechoc", { exact: true })
  ).toBeVisible();
  const merged = page.waitForResponse((answer) =>
    answer.url().endsWith("/user/merge")
  );
  const applied = statsApplied(page);
  release();
  const answer = await merged;
  expect(answer.ok()).toBe(true);
  expect((await answer.json()).mergedPlayerInfo.notices).toHaveLength(1);
  // the stats with the notice are in the page now; a notice that showed would load its dialog's
  // chunk first
  await applied;
  await page.waitForLoadState("networkidle");
  await expect(notice(page)).toHaveCount(0);
  await expect(
    page.getByText("About battlechoc", { exact: true })
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByText("About battlechoc", { exact: true })
  ).toBeHidden();
  await expect(notice(page)).toHaveAttribute("data-kind", "departed");
  await mira.context.close();
});

test("a notice kept on the device does not show before the server has answered", async ({
  browser,
  request,
}) => {
  const mira = await newPlayer(browser, request, "MiraStored");
  const { page } = mira;
  const item = await craftBarrel(request, mira);
  await chainMinted(request, {
    username: mira.username,
    itemId: item.id,
    to: mira.keys.baseAddress,
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await expect(notice(page)).toHaveCount(0);
  // stats a device stored before notices stayed off it: one that was answered on another device
  // since (the server lists none)
  await seedStats(page, {
    notices: [
      {
        id: "notice-answered-elsewhere",
        kind: "departed",
        item: { id: item.id, item: "HEAVY_BARREL", serial: item.serial },
        building: null,
        at: "2026-11-01T08:00:00.000Z",
      },
    ],
  });
  expect((await statsOf(request, mira)).notices).toEqual([]);

  // the game starts from its stored stats, and the server's answer waits
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let asked;
  const merging = new Promise((resolve) => (asked = resolve));
  await page.route("**/user/merge", async (route) => {
    asked();
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await titleScreen(page);
  // the account is ready (the merge is asked for) and the stored stats are in: a notice from them
  // would load its dialog's chunk and show within this time, as it did before
  await merging;
  await page.waitForTimeout(2000);
  await expect(notice(page)).toHaveCount(0);
  const merged = page.waitForResponse((answer) =>
    answer.url().endsWith("/user/merge")
  );
  const applied = statsApplied(page);
  release();
  expect((await merged).ok()).toBe(true);
  // the server's stats (no notice) are in, and nothing showed
  await applied;
  await page.waitForLoadState("networkidle");
  await expect(notice(page)).toHaveCount(0);
  // and the device keeps no notice from now on
  const stored = await readEntry(page, "player", "stats");
  expect(stored).toBeTruthy();
  expect(stored).not.toHaveProperty("notices");
  await mira.context.close();
});

test("in the Android app nothing of it shows", async ({ browser, request }) => {
  const mira = await newPlayer(browser, request, "MiraApp", {
    device: ANDROID_PHONE,
  });
  const { page } = mira;
  // one minted item stays and is equipped; another one left, so a notice waits
  const kept = await craftBarrel(request, mira);
  await equipItem(request, mira, kept);
  await chainMinted(request, {
    username: mira.username,
    itemId: kept.id,
    to: mira.keys.baseAddress,
  });
  const sold = await craftBarrel(request, mira);
  const soldAsset = await chainMinted(request, {
    username: mira.username,
    itemId: sold.id,
    to: mira.keys.baseAddress,
  });
  await chainMove(request, { assetName: soldAsset, to: "stranger" });
  await chainBlocks(request, 1);

  // in the browser the notice shows (and stays unread)
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(notice(page)).toHaveAttribute("data-kind", "departed", {
    timeout: 30000,
  });

  // the TWA's start address (apps/android/twa-manifest.json); the game cleans it up at boot
  let applied = statsApplied(page);
  await page.goto("/index.html?app_runs_as=twa&app_version=1", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await titleScreen(page);
  // the server's stats, with the unread notice, are in: on the title screen no notice shows
  await applied;
  await page.waitForLoadState("networkidle");
  await expect(notice(page)).toHaveCount(0);
  await openChoclab(page);
  const slot = await cannonSlot(page);
  await expect(slot).toHaveAttribute("data-item", "HEAVY_BARREL");
  await expect(
    slot.locator('[role=img][aria-label="Heavy rum barrel"]')
  ).toBeVisible();
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "3");
  await page.getByTestId("item-shelf-tab").click();
  const tile = page.getByTestId("item-shelf").getByTestId("item-tile");
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveAttribute(
    "aria-label",
    `Heavy rum barrel (No.\u00a0${kept.serial})`
  );
  await tile.click();
  await expect(page.getByTestId("item-card")).toBeVisible();
  await expect(page.getByTestId("item-stamp")).toHaveCount(0);
  await expect(page.getByTestId("item-serial-tag")).toHaveCount(0);

  applied = statsApplied(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await titleScreen(page);
  await applied;
  await page.waitForLoadState("networkidle");
  await expect(notice(page)).toHaveCount(0);
  await openProfile(page);
  await manage(page);
  await expect(page.getByTestId("safety-wallet")).toHaveCount(0);
  await expect(page.getByTestId("wallet-entry")).toHaveCount(0);
  await expect(page.getByTestId("wallet-items")).toHaveCount(0);
  // the server still counts the item for the match
  const stats = await statsOf(request, mira);
  expect(stats.items.map((entry) => entry.id)).toContain(kept.id);
  await mira.context.close();
});
