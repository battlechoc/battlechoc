import { test, expect } from "@playwright/test";

// `npm run dev` must work as well: the Vite dev server pre-bundles the linked shared package
// (optimizeDeps in vite.config.js); without that the app stays white.
const devUrl = `http://127.0.0.1:${process.env.DEV_PORT || 3001}/`;

test("the dev server renders the title screen and the tutorial", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(devUrl, { waitUntil: "networkidle" });
  const firstMenuEntry = page.locator("div[class^=menu] > div:first-child");
  await expect(firstMenuEntry).toContainText("Start Tutorial", { timeout: 30000 });
  await firstMenuEntry.click();
  await expect(page.getByTestId("tutorial-coach")).toContainText("Welcome to battlechoc");
  expect(errors).toEqual([]);
});

// The pre-bundled shared package must follow its source: a match that ends shows the end screen
// (it uses functions of the shared package), and closing it leads back to the title screen.
test("on the dev server a match ends with the end screen and returns to the title", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${devUrl}?testclock`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 30000 });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(Object.assign({}, get.result || {}, { username: "Tester", score: 150, tutorialFinished: true }), "stats");
          tx.oncomplete = () => resolve();
        };
      })
  );
  await page.goto(`${devUrl}?testclock`, { waitUntil: "networkidle" });
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host && window.__battlechoc.host.match, null, { timeout: 15000 });
  // the local player gives up right after the start of the running phase
  await page.evaluate(() =>
    [...document.querySelectorAll('div[class*="button-"]')].find((element) => element.querySelector('[class*="fields"]')).click()
  );
  await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
    return h.submit("battlechoc/match/placeFactory", { row: cell.row, col: cell.col });
  });
  await page.evaluate(() => window.__battlechoc.host.clock.advance(25000));
  await page.evaluate(() => window.__battlechoc.host.submit("battlechoc/match/surrender", {}));
  await expect(page.getByText(/You lost/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("end-xp")).toBeVisible();
  await page.locator("[data-icon=done]:visible, [data-icon=fast-forward]:visible").first().click();
  await page.locator("[data-icon=done]:visible").first().click();
  await expect(page.getByText("Start Game", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  // the award animation must not touch the closed end screen
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});
