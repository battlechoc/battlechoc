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
    apiUrl
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
      /^(2:00|1:[0-5]\d)$/
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
      { timeout: 15000 }
    );
    // the newcomer's own (random) name faces the challenger's
    await expect(card).toContainText(/VS[A-Za-z]/);
    await expect(card).toContainText(code);
    await expect(newcomer.page.getByTestId("tutorial-coach")).toHaveCount(0);
    await expect(carla.page.getByTestId("challenge-status")).toHaveText(
      "Your friend is reading the challenge…"
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
        await host(page, () => window.__battlechoc.view().board.size)
      ).toEqual({ rows: 10, cols: 10 });
    }

    // later openers find the match already on
    const dora = await createPlayer(browser, request, "Dana");
    await dora.page.goto(`/?challenge=${code}`);
    const doraCard = dora.page.getByTestId("challenge-card");
    await expect(doraCard.getByTestId("challenge-card-status")).toHaveText(
      "This match is already on.",
      { timeout: 15000 }
    );
    await expect(doraCard.getByTestId("challenge-start")).toBeVisible();
    await dora.context.close();

    // every building, although the newcomer unlocked none
    await toRunning([carla, newcomer]);
    const palette = newcomer.page.getByTestId("build-palette");
    await expect(palette).toBeVisible();
    await expect(palette.locator('.icon[style*="lock.svg"]')).toHaveCount(0);
    expect(
      await palette.locator('[data-testid^="build-"]').count()
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
      newcomer.page.getByText("Start Tutorial", { exact: true }).first()
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
      }
    );
    await expect(card.getByTestId("challenge-learn")).toBeVisible();
    await newcomer.context.close();
  });

  test("without the battle server the card says so", async ({ browser }) => {
    const newcomer = await visitor(
      browser,
      "/?challenge=K7Q2-M9XD",
      "http://127.0.0.1:9"
    );
    const card = newcomer.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-card-status")).toHaveText(
      "The battle server can't be reached right now.",
      {
        timeout: 20000,
      }
    );
    await newcomer.context.close();
  });
  test("rematch from the end screen starts a new challenge match", async ({
    browser,
    request,
  }) => {
    const ella = await createPlayer(browser, request, "Ella");
    const finn = await createPlayer(browser, request, "Finn");
    const code = await challengeCode(ella.page);
    await finn.page.goto(`/?challenge=${code}`);
    const card = finn.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-accept")).toBeEnabled({
      timeout: 30000,
    });
    await card.getByTestId("challenge-accept").click();
    await Promise.all([inOnlineMatch(ella.page), inOnlineMatch(finn.page)]);
    const first = await host(ella.page, () => window.__battlechoc.host.matchId);
    await toRunning([ella, finn]);
    await host(ella.page, () => window.__battlechoc.host.surrender());
    await expect(finn.page.getByText(/You won/i).first()).toBeVisible({
      timeout: 15000,
    });
    await ella.page.getByTestId("rematch").click();
    const offer = finn.page.getByTestId("incoming-invite");
    await expect(offer).toContainText("wants a rematch", { timeout: 10000 });
    await expect(offer).toContainText("s left");
    await finn.page.screenshot({
      path: "test/output/screenshot_rematch_offer.png",
    });
    await offer.getByText("Play", { exact: true }).click();
    for (const { page } of [ella, finn]) {
      await page.waitForFunction(
        (id) =>
          window.__battlechoc &&
          window.__battlechoc.host &&
          window.__battlechoc.host.online &&
          window.__battlechoc.host.matchId !== id &&
          window.__battlechoc.host.phase,
        first,
        { timeout: 15000 }
      );
      expect(
        await host(page, () => window.__battlechoc.view().board.size)
      ).toEqual({ rows: 10, cols: 10 });
    }
    await ella.context.close();
    await finn.context.close();
  });
  test("the newcomer card fits a phone in portrait, also with a long name; the code copies", async ({
    browser,
    request,
  }) => {
    const long = await createPlayer(
      browser,
      request,
      "Bartholomew_Butterscotch"
    );
    const code = await challengeCode(long.page);
    const newcomer = await visitor(browser, `/?challenge=${code}`);
    await newcomer.page.setViewportSize({ width: 390, height: 844 });
    const card = newcomer.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-headline")).toContainText(
      "Bartholomew_Butterscotch",
      {
        timeout: 15000,
      }
    );
    // nothing sticks out sideways: everything in the card stays inside the dialog that clips it
    const outside = await card.evaluate((element) => {
      let clip = element.parentElement;
      while (clip && getComputedStyle(clip).overflowX === "visible") {
        clip = clip.parentElement;
      }
      const bounds = (clip || document.body).getBoundingClientRect();
      return [element, ...element.querySelectorAll("*")]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.left < bounds.left - 1 ||
            box.right > bounds.right + 1 ||
            node.scrollWidth > node.clientWidth + 1
          );
        })
        .filter((node) => getComputedStyle(node).textOverflow !== "ellipsis")
        .map((node) => `${node.tagName}.${node.className}`);
    });
    expect(outside).toEqual([]);
    await newcomer.page.screenshot({
      path: "test/output/screenshot_challenge_card_portrait.png",
    });
    await card.getByTestId("challenge-copy-code").click();
    await expect(card).toContainText("Code copied");
    await long.context.close();
    await newcomer.context.close();
  });
  test("without the live service, creating a challenge and typing a code both say so", async ({
    browser,
    request,
  }) => {
    const ines = await createPlayer(browser, request, "Ines");
    // the REST API answers (the game is online), the live WebSocket does not
    await ines.context.routeWebSocket(/\/live/, (ws) => ws.close());
    await ines.page.reload({ waitUntil: "networkidle" });
    await ines.page
      .getByText("Play with a friend", { exact: true })
      .first()
      .click();
    const dialog = ines.page.getByTestId("challenge-dialog");
    await expect(dialog).toContainText(
      "The battle server can't be reached right now.",
      { timeout: 20000 }
    );
    await dialog.getByTestId("challenge-back").click();
    await expect(dialog).toHaveCount(0);

    await ines.page
      .getByText("Play with a friend", { exact: true })
      .first()
      .click();
    await dialog.getByTestId("challenge-code-input").fill("K7Q2-M9XD");
    await dialog.getByTestId("challenge-code-go").click();
    const card = ines.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-card-status")).toHaveText(
      "The battle server can't be reached right now.",
      {
        timeout: 20000,
      }
    );
    await ines.context.close();
  });

  test("a link opened during a match opens the challenge once the match is over", async ({
    browser,
    request,
  }) => {
    const kai = await createPlayer(browser, request, "Kai");
    const lea = await createPlayer(browser, request, "Lea");
    const code = await challengeCode(kai.page);
    await lea.page.getByText("Start Game", { exact: true }).first().click();
    await expect(lea.page.getByTestId("matchmaking")).toBeVisible({
      timeout: 10000,
    });
    await lea.page.getByText("Play the AI now", { exact: true }).click();
    await inOnlineMatch(lea.page);
    // the link opens in the same app: the running match comes back first
    await lea.page.goto(`/?challenge=${code}`);
    await inOnlineMatch(lea.page);
    await toRunning([lea]);
    await host(lea.page, () => window.__battlechoc.host.surrender());
    await expect(lea.page.getByText(/You lost/i).first()).toBeVisible({
      timeout: 15000,
    });
    const skip = lea.page.locator("[data-icon=fast-forward]:visible");
    while ((await skip.count()) > 0) {
      await skip.first().click();
    }
    await lea.page.locator("[data-icon=done]:visible").first().click();
    const card = lea.page.getByTestId("challenge-card");
    await expect(card.getByTestId("challenge-headline")).toContainText(
      kai.username,
      { timeout: 15000 }
    );
    await kai.context.close();
    await lea.context.close();
  });
});
