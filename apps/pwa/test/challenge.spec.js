import { test, expect } from "@playwright/test";

// Challenge links (docs/superpowers/specs/2026-11-04-challenge-link-design.md) against the local
// API that playwright.config.js starts. Each player is a browser context with its own account.
import { createPlayer } from "./helpers/players.js";

const CODE = /([0-9A-Z]{4}-[0-9A-Z]{4})/;

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
});
