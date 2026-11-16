import {
  Ingredients,
  salvageReturns,
  salvageRule,
  translateIn,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// What salvaging a minted item gives back, as the confirmation lists it (the owner's mockup,
// board 2, "Zerlegen?"): the rare and legendary ingredients in full, the others half (shared
// salvage.js, the server's rule), what the same item would give back unminted, and its lists in
// the player's language. No React: node tests it (test/unit/salvageRows.test.js).

// the rows' order: what comes back in full first, the rarest first; the recipe's order within
const RANK = { legendary: 0, rare: 1 };

const rarityOf = (ingredient) =>
  Ingredients[ingredient] ? Ingredients[ingredient].rarity : null;

/**
 * The rows for a recipe's `amounts` ({ ingredient: n }, in the recipe's order), salvaged
 * `minted` or not: [{ ingredient, amount, rule: "full" | "half", rarity }], rows whose amount is
 * 0 left out; the rows that come back in full first (legendary, then rare), then the halved
 * ones, each in the recipe's order.
 */
export const salvageRows = (amounts, { minted = false } = {}) => {
  const returned = salvageReturns(amounts || {}, { minted });
  return Object.keys(amounts || {})
    .filter((ingredient) => returned[ingredient] > 0)
    .map((ingredient, index) => ({
      ingredient,
      amount: returned[ingredient],
      rule: salvageRule(ingredient, { minted }),
      rarity: rarityOf(ingredient),
      index,
    }))
    .sort((a, b) => {
      const rank = (row) => (row.rule === "full" ? (RANK[row.rarity] ?? 2) : 3);
      return rank(a) - rank(b) || a.index - b.index;
    })
    .map(({ index, ...row }) => row);
};

/** What the same item gives back when it is not minted: { ingredient: n } (none of 0). */
export const plainComparison = (amounts) => salvageReturns(amounts || {});

/**
 * The plain amounts of the ingredients that a minted item gives back in full (`rows`,
 * salvageRows'), for "A plain item would give back only …": [{ ingredient, amount }] in the
 * rows' order, those a plain item gives none of left out (the list is then empty).
 */
export const plainOfFull = (rows, amounts) => {
  const plain = plainComparison(amounts);
  return rows
    .filter((row) => row.rule === "full" && plain[row.ingredient] > 0)
    .map((row) => ({
      ingredient: row.ingredient,
      amount: plain[row.ingredient],
    }));
};

/**
 * The ingredients a minted item gives back in full (`rows`, salvageRows') that a plain item gives
 * none of, for "There would be no … at all.": their ids in the rows' order.
 */
export const plainMissing = (rows, amounts) => {
  const plain = plainComparison(amounts);
  return rows
    .filter((row) => row.rule === "full" && !(plain[row.ingredient] > 0))
    .map((row) => row.ingredient);
};

/**
 * `words` as one list in `language`: "Vanilla and Gold leaf" (`type` "conjunction"), "Gold leaf
 * or Cinnamon" ("disjunction"); joined by commas where the browser cannot.
 */
export const listed = (words, language, type = "conjunction") => {
  try {
    return new Intl.ListFormat(language, { style: "long", type }).format(words);
  } catch {
    return words.join(", ");
  }
};

/** An ingredient's name in `language`. */
export const ingredientName = (ingredient, language) =>
  translateIn(language, tr[`INGREDIENT_${ingredient}`]);

/**
 * Amounts of ingredients ([{ ingredient, amount }]) as one list in `language`: "1 Vanilla and 2
 * Milk" (each as SALVAGE_COUNTED writes it; Japanese "バニラ1個、ミルク2個").
 */
export const countedList = (entries, language) =>
  listed(
    entries.map(({ ingredient, amount }) =>
      translateIn(
        language,
        tr.SALVAGE_COUNTED,
        amount,
        ingredientName(ingredient, language)
      )
    ),
    language
  );

/**
 * The ingredients a plain item gives none of (plainMissing's ids) as one list in `language`,
 * joined with "or" ("There would be no Gold leaf or Cinnamon at all.").
 */
export const missingList = (ingredients, language) =>
  listed(
    ingredients.map((ingredient) => ingredientName(ingredient, language)),
    language,
    "disjunction"
  );
