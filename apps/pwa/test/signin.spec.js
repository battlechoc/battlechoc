import { test, expect } from "@playwright/test";
import { api, createPlayer } from "./helpers/players.js";
import { accountOf, readEntry, writeEntry } from "./helpers/profile.js";
import { linkSecondKey, nodeKeys, signAs } from "./helpers/cardano.js";
import { fakeWallet } from "./helpers/wallet.js";
import { suggestWords } from "../src/cardano/wordSuggestions.js";
import fs from "node:fs";

// Saving progress with 24 recovery words (a Cardano key made on the device), the profile's three
// states, "Keep your words", "Account safety" and its technical details (the owner's mockup B,
// 2026-11-12). The API runs with CARDANO_NETWORK=preprod (playwright.config.js), the build with
// VITE_CARDANO_NETWORK=preprod (.env.e2e).

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

// the profile's row and the dialogs over it
const profileRow = (page) => page.getByTestId("save-progress");
const keepWords = (page) => page.getByTestId("keep-words");
const safety = (page) => page.getByTestId("account-safety");

// "Save your progress" in the profile: the progress is saved, "Keep your words" opens
const saveProgress = async (page) => {
  await profileRow(page)
    .getByRole("button", { name: "Save your progress" })
    .click();
  await expect(keepWords(page)).toBeVisible();
};

// "Write them down" in Keep your words: the words dialog
const writeDown = (page) =>
  keepWords(page)
    .getByRole("button", { name: /^Write them down/ })
    .click();

// Keep your words' own "Back"
const leaveKeepWords = async (page) => {
  await keepWords(page)
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(keepWords(page)).toHaveCount(0);
};

// "Saved · Manage" in the profile: Account safety
const manage = async (page) => {
  await profileRow(page)
    .getByRole("button", { name: /Manage/ })
    .click();
  await expect(safety(page)).toBeVisible();
};

