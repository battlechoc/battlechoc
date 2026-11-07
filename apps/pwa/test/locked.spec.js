import { test, expect } from "@playwright/test";
import {
  openWithStats,
  seedStats,
  waitForUnlockDecision,
  wonMatches,
} from "./helpers/profile.js";
test("locked menu entries explain themselves and do not open", async ({
  page,
}) => {
  await openWithStats(page, {
    username: "Tester",
    score: 0,
    tutorialFinished: false,
    tutorialSkipped: true,
  });
  // what is left shows below the menu, and a tap on a locked entry says it again
  await expect(page.getByTestId("unlock-hint")).toHaveText(
    "4 more matches against the AI unlock the Choclab and online matches."
  );
  // the lock stands upright in the middle of the blob's right end, like the no-wifi sign, and
  // the label keeps clear of it
  for (const name of ["Choclab", "Play with a friend"]) {
    const button = page.locator("[role=button]", { hasText: name }).first();
    const lock = button.locator("[data-badge=lock]");
    const labelRight = await button.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element.firstElementChild);
      return range.getBoundingClientRect().right;
    });
    const blob = await button.boundingBox();
    const box = await lock.boundingBox();
    expect(
      box.x,
      `${name}: the label runs under the lock`
    ).toBeGreaterThanOrEqual(labelRight);
    expect(
      Math.abs(box.y + box.height / 2 - (blob.y + blob.height / 2)),
      `${name}: the lock is off the middle`
    ).toBeLessThan(2);
    expect(
      await lock.evaluate((element) => getComputedStyle(element).transform)
    ).toMatch(/^matrix\(1, 0, 0, 1, /);
  }
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(
    page.getByText("Play 4 more matches against the AI to unlock “Choclab”.")
  ).toBeVisible();
  await page.screenshot({ path: "test/output/visual_locked.png" });
  await expect(page.getByTestId("challenge-dialog")).toHaveCount(0);
});

test("four matches unlock the Choclab; friends also need a player name", async ({
  page,
}) => {
  // the server's /health answers, nothing else does: online, but without an account
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, body: '{"ok":true}' })
  );
  // skipped the tutorial without a server: plenty of coins, but no name
  await openWithStats(page, {
    username: "Chocnonymous",
    score: 3535,
    coins: 3535,
    tutorialSkipped: true,
    trackRecord: wonMatches(4),
  });
  // locked, "Play with a friend" says why and still takes a friend's code, but makes no link
  await page.getByText("Play with a friend", { exact: true }).first().click();
  const dialog = page.getByTestId("challenge-dialog");
  await expect(dialog).toContainText("Online play needs a player name");
  await expect(dialog.getByTestId("challenge-code-input")).toBeVisible();
  await expect(dialog.getByTestId("challenge-share")).toHaveCount(0);
  await page.locator("[data-icon=close]:visible").first().click();
  await expect(dialog).toHaveCount(0);
  await page.getByText("Choclab", { exact: true }).first().click();
  // the first visit starts with a short intro, which can be skipped
  await expect(page.getByTestId("lab-intro")).toBeVisible();
  await page.getByText("Skip intro", { exact: true }).click();
  await expect(page.getByTestId("lab-intro")).toHaveCount(0);
  await expect(page.locator("[data-icon=back]:visible").first()).toBeVisible();
  await expect(page.getByText("Start Game", { exact: true })).toHaveCount(0);
});

test("a player who had everything under the old rule (one match) keeps it", async ({
  page,
}) => {
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, body: '{"ok":true}' })
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  // the app decides once what an earlier player keeps (src/unlocks.js); wait for that first
  await waitForUnlockDecision(page);
  // stats from before the new rule (XP, one match) and no decision on this device yet, as on the
  // first start of the new version
  await seedStats(
    page,
    {
      username: "Tester",
      score: 150,
      tutorialFinished: true,
      trackRecord: [{ id: "old", won: true, winners: [{ idx: 0 }] }],
    },
    { deleteSettings: ["unlocks"] }
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByText("Start Game", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByTestId("unlock-hint")).toHaveCount(0);
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab-intro")).toBeVisible();
});
