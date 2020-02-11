import { Rules, BattlechocError } from 'battlechoc-shared-functions';
import { UiActionTypes } from '../ui/UiActions';

function actionValidatorMiddleware() {
    return ({ getState }) => next => action => {
        return new Promise((resolve, reject) => {
        	let validity = Object.values(UiActionTypes).includes(action.type) || Rules.isActionValid(action, getState());
        	
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