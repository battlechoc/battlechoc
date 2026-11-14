import { test, expect } from "@playwright/test";
import { accountOf, readSetting, writeSetting } from "./helpers/profile.js";

// The lab against the local API (sample recipes): a new player finishes the tutorial (starter kit:
// cocoa, rum, sugar, milk), discovers the starter recipe for the truffle cannon on the lab table,
// and once a second rum is in the pantry crafts it, equips it, and the next match (on the server)
// carries that equipment.
const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

// ingredients as a won match may drop them (a route of the test server, apps/api/test/e2eServer.js)
const stock = async (request, username, items) =>
  expect(
    (
      await request.post(`${api}/test/pantry`, { data: { username, items } })
    ).ok()
  ).toBe(true);

// the lab explains itself on the first visit; most tests start with that intro already seen
const seeIntro = (page) => writeSetting(page, "labIntroSeen", true);

const introSeen = async (page) =>
  (await readSetting(page, "labIntroSeen")) === true;

// the device account's access to the API, for calls the test makes beside the game
const authHeaders = async (page, request) => {
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  return { Authorization: `Bearer ${accessToken}` };
};

const newPlayer = async (
  browser,
  request,
  username,
  viewport,
  { intro = false } = {}
) => {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const page = await context.newPage();
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const headers = await authHeaders(page, request);
  expect(
    (
      await request.post(`${api}/user/username`, {
        headers,
        data: { username },
      })
    ).ok()
  ).toBe(true);
  expect(
    (await request.post(`${api}/user/tutorial/finished`, { headers })).ok()
  ).toBe(true);
  // four finished matches against the AI unlock the Choclab (shared progression.js)
  const matches = [0, 1, 2, 3].map((i) => ({
    id: `seed-${username}-${i}`,
    lost: true,
    winners: [{ idx: 1, name: "Tom Toffee" }],
    awards: [],
  }));
  expect(
    (
      await request.post(`${api}/user/trackrecords`, {
        headers,
        data: { stats: matches },
      })
    ).ok()
  ).toBe(true);
  if (!intro) {
    await seeIntro(page);
  }
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  return { context, page };
};

const chooseBuilding = async (page, name) => {
  for (let i = 0; i < 10; i++) {
    if ((await page.getByTestId("lab-building").innerText()).trim() === name) {
      return;
    }
    await page.locator("[data-testid=lab] [data-icon=forward]").first().click();
  }
  throw new Error(`building ${name} not found`);
};

test("the starter kit discovers the starter item, a second rum crafts it; the next match uses it", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Lena");
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab")).toBeVisible();
  await expect(page.getByTestId("pantry-button")).toContainText("100");
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "0");
  await page.screenshot({ path: "test/output/screenshot_lab_start.png" });

  await chooseBuilding(page, "Rum truffle cannon");
  const table = page.getByTestId("lab-table");
  await expect(
    table.locator("[data-testid=bowls] button").first()
  ).toHaveAttribute("data-ingredient", "RUM");
  await table.locator('[data-ingredient="SUGAR"]').first().click();
  await table.locator('[data-ingredient="MILK"]').first().click();
  await page.getByTestId("lab-try").click();
  await expect(page.getByTestId("lab-message")).toContainText(
    "Recipe discovered!"
  );
  await expect(page.getByTestId("recipe-card")).toHaveAttribute(
    "data-item",
    "LIGHT_BARREL"
  );
  await page.screenshot({ path: "test/output/screenshot_lab_discovered.png" });

  // the kit has one rum and the light barrel takes two: crafting waits for a rum from a match
  const rumCost = page.getByTestId("recipe-card").locator('[data-cost="RUM"]');
  await expect(rumCost).toHaveAttribute("data-missing", "true");
  await expect(page.getByTestId("lab-craft")).toBeDisabled();

  await stock(request, "Lena", [{ ingredient: "RUM", amount: 1 }]);
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByText("Choclab", { exact: true }).first().click();
  await chooseBuilding(page, "Rum truffle cannon");
  // a known recipe shows as soon as the bowls hold its ingredients
  await table.locator('[data-ingredient="SUGAR"]').first().click();
  await table.locator('[data-ingredient="MILK"]').first().click();
  await expect(page.getByTestId("recipe-card")).toHaveAttribute(
    "data-item",
    "LIGHT_BARREL"
  );
  await expect(rumCost).toHaveAttribute("data-missing", "false");

  await page.getByTestId("lab-craft").click();
  await expect(page.getByTestId("lab-message")).toContainText("Crafted!");
  await expect(page.getByTestId("pantry-button")).toContainText("50");
  await page.getByText("Equip now", { exact: true }).first().click();
  const inventory = page.getByTestId("inventory");
  await expect(inventory.locator('[data-item="LIGHT_BARREL"]')).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_lab_inventory.png" });
  await inventory.locator('[data-item="LIGHT_BARREL"] [role=button]').click();
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    "LIGHT_BARREL"
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "2");
  await expect(page.getByTestId("lab-effects")).toContainText(
    "−20 % reload time"
  );
  await page.screenshot({ path: "test/output/screenshot_lab_equipped.png" });

  // the recipe book lists the discovery
  await page.getByTestId("recipe-book-button").click();
  await expect(
    page.getByTestId("recipe-book").locator('[data-item="LIGHT_BARREL"]')
  ).toContainText("Discovered by Lena");
  await page.screenshot({ path: "test/output/screenshot_lab_book.png" });
  await page.keyboard.press("Escape");

  // the pantry lists what is left after crafting
  await page.getByTestId("pantry-button").click();
  await expect(
    page.getByTestId("pantry").locator('[data-ingredient="COCOA"]')
  ).toContainText("50");
  await expect(
    page.getByTestId("pantry").locator('[data-ingredient="MILK"]')
  ).toContainText("1");

  // the match carries the loadout (the engine tests cover the 20 % shorter reload): a new
  // player (score at most 100) plays the server AI, which takes the loadout from the database
  // (the API tests check that the server AI has none)
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
  const players = await page.evaluate(() => {
    const view = window.__battlechoc.view();
    return view.players.map((player, index) => ({
      own: index === view.viewer,
      type: player.type,
      loadout: player.loadout,
    }));
  });
  expect(players.find((player) => player.own).loadout).toEqual({
    "EntityType.RUM_TRUFFLE_CANNON": ["LIGHT_BARREL"],
  });
  expect(players.find((player) => !player.own).type).not.toBe(
    "PlayerType.HUMAN"
  );
  await context.close();
});

