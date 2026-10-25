// Puts the renders of dev/blender/render_icons.py into the pictures of public/images, keeping each
// file's name and viewBox, so nothing in the code changes: npm run icons [-- name ...]
//
// - "whole" pictures become the render alone, fitted into the old viewBox
// - the "per turn" pictures get the render inside the two green arrows of buildings-per-turn.svg
//   (their old cannon was drawn in paths, so it could not simply be swapped)
// - the build progress donuts (progress-10 … 100) show the donut in ten clockwise steps
//
// The renders are trimmed to their content, scaled to twice their box and embedded as WebP
// (needs ImageMagick and cwebp).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const renders = path.join(here, "icons");
const images = path.join(here, "..", "public", "images");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "battlechoc-icons-"));

// picture -> the render it shows
const WHOLE = {
  "factory-icon": "factory-icon",
  "factory-extension-icon": "factory-extension-icon",
  "cacao-tree-icon": "cacao-tree-icon",
  "truffle-cannon-icon": "truffle-cannon-icon",
  "fruit-cannon-icon": "fruit-cannon-icon",
  "ballista-icon": "ballista-icon",
  "easter-bunny-icon": "easter-bunny-icon",
  "fountain-icon": "fountain-icon",
  "xmas-factory-icon": "xmas-factory-icon",
  "donut-factory-icon": "donut-factory-icon",
  "cream-icon": "cream-icon",
  cream: "cream",
  "cream-donut-icon": "cream-donut-icon",
  "health-donut-icon": "health-donut-icon",
  "stop-donut-icon": "stop-donut-icon",
  "surprise-donut-icon": "surprise-donut-icon",
  "portal-donut-icon": "portal-donut-icon",
};
// picture -> the render shown inside the green arrows
const ARROWS = {
  "attacks-per-turn": "truffle-cannon-icon",
  "fruit-attacks-per-turn": "fruit-cannon-icon",
  "spy-attacks-per-turn": "easter-bunny-icon",
};
const PADDING = 0.04; // of the viewBox, round a whole picture

const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"] });

/** The render trimmed to its content, as WebP data fitting width x height (in pixels). */
const webp = (render, width, height) => {
  const png = path.join(scratch, "fit.png");
  const out = path.join(scratch, "fit.webp");
  run("magick", [path.join(renders, render + ".png"), "-trim", "+repage", "-resize", `${Math.round(width)}x${Math.round(height)}`, png]);
  run("cwebp", ["-quiet", "-q", "90", "-alpha_q", "100", "-m", "6", png, "-o", out]);
  const size = run("magick", ["identify", "-format", "%w %h", png]).toString().split(" ").map(Number);
  return { data: `data:image/webp;base64,${fs.readFileSync(out).toString("base64")}`, width: size[0], height: size[1] };
};

const viewBox = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number);

const header = (box) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
  `<svg width="100%" height="100%" viewBox="${box.join(" ")}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;

const whole = (name, render) => {
  const file = path.join(images, name + ".svg");
  const box = viewBox(fs.readFileSync(file, "utf8"));
  const [, , width, height] = box;
  const inner = { width: width * (1 - 2 * PADDING), height: height * (1 - 2 * PADDING) };
  const image = webp(render, inner.width * 2, inner.height * 2);
  const scale = Math.min(inner.width / image.width, inner.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  fs.writeFileSync(
    file,
    header(box) +
      `<image x="${((width - w) / 2).toFixed(2)}" y="${((height - h) / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" xlink:href="${image.data}"/></svg>\n`
  );
};

const arrows = (name, render) => {
  // the arrows (two paths and their gradients) of the hammer's picture, which keeps them
  const template = fs.readFileSync(path.join(images, "buildings-per-turn.svg"), "utf8");
  const paths = template.match(/<path [^>]*\/>/g).slice(0, 2).join("");
  const gradients = template.match(/<linearGradient[\s\S]*?<\/linearGradient>/g).join("");
  const box = viewBox(template);
  const [cx, cy, inner] = [131, 128.5, 160];
  const image = webp(render, inner * 2, inner * 2);
  const scale = Math.min(inner / image.width, inner / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  fs.writeFileSync(
    path.join(images, name + ".svg"),
    header(box) +
      `<defs>${gradients}</defs><g style="stroke-linecap:round;stroke-linejoin:round">${paths}</g>` +
      `<image x="${(cx - w / 2).toFixed(2)}" y="${(cy - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" xlink:href="${image.data}"/></svg>\n`
  );
};

/** progress-10 … progress-100: the donut in clockwise slices from twelve o'clock. */
const progress = (render) => {
  const box = [0, 0, 449, 452];
  const [cx, cy] = [224.5, 226];
  const image = webp(render, 898, 904);
  const scale = Math.min(449 / image.width, 452 / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const picture = `x="${((449 - w) / 2).toFixed(2)}" y="${((452 - h) / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" xlink:href="${image.data}"`;
  for (let step = 1; step <= 10; step++) {
    const file = path.join(images, `progress-${step * 10}.svg`);
    if (step === 10) {
      fs.writeFileSync(file, header(box) + `<image ${picture}/></svg>\n`);
      continue;
    }
    const angle = (step / 10) * 2 * Math.PI;
    const r = 400;
    const x = cx + r * Math.sin(angle);
    const y = cy - r * Math.cos(angle);
    const wedge = `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${step > 5 ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
    fs.writeFileSync(
      file,
      header(box) + `<defs><clipPath id="slice"><path d="${wedge}"/></clipPath></defs><image clip-path="url(#slice)" ${picture}/></svg>\n`
    );
  }
};

const only = process.argv.slice(2);
const wanted = (name) => only.length === 0 || only.includes(name);
for (const [name, render] of Object.entries(WHOLE)) {
  if (wanted(name) && fs.existsSync(path.join(renders, render + ".png"))) {
    whole(name, render);
    console.log("whole  ", name);
  }
}
for (const [name, render] of Object.entries(ARROWS)) {
  if (wanted(name) && fs.existsSync(path.join(renders, render + ".png"))) {
    arrows(name, render);
    console.log("arrows ", name);
  }
}
if (wanted("progress") && fs.existsSync(path.join(renders, "progress-donut.png"))) {
  progress("progress-donut");
  console.log("progress donuts");
}
fs.rmSync(scratch, { recursive: true });
