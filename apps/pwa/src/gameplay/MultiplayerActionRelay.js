import { multiplayer } from "../Multiplayer";
import { Rules } from "@battlechoc/battlechoc-shared-functions";

function multiplayerActionRelayMiddleware() {
  return () => (next) => (action) => {
    if (Rules.isIssuerRelevant(action)) {
      multiplayer.relayAction(action);
    }
    next(action);
  };
}

const multiplayerActionRelay = multiplayerActionRelayMiddleware();
export default multiplayerActionRelay;
