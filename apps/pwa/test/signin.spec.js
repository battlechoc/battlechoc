import { test, expect } from "@playwright/test";
import { api, createPlayer } from "./helpers/players.js";
import { accountOf } from "./helpers/profile.js";

// Saving progress with 24 recovery words (a Cardano key made on the device), the preprod chip,
// and the linked keys in the profile. The API runs with CARDANO_NETWORK=preprod
// (playwright.config.js), the build with VITE_CARDANO_NETWORK=preprod (.env.e2e).

// the player's linked keys, asked from the API with the device account
const identitiesOf = async (page, request) => {
  const { refreshToken } = await accountOf(page);
  const { accessToken } = await (
    await request.post(`${api}/accounts/token`, { data: { refreshToken } })
  ).json();
  return (
    await request.get(`${api}/user/identities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json();
};

const openProfile = (page) =>
  page.locator("[data-icon=user]:visible").first().click();

// the 24 words of the open words dialog (once it shows them)
const shownWords = async (page) => {
  await expect(page.getByTestId("recovery-word")).toHaveCount(24);
  return page
    .getByTestId("recovery-word")
    .evaluateAll((tiles) => tiles.map((tile) => tile.dataset.word));
};

// the check asks three words by number: answer them from `words`
const passCheck = async (page, words) => {
  await page.getByRole("button", { name: "I wrote them down" }).click();
  const fields = page.getByTestId("recovery-check-word");
  await expect(fields).toHaveCount(3);
  for (const field of await fields.all()) {
    const n = Number(await field.getAttribute("data-n"));
    await field.fill(words[n - 1]);
  }
  await page.getByRole("button", { name: "Done" }).click();
};

test.describe("saving progress", () => {
  test("save your progress shows 24 words, the check marks them backed up, the profile says saved", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "Sara");
    await openProfile(page);
    const row = page.getByTestId("save-progress");
    await expect(row).toContainText("Only on this device");
    await row.getByRole("button", { name: "Save your progress" }).click();

    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    const words = await shownWords(page);
    expect(new Set(words).size).toBeGreaterThan(1);
    await page.screenshot({ path: "test/output/signin-words.png" });
    // on a phone the title stays clear of the dialog's decoration (owner, 2026-11-08)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test/output/signin-words-phone.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    expect(await identitiesOf(page, request)).toHaveLength(1);

    await passCheck(page, words);
    await expect(row).toContainText("Saved");
    await expect(row).not.toContainText("Not backed up yet");
    await page.screenshot({ path: "test/output/signin-saved.png" });

    // the same words again from the advanced part, and the one key cannot be removed
    await row.getByRole("button", { name: "Advanced" }).click();
    await row.getByRole("button", { name: "Show recovery words" }).click();
    expect(await shownWords(page)).toEqual(words);
    await page.keyboard.press("Escape");
    await expect(row.getByRole("button", { name: "Remove" })).toBeDisabled();
    await context.close();
  });

  test("a wrong word in the check keeps the backup open", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "Wanda");
    await openProfile(page);
    const row = page.getByTestId("save-progress");
    await row.getByRole("button", { name: "Save your progress" }).click();
    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    const words = await shownWords(page);
    await passCheck(
      page,
      words.map(() => "chocolate")
    );
    await expect(
      page.getByText("One of the words does not match", { exact: false })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row).toContainText("Not backed up yet");
    // backing up later shows the same words
    await row.getByRole("button", { name: "Back up now" }).click();
    expect(await shownWords(page)).toEqual(words);
    await context.close();
  });

  test("a double tap links one key", async ({ browser, request }) => {
    const { context, page } = await createPlayer(browser, request, "Dora");
    await openProfile(page);
    const save = page
      .getByTestId("save-progress")
      .getByRole("button", { name: "Save your progress" });
    await save.dblclick();
    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    await expect.poll(() => identitiesOf(page, request)).toHaveLength(1);
    await context.close();
  });

  test("the preprod chip leads to the privacy policy's section about it", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "Pia");
    await openProfile(page);
    const chip = page.getByRole("link", { name: "preprod" });
    await expect(chip).toBeVisible();
    expect(await chip.getAttribute("href")).toBe("/privacy-policy/#cardano-en");
    const policy = await (await request.get("/privacy-policy/")).text();
    for (const section of ['id="cardano-en"', 'id="cardano-de"']) {
      expect(policy).toContain(section);
    }
    expect(policy).toContain(
      "https://cardanofoundation.org/academy/course/blockchain-fundamentals"
    );
    await context.close();
  });

  test("in the Android app saving works, but no preprod chip shows", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "Andi");
    // the TWA's real start address (apps/android/twa-manifest.json); the game cleans it up at boot
    await page.goto("/index.html?app_runs_as=twa&app_version=1", {
      waitUntil: "networkidle",
    });
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await openProfile(page);
    await expect(
      page
        .getByTestId("save-progress")
        .getByRole("button", { name: "Save your progress" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "preprod" })).toHaveCount(0);
    await context.close();
  });
});
