import { test, expect } from "@playwright/test";
import { writeSetting } from "./helpers/profile.js";

// The first start of the game: the title screen (logo, decoration, buttons) does not wait for the
// 3D models; the start button fills up while they load and starts the game once they are in. The
// music, the offline cache (service worker) and the pictures of the match wait for the models, so
// they do not take the connection away from them; the start does not wait for the pictures.
// the e2e config blocks service workers, so the test counts the game's attempts to register one
const countRegistrations = () => {
  window.__serviceWorkerRegistrations = 0;
  if (navigator.serviceWorker) {
    const register = navigator.serviceWorker.register.bind(
      navigator.serviceWorker
    );
    navigator.serviceWorker.register = (...args) => {
      window.__serviceWorkerRegistrations += 1;
      return register(...args);
    };
  }
};
const registered = (page) =>
  page.evaluate(() => window.__serviceWorkerRegistrations > 0);

test("the title screen works before the 3D models are in; the start button fills up", async ({
  page,
}) => {
  const held = [];
  let released = false;
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const requested = (file) => requests.some((url) => url.endsWith(file));
  // a picture that never arrives
  await page.route("**/images/win.svg", (route) => route.abort());
  await page.addInitScript(countRegistrations);
  // the models wait until the test lets them through
  await page.route("**/models/*.glb", (route) =>
    released ? route.continue() : held.push(route)
  );
  await page.goto("/");
  const start = page.getByTestId("start-button");
  const progress = async () =>
    Number(await start.getAttribute("data-progress"));
  await expect(start).toContainText("Loading 3D models", { timeout: 15000 });
  await expect(start).toHaveAttribute("aria-disabled", "true");
  // all 14 files are asked for at once
  await expect.poll(() => held.length, { timeout: 15000 }).toBe(14);
  const before = await progress();
  expect(before).toBeGreaterThanOrEqual(0);
  expect(before).toBeLessThan(50);
  // half of the models arrive: the button fills up further and still waits
  for (const route of held.splice(0, 7)) {
    await route.continue();
  }
  await expect.poll(progress, { timeout: 30000 }).toBeGreaterThan(before + 20);
  expect(await progress()).toBeLessThan(100);
  await expect(start).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByText("Skip Tutorial", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByTestId("title-logo")).toBeVisible();
  await page.screenshot({
    path: "test/output/screenshot_first_load_loading.png",
  });
  // the music, the offline cache and the pictures only a match shows wait for the models
  expect(requests.some((url) => url.includes("/music/"))).toBe(false);
  expect(await registered(page)).toBe(false);
  expect(requested("/images/cacao-tree-icon.svg")).toBe(false);

  released = true;
  for (const route of held.splice(0)) {
    await route.continue();
  }
  await expect(start).toHaveText("Start Tutorial", { timeout: 30000 });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await page.screenshot({
    path: "test/output/screenshot_first_load_ready.png",
  });
  await expect
    .poll(() => requests.some((url) => url.includes("/music/CacaoLiving.mp3")))
    .toBe(true);
  await expect.poll(() => registered(page), { timeout: 15000 }).toBe(true);
  // the pictures follow by themselves (the one that failed did not hold the start back); the
  // turn-based game's pictures are no longer fetched
  await expect.poll(() => requested("/images/cacao-tree-icon.svg")).toBe(true);
  await expect.poll(() => requested("/images/win.svg")).toBe(true);
  await expect.poll(() => requested("/images/tap-finger.svg")).toBe(true);
  expect(requests.filter((url) => url.includes("-per-turn.svg"))).toEqual([]);
});

