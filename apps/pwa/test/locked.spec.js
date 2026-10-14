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
