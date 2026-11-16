import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { api, labPlayer, localeOf, say } from "./helpers/players.js";
import { TIER_ITEMS, craftItem } from "./helpers/lab.js";
import { chainMinted, chainReset } from "./helpers/chain.js";
import {
  MINT,
  STAMP,
  effectLines,
  iconPartsOf,
} from "../src/ui/lab/itemText.js";
import {
  DESKTOP_VIEWPORT,
  PHONE_VIEWPORT,
  closeContexts,
  keep,
  openItemCard,
  settle,
} from "./helpers/mint.js";

// The public item page (minting plan F, src/itempage/): /item/?a=<asset name>, what a token is in
// the game, for anyone, without an account, a wallet or the service worker. A minted item comes
// from the API for real (a crafted item that chainMinted marks minted); the salvaged item and the
// API's failures are its answers fulfilled by route interception, in the API's exact shape
// (apps/api routes/items.js). The page must ask no host but its own and the API, store nothing,
// show no holder, and never say "there is no such item" for a network error.

const { Items, setCurrentLanguage } = createRequire(import.meta.url)(
  "@battlechoc/battlechoc-shared-functions"
);

// the effect lines the game writes for `effects` of `itemKey` in `language`
const effectTexts = (language, itemKey, effects) => {
  setCurrentLanguage(language);
  const lines = effectLines(itemKey, effects);
  setCurrentLanguage("en");
  return lines;
};

// the stamp's gold (itemText.js MINT.gold, #FAD25A) as the browser writes a colour
const GOLD = `rgb(${MINT.gold
  .slice(1)
  .match(/../g)
  .map((pair) => parseInt(pair, 16))
  .join(", ")})`;

const PAGE_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;
const API_ORIGIN = new URL(api).origin;
const ITEMS_ROUTE = `${api}/items/*`;

// the API's 200 for a salvaged item and its errors, as Task 2 captured them
const SALVAGED = {
  assetName: `000de140${"a71e".repeat(14)}`,
  item: "LIGHT_BARREL",
  entityType: "EntityType.RUM_TRUFFLE_CANNON",
  tier: "COMMON",
  points: 2,
  serial: 12,
  mintedAt: 1794735012345,
  burnedAt: 1794852245006,
  effects: [
    { stat: "cooldownMs", factor: 0.8 },
    { stat: "damage", factor: 0.85 },
  ],
};
const ANSWER_KEYS = [
  "assetName",
  "burnedAt",
  "effects",
  "entityType",
  "item",
  "mintedAt",
  "points",
  "serial",
  "tier",
];
// a name in the right form that no item has
const NOBODYS = `000de140${"0b".repeat(28)}`;

const fulfil = (route, status, body, { cache = "no-store" } = {}) =>
  route.fulfill({
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "access-control-allow-origin": PAGE_ORIGIN,
      vary: "Origin",
    },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------------------------
// The owner's screenshots, only when MINT_SHOTS_DIR names a folder (outside the repository):
// f-<nn>-<state>-<phone|desktop>-<language>.png, the states in the order a reader may meet them

const SHOTS_DIR = process.env.MINT_SHOTS_DIR || null;
const STATES = ["loading", "minted", "salvaged", "unknown", "unavailable"];

const shot = async (page, state, kind, language) => {
  if (!SHOTS_DIR) {
    return;
  }
  const index = STATES.indexOf(state);
  if (index < 0) {
    throw new Error(`shot: no state ${state}`);
  }
  mkdirSync(SHOTS_DIR, { recursive: true });
  await settle(page);
  await page.screenshot({
    path: path.join(
      SHOTS_DIR,
      `f-${String(index + 1).padStart(2, "0")}-${state}-${kind}-${language}.png`
    ),
    fullPage: true,
    animations: "disabled",
  });
};

// ---------------------------------------------------------------------------------------------
// A reader: a fresh browser (nothing of the game in it), a phone held upright or a desktop, in
// `language`; the requests the page sends are kept

const SCREENS = {
  phone: {
    viewport: PHONE_VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: DESKTOP_VIEWPORT },
};

const reader = async (browser, { language = "en", kind = "desktop" } = {}) => {
  const context = keep(
    await browser.newContext({ ...SCREENS[kind], locale: localeOf(language) })
  );
  // the e2e build's API is a dead address: the local one, as for every online test
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const page = await context.newPage();
  const requests = [];
  page.on("request", (sent) => requests.push(sent.url()));
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss().catch(() => {});
  });
  return { context, page, requests, dialogs };
};

