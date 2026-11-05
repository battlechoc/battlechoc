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
  const coach = page.getByTestId("tutorial-coach");
  await expect(coach).toContainText("Welcome to battlechoc");
  await coach.locator("[class*=iconButton]").click();
  await expect(coach).toHaveAttribute("data-step", "factory");
  await expect(coach).toContainText("Your chocolate factory");
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test002.png" });
});

test("link previews show the game's picture", async ({ page, request }) => {
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://battlechoc.com/images/challenge-preview.jpg"
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "battlechoc");
  const picture = await request.get("/images/challenge-preview.jpg");
  expect(picture.ok()).toBe(true);
  expect((await picture.body()).length).toBeLessThan(300000);
});
