// What the public item page (minting plan F, /item/?a=<asset name>) shows, without the DOM:
// which `a` it asks the API for at all, which answers of GET /items/:assetName it trusts, and the
// texts and the icon's parts of an item. The texts follow the game's current language (as the
// game's own), the date the language given. Nothing here knows who holds the item: the API does
// not say.
import {
  chain,
  Items,
  Stat,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  effectLines,
  iconPartsOf,
  itemName,
  TIER_COLORS,
} from "../ui/lab/itemText.js";

// a user token's name, as the API checks it (apps/api routes/items.js): the CIP-67 label 222 and
// 28 bytes in lower-case hex. Anything else is never sent: the page says it knows no such item.
const USER_ASSET_NAME = new RegExp(`^${chain.USER_LABEL}[0-9a-f]{56}$`);

/** Whether `value` (the page's `a`, from a URL anyone can write) is a user token's name. */
export const isAssetName = (value) =>
  typeof value === "string" && USER_ASSET_NAME.test(value);

// the latest moment a Date can hold (ms since the epoch); beyond it Intl cannot write the day
const LAST_TIME = 8.64e15;

const isTime = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= LAST_TIME;

// an effect the game can put in words: { stat, factor } or { stat, add } of a stat it knows
const isWordable = (effect) =>
  effect !== null &&
  typeof effect === "object" &&
  Object.hasOwn(Stat, effect.stat) &&
  Object.hasOwn(tr, `STAT_${effect.stat}`) &&
  (Number.isFinite(effect.factor) || Number.isFinite(effect.add));

// The API's 200 (apps/api routes/items.js): every key the page reads, in the form it reads it.
// The item must be one of this bundle's Items (its name and its icon come from there: without
// them the page has nothing to show). A newer API's tier or effect the page does not know is
// not a reason to show nothing (itemPageView leaves them out).
const isItemAnswer = (body) =>
  body !== null &&
  typeof body === "object" &&
  typeof body.item === "string" &&
  Object.hasOwn(Items, body.item) &&
  typeof body.entityType === "string" &&
  typeof body.tier === "string" &&
  Number.isFinite(body.points) &&
  Number.isSafeInteger(body.serial) &&
  body.serial > 0 &&
  isTime(body.mintedAt) &&
  (body.burnedAt === null || isTime(body.burnedAt)) &&
  Array.isArray(body.effects);

/**
 * What an answer of GET /items/:assetName (its status, undefined without one, and its body)
 * means for the page: `{ kind: "item", answer }`, `{ kind: "unknown" }` for the API's own
 * UNKNOWN ITEM, and `{ kind: "unavailable" }` for everything else (no answer, a limit, a server
 * failure, an answer the page cannot read, an item this page cannot name): that says nothing
 * about the item, so the page never tells a buyer it does not exist because of a network error.
 */
export const readAnswer = (status, body) => {
  if (status === 200 && isItemAnswer(body)) {
    return { kind: "item", answer: body };
  }
  if (
    status === 404 &&
    body !== null &&
    typeof body === "object" &&
    body.error === "UNKNOWN ITEM"
  ) {
    return { kind: "unknown" };
  }
  return { kind: "unavailable" };
};

/**
 * The page's content for an item the API answered (`answer`, as readAnswer let it through), or
 * for none (null: unknown): `{ state: "item" | "salvaged" | "unknown", title, facts, mintedOn,
 * tag, effects: [{ text, good }], building, icon }`.
 * - `facts`: serial, tier (left out when this bundle does not know it), points; `mintedOn`: the
 *   day the server saw the mint in a block, in `language`'s long date and the reader's own time
 *   zone (the browser's), never a time of day: that is when the server noticed, not the block's.
 * - `effects`: the API's (today's balance), in the words the game uses; one it cannot word (a
 *   newer stat) is left out.
 * - `icon`: what the game draws the item's icon from (iconPartsOf: face, tier colours, building
 *   picture, badge), never the token's picture.
 */
export const itemPageView = (answer, { language }) => {
  if (!answer) {
    return { state: "unknown" };
  }
  const date = new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(
    new Date(answer.mintedAt)
  );
  const tier = Object.hasOwn(TIER_COLORS, answer.tier)
    ? t(tr[TIER_COLORS[answer.tier].label])
    : null;
  const facts = [
    t(tr.ITEM_SERIAL, answer.serial),
    tier,
    t(tr.LAB_POINTS, answer.points),
  ].filter(Boolean);
  const mintedOn = t(tr.ITEM_PAGE_MINTED_ON, date);
  return {
    state: answer.burnedAt === null ? "item" : "salvaged",
    title: itemName(answer.item),
    facts,
    mintedOn,
    tag: t(tr.ITEM_SERIAL, answer.serial),
    effects: effectLines(answer.item, answer.effects.filter(isWordable)),
    building: t(
      tr.ITEM_PAGE_BUILDING,
      t(tr.TOOLTIP_BUILDING_TITLE, answer.entityType)
    ),
    icon: iconPartsOf(answer.item),
  };
};
