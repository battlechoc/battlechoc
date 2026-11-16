// The public item page's content (node --test): what GET /items/:assetName answered as the texts
// and the icon's parts the page shows, which answers it trusts, and which `a` it asks the API for
// at all (src/itempage/view.js). The texts follow the current language, the date the language
// given, in the reader's own time zone.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  Items,
  setCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  isAssetName,
  itemPageView,
  readAnswer,
} from "../../src/itempage/view.js";
import {
  ICON_LOOK,
  TIER_COLORS,
  effectLines,
  iconPartsOf,
} from "../../src/ui/lab/itemText.js";

// every language's texts, as the server registers them
createRequire(import.meta.url)(
  "@battlechoc/battlechoc-shared-functions/i18n/all"
);

const NAME = `000de140${"3f9c".repeat(14)}`;
const MINTED_AT = Date.UTC(2026, 10, 14, 12);
// the day as the page writes it: in the reader's time zone (here the test's), never a time of day
const dayIn = (language) =>
  new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(
    new Date(MINTED_AT)
  );

// the API's answers as Task 2 captured them (apps/api, routes/items.js)
const minted = () => ({
  assetName: NAME,
  item: "TURBO_CONVEYOR",
  entityType: "EntityType.FACTORY",
  tier: "EPIC",
  points: 5,
  serial: 4,
  mintedAt: MINTED_AT,
  burnedAt: null,
  effects: [
    { stat: "buildIntervalMs", factor: 0.85 },
    { stat: "buildCapacity", add: -1 },
  ],
});
const salvaged = () => ({
  ...minted(),
  item: "LIGHT_BARREL",
  entityType: "EntityType.RUM_TRUFFLE_CANNON",
  tier: "COMMON",
  points: 2,
  serial: 12,
  burnedAt: MINTED_AT + 86400000,
  effects: [
    { stat: "cooldownMs", factor: 0.8 },
    { stat: "damage", factor: 0.85 },
  ],
});

beforeEach(() => setCurrentLanguage("en"));

test("a minted item in German: its name, serial, tier, points and the day it was minted", () => {
  setCurrentLanguage("de");
  const view = itemPageView(minted(), { language: "de" });
  assert.equal(view.state, "item");
  assert.equal(view.title, "Turbo-Förderband");
  // the serial keeps its no-break space (ITEM_SERIAL): "Nr. 4" never breaks
  assert.equal(t(tr.ITEM_SERIAL, 4), "Nr.\u00a04");
  assert.deepEqual(view.facts, ["Nr.\u00a04", "Episch", "5 Punkte"]);
  assert.equal(view.mintedOn, `geprägt am ${dayIn("de")}`);
  assert.equal(view.tag, "Nr.\u00a04");
  assert.equal(view.building, "Gehört an: Schokoladenfabrik");
  assert.deepEqual(view.effects, effectLines("TURBO_CONVEYOR"));
  assert.equal(view.effects.length, 2);
});

test("the icon is drawn from the game's own parts, never from the token's picture", () => {
  const view = itemPageView(minted(), { language: "en" });
  assert.deepEqual(view.icon, iconPartsOf("TURBO_CONVEYOR"));
  assert.deepEqual(view.icon, {
    face: ICON_LOOK.face(TIER_COLORS.EPIC),
    tier: TIER_COLORS.EPIC,
    building: "/images/factory-icon.svg",
    badge: "/images/lab/badge-speed.svg",
  });
  assert.equal(Object.hasOwn(view, "picture"), false);
});

test("in English and Japanese; the date in the language given (the texts follow the current one)", () => {
  const view = itemPageView(minted(), { language: "en" });
  assert.deepEqual(view.facts, ["No.\u00a04", "Epic", "5 points"]);
  assert.equal(view.mintedOn, `minted on ${dayIn("en")}`);
  assert.equal(view.building, "Goes on: Factory");
  setCurrentLanguage("ja");
  const japanese = itemPageView(minted(), { language: "ja" });
  assert.equal(japanese.title, "ターボコンベア");
  assert.equal(japanese.mintedOn, `${dayIn("ja")}にミント`);
});

