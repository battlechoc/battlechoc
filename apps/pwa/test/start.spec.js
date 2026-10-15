import { test, expect } from "@playwright/test";

// The Start button without a reachable server: the tests block every host but localhost, so the
// live service never answers and the local AI starts after at most 3 s.
const seed = (page, stats) =>
  page.evaluate(
    (stats) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () => store.put(Object.assign({}, get.result || {}, stats), "stats");
          tx.oncomplete = () => resolve();
        };
      }),
    stats
  );

test("Start without a server plays the local AI within a few seconds", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  // the menu: Start, Choclab and Friends ("Play online" is only the title of the friends dialog)
  await expect(page.locator('text="Singleplayer" >> visible=true')).toHaveCount(0);
  await expect(page.locator('text="Play online" >> visible=true')).toHaveCount(0);
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(
    () => window.__battlechoc && window.__battlechoc.host && window.__battlechoc.host.match && !window.__battlechoc.host.online,
    null,
    { timeout: 8000 }
  );
  await expect(page.getByTestId("matchmaking")).toBeHidden();
});
