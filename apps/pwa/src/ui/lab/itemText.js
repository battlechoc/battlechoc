import {
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { BUILDING_ICON, iconUrl } from "../../catalog.js";

// stats where a smaller value is better for the player who owns the item
const LOWER_IS_BETTER = new Set([
  "costs",
  "buildIntervalMs",
  "cooldownMs",
  "rushCost",
  "rushFrom",
  "shieldFactor",
  "donutIntervalMs",
]);

// stats changed by an amount instead of a factor, shown in percent points except build slots
const PERCENT_POINTS = new Set(["rushFrom", "donutProbability"]);

export const TIER_COLORS = {
  COMMON: { ring: "#c99a5b", fill: "#f3dfc3", label: "LAB_TIER_COMMON" },
  RARE: { ring: "#3190C3", fill: "#d4ecf8", label: "LAB_TIER_RARE" },
  EPIC: { ring: "#9b5de5", fill: "#ecdcfb", label: "LAB_TIER_EPIC" },
};

/** The gold of minted items (the owner's mockup, variant B): its gold, its dark edge, its ink. */
export const MINT = { gold: "#FAD25A", dark: "#8A5A00", ink: "#3A2500" };

// the drop shadow under every item icon
export const ICON_SHADOW = "0 0.1em 0.25em rgba(0, 0, 0, 0.35)";

/**
 * The plain item icon (ItemIcon.jsx), also drawn by scripts/item-pictures.mjs for the item
 * tokens and by the item and sign pages (src/itempage, src/sign): the face in the tier's fill, the tier ring inside its edge, the building's picture in
 * the middle and the badge across the lower right edge, as shares of the icon.
 */
export const ICON_LOOK = {
  face: (tier) =>
    `radial-gradient(circle at 35% 30%, #ffffff 0%, ${tier.fill} 70%)`,
  ring: (tier) => `inset 0 0 0 0.18em ${tier.ring}`,
  picture: { inset: "12%", width: "76%", height: "76%" },
  badge: { right: "-6%", bottom: "-6%", width: "42%", height: "42%" },
};

// a share of an icon's diameter `size` (a CSS length), never thinner than `least`
const share = (size, part, least = "1px") =>
  `max(${least}, calc(${size} * ${part}))`;

// the stamp's rings as shares of the icon's diameter (mockup variant B: 5, 3 and 4 px at 104 px)
const RING = { rim: 0.05, dark: 0.03, gold: 0.04 };

// the serial tag: how far it reaches into the outer ring (px), its text size in em of the icon's
// font, its line height and its border in px
const TAG = { overlap: 1, fontSize: 0.9, lineHeight: 1.25, border: 2 };

// how far the stamp's rings reach beyond the icon: the dark ring and the outer gold one
const ringReach = (size) =>
  `${share(size, RING.dark)} + ${share(size, RING.gold)}`;

/**
 * Every look of the stamp on minted items in one place (spec section 2, mockup variant B): the
 * gold double ring that replaces the tier ring, scaled with the icon (`ring(size)`); the serial
 * tag below it where the item shows large; the room the tag needs under the icon
 * (`tagRoom(size)`); the dot on an item card's serial chip; an item being minted (`minting`: a
 * dashed gold rim that pulses); and an item that is gone (`away`: a dark face, a light dashed
 * rim, a grey picture, no badge).
 */
export const STAMP = {
  ring: (size) => ({
    boxShadow: [
      `inset 0 0 0 ${share(size, RING.rim)} ${MINT.gold}`,
      `0 0 0 ${share(size, RING.dark)} ${MINT.dark}`,
      `0 0 0 calc(${ringReach(size)}) ${MINT.gold}`,
      ICON_SHADOW,
    ].join(", "),
  }),
  // centred under the icon, against the outer ring's edge (a pixel into it, so no gap shows
  // where the circle's edge is soft); the badge ends above that edge, so the two never touch
  tag: (size) => ({
    left: "50%",
    top: `calc(100% + ${ringReach(size)} - ${TAG.overlap}px)`,
    transform: "translateX(-50%)",
    padding: "0 0.55em",
    borderRadius: 999,
    border: `${TAG.border}px solid ${MINT.dark}`,
    background: MINT.gold,
    color: MINT.ink,
    fontSize: `${TAG.fontSize}em`,
    lineHeight: TAG.lineHeight,
    letterSpacing: "0.03em",
  }),
  tagRoom: (size) =>
    `calc(${ringReach(size)} - ${TAG.overlap}px + ${
      TAG.fontSize * TAG.lineHeight
    }em + ${TAG.border * 2}px)`,
  // an item card's serial chip of a minted item: a small gold coin before the number
  chipDot: {
    width: "0.55em",
    height: "0.55em",
    marginRight: "0.4em",
    borderRadius: "50%",
    background: MINT.gold,
    boxShadow: `0 0 0 1px ${MINT.dark}`,
  },
  // an item being minted (its operation is out): a dashed gold rim over the tier ring that
  // pulses (scale 1 → 1.12 → 1), still with its badge; no tag, it has no stamp yet
  minting: {
    rim: (size) => `${share(size, 0.05, "2px")} dashed ${MINT.gold}`,
    inset: (size) => `calc(-1 * ${share(size, 0.07, "3px")})`,
    pulse: "1.2s ease-in-out infinite",
  },
  away: {
    face: "#5C7482",
    rim: (size) => `${share(size, 0.055, "2px")} dashed #B7C7D1`,
    picture: "grayscale(1)",
  },
};

/**
 * ItemIcon's style sheet (react-jss): the pulse of an item being minted, unless the player
 * asked for less motion. Here, not in ItemIcon.jsx, so a unit test builds it with jss.
 */
export const ITEM_ICON_SHEET = {
  "@keyframes itemMinting": {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.12)" },
    "100%": { transform: "scale(1)" },
  },
  // the rim of an item being minted: it pulses, unless the player asked for less motion
  minting: {
    animation: `$itemMinting ${STAMP.minting.pulse}`,
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
};

/**
 * The lab's text colours, from the theme: what helps the player, what is the price or missing,
 * and why something cannot be done.
 */
export const labColors = (theme) => ({
  good: theme.color.primary.light,
  bad: theme.color.accent.light,
  reason: theme.color.gold.light,
});

const BADGES = {
  hp: "/images/lab/badge-hp.svg",
  cacaoAmount: "/images/ingredients/cocoa.svg",
  buildIntervalMs: "/images/lab/badge-speed.svg",
  cooldownMs: "/images/lab/badge-speed.svg",
  rushFrom: "/images/lab/badge-speed.svg",
  donutIntervalMs: "/images/lab/badge-speed.svg",
  damage: "/images/lab/badge-damage.svg",
  entityFactor: "/images/lab/badge-damage.svg",
  shieldFactor: "/images/lab/badge-shield.svg",
  rushCost: "/images/lab/badge-tag.svg",
  costs: "/images/lab/badge-tag.svg",
  donutProbability: "/images/health-donut-icon.svg",
  buildCapacity: "/images/buildings-icon.svg",
};

/** The badge of an item: the picture of what it is for (its first effect). */
export const badgeOf = (itemKey) => BADGES[Items[itemKey].effects[0].stat];

export const itemName = (itemKey) => t(tr[`ITEM_${itemKey}`]);

/**
 * What an item's icon is drawn from, as ItemIcon.jsx draws it: the face in its tier's fill
 * (`face`), its tier's colours (`tier`: the ring, the fill), its building's picture and its badge.
 * Only from the fixed tables, for an item key of Items.
 */
export const iconPartsOf = (itemKey) => {
  const definition = Items[itemKey];
  const tier = TIER_COLORS[definition.tier];
  return {
    face: ICON_LOOK.face(tier),
    tier,
    building: iconUrl(BUILDING_ICON[definition.entityType]),
    badge: badgeOf(itemKey),
  };
};

const sign = (value) => (value > 0 ? "+" : "−");

/**
 * One line per effect: its text and whether it helps the player (green) or is the price (red).
 * `effects` are the item's own by default; the public item page passes the ones the API answered
 * (today's balance on the server, which a cached page's bundle may not have yet).
 */
export const effectLines = (itemKey, effects = Items[itemKey].effects) =>
  effects.map((effect) => {
    const name = t(tr[`STAT_${effect.stat}`]);
    let change;
    let text;
    if (typeof effect.factor === "number") {
      change = effect.factor - 1;
      text = `${sign(change)}${Math.round(Math.abs(change) * 100)} % ${name}`;
    } else if (PERCENT_POINTS.has(effect.stat)) {
      change = effect.add;
      text = `${sign(change)}${Math.round(Math.abs(change) * 100)} % ${name}`;
    } else {
      change = effect.add;
      text = `${sign(change)}${Math.abs(change)} ${name}`;
    }
    const good = LOWER_IS_BETTER.has(effect.stat) ? change < 0 : change > 0;
    return { text, good };
  });
