import { Items, salvageReturns } from "@battlechoc/battlechoc-shared-functions";
import { LAB_BUILDINGS } from "../../catalog.js";

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
