import { test, expect } from "@playwright/test";

// Real-time single player match against Tom Toffee. The page is opened with ?testclock, which
// replaces the match clock with a manual one exposed as window.__battlechoc.host.clock, so the
// tests fast-forward match time instead of sleeping. Every test runs in a fresh browser context.
const url = "/?testclock";

const seedProfile = (page, score) =>
  page.evaluate(
    (score) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(
              Object.assign({}, get.result || {}, {
                username: "Tester",
                score,
                tutorialFinished: true,
                tutorialSkipped: true,
              }),
              "stats"
            );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    score
  );

// opens the title screen as a player who finished the tutorial (score 150: Tom Toffee, 6x6)
const openAsPlayer = async (page, score = 150) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seedProfile(page, score);
  await page.goto(url, { waitUntil: "networkidle" });
};

const clickText = (page, text) =>
  page.evaluate((text) => {
    const element = [...document.querySelectorAll("button, div")]
      .filter((e) => e.innerText && e.innerText.trim() === text)
      .pop();
    if (!element) {
      throw new Error("no element with the text " + text);
    }
    element.click();
  }, text);

const advance = (page, ms) =>
  page.evaluate((ms) => window.__battlechoc.host.clock.advance(ms), ms);
const phase = (page) => page.evaluate(() => window.__battlechoc.host.match.phase);
const waitForMatch = (page) =>
  page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, null, {
    timeout: 10000,
  });

const startMatch = async (page) => {
  await page.waitForFunction(() => document.body.innerText.includes("Start Game"));
  await clickText(page, "Start Game");
  await waitForMatch(page);
};

const chooseField = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('div[class*="button-"]')]
      .find((element) => element.querySelector('[class*="fields"]'))
      .click()
  );

const reachRunningPhase = async (page) => {
  await chooseField(page);
  await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
    return h.submit("battlechoc/match/placeFactory", { row: cell.row, col: cell.col });
  });
  await advance(page, 25000);
};

test("walks through field choice, simultaneous placement and countdown", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  expect(await phase(page)).toBe("MatchPhase.FIELD_CHOICE");
  await expect(page.getByText("Choose your field").first()).toBeVisible();
  // against the AI nothing has a deadline: the match waits for the player
  await advance(page, 60000);
  expect(await phase(page)).toBe("MatchPhase.FIELD_CHOICE");
  await chooseField(page);
  expect(await phase(page)).toBe("MatchPhase.PLACEMENT");
  await expect(page.getByTestId("match-banner")).toBeAttached();
  await expect(page.getByText("Place your chocolate factory").first()).toBeVisible();
  await advance(page, 60000);
  expect(await phase(page)).toBe("MatchPhase.PLACEMENT");
  await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
    return h.submit("battlechoc/match/placeFactory", { row: cell.row, col: cell.col });
  });
  // the AI has placed its factory by now, so the countdown starts right away
  expect(await phase(page)).toBe("MatchPhase.COUNTDOWN");
  await advance(page, 3000);
  expect(await phase(page)).toBe("MatchPhase.RUNNING");
  await expect(page.getByTestId("resource-panel")).toBeAttached();
  await expect(page.getByTestId("build-palette")).toBeAttached();
  await page.screenshot({ path: "test/output/screenshot_realtime_running.png" });
});

test("builds a cannon that turns blue after 10 s and green after 20 s", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  await reachRunningPhase(page);
  const result = await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
    return h
      .submit("battlechoc/match/build", {
        entityType: "EntityType.RUM_TRUFFLE_CANNON",
        row: cell.row,
        col: cell.col,
      })
      .then(
        () => "ok",
        (e) => e.message
      );
  });
  expect(result).toBe("ok");
  // the button counts the shots that can be fired now: none, one for cacao (with a price tag), one for free
  const cannon = page.getByTestId("weapon-truffle-cannon");
  await expect(cannon).toHaveAttribute("data-state", "charging");
  await expect(cannon).toHaveAttribute("data-available", "0");
  await expect(cannon.getByTestId("rush-price")).toHaveCount(0);
  await advance(page, 10000);
  await expect(cannon).toHaveAttribute("data-state", "rushable");
  await expect(cannon).toHaveAttribute("data-available", "1");
  await expect(cannon.getByTestId("rush-price")).toHaveText("10");
  await page.screenshot({ path: "test/output/screenshot_realtime_weapon_rushable.png" });
  await advance(page, 10000);
  await expect(cannon).toHaveAttribute("data-state", "ready");
  await expect(cannon).toHaveAttribute("data-available", "1");
  await expect(cannon.getByTestId("rush-price")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_realtime_weapon_ready.png" });
});

test("pauses when the tab is hidden and resumes after a reload", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  await reachRunningPhase(page);
  // short: the AI plays along and could end the match of a passive player
  await advance(page, 5000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("paused-overlay")).toBeAttached();
  expect(await page.evaluate(() => window.__battlechoc.host.clock.running)).toBe(false);
  const savedAt = await page.evaluate(() => window.__battlechoc.host.match.t);
  // the match is saved to IndexedDB in the background
  await page.waitForTimeout(1000);

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.includes("Start Game"));
  await clickText(page, "Start Game");
  await expect(page.getByText("Resume Game").first()).toBeVisible();
  await clickText(page, "Resume Game");
  await waitForMatch(page);
  expect(await page.evaluate(() => window.__battlechoc.host.match.t)).toBe(savedAt);
  expect(await phase(page)).toBe("MatchPhase.RUNNING");
});

test("plays against Gustav Ganache on a 10x10 board with a high score", async ({ page }) => {
  await openAsPlayer(page, 900);
  await startMatch(page);
  const setup = await page.evaluate(() => ({
    opponent: window.__battlechoc.host.match.players[1].name,
    rows: window.__battlechoc.host.match.board.size.rows,
  }));
  expect(setup).toEqual({ opponent: "Gustav Ganache", rows: 10 });
  await reachRunningPhase(page);
  for (let i = 0; i < 12; i++) {
    await advance(page, 5000);
  }
  const aiActions = await page.evaluate(
    () => window.__battlechoc.host.match.events.filter((e) => e.player === 1).length
  );
  expect(aiActions).toBeGreaterThan(5);
  await page.screenshot({ path: "test/output/screenshot_realtime_gustav.png" });
});

test("a passive player's match ends within the time limit and shows the overview", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  await reachRunningPhase(page);
  // the AI plays all along; it may win before the time limit
  await advance(page, 11 * 60 * 1000);
  expect(await phase(page)).toBe("MatchPhase.ENDED");
  const reason = await page.evaluate(() => window.__battlechoc.host.match.outcome.reason);
  if (reason === "OutcomeReason.TIME_LIMIT") {
    await expect(page.getByText("Time is up!").first()).toBeVisible();
  }
  await expect(page.getByText(/You won|You lost/i).first()).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_realtime_ended.png" });
});
