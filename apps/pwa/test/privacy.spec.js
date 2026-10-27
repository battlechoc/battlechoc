import { test, expect } from "@playwright/test";

// The privacy policy promises that the game loads nothing from other servers: everything comes
// from battlechoc.com (here the preview server) and api.battlechoc.com. Babylon.js knows CDN
// addresses (decoders, environment textures), so a new feature could start using one unnoticed.
const OWN_HOSTS = ["127.0.0.1", "localhost", "battlechoc.com", "api.battlechoc.com"];

const foreignRequests = (page) => {
  const foreign = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^(https?|wss?):$/.test(url.protocol) && !OWN_HOSTS.includes(url.hostname)) {
      foreign.push(request.url());
    }
  });
  return foreign;
};

const seed = (page, stats) =>
  page.evaluate(
    (stats) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () => store.put(Object.assign({}, get.result || {}, stats), "stats");
          tx.oncomplete = () => resolve();
        };
      }),
    stats
  );

test("the game asks no other server, neither on the title nor in a match", async ({ page }) => {
  const foreign = foreignRequests(page);
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(
    () => window.__battlechoc && window.__battlechoc.host && window.__battlechoc.host.match,
    null,
    { timeout: 8000 }
  );
  // the board with its models and textures
  await page.waitForLoadState("networkidle");
  expect(foreign).toEqual([]);
});

test("the privacy policy is a page of its own, in German and English", async ({ page }) => {
  const foreign = foreignRequests(page);
  const response = await page.goto("/privacy-policy/", { waitUntil: "networkidle" });
  expect(response.status()).toBe(200);
  await expect(page.locator("#de h1")).toHaveText("Datenschutzerklärung");
  await expect(page.locator("#en h1")).toHaveText("Privacy policy");
  for (const section of ["#de", "#en"]) {
    await expect(page.locator(`${section} h2`)).toHaveCount(11);
    await expect(page.locator(`${section} a[href="mailto:contact@battlechoc.com"]`).first()).toBeVisible();
  }
  // the game's own fonts, no scripts
  expect(await page.evaluate(() => document.fonts.check('1em "Bangers"'))).toBe(true);
  await expect(page.locator("script")).toHaveCount(0);
  expect(foreign).toEqual([]);
  await page.screenshot({ path: "test/output/privacy_policy.png", fullPage: false });
});

test("a phone in portrait: the privacy policy fits the width", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/privacy-policy/", { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test/output/privacy_policy_portrait.png" });
  await context.close();
});