test("without the building's special ingredient the lab says what is missing", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Nora");
  await page.getByText("Choclab", { exact: true }).first().click();
  // the starter kit has no hazelnuts, the factory extension's special ingredient
  await chooseBuilding(page, "Factory extension");
  await expect(page.getByTestId("lab-message")).toContainText(
    "You need Hazelnuts"
  );
  await expect(page.getByTestId("lab-try")).toBeDisabled();
  await expect(
    page.locator("[data-testid=bowls] button").first()
  ).toHaveAttribute("data-missing", "true");
  await context.close();
});

test("the lab on a phone in portrait", async ({ browser, request }) => {
  const { context, page } = await newPlayer(browser, request, "Mona", {
    width: 390,
    height: 844,
  });
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab")).toBeVisible();
  // the building preview takes the full width above the two slots
  const preview = await page.locator("[data-testid=lab] canvas").boundingBox();
  expect(preview.width).toBeGreaterThan(300);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test/output/screenshot_lab_portrait.png" });
  await context.close();
});

test("the lab explains itself once: an intro on the first visit, again after Restart tutorial", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Ella", null, {
    intro: true,
  });
  await page.getByText("Choclab", { exact: true }).first().click();
  const intro = page.getByTestId("lab-intro");
  await expect(intro).toHaveAttribute("data-step", "building");
  await expect(intro).toContainText("Welcome to the Choclab!");
  await expect(intro).toContainText("1/4");
  await page.screenshot({ path: "test/output/screenshot_lab_intro.png" });
  await page.getByTestId("lab-intro-next").click();
  await expect(intro).toHaveAttribute("data-step", "table");
  await page.getByTestId("lab-intro-back").click();
  await expect(intro).toHaveAttribute("data-step", "building");
  for (const id of ["table", "craft", "pantry"]) {
    await page.getByTestId("lab-intro-next").click();
    await expect(intro).toHaveAttribute("data-step", id);
  }
  await expect(intro).toContainText("4/4");
  await page.getByTestId("lab-intro-done").click();
  await expect(intro).toHaveCount(0);
  // the lab works without it
  await expect(page.getByTestId("lab-table")).toBeVisible();
  await expect.poll(() => introSeen(page)).toBe(true);

  // remembered on this device
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab")).toBeVisible();
  await expect(page.getByTestId("lab-table")).toBeVisible();
  await expect(intro).toHaveCount(0);

  // Settings → Restart tutorial shows it again
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.locator("[data-icon=settings]:visible").first().click();
  await page.getByText("Restart Tutorial", { exact: true }).click();
  await expect.poll(() => introSeen(page)).toBe(false);
  await page
    .getByTestId("tutorial-coach")
    .getByText("Skip Tutorial", { exact: true })
    .click();
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(intro).toHaveAttribute("data-step", "building");
  await intro.getByText("Skip intro", { exact: true }).click();
  await expect(intro).toHaveCount(0);
  await context.close();
});

