import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { api, localeOf } from "./helpers/players.js";
import { seedStats as seed } from "./helpers/profile.js";

// The privacy policy promises that the game loads nothing from other servers: everything comes
// from battlechoc.com (here the preview server) and api.battlechoc.com. Babylon.js knows CDN
// addresses (decoders, environment textures), so a new feature could start using one unnoticed.
const OWN_HOSTS = [
  "127.0.0.1",
  "localhost",
  "battlechoc.com",
  "api.battlechoc.com",
];

const foreignRequests = (page) => {
  const foreign = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /^(https?|wss?):$/.test(url.protocol) &&
      !OWN_HOSTS.includes(url.hostname)
    ) {
      foreign.push(request.url());
    }
  });
  return foreign;
};

test("the game asks no other server, neither on the title nor in a match", async ({
  page,
}) => {
  const foreign = foreignRequests(page);
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByText("Start Game", { exact: true }).first().click();
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.match,
    null,
    { timeout: 8000 }
  );
  // the board with its models and textures
  await page.waitForLoadState("networkidle");
  expect(foreign).toEqual([]);
});

test("the privacy policy is a page of its own, in German and English", async ({
  page,
}) => {
  const foreign = foreignRequests(page);
  const response = await page.goto("/privacy-policy/", {
    waitUntil: "networkidle",
  });
  expect(response.status()).toBe(200);
  await expect(page.locator("#de h1")).toHaveText("Datenschutzerklärung");
  await expect(page.locator("#en h1")).toHaveText("Privacy policy");
  for (const section of ["#de", "#en"]) {
    await expect(page.locator(`${section} h2`)).toHaveCount(12);
    await expect(
      page.locator(`${section} a[href="mailto:hello@battlechoc.com"]`).first()
    ).toBeVisible();
  }
  // the game's own fonts, no scripts
  expect(await page.evaluate(() => document.fonts.check('1em "Bangers"'))).toBe(
    true
  );
  await expect(page.locator("script")).toHaveCount(0);
  expect(foreign).toEqual([]);
  await page.screenshot({
    path: "test/output/privacy_policy.png",
    fullPage: false,
  });
});

test("a phone in portrait: the privacy policy fits the width", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/privacy-policy/", { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test/output/privacy_policy_portrait.png" });
  await context.close();
});

// ---------------------------------------------------------------------------------------------
// The guide (/guide/, public/guide/index.html): wallets, ADA and what minting costs, for players
// who never used a wallet, in German and in English. The game links its sections through
// src/cardano/guide.js; test/unit/guide.test.js checks the anchors it links.

const GUIDE_SECTIONS = ["wallet", "apps", "ada", "costs", "selling", "salvage"];

// The owner's screenshots, only when MINT_SHOTS_DIR names a folder (outside the repository):
// guide-<phone|desktop>-<de|en>.png (each language's whole section) and
// guide-<phone|desktop>-deeplink-costs-de.png (what a link from the game shows first)
const SHOTS_DIR = process.env.MINT_SHOTS_DIR || null;

const GUIDE_SCREENS = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: { width: 1280, height: 720 } },
};

const shotOf = async (page, name, clip) => {
  if (!SHOTS_DIR) {
    return;
  }
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOTS_DIR, `guide-${name}.png`),
    animations: "disabled",
    // a whole section is too tall for the phone's pixel ratio: one image pixel per CSS pixel
    ...(clip ? { fullPage: true, clip, scale: "css" } : {}),
  });
};

