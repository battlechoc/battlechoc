import { test, expect } from "@playwright/test";

// the AGPL asks for the source code to be offered to everyone who plays: the Info dialog links it
test("the Info dialog links the source code and the privacy policy", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("[data-icon=info]:visible").click();
  await expect(page.getByText("About battlechoc", { exact: true })).toBeVisible();
  // a local build has no commit and counts as built just now
  await expect(page.getByTestId("info-build")).toHaveText(/^Version \d+\.\d+\.\d+\s*Updated now$/);
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
  await page.locator("[data-icon=info]:visible").click();
  await expect(page.getByText("Über battlechoc", { exact: true })).toBeVisible();
  await expect(page.getByTestId("info-build")).toContainText("Aktualisiert jetzt");
  await expect(page.getByRole("link", { name: "Zur vollständigen Datenschutzerklärung (Deutsch und Englisch)" })).toBeVisible();
});
