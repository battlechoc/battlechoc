import { test, expect } from "@playwright/test";

// the AGPL asks for the source code to be offered to everyone who plays: the Info dialog links it
test("the Info dialog links the source code and the privacy policy", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=info]:visible").click();
  await expect(page.getByText("About battlechoc", { exact: true })).toBeVisible();
  // a local build has no commit and counts as built just now
  await expect(page.getByTestId("info-build")).toHaveText(/^Version \d+\.\d+\.\d+\s*Updated now$/);
  // the version is a button to its release notes
  const release = page.getByTestId("info-release");
  await expect(release).toHaveAttribute("href", /^https:\/\/github\.com\/battlechoc\/battlechoc\/releases\/tag\/v\d+\.\d+\.\d+$/);
  await expect(release).toHaveAttribute("target", "_blank");
  const source = page.getByRole("link", { name: "Free software (AGPL-3.0): source code on GitHub" });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("href", "https://github.com/battlechoc/battlechoc");
  await expect(source).toHaveAttribute("target", "_blank");
  const policy = page.getByRole("link", { name: "Read the full privacy policy (German and English)" });
  await expect(policy).toHaveAttribute("href", "/privacy-policy/");
  await page.screenshot({ path: "test/output/visual_info.png" });
});

test("the Info dialog speaks the player's language", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          tx.objectStore("settings").put("de", "language");
          tx.oncomplete = () => resolve();
        };
      })
  );
  await page.goto("/", { waitUntil: "networkidle" });
  // the page tells the browser its language too
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.locator("[data-icon=info]:visible").click();
  await expect(page.getByText("Über battlechoc", { exact: true })).toBeVisible();
  await expect(page.getByTestId("info-build")).toContainText("Aktualisiert jetzt");
  await expect(page.getByRole("link", { name: "Zur vollständigen Datenschutzerklärung (Deutsch und Englisch)" })).toBeVisible();
});

// Japanese and Vietnamese came out English until 2026-11: the game's codes were jp and vn, the
// browser says ja and vi
test.describe("a Japanese browser", () => {
  test.use({ locale: "ja-JP" });

  test("gets the game in Japanese, and the page says so", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await page.locator("[data-icon=info]:visible").click();
    await expect(page.getByText("battlechoc について", { exact: true })).toBeVisible();
  });
});

test("a device that stored the old code vn keeps its Vietnamese", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          tx.objectStore("settings").put("vn", "language");
          tx.oncomplete = () => resolve();
        };
      })
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await page.locator("[data-icon=info]:visible").click();
  await expect(page.getByText("Giới thiệu battlechoc", { exact: true })).toBeVisible();
  // the device now holds the language code
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const open = indexedDB.open("battlechoc");
            open.onsuccess = () => {
              const get = open.result.transaction("settings").objectStore("settings").get("language");
              get.onsuccess = () => resolve(get.result);
            };
          })
      )
    )
    .toBe("vi");
});
