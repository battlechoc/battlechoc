import { test, expect } from "@playwright/test";
test("locked menu entries explain themselves and do not open", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open("battlechoc");
    open.onsuccess = () => {
      const tx = open.result.transaction("player", "readwrite");
      const store = tx.objectStore("player");
      const get = store.get("stats");
      get.onsuccess = () => store.put(Object.assign({}, get.result || {}, { username: "Tester", score: 0, tutorialFinished: false, tutorialSkipped: true }), "stats");
      tx.oncomplete = () => resolve();
    };
  }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByText("Win a match to earn your first chocolate coins")).toBeVisible();
  await page.screenshot({ path: "test/output/visual_locked.png" });
  await expect(page.getByTestId("online-lobby")).not.toBeVisible();
});

test("coins unlock the Choclab; online play also needs a player name", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // skipped the tutorial without a server: plenty of coins, but no name
  await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open("battlechoc");
    open.onsuccess = () => {
      const tx = open.result.transaction("player", "readwrite");
      const store = tx.objectStore("player");
      const get = store.get("stats");
      get.onsuccess = () => store.put(Object.assign({}, get.result || {}, { username: "Chocnonymous", score: 3535, coins: 3535, tutorialSkipped: true }), "stats");
      tx.oncomplete = () => resolve();
    };
  }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Play online", { exact: true }).first().click();
  await expect(page.getByText("Online play needs a player name")).toBeVisible();
  await expect(page.getByTestId("online-lobby")).not.toBeVisible();
  await page.getByText("Ok", { exact: true }).click();
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.locator("[data-icon=back]:visible").first()).toBeVisible();
  await expect(page.getByText("Play online", { exact: true })).toHaveCount(0);
});
