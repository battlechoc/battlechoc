import { expect } from "@playwright/test";
import { createRequire } from "node:module";
import { api, ok } from "./players.js";

// The Choclab for the tests: in the game (the lab, its buildings) and through the API (the pantry
// stocked by the test server's POST /test/pantry, an item discovered, crafted and equipped as the
// lab table and the slot do it). The test API uses the sample recipes
// (apps/api/src/lab/recipes.sample.json).

const require = createRequire(import.meta.url);
const {
  Items,
  SpecialIngredient,
} = require("@battlechoc/battlechoc-shared-functions");
const {
  recipes: RECIPES,
} = require("../../../api/src/lab/recipes.sample.json");

/** Opens the Choclab from the title screen. */
export const openChoclab = async (page) => {
  await page.getByText("Choclab", { exact: true }).first().click();
  await expect(page.getByTestId("lab")).toBeVisible();
};

/** Steps the open lab forward to the building `name` (as the lab names it, e.g. "Rum truffle cannon"). */
export const chooseBuilding = async (page, name) => {
  for (let i = 0; i < 10; i++) {
    if ((await page.getByTestId("lab-building").innerText()).trim() === name) {
      return;
    }
    await page.locator("[data-testid=lab] [data-icon=forward]").first().click();
  }
  throw new Error(`building ${name} not found`);
};

/** Ingredients as a won match may drop them ([{ ingredient, amount }]) into `username`'s pantry. */
export const stock = async (request, username, items) =>
  ok(await request.post(`${api}/test/pantry`, { data: { username, items } }));

/**
 * One item of the tier (shared TIER_ORDER), crafted by craftItem unless a test names another: not
 * LIGHT_BARREL, which lab.spec.js discovers itself and expects to be the first.
 */
export const TIER_ITEMS = Object.freeze({
  COMMON: "SUGAR_FERTILIZER",
  RARE: "HEAVY_BARREL",
  EPIC: "TURBO_CONVEYOR",
});

/**
 * The item `item` (its key) crafted for `player` ({ username, headers }) through the API as the
 * lab table does it: its recipe's ingredients stocked, the recipe tried at its building (the
 * first player of the run discovers it, for the others the try finds it again), its cocoa fee
 * stocked, the craft. The item ({ id, item, serial, … }).
 */
export const craftItem = async (request, { username, headers }, item) => {
  const recipe = RECIPES.find((entry) => entry.item === item);
  if (!recipe) {
    throw new Error(`craftItem: no sample recipe for ${item}`);
  }
  const { entityType } = Items[item];
  await stock(
    request,
    username,
    Object.entries(recipe.amounts).map(([ingredient, amount]) => ({
      ingredient,
      amount,
    }))
  );
  // the building's special ingredient is in the bowl already: the try names the other two
  const others = [...recipe.ingredients];
  others.splice(others.indexOf(SpecialIngredient[entityType]), 1);
  const tried = await ok(
    await request.post(`${api}/lab/try`, {
      headers,
      data: { entityType, ingredients: others },
    })
  );
  expect(tried.result).toBe("found");
  await stock(request, username, [
    { ingredient: "COCOA", amount: tried.recipe.fee },
  ]);
  const { item: crafted } = await ok(
    await request.post(`${api}/lab/craft`, { headers, data: { item } })
  );
  return crafted;
};

/** Equips the item `itemId` of `player` into slot `slot` of its building (the item's `item` key names it). */
export const equipItem = async (request, { headers }, { id, item }, slot = 0) =>
  ok(
    await request.post(`${api}/user/equipment`, {
      headers,
      data: { entityType: Items[item].entityType, slot, itemId: id },
    })
  );

/** The player's stats as the server has them (GET /user): items, notices, … */
export const statsOf = async (request, { headers }) =>
  (await ok(await request.get(`${api}/user`, { headers }))).stats;
