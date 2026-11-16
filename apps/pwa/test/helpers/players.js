import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { accountOf, readSetting, writeSetting } from "./profile.js";

export { accountOf };

// every language's texts, as the server registers them
const { translateIn } = createRequire(import.meta.url)(
  "@battlechoc/battlechoc-shared-functions/i18n/all"
);

/** The game's text `key` in `language` ("de", "fr", …), its placeholders' values in order. */
export const say = (language, key, ...values) =>
  translateIn(language, key, ...values);

// the browser locale a context needs for the game to speak `language` (boot.js reads
// navigator.language)
const LOCALES = {
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  pt: "pt-BR",
  vi: "vi-VN",
};

/** The browser locale of `language` (en-US for English). */
export const localeOf = (language) => {
  if (!LOCALES[language]) {
    throw new TypeError(`localeOf: no locale for ${language}`);
  }
  return LOCALES[language];
};

// Live matches between two browsers against the local API that playwright.config.js starts
// (in-memory database, 20 s disconnect grace, AI fallback after 3 s). Each player is a separate
// browser context with its own device account; names and a first win are set up through the
// public API, as a real player would get them.
export const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

// origin: another address of the same game (passkeys need http://localhost, not an IP address);
// unlocked: three finished matches (online play needs three against the AI, shared
// progression.js), one of them a win worth more than 100 XP; false keeps the player at 0 XP and
// no matches (tutorial skipped), a new player's first matches.
// device: options of the browser context (a phone's user agent and screen).
// A retry (or --repeat-each) gets new names: the first attempt took them on the server.
export const createPlayer = async (
  browser,
  request,
  name,
  { unlocked = true, origin = "", device = {} } = {}
) => {
  const { retry, repeatEachIndex } = test.info();
  const username =
    retry || repeatEachIndex ? `${name}_${repeatEachIndex}${retry}` : name;
  const context = await browser.newContext(device);
  await context.addInitScript((url) => {
    window.localStorage.setItem("battlechoc.apiUrl", url);
  }, api);
  const page = await context.newPage();
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  expect(
    (
      await request.post(`${api}/user/username`, {
        headers,
        data: { username },
      })
    ).ok()
  ).toBe(true);
  expect(
    (await request.post(`${api}/user/tutorial/skipped`, { headers })).ok()
  ).toBe(true);
  const win = {
    id: `seed-${username}`,
    won: true,
    builtEntities: 3,
    winners: [{ idx: 0, name: username }],
    // more than 100 XP: Start queues instead of the prepared first match against the server AI
    awards: [{ key: "WINNER" }, { key: "OUVERT" }],
  };
  // with the win, four finished matches: the Choclab and online play are open (shared progression.js)
  const losses = [1, 2, 3].map((i) => ({
    id: `seed-${username}-${i}`,
    lost: true,
    builtEntities: 3,
    winners: [{ idx: 1, name: "Tom Toffee" }],
    awards: [],
  }));
  if (unlocked) {
    expect(
      (
        await request.post(`${api}/user/trackrecords`, {
          headers,
          data: { stats: [win, ...losses] },
        })
      ).ok()
    ).toBe(true);
  }
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await expect(
    page.getByText("Start Game", { exact: true }).first()
  ).toBeVisible({ timeout: 15000 });
  return { context, page, username };
};

export const host = (page, fn, arg) => page.evaluate(fn, arg);
export const phase = (page) =>
  host(page, () => window.__battlechoc.host && window.__battlechoc.host.phase);
export const inOnlineMatch = (page) =>
  page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.online &&
      window.__battlechoc.host.phase
  );