// With the sound off the music (2.5 MB, some 30 MB once decoded) and the match sounds are not
// fetched; switching the sound on fetches them.
test("muted, the music is not loaded until the sound is switched on", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const music = () =>
    requests.some((url) => url.includes("/music/CacaoLiving.mp3"));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await writeSetting(page, "audio", {
    musicMuted: true,
    sfxMuted: true,
    musicVolume: 1,
    soundVolume: 1,
    clicks: true,
  });
  requests.length = 0;
  await page.goto("/");
  const start = page.getByTestId("start-button");
  await expect(start).toHaveText("Start Tutorial", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  expect(music()).toBe(false);
  expect(requests.some((url) => url.includes("/sound/attack_"))).toBe(false);

  await page.locator("[data-icon=settings]:visible").first().click();
  await page.getByRole("button", { name: "Sound: off", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sound: on", exact: true })
  ).toBeVisible();
  await expect.poll(music).toBe(true);
});

// The settings, the other dialogs, the lab, the tutorial and the end of a match are not part of
// the first script (src/ui/onDemand.js); their chunks follow by themselves once the title screen
// stands, so a device that loses its connection then (the tests run without a service worker)
// can still open them.
test("what the player opens next arrives with the title screen: offline right after, the settings and the tutorial still open", async ({
  page,
  context,
}) => {
  const arrived = [];
  page.on("requestfinished", (request) => arrived.push(request.url()));
  await page.goto("/");
  const start = page.getByTestId("start-button");
  await expect(start).toHaveText("Start Tutorial", { timeout: 30000 });
  // nobody has tapped anything yet
  for (const chunk of [
    "onDemandDialogs",
    "Choclab",
    "Tutorial",
    "GameEndOverview",
  ]) {
    const file = new RegExp(`/assets/${chunk}-[^/]+\\.js$`);
    await expect.poll(() => arrived.some((url) => file.test(url))).toBe(true);
  }
  await page.waitForLoadState("networkidle");

  await context.setOffline(true);
  await page.locator("[data-icon=settings]:visible").first().click();
  const clickSound = page.getByRole("button", { name: "Click sound: on" });
  await expect(clickSound).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(clickSound).toBeHidden();
  await start.click();
  await expect(page.getByTestId("tutorial-coach")).toContainText(
    "Welcome to battlechoc"
  );
  await context.setOffline(false);
});

// index.html carries a splash: the logo on the page's background until the script has rendered
// the title screen. It repeats the title screen's box by hand (LOGO in src/ui/Hud.jsx), so the
// test holds the game's script back and compares the two, lying down and upright.
const logoBox = (locator) =>
  locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x,
      y,
      width,
      height,
      image: style.backgroundImage,
      repeat: style.backgroundRepeat,
      size: style.backgroundSize,
      position: style.backgroundPosition,
    };
  });

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 412, height: 915 },
]) {
  test(`before its script has run the page shows the logo where the title screen draws it (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route("**/assets/index-*.js", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/", { waitUntil: "commit" });
    const splash = page.locator("#root > .splash > div");
    await expect(splash).toBeVisible();
    // the page asks for the picture itself, no script needed
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((entry) => entry.name.endsWith("/images/logo.svg"))
        )
      )
      .toBe(true);
    const before = await logoBox(splash);
    expect(before.width).toBeGreaterThan(100);
    expect(before.image).toContain("/images/logo.svg");
    await page.screenshot({
      path: `test/output/screenshot_splash_${viewport.width}x${viewport.height}.png`,
    });

    release();
    const logo = page.getByTestId("title-logo").locator(":scope > div").first();
    await expect(logo).toBeVisible({ timeout: 15000 });
    expect(await logoBox(logo)).toEqual(before);
    await expect(page.locator(".splash")).toHaveCount(0);
  });
}

test("a 3D model that does not load is tried again, and the start button offers another try", async ({
  page,
}) => {
  let failing = true;
  await page.route("**/models/donut.glb", (route) =>
    failing ? route.abort() : route.continue()
  );
  await page.goto("/");
  const start = page.getByTestId("start-button");
  await expect(start).toContainText("Loading failed", { timeout: 30000 });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  failing = false;
  await start.click();
  await expect(start).toHaveText("Start Tutorial", { timeout: 30000 });
});