const open = (page, a) =>
  page.goto(typeof a === "string" ? `/item/?a=${a}` : "/item/", {
    waitUntil: "domcontentloaded",
  });

const settled = (page) =>
  expect(page.locator("#item")).not.toHaveAttribute("data-state", "loading");

// every request went to the page's own origin or the API
const expectOnlyOwnHosts = (requests) => {
  const hosts = new Set(requests.map((url) => new URL(url).origin));
  for (const host of hosts) {
    expect([PAGE_ORIGIN, API_ORIGIN], `a request to ${host}`).toContain(host);
  }
};

const itemRequests = (requests) =>
  requests.filter((url) => url.startsWith(`${api}/items/`));

// what the page left in the browser: only the API address the test put there
const storedBy = (page) =>
  page.evaluate(async () => ({
    local: Object.keys(window.localStorage),
    session: window.sessionStorage.length,
    cookie: document.cookie,
    databases: indexedDB.databases
      ? (await indexedDB.databases()).map((db) => db.name)
      : [],
    caches: await caches.keys(),
  }));

// nothing wider than the screen, no text cut off, every tap target at least 44 px
const expectLaidOut = async (page) => {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const outside = [];
    const clipped = [];
    for (const node of document.querySelectorAll("body *")) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      if (box.left < -0.5 || box.right > width + 0.5) {
        outside.push(node.getAttribute("data-testid") || node.className);
      }
      if (
        node.children.length === 0 &&
        node.textContent.trim() !== "" &&
        node.scrollWidth > node.clientWidth + 1 &&
        getComputedStyle(node).display !== "inline"
      ) {
        clipped.push(node.textContent.trim());
      }
    }
    const targets = [...document.querySelectorAll("a, button")]
      .filter((node) => node.offsetParent !== null)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          text: node.textContent.trim(),
          width: box.width,
          height: box.height,
        };
      });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      width,
      outside,
      clipped,
      targets,
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.outside).toEqual([]);
  expect(layout.clipped).toEqual([]);
  for (const target of layout.targets) {
    expect(target.height, target.text).toBeGreaterThanOrEqual(44);
    expect(target.width, target.text).toBeGreaterThanOrEqual(44);
  }
};

// the stamp's three rings (STAMP.ring: the gold rim, the dark ring, the outer gold one) as the
// browser resolved their spreads, in px
const ringSpreads = (ring) =>
  ring.evaluate((node) =>
    getComputedStyle(node)
      .boxShadow.split(/,(?![^(]*\))/)
      .map((shadow) => {
        const numbers = shadow.replace(/rgba?\([^)]*\)/, "").match(/[\d.]+px/g);
        return {
          colour: (shadow.match(/rgba?\([^)]*\)/) || [""])[0],
          spread: parseFloat(numbers[3]),
          inset: shadow.includes("inset"),
        };
      })
  );

test.afterEach(async ({ request }) => {
  await closeContexts();
  await chainReset(request);
});

