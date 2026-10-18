import {
  EntityType,
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// the picture of each building (public/images/<name>-icon.svg)
export const BUILDING_ICON = {
  [EntityType.FACTORY]: "factory",
  [EntityType.CACAOTREE]: "cacao-tree",
  [EntityType.RUM_TRUFFLE_CANNON]: "truffle-cannon",
  [EntityType.FACTORY_EXTENSION]: "factory-extension",
  [EntityType.SPYING_EASTER_BUNNY]: "easter-bunny",
  [EntityType.XMAS_FACTORY]: "xmas-factory",
  [EntityType.CHOCOLATE_FOUNTAIN]: "fountain",
  [EntityType.FRUIT_CANNON]: "fruit-cannon",
  [EntityType.HOT_CHOCOLATE_BALLISTA]: "ballista",
  [EntityType.DONUT_FACTORY]: "donut-factory",
  [EntityType.CREAM]: "cream",
};

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

/**
 * The lab's text colours, from the theme: what helps the player, what is the price or missing,
 * and why something cannot be done.
 */
export const labColors = (theme) => ({
  good: theme.color.primary.light,
  bad: theme.color.accent.light,
  reason: theme.color.gold.light,
});

/** A game panel: dark blue with a light blue rim, like the info card of a match. */
export const gamePanel = (theme) => ({
  borderRadius: "0.8em",
  background: theme.color.secondary.dark,
  border: `0.15em solid ${theme.color.secondary.light}`,
  boxSizing: "border-box",
});

/** Names, headings and counts: Bangers with a dark blue outline. */
export const bangers = (theme, color = "white") => ({
  fontFamily: "var(--font-display)",
  fontWeight: "normal",
  letterSpacing: "0.03em",
  color,
  "-webkit-text-stroke": `0.04em ${theme.color.secondary.dark}`,
  "-webkit-font-smoothing": "antialiased",
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

const sign = (value) => (value > 0 ? "+" : "−");

/** One line per effect: its text and whether it helps the player (green) or is the price (red). */
export const effectLines = (itemKey) =>
  Items[itemKey].effects.map((effect) => {
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
