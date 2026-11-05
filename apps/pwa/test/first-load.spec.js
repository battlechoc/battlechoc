import { test, expect } from "@playwright/test";

// The first start of the game: the title screen (logo, decoration, buttons) does not wait for the
// 3D models; the start button fills up while they load and starts the game once they are in. The
// music and the offline cache (service worker) wait for the models too, so they do not take the
// connection away from them.
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
  await page.addInitScript(countRegistrations);
  // the models wait until the test lets them through
  await page.route("**/models/*.glb", (route) =>
    released ? route.continue() : held.push(route)
  );
  await page.goto("/");
  const start = page.getByTestId("start-button");
  await expect(start).toContainText("Loading 3D models", { timeout: 15000 });
  await expect(start).toHaveAttribute("aria-disabled", "true");
  const progress = Number(await start.getAttribute("data-progress"));
  expect(progress).toBeGreaterThanOrEqual(0);
  expect(progress).toBeLessThan(100);
  await expect(
    page.getByText("Skip Tutorial", { exact: true }).first()
  ).toBeVisible();
  await expect(page.locator("[class^=logo]").first()).toBeVisible();
  await page.screenshot({
    path: "test/output/screenshot_first_load_loading.png",
  });
  // the music and the offline cache wait for the models
  expect(requests.some((url) => url.includes("/music/"))).toBe(false);
  expect(await registered(page)).toBe(false);

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
});

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