test("a minted item: its icon with the stamp, name, serial, today's effects, how to use it, and no holder", async ({
  browser,
  request,
}) => {
  const ida = await labPlayer(browser, request, "ItemPageIda");
  keep(ida.context);
  const item = await craftItem(request, ida, TIER_ITEMS.EPIC);
  const assetName = await chainMinted(request, {
    username: ida.username,
    itemId: item.id,
    to: "stranger",
  });
  expect(assetName).toMatch(/^000de140[0-9a-f]{56}$/);
  await ida.context.close();
  const effects = Items[item.item].effects;

  const readings = [
    ["en", "desktop"],
    ["de", "phone"],
    ["de", "desktop"],
    ["fr", "phone"],
    ["fr", "desktop"],
    ["vi", "phone"],
    ["ja", "phone"],
  ];
  for (const [language, kind] of readings) {
    const { page, requests, dialogs } = await reader(browser, {
      language,
      kind,
    });
    const answered = page.waitForResponse(`${api}/items/${assetName}`);
    await open(page, assetName);
    const answer = await answered;
    expect(answer.status()).toBe(200);
    // the API's answer has the contract's keys and nothing of the player
    const body = await answer.json();
    expect(Object.keys(body).sort()).toEqual(ANSWER_KEYS);
    expect(JSON.stringify(body)).not.toContain(ida.username);
    await expect(page.locator("#item")).toHaveAttribute("data-state", "item");

    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByTestId("item-name")).toHaveText(
      say(language, `ITEM_${item.item}`)
    );
    await expect(page).toHaveTitle(
      `${say(language, `ITEM_${item.item}`)} · battlechoc`
    );
    // the serial from the craft (other specs craft in the same database)
    const serial = say(language, "ITEM_SERIAL", item.serial);
    await expect(page.getByTestId("item-tag")).toHaveText(serial);
    await expect(page.getByTestId("item-line")).toContainText(
      `${serial} · ${say(language, "LAB_TIER_EPIC")} · ${say(language, "LAB_POINTS", 5)}`
    );
    // the day of the mint, never a time of day
    const today = new Intl.DateTimeFormat(language, {
      dateStyle: "long",
    }).format(new Date(body.mintedAt));
    await expect(page.getByTestId("item-line")).toContainText(
      say(language, "ITEM_PAGE_MINTED_ON", today)
    );
    await expect(page.getByTestId("item-line")).not.toContainText(/\d:\d\d/);
    // serial · tier · points on one line, the day on its own: no line starts or ends with "·"
    expect(
      await page
        .locator("[data-testid=item-line] .part")
        .evaluateAll((parts) => parts.map((part) => part.textContent))
    ).toEqual([
      `${serial} · ${say(language, "LAB_TIER_EPIC")} · ${say(language, "LAB_POINTS", 5)}`,
      say(language, "ITEM_PAGE_MINTED_ON", today),
    ]);
    // the result's heading has the focus: a screen reader reads what arrived
    expect(
      await page.evaluate(() => document.activeElement.dataset.testid)
    ).toBe("item-name");
    // the API's effects (today's balance) in the game's words, green what helps, red the price
    const lines = effectTexts(language, item.item, body.effects);
    expect(lines).toHaveLength(effects.length);
    await expect(page.getByTestId("item-effect")).toHaveText(
      lines.map((line) => line.text)
    );
    expect(
      await page
        .getByTestId("item-effect")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.good))
    ).toEqual(lines.map((line) => String(line.good)));
    await expect(page.getByTestId("item-building")).toHaveText(
      say(
        language,
        "ITEM_PAGE_BUILDING",
        say(language, "TOOLTIP_BUILDING_TITLE", Items[item.item].entityType)
      )
    );
    await expect(page.getByTestId("item-how")).toContainText(
      say(language, "ITEM_PAGE_HOW_TEXT")
    );
    await expect(page.getByTestId("item-no-owner")).toHaveText(
      say(language, "ITEM_PAGE_NO_OWNER")
    );
    const play = page.getByTestId("item-play");
    await expect(play).toHaveText(say(language, "ITEM_PAGE_PLAY"));
    expect(new URL(await play.evaluate((link) => link.href)).pathname).toBe(
      "/"
    );

    // the icon as the game draws it: the building's picture loaded, the badge over the stamp;
    // the token's picture (public/items/) is never asked for
    const parts = iconPartsOf(item.item);
    const building = page.getByTestId("item-building-picture");
    await expect
      .poll(() => building.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(await building.evaluate((image) => image.src)).toBe(
      `${PAGE_ORIGIN}${parts.building}`
    );
    await expect(page.locator("#item img.badge")).toHaveCount(1);
    expect(
      await page.locator("#item img.badge").evaluate((image) => image.src)
    ).toBe(`${PAGE_ORIGIN}${parts.badge}`);
    expect(
      requests.filter((url) => url.includes("/items/") && !url.startsWith(api))
    ).toEqual([]);
    // the stamp: a gold rim, a dark ring and the outer gold ring, none of them a hairline
    const [rim, dark, outer] = await ringSpreads(page.getByTestId("item-ring"));
    expect(rim).toMatchObject({ colour: GOLD, inset: true });
    expect(rim.spread).toBeGreaterThanOrEqual(6);
    expect(dark.spread).toBeGreaterThanOrEqual(3);
    expect(outer.spread - dark.spread).toBeGreaterThanOrEqual(5);

    // nothing of the player, nothing stored, no other host, no prompt
    await expect(page.locator("body")).not.toContainText(ida.username);
    expect(itemRequests(requests)).toEqual([`${api}/items/${assetName}`]);
    expectOnlyOwnHosts(requests);
    expect(await storedBy(page)).toEqual({
      local: ["battlechoc.apiUrl"],
      session: 0,
      cookie: "",
      databases: [],
      caches: [],
    });
    expect(dialogs).toEqual([]);
    await expectLaidOut(page);
    await shot(page, "minted", kind, language);
  }
});

