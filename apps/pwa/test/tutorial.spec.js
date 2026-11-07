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

// The lesson's hand (data-testid tutorial-pointer): on a field it carries the field (data-board,
// data-row, data-col) and stands with its fingertip on the field's place on the screen; on a
// weapon button it stands inside the button.
const pointer = (page) => page.getByTestId("tutorial-pointer");
const expectPointerOn = async (page, board, check) => {
  await expect(pointer(page)).toHaveAttribute("data-board", board);
  const target = await pointer(page).evaluate((element) => ({ row: Number(element.dataset.row), col: Number(element.dataset.col) }));
  const cell = await host(
    page,
    ({ board, row, col }) => {
      const match = window.__battlechoc.host.match;
      const player = match.players[board === "own" ? 0 : 1];
      const found = match.board.fields[player.fieldIndex].grid.find((candidate) => candidate.row === row && candidate.col === col);
      return { type: found.type, buildings: found.occupiedBy.filter((entity) => entity.type !== "EntityType.CREAM").map((entity) => entity.type) };
    },
    { board, ...target }
  );
  check(cell);
};
// taps the field under the fingertip, once the camera stands still
const tapPointer = async (page) => {
  await page.waitForFunction(() => window.__battlechocScene && !window.__battlechocScene.flight);
  await page.waitForTimeout(300);
  const { x, y } = await pointer(page).evaluate((element) => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top) }));
  await page.mouse.click(x, y);
};

test("the lesson teaches a whole match against Mimi Marzipan", async ({ page }) => {
  await page.goto("/?testclock", { waitUntil: "networkidle" });
  await page.getByTestId("start-button").click();
  await expectStep(page, "welcome");
  await expect(pointer(page)).toHaveCount(0);
  await step(page).locator("[class*=iconButton]").click();

  // the hand shows a dark field for the factory; a tap there places it
  await expectStep(page, "factory");
  await expectPointerOn(page, "own", (cell) => expect(cell.type).toBe("BoardCellTypes.BLACK"));
  await page.screenshot({ path: "test/output/screenshot_tutorial_factory.png" });
  await tapPointer(page);
  await advance(page, 3000);
  await expectStep(page, "slots");
  await expect(pointer(page)).toHaveCount(0);
  await step(page).locator("[class*=iconButton]").click();

  // the tree is picked for the player, the hand shows a free white field
  await expectStep(page, "tree");
  await expect(page.getByTestId("build-cacao-tree")).toHaveClass(/selected/);
  await expect(page.getByTestId("build-truffle-cannon")).toHaveClass(/disabled/);
  // the lesson's three buildings; everything else waits behind a lock, as in the first match
  const palette = page.getByTestId("build-palette");
  await expect(palette.locator('[data-testid^="build-"]')).toHaveCount(3);
  expect(await palette.locator('.icon[style*="lock.svg"]').count()).toBeGreaterThan(0);
  await expectPointerOn(page, "own", (cell) => {
    expect(cell.type).toBe("BoardCellTypes.WHITE");
    expect(cell.buildings).toEqual([]);
  });
  await page.screenshot({ path: "test/output/screenshot_tutorial_tree.png" });
  await tapPointer(page);

  await expectStep(page, "cacao");
  await expect(pointer(page)).toHaveCount(0);
  await advance(page, 10000);
  await expectStep(page, "cannon");
  await expect(page.getByTestId("build-truffle-cannon")).toHaveClass(/selected/);
  await expectPointerOn(page, "own", (cell) => expect(cell.buildings).toEqual([]));
  await tapPointer(page);

  // the factory on dark chocolate came with three slots: the cream needs no wait
  await expectStep(page, "cream");
  await expect(page.getByTestId("build-cream")).toHaveClass(/selected/);
  await expectPointerOn(page, "own", () => {});
  await tapPointer(page);

  // the cannon loads: no hand until it can fire early
  await expectStep(page, "charge");
  await expect(pointer(page)).toHaveCount(0);
  await advance(page, 10000);

  // fire: the hand on the cannon button, then on Mimi's tree
  await expectStep(page, "fire");
  const cannonButton = page.getByTestId("weapon-truffle-cannon");
  await expect(cannonButton.getByTestId("tutorial-pointer")).toHaveCount(1);
  await page.screenshot({ path: "test/output/screenshot_tutorial_fire.png" });
  await cannonButton.click();
  await expectPointerOn(page, "opponent", (cell) => expect(cell.buildings).toEqual(["EntityType.CACAOTREE"]));
  await tapPointer(page);

  // win: the hand waits for the cannon, then shows Mimi's factory
  await expectStep(page, "win");
  await expect(pointer(page)).toHaveCount(0);
  await advance(page, 20000);
  await expectPointerOn(page, "opponent", (cell) => expect(cell.buildings).toEqual(["EntityType.FACTORY"]));
  await page.screenshot({ path: "test/output/screenshot_tutorial_win.png" });
  await tapPointer(page);
  // offline there is no account: the player picks a name to finish
  await expect(page.getByTestId("tutorial-name")).toBeVisible();
  await page.locator("input:visible").first().fill("Lessonia");
  await page.locator("div[class^=actionButton]:visible").first().click();
  // the first finished lesson brings the starter kit (the server credits it once the device syncs)
  const kit = page.getByTestId("starter-kit");
  await expect(kit).toBeVisible();
  await expect(kit.locator('[data-ingredient="COCOA"]')).toContainText("100");
  await expect(kit.locator('[data-ingredient="RUM"]')).toContainText("1");
  await page.screenshot({ path: "test/output/screenshot_tutorial_done.png" });
});

test("skipping the lesson returns to the title screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByTestId("start-button").click();
  await expectStep(page, "welcome");
  await step(page).getByText("Skip tutorial").click();
  await expect(step(page)).toHaveCount(0);
  await expect(page.getByTestId("start-button")).toBeVisible();
  expect(await host(page, () => window.__battlechoc.host === undefined || window.__battlechoc.host.stopped)).toBe(true);
});

test("the building demos play on the real engine", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // a player who won once: the demos are in the settings
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(Object.assign({}, get.result || {}, { username: "Tester", score: 150, tutorialFinished: true, trackRecord: [{ id: "first", won: true, winners: [{ idx: 0 }] }] }), "stats");
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
