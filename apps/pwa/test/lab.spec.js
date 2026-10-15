import { test, expect } from "@playwright/test";

// The lab against the local API (sample recipes): a new player finishes the tutorial (starter kit:
// cocoa, rum, sugar, milk), discovers the starter recipe for the truffle cannon on the lab table,
// crafts it, equips it, and a local match reloads that cannon 20 % faster.
const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

const accountOf = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result
            .transaction("player")
            .objectStore("player")
            .get("account");
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

const newPlayer = async (browser, request, username, viewport) => {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const page = await context.newPage();
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
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

test("discover, craft and equip the starter item; a local match uses it", async ({
  browser,
  request,
}) => {
  const { context, page } = await newPlayer(browser, request, "Lena");
  // the title screen counts cocoa
  await expect(page.getByTestId("cocoa-counter")).toContainText("100");
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

  await page.getByTestId("lab-craft").click();
  await expect(page.getByTestId("lab-message")).toContainText("Crafted!");
  await expect(page.getByTestId("pantry-button")).toContainText("50");
  await page.getByText("Equip now", { exact: true }).first().click();
  const inventory = page.getByTestId("inventory");
  await expect(inventory.locator('[data-item="LIGHT_BARREL"]')).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_lab_inventory.png" });
  await inventory.locator('[data-item="LIGHT_BARREL"] button').click();
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

  // a local match carries the loadout (the engine tests cover the 20 % shorter reload)
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.match,
    null,
    { timeout: 15000 }
  );
  // a new player (score at most 100) plays the local AI; only the human carries a loadout
  const loadouts = await page.evaluate(() =>
    window.__battlechoc.host.match.players.map((player) => ({
      type: player.type,
      loadout: player.loadout,
    }))
  );
  expect(
    loadouts.find((player) => player.type === "PlayerType.HUMAN").loadout
  ).toEqual({
    "EntityType.RUM_TRUFFLE_CANNON": ["LIGHT_BARREL"],
  });
  expect(
    loadouts.find((player) => player.type !== "PlayerType.HUMAN").loadout
  ).toEqual({});
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
