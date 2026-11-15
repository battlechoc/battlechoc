import { useEffect, useSyncExternalStore } from "react";
import { chainEnabled } from "../../api/chain.js";
import { connectivity } from "../../api/connectivity.js";
import { features } from "../../cardano/appFeatures.js";

const onlineNow = () => connectivity.online;
const subscribeOnline = (listener) => connectivity.onChange(listener);

/**
 * Whether the game shows minting here (features.showMinting): a build with a network, not the
 * Android app, the device online, and the server's minting on. The server is asked once a session
 * (chainEnabled.ask() remembers; a mount asks nothing new) and again only when the device comes
 * back online (chainEnabled.retry()), never on a timer.
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

export default useChainEnabled;