test("the effects are the API's (today's balance on the server), not the bundle's", () => {
  const rebalanced = {
    ...minted(),
    effects: [
      { stat: "buildIntervalMs", factor: 0.7 },
      { stat: "hp", factor: 0.9 },
    ],
  };
  const view = itemPageView(rebalanced, { language: "en" });
  assert.deepEqual(view.effects, [
    { text: `−30 % ${t(tr.STAT_buildIntervalMs)}`, good: true },
    { text: `−10 % ${t(tr.STAT_hp)}`, good: false },
  ]);
  assert.notDeepEqual(view.effects, effectLines("TURBO_CONVEYOR"));
  // the bundle's own default is unchanged
  assert.deepEqual(
    effectLines("TURBO_CONVEYOR"),
    effectLines("TURBO_CONVEYOR", Items.TURBO_CONVEYOR.effects)
  );
});

test("a newer API than this page: an effect it cannot word is left out, a tier it does not know is not named", () => {
  const newer = {
    ...minted(),
    tier: "LEGENDARY",
    effects: [
      { stat: "buildIntervalMs", factor: 0.85 },
      { stat: "teleportRange", add: 2 },
      { stat: "hp" },
      null,
      { stat: "buildCapacity", add: -1 },
    ],
  };
  const outcome = readAnswer(200, newer);
  assert.equal(outcome.kind, "item");
  const view = itemPageView(outcome.answer, { language: "en" });
  assert.deepEqual(view.facts, ["No.\u00a04", "5 points"]);
  assert.deepEqual(
    view.effects,
    effectLines("TURBO_CONVEYOR", Items.TURBO_CONVEYOR.effects)
  );
});

test("a salvaged item: still its name and what it was, the state says it is gone", () => {
  const view = itemPageView(salvaged(), { language: "en" });
  assert.equal(view.state, "salvaged");
  assert.equal(view.title, "Light barrel");
  assert.deepEqual(view.facts, ["No.\u00a012", "Common", "2 points"]);
  assert.equal(view.icon.building, "/images/truffle-cannon-icon.svg");
  assert.equal(view.effects.length, 2);
});

test("no answer: an unknown item", () => {
  assert.deepEqual(itemPageView(null, { language: "en" }), {
    state: "unknown",
  });
});

test("which answers the page trusts: an item, an unknown one, or could not load", () => {
  assert.deepEqual(readAnswer(200, minted()), {
    kind: "item",
    answer: minted(),
  });
  assert.deepEqual(readAnswer(200, salvaged()).kind, "item");
  // the API's one answer for a name that is no minted item
  assert.deepEqual(readAnswer(404, { error: "UNKNOWN ITEM" }), {
    kind: "unknown",
  });
  // everything else says nothing about the item: never "there is no such item"
  const unavailable = [
    [404, { error: "NOT FOUND" }],
    [404, ""],
    [429, { error: "TOO MANY REQUESTS" }],
    [500, { error: "INTERNAL SERVER ERROR" }],
    [502, "<html>Bad Gateway</html>"],
    [undefined, undefined],
    [200, "not json"],
    [200, null],
    // an item this page cannot draw or name (a newer API): no name, no icon
    [200, { ...minted(), item: "BRAND_NEW_THING" }],
    [200, { ...minted(), item: "constructor" }],
    [200, { ...minted(), item: "../../etc/passwd" }],
    [200, { ...minted(), tier: 3 }],
    [200, { ...minted(), serial: "4" }],
    [200, { ...minted(), mintedAt: null }],
    // beyond what a Date can hold: Intl would throw
    [200, { ...minted(), mintedAt: 8.64e15 + 1 }],
    [200, { ...minted(), burnedAt: "yesterday" }],
    [200, { ...minted(), effects: null }],
    [200, { ...minted(), entityType: 7 }],
  ];
  for (const [status, body] of unavailable) {
    assert.deepEqual(
      readAnswer(status, body),
      { kind: "unavailable" },
      `${status} ${JSON.stringify(body)}`
    );
  }
});

test("only a user token's name is ever asked for: the API's own format check", () => {
  assert.equal(isAssetName(NAME), true);
  const refused = [
    undefined,
    null,
    "",
    ["000de140"],
    NAME.toUpperCase(),
    NAME.slice(0, -1),
    `${NAME}0`,
    `000643b0${NAME.slice(8)}`,
    NAME.slice(8),
    `${NAME}\n`,
    ` ${NAME}`,
    `${NAME.slice(0, -1)}g`,
    "<script>alert(1)</script>",
    `${NAME}/../../user`,
    `${NAME}?x=1`,
  ];
  for (const value of refused) {
    assert.equal(isAssetName(value), false, JSON.stringify(value));
  }
});
