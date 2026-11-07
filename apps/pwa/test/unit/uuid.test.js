// The ids of the game (node --test): crypto.randomUUID where it exists, and the same shape from
// crypto.getRandomValues where it does not (plain http on a LAN address is no secure context).
import { test } from "node:test";
import assert from "node:assert/strict";
import { uuid } from "../../src/helper/uuid.js";

const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("gives a version 4 uuid, another one each time", () => {
  const first = uuid();
  assert.match(first, V4);
  assert.notEqual(uuid(), first);
});

test("without crypto.randomUUID it builds one from random bytes", () => {
  const randomUUID = crypto.randomUUID;
  // as in a page that is no secure context
  crypto.randomUUID = undefined;
  try {
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    assert.equal(ids.size, 200);
    for (const id of ids) {
      assert.match(id, V4);
    }
  } finally {
    crypto.randomUUID = randomUUID;
  }
});
