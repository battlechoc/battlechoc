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
  // what is left shows below the menu, and a tap on a locked entry says it again
  await expect(page.getByTestId("unlock-hint")).toHaveText(
    "4 more matches against the AI unlock the Choclab and online matches."
  );
  // the lock stands upright in the middle of the blob's right end, like the no-wifi sign, and
  // the label keeps clear of it
  for (const name of ["Choclab", "Play with a friend"]) {
    const button = page.locator("[role=button]", { hasText: name }).first();
    const lock = button.locator("[data-badge=lock]");
    const labelRight = await button.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element.firstElementChild);
      return range.getBoundingClientRect().right;
    });
    const blob = await button.boundingBox();
    const box = await lock.boundingBox();
    expect(box.x, `${name}: the label runs under the lock`).toBeGreaterThanOrEqual(labelRight);
    expect(Math.abs(box.y + box.height / 2 - (blob.y + blob.height / 2)), `${name}: the lock is off the middle`).toBeLessThan(2);
    expect(await lock.evaluate((element) => getComputedStyle(element).transform)).toMatch(/^matrix\(1, 0, 0, 1, /);
  }
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByText("Play 4 more matches against the AI to unlock “Choclab”.")).toBeVisible();
  await page.screenshot({ path: "test/output/visual_locked.png" });
  await expect(page.getByTestId("challenge-dialog")).toHaveCount(0);
});

test("four matches unlock the Choclab; friends also need a player name", async ({ page }) => {
  // the server's /health answers, nothing else does: online, but without an account
  await page.route("**/health", (route) => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // skipped the tutorial without a server: plenty of coins, but no name
  await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open("battlechoc");
    open.onsuccess = () => {
      const tx = open.result.transaction("player", "readwrite");
      const store = tx.objectStore("player");
      const get = store.get("stats");
      get.onsuccess = () => store.put(Object.assign({}, get.result || {}, {
        username: "Chocnonymous",
        score: 3535,
        coins: 3535,
        tutorialSkipped: true,
        trackRecord: [0, 1, 2, 3].map((i) => ({ id: `seed-${i}`, won: true, winners: [{ idx: 0 }] })),
      }), "stats");
      tx.oncomplete = () => resolve();
    };
  }));
  await page.goto("/", { waitUntil: "networkidle" });
  // locked, "Play with a friend" says why and still takes a friend's code, but makes no link
  await page.getByText("Play with a friend", { exact: true }).first().click();
  const dialog = page.getByTestId("challenge-dialog");
  await expect(dialog).toContainText("Online play needs a player name");
  await expect(dialog.getByTestId("challenge-code-input")).toBeVisible();
  await expect(dialog.getByTestId("challenge-share")).toHaveCount(0);
  await page.locator("[data-icon=close]:visible").first().click();
  await expect(dialog).toHaveCount(0);
  await page.getByText("Choclab", { exact: true }).first().click();
  // the first visit starts with a short intro, which can be skipped
  await expect(page.getByTestId("lab-intro")).toBeVisible();
  await page.getByText("Skip intro", { exact: true }).click();
  await expect(page.getByTestId("lab-intro")).toHaveCount(0);
  await expect(page.locator("[data-icon=back]:visible").first()).toBeVisible();
  await expect(page.getByText("Start Game", { exact: true })).toHaveCount(0);
});

test("a player who had everything under the old rule (one match) keeps it", async ({ page }) => {
  await page.route("**/health", (route) => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // the app decides once what an earlier player keeps (src/unlocks.js); wait for that first
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("settings").objectStore("settings").get("unlocks");
          get.onsuccess = () => resolve(get.result !== undefined);
        };
      })
  );
  // stats from before the new rule (XP, one match) and no decision on this device yet, as on the
  // first start of the new version
  await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open("battlechoc");
    open.onsuccess = () => {
      const tx = open.result.transaction(["player", "settings"], "readwrite");
      const store = tx.objectStore("player");
      const get = store.get("stats");
      get.onsuccess = () => store.put(Object.assign({}, get.result || {}, {
        username: "Tester",
        score: 150,
        tutorialFinished: true,
        trackRecord: [{ id: "old", won: true, winners: [{ idx: 0 }] }],
      }), "stats");
      tx.objectStore("settings").delete("unlocks");
      tx.oncomplete = () => resolve();
    };
  }));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Start Game", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("unlock-hint")).toHaveCount(0);
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab-intro")).toBeVisible();
});
