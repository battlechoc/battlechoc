import { test, expect } from "@playwright/test";

// The tests block every host but localhost, so the API's /health never answers and the game is
// offline (src/connectivity.js) unless a test answers it.
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

const unlocked = { username: "Tester", score: 150, tutorialFinished: true };

test("without the server profile, highscore, Choclab and Friends are greyed out and the links are gone", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await seed(page, unlocked);
  await page.goto("/", { waitUntil: "networkidle" });

  const choclab = page.getByText("Choclab", { exact: true }).first();
  await expect(page.locator("[data-icon=user]:visible")).toHaveAttribute("data-offline", "true");
  await expect(page.locator("[data-icon=trophy]:visible")).toHaveAttribute("data-offline", "true");
  for (const name of ["Choclab", "Friends"]) {
    await expect(page.locator("[role=button][data-offline=true]", { hasText: name })).toHaveCount(1);
  }
  await expect(page.locator("[data-icon=instagram], [data-icon=discord]")).toHaveCount(0);
  // sound and fullscreen moved into the settings
  await expect(page.locator("[data-icon=volume], [data-icon=mute], [data-icon=fullscreen]")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_offline_title.png" });

  await choclab.click();
  await expect(page.getByText("Only available online. Check your internet connection.")).toBeVisible();
  await expect(page.getByTestId("lab")).toHaveCount(0);
  await page.locator("[data-icon=trophy]:visible").click();
  await expect(page.getByText("Highscore", { exact: true })).toBeHidden();
  // one toast: they replace each other
  await expect(page.getByText("Only available online. Check your internet connection.")).toHaveCount(1);
  await page.screenshot({ path: "test/output/screenshot_offline_toast.png" });

  // the server answers again: the browser's online event checks at once
  await answerHealth(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("[data-icon=user]:visible")).not.toHaveAttribute("data-offline", "true");
  await expect(page.locator("[data-icon=trophy]:visible")).not.toHaveAttribute("data-offline", "true");
  await expect(page.locator("[role=button][data-offline=true]")).toHaveCount(0);
  await expect(page.locator("[data-icon=instagram]:visible")).toHaveCount(1);
  await expect(page.locator("[data-icon=discord]:visible")).toHaveCount(1);
  await expect(page.getByText("Only available online. Check your internet connection.")).toHaveCount(0);
  await page.screenshot({ path: "test/output/screenshot_online_title.png" });

  // the network goes away: offline at once
  await page.context().setOffline(true);
  await expect(page.locator("[data-icon=user]:visible")).toHaveAttribute("data-offline", "true");
  await expect(page.locator("[data-icon=instagram], [data-icon=discord]")).toHaveCount(0);
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
