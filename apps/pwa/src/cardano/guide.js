// The guide on the website (plan F serves /guide/): what a wallet is, how to get ADA, what minting
// costs and how selling works, each section in German and English.
import { getCurrentLanguage } from "@battlechoc/battlechoc-shared-functions";

/**
 * Whether the website serves the guide. Off until it does (plan F turns it on): a link to it
 * would be a dead page, so the game shows none.
 */
export const GUIDE_ONLINE = false;

/**
 * The guide's `section` ("wallet", "ada", "costs", "selling") in German or else English; null
 * while the guide is not `online` (GUIDE_ONLINE).
 */
export const guideLink = (
  section,
  language = getCurrentLanguage(),
  online = GUIDE_ONLINE
) => (online ? `/guide/#${section}-${language === "de" ? "de" : "en"}` : null);
