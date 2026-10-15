import { test, expect } from "@playwright/test";

// The Choclab against the local API: finishing the tutorial gives 100 cocoa; the cacao tree's
// first level costs 24 cocoa, the factory's 102.
const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

const accountOf = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("player").objectStore("player").get("account");
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

test("the Choclab shows ingredient costs and upgrades with cocoa", async ({ browser, request }) => {
  const context = await browser.newContext();
  await context.addInitScript((url) => window.localStorage.setItem("battlechoc.apiUrl", url), api);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (await request.post(`${api}/accounts/token`, { data: { refreshToken } })).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  expect((await request.post(`${api}/user/username`, { headers, data: { username: "Greta" } })).ok()).toBe(true);
  expect((await request.post(`${api}/user/tutorial/finished`, { headers })).ok()).toBe(true);
  await page.goto("/", { waitUntil: "networkidle" });

  // the title screen counts cocoa instead of coins
  await expect(page.getByTestId("cocoa-counter")).toContainText("100", { timeout: 15000 });
  await page.getByText("Choclab", { exact: true }).first().click();

  // the factory's next level costs 102 cocoa: not enough yet
  const upgrade = page.getByTestId("choclab-upgrade");
  await expect(upgrade).toContainText("102");
  await expect(upgrade).toHaveAttribute("data-affordable", "false");
  await expect(page.getByText("Not enough ingredients yet.")).toBeVisible();

  // the cacao tree's costs 24: upgrade it
  await page.locator("[data-icon=forward]:visible").first().click();
  await expect(upgrade).toContainText("24");
  await expect(upgrade).toHaveAttribute("data-affordable", "true");
  await page.screenshot({ path: "test/output/screenshot_choclab_costs.png" });
  await upgrade.click();
  await expect(page.getByTestId("pantry-button")).toContainText("76", { timeout: 10000 });

  // the pantry lists what is left
  await page.getByTestId("pantry-button").click();
  await expect(page.getByTestId("pantry").locator('[data-ingredient="COCOA"]')).toContainText("76");
  await page.screenshot({ path: "test/output/screenshot_choclab_pantry.png" });
  await context.close();
});
