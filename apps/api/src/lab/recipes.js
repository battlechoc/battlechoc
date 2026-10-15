// The recipe table of the lab: one recipe per item, three ingredients (repeats allowed, order
// irrelevant), one of them the building's special ingredient, fixed amounts. The production
// table is private (RECIPES_FILE); the repository holds a sample for development and tests.

const fs = require('fs');
const path = require('path');
const { Items, Ingredients, SpecialIngredient } = require('@battlechoc/battlechoc-shared-functions');

const SAMPLE = path.join(__dirname, 'recipes.sample.json');

const sorted = ingredients => [...ingredients].sort();
const sameIngredients = (a, b) => sorted(a).join() === sorted(b).join();

// how many ingredients two multisets share
const shared = (a, b) => {
    const rest = [...b];
    return a.reduce((count, ingredient) => {
        const index = rest.indexOf(ingredient);
        if (index < 0) {
            return count;
        }
        rest.splice(index, 1);
        return count + 1;
    }, 0);
};

const validate = recipes => {
    const seen = new Set();
    recipes.forEach(recipe => {
        const definition = Items[recipe.item];
        const problem = message => new Error(`recipe ${recipe.item}: ${message}`);
        if (!definition) {
            throw problem('unknown item');
        }
        if (seen.has(recipe.item)) {
            throw problem('two recipes for one item');
        }
        seen.add(recipe.item);
        if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length !== 3 || !recipe.ingredients.every(id => Ingredients[id])) {
            throw problem('needs three known ingredients');
        }
        if (!recipe.ingredients.includes(SpecialIngredient[definition.entityType])) {
            throw problem('needs the special ingredient of its building');
        }
        const amountKeys = Object.keys(recipe.amounts || {}).sort();
        if (amountKeys.join() !== [...new Set(recipe.ingredients)].sort().join() ||
            !amountKeys.every(id => Number.isInteger(recipe.amounts[id]) && recipe.amounts[id] > 0)) {
            throw problem('needs a positive whole amount for each of its ingredients');
        }
    });
    recipes.forEach((a, i) => recipes.slice(i + 1).forEach(b => {
        if (Items[a.item].entityType === Items[b.item].entityType && sameIngredients(a.ingredients, b.ingredients)) {
            throw new Error(`recipes ${a.item} and ${b.item} share their ingredients`);
        }
    }));
};

/** A recipe book over a validated recipe list. */
const createRecipeBook = recipes => {
    validate(recipes);
    const entries = recipes.map(recipe => ({
        item: recipe.item,
        entityType: Items[recipe.item].entityType,
        tier: Items[recipe.item].tier,
        fee: Items[recipe.item].craftingFee,
        ingredients: sorted(recipe.ingredients),
        amounts: { ...recipe.amounts },
    }));
    const byItem = new Map(entries.map(entry => [entry.item, entry]));
    return {
        entries,
        get: item => byItem.get(item),
        forBuilding: entityType => entries.filter(entry => entry.entityType === entityType),
        /** The recipe of `entityType` with exactly these three ingredients, if any. */
        match: (entityType, ingredients) => entries.find(entry => entry.entityType === entityType && sameIngredients(entry.ingredients, ingredients)),
        /** True when two of the three ingredients belong to a recipe of the building nobody has discovered yet. */
        smells: (entityType, ingredients, discovered) => entries.some(entry =>
            entry.entityType === entityType && !discovered.has(entry.item) && shared(entry.ingredients, ingredients) >= 2),
    };
};

// The recipe table is the secret of the lab: production reads it from RECIPES_FILE (outside the
// repository) and refuses to start without it; everywhere else the public sample stands in.
const loadRecipes = (file = process.env.RECIPES_FILE, env = process.env.NODE_ENV) => {
    if (!file && env === 'production') {
        throw new Error('RECIPES_FILE must point to the private recipe table in production');
    }
    return createRecipeBook(JSON.parse(fs.readFileSync(file || SAMPLE, 'utf8')).recipes);
};

module.exports = { createRecipeBook, loadRecipes, SAMPLE };
