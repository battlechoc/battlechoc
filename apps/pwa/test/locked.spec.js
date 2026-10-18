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
  await expect(page.getByText("Win a match to unlock")).toBeVisible();
  await page.screenshot({ path: "test/output/visual_locked.png" });
  await expect(page.getByTestId("online-lobby")).not.toBeVisible();
});

test("a first win unlocks the Choclab; friends also need a player name", async ({ page }) => {
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
  await page.getByText("Friends", { exact: true }).first().click();
  await expect(page.getByText("Online play needs a player name")).toBeVisible();
  await expect(page.getByTestId("online-lobby")).not.toBeVisible();
  await page.getByText("Ok", { exact: true }).click();
  await page.getByText("Choclab", { exact: true }).first().click();
  // the first visit starts with a short intro, which can be skipped
  await expect(page.getByTestId("lab-intro")).toBeVisible();
  await page.getByText("Skip intro", { exact: true }).click();
  await expect(page.getByTestId("lab-intro")).toHaveCount(0);
  await expect(page.locator("[data-icon=back]:visible").first()).toBeVisible();
  await expect(page.getByText("Start Game", { exact: true })).toHaveCount(0);
});