const technicalDetails = async (page) => {
  const toggle = safety(page).getByRole("button", {
    name: "Technical details",
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.getByTestId("technical-details");
};

// a screenshot at phone size (390 × 844) of what is open, back at the desktop size afterwards
const phoneShot = async (page, name, scrollTo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (scrollTo) {
    await scrollTo.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test/output/${name}.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
};

// an Android phone (Chromium with its user agent and screen): features.isMobile() holds
const ANDROID_PHONE = {
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

test.describe("saving progress", () => {
  test("save your progress: keep your words, the words and their check, then saved with Manage", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiSara");
    await openProfile(page);
    const row = profileRow(page);
    await expect(row).toHaveAttribute("data-state", "unsaved");
    await expect(row).toContainText("Your progress is only on this device.");
    await expect(
      row.getByRole("button", { name: "I already have an account" })
    ).toBeVisible();
    await phoneShot(page, "account-profile-unsaved", row);
    await saveProgress(page);
    expect(await identitiesOf(page, request)).toHaveLength(1);
    // on a computer all three ways show
    await expect(
      keepWords(page).getByRole("button", { name: /^Print/ })
    ).toBeVisible();
    await expect(
      keepWords(page).getByRole("button", { name: /^Save as a file/ })
    ).toBeVisible();
    await phoneShot(page, "account-keep-words");

    await writeDown(page);
    const words = await shownWords(page);
    expect(new Set(words).size).toBeGreaterThan(1);
    await page.screenshot({ path: "test/output/signin-words.png" });
    // on a phone the title stays clear of the dialog's decoration (owner, 2026-11-08)
    await phoneShot(page, "signin-words-phone");

    // the words dialog's own back button (top right) closes it, Keep your words stays
    await page.locator("[data-icon=back]:visible").last().click();
    await expect(page.getByTestId("recovery-word")).toHaveCount(0);
    await leaveKeepWords(page);
    await expect(row).toHaveAttribute("data-state", "unfinished");
    await expect(row).toContainText("Keep your 24 words safe.");
    await expect(
      row.getByRole("button", { name: "I already have an account" })
    ).toHaveCount(0);
    await phoneShot(page, "account-profile-unfinished", row);
    await row.getByRole("button", { name: "Finish your backup" }).click();
    await writeDown(page);
    expect(await shownWords(page)).toEqual(words);

    await passCheck(page, words);
    await expect(
      keepWords(page).getByRole("button", { name: /^Write them down/ })
    ).toContainText("Done");
    await leaveKeepWords(page);
    await expect(row).toHaveAttribute("data-state", "saved");
    await expect(row).toContainText("Saved");
    await expect(row).toContainText("Manage");
    await phoneShot(page, "account-profile-saved", row);
    // still saved after a reload (the profile loads its state when it opens)
    await page.reload({ waitUntil: "networkidle" });
    await openProfile(page);
    await expect(profileRow(page)).toHaveAttribute("data-state", "saved");

    // Account safety: the words backed up, no wallet yet; the same words again
    await manage(page);
    await expect(page.getByTestId("safety-words")).toContainText("Backed up");
    await expect(page.getByTestId("safety-wallet")).toContainText(
      "Not connected"
    );
    await expect(
      page.getByTestId("safety-wallet").getByRole("button", { name: "Connect" })
    ).toBeVisible();
    await page
      .getByTestId("safety-words")
      .getByRole("button", { name: "Back up" })
      .click();
    await writeDown(page);
    expect(await shownWords(page)).toEqual(words);
    await context.close();
  });

  test("Print opens the words and prints them", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiPrinz");
    // counts the prints and how many words the print sheet held at that moment
    await page.evaluate(() => {
      window.__printed = 0;
      window.__sheet = [];
      window.print = () => {
        window.__printed += 1;
        window.__sheet.push(
          document.querySelectorAll(".battlechoc-recovery-print div").length
        );
      };
    });
    await openProfile(page);
    await saveProgress(page);
    await keepWords(page)
      .getByRole("button", { name: /^Print/ })
      .click();
    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
    // the print button of the words prints again
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__printed)).toBe(2);
    // a check left open does not come back with the next Print: the sheet is there to print
    await page.getByRole("button", { name: "I wrote them down" }).click();
    await expect(page.getByTestId("recovery-check-word")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("recovery-check-word")).toHaveCount(0);
    await keepWords(page)
      .getByRole("button", { name: /^Print/ })
      .click();
    await expect.poll(() => page.evaluate(() => window.__printed)).toBe(3);
    expect(await page.evaluate(() => window.__sheet)).toEqual([24, 24, 24]);
    await context.close();
  });

  test("on a phone nothing offers to print the words", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiHandy", {
      device: ANDROID_PHONE,
    });
    await openProfile(page);
    await saveProgress(page);
    await expect(
      keepWords(page).getByRole("button", { name: /^Write them down/ })
    ).toBeVisible();
    await expect(
      keepWords(page).getByRole("button", { name: /^Print/ })
    ).toHaveCount(0);
    // Android shares the backup file
    await expect(
      keepWords(page).getByRole("button", { name: /^Save as a file/ })
    ).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "test/output/account-keep-words-phone.png" });
    await writeDown(page);
    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    await expect(
      page.getByRole("button", { name: "Print", exact: true })
    ).toHaveCount(0);
    await context.close();
  });

  test("a wrong word in the check keeps the backup open", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiWanda");
    await openProfile(page);
    const row = profileRow(page);
    await saveProgress(page);
    await writeDown(page);
    const words = await shownWords(page);
    await passCheck(
      page,
      words.map(() => "chocolate")
    );
    await expect(
      page.getByText("One of the words does not match", { exact: false })
    ).toBeVisible();
    // Escape closes the words, then Keep your words
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("recovery-word")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(keepWords(page)).toHaveCount(0);
    await expect(row).toHaveAttribute("data-state", "unfinished");
    // backing up later shows the same words
    await row.getByRole("button", { name: "Finish your backup" }).click();
    await writeDown(page);
    expect(await shownWords(page)).toEqual(words);
    await context.close();
  });

  test("a double tap links one key", async ({ browser, request }) => {
    const { context, page } = await createPlayer(browser, request, "SiDora");
    await openProfile(page);
    const save = profileRow(page).getByRole("button", {
      name: "Save your progress",
    });
    await save.dblclick();
    await expect(keepWords(page)).toBeVisible();
    await expect.poll(() => identitiesOf(page, request)).toHaveLength(1);
    await context.close();
  });

  test("technical details: the test network, the labelled keys, Remove only beside another key, the policy", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiPia");
    const { context, page } = saved;
    await manage(page);
    await phoneShot(page, "account-safety");
    let details = await technicalDetails(page);
    await expect(details).toContainText(
      "Cardano test network (Preprod). No real money is involved. Your wallet must be set to Preprod too."
    );
    await expect(details).toContainText("Address of your recovery words");
    await expect(details).toContainText(
      nodeKeys(saved.words).rewardAddress.slice(0, 14)
    );
    // the one key cannot go: no Remove at all (not a disabled one)
    await expect(details.getByRole("button", { name: /Remove/ })).toHaveCount(
      0
    );
    const policy = details.getByRole("link", {
      name: "What battlechoc stores on Cardano",
    });
    expect(await policy.getAttribute("href")).toBe(
      "/privacy-policy/#cardano-en"
    );
    const text = await (await request.get("/privacy-policy/")).text();
    for (const section of ['id="cardano-en"', 'id="cardano-de"']) {
      expect(text).toContain(section);
    }
    expect(text).toContain(
      "https://cardanofoundation.org/academy/course/blockchain-fundamentals"
    );

    // a second key (a wallet): both can go now; the words' Remove says what goes with them
    const { second, status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      saved.words
    );
    expect(status).toBe(200);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await openProfile(page);
    await manage(page);
    await expect(page.getByTestId("safety-wallet")).toContainText("Connected");
    await expect(
      page
        .getByTestId("safety-wallet")
        .getByRole("button", { name: "Disconnect" })
    ).toBeVisible();
    details = await technicalDetails(page);
    await expect(details).toContainText("Address of your wallet");
    await expect(details.getByRole("button", { name: /Remove/ })).toHaveCount(
      2
    );
    await expect(details).toContainText(
      "Your passkey, printout and file belong to these words"
    );
    await expect(
      details.getByRole("button", {
        name: `Remove ${second.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
    ).toBeVisible();
    await phoneShot(page, "account-safety-details", details);
    await context.close();
  });

  test("in the Android app saving works, but Account safety shows no wallet and no technical details", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiAndi");
    // the TWA's real start address (apps/android/twa-manifest.json); the game cleans it up at boot
    await page.goto("/index.html?app_runs_as=twa&app_version=1", {
      waitUntil: "networkidle",
    });
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await openProfile(page);
    await saveProgress(page);
    await writeDown(page);
    const words = await shownWords(page);
    await passCheck(page, words);
    await leaveKeepWords(page);
    await manage(page);
    await expect(page.getByTestId("safety-words")).toBeVisible();
    await expect(page.getByTestId("safety-wallet")).toHaveCount(0);
    await expect(
      safety(page).getByRole("button", { name: "Technical details" })
    ).toHaveCount(0);
    await expect(safety(page)).not.toContainText("Cardano");
    await expect(safety(page)).not.toContainText("stake");
    await expect(
      safety(page).getByRole("button", { name: "Use another account" })
    ).toBeVisible();
    await context.close();
  });

  test("the check of the words offers the word from its first letters and goes on to the next field", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiWenke");
    await openProfile(page);
    await saveProgress(page);
    await writeDown(page);
    const words = await shownWords(page);
    await page.getByRole("button", { name: "I wrote them down" }).click();
    const fields = page.getByTestId("recovery-check-word");
    await expect(fields).toHaveCount(3);
    // the asked words are random: take the first field whose word a few letters offer (a short
    // word like "stay" is never offered, it is typed in full)
    const asked = [];
    for (const field of await fields.all()) {
      asked.push(words[Number(await field.getAttribute("data-n")) - 1]);
    }
    const index = asked.findIndex((word) => typedUntilOffered(word) !== null);
    const word = asked[index];
    const field = fields.nth(index);
    await field.pressSequentially(typedUntilOffered(word));
    const chips = page.getByTestId("word-suggestion");
    await expect(
      chips.filter({ hasText: new RegExp(`^${word}$`) })
    ).toBeVisible();
    await chips.filter({ hasText: new RegExp(`^${word}$`) }).click();
    await expect(field).toHaveValue(word);
    if (index < asked.length - 1) {
      await expect(fields.nth(index + 1)).toBeFocused();
    }
    await context.close();
  });
});

// the shortest start of `word` whose suggestions offer it, or null when none does
const typedUntilOffered = (word) => {
  for (let length = 1; length <= word.length; length += 1) {
    if (suggestWords(word.slice(0, length)).includes(word)) {
      return word.slice(0, length);
    }
  }
  return null;
};

// a player who saved their progress (and backed the words up): { context, page, username, words,
// playerId }; the profile stays open
async function savedPlayer(browser, request, name, options) {
  const player = await createPlayer(browser, request, name, options);
  await openProfile(player.page);
  await saveProgress(player.page);
  await writeDown(player.page);
  const words = await shownWords(player.page);
  await passCheck(player.page, words);
  await leaveKeepWords(player.page);
  await expect(profileRow(player.page)).toHaveAttribute("data-state", "saved");
  const { playerId } = await accountOf(player.page);
  return { ...player, words, playerId };
}

// a device that never played: the game made its account, the title screen shows
const freshDevice = async (browser) => {
  const context = await browser.newContext();
  await context.addInitScript((url) => {
    window.localStorage.setItem("battlechoc.apiUrl", url);
  }, api);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
  return { context, page };
};

const enterWords = async (page, text) => {
  await page.getByTestId("connect-words").fill(text);
  await page.getByRole("button", { name: "Continue" }).click();
};

// the device switched to the saved account: it reloads with the saved account's session (a read
// that the reload cuts off is tried again)
const switchedTo = (page, playerId) =>
  expect
    .poll(
      async () => (await accountOf(page).catch(() => undefined))?.playerId,
      { timeout: 15000 }
    )
    .toBe(playerId);

// After the switch the reloaded page creates its 3D engine anew. WebGL runs in software here
// (SwiftShader, in Chrome's GPU process), and the engine's getContext/getExtension calls block
// the page until the GPU process answers: 3 to 4 s on a laptop, but up to 24 s on a two-core CI
// runner when the page before the reload kept the GPU process busy (the tutorial's board). So
// the title screen gets a minute; players have a real GPU, where this takes milliseconds.
const titleScreenAfterReload = (page) =>
  expect(page.getByText("Start Game", { exact: true }).first()).toBeVisible({
    timeout: 60000,
  });

test.describe("signing in again with the words", () => {
  test("a new device signs in from the tutorial's welcome card and plays on as that player", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiMona");
    // only its words and id are needed: closed, its page holds no second WebGL context
    await saved.context.close();
    const { context, page } = await freshDevice(browser);
    await page.getByTestId("start-button").click();
    await expect(page.getByTestId("tutorial-coach")).toHaveAttribute(
      "data-step",
      "welcome"
    );
    await page.screenshot({ path: "test/output/signin-welcome.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test/output/signin-welcome-phone.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await expect(page.getByText("0 of 24 words")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test/output/signin-connect.png" });
    await enterWords(page, saved.words.join(" "));
    await switchedTo(page, saved.playerId);
    await titleScreenAfterReload(page);
    await openProfile(page);
    await expect(
      page.getByText(saved.username).filter({ visible: true }).first()
    ).toBeVisible();
    // the words are on this device now, backed up (the player just typed them)
    await expect(page.getByTestId("save-progress")).toContainText("Saved");
    await context.close();
  });

  test("words typed loosely work: capitals, numbering, bullets, tabs, line breaks", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiLena");
    const { context, page } = await freshDevice(browser);
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    const loose = saved.words
      .map((word, i) =>
        i % 3 === 0
          ? `• ${word}\t`
          : `${i + 1}. ${i % 2 ? word.toUpperCase() : word}`
      )
      .join("\n");
    await enterWords(page, loose);
    await switchedTo(page, saved.playerId);
    await context.close();
    await saved.context.close();
  });

  test("typing a word offers the words it starts; a tap puts it in and keeps typing in the box", async ({
    browser,
  }) => {
    const { context, page } = await freshDevice(browser);
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    const area = page.getByTestId("connect-words");
    const chips = page.getByTestId("word-suggestion");
    await area.pressSequentially("1. Stu");
    await expect(chips.filter({ hasText: /^stuff$/ })).toBeVisible();
    await area.press("d");
    await expect(chips).toHaveText(["student"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test/output/signin-word-suggestions.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await chips.first().click();
    await expect(area).toHaveValue("1. student ");
    await expect(area).toBeFocused();
    await expect(chips).toHaveCount(0);
    await context.close();
  });

  test("one wrong word says so and sends nothing; unknown words leave the account as it was", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiNina");
    const { context, page } = await freshDevice(browser);
    const { playerId } = await accountOf(page);
    const signIns = [];
    page.on("request", (sent) => {
      if (sent.url().includes("/auth/cardano/")) {
        signIns.push(sent.url());
      }
    });
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    const wrong = [...saved.words];
    wrong[5] = wrong[5] === "abandon" ? "ability" : "abandon";
    await enterWords(page, wrong.join(" "));
    await expect(
      page.getByText("These words don't fit together", { exact: false })
    ).toBeVisible();
    expect(signIns).toEqual([]);

    // words that fit together but save nobody
    const nobody = await page.evaluate(async () => {
      const { PrivateKey } =
        await import("/node_modules/@evolution-sdk/evolution/dist/PrivateKey.js").catch(
          () => ({})
        );
      return PrivateKey ? PrivateKey.generateMnemonic(256) : null;
    });
    const unknown =
      nobody ||
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    await enterWords(page, unknown);
    // where the wallet door shows (plan 3), the answer points to it: a wallet's own words
    await expect(
      page.getByText("No player has these words.", { exact: false })
    ).toBeVisible();
    expect((await accountOf(page)).playerId).toBe(playerId);
    await context.close();
    await saved.context.close();
  });

  test("a device with matches of its own asks which progress to keep", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiOlga");
    // a player with finished matches on this device's account
    const other = await createPlayer(browser, request, "SiOtto");
    const { page } = other;
    const before = (await accountOf(page)).playerId;
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, saved.words.join(" "));
    await expect(
      page.getByText("This device has progress of its own", { exact: false })
    ).toBeVisible();
    await page.getByRole("button", { name: "This device's progress" }).click();
    expect((await accountOf(page)).playerId).toBe(before);

    await enterWords(page, saved.words.join(" "));
    await page.getByRole("button", { name: "My saved progress" }).click();
    await switchedTo(page, saved.playerId);
    await other.context.close();
    await saved.context.close();
  });

  test("a match played offline on the new device goes to the saved account, once, and the saved name stays", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiPaul");
    const { context, page } = await freshDevice(browser);
    // a lost match against the AI that has not reached the server yet
    const stats = (await readEntry(page, "player", "stats")) || {};
    await writeEntry(page, "player", "stats", {
      ...stats,
      trackRecord: [
        {
          id: `offline-${saved.username}`,
          lost: true,
          builtEntities: 3,
          winners: [{ idx: 1, name: "Tom Toffee" }],
          awards: [],
        },
      ],
    });
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, saved.words.join(" "));
    await switchedTo(page, saved.playerId);
    await titleScreenAfterReload(page);
    const { refreshToken } = await accountOf(page);
    const { accessToken } = await (
      await request.post(`${api}/accounts/token`, { data: { refreshToken } })
    ).json();
    const profileOf = async () =>
      (
        await (
          await request.get(`${api}/user`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        ).json()
      ).stats;
    // createPlayer seeded 1 win and 3 losses; the offline loss makes 4
    await expect.poll(async () => (await profileOf()).losses).toBe(4);
    expect((await profileOf()).username).toBe(saved.username);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => (await profileOf()).losses).toBe(4);
    await context.close();
    await saved.context.close();
  });
});

test.describe("switching accounts safely", () => {
  test("right after switching the device already shows the saved player, before the first merge", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiQuinn");
    const { context, page } = await freshDevice(browser);
    // the first merge after the switch is slow
    await page.route("**/user/merge", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue();
    });
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, saved.words.join(" "));
    await switchedTo(page, saved.playerId);
    const stats = await readEntry(page, "player", "stats");
    expect(stats.username).toBe(saved.username);
    await context.close();
    await saved.context.close();
  });

  test("a double tap on Continue signs in once", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiRuth");
    const { context, page } = await freshDevice(browser);
    const verifies = [];
    page.on("request", (sent) => {
      if (sent.url().includes("/auth/cardano/verify")) {
        verifies.push(sent.url());
      }
    });
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByTestId("connect-words").fill(saved.words.join(" "));
    await page.getByRole("button", { name: "Continue" }).dblclick();
    await switchedTo(page, saved.playerId);
    await titleScreenAfterReload(page);
    expect(verifies).toHaveLength(1);
    await context.close();
    await saved.context.close();
  });
});

test.describe("switching never loses a device's progress silently", () => {
  test("a device whose own words are not backed up is led to back them up before it can switch", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiUrsula");
    // a device with matches that saved its progress but never backed its words up: the profile
    // offers only "Finish your backup", no way to another account
    const device = await createPlayer(browser, request, "SiTina");
    const { page } = device;
    await openProfile(page);
    const row = profileRow(page);
    await saveProgress(page);
    await writeDown(page);
    const deviceWords = await shownWords(page);
    await page.keyboard.press("Escape");
    await leaveKeepWords(page);
    await expect(row).toHaveAttribute("data-state", "unfinished");
    await expect(row.getByRole("button")).toHaveCount(1);

    // backed up, Account safety leads to another account; should the mark be gone by then
    // (another tab, cleared site data), ConnectAccount still asks for the backup first
    await row.getByRole("button", { name: "Finish your backup" }).click();
    await writeDown(page);
    await passCheck(page, deviceWords);
    await leaveKeepWords(page);
    await manage(page);
    await safety(page)
      .getByRole("button", { name: "Use another account" })
      .click();
    await expect(page.getByTestId("connect-words")).toBeVisible();
    await writeEntry(page, "player", "cardanoKeyBackedUp", []);
    await enterWords(page, saved.words.join(" "));
    await expect(
      page.getByText("Back up this device's recovery words first", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "My saved progress" })
    ).toBeDisabled();
    await page.getByTestId("connect-back-up").click();
    expect(await shownWords(page)).toEqual(deviceWords);
    await passCheck(page, deviceWords);
    await page.getByRole("button", { name: "My saved progress" }).click();
    await switchedTo(page, saved.playerId);
    await device.context.close();
    await saved.context.close();
  });

  test("a device that never saved its progress is told it will be gone", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiVera");
    const device = await createPlayer(browser, request, "SiWim");
    const { page } = device;
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, saved.words.join(" "));
    await expect(
      page.getByText("If you switch, it is gone", { exact: false })
    ).toBeVisible();
    await device.context.close();
    await saved.context.close();
  });
});

// passkeys need a host name: the game on http://localhost (the e2e preview server's port)
const LOCALHOST = `http://localhost:${process.env.PORT || 3000}`;

// a passkey authenticator on the page (Chromium over CDP), with or without PRF; `asserted` counts
// the times a passkey was used (a fingerprint/face/PIN prompt on a real device)
const addAuthenticator = async (page, { prf = true } = {}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: prf,
    },
  });
  const used = { count: 0 };
  cdp.on("WebAuthn.credentialAsserted", () => {
    used.count += 1;
  });
  return used;
};

const accessTokenOf = async (page, request) => {
  const { refreshToken } = await accountOf(page);
  return (
    await (
      await request.post(`${api}/accounts/token`, { data: { refreshToken } })
    ).json()
  ).accessToken;
};

const passkeysOf = async (page, request) =>
  (
    await request.get(`${api}/user/passkeys`, {
      headers: {
        Authorization: `Bearer ${await accessTokenOf(page, request)}`,
      },
    })
  ).json();

// a saved player on localhost with a passkey authenticator; `check`: the words written down and
// checked (the profile says saved, Account safety is open), else Keep your words stays open
// right after saving (the profile would say "Finish your backup")
const savedOnLocalhost = async (
  browser,
  request,
  name,
  { prf = true, check = true } = {}
) => {
  const player = await createPlayer(browser, request, name, {
    origin: LOCALHOST,
  });
  const used = await addAuthenticator(player.page, { prf });
  const { page } = player;
  await openProfile(page);
  await saveProgress(page);
  await writeDown(page);
  const words = await shownWords(page);
  if (check) {
    await passCheck(page, words);
    await leaveKeepWords(page);
    await manage(page);
  } else {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("recovery-word")).toHaveCount(0);
  }
  return { ...player, words, used };
};

