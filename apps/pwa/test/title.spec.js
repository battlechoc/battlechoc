import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
});

test("shows the title page without error", async ({ page }) => {
  await expect(page.locator("[class^=logo]").first()).toBeVisible();
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test000.png" });
});

test("starts the tutorial", async ({ page }) => {
  const firstMenuEntry = page.locator("div[class^=menu] > div:first-child");
  await expect(firstMenuEntry).toContainText("Start Tutorial");
  await firstMenuEntry.click();
  const title = (text) =>
    page.locator("[class^=tutorial] [class^=title]").filter({ hasText: text });
  await expect(title("Welcome to battlechoc")).toBeVisible();
  await page.waitForTimeout(1000);
  await title("Welcome to battlechoc").locator("[class^=iconButton]").click();
  await expect(title("The Chocolate Factory")).toBeVisible();
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test002.png" });
});
