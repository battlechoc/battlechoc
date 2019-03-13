import Rules from './Rules';

class GameplayLog {
    constructor() {
        this.clear();
    }

    clear() {
        this.turns = [];
    }
}

const gameplayLog = new GameplayLog();

function gameplayLoggerMiddleware() {
    return ({ dispatch, getState }) => next => action => {
        if (Rules.isGameAction(action)) {
            gameplayLog.turns.push(action);
        }
        return next(action);
    }
}

const gameplayLogger = gameplayLoggerMiddleware();

export { gameplayLogger, gameplayLog };