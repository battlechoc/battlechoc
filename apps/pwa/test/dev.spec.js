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
