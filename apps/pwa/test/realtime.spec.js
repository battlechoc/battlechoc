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

test("the menu pauses a match against the AI; the preview switches the boards", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  await reachRunningPhase(page);
  // one button at the top left: the menu, with everything the bar used to show
  await expect(page.locator("[data-icon=pause]:visible")).toHaveCount(0);
  await expect(page.locator("[data-icon=swap-view]:visible")).toHaveCount(0);
  await page.locator("[data-icon=settings]:visible").first().click();
  const menu = page.getByTestId("game-menu");
  await expect(menu).toContainText("The match is paused.");
  expect(await page.evaluate(() => window.__battlechoc.host.userPaused)).toBe(true);
  await page.screenshot({ path: "test/output/screenshot_realtime_menu.png" });
  await menu.getByText("Resume", { exact: true }).click();
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => window.__battlechoc.host.userPaused)).toBe(false);

  // the preview shows the board not in view; tapping it switches
  const preview = page.getByTestId("board-preview");
  await expect(preview).toHaveAttribute("data-board", "opponent");
  await preview.click();
  await expect(preview).toHaveAttribute("data-board", "own");
  await page.screenshot({ path: "test/output/screenshot_realtime_preview.png" });
  await preview.click();
  await expect(preview).toHaveAttribute("data-board", "opponent");
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
  // the achievements count up as XP; offline the ingredient bag stays empty and says why
  await expect(page.locator('[class^="overview"] [class^="coins"]')).toHaveCount(0);
  await page.locator("[data-icon=fast-forward]:visible").first().click();
  await expect(page.getByTestId("ingredient-bag")).toContainText("Ingredients only drop in online matches");
  await page.screenshot({ path: "test/output/screenshot_realtime_ended.png" });
});

test("the first match unlocks two buildings with one dialog that leads to the demos", async ({ page }) => {
  await openAsPlayer(page, 0);
  await startMatch(page);
  // the prepared first game runs from the start; the passive player's match ends in time
  await advance(page, 11 * 60 * 1000);
  expect(await phase(page)).toBe("MatchPhase.ENDED");
  await expect(page.getByText(/You won|You lost/i).first()).toBeVisible();
  await page.locator("[data-icon=fast-forward]:visible").first().click();
  await page.locator("[data-icon=done]:visible").first().click();
  const unlocked = page.getByTestId("unlocked");
  await expect(unlocked).toHaveAttribute("data-step", "buildings");
  await expect(unlocked).toContainText("New buildings for you:");
  await expect(unlocked.getByTestId("unlocked-building")).toHaveText(["Factory extension", "Chocolate fountain"]);
  // the Choclab and online play take two more matches
  await expect(unlocked).toContainText("2 more matches against the AI unlock the Choclab and online matches.");
  await expect(page.getByText("New features unlocked: Choclab and Friends!")).toHaveCount(0);
  await expect(page.getByText(/You have unlocked the multiplayer mode/i)).toHaveCount(0);
  // the demos start only from the dialog, not under it
  await expect(page.getByTestId("tutorial-coach")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_realtime_unlocked.png" });
  await unlocked.getByText("Show the buildings", { exact: true }).click();
  await expect(unlocked).toHaveCount(0);
  await expect(page.getByTestId("tutorial-coach")).toContainText("1/8");
  // the demos show every building, locked or not
  await expect(page.getByTestId("build-palette").locator("[class*=locked]")).toHaveCount(0);
});

test("the third match unlocks the Choclab and online play with one dialog", async ({ page }) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // the app decides once what an earlier player keeps (src/unlocks.js); wait for that first
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("settings").objectStore("settings").get("unlocks");
          get.onsuccess = () => resolve(get.result !== undefined);
        };
      })
  );
  // two finished matches on the device; their buildings were announced
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction(["player", "settings"], "readwrite");
          const player = tx.objectStore("player");
          const get = player.get("stats");
          get.onsuccess = () =>
            player.put(
              Object.assign({}, get.result || {}, {
                username: "Tester",
                score: 60,
                tutorialFinished: true,
                trackRecord: [
                  { id: "first", won: true, winners: [{ idx: 0 }] },
                  { id: "second", lost: true, winners: [{ idx: 1 }] },
                ],
              }),
              "stats"
            );
          tx.objectStore("settings").put({ early: false, announced: { buildings: 2, online: false } }, "unlocks");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      })
  );
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.getByTestId("unlock-hint")).toHaveText(
    "One more match against the AI unlocks the Choclab and online matches."
  );
  await startMatch(page);
  // the prepared first game runs from the start; Tom Toffee gives up
  await page.evaluate(() => {
    const { host: h, engine } = window.__battlechoc;
    engine.applyAction(h.match, { type: "battlechoc/match/surrender", player: 1, t: h.now(), payload: {} });
    h.publish();
    h.schedule();
  });
  await expect(page.getByText(/You won/i).first()).toBeVisible();
  await page.locator("[data-icon=fast-forward]:visible").first().click();
  await page.locator("[data-icon=done]:visible").first().click();
  const unlocked = page.getByTestId("unlocked");
  await expect(unlocked).toHaveAttribute("data-step", "online");
  await expect(unlocked).toContainText("New features unlocked: Choclab and Friends!");
  // the third match's buildings come in the same dialog
  await expect(unlocked.getByTestId("unlocked-building")).toHaveText(["X-mas factory", "Donut factory"]);
  await unlocked.getByText("Ok", { exact: true }).click();
  await expect(unlocked).toHaveCount(0);
  await expect(page.getByTestId("unlock-hint")).toHaveCount(0);
  // offline the Choclab is no longer locked, only waits for the server
  await expect(page.locator("[role=button][data-offline=true]", { hasText: "Choclab" })).toHaveCount(1);
});