test("while the item loads: a neutral circle where the item's goes, and nothing moves when it arrives", async ({
  browser,
}) => {
  const { page } = await reader(browser, { language: "de", kind: "phone" });
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(ITEMS_ROUTE, async (route) => {
    await held;
    await fulfil(route, 200, { ...SALVAGED, burnedAt: null });
  });
  await open(page, SALVAGED.assetName);
  const waiting = page.getByTestId("item-loading");
  await expect(waiting).toBeVisible();
  await expect(page.locator("#item")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#item")).not.toContainText(/\S/);
  await shot(page, "loading", "phone", "de");
  const before = await waiting.boundingBox();
  release();
  await expect(page.locator("#item")).toHaveAttribute("data-state", "item");
  await expect(page.locator("#item")).toHaveAttribute("aria-busy", "false");
  expect(await page.getByTestId("item-ring").boundingBox()).toEqual(before);
});

test("a salvaged item: its icon without the stamp, the salvaged sentence, still its name and what it was", async ({
  browser,
}) => {
  for (const [language, kind] of [
    ["de", "phone"],
    ["de", "desktop"],
    ["fr", "phone"],
    ["fr", "desktop"],
  ]) {
    const { page, requests } = await reader(browser, { language, kind });
    await page.route(ITEMS_ROUTE, (route) =>
      fulfil(route, 200, SALVAGED, { cache: "public, max-age=60" })
    );
    await open(page, SALVAGED.assetName);
    await expect(page.locator("#item")).toHaveAttribute(
      "data-state",
      "salvaged"
    );
    await expect(page.getByTestId("item-salvaged")).toHaveText(
      say(language, "ITEM_PAGE_SALVAGED")
    );
    await expect(page.getByTestId("item-name")).toHaveText(
      say(language, "ITEM_LIGHT_BARREL")
    );
    await expect(page.getByTestId("item-line")).toContainText(
      say(language, "ITEM_SERIAL", 12)
    );
    await expect(page.getByTestId("item-effect")).toHaveText(
      effectTexts(language, SALVAGED.item, SALVAGED.effects).map(
        (line) => line.text
      )
    );
    // the icon as the game draws an item that is gone: the building grey, a light dashed rim; no
    // stamp, no tag, no badge, nothing about using it
    const building = page.getByTestId("item-building-picture");
    await expect
      .poll(() => building.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await building.evaluate((image) => getComputedStyle(image).filter)
    ).toBe(STAMP.away.picture);
    await expect(page.getByTestId("item-away-rim")).toHaveCount(1);
    expect(
      await page
        .getByTestId("item-away-rim")
        .evaluate((node) => getComputedStyle(node).borderTopStyle)
    ).toBe("dashed");
    await expect(page.getByTestId("item-ring")).toHaveCount(0);
    await expect(page.getByTestId("item-tag")).toHaveCount(0);
    await expect(page.locator("#item img.badge")).toHaveCount(0);
    await expect(page.getByTestId("item-how")).toHaveCount(0);
    await expect(page.getByTestId("item-play")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      say(language, "ITEM_PAGE_UNKNOWN")
    );
    expect(itemRequests(requests)).toEqual([
      `${api}/items/${SALVAGED.assetName}`,
    ]);
    await expectLaidOut(page);
    await shot(page, "salvaged", kind, language);
  }
});

test("an unknown item: the unknown sentence and the way to the game; a hostile or missing name is never sent", async ({
  browser,
}) => {
  for (const [language, kind] of [
    ["de", "phone"],
    ["de", "desktop"],
    ["fr", "phone"],
    ["fr", "desktop"],
  ]) {
    const { page, requests } = await reader(browser, { language, kind });
    const answered = page.waitForResponse(`${api}/items/${NOBODYS}`);
    await open(page, NOBODYS);
    expect((await answered).status()).toBe(404);
    expect(itemRequests(requests)).toEqual([`${api}/items/${NOBODYS}`]);
    await expect(page.locator("#item")).toHaveAttribute(
      "data-state",
      "unknown"
    );
    await expect(page.getByTestId("item-unknown")).toHaveText(
      say(language, "ITEM_PAGE_UNKNOWN")
    );
    await expect(page.getByTestId("item-play")).toHaveText(
      say(language, "ITEM_PAGE_PLAY")
    );
    await expect(page.getByTestId("item-retry")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      say(language, "ITEM_PAGE_UNKNOWN")
    );
    expect(
      await page.evaluate(() => document.activeElement.dataset.testid)
    ).toBe("item-unknown");
    await expectLaidOut(page);
    await shot(page, "unknown", kind, language);
  }

  const hostile = [
    "<script>window.pwned=1</script>",
    encodeURIComponent("<img src=x onerror=window.pwned=1>"),
    `${NOBODYS.toUpperCase()}`,
    `${NOBODYS}/../../user`,
    encodeURIComponent(`${NOBODYS}\n`),
    `000643b0${NOBODYS.slice(8)}`,
    "",
    undefined,
  ];
  const { page, requests, dialogs } = await reader(browser);
  for (const a of hostile) {
    await open(page, a);
    await settled(page);
    await expect(page.locator("#item")).toHaveAttribute(
      "data-state",
      "unknown"
    );
    await expect(page.getByTestId("item-unknown")).toHaveText(
      say("en", "ITEM_PAGE_UNKNOWN")
    );
    // shown nowhere, run nowhere
    await expect(page.locator("body")).not.toContainText("pwned");
    await expect(page.locator("#item img")).toHaveCount(0);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  }
  expect(itemRequests(requests)).toEqual([]);
  expectOnlyOwnHosts(requests);
  expect(dialogs).toEqual([]);
});

test("the API unreachable, slow, limiting or failing: 'could not load right now' and a retry, never 'no such item'", async ({
  browser,
}) => {
  const failures = [
    ["unreachable", (route) => route.abort("failed")],
    ["limited", (route) => fulfil(route, 429, { error: "TOO MANY REQUESTS" })],
    [
      "failing",
      (route) => fulfil(route, 500, { error: "INTERNAL SERVER ERROR" }),
    ],
    // an API without the route (an older one): its 404 is no answer about the item
    ["no route", (route) => fulfil(route, 404, { error: "NOT FOUND" })],
  ];
  for (const [what, failure] of failures) {
    const { page } = await reader(browser, { language: "de" });
    await page.route(ITEMS_ROUTE, failure);
    await open(page, SALVAGED.assetName);
    await expect(page.locator("#item"), what).toHaveAttribute(
      "data-state",
      "unavailable"
    );
    await expect(page.getByTestId("item-unavailable")).toHaveText(
      say("de", "ITEM_PAGE_UNAVAILABLE")
    );
    await expect(page.locator("body")).not.toContainText(
      say("de", "ITEM_PAGE_UNKNOWN")
    );
    await expect(page.getByTestId("item-retry")).toHaveText(
      say("de", "MINT_AGAIN")
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      say("de", "ITEM_PAGE_UNAVAILABLE")
    );
  }

  // slow: after the page's 10 s it gives up, and the retry asks again and shows the item
  for (const [language, kind] of [
    ["de", "phone"],
    ["de", "desktop"],
    ["fr", "phone"],
    ["fr", "desktop"],
  ]) {
    const { page, requests } = await reader(browser, { language, kind });
    await page.clock.install();
    let answers = 0;
    await page.route(ITEMS_ROUTE, async (route) => {
      answers += 1;
      if (answers > 1) {
        await fulfil(route, 200, { ...SALVAGED, burnedAt: null });
      }
      // the first one never answers
    });
    await open(page, SALVAGED.assetName);
    await expect(page.getByTestId("item-loading")).toBeVisible();
    await expect.poll(() => answers).toBe(1);
    await page.clock.runFor(9000);
    await expect(page.locator("#item")).toHaveAttribute(
      "data-state",
      "loading"
    );
    await page.clock.runFor(1500);
    await expect(page.locator("#item")).toHaveAttribute(
      "data-state",
      "unavailable"
    );
    await expect(page.getByTestId("item-unavailable")).toHaveText(
      say(language, "ITEM_PAGE_UNAVAILABLE")
    );
    await expectLaidOut(page);
    // the screenshot waits for animation frames, which the installed clock holds
    await page.clock.resume();
    await shot(page, "unavailable", kind, language);
    await page.getByTestId("item-retry").click();
    await expect(page.locator("#item")).toHaveAttribute("data-state", "item");
    await expect(page.getByTestId("item-name")).toHaveText(
      say(language, "ITEM_LIGHT_BARREL")
    );
    expect(itemRequests(requests)).toHaveLength(2);
  }
});

test("the minted-on day may wrap on a narrow phone; the facts stay on one line", async ({
  browser,
}) => {
  // Spanish has the longest month: "acuñado el 30 de septiembre de 2026" in bold, on a 360 px
  // phone and on the narrowest one still sold (320 px), where it no longer fits one line
  const mintedAt = new Date(2026, 8, 30, 12).getTime();
  const day = new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(
    new Date(mintedAt)
  );
  expect(day).toContain("septiembre");
  for (const width of [360, 320]) {
    const context = keep(
      await browser.newContext({
        ...SCREENS.phone,
        viewport: { width, height: 740 },
        locale: localeOf("es"),
      })
    );
    await context.addInitScript(
      (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
      api
    );
    const page = await context.newPage();
    await page.route(ITEMS_ROUTE, (route) =>
      fulfil(route, 200, { ...SALVAGED, mintedAt, burnedAt: null })
    );
    await open(page, SALVAGED.assetName);
    await expect(page.locator("#item")).toHaveAttribute("data-state", "item");
    const parts = page.locator("[data-testid=item-line] .part");
    await expect(parts).toHaveText([
      `${say("es", "ITEM_SERIAL", 12)} · ${say("es", "LAB_TIER_COMMON")} · ${say("es", "LAB_POINTS", 2)}`,
      say("es", "ITEM_PAGE_MINTED_ON", day),
    ]);
    // the facts on one line
    const lineHeight = await parts
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
    expect(
      (await parts.first().boundingBox()).height,
      `${width} px`
    ).toBeLessThan(lineHeight * 1.5);
    // the line stays inside the page's column (not in its side padding): the day wraps instead
    const column = await page.locator("#item").evaluate((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        left: box.left + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.paddingRight),
      };
    });
    const line = await page.getByTestId("item-line").boundingBox();
    expect(line.x, `${width} px`).toBeGreaterThanOrEqual(column.left - 0.5);
    expect(line.x + line.width, `${width} px`).toBeLessThanOrEqual(
      column.right + 0.5
    );
    await expectLaidOut(page);
  }
});