// field choice by whoever chooses, both factories, then the countdown on real time
export const toRunning = async (players) => {
  for (const { page } of players) {
    await host(page, () => {
      const h = window.__battlechoc.host;
      return h
        .submit("battlechoc/match/chooseField", { fieldIndex: 0 })
        .catch(() => null);
    });
  }
  for (const { page } of players) {
    await page.waitForFunction(
      () => window.__battlechoc.host.phase === "MatchPhase.PLACEMENT"
    );
  }
  for (const { page } of players) {
    const ok = await host(page, async () => {
      const store = window.__battlechoc;
      // the latest view comes from Redux through the scene; ask the host for a free cell
      const view = await new Promise((resolve) => {
        const check = () => {
          const v = store.view && store.view();
          if (v) {
            resolve(v);
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
      const grid = view.board.fields[view.players[view.viewer].fieldIndex].grid;
      const cell = grid.find((c) =>
        c.occupiedBy.every((e) => e.type === "EntityType.CREAM")
      );
      return store.host
        .submit("battlechoc/match/placeFactory", {
          row: cell.row,
          col: cell.col,
        })
        .then(
          () => true,
          (error) => error.message
        );
    });
    expect(ok).toBe(true);
  }
  for (const { page } of players) {
    await page.waitForFunction(
      () => window.__battlechoc.host.phase === "MatchPhase.RUNNING",
      null,
      { timeout: 15000 }
    );
  }
};

// an Android phone (Chromium with its user agent and screen): features.isMobile() holds
export const ANDROID_PHONE = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

// the device account's access to the API, for calls the test makes beside the game:
// { accessToken, headers }
export const authHeaders = async (page, request) => {
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  return { accessToken, headers: { Authorization: `Bearer ${accessToken}` } };
};

// an answer of the API that must be ok: its JSON (nothing for 204); else the test fails with it
export const ok = async (answer) => {
  expect(answer.ok(), `${answer.status()} ${await answer.text()}`).toBe(true);
  return answer.status() === 204 ? undefined : answer.json();
};

/** How many matches labPlayer reports for a player (the Choclab and online play open). */
export const LAB_PLAYER_MATCHES = 4;

/**
 * A player who finished the tutorial (the starter kit) and four matches (the Choclab is open),
 * set up through the API: { context, page, username, accessToken, headers }. The four matches
 * (LAB_PLAYER_MATCHES) are reported ones (unverified, lost against Tom Toffee, no XP of their
 * own; the finished tutorial gives 100 XP): a match played without the server counts as one
 * against the AI and moves the AI ladder (the API's players.addTrackRecords), so the ladder has
 * four games and "Start Game" does not take the prepared first match: it joins the queue, and
 * the server AI comes after LIVE_AI_FALLBACK_MS (3 s in playwright.config.js) when nobody else
 * waits. Either way the match runs on the server (mintApi.spec.js checks the path).
 * - `device`: options of the browser context;
 * - `language`: the game's language ("de", …; the context's locale);
 * - `path`: the address the page opens (e.g. "/?testclock");
 * - `intro`: true leaves the Choclab's first-visit intro unseen;
 * - `reload`: the page opens `path` again at the end (else the test loads the page itself when
 *   it needs the new state).
 * A retry (or --repeat-each) gets a new name: the first attempt took it on the server.
 */
export const labPlayer = async (
  browser,
  request,
  name,
  {
    device = {},
    language = null,
    path = "/",
    intro = false,
    reload = false,
  } = {}
) => {
  const { retry, repeatEachIndex } = test.info();
  const username =
    retry || repeatEachIndex ? `${name}_${repeatEachIndex}${retry}` : name;
  const context = await browser.newContext(
    language ? { ...device, locale: localeOf(language) } : device
  );
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    api
  );
  const page = await context.newPage();
  await page.goto(path, { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const { accessToken, headers } = await authHeaders(page, request);
  await ok(
    await request.post(`${api}/user/username`, {
      headers,
      data: { username },
    })
  );
  await ok(await request.post(`${api}/user/tutorial/finished`, { headers }));
  // four finished matches against the AI unlock the Choclab (shared progression.js)
  const matches = Array.from({ length: LAB_PLAYER_MATCHES }, (_, i) => ({
    id: `seed-${username}-${i}`,
    lost: true,
    winners: [{ idx: 1, name: "Tom Toffee" }],
    awards: [],
  }));
  await ok(
    await request.post(`${api}/user/trackrecords`, {
      headers,
      data: { stats: matches },
    })
  );
  if (!intro) {
    // the Choclab's intro (lab.spec.js) is not what most tests look at
    await writeSetting(page, "labIntroSeen", true);
    await expect.poll(() => readSetting(page, "labIntroSeen")).toBe(true);
  }
  if (reload) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  return { context, page, username, accessToken, headers };
};
