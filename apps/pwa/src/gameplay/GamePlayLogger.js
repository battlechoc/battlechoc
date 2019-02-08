class GameplayLog {
    constructor() {
        this.turns = [];
    }

    save() {
        // persists the log to file
    }

    load() {
        // loads a log from file
    }
}

const gameplayLog = new GameplayLog();

function gameplayLoggerMiddleware(log) {
    return ({ dispatch, getState }) => next => action => {
        if (action.payload.isGameplayAction) {

        }
        return next(action);
    }
}

const gameplayLogger = gameplayLoggerMiddleware();

export { gameplayLogger, gameplayLog };