test("the guide is a page of its own, in German and English", async ({
  page,
  request,
}) => {
  const foreign = foreignRequests(page);
  // document.fonts.check is true even for a font whose file failed: the request must succeed
  const bangers = page.waitForResponse((answer) =>
    answer.url().endsWith("/fonts/bangers-latin-400-normal.woff2")
  );
  const response = await page.goto("/guide/", { waitUntil: "networkidle" });
  expect(response.status()).toBe(200);
  await expect(page.locator("#de h1")).toHaveText("Items prägen: so geht's");
  await expect(page.locator("#en h1")).toHaveText(
    "Minting items: how it works"
  );
  for (const language of ["de", "en"]) {
    const section = page.locator(`#${language}`);
    await expect(section.locator("h2")).toHaveCount(GUIDE_SECTIONS.length);
    for (const topic of GUIDE_SECTIONS) {
      await expect(section.locator(`h2#${topic}-${language}`)).toHaveCount(1);
    }
  }
  // the English section says what the German one says, paragraph for paragraph
  for (const part of ["h2", "p", "li", "a"]) {
    expect(await page.locator(`#en ${part}`).count()).toBe(
      await page.locator(`#de ${part}`).count()
    );
  }
  // the three amounts, each named exactly as on the costs screen
  const de = page.locator("#de");
  const en = page.locator("#en");
  await expect(page.locator("#costs-de ~ ul > li > strong")).toHaveText([
    "Netzwerkgebühr",
    "battlechoc-Gebühr",
    "Pfand",
  ]);
  await expect(page.locator("#costs-en ~ ul > li > strong")).toHaveText([
    "Network fee",
    "battlechoc fee",
    "Deposit",
  ]);
  // the treasury only collects today; the split is planned (whitepaper 5.8)
  await expect(de).toContainText(
    "Geht in die battlechoc-Treasury (geplant: für den Preistopf der Turniere und das Team)."
  );
  await expect(en).toContainText(
    "Goes into the battlechoc treasury (planned: for the tournaments' prize pool and the team)."
  );
  // the way to the privacy policy, each language to its own section
  await expect(de.locator('a[href="/privacy-policy/#de"]')).toHaveText(
    "Datenschutzerklärung"
  );
  await expect(en.locator('a[href="/privacy-policy/#en"]')).toHaveText(
    "Privacy policy"
  );
  // what cannot be undone, before the costs
  const final = {
    de: "Geprägt bleibt geprägt: Ein geprägtes Item wird nie wieder ein normales.",
    en: "Minted stays minted: a minted item never becomes a plain one again.",
  };
  for (const language of ["de", "en"]) {
    const text = await page.locator(`#${language}`).innerText();
    const at = text.indexOf(final[language]);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(
      text.indexOf(await page.locator(`#costs-${language}`).innerText())
    );
  }
  // links to other sites open apart from the page and tell them nothing
  const external = page.locator('a[href^="http"]');
  expect(await external.count()).toBeGreaterThan(0);
  for (const link of await external.all()) {
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(
    page.locator(
      'a[href="https://docs.cardano.org/cardano-testnets/tools/faucet"]'
    )
  ).toHaveCount(2);
  // the way to get ADA on mainnet comes later: a note in the source, nothing on the page
  const source = await (await request.get("/guide/")).text();
  expect(source).toMatch(/<!--[^>]*mainnet[^>]*-->/i);
  // the game's own fonts, no scripts, nothing from other servers
  expect((await bangers).status()).toBe(200);
  expect(await page.evaluate(() => document.fonts.check('1em "Bangers"'))).toBe(
    true
  );
  await expect(page.locator("script")).toHaveCount(0);
  expect(foreign).toEqual([]);
});

for (const [kind, screen] of Object.entries(GUIDE_SCREENS)) {
  test(`the guide on a ${kind}: fits the width, links big enough to tap`, async ({
    browser,
  }) => {
    const context = await browser.newContext(screen);
    const page = await context.newPage();
    await page.goto("/guide/", { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const link of await page.locator("a").all()) {
      const box = await link.boundingBox();
      expect(box.height, await link.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.width, await link.innerText()).toBeGreaterThanOrEqual(44);
    }
    // the nav takes the reader to the English section
    await page.locator("nav").getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/#en$/);
    await expect(page.locator("#en h1")).toBeInViewport();
    for (const language of ["de", "en"]) {
      const box = await page.locator(`#${language}`).boundingBox();
      const scroll = await page.evaluate(() => window.scrollY);
      // a language's whole section, the German one with the nav above it
      const top = language === "de" ? 0 : box.y + scroll;
      await shotOf(page, `${kind}-${language}`, {
        x: 0,
        y: top,
        width: screen.viewport.width,
        height: box.y + scroll + box.height - top,
      });
    }
    await context.close();
  });

  test(`a link from the game lands on its section (${kind})`, async ({
    browser,
  }) => {
    const context = await browser.newContext(screen);
    const page = await context.newPage();
    await page.goto("/guide/#costs-de", { waitUntil: "networkidle" });
    const heading = page.locator("#costs-de");
    await expect(heading).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // nothing covers the heading: it is what the reader sees at its middle
    const covered = await heading.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
      return !element.contains(top);
    });
    expect(covered).toBe(false);
    await shotOf(page, `${kind}-deeplink-costs-de`);
    await context.close();
  });
}

