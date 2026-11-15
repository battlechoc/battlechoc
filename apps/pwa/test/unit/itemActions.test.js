// The item shelf and card of the Choclab (node --test): how the player's items are grouped, where
// an item is equipped, what salvaging it gives back and what the card offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EntityType } from "@battlechoc/battlechoc-shared-functions";
import {
  shelfGroups,
  slotOf,
  salvagePreview,
  cardActions,
} from "../../src/ui/lab/itemActions.js";

// stats.items: newest first
const items = [
  { id: "n2", item: "NUT_BRICKS", serial: 7 },
  { id: "l1", item: "LIGHT_BARREL", serial: 3 },
  { id: "x1", item: "NOT_AN_ITEM", serial: 1 },
  { id: "d1", item: "DARK_WALLS", serial: 2 },
  { id: "n1", item: "NUT_BRICKS", serial: 4 },
];

test("the shelf groups the items by type in the lab's building order, newest first", () => {
  const groups = shelfGroups(items);
  // LAB_BUILDINGS: the factory, the cacao tree, the truffle cannon, the extension, …
  assert.deepEqual(
    groups.map(({ item, entityType, instances }) => ({
      item,
      entityType,
      ids: instances.map((entry) => entry.id),
    })),
    [
      { item: "DARK_WALLS", entityType: EntityType.FACTORY, ids: ["d1"] },
      {
        item: "LIGHT_BARREL",
        entityType: EntityType.RUM_TRUFFLE_CANNON,
        ids: ["l1"],
      },
      {
        item: "NUT_BRICKS",
        entityType: EntityType.FACTORY_EXTENSION,
        ids: ["n2", "n1"],
      },
    ]
  );
  assert.deepEqual(shelfGroups([]), []);
});

test("slotOf finds the building and slot an item is in", () => {
  const equipment = {
    [EntityType.FACTORY]: ["d1", null],
    [EntityType.RUM_TRUFFLE_CANNON]: [null, "l1"],
  };
  assert.deepEqual(slotOf("l1", equipment), {
    entityType: EntityType.RUM_TRUFFLE_CANNON,
    slot: 1,
  });
  assert.equal(slotOf("n1", equipment), null);
  assert.equal(slotOf("n1", {}), null);
});

const book = {
  recipes: [
    {
      item: "LIGHT_BARREL",
      entityType: EntityType.RUM_TRUFFLE_CANNON,
      ingredients: ["MILK", "RUM", "SUGAR"],
      amounts: { MILK: 1, RUM: 3, SUGAR: 2 },
      fee: 50,
    },
    {
      item: "NUT_BRICKS",
      entityType: EntityType.FACTORY_EXTENSION,
      ingredients: ["NUTS", "MILK"],
      amounts: { NUTS: 1, MILK: 1 },
      fee: 50,
    },
  ],
  undiscovered: {},
};

test("the salvage preview gives back half of each recipe amount, in the recipe's order", () => {
  assert.deepEqual(salvagePreview("LIGHT_BARREL", book), {
    returned: { RUM: 1, SUGAR: 1 },
    rows: [
      { ingredient: "RUM", amount: 1 },
      { ingredient: "SUGAR", amount: 1 },
    ],
  });
  assert.deepEqual(salvagePreview("NUT_BRICKS", book), {
    returned: {},
    rows: [],
  });
});

test("the salvage preview lists an ingredient the recipe names twice once", () => {
  const twice = {
    recipes: [
      {
        item: "DARK_WALLS",
        entityType: EntityType.FACTORY,
        ingredients: ["COCOA", "COCOA"],
        amounts: { COCOA: 4 },
        fee: 100,
      },
    ],
  };
  assert.deepEqual(salvagePreview("DARK_WALLS", twice), {
    returned: { COCOA: 2 },
    rows: [{ ingredient: "COCOA", amount: 2 }],
  });
});

test("the salvage preview is unavailable without the book or the recipe", () => {
  assert.deepEqual(salvagePreview("LIGHT_BARREL", undefined), {
    unavailable: "no-book",
  });
  assert.deepEqual(salvagePreview("DARK_WALLS", book), {
    unavailable: "no-recipe",
  });
});

test("the card offers equip and salvage online only, and no salvage of a minted item", () => {
  const plain = { id: "l1", item: "LIGHT_BARREL", serial: 3 };
  assert.deepEqual(cardActions({ item: plain, online: false }), {
    equip: false,
    salvage: false,
  });
  assert.deepEqual(cardActions({ item: plain, online: true }), {
    equip: true,
    salvage: true,
  });
  const minted = { ...plain, minted: { state: "minted" } };
  assert.deepEqual(cardActions({ item: minted, online: true }), {
    equip: true,
    salvage: false,
  });
  assert.deepEqual(cardActions({ item: minted, online: false }), {
    equip: false,
    salvage: false,
  });
});
