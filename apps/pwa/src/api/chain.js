// The game's chain calls (plan D, api/chainClient.js): readiness, mint and the player's
// operations with the device account's token (api/client.js), the status and the sign routes
// without one; and whether the server has minting on, asked once per session. Light on purpose: the title screen
// and the Choclab ask it, so it brings neither the wallets nor the Evolution SDK.
import { createClient } from "../helper/http.js";
import { apiUrl } from "./apiUrl.js";
import { request } from "./client.js";
import { connectivity } from "./connectivity.js";
import { createChainApi } from "./chainClient.js";
import { features } from "../cardano/appFeatures.js";
import { createChainEnabled } from "../cardano/features.js";

const open = createClient({ baseURL: apiUrl, timeout: 15000 });

export const chainApi = createChainApi({ open, request });

/**
 * Whether the server has the chain features on, asked once per session (createChainEnabled):
 * `ask()`, `retry()` (when the device is back online: connectivity's "online"),
 * `serverEnabled()`, `subscribe(listener)`; the game shows minting where
 * `features.showMinting({ serverEnabled })`.
 */
export const chainEnabled = createChainEnabled({
  status: () => chainApi.status(),
  features,
  online: () => connectivity.online,
});

export { ChainApiError, ChainUnreachableError } from "./chainClient.js";
