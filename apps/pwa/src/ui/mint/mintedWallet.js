// The wallet the item card names for a minted item ("It is in your wallet (Eternl)"): a minted
// item the player can use lies in a wallet linked to the account, and the account's identities
// (GET /user/identities: `wallet`, the CIP-30 name stored at linking; `items`, the minted items
// each key holds) say which. No new field of the stats is needed.
import { walletLabel } from "../account/safetyState.js";

const counted = (identity) => Number.isInteger(identity.items);

/**
 * The name of the linked wallet that holds the player's minted items, from `identities`: the
 * only key holding any (by `items`), or, from a server that sends no counts, the only key with a
 * wallet name; null when the identities do not tell (none, several, or a key without a name).
 */
export const mintedWalletName = (identities) => {
  if (!Array.isArray(identities) || identities.length === 0) {
    return null;
  }
  const holders = identities.some(counted)
    ? identities.filter((identity) => counted(identity) && identity.items > 0)
    : identities.filter((identity) => identity.wallet);
  return holders.length === 1 ? walletLabel(holders[0].wallet) : null;
};
