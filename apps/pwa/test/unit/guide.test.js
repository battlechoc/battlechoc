// The game's links into the guide (node --test): /guide/ (public/guide/index.html) explains
// wallets, ADA, what minting costs, selling and salvaging, in German and in English; every other
// language reads the English section (src/cardano/guide.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUIDE_ONLINE,
  GUIDE_SECTIONS,
  guideLink,
} from "../../src/cardano/guide.js";

const PAGE = readFileSync(
  new URL("../../public/guide/index.html", import.meta.url),
  "utf8"
);

test("the guide is on the website", () => {
  assert.equal(GUIDE_ONLINE, true);
  assert.equal(guideLink("ada", "de"), "/guide/#ada-de");
});

test("German reads the German section, every other language the English one", () => {
  assert.equal(guideLink("ada", "ja"), "/guide/#ada-en");
  assert.equal(guideLink("ada", "en"), "/guide/#ada-en");
  for (const language of ["es", "fr", "it", "pt", "vi"]) {
    assert.equal(guideLink("costs", language), "/guide/#costs-en");
  }
});

test("the six sections, each with its anchor on the page in both languages", () => {
  assert.deepEqual(GUIDE_SECTIONS, [
    "wallet",
    "apps",
    "ada",
    "costs",
    "selling",
    "salvage",
  ]);
  for (const section of GUIDE_SECTIONS) {
    for (const language of ["de", "en"]) {
      const link = guideLink(section, language);
      assert.equal(link, `/guide/#${section}-${language}`);
      assert.match(PAGE, new RegExp(`<h2 id="${section}-${language}"`));
    }
  }
});

test("no section: the guide from its start, in German or English", () => {
  assert.equal(guideLink(null, "de"), "/guide/#de");
  assert.equal(guideLink(null, "ja"), "/guide/#en");
  assert.match(PAGE, /<section id="de" lang="de">/);
  assert.match(PAGE, /<section id="en" lang="en">/);
});

test("a section the guide does not have is a mistake in the game's code", () => {
  assert.throws(() => guideLink("sell", "de"), /unknown guide section "sell"/);
  assert.throws(() => guideLink("", "en"), /unknown guide section ""/);
  // also while the guide is not online: the mistake shows in every build
  assert.throws(() => guideLink("faq", "en", false), /unknown guide section/);
});

test("no link while the guide is not online", () => {
  assert.equal(guideLink("wallet", "de", false), null);
  assert.equal(guideLink(null, "en", false), null);
});
