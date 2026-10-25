// Puts the renders of dev/blender/render_icons.py into the pictures of public/images, keeping each
// file's name and viewBox, so nothing in the code changes: npm run icons [-- name ...]
//
// - "whole" pictures become the render alone, fitted into the old viewBox
// - the "per turn" pictures get the render inside the two green arrows of buildings-per-turn.svg
//   (their old cannon was drawn in paths, so it could not simply be swapped)
// - the build progress donuts (progress-10 … 100) show the donut in ten clockwise steps
// - "logo" puts the fountain (render logo-fountain) on the letters of dev/logo-letters.svg and
//   makes the app icons from it on a deep blue ray background: favicon.png/.ico and the
//   manifest's icons (round), the maskable icons (the fountain inside the safe zone), the apple
//   touch icons (square, iOS rounds them) and the notification icon (a white silhouette)
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
const pub = path.join(here, "..", "public");
const images = path.join(pub, "images");
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

// the app icon's background (the user's pick, "deeper blue")
const BLUE = ["#8fd6f5", "#3aa3dc", "#1d6aa5"];
const background = (size) => {
  const rays = Array.from({ length: 22 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 22;
    const point = (angle) => `${(256 + 400 * Math.cos(angle)).toFixed(1)},${(256 + 400 * Math.sin(angle)).toFixed(1)}`;
    return `<path d="M256,256 L${point(a)} L${point(a + 0.13)} Z" fill="#ffffff" fill-opacity="0.13"/>`;
  }).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>` +
    `<radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${BLUE[0]}"/>` +
    `<stop offset="0.55" stop-color="${BLUE[1]}"/><stop offset="1" stop-color="${BLUE[2]}"/></radialGradient>` +
    `</defs><rect width="512" height="512" fill="url(#g)"/>${rays}</svg>`;
  const file = path.join(scratch, "background.svg");
  fs.writeFileSync(file, svg);
  const png = path.join(scratch, `background-${size}.png`);
  run("rsvg-convert", ["-w", String(size), "-h", String(size), file, "-o", png]);
  return png;
};

/** The motif on the blue background, `fraction` of the icon's height, as a PNG of `size`. */
const appIcon = (render, size, fraction, out, round) => {
  const motif = path.join(scratch, "motif.png");
  run("magick", [path.join(renders, render + ".png"), "-trim", "+repage", "-resize", `x${Math.round(size * fraction)}`, motif]);
  const args = [background(size), motif, "-gravity", "center", "-geometry", `+0+${Math.round(size * 0.012)}`, "-composite"];
  if (round) {
    const r = size / 2 - 0.5;
    args.push("(", "-size", `${size}x${size}`, "xc:black", "-fill", "white", "-draw", `circle ${size / 2},${size / 2} ${size / 2},${size / 2 - r}`, ")");
    args.push("-alpha", "off", "-compose", "CopyOpacity", "-composite");
  }
  run("magick", [...args, out]);
};

const logo = (render) => {
  const letters = fs.readFileSync(path.join(here, "logo-letters.svg"), "utf8");
  // on the second letter (the "A"), where the old tree stood
  const [cx, bottom, height] = [308, 392, 370];
  const image = webp(render, height * 2, height * 2);
  const scale = height / image.height;
  const w = image.width * scale;
  const motif = `<image x="${(cx - w / 2).toFixed(1)}" y="${(bottom - height).toFixed(1)}" width="${w.toFixed(1)}" height="${height}" xlink:href="${image.data}"/>`;
  fs.writeFileSync(path.join(images, "logo.svg"), letters.replace("</svg>", motif + "</svg>"));
  for (const size of [144, 192, 512]) {
    appIcon(render, size, 0.74, path.join(pub, `icon-${size}x${size}.png`), true);
    // maskable: only the inner circle of 80 % is sure to show
    appIcon(render, size, 0.58, path.join(pub, `icon-${size}x${size}-maskable.png`), false);
  }
  for (const size of [120, 152, 167, 180]) {
    appIcon(render, size, 0.7, path.join(pub, `apple-icon-${size}.png`), false);
  }
  appIcon(render, 128, 0.74, path.join(pub, "favicon.png"), true);
  run("magick", [path.join(pub, "favicon.png"), "-define", "icon:auto-resize=128,64,48,32,16", path.join(pub, "favicon.ico")]);
  // Android shows the notification icon as a white shape
  run("magick", [
    path.join(renders, render + ".png"), "-trim", "+repage", "-resize", "84x84",
    "-alpha", "extract", "-background", "white", "-alpha", "shape",
    "-gravity", "center", "-background", "none", "-extent", "96x96", "-strip",
    `PNG32:${path.join(images, "battlechoc_notification_icon.png")}`,
  ]);
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
if (wanted("logo") && fs.existsSync(path.join(renders, "logo-fountain.png"))) {
  logo("logo-fountain");
  console.log("logo and app icons");
}
fs.rmSync(scratch, { recursive: true });
