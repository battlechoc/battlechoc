# The lab: equipment, recipes and crafting

Design agreed with Fabian on 2026-10-15. It replaces the Choclab's building levels with equipment: every building type has two equipment slots, filled from an inventory of crafted items, within one shared loadout budget. Items are crafted on a lab table from ingredients when they match a recipe; recipes are discovered by experimenting and then public. Minting items as NFTs comes later.

## Goals

- **Fair power:** no levels any more. Every player's buildings have the same base values; equipment changes them, always with a trade-off, within the same budget for everyone.
- **A lab worth visiting:** switch between buildings, equip items in their slots, experiment on the lab table, look up the recipe book.
- **Discovery that is exciting but not blind:** three bowls, a theme rule, a smell hint, free tries.
- **Server authority:** inventory, recipes, crafting and loadouts live on the server; online matches use the loadout from the database.

## Non-goals

- Minting, trading or salvaging items (season layer).
- Recipe fragments as drops (the hint mechanism exists through the smell; fragments come later).
- Showing the opponent's equipment.
- Final art: icons and the lab background are SVG placeholders in the game's style that Fabian may replace.

## Decisions

| Topic | Decision |
| --- | --- |
| Levels | Removed. Base values are today's level-0 values. Existing levels are refunded once: the cocoa and ingredients they cost go back to the pantry, levels are reset to 0. |
| Slots | Two per building type; equipment applies to every building of that type in a match. |
| Budget | 10 points across all buildings. Common 2, rare 3, epic 5. The same item type at most once per building. |
| Recipes | One per item; three ingredients (repeats allowed, order irrelevant), the first is the building's special ingredient; fixed amounts; a cocoa fee by tier (50 / 100 / 200). |
| Discovery | Experimenting is free; a hit discovers the recipe publicly (with the first discoverer's name), a near miss smells, otherwise nothing happens. Only owned ingredients can be put on the table. At most 30 tries per hour. |
| Recipe secrecy | The production recipe table is a private JSON file read from `RECIPES_FILE`; the repository contains a sample table for development and tests. Both contain the starter recipe (below). |
| Starter kit | Finishing the tutorial gives 100 cocoa plus 4 rum, 4 sugar and 2 milk, enough for the starter recipe "Light barrel" (rum, sugar, milk), so every new player can discover and craft a first item. |
| Items | Instances with an owner, a serial number per item type (edition #1, #2 …) and the crafter. |
| Matches | Each player's loadout (item types per building) is part of the match. Online: from the database. Offline: from the cached stats. AI players: none. The opponent's view does not include it. |

## Items (first set)

| Key | Building | Tier | Effect | Trade-off |
| --- | --- | --- | --- | --- |
| DARK_WALLS | factory | rare | hp ×1.3 | build interval ×1.1 |
| TURBO_CONVEYOR | factory | epic | build interval ×0.85 | build capacity −1 |
| NUT_BRICKS | extension | common | hp ×1.25 | cost ×1.2 |
| SECOND_SHIFT | extension | rare | build interval ×0.85 | hp ×0.8 |
| SUGAR_FERTILIZER | cacao tree | common | cacao ×1.2 | hp ×0.75 |
| DEEP_ROOTS | cacao tree | common | hp ×1.3 | cacao ×0.9 |
| HEAVY_BARREL | truffle cannon | rare | damage ×1.25 | reload ×1.3 |
| LIGHT_BARREL | truffle cannon | common | reload ×0.8 | damage ×0.85 |
| CHERRY_BOMB | fruit cannon | rare | damage against buildings ×1.3 | reload ×1.2 |
| JUICY_RELOAD | fruit cannon | common | rush cost ×0.7 | damage ×0.85 |
| MARZIPAN_CARROTS | Easter bunny | rare | reload ×0.8 | hp ×0.75 |
| LONG_EARS | Easter bunny | epic | rush from 40 % instead of 50 % | rush cost ×1.3 |
| CINNAMON_LURE | Xmas factory | rare | hp ×1.3 | cost ×1.25 |
| HOT_BOILER | ballista | epic | reload ×0.8 | hp ×0.75 |
| THICK_SHIELD | fountain | rare | hp ×1.3 | cost ×1.25 |
| WIDE_SPRAY | fountain | epic | damage through the shield ×0.7 | hp ×0.8 |
| SPRINKLE_SORTER | donut factory | rare | donut interval ×0.8 | hp ×0.75 |
| GLAZED_OVEN | donut factory | epic | donut chance +0.1 (at most 0.999) | cost ×1.25 |

Every value is rounded the way the engine rounds today (hp, costs, intervals and rush costs to whole numbers, at least 1).

## Lab table rules

- Bowl 1 holds the selected building's special ingredient (fixed). Bowls 2 and 3 take any ingredient the player owns at least one of.
- **Try** (server): the sorted three ingredients are compared with the recipes of that building.
  - **Hit:** the recipe is returned with amounts and fee; if nobody had discovered it, the player becomes its discoverer.
  - **Smell:** no hit, but two of the three ingredients (as a multiset, the special one included) are part of a recipe of this building that nobody has discovered yet.
  - **Nothing** otherwise.
- **Craft** (server, needs a discovered recipe): takes the amounts and the fee from the pantry (spoiling batches first), creates an item instance with the next serial number.
- **Equip** (server): slot 0 or 1 of a building type gets an owned item of that building type or is emptied; refused when it breaks the budget or puts the same item type twice on one building. An item instance is in at most one slot.

## Interface

The Choclab page becomes the lab:

- **Top bar:** back, the cocoa counter (opens the pantry), the recipe book (📖).
- **Centre:** the 3D building on its pedestal with the existing carousel; its name; two **equipment slots** beside it; the **budget bar** (used / 10).
- **Bottom:** the **lab table** with three bowls (the first fixed), the shelf of owned ingredients as jars, **Try** and **Craft**.
- **Equipment slot:** empty slots show "+" and invite a tap; a filled slot shows the item icon, its tier and name. Tapping opens the **inventory picker**: items for this building with effect (green) and trade-off (red), points and serial; items that would break the budget or are already on this building are disabled with the reason; "Remove" empties the slot.
- **Try feedback:** hit → the recipe card appears ("Discovered!" plus "first discoverer" when it applies); smell → steam over the table and a hint text; nothing → a short shake of the bowls and a text. Animations respect reduced motion.
- **Craft:** shows the full cost (ingredients and cocoa), missing amounts in red, and is disabled with a reason until everything is there; afterwards the new item is offered for equipping right away.
- **Recipe book:** per building, discovered recipes (ingredients, amounts, fee, discoverer) and how many are still undiscovered.
- **Offline:** everything is visible from the cache; trying, crafting and equipping are disabled with a hint.
- **Phones (portrait):** the building and slots on top, the table and shelf below; every control at least 44 px.
- **Item icons:** the building's icon in a frame coloured by tier, with a small badge for the effect (hit points, speed, damage, cocoa, cost, shield, donut).

## Technical design

### Shared package

- `equipment.js`: `Items`, `Tier` (points, crafting fee), `LOADOUT_BUDGET` (10), `SLOTS_PER_BUILDING` (2), `sanitizeLoadout(loadout)` (drops unknown items, wrong buildings, duplicates and anything over the budget), `itemModifiers(loadout, entityType)`, `applyStat(loadout, entityType, stat, base)`.
- Engine: `createMatch` takes `players[].loadout` and stores the sanitized loadout per player; levels are ignored; every building value is `applyStat(loadout, type, stat, value at level 0)`. Weapons store their resolved cooldown, damage factor, rush cost and rush start when they are created; `weaponStatus` reads them. The view does not expose loadouts.
- `progression.js`: the Choclab costs stay only for the refund (`levelRefund(levels)`).
- Translations: item names, stat names, the lab texts, in all 8 languages.

### API

- Migration `004_lab` (a JavaScript migration, so the refund can use `choclabCost`): `players.equipment` (JSONB, slots of item ids), `items`, `item_serials`, `recipe_discoveries`; refund of levels.
- `lab/recipes.js`: loads the recipe table (`RECIPES_FILE` or the sample), validates it against `Items` and `SpecialIngredient`.
- Routes: `POST /lab/try`, `POST /lab/craft`, `GET /lab/recipes`, `GET /user/items`, `POST /user/equipment`; `/update/level` is removed. Stats include `items`, `equipment` and `loadout`.
- Live matches: `playerSetup` adds the loadout from the database.

### PWA

- `ui/lab/`: `Lab.jsx`, `EquipmentSlot.jsx`, `BudgetBar.jsx`, `LabTable.jsx`, `Shelf.jsx`, `InventoryPicker.jsx`, `RecipeBook.jsx`, `ItemIcon.jsx`, `itemText.js`.
- Local matches pass the cached loadout to the engine.

## Tests

- Shared: every item's effects in a match (hp, cost, production, build slots, reload, damage, fruit factor, rush, shield, donuts), sanitizing, budget, no level influence.
- API: try (hit, first discoverer, smell, nothing, owned ingredients only, rate limit), craft (fee, amounts, serials, not before discovery), equip (ownership, building, budget, duplicates, emptying), the refund migration, the starter kit, online matches with the loadout.
- e2e: a new player discovers the starter recipe in the lab, crafts it, equips it, and a local match uses it.
