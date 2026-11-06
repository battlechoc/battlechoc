import { test, expect } from "@playwright/test";

// The layout of the controls at the screen's edges (src/index.css --edge-*) on a phone in
// portrait. Full screen on an Android phone with a camera cutout: the browser reports the
// cutout's whole band as the top inset (60 px and more on the user's phone), though only the
// camera itself is in the way, in the middle of the edge. The corners move in by no more than
// --edge-cutout (24 px) plus --edge (12 px); what sits in the middle of the top edge keeps clear
// of the whole band. Leaving full screen takes the inset away again. Chromium emulates the
// insets through the devtools protocol.
const BAND = 70;
// the debug board in the placement phase: the match asks for the factory, the preview shows
const situation = "/situation/d41d8cd98f00b204e9800998ecf8427e?testclock";

const setTopInset = async (cdp, top) =>
  cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, topMax: top } });

const top = (locator) => locator.evaluate((element) => element.getBoundingClientRect().top);

test.use({ viewport: { width: 412, height: 915 } });

test("in full screen the title screen's corner buttons come in no further than the cutout cap", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const settings = page.locator("[data-icon=settings]:visible").first();
  const trophy = page.locator("[data-icon=trophy]:visible").first();
  await expect(settings).toBeVisible();
  expect(await top(settings)).toBe(12);
  expect(await top(trophy)).toBe(12);

  await setTopInset(cdp, BAND);
  await expect.poll(() => top(settings)).toBe(36);
  expect(await top(trophy)).toBe(36);
  await page.screenshot({ path: "test/output/screenshot_edges_fullscreen.png" });

  await setTopInset(cdp, 0);
  await expect.poll(() => top(settings)).toBe(12);
  expect(await top(trophy)).toBe(12);
});

test("in full screen the match banner in the middle of the top edge keeps clear of the whole band", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await page.goto(situation);
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match);
  const menu = page.locator("[data-icon=settings]:visible").first();
  const banner = page.getByTestId("match-banner");
  await expect(menu).toBeVisible();
  expect(await top(menu)).toBe(12);
  expect(await top(banner)).toBe(12);

  await setTopInset(cdp, BAND);
  await expect.poll(() => top(menu)).toBe(36);
  expect(await top(banner)).toBe(BAND + 12);
});

test("the match's message goes below the board preview", async ({ page }) => {
  await page.goto(situation);
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match);
  const preview = page.getByTestId("board-preview");
  const message = page.getByTestId("match-message");
  await expect(preview).toBeVisible();
  await expect(message).toContainText("Place your chocolate factory");
  const previewBox = await preview.boundingBox();
  const messageBox = await message.boundingBox();
  expect(messageBox.y).toBeCloseTo(previewBox.y + previewBox.height + 12, 0);
  await page.screenshot({ path: "test/output/screenshot_edges_message.png" });
});

// held sideways the preview stands beside the menu button, and the message keeps the row below
// the buttons (below the preview it would sit on the board)
test.describe("a phone held sideways", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("the match's message keeps the row below the buttons", async ({ page }) => {
    await page.goto(situation);
    await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match);
    const menu = page.locator("[data-icon=settings]:visible").first();
    const message = page.getByTestId("match-message");
    await expect(page.getByTestId("board-preview")).toBeVisible();
    await expect(message).toContainText("Place your chocolate factory");
    const menuBox = await menu.boundingBox();
    const messageBox = await message.boundingBox();
    expect(messageBox.y).toBeCloseTo(menuBox.y + menuBox.height + 12, 0);
  });
});
