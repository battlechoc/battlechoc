// The page's language tag (node --test): the game's codes, with jp and vn as the tags ja and vi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { languageTag } from "../../src/helper/language.js";

test("jp and vn become language tags, the others stay", () => {
  assert.equal(languageTag("jp"), "ja");
  assert.equal(languageTag("vn"), "vi");
  for (const code of ["en", "de", "es", "fr", "it", "pt"]) {
    assert.equal(languageTag(code), code);
  }
});