const passkeyRow = (page) => page.getByTestId("safety-passkey");

// "Set up" in Account safety's passkey row: the passkey is made and kept on the server
const setUpPasskey = async (page) => {
  await passkeyRow(page).getByRole("button", { name: "Set up" }).click();
  await expect(passkeyRow(page)).toContainText("1 set up");
};

// the backup file from Keep your words: the password twice; resolves with the download
const saveFile = async (page, password = "choco-late-42") => {
  await keepWords(page)
    .getByRole("button", { name: /^Save as a file/ })
    .click();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Password again").fill(password);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save the file" }).click(),
  ]);
  return download;
};

// closes Account safety and the profile, and opens both again (they read the keys on opening)
const reopenSafety = async (page) => {
  await page.keyboard.press("Escape");
  await expect(safety(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openProfile(page);
  await manage(page);
};

test.describe("backups with a passkey or a file (plan 2)", () => {
  test("a passkey backs the words up; showing the words then asks for the passkey", async ({
    browser,
    request,
  }) => {
    const { context, page, words, used } = await savedOnLocalhost(
      browser,
      request,
      "SiXaver"
    );
    // without a passkey: recommended, "Set up"; with one: how many, "Add"
    await expect(passkeyRow(page)).toContainText(
      "Recommended: protects the words on this device"
    );
    await expect(
      passkeyRow(page).getByRole("button", { name: "Add" })
    ).toHaveCount(0);
    await setUpPasskey(page);
    await expect(
      passkeyRow(page).getByRole("button", { name: "Add" })
    ).toBeVisible();
    await expect(
      passkeyRow(page).getByRole("button", { name: "Set up" })
    ).toHaveCount(0);
    expect(await passkeysOf(page, request)).toHaveLength(1);
    await page.screenshot({ path: "test/output/signin-backups.png" });

    const before = used.count;
    await page
      .getByTestId("safety-words")
      .getByRole("button", { name: "Back up" })
      .click();
    await writeDown(page);
    expect(await shownWords(page)).toEqual(words);
    expect(used.count).toBeGreaterThan(before);
    await context.close();
  });

  test("a passkey without PRF cannot protect the words: it says so and keeps nothing", async ({
    browser,
    request,
  }) => {
    const { context, page } = await savedOnLocalhost(
      browser,
      request,
      "SiYara",
      { prf: false }
    );
    await passkeyRow(page).getByRole("button", { name: "Set up" }).click();
    await expect(
      safety(page).getByText("can't protect the words", { exact: false })
    ).toBeVisible();
    expect(await passkeysOf(page, request)).toEqual([]);
    await expect(passkeyRow(page)).toContainText("Recommended");
    // the error stays with Account safety: closing it does not move it under the profile's row
    await page.keyboard.press("Escape");
    await expect(safety(page)).toHaveCount(0);
    await expect(profileRow(page).getByRole("alert")).toHaveCount(0);
    await context.close();
  });

  test("a backup file is saved with a password and holds no word in the clear", async ({
    browser,
    request,
  }) => {
    const { context, page, words } = await savedOnLocalhost(
      browser,
      request,
      "SiZoe",
      { check: false }
    );
    await keepWords(page)
      .getByRole("button", { name: /^Save as a file/ })
      .click();
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Password again").fill("short");
    await page.getByRole("button", { name: "Save the file" }).click();
    await expect(page.getByText("At least 8 characters")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("choco-late-42");
    await page.getByLabel("Password again").fill("choco-late-43");
    await page.getByRole("button", { name: "Save the file" }).click();
    await expect(page.getByText("not the same")).toBeVisible();
    await page.getByLabel("Password again").fill("choco-late-42");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save the file" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("battlechoc-recovery.json");
    const text = fs.readFileSync(await download.path(), "utf8");
    expect(JSON.parse(text).format).toBe("battlechoc-recovery");
    for (const word of words) {
      expect(text.includes(` ${word} `)).toBe(false);
    }
    // the file counts as the backup: saved, and the words were not written down
    await expect(
      keepWords(page).getByRole("button", { name: /^Save as a file/ })
    ).toContainText("Saved");
    await expect(
      keepWords(page).getByRole("button", { name: /^Write them down/ })
    ).not.toContainText("Done");
    await leaveKeepWords(page);
    await expect(profileRow(page)).toHaveAttribute("data-state", "saved");
    await context.close();
  });

  test("removing a key needs a proof: the passkey", async ({
    browser,
    request,
  }) => {
    const { context, page, words, used } = await savedOnLocalhost(
      browser,
      request,
      "SiAbel"
    );
    await setUpPasskey(page);
    const { second, status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      words
    );
    expect(status).toBe(200);
    await reopenSafety(page);
    const details = await technicalDetails(page);
    const before = used.count;
    await details
      .getByRole("button", {
        name: `Remove ${second.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await expect
      .poll(async () => (await identitiesOf(page, request)).length)
      .toBe(1);
    expect(used.count).toBeGreaterThan(before);
    await context.close();
  });
});

// this browser becomes a new device: the game's data goes (on a page that does not hold the
// database open), the passkey authenticator stays; resolves when the game made its new account
const becomeNewDevice = async (page, before) => {
  await page.goto(`${LOCALHOST}/privacy-policy/`);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("battlechoc");
        request.onsuccess = request.onerror = request.onblocked = resolve;
      })
  );
  await page.goto(`${LOCALHOST}/`, { waitUntil: "networkidle" });
  await expect
    .poll(async () => (await accountOf(page))?.playerId, { timeout: 15000 })
    .not.toBe(before);
};

test.describe("the passkey guards the words (plan 2, after review)", () => {
  test("with a passkey, saving a backup file asks for the passkey first", async ({
    browser,
    request,
  }) => {
    const { context, page, used } = await savedOnLocalhost(
      browser,
      request,
      "SiDaria"
    );
    await setUpPasskey(page);
    const before = used.count;
    await page
      .getByTestId("safety-words")
      .getByRole("button", { name: "Back up" })
      .click();
    await saveFile(page);
    expect(used.count).toBeGreaterThan(before);
    await context.close();
  });

  test("removing this device's own key takes its passkey backup and its words along", async ({
    browser,
    request,
  }) => {
    const { context, page, words } = await savedOnLocalhost(
      browser,
      request,
      "SiEmil"
    );
    await setUpPasskey(page);
    const own = nodeKeys(words);
    const { status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      words
    );
    expect(status).toBe(200);
    await reopenSafety(page);
    const details = await technicalDetails(page);
    await details
      .getByRole("button", {
        name: `Remove ${own.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await expect.poll(() => passkeysOf(page, request)).toEqual([]);
    // the words are gone from this device: no words row, no passkey row
    await expect(page.getByTestId("safety-words")).toHaveCount(0);
    await expect(passkeyRow(page)).toHaveCount(0);
    expect(await readEntry(page, "player", "cardanoKey")).toBeUndefined();
    await context.close();
  });

  test("words that are not the player's do not confirm a change", async ({
    browser,
    request,
  }) => {
    const { context, page, words } = await savedOnLocalhost(
      browser,
      request,
      "SiFrida"
    );
    const { second, status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      words
    );
    expect(status).toBe(200);
    await reopenSafety(page);
    const details = await technicalDetails(page);
    await details
      .getByRole("button", {
        name: `Remove ${second.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByTestId("confirm-words").fill(nodeKeys().words.join(" "));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Your keys are unchanged")).toBeVisible();
    const keys = await (
      await request.get(`${api}/user/identities`, {
        headers: {
          Authorization: `Bearer ${await accessTokenOf(page, request)}`,
        },
      })
    ).json();
    expect(keys).toHaveLength(2);
    await context.close();
  });
});

test.describe("a removed key signs its devices out (plan 2, after review)", () => {
  test("a device signed in with a removed key forgets its words, says why and starts anew", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiLotte");
    const { context, page } = await freshDevice(browser);
    await page.getByTestId("start-button").click();
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, saved.words.join(" "));
    await switchedTo(page, saved.playerId);
    expect(await readEntry(page, "player", "cardanoKey")).toBeTruthy();

    // the first device replaces the key: a second one in, the words' key out
    const token = await accessTokenOf(saved.page, request);
    const { second, status } = await linkSecondKey(request, token, saved.words);
    expect(status).toBe(200);
    const { confirmToken } = await (
      await signAs(request, token, second, "confirm")
    ).json();
    const removed = await request.delete(
      `${api}/user/identities/${encodeURIComponent(
        nodeKeys(saved.words).subject
      )}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Battlechoc-Confirm": confirmToken,
        },
      }
    );
    expect(removed.status()).toBe(204);

    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByText("This device was signed out because its key was removed")
    ).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => (await accountOf(page))?.playerId, { timeout: 15000 })
      .not.toBe(saved.playerId);
    expect(await readEntry(page, "player", "cardanoKey")).toBeUndefined();
    expect(
      await readEntry(page, "player", "cardanoKeyBackedUp")
    ).toBeUndefined();
    // the device that removed the key plays on
    expect(
      (
        await request.post(`${api}/accounts/token`, {
          data: { refreshToken: (await accountOf(saved.page)).refreshToken },
        })
      ).status()
    ).toBe(200);
    await context.close();
    await saved.context.close();
  });
});

test.describe("signing in again with a passkey or a backup file (plan 2)", () => {
  test("a new device signs in with the passkey", async ({
    browser,
    request,
  }) => {
    const saved = await savedOnLocalhost(browser, request, "SiBruno");
    const { page } = saved;
    await setUpPasskey(page);
    const { playerId } = await accountOf(page);
    await becomeNewDevice(page, playerId);

    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.screenshot({ path: "test/output/signin-connect-backups.png" });
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await switchedTo(page, playerId);
    // the words came from the passkey: that is the backup, not paper
    await openProfile(page);
    await expect(profileRow(page)).toHaveAttribute("data-state", "saved");
    await manage(page);
    await expect(passkeyRow(page)).toContainText("1 set up");
    await expect(page.getByTestId("safety-words")).toContainText(
      "Not backed up yet"
    );
    await saved.context.close();
  });

  test("a backup file opens on a new device with its password; a wrong password says so", async ({
    browser,
    request,
  }) => {
    const saved = await savedOnLocalhost(browser, request, "SiCarla", {
      check: false,
    });
    const { page } = saved;
    const download = await saveFile(page);
    const file = await download.path();
    const { playerId } = await accountOf(page);

    const device = await freshDevice(browser);
    const signIns = [];
    device.page.on("request", (sent) => {
      if (sent.url().includes("/auth/cardano/")) {
        signIns.push(sent.url());
      }
    });
    await openProfile(device.page);
    await device.page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await device.page.getByTestId("connect-file").setInputFiles(file);
    await device.page
      .getByLabel("Password", { exact: true })
      .fill("wrong-password");
    await device.page
      .getByRole("button", { name: "Open", exact: true })
      .click();
    await expect(
      device.page.getByText("The password does not fit this file")
    ).toBeVisible();
    expect(signIns).toEqual([]);
    await device.page
      .getByLabel("Password", { exact: true })
      .fill("choco-late-42");
    await device.page
      .getByRole("button", { name: "Open", exact: true })
      .click();
    await switchedTo(device.page, playerId);
    await titleScreenAfterReload(device.page);
    // the file is the backup, not paper
    await openProfile(device.page);
    await manage(device.page);
    await expect(device.page.getByTestId("safety-words")).toContainText(
      "Backed up"
    );
    await device.page
      .getByTestId("safety-words")
      .getByRole("button", { name: "Back up" })
      .click();
    await expect(
      keepWords(device.page).getByRole("button", { name: /^Save as a file/ })
    ).toContainText("Saved");
    await expect(
      keepWords(device.page).getByRole("button", { name: /^Write them down/ })
    ).not.toContainText("Done");
    await device.context.close();
    await saved.context.close();
  });

  test("a file that is no backup says so at once, asks for no password and sends nothing", async ({
    browser,
  }) => {
    const { context, page } = await freshDevice(browser);
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByTestId("connect-file").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(
      page.getByText("This is not a battlechoc backup file")
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await context.close();
  });
});

test.describe("the wallet door (plan 3)", () => {
  // the device's player links `keys` through the API (a known wallet for another device)
  const linkWallet = async (page, request, keys) => {
    const answer = await signAs(
      request,
      await accessTokenOf(page, request),
      keys,
      "link"
    );
    expect(answer.status()).toBe(200);
  };

  const openDoor = async (page) => {
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByRole("button", { name: "Use a Cardano wallet" }).click();
  };

  const chooseEternl = (page) =>
    page
      .getByTestId("wallet-door")
      .getByText("Eternl", { exact: false })
      .first()
      .click();

  test("an unknown wallet links to the device's player and the profile lists it", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiWally");
    const wallet = nodeKeys();
    const { signed } = await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    const before = (await accountOf(page)).playerId;
    await openDoor(page);
    await expect(page.getByTestId("wallet-door")).toBeVisible();
    // one statement about the network, at the top
    await expect(page.getByTestId("test-network")).toHaveText(
      "Test networkSet your wallet to “Preprod”. No real money is involved."
    );
    await page.screenshot({ path: "test/output/wallet-door.png" });
    await phoneShot(page, "account-wallet-door");
    await chooseEternl(page);
    await expect(
      page.getByText("Your wallet is now linked to this player.")
    ).toBeVisible({ timeout: 15000 });
    expect(signed).toHaveLength(1);
    expect(signed[0]).toContain("Connect this wallet to battlechoc.");
    expect((await accountOf(page)).playerId).toBe(before);
    const identities = await identitiesOf(page, request);
    expect(identities.map((identity) => identity.subject)).toEqual([
      wallet.subject,
    ]);
    // Account safety lists the wallet: the only key, so it cannot go
    await page.keyboard.press("Escape");
    await expect(profileRow(page)).toHaveAttribute("data-state", "saved");
    await manage(page);
    await expect(page.getByTestId("safety-words")).toHaveCount(0);
    await expect(page.getByTestId("safety-wallet")).toContainText("Connected");
    await expect(
      page
        .getByTestId("safety-wallet")
        .getByRole("button", { name: "Disconnect" })
    ).toHaveCount(0);
    const details = await technicalDetails(page);
    await expect(details).toContainText("Address of your wallet");
    await expect(details).toContainText(wallet.rewardAddress.slice(0, 14));
    await expect(details.getByRole("button", { name: /Remove/ })).toHaveCount(
      0
    );
    await context.close();
  });

  test("Account safety connects a wallet after a proof and disconnects it again", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiConrad");
    const { context, page } = saved;
    const wallet = nodeKeys();
    await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    await openProfile(page);
    await manage(page);
    await page
      .getByTestId("safety-wallet")
      .getByRole("button", { name: "Connect" })
      .click();
    // a player with keys proves it first: the words
    await page.getByTestId("confirm-words").fill(saved.words.join(" "));
    await page.getByRole("button", { name: "Continue" }).click();
    await chooseEternl(page);
    await expect(page.getByTestId("safety-wallet")).toContainText("Connected", {
      timeout: 15000,
    });
    expect(
      (await identitiesOf(page, request)).map((identity) => identity.subject)
    ).toEqual(expect.arrayContaining([wallet.subject]));
    await page
      .getByTestId("safety-wallet")
      .getByRole("button", { name: "Disconnect" })
      .click();
    await page.getByTestId("confirm-words").fill(saved.words.join(" "));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("safety-wallet")).toContainText(
      "Not connected"
    );
    expect(
      (await identitiesOf(page, request)).map((identity) => identity.subject)
    ).toEqual([nodeKeys(saved.words).subject]);
    await context.close();
  });

  test("a known wallet on a new device switches to its player", async ({
    browser,
    request,
  }) => {
    const owner = await createPlayer(browser, request, "SiWerna");
    const wallet = nodeKeys();
    await linkWallet(owner.page, request, wallet);
    const ownerId = (await accountOf(owner.page)).playerId;
    const { context, page } = await freshDevice(browser);
    await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await chooseEternl(page);
    await switchedTo(page, ownerId);
    await titleScreenAfterReload(page);
    await context.close();
    await owner.context.close();
  });

  test("a known wallet on a device with progress asks; keeping this device drops the wallet's session", async ({
    browser,
    request,
  }) => {
    const owner = await createPlayer(browser, request, "SiWilma");
    const wallet = nodeKeys();
    await linkWallet(owner.page, request, wallet);
    const other = await createPlayer(browser, request, "SiWinni");
    const { context, page } = other;
    await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    const before = (await accountOf(page)).playerId;
    await openDoor(page);
    const verified = page.waitForResponse((response) =>
      response.url().endsWith("/auth/cardano/verify")
    );
    await chooseEternl(page);
    const { refreshToken } = await (await verified).json();
    expect(refreshToken).toEqual(expect.any(String));
    await expect(
      page.getByText("This device has progress of its own", { exact: false })
    ).toBeVisible();
    await page.getByRole("button", { name: "This device's progress" }).click();
    await expect
      .poll(async () =>
        (
          await request.post(`${api}/accounts/token`, {
            data: { refreshToken },
          })
        ).status()
      )
      .toBe(401);
    expect((await accountOf(page)).playerId).toBe(before);
    await context.close();
    await owner.context.close();
  });

  test("a mainnet wallet says so and changes nothing", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiMaini");
    const { signed } = await fakeWallet(
      context,
      nodeKeys(undefined, { networkId: 1 }),
      {
        networkId: 1,
      }
    );
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await chooseEternl(page);
    await expect(
      page.getByText(
        "Your wallet is on another Cardano network. Switch it to preprod",
        {
          exact: false,
        }
      )
    ).toBeVisible();
    expect(signed).toEqual([]);
    expect(await identitiesOf(page, request)).toEqual([]);
    await context.close();
  });

  test("saying no in the wallet changes nothing and shows no error", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiNelly");
    await fakeWallet(context, nodeKeys(), { decline: true });
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await chooseEternl(page);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("wallet-door")).toBeVisible();
    await expect(
      page.getByTestId("wallet-door").getByRole("alert")
    ).toHaveCount(0);
    expect(await identitiesOf(page, request)).toEqual([]);
    await context.close();
  });

  test("a linked wallet confirms the removal of a key", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiConni");
    const { context, page } = saved;
    const wallet = nodeKeys();
    // the wallet joins with a proof by the words
    const token = await accessTokenOf(page, request);
    const { confirmToken } = await (
      await signAs(request, token, nodeKeys(saved.words), "confirm")
    ).json();
    const linked = await signAs(request, token, wallet, "link", {
      "X-Battlechoc-Confirm": confirmToken,
    });
    expect(linked.status()).toBe(200);
    await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    await openProfile(page);
    await manage(page);
    const details = await technicalDetails(page);
    const words = nodeKeys(saved.words);
    await details
      .getByRole("button", {
        name: `Remove ${words.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByRole("button", { name: "Use my wallet" }).click();
    await chooseEternl(page);
    await expect
      .poll(async () =>
        (await identitiesOf(page, request)).map((identity) => identity.subject)
      )
      .toEqual([wallet.subject]);
    await context.close();
  });

  test("words that save nobody point to the wallet door", async ({
    browser,
  }) => {
    // a device without progress of its own goes straight to the sign-in
    const { context, page } = await freshDevice(browser);
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await enterWords(page, nodeKeys().words.join(" "));
    await expect(
      page.getByText("If they are your own wallet's words", { exact: false })
    ).toBeVisible();
    await context.close();
  });

  test("after review: a wallet that never answers does not lock the door", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiHanga");
    await fakeWallet(context, nodeKeys(), { hang: true });
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await chooseEternl(page);
    await page.waitForTimeout(500);
    // the door's own back button, while the wallet still has not answered
    await page.locator("[data-icon=back]:visible").last().click();
    await expect(page.getByTestId("wallet-door")).toHaveCount(0);
    // "I already have an account" is still there
    await expect(page.getByTestId("connect-words")).toBeVisible();
    expect(await identitiesOf(page, request)).toEqual([]);
    await context.close();
  });

  test("after review: closing the dialog while it asks which progress to keep drops the wallet's session", async ({
    browser,
    request,
  }) => {
    const owner = await createPlayer(browser, request, "SiKlaus");
    const wallet = nodeKeys();
    await linkWallet(owner.page, request, wallet);
    const other = await createPlayer(browser, request, "SiKlara");
    const { context, page } = other;
    await fakeWallet(context, wallet);
    await page.reload({ waitUntil: "networkidle" });
    const before = (await accountOf(page)).playerId;
    await openDoor(page);
    const verified = page.waitForResponse((response) =>
      response.url().endsWith("/auth/cardano/verify")
    );
    await chooseEternl(page);
    const { refreshToken } = await (await verified).json();
    await expect(
      page.getByText("This device has progress of its own", { exact: false })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () =>
        (
          await request.post(`${api}/accounts/token`, {
            data: { refreshToken },
          })
        ).status()
      )
      .toBe(401);
    expect((await accountOf(page)).playerId).toBe(before);
    await context.close();
    await owner.context.close();
  });

  test("after review: wallets beyond the component's defaults are listed (Vespr)", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiVespa");
    await fakeWallet(context, nodeKeys(), { key: "vespr" });
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await expect(
      page.getByTestId("wallet-door").getByText("Vespr", { exact: false })
    ).toBeVisible();
    await context.close();
  });

  test('final review: the door reaches the PeerJS server only after "Phone wallet (QR code)"', async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiPeeri");
    const { peerjs } = await fakeWallet(context, nodeKeys());
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await expect(
      page.getByTestId("wallet-door").getByText("Eternl", { exact: false })
    ).toBeVisible();
    await page.waitForTimeout(1500);
    expect(peerjs.tries).toBe(0);
    await page
      .getByTestId("wallet-door")
      .getByRole("button", { name: "Phone wallet (QR code)" })
      .click();
    await expect
      .poll(() => peerjs.tries, { timeout: 10000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await page.screenshot({ path: "test/output/wallet-door-qr.png" });
    await context.close();
  });

  test("in the Android app there is no wallet door", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiAppy");
    await fakeWallet(context, nodeKeys());
    await page.goto("/index.html?app_runs_as=twa&app_version=1", {
      waitUntil: "networkidle",
    });
    await openProfile(page);
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await expect(page.getByTestId("connect-words")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Use a Cardano wallet" })
    ).toHaveCount(0);
    await context.close();
  });

  test("the door on a phone", async ({ browser, request }) => {
    const { context, page } = await createPlayer(browser, request, "SiPhoni");
    await fakeWallet(context, nodeKeys());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    await openDoor(page);
    await expect(page.getByTestId("wallet-door")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: "test/output/wallet-door-phone.png" });
    await context.close();
  });
});

test.describe("the phone's wallet browser: the link page (plan 3)", () => {
  const PHONE =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

  // the game on a phone without a wallet of its own: the account made, the title screen up
  const phoneGame = async (browser) => {
    const context = await browser.newContext({
      userAgent: PHONE,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript((url) => {
      window.localStorage.setItem("battlechoc.apiUrl", url);
    }, api);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(() => accountOf(page), { timeout: 15000 }).toBeTruthy();
    return { context, page };
  };

  // the phone's wallet with its own browser: opens the link page of the deep link
  const walletBrowser = async (browser, keys) => {
    const context = await browser.newContext({ userAgent: PHONE });
    await context.addInitScript((url) => {
      window.localStorage.setItem("battlechoc.apiUrl", url);
    }, api);
    await fakeWallet(context, keys);
    return { context, page: await context.newPage() };
  };

  // taps Eternl in the door; resolves with the page address the CIP-158 deep link opens (a test
  // build records the link: a headless browser would show an error page for it)
  const tapEternl = async (page) => {
    await page.evaluate(() => {
      window.__battlechocRecordDeepLinks = true;
    });
    await openDoor(page);
    await page
      .getByTestId("wallet-door")
      .getByText("Eternl", { exact: false })
      .first()
      .click();
    let deepLink;
    await expect
      .poll(async () => {
        deepLink = await page.evaluate(
          () => (window.__battlechocDeepLinks || [])[0]
        );
        return deepLink;
      })
      .toBeTruthy();
    expect(deepLink).toMatch(/^web\+cardano:\/\/browse\/v1\?uri=/);
    return decodeURIComponent(deepLink.split("uri=")[1]);
  };

  const openDoor = async (page) => {
    await page.locator("[data-icon=user]:visible").first().click();
    await page
      .getByRole("button", { name: "I already have an account" })
      .click();
    await page.getByRole("button", { name: "Use a Cardano wallet" }).click();
  };

  test("on a phone the door lists only the wallets whose app opens the link page", async ({
    browser,
  }) => {
    const { context, page } = await phoneGame(browser);
    await openDoor(page);
    const list = page.getByTestId("connect-wallet-list");
    await expect(list.getByRole("button")).toHaveText(["Eternl", "Vespr"]);
    await expect(list.getByText("Desktop Only")).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test/output/wallet-door-phone-list.png" });
    await context.close();
  });

  test("an unknown wallet signs on the link page; the game on the phone gets it linked", async ({
    browser,
    request,
  }) => {
    const { context, page } = await phoneGame(browser);
    const pageUrl = await tapEternl(page);
    expect(new URL(pageUrl).pathname).toBe("/link/");
    expect(new URL(pageUrl).searchParams.get("code")).toMatch(
      /^[A-Za-z0-9_-]{22}$/
    );
    // the game's own address is the game again
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(
      page.getByText("Waiting for your wallet", { exact: false })
    ).toBeVisible();
    await page.screenshot({ path: "test/output/wallet-door-deeplink.png" });

    const keys = nodeKeys();
    const wallet = await walletBrowser(browser, keys);
    await wallet.page.goto(new URL(pageUrl).pathname + new URL(pageUrl).search);
    await expect(
      wallet.page.getByText("Only go on if that device is yours", {
        exact: false,
      })
    ).toBeVisible();
    await wallet.page.screenshot({ path: "test/output/link-page.png" });
    await wallet.page
      .getByRole("button", { name: "Continue with Eternl" })
      .click();
    await expect(
      wallet.page.getByText("Done. Go back to battlechoc.")
    ).toBeVisible();
    // the player goes back to the game, which asks for the code's outcome at once
    await page.bringToFront();
    await expect(
      page.getByText("Your wallet is now linked to this player.")
    ).toBeVisible({ timeout: 15000 });
    expect(
      (await identitiesOf(page, request)).map((identity) => identity.subject)
    ).toEqual([keys.subject]);
    await wallet.context.close();
    await context.close();
  });

  test("a known wallet on the link page signs a new phone in as its player", async ({
    browser,
    request,
  }) => {
    const owner = await createPlayer(browser, request, "SiLinka");
    const keys = nodeKeys();
    expect(
      (
        await signAs(
          request,
          await accessTokenOf(owner.page, request),
          keys,
          "link"
        )
      ).status()
    ).toBe(200);
    const ownerId = (await accountOf(owner.page)).playerId;
    const { context, page } = await phoneGame(browser);
    const pageUrl = await tapEternl(page);
    const wallet = await walletBrowser(browser, keys);
    await wallet.page.goto(new URL(pageUrl).pathname + new URL(pageUrl).search);
    await wallet.page
      .getByRole("button", { name: "Continue with Eternl" })
      .click();
    await expect(
      wallet.page.getByText("Done. Go back to battlechoc.")
    ).toBeVisible();
    await page.bringToFront();
    await switchedTo(page, ownerId);
    await wallet.context.close();
    await context.close();
    await owner.context.close();
  });

  test("an old link says so", async ({ browser }) => {
    const wallet = await walletBrowser(browser, nodeKeys());
    await wallet.page.goto("/link/?code=AAAAAAAAAAAAAAAAAAAAAA");
    await wallet.page
      .getByRole("button", { name: "Continue with Eternl" })
      .click();
    await expect(
      wallet.page.getByText("This link is too old. Start again in battlechoc.")
    ).toBeVisible();
    await wallet.context.close();
  });

  test("the link page without a wallet goes to the game", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/link/?code=AAAAAAAAAAAAAAAAAAAAAA");
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10000 })
      .toBe("/");
    await context.close();
  });
});
