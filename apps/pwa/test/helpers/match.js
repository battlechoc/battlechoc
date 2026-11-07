// Starting and playing a single player match in the e2e tests (window.__battlechoc, src/testHooks.js).
import { advance } from "./clock.js";

/** Clicks the last button or div whose whole text is `text` (a DOM click: it needs no layout). */
export const clickText = (page, text) =>
  page.evaluate((text) => {
    const element = [...document.querySelectorAll("button, div")]
      .filter((e) => e.innerText && e.innerText.trim() === text)
      .pop();
    if (!element) {
      throw new Error("no element with the text " + text);
    }
    element.click();
  }, text);

/** Resolves once a match host runs a match. */
export const waitForMatch = (page, timeout = 10000) =>
  page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, null, { timeout });

/** Clicks the menu entry `label` once it shows and waits for the match. */
export const startMatch = async (page, label = "Start Game") => {
  await page.waitForFunction((label) => document.body.innerText.includes(label), label);
  await clickText(page, label);
  await waitForMatch(page);
};

/** Takes the first field of the field choice (GameStartSelection). */
export const chooseField = (page) =>
  page.evaluate(() => document.querySelector('[data-testid="choose-field"]').click());

/** Field choice, the own factory on a cell with nothing but cream, then past the countdown. */
export const reachRunningPhase = async (page) => {
  await chooseField(page);
  await page.evaluate(() => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === "EntityType.CREAM"));
    return h.submit("battlechoc/match/placeFactory", { row: cell.row, col: cell.col });
  });
  await advance(page, 25000);
};

/** Resolves once the 3D scene shows the boards and its camera stands still (no flight, no
 * glide of the view): from then on it takes taps, wheels and drags. */
export const sceneSettled = (page) =>
  page.waitForFunction(() => {
    const scene = window.__battlechocScene;
    return Boolean(scene && scene.playerGameField && !scene.flight && !scene.viewTransition);
  });

/** Resolves once the local player's factory stands on the board. */
export const factoryPlaced = (page) =>
  page.waitForFunction(() => {
    const match = window.__battlechoc.host.match;
    const field = match.board.fields[match.players[0].fieldIndex];
    return field.grid.some((cell) => cell.occupiedBy.some((entity) => entity.type === "EntityType.FACTORY"));
  });
