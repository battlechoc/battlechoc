import OfflineStore from "../OfflineStore";
import { ServerRequest } from "./settings";

/**
 * Keeps the player's language: on the device, and on the server, which writes to the player in
 * it (offline or without an account the request fails, the device keeps it anyway).
 */
const rememberLanguage = (code) =>
  ServerRequest("post", "/user/language", { language: code })
    .catch(() => {})
    .finally(() => OfflineStore.settingsStore.set("language", code));

export { rememberLanguage };
