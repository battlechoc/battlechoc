import { createClient } from "../helper/http.js";
import { apiUrl } from "./account.js";
import { get, post, request } from "./client.js";

// Signing in with a Cardano key on the battlechoc API (apps/api/src/routes/cardano.js). Linking
// a key and the player's keys go as the device account; signing in on another device needs no
// account. Errors are those of api/client.js (error.response.status, error.response.data.error).

const open = createClient({ baseURL: apiUrl, timeout: 15000 });
// challenges for the device's player (linking a key, confirming a change) go with its token
const ASPLAYER = ["link", "confirm"];

export const cardanoApi = {
  /** The network the server runs on ("preprod" or "mainnet"). */
  network: async () => (await open.get("/cardano/network")).data.network,

  /** A challenge for the reward address: { nonce, message, expiresAt }. */
  challenge: async (purpose, address) =>
    ASPLAYER.includes(purpose)
      ? post("/auth/cardano/challenge", { purpose, address })
      : (await open.post("/auth/cardano/challenge", { purpose, address })).data,

  /**
   * The signed challenge: { identity } for a link, { confirmToken } for a confirm, a session for
   * signing in. `confirmToken` proves a fresh signature by an existing key (a further link).
   */
  verify: async (body, purpose, { confirmToken } = {}) =>
    ASPLAYER.includes(purpose)
      ? post(
          "/auth/cardano/verify",
          body,
          confirmToken ? { "X-Battlechoc-Confirm": confirmToken } : {}
        )
      : (await open.post("/auth/cardano/verify", body)).data,

  /** The player's linked keys: [{ provider, subject, address, createdAt }]. */
  identities: () => get("/user/identities"),

  /** Removes one of them with a confirm token (a 409 for the last one). */
  removeIdentity: async (subject, confirmToken) =>
    (
      await request(
        "delete",
        `/user/identities/${encodeURIComponent(subject)}`,
        undefined,
        { "X-Battlechoc-Confirm": confirmToken }
      )
    ).data,

  /** The player's passkey backups: [{ credentialId, subject, createdAt }]. */
  passkeys: () => get("/user/passkeys"),

  /** Keeps a passkey backup ({ credentialId, subject, iv, data }). */
  storePasskey: (backup) => post("/user/passkeys", backup),

  /** The encrypted words a passkey guards ({ iv, data }); undefined when none. */
  passkeyBackup: async (credentialId) => {
    try {
      return (
        await open.get(
          `/auth/cardano/passkeys/${encodeURIComponent(credentialId)}`
        )
      ).data;
    } catch (failure) {
      if (failure && failure.response && failure.response.status === 404) {
        return undefined;
      }
      throw failure;
    }
  },

  /** { hasProgress }: whether the device's account has progress of its own on the server. */
  progress: () => get("/user/progress"),
};