test("the privacy policy is a tap away, in the reader's language's section", async ({
  browser,
}) => {
  for (const [language, section] of [
    ["de", "de"],
    ["en", "en"],
    ["fr", "en"],
  ]) {
    const { page } = await reader(browser, { language, kind: "phone" });
    await page.route(ITEMS_ROUTE, (route) =>
      fulfil(route, 200, { ...SALVAGED, burnedAt: null })
    );
    await open(page, SALVAGED.assetName);
    await expect(page.locator("#item")).toHaveAttribute("data-state", "item");
    const link = page.getByTestId("item-privacy");
    await expect(link).toHaveText(say(language, "INFO_PRIVACY_POLICY"));
    expect(new URL(await link.evaluate((node) => node.href)).pathname).toBe(
      "/privacy-policy/"
    );
    expect(new URL(await link.evaluate((node) => node.href)).hash).toBe(
      `#${section}`
    );
    await expectLaidOut(page);
  }
  // also where the page has no item to show
  const { page } = await reader(browser, { language: "de" });
  await open(page, NOBODYS);
  await expect(page.locator("#item")).toHaveAttribute("data-state", "unknown");
  await expect(page.getByTestId("item-privacy")).toHaveAttribute(
    "href",
    "/privacy-policy/#de"
  );
});

