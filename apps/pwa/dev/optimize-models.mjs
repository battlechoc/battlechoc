// Shrinks the GLB exports in public/models without changing how they look. Run it after every
// Blender export (from apps/pwa): npm run models:optimize [-- file.glb ...]
//
// - dedup: identical accessors and materials only once
// - prune: drops the exported lamps and cameras (the game has its own) and vertex attributes no
//   texture uses (UVs, tangents)
// - quantize: normals as 8-bit integers (KHR_mesh_quantization, read by Babylon's glTF loader
//   without a decoder). Positions stay floats: the game places instances by overwriting their
//   position, which would drop the offset that quantized positions need.
//
// Running it twice is harmless. The gltf-transform CLI comes through npx, so the repo does not
// depend on it (it brings native image libraries along).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = "@gltf-transform/cli@4.5.1";
const models = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/models");

const steps = [
  ["dedup"],
  ["prune", "--keep-attributes", "false", "--keep-leaves", "false"],
  ["quantize", "--pattern", "NORMAL", "--quantize-normal", "8"],
];

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((file) => path.resolve(models, path.basename(file)))
  : fs
      .readdirSync(models)
      .filter((file) => file.endsWith(".glb"))
      .map((file) => path.join(models, file));

for (const file of files) {
  const before = fs.statSync(file).size;
  for (const [command, ...options] of steps) {
    execFileSync("npx", ["--yes", CLI, command, file, file, ...options], { stdio: "ignore" });
  }
  const after = fs.statSync(file).size;
  console.log(
    `${path.basename(file).padEnd(28)} ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`
  );
}
