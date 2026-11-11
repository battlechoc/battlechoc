import { test, expect } from "@playwright/test";
import { api, createPlayer } from "./helpers/players.js";
import { accountOf, readEntry, writeEntry } from "./helpers/profile.js";
import { linkSecondKey, nodeKeys, signAs } from "./helpers/cardano.js";
import { fakeWallet } from "./helpers/wallet.js";
import { suggestWords } from "../src/cardano/wordSuggestions.js";
import fs from "node:fs";

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
    const { context, page } = await createPlayer(browser, request, "SiSara");
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

    // the words dialog's own back button (top right) closes it, the profile stays
    await page.locator("[data-icon=back]:visible").click();
    await expect(page.getByTestId("recovery-word")).toHaveCount(0);
    await expect(row).toContainText("Not backed up yet");
    await row.getByRole("button", { name: "Back up now" }).click();
    expect(await shownWords(page)).toEqual(words);

    await passCheck(page, words);
    await expect(row).toContainText("Saved");
    await expect(row).not.toContainText("Not backed up yet");
    await page.screenshot({ path: "test/output/signin-saved.png" });
    // still saved and backed up after a reload (the profile loads its state when it opens)
    await page.reload({ waitUntil: "networkidle" });
    await openProfile(page);
    await expect(page.getByTestId("save-progress")).toContainText("Saved");
    await expect(page.getByTestId("save-progress")).not.toContainText(
      "Not backed up yet"
    );

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
    const { context, page } = await createPlayer(browser, request, "SiWanda");
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
    const { context, page } = await createPlayer(browser, request, "SiDora");
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
    const { context, page } = await createPlayer(browser, request, "SiPia");
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
    const { context, page } = await createPlayer(browser, request, "SiAndi");
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
    const row = page.getByTestId("save-progress");
    await row.getByRole("button", { name: "Save your progress" }).click();
    await expect(page.getByTestId("recovery-word")).toHaveCount(24);
    await page.keyboard.press("Escape");
    await row.getByRole("button", { name: "Advanced" }).click();
    await expect(
      row.getByRole("button", { name: "Show recovery words" })
    ).toBeVisible();
    await expect(row).not.toContainText("Cardano");
    await expect(row).not.toContainText("stake");
    await context.close();
  });

  test("the check of the words offers the word from its first letters and goes on to the next field", async ({
    browser,
    request,
  }) => {
    const { context, page } = await createPlayer(browser, request, "SiWenke");
    await openProfile(page);
    await page
      .getByTestId("save-progress")
      .getByRole("button", { name: "Save your progress" })
      .click();
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

// a player who saved their progress (and backed the words up): { context, page, username, words, playerId }
const savedPlayer = async (browser, request, name) => {
  const player = await createPlayer(browser, request, name);
  await openProfile(player.page);
  await player.page
    .getByTestId("save-progress")
    .getByRole("button", { name: "Save your progress" })
    .click();
  const words = await shownWords(player.page);
  await passCheck(player.page, words);
  await expect(player.page.getByTestId("save-progress")).toContainText("Saved");
  const { playerId } = await accountOf(player.page);
  return { ...player, words, playerId };
};

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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
  test("a device whose own words are not backed up has to back them up before it switches", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiUrsula");
    // a device with matches that saved its progress but never backed its words up
    const device = await createPlayer(browser, request, "SiTina");
    const { page } = device;
    await openProfile(page);
    const row = page.getByTestId("save-progress");
    await row.getByRole("button", { name: "Save your progress" }).click();
    const deviceWords = await shownWords(page);
    await page.keyboard.press("Escape");
    await expect(row).toContainText("Not backed up yet");

    await row
      .getByRole("button", { name: "Connect an existing account" })
      .click();
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
      .getByRole("button", { name: "Connect an existing account" })
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

// a saved player on localhost: the words shown once, closed without the check
const savedOnLocalhost = async (
  browser,
  request,
  name,
  { prf = true } = {}
) => {
  const player = await createPlayer(browser, request, name, {
    origin: LOCALHOST,
  });
  const used = await addAuthenticator(player.page, { prf });
  await openProfile(player.page);
  const row = player.page.getByTestId("save-progress");
  await row.getByRole("button", { name: "Save your progress" }).click();
  const words = await shownWords(player.page);
  await player.page.locator("[data-icon=back]:visible").click();
  await expect(row).toContainText("Not backed up yet");
  await row.getByRole("button", { name: "Advanced" }).click();
  return { ...player, row, words, used };
};

test.describe("backups with a passkey or a file (plan 2)", () => {
  test("a passkey backs the words up; showing the words then asks for the passkey", async ({
    browser,
    request,
  }) => {
    const { context, page, row, words, used } = await savedOnLocalhost(
      browser,
      request,
      "SiXaver"
    );
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(row).toContainText("Backed up with: passkey");
    await expect(row).not.toContainText("Not backed up yet");
    expect(await passkeysOf(page, request)).toHaveLength(1);
    await page.screenshot({ path: "test/output/signin-backups.png" });

    const before = used.count;
    await row.getByRole("button", { name: "Show recovery words" }).click();
    expect(await shownWords(page)).toEqual(words);
    expect(used.count).toBeGreaterThan(before);
    await context.close();
  });

  test("a passkey without PRF cannot protect the words: it says so and keeps nothing", async ({
    browser,
    request,
  }) => {
    const { context, page, row } = await savedOnLocalhost(
      browser,
      request,
      "SiYara",
      { prf: false }
    );
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(
      page.getByText("can't protect the words", { exact: false })
    ).toBeVisible();
    expect(await passkeysOf(page, request)).toEqual([]);
    await expect(row).toContainText("Not backed up yet");
    await context.close();
  });

  test("a backup file is saved with a password and holds no word in the clear", async ({
    browser,
    request,
  }) => {
    const { context, page, row, words } = await savedOnLocalhost(
      browser,
      request,
      "SiZoe"
    );
    await row.getByRole("button", { name: "Save a backup file" }).click();
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
    await expect(row).toContainText("Backed up with: file");
    await context.close();
  });

  test("removing a key needs a proof: the passkey", async ({
    browser,
    request,
  }) => {
    const { context, page, row, words, used } = await savedOnLocalhost(
      browser,
      request,
      "SiAbel"
    );
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(row).toContainText("Backed up with: passkey");
    const { second, status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      words
    );
    expect(status).toBe(200);
    // the profile reads its keys when it opens
    await page.keyboard.press("Escape");
    await openProfile(page);
    await row.getByRole("button", { name: "Advanced" }).click();
    const before = used.count;
    await row
      .getByRole("button", {
        name: `Remove ${second.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(`${api}/user/identities`, {
                headers: {
                  Authorization: `Bearer ${await accessTokenOf(page, request)}`,
                },
              })
            ).json()
          ).length
      )
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
    const { context, page, row, used } = await savedOnLocalhost(
      browser,
      request,
      "SiDaria"
    );
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(row).toContainText("Backed up with: passkey");
    const before = used.count;
    await row.getByRole("button", { name: "Save a backup file" }).click();
    await page.getByLabel("Password", { exact: true }).fill("choco-late-42");
    await page.getByLabel("Password again").fill("choco-late-42");
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save the file" }).click(),
    ]);
    expect(used.count).toBeGreaterThan(before);
    await context.close();
  });

  test("removing this device's own key takes its passkey backup and its words along", async ({
    browser,
    request,
  }) => {
    const { context, page, row, words } = await savedOnLocalhost(
      browser,
      request,
      "SiEmil"
    );
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(row).toContainText("Backed up with: passkey");
    const own = nodeKeys(words);
    const { status } = await linkSecondKey(
      request,
      await accessTokenOf(page, request),
      words
    );
    expect(status).toBe(200);
    await page.keyboard.press("Escape");
    await openProfile(page);
    await row.getByRole("button", { name: "Advanced" }).click();
    await row
      .getByRole("button", {
        name: `Remove ${own.rewardAddress.slice(0, 14)}`,
        exact: false,
      })
      .click();
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await expect.poll(() => passkeysOf(page, request)).toEqual([]);
    await expect(
      row.getByRole("button", { name: "Show recovery words" })
    ).toHaveCount(0);
    expect(await readEntry(page, "player", "cardanoKey")).toBeUndefined();
    await context.close();
  });

  test("words that are not the player's do not confirm a change", async ({
    browser,
    request,
  }) => {
    const { context, page, row, words } = await savedOnLocalhost(
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
    await page.keyboard.press("Escape");
    await openProfile(page);
    await row.getByRole("button", { name: "Advanced" }).click();
    await row
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
    const { page, row } = saved;
    await row.getByRole("button", { name: "Save with a passkey" }).click();
    await expect(row).toContainText("Backed up with: passkey");
    const { playerId } = await accountOf(page);
    await becomeNewDevice(page, playerId);

    await openProfile(page);
    await page
      .getByRole("button", { name: "Connect an existing account" })
      .click();
    await page.screenshot({ path: "test/output/signin-connect-backups.png" });
    await page.getByRole("button", { name: "Use my passkey" }).click();
    await switchedTo(page, playerId);
    // the words came from the passkey: that is the backup, not paper
    await openProfile(page);
    const after = page.getByTestId("save-progress");
    await after.getByRole("button", { name: "Advanced" }).click();
    await expect(after).toContainText("Backed up with: passkey");
    await expect(after).not.toContainText("on paper");
    await saved.context.close();
  });

  test("a backup file opens on a new device with its password; a wrong password says so", async ({
    browser,
    request,
  }) => {
    const saved = await savedOnLocalhost(browser, request, "SiCarla");
    const { page, row } = saved;
    await row.getByRole("button", { name: "Save a backup file" }).click();
    await page.getByLabel("Password", { exact: true }).fill("choco-late-42");
    await page.getByLabel("Password again").fill("choco-late-42");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save the file" }).click(),
    ]);
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
      .getByRole("button", { name: "Connect an existing account" })
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
    await openProfile(device.page);
    const after = device.page.getByTestId("save-progress");
    await after.getByRole("button", { name: "Advanced" }).click();
    await expect(after).toContainText("Backed up with: file");
    await expect(after).not.toContainText("on paper");
    await device.context.close();
    await saved.context.close();
  });

  test("a file that is no backup says so at once, asks for no password and sends nothing", async ({
    browser,
  }) => {
    const { context, page } = await freshDevice(browser);
    await openProfile(page);
    await page
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
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
    await page.screenshot({ path: "test/output/wallet-door.png" });
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
    // the profile lists the wallet among the keys
    await page.keyboard.press("Escape");
    const row = page.getByTestId("save-progress");
    await expect(row).toContainText("Saved");
    await row.getByRole("button", { name: "Advanced" }).click();
    await expect(row).toContainText(wallet.rewardAddress.slice(0, 14));
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
    const row = page.getByTestId("save-progress");
    await row.getByRole("button", { name: "Advanced" }).click();
    const words = nodeKeys(saved.words);
    await row
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
      .getByRole("button", { name: "Connect an existing account" })
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
    // "Connect an existing account" is still there
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
      .getByRole("button", { name: "Connect an existing account" })
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
      .getByRole("button", { name: "Connect an existing account" })
      .click();
    await page.getByRole("button", { name: "Use a Cardano wallet" }).click();
  };

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
