// The item shelf and card of the Choclab (node --test): how the player's items are grouped, where
// an item is equipped, what salvaging it gives back and what the card offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EntityType, Items } from "@battlechoc/battlechoc-shared-functions";
import {
  shelfGroups,
  slotOf,
  salvagePreview,
  cardActions,
  isMinted,
  groupMinted,
  withoutAwayItems,
  chipMarks,
  scrollCue,
  shelfView,
  SHELF_NAME,
  longestWord,
  tileLabel,
  shelfTileWidth,
  shelfColumns,
  SHELF_GAP,
  instanceToEquip,
  groupMark,
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
  // GET /user marks a plain item with minted: null (plan C), an older API not at all
  assert.deepEqual(
    cardActions({ item: { ...plain, minted: null }, online: true }),
    {
      equip: true,
      salvage: true,
    }
  );
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

const MINTED = { assetName: "000de140aa", state: "minted" };

test("an item is minted only with the server's mark in the minted state", () => {
  assert.equal(isMinted({ id: "a", minted: MINTED }), true);
  assert.equal(isMinted({ id: "a", minted: null }), false);
  assert.equal(isMinted({ id: "a" }), false);
  // a state this build does not know (a later plan's "minting") is no stamp yet
  assert.equal(isMinted({ id: "a", minted: { state: "minting" } }), false);
  assert.equal(isMinted(undefined), false);
});

test("a shelf tile wears the stamp only when every item of its type is minted", () => {
  const minted = (id, serial) => ({
    id,
    item: "NUT_BRICKS",
    serial,
    minted: MINTED,
  });
  const plain = (id, serial) => ({
    id,
    item: "NUT_BRICKS",
    serial,
    minted: null,
  });
  assert.equal(groupMinted([minted("a", 1), minted("b", 2)]), MINTED);
  assert.equal(groupMinted([minted("a", 1), plain("b", 2)]), null);
  assert.equal(groupMinted([plain("a", 1)]), null);
  // stats without the field (an older API, stats built offline)
  assert.equal(groupMinted([{ id: "a", item: "NUT_BRICKS", serial: 1 }]), null);
  assert.equal(groupMinted([]), null);
});

test("a slot whose item the player does not have (a minted item away from the wallet) is free", () => {
  const owned = [
    { id: "d1", item: "DARK_WALLS", serial: 2 },
    { id: "l1", item: "LIGHT_BARREL", serial: 3 },
  ];
  const equipment = {
    [EntityType.FACTORY]: ["away", "d1"],
    [EntityType.RUM_TRUFFLE_CANNON]: ["l1", null],
    [EntityType.CACAOTREE]: null,
  };
  assert.deepEqual(withoutAwayItems(equipment, owned), {
    [EntityType.FACTORY]: [null, "d1"],
    [EntityType.RUM_TRUFFLE_CANNON]: ["l1", null],
    [EntityType.CACAOTREE]: [],
  });
  // the away item's place is not the building it was on any more
  assert.equal(slotOf("away", withoutAwayItems(equipment, owned)), null);
  assert.deepEqual(withoutAwayItems({}, owned), {});
  assert.deepEqual(withoutAwayItems(equipment, []), {
    [EntityType.FACTORY]: [null, null],
    [EntityType.RUM_TRUFFLE_CANNON]: [null, null],
    [EntityType.CACAOTREE]: [],
  });
});

test("a serial chip: the chosen one is chosen, a minted one gets the mark only with the marks on", () => {
  const plain = { id: "p", serial: 3, minted: null };
  const minted = { id: "m", serial: 2, minted: MINTED };
  assert.deepEqual(chipMarks(plain, "p", true), {
    chosen: true,
    minted: false,
  });
  assert.deepEqual(chipMarks(minted, "p", true), {
    chosen: false,
    minted: true,
  });
  assert.deepEqual(chipMarks(minted, "m", true), {
    chosen: true,
    minted: true,
  });
  // the Android app: no mark, the choice stays
  assert.deepEqual(chipMarks(minted, "m", false), {
    chosen: true,
    minted: false,
  });
});

test("the shelf's scroll cue: more below until the end, more above once scrolled", () => {
  assert.deepEqual(
    scrollCue({ scrollTop: 0, scrollHeight: 300, clientHeight: 200 }),
    { above: false, below: true }
  );
  assert.deepEqual(
    scrollCue({ scrollTop: 50, scrollHeight: 300, clientHeight: 200 }),
    { above: true, below: true }
  );
  // the end, also with the half pixel a zoomed page leaves
  assert.deepEqual(
    scrollCue({ scrollTop: 99.5, scrollHeight: 300, clientHeight: 200 }),
    { above: true, below: false }
  );
  // everything fits: no cue
  assert.deepEqual(
    scrollCue({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 }),
    { above: false, below: false }
  );
});

test("the longest word of a name: CJK names break between their characters", () => {
  assert.equal(longestWord("Heißer Kakaokessel"), "Kakaokessel");
  assert.equal(longestWord("Turbo-Förderband"), "Turbo-Förderband");
  assert.equal(longestWord("ナッツブリトルのレンガ"), "");
  assert.equal(longestWord("Sugar fertilizer"), "fertilizer");
});

test("every item name's longest word in every language fits a shelf tile (no break inside a word)", () => {
  const require = createRequire(import.meta.url);
  const languages = ["en", "de", "es", "fr", "it", "ja", "pt", "vi"];
  const longest = languages
    .flatMap((language) => {
      const strings = require(
        `../../../../packages/shared/translations/${language}_strings.js`
      );
      return Object.keys(Items).map((item) =>
        longestWord(strings[`ITEM_${item}`])
      );
    })
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  // German "Streuselsortierer" as of 2026-11-15; a longer name needs wider tiles (SHELF_NAME)
  assert.ok(
    longest.length <= SHELF_NAME.wordChars,
    `${longest} has ${longest.length} letters, the tiles fit ${SHELF_NAME.wordChars}`
  );
});

// tiles as the shelf measures them: their top in the box (offsetTop) and their height; rows of
// 104 px with a 9 px gap below a 3 px padding (a 390 px phone)
const grid = (rows, perRow = 2, height = 104) =>
  Array.from({ length: rows * perRow }, (_, i) => ({
    top: 3 + Math.floor(i / perRow) * (height + 9),
    height,
  }));

test("the shelf shows whole rows: up to two rows fit without scrolling", () => {
  assert.equal(shelfView(grid(1), { rows: 2 }), null);
  assert.equal(shelfView(grid(2), { rows: 2 }), null);
  assert.equal(shelfView([], { rows: 2 }), null);
});

test("more rows: the box ends a third into the next row, and only that third fades", () => {
  // the third row starts at 3 + 2 * 113 = 229; a third of its 104 px is 35
  assert.deepEqual(shelfView(grid(3), { rows: 2 }), {
    maxHeight: 264,
    fade: 35,
  });
  assert.deepEqual(shelfView(grid(5), { rows: 2 }), {
    maxHeight: 264,
    fade: 35,
  });
  // landscape (a desktop, a phone held sideways): one row and a third
  assert.deepEqual(shelfView(grid(2, 6, 127), { rows: 1 }), {
    maxHeight: 3 + 136 + 42,
    fade: 42,
  });
});

test("a short phone: fewer whole rows (and the peek) where the lab has less room, at least one", () => {
  // two rows and a third take 264 px, one row and a third 151 px (3 + 113 + 35)
  assert.deepEqual(shelfView(grid(3), { rows: 2, limit: 264 }), {
    maxHeight: 264,
    fade: 35,
  });
  assert.deepEqual(shelfView(grid(3), { rows: 2, limit: 263 }), {
    maxHeight: 151,
    fade: 35,
  });
  // not even one row and its peek: still one row and its peek (the lab scrolls)
  assert.deepEqual(shelfView(grid(3), { rows: 2, limit: 90 }), {
    maxHeight: 151,
    fade: 35,
  });
  // two rows that would all show (223 px with the padding below) but only 200 px of room
  assert.deepEqual(shelfView(grid(2), { rows: 2, limit: 200 }), {
    maxHeight: 151,
    fade: 35,
  });
  assert.equal(shelfView(grid(2), { rows: 2, limit: 223 }), null);
  assert.equal(shelfView(grid(1), { rows: 2, limit: 50 }), null);
});

test("a row is as high as its highest tile (a name on two lines); tops a pixel apart are one row", () => {
  const tiles = [
    { top: 3, height: 104 },
    { top: 3.4, height: 118 },
    { top: 130, height: 104 },
    { top: 130, height: 104 },
    { top: 243, height: 104 },
    { top: 243.3, height: 119 },
  ];
  assert.deepEqual(shelfView(tiles, { rows: 2 }), {
    maxHeight: 243 + 40,
    fade: 40,
  });
});

test("a shelf tile's label: the name with its serial or count, and 'minted' when it wears the ring", () => {
  const barrel = (id, serial, state) => ({
    id,
    item: "HEAVY_BARREL",
    serial,
    minted: state ? { assetName: `name-${id}`, state } : null,
  });
  const name = "Heavy rum barrel";
  assert.equal(
    tileLabel("HEAVY_BARREL", [barrel("a", 4)], false),
    `${name} (No.\u00a04)`
  );
  assert.equal(
    tileLabel("HEAVY_BARREL", [barrel("a", 4, "minted")], true),
    `${name}, minted, No.\u00a04`
  );
  assert.equal(
    tileLabel("HEAVY_BARREL", [barrel("a", 4), barrel("b", 2)], false),
    `${name} (× 2)`
  );
  assert.equal(
    tileLabel(
      "HEAVY_BARREL",
      [barrel("a", 4, "minted"), barrel("b", 2, "minted")],
      true
    ),
    `${name}, all minted, × 2`
  );
});

test("the shelf's columns: tiles as wide as the longest word, but two columns on the narrowest phones", () => {
  assert.equal(shelfTileWidth(), "8.8em");
  // a tile is at most half the row (less half the gap), so two always fit side by side; there
  // a long name hyphenates at its syllables
  assert.equal(
    shelfColumns(),
    "repeat(auto-fill, minmax(min(8.8em, calc(50% - 0.3em)), 1fr))"
  );
  assert.equal(SHELF_GAP, "0.6em");
});

test("equipping from the card puts in the copy the card has chosen, not any free one", () => {
  const plain = { id: "p1", item: "NUT_BRICKS", serial: 4, minted: null };
  const minted = {
    id: "m1",
    item: "NUT_BRICKS",
    serial: 7,
    minted: { state: "minted", assetName: "aa" },
  };
  const instances = [minted, plain];
  // the card chose the plain one: that one, though the minted one is free and newer
  assert.equal(instanceToEquip(instances, new Set(), "p1"), plain);
  assert.equal(instanceToEquip(instances, new Set(), "m1"), minted);
  // the chosen one is equipped elsewhere already: it moves (the server takes it off there)
  assert.equal(instanceToEquip(instances, new Set(["p1"]), "p1"), plain);
  // without a choice (the picker on its own): a free one first, else the first
  assert.equal(instanceToEquip(instances, new Set(["m1"])), plain);
  assert.equal(instanceToEquip(instances, new Set(["m1", "p1"])), minted);
  // a choice that is not among them (another type's) does not count
  assert.equal(instanceToEquip(instances, new Set(["m1"]), "x9"), plain);
});

test("a shelf tile wears the stamp when every copy is minted, else the minting rim while one is minted", () => {
  const minted = (id) => ({ id, minted: { state: "minted", assetName: id } });
  const minting = { id: "g", minted: { state: "minting", operationId: "op" } };
  const plain = { id: "p", minted: null };
  assert.deepEqual(groupMark([minted("a"), minted("b")]), minted("a").minted);
  assert.equal(groupMark([plain, minting]), minting.minted);
  assert.equal(groupMark([minted("a"), minting]), minting.minted);
  assert.equal(groupMark([plain, minted("a")]), null);
  // a state this build does not know: plain
  assert.equal(groupMark([{ id: "x", minted: { state: "burning" } }]), null);
});
