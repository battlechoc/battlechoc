import { Rules, BattlechocError } from 'battlechoc-shared-functions';
import { UiActionTypes } from '../ui/UiActions';

function actionValidatorMiddleware() {
    return ({ getState }) => next => action => {
        return new Promise((resolve, reject) => {
			const game = getState().gameplay.game;
        	const validity = Object.values(UiActionTypes).includes(action.type) || Rules.isActionValid(game, action);
        	
        	if (validity instanceof BattlechocError) {
        		reject(validity);
        	} else {
        		resolve(next(action));
        	}
        });
    }
}

const actionValidator = actionValidatorMiddleware();
export default actionValidator;