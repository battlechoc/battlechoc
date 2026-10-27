import { test, expect } from "@playwright/test";

// Live matches between two browsers against the local API that playwright.config.js starts
// (in-memory database, 20 s disconnect grace, AI fallback after 3 s). Each player is a separate
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

// firstWin: false keeps the player at 0 XP (tutorial skipped), a new player's first matches.
// A retry (or --repeat-each) gets new names: the first attempt took them on the server.
const createPlayer = async (browser, request, name, { firstWin = true } = {}) => {
  const { retry, repeatEachIndex } = test.info();
  const username = retry || repeatEachIndex ? `${name}_${repeatEachIndex}${retry}` : name;
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
    // more than 100 XP: Start queues instead of the prepared first match against the server AI
    awards: [{ key: "WINNER" }, { key: "OUVERT" }],
  };
  if (firstWin) {
    expect((await request.post(`${api}/user/trackrecords`, { headers, data: { stats: [win] } })).ok()).toBe(true);
  }
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Start Game", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  return { context, page, username };
};

const openLobby = async (page) => {
  await page.getByText("Friends", { exact: true }).first().click();
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

    // Ben's tab reloads: he is back in the same match and Anna sees him again. Like a slow
    // phone (or a busy CI runner), the page is busy right after its live socket opens, longer
    // than the server waits for the hello: the server closes the socket, and the page has to
    // connect again in time.
    const matchId = await host(anna.page, () => window.__battlechoc.host.matchId);
    await ben.context.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.WebSocket = class extends NativeWebSocket {
        constructor(...args) {
          super(...args);
          if (!window.__busyOnce) {
            window.__busyOnce = true;
            const until = Date.now() + 6000;
            while (Date.now() < until);
          }
        }
      };
    });
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
    await anna.page.waitForFunction(() => window.__battlechoc.host.phase === "MatchPhase.ENDED", null, { timeout: 35000 });
    await expect(anna.page.getByText(/You won/i).first()).toBeVisible({ timeout: 15000 });
    await anna.page.screenshot({ path: "test/output/screenshot_online_won.png" });
    await anna.context.close();
  });

  test("an invite starts a match; leaving it surrenders", async ({ browser, request }) => {
    const carla = await createPlayer(browser, request, "Carla");
    const dora = await createPlayer(browser, request, "Dora");

    await openLobby(carla.page);
    await carla.page.getByTestId("online-invite-name").fill(dora.username);
    await carla.page.getByText("Invite", { exact: true }).click();
    await expect(carla.page.getByTestId("online-invite-waiting")).toBeVisible();
    await expect(dora.page.getByTestId("incoming-invite")).toBeVisible({ timeout: 10000 });
    await expect(dora.page.getByTestId("incoming-invite")).toContainText("Carla");
    await dora.page.screenshot({ path: "test/output/screenshot_online_invite.png" });
    await dora.page.getByTestId("incoming-invite").getByText("Play", { exact: true }).click();
    await Promise.all([inOnlineMatch(carla.page), inOnlineMatch(dora.page)]);

    // no pause online: the menu says the match keeps running, and asks before it gives it up
    await carla.page.locator("[data-testid=match-banner]").waitFor({ state: "attached" });
    await carla.page.waitForFunction(() => window.__battlechoc.host.phase !== "MatchPhase.FIELD_CHOICE", null, { timeout: 20000 });
    await carla.page.locator("[data-icon=settings]:visible").first().click();
    const menu = carla.page.getByTestId("game-menu");
    await expect(menu).toContainText("Online, the match keeps running.");
    await menu.getByText("Surrender", { exact: true }).click();
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
    // the test players have 825 XP: from 800 on the server AI is Gustav Ganache
    expect(opponent).toBe("Gustav Ganache");
    await emil.context.close();
  });
});

test.describe("the highscore", () => {
  test("shows the own player even without rated matches", async ({ browser, request }) => {
    const hugo = await createPlayer(browser, request, "Hugo");
    await hugo.page.locator("[data-icon=trophy]:visible").first().click();
    // nobody has played a rated match yet (the e2e server is fresh or has only unrated players)
    const own = hugo.page.getByTestId("player-list-own");
    await expect(own).toBeVisible();
    await expect(own).toContainText("Hugo");
    await expect(own.getByTestId("player-list-rank")).toHaveText("–");
    await expect(hugo.page.getByText("1 - 1", { exact: true })).toHaveCount(0);
    await hugo.page.screenshot({ path: "test/output/screenshot_highscore_own.png" });
    await hugo.context.close();
  });
});

test.describe("the Start button", () => {
  test("a new player plays the prepared first match against the server AI and gets ingredients", async ({ browser, request }) => {
    const gina = await createPlayer(browser, request, "Gina", { firstWin: false });
    await gina.page.getByText("Start Game", { exact: true }).first().click();
    await inOnlineMatch(gina.page);
    // no queue: the server AI plays right away, on the prepared first-game board
    await expect(gina.page.getByTestId("matchmaking")).toBeHidden();
    const match = await host(gina.page, () => {
      const view = window.__battlechoc.view();
      return {
        phase: view.phase,
        size: view.board.size,
        opponent: view.players[1 - view.viewer].name,
        cacao: view.players[view.viewer].cacao,
      };
    });
    expect(match).toEqual({ phase: "MatchPhase.RUNNING", size: { rows: 6, cols: 6 }, opponent: "Tom Toffee", cacao: expect.any(Number) });
    expect(match.cacao).toBeGreaterThanOrEqual(200);
    // the end is verified by the server: the bag holds ingredients instead of the offline text
    await host(gina.page, () => window.__battlechoc.host.surrender());
    await expect(gina.page.getByText(/You lost/i).first()).toBeVisible({ timeout: 15000 });
    const skip = gina.page.locator("[data-icon=fast-forward]:visible");
    if ((await skip.count()) > 0) {
      await skip.first().click();
    }
    await expect(gina.page.getByTestId("ingredient-bag").locator('[data-ingredient="COCOA"]').first()).toBeVisible({ timeout: 15000 });
    await expect(gina.page.getByText(/only drop in online matches/i)).toHaveCount(0);
    await gina.context.close();
  });

  test("queues, and 'Play the AI now' starts a match the server hosts", async ({ browser, request }) => {
    const fiona = await createPlayer(browser, request, "Fiona");
    await fiona.page.getByText("Start Game", { exact: true }).first().click();
    await expect(fiona.page.getByTestId("matchmaking")).toBeVisible({ timeout: 10000 });
    await fiona.page.getByText("Play the AI now", { exact: true }).click();
    await inOnlineMatch(fiona.page);
    await expect(fiona.page.getByTestId("matchmaking")).toBeHidden();
    // giving up a running match still ends it verified: the first one of the day brings a fresh
    // batch of cocoa
    await toRunning([fiona]);
    await host(fiona.page, () => window.__battlechoc.host.surrender());
    await expect(fiona.page.getByText(/You lost/i).first()).toBeVisible({ timeout: 15000 });
    const skip = fiona.page.locator("[data-icon=fast-forward]:visible");
    if ((await skip.count()) > 0) {
      await skip.first().click();
    }
    const cocoa = fiona.page.getByTestId("ingredient-bag").locator('[data-ingredient="COCOA"]');
    await expect(cocoa.first()).toBeVisible({ timeout: 15000 });
    await expect(fiona.page.getByTestId("ingredient-bag")).toContainText("from Fresh batch");
    // the icons are loaded and shown
    await expect
      .poll(() => cocoa.first().locator("img").evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await fiona.page.screenshot({ path: "test/output/screenshot_online_bag.png" });
    await fiona.context.close();
  });
});
