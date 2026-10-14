import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
  });
});

test("shows an info on iOS", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("[class^=visible]").first()).toBeAttached();
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test003.png" });
});

// the debug board is a real-time scenario in the placement phase; ?testclock lets the test
// fast-forward to the running phase, where the build slots show up in the resource panel
const situation = "/situation/d41d8cd98f00b204e9800998ecf8427e?testclock";

const openSituation = async (page) => {
  await page.goto(situation);
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match);
  // the board fades in before it takes clicks
  await page.waitForTimeout(3000);
};

const advance = (page, ms) =>
  page.evaluate((ms) => window.__battlechoc.host.clock.advance(ms), ms);
const phase = (page) => page.evaluate(() => window.__battlechoc.host.match.phase);

const placeFactoryAt = async (page, x, y) => {
  await openSituation(page);
  await page.mouse.click(x, y);
  await page.waitForTimeout(500);
  await advance(page, 23000);
};

test("builds a factory on a black field", async ({ page }) => {
  await placeFactoryAt(page, 336, 241);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test005.png" });
  await expect(page.getByTestId("build-tokens")).toContainText("3/3");
});

test("builds a factory on a brown field", async ({ page }) => {
  await placeFactoryAt(page, 388, 209);
  await expect(page.getByTestId("build-tokens")).toContainText("2/2");
});

test("builds a factory on a white field", async ({ page }) => {
  await placeFactoryAt(page, 363, 223);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test006.png" });
  await expect(page.getByTestId("build-tokens")).toContainText("2/2");
});

test("counts down and starts the match after both factories are placed", async ({ page }) => {
  await openSituation(page);
  await page.screenshot({ fullPage: true, path: "test/output/screenshot_test004_0.png" });
  await page.mouse.click(335, 238);
  await page.waitForTimeout(500);
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