test("nothing floats up once the match is over", async ({ page }) => {
  await openAsPlayer(page, 50);
  await startMatch(page);
  // the prepared first game runs at once: a cannon fires and charges again (at a cell with
  // nothing but cream: a hit on the factory could end the match at once)
  await advance(page, 21000);
  await page.evaluate(async () => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[1].fieldIndex].grid;
    const cream = grid.find(
      (cell) => cell.occupiedBy.length > 0 && cell.occupiedBy.every((entity) => entity.type === "EntityType.CREAM")
    );
    await h.submit("battlechoc/match/attack", { attackType: "AttackType.TRUFFLE", row: cream.row, col: cream.col });
  });
  // a pop still on its way up when the match ends
  const pops = await page.evaluate(async () => {
    const sc = window.__battlechocScene;
    window.__pops = [];
    const spawn = sc.spawnInfo.bind(sc);
    sc.spawnInfo = (type, ...rest) => {
      window.__pops.push({ type, phase: window.__battlechoc.host.match.phase });
      return spawn(type, ...rest);
    };
    sc.spawnInfo("InfoType.CACAO_HARVESTED", { row: 1, col: 1 }, 10);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const inFlight = sc.scene.meshes.filter((mesh) => mesh.name.startsWith("info_") && !mesh.isDisposed()).length;
    const { host: h, engine } = window.__battlechoc;
    engine.applyAction(h.match, { type: "battlechoc/match/surrender", player: 1, t: h.now(), payload: {} });
    h.publish();
    h.schedule();
    return inFlight;
  });
  expect(pops).toBeGreaterThan(0);
  await expect(page.getByText(/You won/i).first()).toBeVisible();
  // time goes on while the overview is open: the charging cannon must not report a shot
  await advance(page, 30000);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    spawned: window.__pops.filter((pop) => pop.phase === "MatchPhase.ENDED").length,
    inFlight: window.__battlechocScene.scene.meshes.filter((mesh) => mesh.name.startsWith("info_") && !mesh.isDisposed()).length,
  }));
  expect(after).toEqual({ spawned: 0, inFlight: 0 });
});

// the camera's window and the boards' views (src/3d/boardView.js)
const boardView = (page) =>
  page.evaluate(() => {
    const sc = window.__battlechocScene;
    return { own: { ...sc.views.own }, opponent: { ...sc.views.opponent }, height: sc.camera.orthoTop - sc.camera.orthoBottom };
  });

