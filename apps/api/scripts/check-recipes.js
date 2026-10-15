// Checks a private recipe table before deploying it: it must be valid and share no ingredient set
// with the public sample except the starter recipe (otherwise the repository gives recipes away).
// Prints counts only, never recipes. Usage: node scripts/check-recipes.js /path/to/recipes.json
const fs = require('fs');
const { Items } = require('@battlechoc/battlechoc-shared-functions');
const { createRecipeBook, SAMPLE } = require('../src/lab/recipes');

const STARTER = 'LIGHT_BARREL';
const file = process.argv[2];
if (!file) {
    console.error('usage: node scripts/check-recipes.js /path/to/recipes.json');
    process.exit(2);
}
const book = createRecipeBook(JSON.parse(fs.readFileSync(file, 'utf8')).recipes);
const sample = createRecipeBook(JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).recipes);
const leaked = book.entries.filter(entry => entry.item !== STARTER &&
    sample.match(Items[entry.item].entityType, entry.ingredients)).length;
console.log(`${book.entries.length} recipes, ${leaked} share their ingredients with the public sample`);
process.exit(leaked === 0 ? 0 : 1);
