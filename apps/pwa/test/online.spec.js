import { test, expect } from "@playwright/test";

// Live matches between two browsers against the local API that playwright.config.js starts
// (in-memory database, 6 s disconnect grace, AI fallback after 3 s). Each player is a separate
// browser context with its own device account; names and a first win are set up through the
// public API, as a real player would get them.
const api = `http://127.0.0.1:${process.env.API_PORT || 8091}`;

const accountOf = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("player").objectStore("player").get("account");
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

const createPlayer = async (browser, request, username) => {
  const context = await browser.newContext();
  await context.addInitScript((url) => {
    window.localStorage.setItem("battlechoc.apiUrl", url);
  }, api);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  expect((await request.post(`${api}/user/username`, { headers, data: { username } })).ok()).toBe(true);
  expect((await request.post(`${api}/user/tutorial/skipped`, { headers })).ok()).toBe(true);
  const win = {
    id: `seed-${username}`,
    won: true,
    builtEntities: 3,
    winners: [{ idx: 0, name: username }],
    awards: [{ key: "WINNER" }],
  };
  expect((await request.post(`${api}/user/trackrecords`, { headers, data: { stats: [win] } })).ok()).toBe(true);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Play online", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  return { context, page, username };
};

const openLobby = async (page) => {
  await page.getByText("Play online", { exact: true }).first().click();
  await expect(page.getByTestId("online-lobby")).toBeVisible();
  await expect(page.getByTestId("online-unavailable")).toHaveCount(0, { timeout: 10000 });
};

const host = (page, fn, arg) => page.evaluate(fn, arg);
const phase = (page) => host(page, () => window.__battlechoc.host && window.__battlechoc.host.phase);
const inOnlineMatch = (page) =>
  page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host && window.__battlechoc.host.online && window.__battlechoc.host.phase);

// field choice by whoever chooses, both factories, then the countdown on real time
const toRunning = async (players) => {
  for (const { page } of players) {
    await host(page, () => {
      const h = window.__battlechoc.host;
      return h.submit("battlechoc/match/chooseField", { fieldIndex: 0 }).catch(() => null);
    });
  }
  for (const { page } of players) {
    await page.waitForFunction(() => window.__battlechoc.host.phase === "MatchPhase.PLACEMENT");
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
      const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
      return store.host.submit("battlechoc/match/placeFactory", { row: cell.row, col: cell.col }).then(
        () => true,
        (error) => error.message
      );
    });
    expect(ok).toBe(true);
  }
  for (const { page } of players) {
    await page.waitForFunction(() => window.__battlechoc.host.phase === "MatchPhase.RUNNING", null, { timeout: 15000 });
  }
};

test.describe("online", () => {
  test("two players meet in the queue; a short disconnect resumes, a long one forfeits", async ({ browser, request }) => {
    const anna = await createPlayer(browser, request, "Anna");
    const ben = await createPlayer(browser, request, "Ben");

    await openLobby(anna.page);
    await anna.page.getByText("Random opponent", { exact: true }).click();
    await expect(anna.page.getByTestId("online-searching")).toBeVisible();
    await openLobby(ben.page);
    await ben.page.getByText("Random opponent", { exact: true }).click();

    await Promise.all([inOnlineMatch(anna.page), inOnlineMatch(ben.page)]);
    await toRunning([anna, ben]);
    await anna.page.screenshot({ path: "test/output/screenshot_online_running.png" });

    // Ben's tab reloads: he is back in the same match and Anna sees him again
    const matchId = await host(anna.page, () => window.__battlechoc.host.matchId);
    await ben.page.reload({ waitUntil: "networkidle" });
    await ben.page.waitForFunction(
      (id) => window.__battlechoc && window.__battlechoc.host && window.__battlechoc.host.matchId === id && window.__battlechoc.host.phase === "MatchPhase.RUNNING",
      matchId,
      { timeout: 15000 }
    );
    await expect(anna.page.getByTestId("opponent-left")).toHaveCount(0, { timeout: 10000 });

    // Ben is gone for good: after the grace period Anna wins
    await ben.context.close();
    await expect(anna.page.getByTestId("opponent-left")).toBeVisible({ timeout: 15000 });
    await anna.page.waitForFunction(() => window.__battlechoc.host.phase === "MatchPhase.ENDED", null, { timeout: 20000 });
    await expect(anna.page.getByText(/You won/i).first()).toBeVisible({ timeout: 15000 });
    await anna.page.screenshot({ path: "test/output/screenshot_online_won.png" });
    await anna.context.close();
  });

  test("an invite starts a match; leaving it surrenders", async ({ browser, request }) => {
    const carla = await createPlayer(browser, request, "Carla");
    const dora = await createPlayer(browser, request, "Dora");

    await openLobby(carla.page);
    await carla.page.getByTestId("online-invite-name").fill("Dora");
    await carla.page.getByText("Invite", { exact: true }).click();
    await expect(carla.page.getByTestId("online-invite-waiting")).toBeVisible();
    await expect(dora.page.getByTestId("incoming-invite")).toBeVisible({ timeout: 10000 });
    await expect(dora.page.getByTestId("incoming-invite")).toContainText("Carla");
    await dora.page.screenshot({ path: "test/output/screenshot_online_invite.png" });
    await dora.page.getByTestId("incoming-invite").getByText("Play", { exact: true }).click();
    await Promise.all([inOnlineMatch(carla.page), inOnlineMatch(dora.page)]);

    // no pause online; the back button asks before it gives the match up
    await carla.page.locator("[data-testid=match-banner]").waitFor({ state: "attached" });
    await carla.page.waitForFunction(() => window.__battlechoc.host.phase !== "MatchPhase.FIELD_CHOICE", null, { timeout: 20000 });
    const back = carla.page.locator("[data-icon=back]:visible").first();
    await back.click();
    await expect(carla.page.getByTestId("confirm-leave")).toBeVisible();
    await carla.page.getByTestId("confirm-leave").getByText("Surrender", { exact: true }).click();
    await dora.page.waitForFunction(() => window.__battlechoc.host.phase === "MatchPhase.ENDED", null, { timeout: 15000 });
    await expect(dora.page.getByText(/You won/i).first()).toBeVisible({ timeout: 15000 });
    await carla.context.close();
    await dora.context.close();
  });

  test("an AI steps in when nobody else is looking for a match", async ({ browser, request }) => {
    const emil = await createPlayer(browser, request, "Emil");
    await openLobby(emil.page);
    await emil.page.getByText("Random opponent", { exact: true }).click();
    await inOnlineMatch(emil.page);
    const opponent = await host(emil.page, () => window.__battlechoc.view().players.find((p, i) => i !== window.__battlechoc.view().viewer).name);
    expect(opponent).toBe("Tom Toffee");
    await emil.context.close();
  });
});
