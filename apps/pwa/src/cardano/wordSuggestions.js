// Suggestions while a player types recovery words (the 24-word box in ConnectAccount, the check
// in RecoveryWords): the BIP-39 English words that start with the letters before the cursor.
// Every word is known by its first four letters, so a few letters usually leave one word.
import { wordlist } from "@scure/bip39/wordlists/english.js";

const LIMIT = 5;
const isLetter = (char) => /[a-z]/i.test(char);

/** The words that start with `fragment` (capitals ignored), at most five; none for a word typed in full that nothing else starts with. */
export const suggestWords = (fragment) => {
  const start = String(fragment || "").toLowerCase();
  if (start === "") {
    return [];
  }
  const words = wordlist.filter((word) => word.startsWith(start));
  if (words.length === 1 && words[0] === start) {
    return [];
  }
  return words.slice(0, LIMIT);
};

/** The word at the cursor `caret` in `text`: where it starts and ends, and its letters before the cursor (lowercase). */
export const fragmentAt = (text, caret) => {
  let start = caret;
  while (start > 0 && isLetter(text[start - 1])) {
    start -= 1;
  }
  let end = caret;
  while (end < text.length && isLetter(text[end])) {
    end += 1;
  }
  return { start, end, fragment: text.slice(start, caret).toLowerCase() };
};

/** `text` with the word at `caret` replaced by `word` and a space after it; the cursor goes behind that space. */
export const completeAt = (text, caret, word) => {
  const { start, end } = fragmentAt(text, caret);
  const rest = text.slice(end);
  const spaced = /^\s/.test(rest) ? rest : " " + rest;
  return {
    text: text.slice(0, start) + word + spaced,
    caret: start + word.length + 1,
  };
};
