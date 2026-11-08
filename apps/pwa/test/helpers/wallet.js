// A Cardano wallet for the tests (plan 3): a CIP-30 extension injected as window.cardano.eternl,
// so the Cardano Foundation's component lists it like the real one. It signs in Node (the
// Evolution SDK) with the stake key of `keys` (helpers/cardano.js nodeKeys), through a binding.
import { COSE } from "@evolution-sdk/evolution";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/**
 * Injects the wallet into every page of `context`. `networkId` is what the wallet says it is on
 * (1: mainnet); `decline` makes it refuse to sign, as a player who says no. Resolves with
 * { signed }: the texts it was asked to sign.
 */
export const fakeWallet = async (
  context,
  keys,
  { networkId = 0, decline = false } = {}
) => {
  const signed = [];
  // the QR path (CIP-45) would reach the public PeerJS server: tests stay off the internet
  await context.route(/peerjs\.com/, (route) => route.abort());
  await context.routeWebSocket(/peerjs\.com/, (socket) => socket.close());
  await context.exposeBinding(
    "__battlechocTestWalletSign",
    (source, addressHex, payloadHex) => {
      if (decline) {
        return { declined: true };
      }
      signed.push(Buffer.from(payloadHex, "hex").toString("utf8"));
      const data = COSE.SignData.signData(
        addressHex,
        Uint8Array.from(Buffer.from(payloadHex, "hex")),
        keys.stakeKey
      );
      return { signature: hex(data.signature), key: hex(data.key) };
    }
  );
  await context.addInitScript(
    ({ rewardAddressHex, networkId }) => {
      const api = {
        getNetworkId: async () => networkId,
        getRewardAddresses: async () => [rewardAddressHex],
        getUsedAddresses: async () => [],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () => rewardAddressHex,
        // CBOR 0: an empty wallet
        getBalance: async () => "00",
        getUtxos: async () => [],
        signData: async (address, payload) => {
          const answer = await window.__battlechocTestWalletSign(
            address,
            payload
          );
          if (answer.declined) {
            throw { code: 3, info: "user declined" };
          }
          return answer;
        },
      };
      window.cardano = window.cardano || {};
      window.cardano.eternl = {
        name: "eternl",
        apiVersion: "0.1.0",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
        enable: async () => api,
        isEnabled: async () => true,
      };
    },
    { rewardAddressHex: keys.rewardAddressHex, networkId }
  );
  return { signed };
};
