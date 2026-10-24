// Re-encodes the bitmaps embedded in the SVGs of public/images as WebP. Many icons are renders
// that Affinity exported as base64 PNGs inside an SVG; as WebP (alpha kept lossless) they are a
// third of the size and look the same, while the vector parts stay vectors and every URL stays.
// Run it after exporting new art (from apps/pwa): npm run images:optimize [-- name.svg ...]
// Needs cwebp (brew install webp). Running it twice is harmless: WebP data is left alone.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const images = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/images");
const EMBEDDED = /data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)/g;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "battlechoc-images-"));

const toWebp = (type, base64) => {
  const input = path.join(scratch, type === "png" ? "in.png" : "in.jpg");
  const output = path.join(scratch, "out.webp");
  const raw = Buffer.from(base64.replace(/\s/g, ""), "base64");
  fs.writeFileSync(input, raw);
  execFileSync("cwebp", ["-quiet", "-q", "88", "-alpha_q", "100", "-m", "6", input, "-o", output]);
  const webp = fs.readFileSync(output);
  // a tiny PNG can be smaller than its WebP: keep it then
  return webp.length < raw.length ? `data:image/webp;base64,${webp.toString("base64")}` : undefined;
};

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((file) => path.join(images, path.basename(file)))
  : fs
      .readdirSync(images)
      .filter((file) => file.endsWith(".svg"))
      .map((file) => path.join(images, file));

let before = 0;
let after = 0;
for (const file of files) {
  const svg = fs.readFileSync(file, "utf8");
  if (!/data:image\/(png|jpe?g);base64,/.test(svg)) {
    continue;
  }
  const result = svg.replace(EMBEDDED, (match, type, base64) => toWebp(type, base64) || match);
  fs.writeFileSync(file, result);
  before += svg.length;
  after += result.length;
  console.log(`${path.basename(file).padEnd(30)} ${Math.round(svg.length / 1024)} KB → ${Math.round(result.length / 1024)} KB`);
}
fs.rmSync(scratch, { recursive: true });
console.log(`total ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
