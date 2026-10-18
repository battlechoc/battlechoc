import { test, expect } from "@playwright/test";

// The lab against the local API (sample recipes): a new player finishes the tutorial (starter kit:
// cocoa, rum, sugar, milk), discovers the starter recipe for the truffle cannon on the lab table,
// crafts it, equips it, and the next match (on the server) carries that equipment.
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

// the lab explains itself on the first visit; most tests start with that intro already seen
const seeIntro = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          tx.objectStore("settings").put(true, "labIntroSeen");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

const introSeen = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result
            .transaction("settings")
            .objectStore("settings")
            .get("labIntroSeen");
          get.onsuccess = () => resolve(get.result === true);
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

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

test("discover, craft and equip the starter item; the next match uses it", async ({
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
  expect(players.find((player) => !player.own).type).not.toBe("PlayerType.HUMAN");
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
