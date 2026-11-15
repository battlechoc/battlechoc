import { Items } from "@battlechoc/battlechoc-shared-functions";

// The notices about minted items that the title screen shows (ItemNotice.jsx): a minted item
// arrived in a wallet of the player, or left it. The server lists the unseen ones in
// stats.notices (GET /user, oldest first); an older API and the stats a device builds offline
// have none. Plain data, no React, so the rules have unit tests (test/unit/itemNotices.test.js).

const KINDS = new Set(["arrived", "departed"]);

// a notice this build can show: a kind it knows, about an item it knows
const showable = (notice) =>
  Boolean(notice) &&
  KINDS.has(notice.kind) &&
  Boolean(notice.item) &&
  Boolean(Items[notice.item.item]);

const timeOf = (notice) => {
  const time = Date.parse(notice.at);
  return Number.isNaN(time) ? Infinity : time;
};

/**
 * The notice to show next: the oldest of `notices` (stats.notices) that this build can show and
 * that is not in `skip` (ids answered in this session); null when there is none.
 */
export const nextNotice = (notices, skip = []) => {
  if (!Array.isArray(notices)) {
    return null;
  }
  const skipped = new Set(skip);
  const open = notices.filter(
    (notice) => showable(notice) && !skipped.has(notice.id)
  );
  // the server sends them oldest first; a stable sort keeps its order for equal times
  const [oldest] = [...open].sort((a, b) => {
    const difference = timeOf(a) - timeOf(b);
    // two notices without a time
    return Number.isNaN(difference) ? 0 : difference;
  });
  return oldest || null;
};

/** The stats without the notice `id` (a new object; the rest of the stats as they are). */
export const withoutNotice = (stats, id) =>
  Array.isArray(stats.notices)
    ? {
        ...stats,
        notices: stats.notices.filter((notice) => notice.id !== id),
      }
    : stats;

/**
 * Whether the title screen may show a notice now: with the marks (not in the Android app, a
 * build with a network), the server and the account at hand (else nothing could mark it read),
 * outside a match, the tutorial and the first-play screen, and with none of the `dialogs`
 * ({ name: open }) open: a notice waits for them rather than covering one.
 */
export const noticeAllowed = ({
  marks,
  online,
  signedIn,
  inMatch,
  tutorial,
  firstPlay,
  dialogs = {},
}) =>
  Boolean(marks && online && signedIn) &&
  !inMatch &&
  !tutorial &&
  !firstPlay &&
  !Object.values(dialogs || {}).some(Boolean);

/**
 * The buttons of a notice: an arrival offers the Choclab ("choclab", "later") while the Choclab is
 * open to the player; else, and for a departure, one button that reads it ("ok").
 */
export const noticeButtons = (kind, { choclabOpen }) =>
  kind === "arrived" && choclabOpen ? ["choclab", "later"] : ["ok"];
