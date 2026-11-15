// The pages a phone wallet opens in its own browser, without React: the link page (plan 3,
// link/index.html → src/link/main.js) and the sign page (plan D, sign/index.html →
// src/sign/main.js). They are a build of their own, run after the game's (npm run build), into
// <outDir>/link/ and <outDir>/sign/: as inputs of the game's build they shared the game's "app"
// chunk, which starts the game (src/index.jsx). Built after the game, they are also never in the
// game's precache.
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
      input: {
        link: path.join(here, "link/index.html"),
        sign: path.join(here, "sign/index.html"),
      },
    },
  },
});
