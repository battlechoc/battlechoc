import { live } from "@battlechoc/battlechoc-shared-functions";

// What a challenge link points to: play.battlechoc.com (a preview that names the challenger, see
// apps/api/src/playPage.js) once VITE_CHALLENGE_LINK_BASE says so, until then the game itself.
export const CHALLENGE_LINK_BASE =
  import.meta.env.VITE_CHALLENGE_LINK_BASE ||
  "https://battlechoc.com/?challenge=";

/** The link to share for a challenge code (shown as K7Q2-M9XD, the form a friend can type). */
export const challengeLink = (code) =>
  `${CHALLENGE_LINK_BASE}${live.formatChallengeCode(code)}`;
