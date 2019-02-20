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

class BuildNotPossibleError extends BattlechocError {
    constructor(message, ...args) {
        super(...args);
        this.message = message;
    }
}

class NoAttacksLeftError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'No attacks left';
    }
}

class TargetEmptyError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'The target field is empty';
    }
}

class UnexpectedStateError extends BattlechocError {
    constructor(state, ...args) {
        super(...args);
        this.message = 'Unexpected state for action: ' + state;
    }
}

export { BattlechocError, ActionValidationError, NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError, TargetEmptyError, NoAttacksLeftError, UnexpectedStateError };