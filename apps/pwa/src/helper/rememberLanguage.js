import OfflineStore from "../OfflineStore";
import { saveLanguage } from "../api/profile";

/**
 * Keeps the player's language: on the device, and on the server, which writes to the player in
 * it (offline or without an account the request fails, the device keeps it anyway).
 */
const rememberLanguage = (code) =>
  saveLanguage(code)
    .catch(() => {})
    .finally(() => OfflineStore.settingsStore.set("language", code));

export { rememberLanguage };
