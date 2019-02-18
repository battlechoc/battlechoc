import Rules from './Rules';

function actionValidatorMiddleware() {
    return ({ getState }) => next => action => {
        action.valid = Rules.isActionValid(action, getState());
        next(action);
    }
}

const actionValidator = actionValidatorMiddleware();
export default actionValidator;