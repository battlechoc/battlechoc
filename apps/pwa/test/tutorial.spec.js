import { test, expect } from "@playwright/test";

// The tutorial on the real-time engine. ?testclock gives the lesson a manual clock
// (window.__battlechoc.host.clock.advance), the demos always run on their own fast clock.

const host = (page, fn, arg) => page.evaluate(fn, arg);
const advance = (page, ms) => host(page, (ms) => window.__battlechoc.host.clock.advance(ms), ms);
const submit = (page, type, payload) =>
  host(
    page,
    ({ type, payload }) =>
      window.__battlechoc.host.submit(type, payload).then(
        () => "ok",
        (error) => error.message
      ),
    { type, payload }
  );
const step = (page) => page.getByTestId("tutorial-coach");
const expectStep = (page, id) => expect(step(page)).toHaveAttribute("data-step", id);

// a cell of the player's own board, by a predicate on the cell
const ownCell = (page, kind) =>
  host(
    page,
    (kind) => {
      const match = window.__battlechoc.host.match;
      const grid = match.board.fields[match.players[0].fieldIndex].grid;
      const empty = (cell) => cell.occupiedBy.every((entity) => entity.type === "EntityType.CREAM");
      const creamed = (cell) => cell.occupiedBy.some((entity) => entity.type === "EntityType.CREAM");
      const size = match.board.size.cols;
      const at = (row, col) => grid[row * size + col];
      if (kind === "creamFootprint") {
        // a 2x2 area with at least one cell without cream
        for (let row = 0; row < size - 1; row++) {
          for (let col = 0; col < size - 1; col++) {
            const area = [at(row, col), at(row + 1, col), at(row, col + 1), at(row + 1, col + 1)];
            if (area.some((cell) => !creamed(cell) && !cell.molten)) {
              return { row, col };
            }
          }
        }
      }
      const cell = grid.find(empty);
      return { row: cell.row, col: cell.col };
    },
    kind
  );

test("the lesson teaches a whole match against Mimi Marzipan", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.locator("div[class^=menu] > div:first-child").click();
  await expectStep(page, "welcome");
  await step(page).locator("[class*=iconButton]").click();

  await expectStep(page, "factory");
  await page.screenshot({ path: "test/output/screenshot_tutorial_factory.png" });
  expect(await submit(page, "battlechoc/match/placeFactory", await ownCell(page, "free"))).toBe("ok");
  await advance(page, 3000);
  await expectStep(page, "slots");
  await step(page).locator("[class*=iconButton]").click();

  await expectStep(page, "tree");
  // only the tree can be picked now
  await expect(page.getByTestId("build-cacao-tree")).not.toHaveClass(/disabled/);
  await expect(page.getByTestId("build-truffle-cannon")).toHaveClass(/disabled/);
  await page.screenshot({ path: "test/output/screenshot_tutorial_tree.png" });
  expect(await submit(page, "battlechoc/match/build", { entityType: "EntityType.CACAOTREE", ...(await ownCell(page, "free")) })).toBe("ok");

  await expectStep(page, "cacao");
  await advance(page, 10000);
  await expectStep(page, "cannon");
  expect(await submit(page, "battlechoc/match/build", { entityType: "EntityType.RUM_TRUFFLE_CANNON", ...(await ownCell(page, "free")) })).toBe("ok");

  await expectStep(page, "cream");
  await advance(page, 15000);
  expect(await submit(page, "battlechoc/match/build", { entityType: "EntityType.CREAM", ...(await ownCell(page, "creamFootprint")) })).toBe("ok");

  // the cannon is rushable by now
  await expectStep(page, "fire");
  await page.screenshot({ path: "test/output/screenshot_tutorial_fire.png" });
  expect(await submit(page, "battlechoc/match/attack", { attackType: "AttackType.TRUFFLE", row: 3, col: 4, allowRush: true })).toBe("ok");

  await expectStep(page, "win");
  await advance(page, 20000);
  expect(await submit(page, "battlechoc/match/attack", { attackType: "AttackType.TRUFFLE", row: 1, col: 1, allowRush: true })).toBe("ok");
  // offline there is no account: the player picks a name to finish
  await expect(page.getByTestId("tutorial-name")).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_tutorial_done.png" });
});

test("skipping the lesson returns to the title screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("div[class^=menu] > div:first-child").click();
  await expectStep(page, "welcome");
  await step(page).getByText("Skip tutorial").click();
  await expect(step(page)).toHaveCount(0);
  await expect(page.locator("div[class^=menu] > div:first-child")).toBeVisible();
  expect(await host(page, () => window.__battlechoc.host === undefined || window.__battlechoc.host.stopped)).toBe(true);
});

test("the building demos play on the real engine", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // a player who won once: everything is unlocked
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(Object.assign({}, get.result || {}, { username: "Tester", score: 150, tutorialFinished: true }), "stats");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      })
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=settings]:visible").first().click();
  await page.getByText("Show the buildings", { exact: true }).click();

  const titles = [
    "Factory Extension",
    "Spying Easter Bunny",
    "Xmas Factory",
    "Hot Chocolate Ballista",
    "Chocolate Fountain",
    "Fruit Cannon",
    "Donut Factory",
    "Donut Traps",
  ];
  for (const [index, title] of titles.entries()) {
    await expect(step(page)).toContainText(title);
    await expect(step(page)).toContainText(`${index + 1}/${titles.length}`);
    if (index === 0) {
      // the extension gets built a moment after the start
      await page.waitForFunction(
        () => window.__battlechoc.host.match.events.some((event) => event.type === "built" && event.data.entityType === "EntityType.FACTORY_EXTENSION"),
        null,
        { timeout: 10000 }
      );
      await page.screenshot({ path: "test/output/screenshot_demo_extension.png" });
    }
    if (title === "Hot Chocolate Ballista") {
      await page.waitForFunction(
        () => window.__battlechoc.host.match.board.fields[window.__battlechoc.host.match.players[1].fieldIndex].grid.some((cell) => cell.molten),
        null,
        { timeout: 15000 }
      );
      await page.screenshot({ path: "test/output/screenshot_demo_ballista.png" });
    }
    await step(page).locator("[class*=iconButton]").last().click();
  }
  await expect(step(page)).toHaveCount(0);
});
