import { Ingredients, Items } from "@battlechoc/battlechoc-shared-functions";

// The notices about minted items that the title screen shows (ItemNotice.jsx): a minted item
// arrived in a wallet of the player, or left it. The server lists the unseen ones in
// stats.notices (GET /user, oldest first); an older API and the stats a device builds offline
// have none. Plain data, no React, so the rules have unit tests (test/unit/itemNotices.test.js).

// arrived in a wallet of the player, left it, or salvaged (plan E: its ingredients are back)
const KINDS = new Set(["arrived", "departed", "salvaged"]);

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
 * open to the player; ingredients that came back from a salvage offer the player's items
 * ("shelf": the Choclab) then; else, and for a departure, one button that reads it ("ok").
 */
export const noticeButtons = (kind, { choclabOpen }) => {
  if (kind === "arrived" && choclabOpen) {
    return ["choclab", "later"];
  }
  if (kind === "salvaged" && choclabOpen) {
    return ["shelf"];
  }
  return ["ok"];
};

/**
 * The rows of a `salvaged` notice's `returned` ({ ingredient: n }): [{ ingredient, amount, keeps
 * (the shelf life in ms of one that spoils, fresh; null for one that keeps) }], amounts of 0 and
 * ingredients this build does not know left out, in the order of `returned`.
 */
export const returnedRows = (returned) =>
  Object.entries(returned && typeof returned === "object" ? returned : {})
    .filter(
      ([ingredient, amount]) =>
        Ingredients[ingredient] && Number.isInteger(amount) && amount > 0
    )
    .map(([ingredient, amount]) => ({
      ingredient,
      amount,
      keeps: Ingredients[ingredient].shelfLifeMs || null,
    }));

/**
 * What a `salvaged` notice shows: { rows (returnedRows'), heading (the key of the line above
 * the rows, "SALVAGE_ARRIVED_FROM"; null: the item's name alone), nothing (the key of the line
 * that says nothing came back, "SALVAGE_ARRIVED_NOTHING": no recipe any more, or amounts too
 * small to halve; null when something came back) }.
 */
export const salvagedView = (notice) => {
  const rows = returnedRows(notice.returned);
  return rows.length > 0
    ? { rows, heading: "SALVAGE_ARRIVED_FROM", nothing: null }
    : { rows, heading: null, nothing: "SALVAGE_ARRIVED_NOTHING" };
};
