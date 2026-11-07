// The game's language codes as language tags for the browser: jp and vn are not tags (a later
// change renames the codes), the rest are.
const LANGUAGE_TAGS = { jp: "ja", vn: "vi" };

const languageTag = (code) => LANGUAGE_TAGS[code] || code;

/**
 * Tells the browser the page's language (index.html starts with "en"): translation offers,
 * screen readers and hyphenation go by it.
 */
const setDocumentLanguage = (code) => {
  document.documentElement.lang = languageTag(code);
};

export { languageTag, setDocumentLanguage };
