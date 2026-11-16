// The title screen's notices about minted items (node --test): which one shows next, and the
// stats without the one the player answered (src/ui/mint/notices.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EntityType } from "@battlechoc/battlechoc-shared-functions";
import {
  nextNotice,
  noticeAllowed,
  noticeButtons,
  withoutNotice,
} from "../../src/ui/mint/notices.js";

// stats.notices as GET /user answers them (apps/api, players.noticesOf): oldest first
const arrived = {
  id: "notice-arrived",
  kind: "arrived",
  item: { id: "item-new", item: "DARK_WALLS", serial: 2 },
  building: null,
  at: "2026-11-01T08:00:00.000Z",
};
const departed = {
  id: "notice-departed",
  kind: "departed",
  item: { id: "item-away", item: "HEAVY_BARREL", serial: 4 },
  building: EntityType.RUM_TRUFFLE_CANNON,
  at: "2026-11-02T08:00:00.000Z",
};

test("the oldest notice shows first, whatever order the list has", () => {
  assert.equal(nextNotice([arrived, departed]), arrived);
  assert.equal(nextNotice([departed, arrived]), arrived);
  assert.equal(nextNotice([departed]), departed);
});

test("no notices, or no list at all (an older API, stats built offline): nothing to show", () => {
  assert.equal(nextNotice([]), null);
  assert.equal(nextNotice(undefined), null);
  assert.equal(nextNotice(null), null);
});

test("notices answered in this session are skipped, the next one shows", () => {
  assert.equal(nextNotice([arrived, departed], [arrived.id]), departed);
  assert.equal(
    nextNotice([arrived, departed], new Set([arrived.id, departed.id])),
    null
  );
});

test("a notice this build cannot show (unknown kind or item, no item) is skipped", () => {
  const unknownKind = { ...arrived, id: "n1", kind: "listed" };
  const unknownItem = {
    ...arrived,
    id: "n2",
    item: { id: "x", item: "NOT_AN_ITEM", serial: 1 },
  };
  const noItem = { ...arrived, id: "n3", item: null };
  assert.equal(
    nextNotice([unknownKind, unknownItem, noItem, null, departed]),
    departed
  );
});

test("withoutNotice drops the notice by its id and keeps the rest of the stats", () => {
  const stats = {
    score: 120,
    items: [{ id: "item-new", item: "DARK_WALLS", serial: 2, minted: null }],
    notices: [arrived, departed],
  };
  const after = withoutNotice(stats, arrived.id);
  assert.deepEqual(after, { ...stats, notices: [departed] });
  assert.notEqual(after, stats);
  // the store's stats stay as they were
  assert.deepEqual(stats.notices, [arrived, departed]);
  assert.deepEqual(withoutNotice(stats, "unknown"), stats);
});

test("withoutNotice on stats without notices changes nothing", () => {
  const stats = { score: 3 };
  assert.deepEqual(withoutNotice(stats, arrived.id), { score: 3 });
});

// the title screen with the server at hand and nothing else open: a notice may show
const free = {
  marks: true,
  online: true,
  signedIn: true,
  inMatch: false,
  tutorial: false,
  firstPlay: false,
  dialogs: {
    resume: false,
    challenge: false,
    notification: false,
    highscore: false,
    info: false,
    other: false,
  },
};

test("a notice shows on the free title screen with the server at hand", () => {
  assert.equal(noticeAllowed(free), true);
});

test("no notice without the marks (the Android app, a build without a network)", () => {
  assert.equal(noticeAllowed({ ...free, marks: false }), false);
});

test("no notice offline or without the account: nothing could mark it read", () => {
  assert.equal(noticeAllowed({ ...free, online: false }), false);
  assert.equal(noticeAllowed({ ...free, signedIn: false }), false);
});

test("no notice in a match, in the tutorial or on the first-play screen", () => {
  assert.equal(noticeAllowed({ ...free, inMatch: true }), false);
  assert.equal(noticeAllowed({ ...free, tutorial: true }), false);
  assert.equal(noticeAllowed({ ...free, firstPlay: true }), false);
});

test("no notice over another dialog: each of them holds it back", () => {
  for (const name of Object.keys(free.dialogs)) {
    assert.equal(
      noticeAllowed({ ...free, dialogs: { ...free.dialogs, [name]: true } }),
      false,
      name
    );
  }
  // a dialog this list does not name yet counts too
  assert.equal(
    noticeAllowed({ ...free, dialogs: { ...free.dialogs, later: true } }),
    false
  );
  assert.equal(noticeAllowed({ ...free, dialogs: undefined }), true);
});

test("an arrival offers the Choclab only while it is open; else one button reads it", () => {
  assert.deepEqual(noticeButtons("arrived", { choclabOpen: true }), [
    "choclab",
    "later",
  ]);
  assert.deepEqual(noticeButtons("arrived", { choclabOpen: false }), ["ok"]);
  assert.deepEqual(noticeButtons("departed", { choclabOpen: true }), ["ok"]);
  assert.deepEqual(noticeButtons("departed", { choclabOpen: false }), ["ok"]);
});

test("plan E: a salvaged item's notice shows, offers the player's items while the Choclab is open, and lists what came back", async () => {
  const { returnedRows } = await import("../../src/ui/mint/notices.js");
  const salvaged = {
    id: "n-s",
    kind: "salvaged",
    item: { id: "i-4", item: "TURBO_CONVEYOR", serial: 4 },
    building: null,
    at: "2026-11-16T10:00:00.000Z",
    returned: { GOLDLEAF: 1, VANILLA: 2, MILK: 2 },
  };
  assert.equal(nextNotice([salvaged]), salvaged);
  assert.deepEqual(noticeButtons("salvaged", { choclabOpen: true }), ["shelf"]);
  assert.deepEqual(noticeButtons("salvaged", { choclabOpen: false }), ["ok"]);
  const DAY = 24 * 60 * 60 * 1000;
  assert.deepEqual(returnedRows(salvaged.returned), [
    { ingredient: "GOLDLEAF", amount: 1, keeps: 3 * DAY },
    { ingredient: "VANILLA", amount: 2, keeps: 7 * DAY },
    { ingredient: "MILK", amount: 2, keeps: null },
  ]);
  // nothing the build does not know, nothing of 0, no list at all
  assert.deepEqual(returnedRows({ UNOBTAINIUM: 3, MILK: 0 }), []);
  assert.deepEqual(returnedRows(null), []);
});

test("plan E: a salvaged item's notice with nothing returned (no recipe any more, or amounts too small to halve) says so instead of an empty list", async () => {
  const { salvagedView } = await import("../../src/ui/mint/notices.js");
  const notice = (returned) => ({
    id: "n-0",
    kind: "salvaged",
    item: { id: "i-5", item: "TURBO_CONVEYOR", serial: 5 },
    building: null,
    at: "2026-11-16T10:00:00.000Z",
    returned,
  });
  for (const returned of [{}, { MILK: 0 }, { UNOBTAINIUM: 2 }, null]) {
    assert.deepEqual(salvagedView(notice(returned)), {
      rows: [],
      heading: null,
      nothing: "SALVAGE_ARRIVED_NOTHING",
    });
  }
  // something came back: the heading and its rows, no "nothing"
  const some = salvagedView(notice({ VANILLA: 2 }));
  assert.equal(some.heading, "SALVAGE_ARRIVED_FROM");
  assert.equal(some.nothing, null);
  assert.deepEqual(
    some.rows.map((row) => [row.ingredient, row.amount]),
    [["VANILLA", 2]]
  );
});
