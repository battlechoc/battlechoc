import { test, expect } from "@playwright/test";
import { api, createPlayer } from "./helpers/players.js";
import { accountOf, readEntry, writeEntry } from "./helpers/profile.js";
import { linkSecondKey, nodeKeys, signAs } from "./helpers/cardano.js";
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
});

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

test.describe("signing in again with the words", () => {
  test("a new device signs in from the tutorial's welcome card and plays on as that player", async ({
    browser,
    request,
  }) => {
    const saved = await savedPlayer(browser, request, "SiMona");
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
    await expect(
      page.getByText("Start Game", { exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
    await openProfile(page);
    await expect(
      page.getByText(saved.username).filter({ visible: true }).first()
    ).toBeVisible();
    // the words are on this device now, backed up (the player just typed them)
    await expect(page.getByTestId("save-progress")).toContainText("Saved");
    await context.close();
    await saved.context.close();
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
    await expect(
      page.getByText("We found no progress saved with these words", {
        exact: false,
      })
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
    await expect(
      page.getByText("Start Game", { exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
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
    await expect(
      page.getByText("Start Game", { exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
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
    await expect(
      device.page.getByText("Start Game", { exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
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
