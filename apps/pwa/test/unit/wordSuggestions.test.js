// Suggestions while typing recovery words (node --test): the word list's words that start with
// what the player is typing, the word at the cursor, and completing it there
// (src/cardano/wordSuggestions.js, used by ConnectAccount and RecoveryWords).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestWords,
  fragmentAt,
  completeAt,
} from "../../src/cardano/wordSuggestions.js";

test("the words that start with what is typed, at most five, ignoring capitals", () => {
  const words = suggestWords("stu");
  assert.ok(words.length > 1 && words.length <= 5);
  assert.ok(words.every((word) => word.startsWith("stu")));
  assert.ok(words.includes("stuff"));
  assert.deepEqual(suggestWords("STUD"), ["student"]);
});

test("nothing for an empty start, an unknown start, or a word typed in full that is the only match", () => {
  assert.deepEqual(suggestWords(""), []);
  assert.deepEqual(suggestWords("xyzq"), []);
  assert.deepEqual(suggestWords("student"), []);
});

test("a full word that starts longer words is offered first, with them", () => {
  const words = suggestWords("act");
  assert.equal(words[0], "act");
  assert.ok(words.includes("action"));
});

test("the word at the cursor: the letters before it, up to the end of that word", () => {
  assert.deepEqual(fragmentAt("apple ban", 9), {
    start: 6,
    end: 9,
    fragment: "ban",
  });
  assert.deepEqual(fragmentAt("apple ", 6), { start: 6, end: 6, fragment: "" });
  assert.deepEqual(fragmentAt("1. Aban", 7), {
    start: 3,
    end: 7,
    fragment: "aban",
  });
  assert.deepEqual(fragmentAt("apple banana", 8), {
    start: 6,
    end: 12,
    fragment: "ba",
  });
});

test("completing puts the word in and one space after it, with the cursor behind", () => {
  assert.deepEqual(completeAt("apple ban", 9, "banana"), {
    text: "apple banana ",
    caret: 13,
  });
  assert.deepEqual(completeAt("apple ban cat", 9, "banana"), {
    text: "apple banana cat",
    caret: 13,
  });
  assert.deepEqual(completeAt("apple bxna cat", 7, "banana"), {
    text: "apple banana cat",
    caret: 13,
  });
});
