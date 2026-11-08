// The link page (plan 3, link/index.html → src/link/main.js): a phone wallet opens it in its own
// browser. It is a build of its own, run after the game's (npm run build), into <outDir>/link/:
// as a second input of the game's build it shared the game's "app" chunk, which starts the game
// (src/index.jsx). Built after the game, it is also never in the game's precache.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // the game's public files are there already (fonts, icons)
  publicDir: false,
  cacheDir: path.join(here, "node_modules/.vite-link"),
  build: {
    outDir: "build",
    // the game's build is in the same folder
    emptyOutDir: false,
    assetsDir: "link/assets",
    rolldownOptions: {
      input: path.join(here, "link/index.html"),
    },
  },
});
