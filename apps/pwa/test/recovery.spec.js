import { test, expect } from "@playwright/test";

// A crash while the interface renders shows a way back to the title screen instead of an empty
// blue page (src/ui/ErrorBoundary.jsx). The test builds let a boundary's children throw on the
// event "battlechoc-test-crash".
const crash = (page, name) =>
  page.evaluate(
    (name) => window.dispatchEvent(new CustomEvent("battlechoc-test-crash", { detail: name })),
    name
  );

const seedProfile = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(
              Object.assign({}, get.result || {}, {
                username: "Tester",
                score: 150,
                tutorialFinished: true,
                tutorialSkipped: true,
              }),
              "stats"
            );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

test("a crash of the title screen offers the way back", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByTestId("start-button")).toBeVisible();
  await crash(page, "hud");
  const recovery = page.getByTestId("error-recovery");
  await expect(recovery).toContainText("Back to the title screen");
  await expect(page.getByTestId("start-button")).toHaveCount(0);
  await recovery.getByRole("button").click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByTestId("start-button")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a crash in a match stops it and keeps it for Resume", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seedProfile(page);
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await expect(page.getByTestId("start-button")).toContainText("Start Game");
  await page.getByTestId("start-button").click();
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match);
  await crash(page, "hud");
  await page.getByTestId("error-recovery").getByRole("button").click();
  await expect(page.getByTestId("start-button")).toBeVisible();
  expect(await page.evaluate(() => window.__battlechoc.host.stopped)).toBe(true);
  // the match was saved: Start asks whether to resume it
  await page.getByTestId("start-button").click();
  await expect(page.getByText("resume your last one")).toBeVisible();
});

test("a crash of the 3D scene reloads to the title screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByTestId("start-button")).toBeVisible();
  await crash(page, "scene");
  const recovery = page.getByTestId("error-recovery");
  await expect(recovery).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    recovery.getByRole("button").click(),
  ]);
  await expect(recovery).toHaveCount(0);
  await expect(page.getByTestId("start-button")).toBeVisible();
});
