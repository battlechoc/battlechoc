import { test, expect } from "@playwright/test";

// The tests block every host but localhost, so the API's /health never answers while the page's
// own host (127.0.0.1) does: to src/connectivity.js the server is down, unless a test answers
// /health. setOffline takes the internet away.
const seed = (page, stats) =>
  page.evaluate(
    (stats) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () => store.put(Object.assign({}, get.result || {}, stats), "stats");
          tx.oncomplete = () => resolve();
        };
      }),
    stats
  );

const setting = (page, key) =>
  page.evaluate(
    (key) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const get = open.result.transaction("settings").objectStore("settings").get(key);
          get.onsuccess = () => resolve(get.result);
        };
      }),
    key
  );

const answerHealth = (page) =>
  page.route("**/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));

// three finished matches unlock the Choclab and Friends (shared progression.js); offline the
// device counts them from its track record
const unlocked = {
  username: "Tester",
  score: 150,
  tutorialFinished: true,
  trackRecord: [0, 1, 2, 3].map((i) => ({ id: `seed-${i}`, won: true, winners: [{ idx: 0 }] })),
};
const serverDown = "The battlechoc server can't be reached right now. Please try again later.";
const offline = "Only available online. Check your internet connection.";
const cursor = (locator) => locator.evaluate((element) => getComputedStyle(element).cursor);

test("without the server highscore, Choclab and Friends are greyed out and say why", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, unlocked);
  await page.goto("/", { waitUntil: "networkidle" });

  const choclab = page.getByText("Choclab", { exact: true }).first();
  // the profile works offline (level, XP, matches from the device)
  await expect(page.locator("[data-icon=user]:visible")).not.toHaveAttribute("data-offline", "true");
  await expect(page.locator("[data-icon=trophy]:visible")).toHaveAttribute("data-offline", "true");
  for (const name of ["Choclab", "Friends"]) {
    await expect(page.locator("[role=button][data-offline=true]", { hasText: name })).toHaveCount(1);
  }
  await expect(page.locator("[data-icon=instagram], [data-icon=discord]")).toHaveCount(0);
  // sound and fullscreen moved into the settings
  await expect(page.locator("[data-icon=volume], [data-icon=mute], [data-icon=fullscreen]")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_offline_title.png" });

  // grey ones still explain themselves, but do not look clickable
  const greyChoclab = page.locator("[role=button][data-offline=true]", { hasText: "Choclab" });
  expect(await cursor(greyChoclab)).toBe("default");
  expect(await cursor(page.locator("[data-icon=trophy]:visible"))).toBe("default");
  await choclab.click();
  await expect(page.getByText(serverDown)).toBeVisible();
  await expect(page.getByTestId("lab")).toHaveCount(0);
  await page.locator("[data-icon=trophy]:visible").click();
  await expect(page.getByText("Highscore", { exact: true })).toBeHidden();
  // one toast: they replace each other
  await expect(page.getByText(serverDown)).toHaveCount(1);
  await page.screenshot({ path: "test/output/screenshot_offline_toast.png" });

  // the server answers again: the browser's online event checks at once
  await answerHealth(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("[data-icon=trophy]:visible")).not.toHaveAttribute("data-offline", "true");
  await expect(page.locator("[role=button][data-offline=true]")).toHaveCount(0);
  await expect(page.locator("[data-icon=instagram]:visible")).toHaveCount(1);
  await expect(page.locator("[data-icon=discord]:visible")).toHaveCount(1);
  await expect(page.getByText(serverDown)).toHaveCount(0);
  expect(await cursor(page.locator("[data-icon=trophy]:visible"))).toBe("pointer");
  await page.screenshot({ path: "test/output/screenshot_online_title.png" });

  // the internet goes away: offline at once, and the player's connection is to blame
  await page.context().setOffline(true);
  await expect(page.locator("[data-icon=trophy]:visible")).toHaveAttribute("data-offline", "true");
  await expect(page.locator("[data-icon=instagram], [data-icon=discord]")).toHaveCount(0);
  await choclab.click();
  await expect(page.getByText(offline)).toBeVisible();
  await expect(page.getByText(serverDown)).toHaveCount(0);
  await page.context().setOffline(false);
});

