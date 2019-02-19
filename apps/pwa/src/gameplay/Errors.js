class BattlechocError extends Error {
    constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, BattlechocError);
    }
}

class ActionValidationError extends BattlechocError {
    constructor(action, ...args) {
        super(...args);
        this.message = action.type + ' is not a valid action';
    }
}

class NoBuildingsLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'No more buildings can be built';
    }
}

class NoCacaoLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'Not enough cacao left';
    }
}


export { BattlechocError, ActionValidationError, NoBuildingsLeftError, NoCacaoLeftError };