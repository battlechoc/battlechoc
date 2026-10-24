// Headless screenshots of the lookdev page, one per query string (the dev server must run):
//   node dev/lookdev/shoot.mjs /tmp/look "look=classic" "look=sky&models=donut.glb&cols=1"
// writes /tmp/look-0.png, /tmp/look-1.png. LOOKDEV_URL overrides http://127.0.0.1:3000.
import { chromium } from "@playwright/test";

const [prefix, ...queries] = process.argv.slice(2);
const base = process.env.LOOKDEV_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  // headless chrome no longer falls back to software WebGL on its own
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on("console", (message) => {
  if (message.type() === "error") {
    console.log("console:", message.text());
  }
});
for (const [i, query] of (queries.length ? queries : [""]).entries()) {
  await page.goto(`${base}/dev/lookdev/?${query}`);
  await page.waitForFunction(() => window.lookdevReady === true, null, { timeout: 90000 });
  await page.screenshot({ path: `${prefix}-${i}.png` });
  console.log(`${prefix}-${i}.png  ${query}`);
}
await browser.close();