test("the wheel and a drag zoom and move the board, a swipe brings the other board; a tap still builds", async ({ page }) => {
  await openAsPlayer(page);
  await startMatch(page);
  await reachRunningPhase(page);
  await page.waitForTimeout(1500);
  const whole = await boardView(page);
  expect(whole.own).toEqual({ zoom: 1, x: 0, y: 0 });

  // the wheel over the board zooms in about the pointer
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const wheeled = await boardView(page);
  expect(wheeled.own.zoom).toBeGreaterThan(1.5);
  expect(wheeled.height).toBeCloseTo(whole.height / wheeled.own.zoom, 3);

  // a drag moves the view, a tap does not
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(540, 420, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dragged = await boardView(page);
  expect(dragged.own.zoom).toBeCloseTo(wheeled.own.zoom, 6);
  expect(dragged.own.x).not.toBeCloseTo(wheeled.own.x, 3);

  // zoomed in, a tap on a free cell builds cream there
  await page.getByTestId("build-cream").click();
  const cell = await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const free = grid.find((c) => !c.molten && c.occupiedBy.length === 0);
    const sc = window.__battlechocScene;
    const V = sc.camera.position.constructor;
    const canvas = sc.engine.getRenderingCanvas();
    const transform = sc.camera.getViewMatrix().multiply(sc.camera.getProjectionMatrix());
    const p = V.TransformCoordinates(sc.playerGameField.position.add(new V(free.row, 0.3, free.col)), transform);
    return { row: free.row, col: free.col, x: ((p.x + 1) / 2) * canvas.clientWidth, y: ((1 - p.y) / 2) * canvas.clientHeight };
  });
  await page.mouse.click(cell.x, cell.y);
  await page.waitForTimeout(500);
  const built = await page.evaluate(
    ({ row, col }) => {
      const h = window.__battlechoc.host;
      const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
      return grid.find((c) => c.row === row && c.col === col).occupiedBy.map((entity) => entity.type);
    },
    cell
  );
  expect(built).toEqual(["EntityType.CREAM"]);
  expect((await boardView(page)).own).toEqual(dragged.own);
  await page.screenshot({ path: "test/output/screenshot_realtime_zoom.png" });

  // the whole-board button is there while zoomed in; it and the 0 key show the whole board
  const fitButton = page.getByTestId("board-fit");
  expect(await fitButton.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  await fitButton.click();
  await page.waitForTimeout(900);
  expect((await boardView(page)).own).toEqual({ zoom: 1, x: 0, y: 0 });
  expect(await fitButton.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
  await page.keyboard.press("+");
  await page.waitForTimeout(200);
  expect((await boardView(page)).own.zoom).toBeCloseTo(1.25, 3);
  await page.keyboard.press("0");
  await page.waitForTimeout(600);
  expect((await boardView(page)).own).toEqual({ zoom: 1, x: 0, y: 0 });

  // a double click is two taps, no zoom (firing many cannons means tapping fast)
  await page.mouse.dblclick(500, 300);
  await page.waitForTimeout(500);
  expect((await boardView(page)).own.zoom).toBe(1);

  // a swipe toward the other board pulls it in: released far enough, the camera flies on and
  // the preview shows the own board; a short one springs back
  const toward = (await page.evaluate(() => window.__battlechocScene.sideways())) < 0 ? 1 : -1;
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(640 + toward * 200, 400, { steps: 10 });
  const midway = await page.evaluate(() => window.__battlechocScene.between);
  expect(midway).toBeGreaterThan(0.1);
  expect(midway).toBeLessThan(0.6);
  await page.mouse.move(640 + toward * 500, 400, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__battlechocScene.between)).toBe(1);
  await expect(page.getByTestId("board-preview")).toHaveAttribute("data-board", "own");
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(640 - toward * 100, 400, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__battlechocScene.between)).toBe(1);
  await page.getByTestId("board-preview").click();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__battlechocScene.between)).toBe(0);

  // each board keeps its own view across the camera flights
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const zoomedOwn = (await boardView(page)).own;
  await page.getByTestId("board-preview").click();
  await page.waitForTimeout(1500);
  const atOpponent = await boardView(page);
  expect(atOpponent.opponent).toEqual({ zoom: 1, x: 0, y: 0 });
  expect(atOpponent.height).toBeCloseTo(whole.height, 3);
  await page.getByTestId("board-preview").click();
  await page.waitForTimeout(1500);
  const back = await boardView(page);
  expect(back.own).toEqual(zoomedOwn);
  expect(back.height).toBeCloseTo(whole.height / zoomedOwn.zoom, 3);
});
