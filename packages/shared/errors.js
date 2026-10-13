// Errors returned or thrown by the battlechoc rules engines.

class BattlechocError extends Error { };

class ActionValidationError extends BattlechocError {
    constructor(action, ...args) {
        super(...args);
        this.message = action.type + ' is not a valid action';
    }
}

class InvalidActionIssuerError extends BattlechocError {
    constructor(action, issuerId, currentPlayerId, ...args) {
        super(...args);
        this.message = action.type + ' issued by ' + issuerId + ' cannot be issued by this issuer because it is not her turn. Current player is ' + currentPlayerId;
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

class GameAlreadyEndedError extends BattlechocError {
    constructor(action, ...args) {
        super(...args);
        this.message = 'Action ' + action.type + ' cannot be executed, because the game has already ended!';
    }
}

class GameNotRunningError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'There is currently no running game to access its gamestate!';
    }
}

class AlreadyMolten extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'This field is already molten';
    }
}

class NoHealthyInternetConnectionError extends BattlechocError {
    constructor(...args) {
        super(...args);
        this.message = 'You may not have a healthy internet connection at the moment. Please try again later'
    }
}

module.exports = {
    BattlechocError,
    ActionValidationError,
    InvalidActionIssuerError,
    NoBuildingsLeftError,
    NoCacaoLeftError,
    BuildNotPossibleError,
    NoAttacksLeftError,
    TargetEmptyError,
    UnexpectedStateError,
    GameAlreadyEndedError,
    GameNotRunningError,
    AlreadyMolten,
    NoHealthyInternetConnectionError,
};
