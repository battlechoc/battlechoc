import { get, post } from "./client.js";

// The Choclab on the battlechoc API (ui/lab/Lab.jsx): each call resolves with the answer's body.

/** The recipes the player has discovered (the recipe book). */
export const fetchRecipes = () => get("/lab/recipes");

/** Tries two ingredients on a building ({ result, … }). */
export const tryIngredients = (entityType, ingredients) =>
  post("/lab/try", { entityType, ingredients });

/** Crafts the item of a discovered recipe ({ item, pantry, spoiling }). */
export const craftItem = (item) => post("/lab/craft", { item });

/** Puts an item into a building's slot (itemId null takes it out) ({ equipment, loadout }). */
export const equipItem = (entityType, slot, itemId) =>
  post("/user/equipment", { entityType, slot, itemId });
