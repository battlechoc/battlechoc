import OfflineStore from "./OfflineStore";
import {
  unlocks,
  buildingsUnlockedBetween,
} from "@battlechoc/battlechoc-shared-functions";
import logger from "./helper/logger";

// What a player has unlocked comes from their finished matches (shared progression.js: two
// buildings after each of the first three matches, the Choclab and online play after four
// matches against the AI). Until 2026-10-30 a single match unlocked all of it. Nobody loses
// what they had: on the first start with the new rule, a device whose player already had XP (so
// everything was open) keeps everything ("early"). Decided once and kept in the settings store,
// like the dialogs that announced each step, so each shows once:
//   settings "unlocks" = { early, announced: { buildings, online } }
// `announced.buildings` counts the finished matches whose buildings the player has seen
// announced (`true` from before 2026-11-01: the first match's, which then brought them all).
const KEY = "unlocks";

const decide = (stats) => {
  const hadEverything = (Number(stats && stats.score) || 0) >= 1;
  return {
    early: hadEverything,
    // they saw the old dialog (buildings, Choclab and Friends at once) already
    announced: { buildings: hadEverything, online: hadEverything },
  };
};

/** The device's unlock state; decided from `stats` (the player's stats as stored before) on the first call. */
export const loadUnlockState = async (stats) => {
  try {
    const stored = await OfflineStore.settingsStore.get(KEY);
    if (stored && typeof stored === "object") {
      return stored;
    }
  } catch (error) {
    logger.warn("could not read the unlock state", error);
  }
  const state = decide(stats);
  await OfflineStore.settingsStore
    .set(KEY, state)
    .catch((error) => logger.warn("could not store the unlock state", error));
  return state;
};

/**
 * After a match: what was just unlocked and not announced yet, marked as announced:
 * { buildings: [entity types], online: boolean }; undefined when there is nothing new.
 */
export const takeNewUnlock = async (stats) => {
  const state = await loadUnlockState(stats);
  const open = unlocks(stats, { early: state.early });
  const announced = state.announced || {};
  const announcedUpTo =
    announced.buildings === true ? 1 : Number(announced.buildings) || 0;
  const buildings = state.early
    ? []
    : buildingsUnlockedBetween(announcedUpTo, open.games);
  const online = open.online && !announced.online;
  if (buildings.length === 0 && !online) {
    return undefined;
  }
  await OfflineStore.settingsStore
    .set(KEY, {
      ...state,
      announced: {
        buildings: Math.max(announcedUpTo, open.games),
        online: Boolean(announced.online) || online,
      },
    })
    .catch((error) => logger.warn("could not store the unlock state", error));
  return { buildings, online };
};
