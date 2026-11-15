// A Cardano wallet for the tests (plan 3, minting plan D): a CIP-30 extension injected as
// window.cardano.eternl, so the Cardano Foundation's component lists it like the real one. It
// signs in Node through bindings: messages (signData, the sign-in and the address proof) with the
// key of the address asked for, transactions (signTx, a mint) with the payment key of `keys`
// (helpers/cardano.js nodeKeys), as plan B's walletWitness writes a wallet's witness set.
import { createRequire } from "node:module";
import { COSE } from "@evolution-sdk/evolution";
import { nodeKeys } from "./cardano.js";

// plan B's witness set of a CIP-30 wallet (apps/api/test/helpers/chain.js), the one the API tests sign with
const { walletWitness } = createRequire(import.meta.url)(
  "../../../api/test/helpers/chain.js"
);

const hex = (bytes) => Buffer.from(bytes).toString("hex");

/**
 * Injects the wallet into every page of `context`. Options fixed when the page loads:
 * - `networkId`: what the wallet says it is on (1: mainnet);
 * - `key`: its name in window.cardano (default "eternl");
 * - `refuse`: enable() refuses, as a wallet app without an account (or a locked one);
 * - `addresses`: what it names as its own: "own" (default: its base address as used and change
 *   address, no unused one), "foreign" (also a second, foreign address as used: another wallet's
 *   base address, `foreignAddress` of the answer), "none" (no used, unused or change address).
 * Options a test may change while the page runs (they are read at each call, in Node: set them on
 * the answer's `options`):
 * - `decline`: signData refuses as a player who says no ({ code: 3, info: "user declined" });
 *   `hang`: signData never answers (a popup closed without a no, a phone gone);
 * - `declineTx`: signTx refuses as a player who says no ({ code: 2, info: "user declined" });
 *   `cannotSignTx`: as a wallet that lacks the key ({ code: 1, … }); `hangTx`: never answers;
 * - `txKeys`: nodeKeys whose payment key signs instead of the wallet's own (a wallet opened on
 *   another account of the same app).
 * signTx(tx, partial) without `partial` true is refused as a real wallet refuses a transaction it
 * cannot sign completely ({ code: 1, … }): it never holds the server's key, which every mint
 * needs. The call is recorded with the `partial` it got either way.
 * Resolves with { signed, calls, asked(method), options, foreignAddress, peerjs }: the texts it
 * was asked to sign with signData; every call of its api in order ({ method, …arguments }, e.g.
 * { method: "signTx", tx, partial } with the transaction exactly as it was given), and `asked`
 * those of one method; and { tries } at the PeerJS server.
 */
