class GameEvent {
    fire(gameState) {
    }
}

/**
 * Actions are performed by players. They trigger events when fired by players.
 */
class Action {
    constructor(type) {
        this._type = type;
        this._events = [];
    }

    get type() {
        return this._type;
    }

    /**
     * Executes this action on the given game state. Will fire events and return the changed gameState.
     * 
     * @param {State} gameState 
     */
    perform(gameState) {
        // fire events related to this action to change the game state
        for (let gameEvent in this._events) {
            // fired events will be transmitted to the server
            gameState = gameEvent.fire(gameState);
        }
        return gameState;
    }
}

const PlayerType = Object.freeze({
    human:   Symbol("human"),
    non_human:  Symbol("non_human")
});

/**
 * Wraps data about players including its name and type (numan, nonhuman).
 */
class Player {
    /**
     * 
     * @param {String} name displayed name of the player
     * @param {PlayerType} type define a humand or non-human player
     */
    constructor(name, type) {
        this._name = name;
        this._type = type;
    }

    get type() {
        return this._type;
    }

    get name() {
        return this._name;
    }
}

/**
 * A turn consists of a sequence of actions performed by a player.
 */
class Turn {
    constructor(player) {
        this._player = player;
        this._actions = [];
    }

    get player() {
        return this._player;
    }

    get actions() {
        return this._actions;
    }

    addActions(action) {
        this._actions.push(action);
    }
}

/**
 * The state describes the current state of a game. States result from an initial state an a series of turns.
 */
class State {
    /**
     * Initializes the state with an initial player.
     * 
     * @param {Player} player Initial player that is on turn.
     */
    constructor(players, playerStartIndex) {
        this._players = players;
        this._currentPlayerIndex = playerStartIndex;
        this._turns = [];
        this._currentTurn = new Turn(this._players[playerStartIndex]);

        // list some variables that describe the game state
    }

    /**
     * Checks if the given action is a valid move based on the current game state and player.
     * 
     * @param {Action} action 
     */
    isValid(action) {
        return true;
    }

    /**
     * Performs the given action on the current game state.
     * 
     * @param {Action} action 
     */
    perform(action) {
        if (this.isValid(action)) {
            this._state = action.perform(this);
            this._currentTurn.addAction(action);
        }
    }

    /**
     * Finishes the current turn and advances to the next one.
     */
    finishTurn() {
        this._turns.push(this._currentTurn);
        this._currentTurn = new Turn(this.nextPlayer())
    }

    nextPlayer() {
        this._currentPlayerIndex = ((this._currentPlayerIndex + 1) % this._players.length);
        return this.currentPlayer();
    }

    currentPlayer() {
        return this._players[this._currentPlayerIndex];
    }

    /**
     * Returns a list of possible actions for the given player based on the current game state.
     */
    listPossibleActions(player) {
        return [];
    }
}

/**
 * Defines the configuration of the game.
 */
class GameConfig {

}

/**
 * A game consists of the history of turn performed so far and the current state.
 */
class Game {
    constructor() {
        this._config = null;
        this._state = null;
    }

    /**
     * Starts a game. Will throw an error if the game has already been started.
     * 
     * @param {Player} players the list of players participating in the game
     * @param {int} playerStartIndex index of the player that has the initial turn in the game
     * @param {GameConfig} config configuration parameters defining the game
     */
    start(players, playerStartIndex, config) {
        if (this._state != null) {
            throw new "Game has already been started.";
        }

        if (players == null || players.length !== 2) {
            throw new "Invalid players given.";
        }

        if (playerStartIndex < 0 || playerStartIndex >= players.length) {
            throw new "Invalid player start index.";
        }

        if (config == null) {
            throw new "Invalid config given.";
        }

        this._config = config;
        this._state = new State(players, playerStartIndex);
    }

    /**
     * Persists the current game state and the turn history in order to reload or replay it later on.
     */
    save() {

    }

    /**
     * Loads an persisted game.
     */
    load() {

    }

    /**
     * Performs the given action on the current game state.
     * @param {Action} action 
     */
    perform(action) {
        this._state.perform(action);
    }

    /**
     * Finishes the current turn and advances to the next one.
     */
    finishTurn() {
        this._state.finishTurn();
    }

    /**
     * Returns a list of possible actions for the given player based on the current game state.
     */
    listPossibleActions(player) {
        return this._state.possibleActions();
    }

    currentPlayer() {
        return this._state.currentPlayer();
    }
}

export { Game, GameConfig, Player, Action, PlayerType };