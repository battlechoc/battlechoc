import { multiplayer } from '../Multiplayer';
import { PlayerType } from './Player';
import Rules from './Rules';

function multiplayerActionRelayMiddleware() {
    return ({ getState }) => next => action => {
        if (Rules.isIssuerRelevant(action)) {
            let game = getState().gameplay.game;
            if (game.players.filter(player => player.type === PlayerType.HUMAN).length === 1 || action.payload.emittedByServer) {
                next(action);
            } else {
                multiplayer.relayAction(action);
            }
        } else {
            next(action);
        }
    }
}

const multiplayerActionRelay = multiplayerActionRelayMiddleware();
export default multiplayerActionRelay;