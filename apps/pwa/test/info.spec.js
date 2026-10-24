import { test, expect } from "@playwright/test";

// the AGPL asks for the source code to be offered to everyone who plays: the Info dialog links it
test("the Info dialog links the source code", async ({ page }) => {
  await page.goto("/privacy-policy", { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Free software (AGPL-3.0): source code on GitHub" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://github.com/battlechoc/battlechoc");
  await expect(link).toHaveAttribute("target", "_blank");
  await page.screenshot({ path: "test/output/visual_info.png" });
});
