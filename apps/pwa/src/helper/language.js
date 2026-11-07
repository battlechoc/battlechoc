import {
  getDefaultLanguage,
  hasTranslations,
  normalizeLanguage,
  registerTranslations,
  setCurrentLanguage,
} from "@battlechoc/battlechoc-shared-functions";

// The texts of every language but English come as a chunk of their own: the game loads the one
// its player reads. The service worker precaches all of them, so a switch works offline too.
const LOADERS = {
  de: () => import("@battlechoc/battlechoc-shared-functions/translations/de"),
  ja: () => import("@battlechoc/battlechoc-shared-functions/translations/ja"),
  es: () => import("@battlechoc/battlechoc-shared-functions/translations/es"),
  fr: () => import("@battlechoc/battlechoc-shared-functions/translations/fr"),
  it: () => import("@battlechoc/battlechoc-shared-functions/translations/it"),
  pt: () => import("@battlechoc/battlechoc-shared-functions/translations/pt"),
  vi: () => import("@battlechoc/battlechoc-shared-functions/translations/vi"),
};

/** The game's language for a stored code or a browser tag ("jp", "de-AT"), English otherwise. */
const gameLanguage = (tag) => normalizeLanguage(tag) || getDefaultLanguage();

const loadTranslations = async (code) => {
  if (!hasTranslations(code)) {
    const module = await LOADERS[code]();
    // a CommonJS table: Vite hands it over as the default export
    registerTranslations(code, module.default || module);
  }
};

/**
 * Switches the game to a language: loads its texts, then makes them current and tells the
 * browser (translation offers, screen readers and hyphenation go by the page's language).
 * Resolves with the game's code of the language; a text that cannot be loaded leaves the
 * language as it was.
 */
const applyLanguage = async (tag) => {
  const code = gameLanguage(tag);
  await loadTranslations(code);
  setCurrentLanguage(code);
  document.documentElement.lang = code;
  return code;
};

export { gameLanguage, applyLanguage };
