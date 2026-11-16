// Draws the picture of each item type for its token: the `image` of the token's metadata
// (chain.itemImageUrl of the shared package, https://battlechoc.com/items/<kebab key>.png) is
// public/items/<kebab key>.png, which wallets, explorers and marketplaces show. The game never
// shows these files (the service worker neither precaches nor caches them).
//
//   npm run items:pictures -w apps/pwa [-- ITEM_KEY ...]   (default: every item type)
//
// Each picture is the game's plain item icon as the shelf draws it (src/ui/lab/ItemIcon.jsx at
// 3.2em, with ICON_LOOK, ICON_SHADOW, TIER_COLORS and badgeOf of src/ui/lab/itemText.js): the
// face in the tier's fill, the tier ring, the building's picture and the badge, rendered by
// headless Chromium (@playwright/test, which the browser tests bring; the building pictures are
// SVGs with WebP renders inside, which a browser draws as the game does) at 512 × 512 and one
// pixel per CSS pixel. The icon is DIAMETER wide and sits SHIFT up and left of the middle, so
// the circle with its badge is centred: it fits a round crop of the picture (wallets that show
// round thumbnails), and its drop shadow ends inside the square; round it the picture is
// transparent, for light and dark wallet themes alike. The pictures are put into the page as
// data URIs, so no server runs. Rendering the same files with the same Chromium gives the same
// bytes. It never deletes a picture: an item key is never renamed or removed once it may have
// been minted (packages/shared/equipment.js), and a token's datum names its picture's URL for
// good.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { Items, chain } from "@battlechoc/battlechoc-shared-functions";
import { BUILDING_ICON, iconUrl } from "../src/catalog.js";
import {
  ICON_LOOK,
  ICON_SHADOW,
  TIER_COLORS,
  badgeOf,
} from "../src/ui/lab/itemText.js";

const SIZE = 512;
// the icon's diameter in pixels, and how far it is moved up and left of the middle: the badge
// reaches 6 % of the diameter beyond the circle at the lower right, so the circle and its badge
// together are centred when the circle moves 8 px up and left; then nothing opaque lies beyond
// 254 px of the picture's middle (a round crop keeps the badge's rim, measured 253.2 px at
// most), and the shadow (0.1em down, 0.25em blur at 3.2em) fades out 23 px from the left edge
// and 27 px from the bottom one. A centred 368 px circle fits the crop as well, but is smaller
// and looks 8 px low and right.
const DIAMETER = 384;
const SHIFT = 8;
// the size the shelf gives the icon: its ring (0.18em) and shadow are em-based, so they keep
// the shelf's proportions when the icon's font size makes 3.2em the diameter
const ICON_SIZE = "3.2em";
const FONT_SIZE = DIAMETER / 3.2;

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const itemsDir = path.join(publicDir, "items");

/** The file of an item type's picture: the path of its URL in the token's metadata. */
const pictureFile = (key) =>
  path.join(publicDir, new URL(chain.itemImageUrl(key)).pathname);

// the media types of the pictures an icon is drawn from, by extension
const MEDIA_TYPE = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** A file of public/ (its URL path) as a data URI. */
const dataUri = (url) =>
  `data:${MEDIA_TYPE[path.extname(url)]};base64,${fs
    .readFileSync(path.join(publicDir, url))
    .toString("base64")}`;

/** A style object as React takes it, as the text of a style attribute. */
const css = (style) =>
  Object.entries(style)
    .map(
      ([name, value]) =>
        `${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`
    )
    .join("; ");

/** The page that shows the item's icon as ItemIcon draws it, the circle and badge centred. */
const pageOf = (key) => {
  const definition = Items[key];
  const tier = TIER_COLORS[definition.tier];
  const icon = css({
    position: "relative",
    display: "inline-block",
    width: ICON_SIZE,
    height: ICON_SIZE,
    flexShrink: 0,
    borderRadius: "50%",
    background: ICON_LOOK.face(tier),
    boxShadow: `${ICON_LOOK.ring(tier)}, ${ICON_SHADOW}`,
  });
  const picture = css({ position: "absolute", ...ICON_LOOK.picture });
  const badge = css({ position: "absolute", ...ICON_LOOK.badge });
  const offset = (SIZE - DIAMETER) / 2 - SHIFT;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; }
      .place { position: absolute; left: ${offset}px; top: ${offset}px; display: flex; font-size: ${FONT_SIZE}px; }
    </style>
  </head>
  <body>
    <div class="place">
      <span style="${icon}">
        <img alt="" style="${picture}" src="${dataUri(iconUrl(BUILDING_ICON[definition.entityType]))}" />
        <img alt="" style="${badge}" src="${dataUri(badgeOf(key))}" />
      </span>
    </div>
  </body>
</html>`;
};

const keys = process.argv.slice(2);
const unknown = keys.filter((key) => !Items[key]);
if (unknown.length > 0) {
  console.error(`not an item: ${unknown.join(", ")}`);
  process.exit(1);
}

fs.mkdirSync(itemsDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  });
  for (const key of keys.length > 0 ? keys : Object.keys(Items)) {
    await page.setContent(pageOf(key), { waitUntil: "load" });
    // every picture decoded before the shot
    await page.$$eval("img", (images) =>
      Promise.all(images.map((image) => image.decode()))
    );
    const file = pictureFile(key);
    await page.screenshot({ path: file, omitBackground: true });
    console.log(
      `${path.relative(publicDir, file)} ${fs.statSync(file).size} B`
    );
  }
} finally {
  await browser.close();
}
