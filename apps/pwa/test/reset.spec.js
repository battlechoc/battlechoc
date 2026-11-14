import { test, expect } from "@playwright/test";
import {
  openWithStats,
  seedStats,
  readEntry,
  readSetting,
} from "./helpers/profile.js";
import { api, createPlayer, accountOf } from "./helpers/players.js";

// "Reset battlechoc" in the Settings (src/reset.js, dialogs/ResetDialog.jsx): a warning that says
// what it means for the account, then the device forgets the player and the game starts as on
// its first visit.

const openReset = async (page) => {
  await page.locator("[data-icon=settings]:visible").first().click();
  await page.getByTestId("settings-reset").click();
  await expect(page.getByTestId("reset-dialog")).toContainText(
    "This deletes your progress, your settings and the access to your account on this device."
  );
};

test("Cancel keeps everything; the reset empties the device but for the Android app's mark, and the game starts anew", async ({
  page,
}) => {
  await openWithStats(page, {
    username: "Tester",
    score: 150,
    tutorialFinished: true,
  });
  await seedStats(page, {}, { settings: { "reset-test": "seeded" } });
  await page.evaluate(() => {
    window.sessionStorage.setItem("battlechoc.androidApp", "1");
    window.sessionStorage.setItem("reset-test", "session");
    window.localStorage.setItem("peer-connect-dapp-id", "peer");
  });

  // no server in this test (the e2e build's API address answers nothing): whether the account
  // is saved cannot be read
  await openReset(page);
  const warning = page.getByTestId("reset-warning");
  await expect(warning).toHaveAttribute("data-warning", "unknown");
  await expect(warning).toHaveText(
    "Without a connection, battlechoc can't check whether your account is saved."
  );
  await expect(page.getByTestId("reset-save-first")).toHaveCount(0);
  await page.screenshot({ path: "test/output/visual_reset_dialog.png" });

  // (other dialogs that are always mounted have a Cancel too)
  await page
    .getByTestId("reset-dialog")
    .getByText("Cancel", { exact: true })
    .click();
  await expect(page.getByTestId("reset-dialog")).toBeHidden();
  expect((await readEntry(page, "player", "stats")).username).toBe("Tester");
  expect(await readSetting(page, "reset-test")).toBe("seeded");

  await page.getByTestId("settings-reset").click();
  await expect(warning).toHaveAttribute("data-warning", "unknown");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByTestId("reset-confirm").click(),
  ]);
  // a first visit: the tutorial, on the start page
  await expect(page.getByTestId("start-button")).toHaveText("Start Tutorial", {
    timeout: 30000,
  });
  expect(new URL(page.url()).pathname).toBe("/");
  const stats = await readEntry(page, "player", "stats");
  expect(stats && stats.username).not.toBe("Tester");
  expect(await readSetting(page, "reset-test")).toBeUndefined();
  expect(
    await page.evaluate(() => ({
      android: window.sessionStorage.getItem("battlechoc.androidApp"),
      session: window.sessionStorage.getItem("reset-test"),
      peer: window.localStorage.getItem("peer-connect-dapp-id"),
    }))
  ).toEqual({ android: "1", session: null, peer: null });
});

test("with the server: an unsaved account offers Save first, and the reset ends this device's session there", async ({
  browser,
  request,
}) => {
  const { context, page } = await createPlayer(browser, request, "Resetter");
  const before = await accountOf(page);

  await openReset(page);
  const warning = page.getByTestId("reset-warning");
  await expect(warning).toHaveAttribute("data-warning", "unsaved");
  await expect(warning).toHaveText(
    "Your account is not saved and will be lost for good."
  );
  await page.screenshot({ path: "test/output/visual_reset_unsaved.png" });

  // Save first: the profile, where the account is saved
  await page.getByTestId("reset-save-first").click();
  await expect(page.getByTestId("reset-dialog")).toBeHidden();
  await expect(page.getByTestId("save-progress")).toBeVisible({
    timeout: 15000,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("save-progress")).toBeHidden();

  await openReset(page);
  await expect(warning).toHaveAttribute("data-warning", "unsaved");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByTestId("reset-confirm").click(),
  ]);
  // the server no longer knows the old session; the device is a new player
  const refreshed = await request.post(`${api}/accounts/token`, {
    data: { refreshToken: before.refreshToken },
  });
  expect(refreshed.status()).toBe(401);
  await expect
    .poll(async () => ((await accountOf(page)) || {}).playerId, {
      timeout: 15000,
    })
    .toBeTruthy();
  expect((await accountOf(page)).playerId).not.toBe(before.playerId);
  await context.close();
});