// The Info dialog's guide link comes in a chunk of its own (Info.jsx: useChainEnabled), which the
// title screen also asks for to warm the Choclab. "No link" means something only once that chunk
// is in and React has shown what the link decided: the link's component renders a hidden mark
// once the minting switch has its answer (useMintingDecided), and the check waits for that mark.
const guideChunk = (page) =>
  page.waitForResponse((answer) =>
    /\/useChainEnabled-[^/]*\.js$/.test(answer.url())
  );
const decided = (page, minting) =>
  expect(page.getByTestId("info-guide-decided")).toHaveAttribute(
    "data-minting",
    String(minting)
  );
const statusAsked = (page) => {
  const asked = [];
  page.on("request", (sent) => {
    if (new URL(sent.url()).pathname === "/chain/status") {
      asked.push(sent.url());
    }
  });
  return asked;
};
const withApi = async (browser, options = {}) => {
  const context = await browser.newContext(options);
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  return context;
};
const openInfo = async (page) => {
  await page.locator("[data-icon=info]:visible").click();
  await expect(
    page.getByRole("link", {
      name: "Read the full privacy policy (German and English)",
    })
  ).toBeVisible();
};
const guideLinkIn = (page) =>
  page.getByRole("link", { name: "How minting works" });

test("the Info dialog: no guide link without the server", async ({ page }) => {
  // the device cannot reach an API (VITE_API_URL of the e2e build answers nothing): offline,
  // the game does not ask whether minting is on, and minting does not show
  const chunk = guideChunk(page);
  const asked = statusAsked(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await openInfo(page);
  await chunk;
  await decided(page, false);
  await expect(guideLinkIn(page)).toHaveCount(0);
  expect(asked).toEqual([]);
});

test("the Info dialog: no guide link while the server's minting is off", async ({
  browser,
}) => {
  const context = await withApi(browser);
  const page = await context.newPage();
  await page.route("**/chain/status", (route) =>
    route.fulfill({ json: { enabled: false } })
  );
  const chunk = guideChunk(page);
  const status = page.waitForResponse(
    (answer) => new URL(answer.url()).pathname === "/chain/status"
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await openInfo(page);
  await chunk;
  // the link's component asked the server, and the answer is in
  expect(await (await status).json()).toEqual({ enabled: false });
  await decided(page, false);
  await expect(guideLinkIn(page)).toHaveCount(0);
  await context.close();
});

test("the Info dialog: the guide link where minting shows, in English and German", async ({
  browser,
}) => {
  // the local API has minting on
  for (const [language, label, href] of [
    ["en", "How minting works", "/guide/#en"],
    ["de", "So funktioniert Prägen", "/guide/#de"],
  ]) {
    // the browser's language is the game's on its first start (a setting written afterwards
    // can lose against the account's language the server sends back)
    const context = await withApi(browser, { locale: localeOf(language) });
    const game = await context.newPage();
    await game.goto("/", { waitUntil: "networkidle" });
    await game.locator("[data-icon=info]:visible").click();
    const link = game.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await context.close();
  }
});

test("the Info dialog: no guide link in the Android app, the server's minting on", async ({
  browser,
}) => {
  const context = await withApi(browser);
  const page = await context.newPage();
  const chunk = guideChunk(page);
  const asked = statusAsked(page);
  await page.goto("/?app_runs_as=twa", { waitUntil: "networkidle" });
  await openInfo(page);
  await chunk;
  await decided(page, false);
  // the app shows nothing of minting, so it does not even ask the server
  expect(asked).toEqual([]);
  await expect(guideLinkIn(page)).toHaveCount(0);
  await context.close();
});