test("the settings hold the music and sound levels, the click sound and the fullscreen", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, unlocked);
  await page.goto("/", { waitUntil: "networkidle" });

  await page.locator("[data-icon=settings]:visible").first().click();
  await page.getByTestId("music-volume").fill("40");
  await page.getByTestId("sound-volume").fill("75");
  await page.getByText("Click sound: on", { exact: true }).click();
  await expect(page.getByText("Click sound: off", { exact: true })).toBeVisible();
  await page.getByText("Auto fullscreen: on", { exact: true }).click();
  await expect(page.getByText("Auto fullscreen: off", { exact: true })).toBeVisible();
  await expect(page.getByText("Fullscreen", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_settings_sound.png" });
  await expect
    .poll(() => setting(page, "audio"))
    .toMatchObject({ musicVolume: 0.4, soundVolume: 0.75, clicks: false, sfxMuted: false });
  expect(await setting(page, "autoFullscreen")).toBe(false);

  // kept on this device
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=settings]:visible").first().click();
  await expect(page.getByTestId("music-volume")).toHaveValue("40");
  await expect(page.getByTestId("sound-volume")).toHaveValue("75");
  await expect(page.getByText("Click sound: off", { exact: true })).toBeVisible();
  await expect(page.getByText("Auto fullscreen: off", { exact: true })).toBeVisible();
  await page.getByText("Sound: on", { exact: true }).click();
  await expect(page.getByText("Sound: off", { exact: true })).toBeVisible();
  await expect.poll(() => setting(page, "audio")).toMatchObject({ sfxMuted: true, musicVolume: 0.4 });
});

test("a phone in portrait: the settings fit", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, unlocked);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "test/output/screenshot_offline_title_portrait.png" });
  await page.locator("[data-icon=settings]:visible").first().click();
  await expect(page.getByTestId("music-volume")).toBeVisible();
  await page.screenshot({ path: "test/output/screenshot_settings_portrait.png" });
  await context.close();
});

test("offline the profile shows level, XP and what the next matches unlock; the rank waits for the server", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, {
    username: "Tester",
    score: 260,
    tutorialFinished: true,
    trackRecord: [
      { id: "first", won: true, winners: [{ idx: 0 }] },
      { id: "second", lost: true, winners: [{ idx: 1 }] },
      { id: "third", won: true, winners: [{ idx: 0 }] },
    ],
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=user]:visible").click();
  await expect(page.getByTestId("profile-level")).toHaveText("Level 2");
  await expect(page.getByTestId("profile-xp")).toHaveText("260 / 500 XP");
  await expect(page.getByTestId("profile-next-unlock")).toHaveText(
    "One more match against the AI unlocks the Choclab and online matches."
  );
  await expect(page.getByTestId("profile-offline")).toBeVisible();
  await expect(page.getByTestId("account-rank")).toHaveCount(0);
  await expect(page.locator("[data-icon=share]:visible")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_offline_profile.png" });
});

test("offline the name can change in the profile; it shows as not on the server yet", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  await page.goto("/", { waitUntil: "networkidle" });
  // the name is in the profile, not in the settings
  await page.locator("[data-icon=settings]:visible").first().click();
  await expect(page.locator("input:not([type=range]):visible")).toHaveCount(0);
  await page.locator("[data-icon=close]:visible").first().click();
  await page.locator("[data-icon=user]:visible").click();
  await page.getByTestId("change-name").click();
  await expect(page.getByTestId("name-offline-hint")).toBeVisible();
  await page.locator("input:visible").first().fill("Pralina");
  await page.locator("div[class^=actionButton]:visible").first().click();
  await expect(page.getByText("Pralina", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("name-unsynced").filter({ visible: true })).toHaveCount(1);
  await page.screenshot({ path: "test/output/screenshot_offline_name.png" });
  // kept on the device, still waiting for the server (closed dialogs stay in the page, hidden:
  // look at what is visible)
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=user]:visible").click();
  await expect(page.getByText("Pralina").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("name-unsynced").filter({ visible: true })).toHaveCount(1);
});
