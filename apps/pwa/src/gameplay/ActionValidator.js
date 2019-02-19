import Rules from './Rules';
import { BattlechocError } from './Errors';

function actionValidatorMiddleware() {
    return ({ getState }) => next => action => {
        return new Promise((resolve, reject) => {
        	let validity = Rules.isActionValid(action, getState());
        	
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