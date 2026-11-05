import { test, expect } from "@playwright/test";

// Live matches between two browsers against the local API that playwright.config.js starts; the
// players are made in helpers/players.js.
import { api, createPlayer, host, inOnlineMatch, toRunning } from "./helpers/players.js";

test.describe("online", () => {
  test("two players meet in the queue; a short disconnect resumes, a long one forfeits", async ({ browser, request }) => {
    const anna = await createPlayer(browser, request, "Anna");
    const ben = await createPlayer(browser, request, "Ben");

    // Start finds someone online (the AI only after a few seconds alone in the queue)
    await anna.page.getByText("Start Game", { exact: true }).first().click();
    await expect(anna.page.getByTestId("matchmaking")).toBeVisible({ timeout: 10000 });
    await ben.page.getByText("Start Game", { exact: true }).first().click();

    await Promise.all([inOnlineMatch(anna.page), inOnlineMatch(ben.page)]);
    await toRunning([anna, ben]);
    await anna.page.screenshot({ path: "test/output/screenshot_online_running.png" });

    // Ben's tab reloads: he is back in the same match and Anna sees him again. Like a page too
    // busy to say hello in time (a slow phone), his first hello never reaches the server: the
    // server closes the socket (HELLO_TIMEOUT), and the page has to connect again in time.
    // (Blocking the main thread for 6 s instead starved the WebGL setup on the CI runner: the
    // trace's screencast captured the title's animation through the software GPU all the while,
    // the context creation waited for that backlog, and Ben came back after the grace period.)
    const matchId = await host(anna.page, () => window.__battlechoc.host.matchId);
    await ben.context.addInitScript(() => {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (!window.__helloDropped && typeof data === "string" && data.includes('"hello"')) {
          window.__helloDropped = true;
          return undefined;
        }
        return send.call(this, data);
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

  test("an AI steps in when nobody else is looking for a match", async ({ browser, request }) => {
    const emil = await createPlayer(browser, request, "Emil");
    await emil.page.getByText("Start Game", { exact: true }).first().click();
    await inOnlineMatch(emil.page);
    const opponent = await host(emil.page, () => window.__battlechoc.view().players.find((p, i) => i !== window.__battlechoc.view().viewer).name);
    // the AI ladder: the test players' one win and three losses keep them on the first step
    expect(opponent).toBe("Tom Toffee");
    await emil.context.close();
  });
});

test.describe("the highscore", () => {
  test("ranks every named player, also without rated matches", async ({ browser, request }) => {
    const hugo = await createPlayer(browser, request, "Hugo");
    await hugo.page.locator("[data-icon=trophy]:visible").first().click();
    // unrated players show 0 and are ranked by who joined first (other specs' players come first)
    const own = hugo.page.getByTestId("player-list-own");
    await expect(own).toBeVisible();
    await expect(own).toContainText("Hugo");
    await expect(own.getByTestId("player-list-rank")).toHaveText(/^\d+\.$/);
    await hugo.page.screenshot({ path: "test/output/screenshot_highscore_own.png" });
    await hugo.context.close();
  });
});

test.describe("the Start button", () => {
  test("a new player plays the prepared first match against the server AI and gets ingredients", async ({ browser, request }) => {
    const gina = await createPlayer(browser, request, "Gina", { unlocked: false });
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

// a device without the server: the API does not answer yet; `stats` is the stored profile
const offlineDevice = async (browser, stats) => {
  const context = await browser.newContext();
  await context.addInitScript((url) => window.localStorage.setItem("battlechoc.apiUrl", url), api);
  await context.route(`${api}/**`, (route) => route.abort());
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await page.evaluate(
    (value) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          tx.objectStore("player").put(value, "stats");
          tx.oncomplete = () => resolve();
        };
      }),
    stats
  );
  await page.goto("/", { waitUntil: "networkidle" });
  return { context, page };
};

// the profile's name field, offline: the name stays on the device, marked as not on the server
const chooseNameOffline = async (page, name) => {
  await page.locator("[data-icon=user]:visible").click();
  await page.getByTestId("change-name").click();
  await page.locator("input:visible").first().fill(name);
  await page.locator("div[class^=actionButton]:visible").first().click();
  await expect(page.getByTestId("name-unsynced").filter({ visible: true })).toHaveCount(1);
  await page.locator("[data-icon=close]:visible").first().click();
};

// the profile shows the name (a long one shortened) without the mark, and the device keeps it as
// the server's
const profileName = async (page, name) => {
  await page.locator("[data-icon=user]:visible").click();
  await expect(page.getByText(name.slice(0, 12)).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("name-unsynced")).toHaveCount(0);
  const stats = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("player").objectStore("player").get("stats");
          get.onsuccess = () => resolve(get.result);
        };
      })
  );
  expect({ username: stats.username, pending: Boolean(stats.usernamePending) }).toEqual({ username: name, pending: false });
};

const uniqueName = (name) => {
  const { retry, repeatEachIndex } = test.info();
  return retry || repeatEachIndex ? `${name}_${repeatEachIndex}${retry}` : name;
};

test("a name chosen offline goes to the server once it answers, without a word", async ({ browser }) => {
  // a name no other spec registers on the shared test server
  const name = uniqueName("Philippa");
  const { context, page } = await offlineDevice(browser, { username: "Chocnonymous", score: 0, tutorialSkipped: true });
  await chooseNameOffline(page, name);
  // the next start of the app finds the server
  await context.unroute(`${api}/**`);
  await page.goto("/", { waitUntil: "networkidle" });
  await profileName(page, name);
  await expect(page.getByTestId("name-conflict")).toHaveCount(0);
  await context.close();
});

test("a name chosen offline that somebody took meanwhile is replaced by a random one", async ({ browser, request }) => {
  const mara = await createPlayer(browser, request, "Mara");
  const { context, page } = await offlineDevice(browser, { username: "Chocnonymous", score: 0, tutorialSkipped: true });
  await chooseNameOffline(page, mara.username);
  // the server answers while the app is open
  await context.unroute(`${api}/**`);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const conflict = page.getByTestId("name-conflict");
  await expect(conflict).toBeVisible({ timeout: 20000 });
  await expect(conflict).toContainText(`“${mara.username}” is already taken online`);
  const generated = (await conflict.innerText()).match(/the name “([^”]+)” instead/)[1];
  expect(generated).not.toBe(mara.username);
  await page.screenshot({ path: "test/output/screenshot_name_conflict.png" });
  await conflict.getByText("Got it", { exact: true }).click();
  await expect(conflict).toHaveCount(0);
  await profileName(page, generated);
  await mara.context.close();
  await context.close();
});

test("a device's name from before this server, taken there, is replaced on the first start", async ({ browser, request }) => {
  const olga = await createPlayer(browser, request, "Olga");
  // the stored profile has the name without the mark: it was on another server once
  const { context, page } = await offlineDevice(browser, { username: olga.username, score: 0, tutorialFinished: true });
  await context.unroute(`${api}/**`);
  await page.goto("/", { waitUntil: "networkidle" });
  const conflict = page.getByTestId("name-conflict");
  await expect(conflict).toBeVisible({ timeout: 20000 });
  await expect(conflict).toContainText(`“${olga.username}” is already taken online`);
  const generated = (await conflict.innerText()).match(/the name “([^”]+)” instead/)[1];
  await conflict.getByText("Got it", { exact: true }).click();
  await profileName(page, generated);
  // the general note about a random name does not show as well
  await expect(page.getByText("A random player name has been set for you")).toHaveCount(0);
  await olga.context.close();
  await context.close();
});
