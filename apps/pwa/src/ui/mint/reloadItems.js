// Reloads what the server knows about the player's pantry, items and equipment (GET /user) into
// the stats and the device's copy: after a salvage that failed, a mint that changed an item's
// mark, a cancel. The Choclab and the minting watcher use it.
import { fetchOwnProfile } from "../../api/profile";
import OfflineStore from "../../OfflineStore";
import logger from "../../helper/logger";

/** The stats `changes` merged into the device's copy (a failure is only logged). */
export const persistStats = (changes) =>
  OfflineStore.playerStore
    .get("stats")
    .then((stats) =>
      OfflineStore.playerStore.set("stats", { ...(stats || {}), ...changes })
    )
    .catch((error) => logger.warn("could not cache the lab state", error));

/** Reloads the stats' pantry, items and equipment; `updateStats(changes)` takes them in. */
export const reloadItems = (updateStats) =>
  fetchOwnProfile()
    .then(({ stats }) => {
      const { pantry, spoiling, items, equipment, loadout } = stats;
      const changes = {
        pantry,
        spoiling,
        coins: (pantry && pantry.COCOA) || 0,
        items,
        equipment,
        loadout,
      };
      updateStats(changes);
      persistStats(changes);
    })
    .catch((error) => logger.info("could not reload the stats", error));