export const fakeWallet = async (
  context,
  keys,
  {
    networkId = 0,
    decline = false,
    hang = false,
    declineTx = false,
    cannotSignTx = false,
    hangTx = false,
    txKeys = null,
    refuse = false,
    addresses = "own",
    key = "eternl",
  } = {}
) => {
  if (!["own", "foreign", "none"].includes(addresses)) {
    throw new TypeError(`fakeWallet: addresses "own", "foreign" or "none"`);
  }
  const options = { decline, hang, declineTx, cannotSignTx, hangTx, txKeys };
  const signed = [];
  const calls = [];
  // the QR path (CIP-45) would reach the public PeerJS server: tests stay off the internet, and
  // `peerjs.tries` counts the attempts
  const peerjs = { tries: 0 };
  await context.route(/peerjs\.com/, (route) => {
    peerjs.tries += 1;
    return route.abort();
  });
  await context.routeWebSocket(/peerjs\.com/, (socket) => {
    peerjs.tries += 1;
    socket.close();
  });
  await context.exposeBinding(
    "__battlechocTestWalletCall",
    (source, method, args) => {
      calls.push({ method, ...args });
    }
  );
  // the key of the address signData is asked for: the stake key for the reward address, the
  // payment key for the base address (hex as CIP-30 gives them, or bech32)
  const keyOf = (address) => {
    const asked = String(address).toLowerCase();
    if ([keys.rewardAddressHex, keys.rewardAddress].includes(asked)) {
      return keys.stakeKey;
    }
    if ([keys.baseAddressHex, keys.baseAddress].includes(asked)) {
      return keys.paymentKey;
    }
    return null;
  };
  await context.exposeBinding(
    "__battlechocTestWalletSign",
    (source, addressHex, payloadHex) => {
      if (options.decline) {
        return { error: { code: 3, info: "user declined" } };
      }
      if (options.hang) {
        // a wallet that never answers (a popup closed without a no, a phone gone)
        return new Promise(() => {});
      }
      const signingKey = keyOf(addressHex);
      if (!signingKey) {
        // DataSignError 2, AddressNotPK: no key of the wallet's for that address
        return {
          error: { code: 2, info: "the wallet has no key for this address" },
        };
      }
      signed.push(Buffer.from(payloadHex, "hex").toString("utf8"));
      const data = COSE.SignData.signData(
        addressHex,
        Uint8Array.from(Buffer.from(payloadHex, "hex")),
        signingKey
      );
      return { signature: hex(data.signature), key: hex(data.key) };
    }
  );
  await context.exposeBinding(
    "__battlechocTestWalletSignTx",
    (source, tx, partial) => {
      if (options.declineTx) {
        return { error: { code: 2, info: "user declined" } };
      }
      if (options.cannotSignTx) {
        // TxSignError 1, ProofGeneration
        return {
          error: {
            code: 1,
            info: "the wallet does not have the key to sign this",
          },
        };
      }
      if (options.hangTx) {
        return new Promise(() => {});
      }
      if (partial !== true) {
        // a whole signature: the wallet holds the payment key only, the server's key is missing
        // (every mint needs it), so a real wallet refuses: TxSignError 1, ProofGeneration
        return {
          error: {
            code: 1,
            info: "the wallet cannot sign every key this transaction needs",
          },
        };
      }
      try {
        const signer = options.txKeys || keys;
        return { witness: walletWitness(tx, [signer.paymentKey]) };
      } catch (error) {
        // APIError -2, InternalError: no transaction a wallet could read
        return { error: { code: -2, info: String(error.message || error) } };
      }
    }
  );
  const foreign = addresses === "foreign" ? nodeKeys().baseAddressHex : null;
  const used = {
    own: [keys.baseAddressHex],
    foreign: [keys.baseAddressHex, foreign],
    none: [],
  }[addresses];
  await context.addInitScript(
    ({ rewardAddressHex, change, used, networkId, key, refuse }) => {
      const call = (method, args = {}) =>
        window.__battlechocTestWalletCall(method, args);
      const failed = (answer) => {
        if (answer.error) {
          throw answer.error;
        }
        return answer;
      };
      const api = {
        getNetworkId: async () => {
          await call("getNetworkId");
          return networkId;
        },
        getRewardAddresses: async () => {
          await call("getRewardAddresses");
          return [rewardAddressHex];
        },
        // one page holds them all (CIP-30 Paginate: the game asks page by page)
        getUsedAddresses: async (paginate) => {
          await call("getUsedAddresses", paginate ? { paginate } : {});
          return paginate && paginate.page > 0 ? [] : used;
        },
        getUnusedAddresses: async () => {
          await call("getUnusedAddresses");
          return [];
        },
        getChangeAddress: async () => {
          await call("getChangeAddress");
          return change;
        },
        // CBOR 0: an empty wallet (the server reads the wallet's funds on the chain)
        getBalance: async () => {
          await call("getBalance");
          return "00";
        },
        getUtxos: async () => {
          await call("getUtxos");
          return [];
        },
        signData: async (address, payload) => {
          await call("signData", { address, payload });
          return failed(
            await window.__battlechocTestWalletSign(address, payload)
          );
        },
        signTx: async (tx, partial = false) => {
          await call("signTx", { tx, partial });
          return failed(await window.__battlechocTestWalletSignTx(tx, partial))
            .witness;
        },
      };
      window.cardano = window.cardano || {};
      window.cardano[key] = {
        name: key,
        apiVersion: "0.1.0",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
        // `refuse`: how a wallet app without an account (or a locked one) answers
        enable: async () => {
          if (refuse) {
            throw { code: -3, info: "no account" };
          }
          return api;
        },
        isEnabled: async () => true,
      };
    },
    {
      rewardAddressHex: keys.rewardAddressHex,
      change: addresses === "none" ? "" : keys.baseAddressHex,
      used,
      networkId,
      key,
      refuse,
    }
  );
  return {
    signed,
    calls,
    asked: (method) => calls.filter((entry) => entry.method === method),
    options,
    foreignAddress: foreign,
    peerjs,
  };
};

/**
 * Asks the injected wallet `key` of `page` to sign `tx` (CIP-30 signTx(tx, partial), as the game
 * asks it): { witness } or { error } with what the wallet threw (`{ code, info }`).
 */
export const walletSignTx = (
  page,
  tx,
  { key = "eternl", partial = true } = {}
) =>
  page.evaluate(
    async ({ tx, key, partial }) => {
      const api = await window.cardano[key].enable();
      try {
        return { witness: await api.signTx(tx, partial) };
      } catch (error) {
        return { error: { code: error.code, info: error.info } };
      }
    },
    { tx, key, partial }
  );

/**
 * The addresses the injected wallet `key` of `page` names as its own, as the game reads them
 * (src/cardano/signTx.js walletAddresses: change, used, unused; hex, each once).
 */
export const walletAddressesOf = (page, { key = "eternl" } = {}) =>
  page.evaluate(async (key) => {
    const api = await window.cardano[key].enable();
    const all = [
      await api.getChangeAddress(),
      ...(await api.getUsedAddresses({ page: 0, limit: 50 })),
      ...(await api.getUnusedAddresses()),
    ].filter(Boolean);
    return [...new Set(all)];
  }, key);
