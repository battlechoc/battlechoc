import { multiplayer } from '../Multiplayer';
import Rules from './Rules';

function multiplayerActionRelayMiddleware() {
    return () => next => action => {
        if (Rules.isIssuerRelevant(action) === true) {
            console.log("relaying action");
            console.dir(action);
            multiplayer.relayAction(action);
        }
        next(action);
    }
}

const multiplayerActionRelay = multiplayerActionRelayMiddleware();
export default multiplayerActionRelay;