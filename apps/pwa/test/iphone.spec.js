import { test, expect } from "@playwright/test";
import { advance, phase } from "./helpers/clock.js";
import { waitForMatch, sceneSettled, factoryPlaced } from "./helpers/match.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
  });
});

test("shows an info on iOS", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid=quick-message][data-variant=apple-pwa-hint][data-visible=true]")).toBeAttached();
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test003.png" });
});

// the debug board is a real-time scenario in the placement phase; ?testclock lets the test
// fast-forward to the running phase, where the build slots show up in the resource panel
const situation = "/situation/d41d8cd98f00b204e9800998ecf8427e?testclock";

const openSituation = async (page) => {
  await page.goto(situation);
  await waitForMatch(page);
  // the camera comes to the board before it takes clicks
  await sceneSettled(page);
};


// The clicks hit cells of the 8×8 debug board at the iPhone's 667×375 points; they move with the
// board's height on the screen (boardHeight in src/3d/Scene.jsx: a world unit up is 37.5 · 0.82
// points up here).
const placeFactoryAt = async (page, x, y) => {
  await openSituation(page);
  await page.mouse.click(x, y);
  await factoryPlaced(page);
  await advance(page, 23000);
};

test("builds a factory on a black field", async ({ page }) => {
  await placeFactoryAt(page, 336, 264);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test005.png" });
  await expect(page.getByTestId("build-tokens")).toContainText("3/3");
});

test("builds a factory on a brown field", async ({ page }) => {
  await placeFactoryAt(page, 388, 232);
  await expect(page.getByTestId("build-tokens")).toContainText("2/2");
});

test("builds a factory on a white field", async ({ page }) => {
  await placeFactoryAt(page, 363, 246);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test006.png" });
  await expect(page.getByTestId("build-tokens")).toContainText("2/2");
});

test("counts down and starts the match after both factories are placed", async ({ page }) => {
  await openSituation(page);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test004_0.png" });
  await page.mouse.click(335, 261);
  await factoryPlaced(page);
  expect(await phase(page)).toBe("MatchPhase.PLACEMENT");
  // the AI places its factory within a few seconds, then the countdown starts
  for (let i = 0; i < 10 && (await phase(page)) === "MatchPhase.PLACEMENT"; i++) {
    await advance(page, 1000);
  }
  expect(await phase(page)).toBe("MatchPhase.COUNTDOWN");
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test004_1.png" });
  await advance(page, 3000);
  expect(await phase(page)).toBe("MatchPhase.RUNNING");
  await expect(page.getByTestId("build-tokens")).toContainText("3/3");
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test004_2.png" });
});
