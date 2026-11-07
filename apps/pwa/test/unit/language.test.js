// The game's language for a stored code or a browser tag (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameLanguage } from "../../src/helper/language.js";

test("browser tags and the old country codes give the game's language, English otherwise", () => {
  assert.equal(gameLanguage("ja-JP"), "ja");
  assert.equal(gameLanguage("vi"), "vi");
  assert.equal(gameLanguage("jp"), "ja");
  assert.equal(gameLanguage("vn"), "vi");
  assert.equal(gameLanguage("de-AT"), "de");
  assert.equal(gameLanguage("sv-SE"), "en");
  assert.equal(gameLanguage(undefined), "en");
});
