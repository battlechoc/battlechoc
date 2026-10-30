import OfflineStore from "./OfflineStore";
import { unlocks } from "@battlechoc/battlechoc-shared-functions";
import logger from "./helper/logger";

// What a player has unlocked comes from their finished matches (shared progression.js: the
// buildings after the first, the Choclab and online play after three matches against the AI).
// Until 2026-10-30 a single match unlocked all of it. Nobody loses what they had: on the first
// start with the new rule, a device whose player already had XP (so everything was open) keeps
// everything ("early"). Decided once and kept in the settings store, like the dialogs that
// announced each step, so each shows once:
//   settings "unlocks" = { early, announced: { buildings, online } }
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
 * After a match: the step that was just unlocked and not announced yet ("buildings" or
 * "online"), marked as announced; undefined when there is none.
 */
export const takeNewUnlock = async (stats) => {
  const state = await loadUnlockState(stats);
  const open = unlocks(stats, { early: state.early });
  const step = ["buildings", "online"].find(
    (part) => open[part] && !(state.announced && state.announced[part])
  );
  if (step) {
    await OfflineStore.settingsStore
      .set(KEY, { ...state, announced: { ...state.announced, [step]: true } })
      .catch((error) => logger.warn("could not store the unlock state", error));
  }
  return step;
};
