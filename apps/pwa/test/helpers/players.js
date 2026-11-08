import { test, expect } from "@playwright/test";
import { accountOf } from "./profile.js";

export { accountOf };

// Live matches between two browsers against the local API that playwright.config.js starts
// (in-memory database, 20 s disconnect grace, AI fallback after 3 s). Each player is a separate
// browser context with its own device account; names and a first win are set up through the
// public API, as a real player would get them.
export const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

// origin: another address of the same game (passkeys need http://localhost, not an IP address);
// unlocked: three finished matches (online play needs three against the AI, shared
// progression.js), one of them a win worth more than 100 XP; false keeps the player at 0 XP and
// no matches (tutorial skipped), a new player's first matches.
// A retry (or --repeat-each) gets new names: the first attempt took them on the server.
export const createPlayer = async (
  browser,
  request,
  name,
  { unlocked = true, origin = "" } = {}
) => {
  const { retry, repeatEachIndex } = test.info();
  const username =
    retry || repeatEachIndex ? `${name}_${repeatEachIndex}${retry}` : name;
  const context = await browser.newContext();
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
