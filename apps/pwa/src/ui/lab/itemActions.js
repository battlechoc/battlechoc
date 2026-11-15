import {
  Items,
  salvageReturns,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { LAB_BUILDINGS } from "../../catalog.js";
import { itemName } from "./itemText.js";

// The logic of the Choclab's item shelf and item card (ItemShelf.jsx, ItemCard.jsx), kept free
// of React so node --test can load it.

const ITEM_ORDER = Object.keys(Items);

/**
 * The player's items (stats.items, newest first) grouped by item type for the shelf:
 * [{ item, entityType, instances }] in the lab's building order, then in the order of Items;
 * the instances keep the order of `items`. Unknown item keys are left out.
 */
export const shelfGroups = (items) => {
  const groups = new Map();
  items.forEach((entry) => {
    const definition = Items[entry.item];
    if (!definition) {
      return;
    }
    if (!groups.has(entry.item)) {
      groups.set(entry.item, {
        item: entry.item,
        entityType: definition.entityType,
        instances: [],
      });
    }
    groups.get(entry.item).instances.push(entry);
  });
  const rank = (group) => [
    LAB_BUILDINGS.indexOf(group.entityType),
    ITEM_ORDER.indexOf(group.item),
  ];
  return [...groups.values()].sort((a, b) => {
    const [buildingA, itemA] = rank(a);
    const [buildingB, itemB] = rank(b);
    return buildingA - buildingB || itemA - itemB;
  });
};

/**
 * Whether an item (an entry of stats.items) is minted: the server marks it with
 * `minted: { assetName, state: "minted" }`, a plain item with null (an older API not at all).
 */
export const isMinted = (entry) =>
  Boolean(entry && entry.minted && entry.minted.state === "minted");

/**
 * The stamp of a shelf group (its instances): the mark of a minted item when every instance is
 * minted, else null (a mixed group's tile stays plain; the card's chips show which are minted).
 */
export const groupMinted = (instances) =>
  instances.length > 0 && instances.every(isMinted)
    ? instances[0].minted
    : null;

/**
 * What a shelf tile's icon wears for a group (its instances): the stamp when every instance is
 * minted (groupMinted), else the mark of an instance being minted (its pulsing rim), else null.
 */
export const groupMark = (instances) =>
  groupMinted(instances) ||
  (
    instances.find(
      (entry) => entry.minted && entry.minted.state === "minting"
    ) || { minted: null }
  ).minted;

/**
 * The label of a shelf tile (its aria-label, `instances` newest first): the item's name with the
 * newest's serial, or the group's count; with "minted" when the tile wears the ring (`ringed`:
 * groupMinted, where the marks show).
 */
export const tileLabel = (item, instances, ringed) => {
  const name = itemName(item);
  if (instances.length > 1) {
    return ringed
      ? t(tr.ITEM_MINTED_GROUP_LABEL, name, instances.length)
      : `${name} (× ${instances.length})`;
  }
  const { serial } = instances[0];
  return ringed
    ? t(tr.ITEM_MINTED_LABEL, name, serial)
    : `${name} (${t(tr.ITEM_SERIAL, serial)})`;
};

/**
 * The equipment as the lab shows it: a slot whose item is not among the player's `items` is free.
 * A minted item that left the wallet keeps its id in the slot on the server, which ignores it
 * (and sits there again when the item comes back).
 */
export const withoutAwayItems = (equipment, items) => {
  const owned = new Set(items.map((entry) => entry.id));
  return Object.fromEntries(
    Object.entries(equipment).map(([entityType, slots]) => [
      entityType,
      (slots || []).map((id) => (id && owned.has(id) ? id : null)),
    ])
  );
};

/** Where the item with `itemId` is equipped ({ entityType, slot }), or null. */
export const slotOf = (itemId, equipment) => {
  for (const [entityType, slots] of Object.entries(equipment)) {
    const slot = (slots || []).indexOf(itemId);
    if (slot !== -1) {
      return { entityType, slot };
    }
  }
  return null;
};

/**
 * What salvaging an item of `itemKey` gives back, from the recipe book (GET /lab/recipes):
 * { returned, rows: [{ ingredient, amount }] } with the rows in the order of the recipe's
 * ingredients, or { unavailable: "no-book" } while the book is not loaded and
 * { unavailable: "no-recipe" } when the book has no recipe for the item.
 */
export const salvagePreview = (itemKey, book) => {
  if (!book) {
    return { unavailable: "no-book" };
  }
  const recipe = (book.recipes || []).find((entry) => entry.item === itemKey);
  if (!recipe) {
    return { unavailable: "no-recipe" };
  }
  const returned = salvageReturns(recipe.amounts);
  const rows = [...new Set(recipe.ingredients)]
    .filter((ingredient) => returned[ingredient])
    .map((ingredient) => ({ ingredient, amount: returned[ingredient] }));
  return { returned, rows };
};

/** What the card offers for an item: both need the server; a minted item is not salvaged here. */
export const cardActions = ({ item, online }) => ({
  equip: Boolean(online),
  salvage: Boolean(online) && !item.minted,
});

/**
 * Which of `instances` (one item type's, newest first) the inventory picker equips: the one the
 * item card chose (`chosenId`: minted and plain copies differ in what can be done with them),
 * else one that is not equipped anywhere (`equippedIds`), else the first (equipping it again
 * moves it).
 */
export const instanceToEquip = (instances, equippedIds, chosenId) =>
  instances.find((entry) => entry.id === chosenId) ||
  instances.find((entry) => !equippedIds.has(entry.id)) ||
  instances[0];

/**
 * How an item card's serial chip shows `entry`: `chosen` (the one the card shows) and `minted`
 * (a small gold dot, only with the marks on: not in the Android app). The chosen look always wins.
 */
export const chipMarks = (entry, selectedId, marks) => ({
  chosen: entry.id === selectedId,
  minted: Boolean(marks) && isMinted(entry),
});

/**
 * Whether a scrolling box has more above or below its view (the shelf fades its edge there),
 * from its scrollTop, scrollHeight and clientHeight; a pixel of rounding counts as the end.
 */
export const scrollCue = ({ scrollTop, scrollHeight, clientHeight }) => ({
  above: scrollTop > 1,
  below: scrollTop + clientHeight < scrollHeight - 1,
});

/**
 * How much of the shelf's tiles its box shows: `rows` whole rows, and when there are more, a
 * third of the next one, which is all that fades (a half-hidden row reads as "more below"; a row
 * that shows whole is never dimmed). `tiles`: each tile's top in the box (its offsetTop, the
 * box's padding included) and height. `limit` (px): the most the box may take (a short portrait
 * phone, where the lab's building needs its room): fewer whole rows and their peek then, at
 * least one. Null when every row shows; else { maxHeight, fade } in px.
 */
export const shelfView = (tiles, { rows, peek = 1 / 3, limit = Infinity }) => {
  const tops = [];
  tiles
    .map((tile) => tile.top)
    .sort((a, b) => a - b)
    .forEach((top) => {
      if (tops.length === 0 || top - tops[tops.length - 1] > 1) {
        tops.push(top);
      }
    });
  // `count` whole rows and a peek of the next; null when there is no next row
  const viewOf = (count) => {
    if (tops.length <= count) {
      return null;
    }
    const next = tops[count];
    const height = Math.max(
      ...tiles
        .filter((tile) => Math.abs(tile.top - next) <= 1)
        .map((tile) => tile.height)
    );
    const fade = Math.round(height * peek);
    return { maxHeight: Math.round(next + fade), fade };
  };
  // the box's height with every row (its padding below as above)
  const whole = () =>
    Math.max(...tiles.map((tile) => tile.top + tile.height)) + tops[0];
  for (let count = Math.min(rows, tops.length); count > 1; count -= 1) {
    const view = viewOf(count);
    if ((view ? view.maxHeight : whole()) <= limit) {
      return view;
    }
  }
  return viewOf(1);
};

// CJK script: lines break between its characters, so its words need no room of their own
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;

/** The longest word of a name (words between spaces; none for names in CJK script). */
export const longestWord = (name) =>
  String(name)
    .split(/\s+/)
    .filter((word) => !CJK.test(word))
    .reduce((a, b) => (b.length > a.length ? b : a), "");

/**
 * A shelf tile is as wide as the longest word of an item name in any language needs at the
 * name's size, so where the row has room a name breaks only between words
 * (test/unit/itemActions.test.js checks every name): `wordChars` letters of about `charWidth` em
 * of the bold body font, at `size` em of the tile's font, plus the tile's padding and border
 * (`frame`, em of the tile's font). On the narrowest phones a tile is half the row instead
 * (shelfColumns), and a long word hyphenates at its syllables.
 */
export const SHELF_NAME = {
  wordChars: 17,
  charWidth: 0.62,
  size: 0.75,
  frame: 0.9,
};

/** The narrowest shelf tile, in em of the tile's font. */
export const shelfTileWidth = () =>
  `${(
    Math.round(
      (SHELF_NAME.wordChars * SHELF_NAME.charWidth * SHELF_NAME.size +
        SHELF_NAME.frame) *
        10
    ) / 10
  ).toFixed(1)}em`;

/** The gap between the shelf's tiles. */
export const SHELF_GAP = "0.6em";

/**
 * The shelf's grid columns: tiles at least shelfTileWidth wide, or half the row less half the
 * gap where that is narrower, so two columns stay on a 360 px phone.
 */
export const shelfColumns = () =>
  `repeat(auto-fill, minmax(min(${shelfTileWidth()}, calc(50% - ${
    parseFloat(SHELF_GAP) / 2
  }em)), 1fr))`;
