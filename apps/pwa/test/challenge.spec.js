import { test, expect } from "@playwright/test";

// Challenge links (docs/superpowers/specs/2026-11-04-challenge-link-design.md) against the local
// API that playwright.config.js starts. Each player is a browser context with its own account.
import {
  api,
  createPlayer,
  host,
  inOnlineMatch,
  toRunning,
} from "./helpers/players.js";

const CODE = /([0-9A-Z]{4}-[0-9A-Z]{4})/;

// somebody who never played: a fresh browser that opens a link
const visitor = async (browser, path, apiUrl = api) => {
  const context = await browser.newContext();
  await context.addInitScript(
    (url) => window.localStorage.setItem("battlechoc.apiUrl", url),
    apiUrl,
  );
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
};

// the challenger opens "Play with a friend"; resolves with the code
const challengeCode = async (page) => {
  await page.getByText("Play with a friend", { exact: true }).first().click();
  const code = page
    .getByTestId("challenge-dialog")
    .getByTestId("challenge-code");
  await expect(code).toHaveText(CODE, { timeout: 10000 });
  return (await code.textContent()).match(CODE)[1];
};

test.describe("challenge links", () => {
  test("the challenger shares a link with a code and a countdown; cancelling ends it", async ({
    browser,
    request,
  }) => {
    const carla = await createPlayer(browser, request, "Carla");
    await carla.page
      .getByText("Play with a friend", { exact: true })
      .first()
      .click();
    const dialog = carla.page.getByTestId("challenge-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("challenge-code")).toHaveText(CODE, {
      timeout: 10000,
    });
    await expect(dialog.getByTestId("challenge-countdown")).toHaveText(
      /^(2:00|1:[0-5]\d)$/,
    );
    await expect(dialog.getByTestId("challenge-share")).toBeVisible();
    await carla.page.screenshot({
      path: "test/output/screenshot_challenge_waiting.png",
    });
    await dialog.getByTestId("challenge-cancel").click();
    await expect(dialog).toHaveCount(0);
    await carla.context.close();
  });

  test("a locked player gets the code field instead of a link", async ({
    browser,
    request,
  }) => {
    const nina = await createPlayer(browser, request, "Nina", {
      unlocked: false,
    });
    await nina.page
      .getByText("Play with a friend", { exact: true })
      .first()
      .click();
    const dialog = nina.page.getByTestId("challenge-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("more matches against the AI");
    await expect(dialog.getByTestId("challenge-code-input")).toBeVisible();
    await expect(dialog.getByTestId("challenge-share")).toHaveCount(0);
    await dialog.getByTestId("challenge-code-input").fill("nope");
    await dialog.getByTestId("challenge-code-go").click();
    await expect(dialog).toContainText("That code doesn't look right.");
    await nina.context.close();
  });
  test("a newcomer opens the link, skips the tutorial and plays a 10x10 match with every building", async ({
    browser,
    request,
  }) => {
    const carla = await createPlayer(browser, request, "Cleo");
    const code = await challengeCode(carla.page);
    const newcomer = await visitor(browser, `/?challenge=${code}`);
    const card = newcomer.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-headline")).toContainText(
      carla.username,
      { timeout: 15000 },
    );
    await expect(card).toContainText("You play as");
    await expect(card).toContainText(code);
    await expect(newcomer.page.getByTestId("tutorial-coach")).toHaveCount(0);
    await expect(carla.page.getByTestId("challenge-status")).toHaveText(
      "Your friend is reading the challenge…",
    );
    await newcomer.page.screenshot({
      path: "test/output/screenshot_challenge_card.png",
    });
    await expect(card.getByTestId("challenge-accept")).toBeEnabled({
      timeout: 30000,
    });
    await card.getByTestId("challenge-accept").click();
    await Promise.all([
      inOnlineMatch(carla.page),
      inOnlineMatch(newcomer.page),
    ]);
    for (const { page } of [carla, newcomer]) {
      expect(
        await host(page, () => window.__battlechoc.view().board.size),
      ).toEqual({ rows: 10, cols: 10 });
    }

    // later openers find the match already on
    const dora = await createPlayer(browser, request, "Dana");
    await dora.page.goto(`/?challenge=${code}`);
    const doraCard = dora.page.getByTestId("challenge-card");
    await expect(doraCard.getByTestId("challenge-card-status")).toHaveText(
      "This match is already on.",
      { timeout: 15000 },
    );
    await expect(doraCard.getByTestId("challenge-start")).toBeVisible();
    await dora.context.close();

    // every building, although the newcomer unlocked none
    await toRunning([carla, newcomer]);
    const palette = newcomer.page.getByTestId("build-palette");
    await expect(palette).toBeVisible();
    await expect(palette.locator('.icon[style*="lock.svg"]')).toHaveCount(0);
    expect(
      await palette.locator('[data-testid^="build-"]').count(),
    ).toBeGreaterThan(6);

    // no pause online: the menu says the match keeps running, and asks before it gives it up
    await carla.page.locator("[data-icon=settings]:visible").first().click();
    const menu = carla.page.getByTestId("game-menu");
    await expect(menu).toContainText("Online, the match keeps running.");
    await menu.getByText("Surrender", { exact: true }).click();
    await carla.page
      .getByTestId("confirm-leave")
      .getByText("Surrender", { exact: true })
      .click();
    await expect(newcomer.page.getByText(/You won/i).first()).toBeVisible({
      timeout: 15000,
    });
    const skip = newcomer.page.locator("[data-icon=fast-forward]:visible");
    while ((await skip.count()) > 0) {
      await skip.first().click();
    }
    await newcomer.page.locator("[data-icon=done]:visible").first().click();
    // back home the newcomer is a newcomer again: the tutorial waits
    await expect(
      newcomer.page.getByText("Start Tutorial", { exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });
    await carla.context.close();
    await newcomer.context.close();
  });

  test("an ended link shows the ended card with a way to learn the game", async ({
    browser,
  }) => {
    const newcomer = await visitor(browser, "/?challenge=ZZZZ-ZZZZ");
    const card = newcomer.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-card-status")).toHaveText(
      "This challenge has ended, ask for a new one.",
      {
        timeout: 15000,
      },
    );
    await expect(card.getByTestId("challenge-learn")).toBeVisible();
    await newcomer.context.close();
  });

  test("without the battle server the card says so", async ({ browser }) => {
    const newcomer = await visitor(
      browser,
      "/?challenge=K7Q2-M9XD",
      "http://127.0.0.1:9",
    );
    const card = newcomer.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-card-status")).toHaveText(
      "The battle server can't be reached right now.",
      {
        timeout: 20000,
      },
    );
    await newcomer.context.close();
  });
});
