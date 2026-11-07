import { test, expect } from "@playwright/test";
import { seedStats as seed } from "./helpers/profile.js";

// The Start button without a reachable server: the tests block every host but localhost, so the
// live service never answers and the local AI starts after at most 3 s.
test("Start without a server plays the local AI within a few seconds", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  // the menu: Start, Choclab and Play with a friend (no "Play online" any more)
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
