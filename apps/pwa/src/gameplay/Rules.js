import * as GameActions from './GameActions';

class Rules {
    static isActionValid(action, state) {
        if (action.type === GameActions.GameActionTypes.startGame) {
            return true;
        } else {
            return { error: "some error happened"};
        }
    }
}

export default Rules;
