import { injectedWalletKeys } from "../../cardano/walletList";
import { features } from "../../cardano";

// What this device can sign with, for the minting dialog and the salvage of a minted item: the
// wallets this browser injected, and whether it opens a phone's wallet app (the wallet door's
// paths, which never sign through the QR code).

/** The CIP-30 key `name` when this browser injected that wallet, else null. */
export const injectedKey = (name) => {
  try {
    const wallet =
      typeof name === "string" && window.cardano ? window.cardano[name] : null;
    return wallet && typeof wallet.enable === "function" ? name : null;
  } catch {
    return null;
  }
};

/** { wallets (the keys this browser injected), deeplink (it opens a phone's wallet app) } */
export const signingHere = () => {
  let wallets;
  try {
    wallets = injectedWalletKeys(window.cardano);
  } catch {
    wallets = [];
  }
  return {
    wallets,
    deeplink: features
      .walletPaths({ injected: wallets.length > 0 })
      .has("deeplink"),
  };
};
