// The guide on the website (public/guide/index.html, served at /guide/): what a wallet is, which
// wallet app to get, how to get ADA, what minting costs, selling and salvaging a minted item,
// each section in German and English.
import { getCurrentLanguage } from "@battlechoc/battlechoc-shared-functions";

/**
 * Whether the website serves the guide. While it is off, a link to it would be a dead page, so
 * the game shows none.
 */
export const GUIDE_ONLINE = true;

/** The guide's sections, in the page's order: each heading's id is `<section>-de` / `-en`. */
export const GUIDE_SECTIONS = Object.freeze([
  "wallet",
  "apps",
  "ada",
  "costs",
  "selling",
  "salvage",
]);

/**
 * The guide's `section` (GUIDE_SECTIONS; null: the guide from its start) in German, or else in
 * English; null while the guide is not `online` (GUIDE_ONLINE). A section the page does not
 * have throws: the game names its sections in its code, so that is a mistake there.
 */
export const guideLink = (
  section,
  language = getCurrentLanguage(),
  online = GUIDE_ONLINE
) => {
  if (section != null && !GUIDE_SECTIONS.includes(section)) {
    throw new Error(`unknown guide section "${section}"`);
  }
  if (!online) {
    return null;
  }
  const page = language === "de" ? "de" : "en";
  return `/guide/#${section == null ? page : `${section}-${page}`}`;
};
