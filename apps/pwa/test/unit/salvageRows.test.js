// What salvaging a minted item gives back, as its confirmation lists it (plan E, node --test):
// the rare and legendary ingredients in full, the others half, and what a plain item would give.
import { test } from "node:test";
import assert from "node:assert/strict";
import "@battlechoc/battlechoc-shared-functions/i18n/all";
import shared from "@battlechoc/battlechoc-shared-functions";
import {
  countedList,
  missingList,
  plainComparison,
  plainOfFull,
  salvageRows,
} from "../../src/ui/mint/salvageRows.js";

// the turbo conveyor's recipe (apps/api/src/lab/recipes.sample.json), in its order
const TURBO = { MILK: 5, VANILLA: 2, GOLDLEAF: 1 };

test("a minted turbo conveyor: the legendary and the rare one in full, first, then the milk halved", () => {
  assert.deepEqual(salvageRows(TURBO, { minted: true }), [
    { ingredient: "GOLDLEAF", amount: 1, rule: "full", rarity: "legendary" },
    { ingredient: "VANILLA", amount: 2, rule: "full", rarity: "rare" },
    { ingredient: "MILK", amount: 2, rule: "half", rarity: "common" },
  ]);
});

test("unminted, the same recipe halves everything and leaves out what comes to 0", () => {
  assert.deepEqual(salvageRows(TURBO), [
    { ingredient: "MILK", amount: 2, rule: "half", rarity: "common" },
    { ingredient: "VANILLA", amount: 1, rule: "half", rarity: "rare" },
  ]);
  assert.deepEqual(plainComparison(TURBO), { MILK: 2, VANILLA: 1 });
});

test("the comparison names what a plain item gives of the ingredients that come back in full", () => {
  const rows = salvageRows(TURBO, { minted: true });
  assert.deepEqual(plainOfFull(rows, TURBO), [
    { ingredient: "VANILLA", amount: 1 },
  ]);
  // only a legendary one of 1: a plain item gives none of it
  const one = { GOLDLEAF: 1, MILK: 4 };
  assert.deepEqual(plainOfFull(salvageRows(one, { minted: true }), one), []);
  // no rare or legendary ingredient: nothing to compare
  const common = { MILK: 4, SUGAR: 3 };
  const commonRows = salvageRows(common, { minted: true });
  assert.equal(
    commonRows.some((row) => row.rule === "full"),
    false
  );
  assert.deepEqual(plainOfFull(commonRows, common), []);
});

test("no recipe amounts: no rows", () => {
  assert.deepEqual(salvageRows(undefined, { minted: true }), []);
  assert.deepEqual(plainComparison(null), {});
});

test("burnChange: the wallet gets the item's locked ADA less the network fee; the ADA beside the token is only free again", async () => {
  const { burnChange } = await import("../../src/ui/mint/ada.js");
  assert.deepEqual(
    burnChange({
      networkFee: 368106,
      gameFee: null,
      deposit: 3710910,
      deposits: { reference: 2448080, user: 1262830 },
    }),
    {
      back: "2448080",
      fee: "368106",
      net: "2079974",
      gain: true,
      free: "1262830",
    }
  );
  // a fee larger than what comes back: the wallet gives the difference
  assert.deepEqual(
    burnChange({ networkFee: "3000000", deposits: { reference: "2000000" } }),
    { back: "2000000", fee: "3000000", net: "1000000", gain: false, free: null }
  );
  // an older server without the parts: nothing to show
  assert.equal(burnChange({ networkFee: 1, deposit: 2 }), null);
});

test("the ingredients a minted item gives back in full and a plain one gives none of (the comparison's second sentence)", async () => {
  const { plainMissing } = await import("../../src/ui/mint/salvageRows.js");
  const rows = salvageRows(TURBO, { minted: true });
  assert.deepEqual(plainMissing(rows, TURBO), ["GOLDLEAF"]);
  const two = { GOLDLEAF: 1, VANILLA: 1, MILK: 4 };
  assert.deepEqual(plainMissing(salvageRows(two, { minted: true }), two), [
    "GOLDLEAF",
    "VANILLA",
  ]);
  const plenty = { VANILLA: 4, MILK: 4 };
  assert.deepEqual(
    plainMissing(salvageRows(plenty, { minted: true }), plenty),
    []
  );
});

test("amounts of ingredients in a list, as each language writes them (SALVAGE_COUNTED): Japanese with its counter, no text of its own in the code", () => {
  const one = [{ ingredient: "VANILLA", amount: 1 }];
  const two = [...one, { ingredient: "MILK", amount: 2 }];
  assert.equal(countedList(one, "en"), "1 Vanilla");
  assert.equal(countedList(two, "en"), "1 Vanilla and 2 Milk");
  assert.equal(countedList(two, "de"), "1 Vanille und 2 Milch");
  assert.equal(countedList(one, "ja"), "バニラ1個");
  assert.equal(countedList(two, "ja"), "バニラ1個、ミルク2個");
  assert.equal(countedList(two, "vi"), "1 Vani và 2 Sữa");
});

test("the ingredients a plain item gives none of join with 'or': each language's sentence reads right with one name and with two", () => {
  const { translateIn, translationKeys: tr } = shared;
  const sentence = (language, ingredients) =>
    translateIn(
      language,
      tr.SALVAGE_MINTED_COMPARE_MISSING,
      missingList(ingredients, language)
    );
  const two = ["GOLDLEAF", "CINNAMON"];
  assert.equal(
    sentence("en", two),
    "There would be no Gold leaf or Cinnamon at all."
  );
  assert.equal(
    sentence("en", ["GOLDLEAF"]),
    "There would be no Gold leaf at all."
  );
  const expected = {
    de: [
      "Blattgold gäbe es gar nicht.",
      "Blattgold oder Zimt gäbe es gar nicht.",
    ],
    es: [
      "Y nada en absoluto de: Pan de oro.",
      "Y nada en absoluto de: Pan de oro o Canela.",
    ],
    fr: [
      "Et rien du tout pour : Feuille d’or.",
      "Et rien du tout pour : Feuille d’or ou Cannelle.",
    ],
    it: [
      "E proprio niente di: Foglia d’oro.",
      "E proprio niente di: Foglia d’oro o Cannella.",
    ],
    pt: [
      "E nada mesmo de: Folha de ouro.",
      "E nada mesmo de: Folha de ouro ou Canela.",
    ],
    ja: [
      "金箔はまったく戻りません。",
      "金箔またはシナモンはまったく戻りません。",
    ],
    vi: [
      "Còn Lá vàng thì hoàn toàn không có.",
      "Còn Lá vàng hoặc Quế thì hoàn toàn không có.",
    ],
  };
  for (const [language, [one, both]] of Object.entries(expected)) {
    assert.equal(sentence(language, ["GOLDLEAF"]), one, language);
    assert.equal(sentence(language, two), both, language);
  }
});
