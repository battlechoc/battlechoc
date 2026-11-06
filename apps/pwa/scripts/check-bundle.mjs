// Guards the first load of the built game. Run it after a build (from apps/pwa):
// npm run check:bundle [-- <build dir>]
//
// The title screen waits for the entry script of index.html and for every chunk it preloads
// (`modulepreload`: the entry's static imports). This prints them with their sizes and fails
// when
// - together they are heavier than the budget below (gzip), or
// - a chunk of the 3D engine is among them: Babylon belongs to the lazy scene. One static import
//   of src/AssetLoader.jsx and one of src/3d/cannonPick.js once put 2 MB of it in front of the
//   title screen. What the first screens need of such a module goes into a file without Babylon
//   (src/firstLoad.js, src/match/fruitCannon.js).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// about 15 % above the build this was last set for (see the commit); raise it knowingly
const BUDGET_GZIP_KB = 355;

// what only Babylon's code carries: its class registry names, its version line, its packages
const BABYLON = /BABYLON\.|Babylon\.js v|@babylonjs\//;

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.resolve(process.argv[2] || path.join(here, "../build"));
const index = path.join(build, "index.html");
if (!fs.existsSync(index)) {
  console.error(`${index} is missing: build the game first (npm run build)`);
  process.exit(1);
}

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`));
  return match ? match[1] : undefined;
};
const html = fs.readFileSync(index, "utf8");
const tags = (name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) || [];
const urls = [
  ...tags("script")
    .filter((tag) => attribute(tag, "type") === "module")
    .map((tag) => attribute(tag, "src")),
  ...tags("link")
    .filter((tag) => attribute(tag, "rel") === "modulepreload")
    .map((tag) => attribute(tag, "href")),
].filter(Boolean);
if (urls.length === 0) {
  console.error(`${index} has no module script: nothing to check`);
  process.exit(1);
}

const kB = (bytes) => (bytes / 1000).toFixed(1).padStart(8) + " kB";
const files = urls.map((url) => {
  const content = fs.readFileSync(path.join(build, url.replace(/^\//, "")));
  return {
    url,
    raw: content.length,
    gzip: zlib.gzipSync(content).length,
    babylon: BABYLON.test(content.toString("utf8")) || /babylon/i.test(url),
  };
});
const sum = (key) => files.reduce((total, file) => total + file[key], 0);

console.log("JavaScript before the first render (the entry and what it preloads):");
for (const file of files) {
  console.log(`${kB(file.raw)}  ${kB(file.gzip)} gzip  ${file.url}${file.babylon ? "  <- Babylon" : ""}`);
}
console.log(`${kB(sum("raw"))}  ${kB(sum("gzip"))} gzip  ${files.length} files, budget ${BUDGET_GZIP_KB} kB gzip`);

const problems = [];
if (sum("gzip") > BUDGET_GZIP_KB * 1000) {
  problems.push(
    `the first load is ${(sum("gzip") / 1000).toFixed(1)} kB gzip, over the budget of ${BUDGET_GZIP_KB} kB: ` +
      "load what the title screen does not need lazily, or raise BUDGET_GZIP_KB in this file knowingly"
  );
}
const babylon = files.filter((file) => file.babylon);
if (babylon.length > 0) {
  problems.push(
    `the 3D engine is part of the first load (${babylon.map((file) => path.basename(file.url)).join(", ")}): ` +
      "a module of the title screen imports Babylon, src/3d or src/AssetLoader.jsx statically"
  );
}
for (const problem of problems) {
  console.error(`check:bundle failed: ${problem}`);
}
process.exit(problems.length > 0 ? 1 : 0);
