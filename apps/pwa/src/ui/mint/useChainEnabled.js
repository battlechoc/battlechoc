import { useEffect, useState, useSyncExternalStore } from "react";
import { chainEnabled } from "../../api/chain.js";
import { connectivity } from "../../api/connectivity.js";
import { features } from "../../cardano/appFeatures.js";

const onlineNow = () => connectivity.online;
const subscribeOnline = (listener) => connectivity.onChange(listener);

/**
 * Whether the game shows minting here (features.showMinting): a build with a network, not the
 * Android app, the device online, and the server's minting on. Each mount asks chainEnabled.ask():
 * once the server gave a definite answer it is remembered for the session and a mount asks nothing
 * new; until then (no answer, a timeout, a 5xx or a 429) a mount sends one request again. The
 * server is also asked when the device comes back online (chainEnabled.retry()), never on a timer.
 */
const useChainEnabled = () => {
  const serverEnabled = useSyncExternalStore(
    chainEnabled.subscribe,
    chainEnabled.serverEnabled
  );
  const online = useSyncExternalStore(subscribeOnline, onlineNow);
  useEffect(() => {
    chainEnabled.ask();
  }, []);
  useEffect(
    () =>
      connectivity.onChange((status) => {
        if (status === "online") {
          chainEnabled.retry();
        }
      }),
    []
  );
  return online && features.showMinting({ serverEnabled });
};

/**
 * Whether the server's minting switch is on where minting shows (features.showMinting without
 * the device's connection): a minting that runs is followed through a connection that blips
 * (MintDialog stays open), and only this switch closes it.
 */
export const useMintingSwitch = () => {
  const serverEnabled = useSyncExternalStore(
    chainEnabled.subscribe,
    chainEnabled.serverEnabled
  );
  useEffect(() => {
    chainEnabled.ask();
  }, []);
  return features.showMinting({ serverEnabled });
};

/**
 * Whether useMintingSwitch's value is decided for now: true once the server's answer is in, or
 * once nothing is asked (no network, the Android app, offline) or the ask failed. The guide links
 * mark it in the page (a hidden "decided" element), so a test of "no link" waits for that instead
 * of a fixed time.
 */
export const useMintingDecided = () => {
  const [decided, setDecided] = useState(false);
  useEffect(() => {
    let mounted = true;
    chainEnabled.ask().then(() => {
      if (mounted) {
        setDecided(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  return decided;
};

export default useChainEnabled;
