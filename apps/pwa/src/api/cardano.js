import { createClient } from "../helper/http.js";
import { apiUrl } from "./account.js";
import { get, post, request } from "./client.js";

// Signing in with a Cardano key on the battlechoc API (apps/api/src/routes/cardano.js). Linking
// a key and the player's keys go as the device account; signing in on another device needs no
// account. Errors are those of api/client.js (error.response.status, error.response.data.error).

const open = createClient({ baseURL: apiUrl, timeout: 15000 });

export const cardanoApi = {
  /** The network the server runs on ("preprod" or "mainnet"). */
  network: async () => (await open.get("/cardano/network")).data.network,

  /** A challenge for the reward address: { nonce, message, expiresAt }. */
  challenge: async (purpose, address) =>
    purpose === "link"
      ? post("/auth/cardano/challenge", { purpose, address })
      : (await open.post("/auth/cardano/challenge", { purpose, address })).data,

  /** The signed challenge: { identity } for a link, a session for signing in. */
  verify: async (body, purpose) =>
    purpose === "link"
      ? post("/auth/cardano/verify", body)
      : (await open.post("/auth/cardano/verify", body)).data,

  /** The player's linked keys: [{ provider, subject, address, createdAt }]. */
  identities: () => get("/user/identities"),

  /** Removes one of them (a 409 for the last one). */
  removeIdentity: async (subject) =>
    (await request("delete", `/user/identities/${encodeURIComponent(subject)}`))
      .data,

  /** { hasProgress }: whether the device's account has progress of its own on the server. */
  progress: () => get("/user/progress"),
};
