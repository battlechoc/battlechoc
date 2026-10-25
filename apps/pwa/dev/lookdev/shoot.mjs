// Headless screenshots of the lookdev page or the game (the dev server must run):
//   node dev/lookdev/shoot.mjs /tmp/look "env=0.6" "models=donut.glb&cols=1"
//   node dev/lookdev/shoot.mjs /tmp/game "/situation/2042050de74e855affdb312da85badbf?sun=0.9"
// writes /tmp/look-0.png, /tmp/look-1.png, … An argument is a lookdev query string, or a path of
// the game when it starts with "/" (the debug boards need the dev server's test hooks; the shot is
// taken after LOOKDEV_WAIT ms, default 15000). LOOKDEV_URL overrides http://127.0.0.1:3000,
// LOOKDEV_SCALE renders at that device pixel ratio (default 1).
import { chromium } from "@playwright/test";

const [prefix, ...targets] = process.argv.slice(2);
const base = process.env.LOOKDEV_URL || "http://127.0.0.1:3000";
const wait = Number(process.env.LOOKDEV_WAIT || 15000);
const deviceScaleFactor = Number(process.env.LOOKDEV_SCALE || 1);
const browser = await chromium.launch({
  // headless chrome no longer falls back to software WebGL on its own
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
for (const [i, target] of (targets.length ? targets : [""]).entries()) {
  // a fresh page each time: the game keeps its state in the page
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor });
  page.on("pageerror", (error) => console.log("pageerror:", error.message));
  if (target.startsWith("/")) {
    await page.goto(base + target);
    await page.waitForTimeout(wait);
  } else {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${base}/dev/lookdev/?${target}`);
    await page.waitForFunction(() => window.lookdevReady === true, null, { timeout: 90000 });
  }
  await page.screenshot({ path: `${prefix}-${i}.png` });
  console.log(`${prefix}-${i}.png  ${target}`);
  await page.close();
}
await browser.close();
