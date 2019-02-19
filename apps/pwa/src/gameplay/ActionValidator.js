import Rules from './Rules';

function actionValidatorMiddleware() {
    return ({ getState }) => next => action => {
        return new Promise((resolve, reject) => {
        	action.valid = Rules.isActionValid(action, getState());
        	
        	if (typeof action.valid.error === 'undefined') {
        		resolve(next(action));
        	} else {
        		reject(action.valid.error);
        	}
        });
    }
}

const actionValidator = actionValidatorMiddleware();
export default actionValidator;