// The Android app (TWA, apps/android/twa-manifest.json) opens every battlechoc.com link itself:
// an item link tapped in a chat starts the app on the item page, with the app's referrer and
// without the start address's app_runs_as=twa. The game behind "Play battlechoc" must still know
// it runs in the app: nothing of the chain there (no Mint, no guide link, no wallet box).
// Chromium sends no android-app:// referrer a test could set, so the app's is put in place of
// document.referrer on the item page (as Chrome reports it inside the app).
const ANDROID_REFERRER = "android-app://com.battlechoc.game/";

test("an item link opened in the Android app: the page and the game behind Play show nothing of minting", async ({
  browser,
  request,
}) => {
  const kim = await labPlayer(browser, request, "ItemPageKim");
  keep(kim.context);
  const item = await craftItem(request, kim, TIER_ITEMS.RARE);
  await kim.page.close();
  // the control first (a browser, the local API's minting on), then the app; each a tab of its
  // own, as the app's mark lives in the tab (sessionStorage)
  for (const inApp of [false, true]) {
    const page = await kim.context.newPage();
    await page.route(ITEMS_ROUTE, (route) =>
      fulfil(route, 200, { ...SALVAGED, burnedAt: null })
    );
    if (inApp) {
      await page.addInitScript((referrer) => {
        if (window.location.pathname === "/item/") {
          Object.defineProperty(Document.prototype, "referrer", {
            get: () => referrer,
            configurable: true,
          });
        }
      }, ANDROID_REFERRER);
    }
    await page.goto(`/item/?a=${SALVAGED.assetName}`, {
      waitUntil: "domcontentloaded",
    });
    expect(await page.evaluate(() => document.referrer)).toBe(
      inApp ? ANDROID_REFERRER : ""
    );
    await expect(page.locator("#item")).toHaveAttribute("data-state", "item");
    // how to use it means connecting a wallet: not in the app
    await expect(page.getByTestId("item-how")).toHaveCount(inApp ? 0 : 1);

    await page.getByTestId("item-play").click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.locator("[data-icon=info]:visible").click();
    await expect(page.getByTestId("info-guide-decided")).toHaveAttribute(
      "data-minting",
      String(!inApp)
    );
    await expect(page.getByTestId("info-guide")).toHaveCount(inApp ? 0 : 1);

    // the Choclab's card of a plain item: Mint only in the browser (the same tab, started again)
    await page.goto("/", { waitUntil: "networkidle" });
    await openItemCard(page, item.item);
    await expect(page.getByTestId("item-card")).toContainText(
      say("en", "ITEM_SERIAL", item.serial)
    );
    if (inApp) {
      await expect(page.getByTestId("mint-open")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("mint-open")).toBeVisible();
    }
    await page.close();
  }
});