// A new player crafts a light barrel with the starter kit and one more rum (the recipe takes
// RUM 2, SUGAR 2, MILK 1: salvaging gives back RUM 1, SUGAR 1 and no milk). Whoever runs first
// discovers the recipe; later the bowls show it as soon as they hold its ingredients.
const craftLightBarrel = async (page, request, username) => {
  await stock(request, username, [{ ingredient: "RUM", amount: 1 }]);
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  const book = page.waitForResponse((response) =>
    response.url().endsWith("/lab/recipes")
  );
  await page.getByText("Choclab", { exact: true }).first().click();
  await book;
  await chooseBuilding(page, "Rum truffle cannon");
  const table = page.getByTestId("lab-table");
  await table.locator('[data-ingredient="SUGAR"]').first().click();
  await table.locator('[data-ingredient="MILK"]').first().click();
  await expect(
    table.locator("[data-testid=bowls] button").nth(2)
  ).toHaveAttribute("data-ingredient", "MILK");
  const craft = page.getByTestId("lab-craft");
  if (!(await craft.isVisible())) {
    await page.getByTestId("lab-try").click();
  }
  await expect(page.getByTestId("recipe-card")).toHaveAttribute(
    "data-item",
    "LIGHT_BARREL"
  );
  await craft.click();
  await expect(page.getByTestId("lab-message")).toContainText("Crafted!");
};

const openShelf = async (page) => {
  await page.getByTestId("item-shelf-tab").click();
  const shelf = page.getByTestId("item-shelf");
  await expect(shelf).toBeVisible();
  return shelf;
};

// the serial number a tile shows ("No. 3")
const serialOf = async (tile) => {
  await expect(tile).toContainText(/No\. \d+/);
  return (await tile.textContent()).match(/No\. (\d+)/)[1];
};

// a row of what salvaging gives back
const returnedRow = (ingredient) =>
  `[data-testid="salvage-row"][data-ingredient="${ingredient}"]`;

// how many of an ingredient the pantry dialog lists
const expectInPantry = async (page, ingredient, amount) => {
  await page.getByTestId("pantry-button").click();
  await expect(
    page.getByTestId("pantry").locator(`[data-ingredient="${ingredient}"]`)
  ).toContainText(`×${amount}`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pantry")).toBeHidden();
};

test("an item on the shelf: the card shows it, says what salvaging gives back, and salvages it", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Salvia");
  await craftLightBarrel(page, request, "Salvia");
  await page.getByTestId("lab-equip").click();
  await page
    .getByTestId("inventory")
    .locator('[data-item="LIGHT_BARREL"] [role=button]')
    .click();
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    "LIGHT_BARREL"
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "2");
  // the craft took both rums and both sugars
  await expectInPantry(page, "RUM", 0);
  await expectInPantry(page, "SUGAR", 0);

  const shelf = await openShelf(page);
  const tile = shelf.getByTestId("item-tile");
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveAttribute("data-item", "LIGHT_BARREL");
  await expect(tile).toContainText("Light barrel");
  const serial = await serialOf(tile);
  await expect(shelf).toContainText("Tap an item to equip or salvage it.");
  await page.screenshot({ path: "test/output/screenshot_lab_items.png" });

  await tile.click();
  const card = page.getByTestId("item-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`Common · 2 points · No. ${serial}`);
  await expect(card).toContainText("−20 % reload time");
  await expect(card).toContainText("−15 % damage");
  await expect(card).toContainText("Equipped: Rum truffle cannon");
  await expect(card.getByTestId("item-remove")).toBeVisible();
  await expect(card.getByTestId("item-equip")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_lab_item_card.png" });

  // what salvaging gives back: half of each recipe amount (the milk's 1 halves to nothing)
  await card.getByTestId("item-salvage").click();
  const confirm = card.getByTestId("salvage-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByTestId("salvage-row")).toHaveCount(2);
  await expect(confirm.locator(returnedRow("RUM"))).toHaveAttribute(
    "data-amount",
    "1"
  );
  await expect(confirm.locator(returnedRow("SUGAR"))).toHaveAttribute(
    "data-amount",
    "1"
  );
  await expect(confirm).toContainText(
    "The cocoa you paid for crafting does not come back."
  );
  await expect(confirm).toContainText(
    "It is taken off first: Rum truffle cannon."
  );
  await page.screenshot({
    path: "test/output/screenshot_lab_salvage_confirm.png",
  });

  // Cancel keeps the item
  await card.getByTestId("salvage-cancel").click();
  await expect(confirm).toHaveCount(0);
  await expect(card).toContainText(`No. ${serial}`);
  await expect(tile).toHaveCount(1);

  await card.getByTestId("item-salvage").click();
  await card.getByTestId("salvage-confirm-button").click();
  const done = card.getByTestId("salvage-done");
  await expect(done).toContainText("Salvaged!");
  await expect(done.getByTestId("salvage-row")).toHaveCount(2);
  await expect(done.locator(returnedRow("RUM"))).toHaveAttribute(
    "data-amount",
    "1"
  );
  await expect(done.locator(returnedRow("SUGAR"))).toHaveAttribute(
    "data-amount",
    "1"
  );
  await card.getByText("To your items", { exact: true }).click();
  await expect(card).toHaveCount(0);

  await expect(shelf.getByTestId("item-tile")).toHaveCount(0);
  await expect(shelf).toContainText(
    "No items yet. Craft some on the lab table."
  );
  await expect(page.getByTestId("budget")).toHaveAttribute("data-used", "0");
  await expect(page.getByTestId("equipment-slot-0")).toHaveAttribute(
    "data-item",
    ""
  );
  await expectInPantry(page, "RUM", 1);
  await expectInPantry(page, "SUGAR", 1);
  await context.close();
});

test("no Mint button without plan D (on a phone in portrait)", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Melisse", {
    width: 390,
    height: 844,
  });
  await craftLightBarrel(page, request, "Melisse");
  const shelf = await openShelf(page);
  await expect(shelf.getByTestId("item-tile")).toHaveCount(1);
  await page.screenshot({
    path: "test/output/screenshot_lab_items_portrait.png",
  });

  await shelf.getByTestId("item-tile").click();
  const card = page.getByTestId("item-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("item-equip")).toBeVisible();
  await expect(card.getByTestId("item-salvage")).toBeVisible();
  await expect(card.locator('[data-testid="item-mint"]')).toHaveCount(0);
  await page.screenshot({
    path: "test/output/screenshot_lab_item_card_portrait.png",
  });

  // not equipped: nothing to take off first
  await card.getByTestId("item-salvage").click();
  const confirm = card.getByTestId("salvage-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).not.toContainText("It is taken off first");
  await page.screenshot({
    path: "test/output/screenshot_lab_salvage_confirm_portrait.png",
  });
  await context.close();
});

test("salvaged elsewhere: the card says the item is gone, the shelf empties", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Kerbel");
  await craftLightBarrel(page, request, "Kerbel");
  const shelf = await openShelf(page);
  await shelf.getByTestId("item-tile").click();
  const card = page.getByTestId("item-card");
  await expect(card).toBeVisible();

  // another device salvages it while the card is open
  const headers = await authHeaders(page, request);
  const { stats } = await (
    await request.get(`${api}/user`, { headers })
  ).json();
  const [{ id: itemId }] = stats.items;
  expect(
    (
      await request.post(`${api}/lab/salvage`, {
        headers,
        data: { itemId },
      })
    ).ok()
  ).toBe(true);

  await card.getByTestId("item-salvage").click();
  await card.getByTestId("salvage-confirm-button").click();
  await expect(card.getByTestId("salvage-error")).toContainText(
    "This item is no longer on your shelf."
  );
  // the stats were reloaded
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(shelf.getByTestId("item-tile")).toHaveCount(0);
  await expect(shelf).toContainText(
    "No items yet. Craft some on the lab table."
  );
  await context.close();
});

