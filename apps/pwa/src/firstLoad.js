// What the title screen needs of the first loading without the 3D engine (the scene and its
// AssetLoader arrive as a lazy chunk, megabytes after the title screen): the fonts the menu waits
// for, and the start button's "try again", which the AssetLoader fills in once it runs. Nothing
// here may import Babylon (npm run check:bundle).

// the menu waits for the fonts (src/index.css), but never longer than FONT_TIMEOUT:
// a font that does not load must not keep the game from starting
const FONTS = ["1em Bangers", "1em Montserrat"];
const FONT_TIMEOUT = 5000;

let fonts;

/** Resolves once the fonts are in or have taken too long; the first call asks for them. */
export const fontsLoaded = () => {
  if (!fonts) {
    fonts = Promise.race([
      document.fonts
        ? Promise.all(FONTS.map((font) => document.fonts.load(font)))
        : Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
    ]).catch(() => undefined);
  }
  return fonts;
};

let retry = () => {};

/** The AssetLoader hands in how the 3D models that did not arrive are asked for again. */
export const registerAssetRetry = (callback) => {
  retry = callback;
};

/** The start button's "try again" after a 3D model did not load. */
export const retryAssets = () => retry();
