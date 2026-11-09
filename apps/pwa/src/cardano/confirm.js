// Confirming a key change (linking a further key, removing one): a fresh signature by one of the
// player's keys gives a confirm token for 5 minutes (apps/api/src/routes/cardano.js). With the
// words, or with the passkey that guards them (fingerprint, face or PIN).
import { signChallenge } from "./signIn.js";
import { unlockWithPasskey } from "./passkey.js";

/** A confirm token from the words (`api`, `network` as for signChallenge). */
export const confirmWithWords = async (words, { api, network }) =>
  (await signChallenge(words, "confirm", { api, network })).confirmToken;

/** A confirm token from the passkey: it opens the words, which sign. */
export const confirmWithPasskey = async ({
  api,
  network,
  rpId,
  credentials,
  allowCredentialIds,
}) => {
  const words = await unlockWithPasskey((id) => api.passkeyBackup(id), {
    rpId,
    credentials,
    allowCredentialIds,
  });
  return confirmWithWords(words, { api, network });
};