test("two items of one type: the card picks the older one by its serial and salvages it", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Thymian");
  await craftLightBarrel(page, request, "Thymian");
  // a second barrel: the first craft took the rum and the sugar (craftLightBarrel adds one rum)
  await stock(request, "Thymian", [
    { ingredient: "RUM", amount: 1 },
    { ingredient: "SUGAR", amount: 2 },
    { ingredient: "COCOA", amount: 100 },
  ]);
  await craftLightBarrel(page, request, "Thymian");

  const shelf = await openShelf(page);
  const tile = shelf.getByTestId("item-tile");
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText("× 2");
  await tile.click();
  const card = page.getByTestId("item-card");
  const chips = card.getByTestId("item-instance");
  await expect(chips).toHaveCount(2);
  const serials = (
    await chips.evaluateAll((elements) =>
      elements.map((element) => Number(element.dataset.serial))
    )
  ).sort((a, b) => a - b);
  const [older, newer] = serials;
  // the newest is selected first
  await expect(card).toContainText(`Common · 2 points · No. ${newer}`);
  await expect(
    card.locator(`[data-testid="item-instance"][data-serial="${newer}"]`)
  ).toHaveAttribute("aria-pressed", "true");

  const olderChip = card.locator(
    `[data-testid="item-instance"][data-serial="${older}"]`
  );
  await olderChip.click();
  await expect(olderChip).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText(`Common · 2 points · No. ${older}`);
  await card.getByTestId("item-salvage").click();
  await card.getByTestId("salvage-confirm-button").click();
  await expect(card.getByTestId("salvage-done")).toContainText("Salvaged!");
  await card.getByText("To your items", { exact: true }).click();
  await expect(card).toHaveCount(0);

  // the newer one is left
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText(`No. ${newer}`);
  await expect(tile).not.toContainText("×");
  await context.close();
});
