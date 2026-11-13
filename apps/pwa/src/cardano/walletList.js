// The wallets the wallet door lists (src/ui/account/WalletDoor.jsx). Elsewhere: the registry's
// (the component's default leaves out Vespr, Begin and Gero) and whatever the browser injected
// (an extension, or a phone wallet's own browser). On a phone without a wallet of its own (the
// CIP-158 deep link): only the wallets whose app opens the link page. The others would only lead
// to an app store (Begin, Yoroi) or open the whole game in the wallet's browser (Flint's own link),
// and the extension-only ones (Lace, NuFi, Typhon, Gero, Nami) have no app at all.

export const REGISTRY_WALLETS = [
  "eternl",
  "lace",
  "vespr",
  "begin",
  "yoroi",
  "nufi",
  "typhoncip30",
  "gerowallet",
  "flint",
  "nami",
];

/** The keys of the CIP-30 wallets in `wallets` (window.cardano): those with an enable(). */
export const injectedWalletKeys = (wallets) =>
  Object.keys(wallets || {}).filter(
    (key) => wallets[key] && typeof wallets[key].enable === "function"
  );

/**
 * The wallets to list: `deeplink` (a phone, CIP-158), `injected` (injectedWalletKeys), `configOf`
 * (the core's getWalletConfig: the registry entry of a key, or undefined).
 */
export const listedWallets = ({ deeplink, injected = [], configOf }) => {
  const registry = deeplink
    ? REGISTRY_WALLETS.filter((key) => {
        const config = configOf(key);
        return Boolean(config && config.hasCIP158Support);
      })
    : REGISTRY_WALLETS;
  return [...new Set([...registry, ...injected])];
};
