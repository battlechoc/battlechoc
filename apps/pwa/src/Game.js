const PlayerType = Object.freeze({
    human:   Symbol("human"),
    non_human:  Symbol("non_human")
});

class GameEvent {
    fire(gameState) {
        return gameState;
    }
}

/**
 * Actions are performed by players. They trigger events when fired by players.
 */
class Action {
    constructor(type) {
        this.type = type;
        this.events = [];
    }

    getType() {
        return this.type;
    }

    /**
     * Executes this action on the given game state. Will fire events and return the changed gameState.
     * 
     * @param {State} gameState 
     */
    perform(gameState) {
        // fire events related to this action to change the game state
        for (let gameEvent of this.events) {
            // fired events will be transmitted to the server
            gameState = gameEvent.fire(gameState);
        }
        return gameState;
    }
}

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
        this.name = name;
        this.type = type;
    }

    getType() {
        return this.type;
    }

    getName() {
        return this.name;
    }
}

/**
 * A turn consists of a sequence of actions performed by a player.
 */
class Turn {
    constructor(player) {
        this.player = player;
        this.actions = [];
    }

    getPlayer() {
        return this.player;
    }

    getActions() {
        return this.actions;
    }

    addActions(action) {
        this.actions.push(action);
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
        this.players = players;
        this.currentPlayerIndex = playerStartIndex;
        this.turns = [];
        this.currentTurn = new Turn(this.players[playerStartIndex]);

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
            this.state = action.perform(this);
            this.currentTurn.addAction(action);
        }
    }

    /**
     * Finishes the current turn and advances to the next one.
     */
    finishTurn() {
        this.turns.push(this.currentTurn);
        this.currentTurn = new Turn(this.nextPlayer())
    }

    nextPlayer() {
        this.currentPlayerIndex = ((this.currentPlayerIndex + 1) % this.players.length);
        return this.currentPlayer();
    }

    currentPlayer() {
        return this.players[this.currentPlayerIndex];
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
        this.config = null;
        this.state = null;
    }

    /**
     * Starts a game. Will throw an error if the game has already been started.
     * 
     * @param {Player} players the list of players participating in the game
     * @param {int} playerStartIndex index of the player that has the initial turn in the game
     * @param {GameConfig} config configuration parameters defining the game
     */
    start(players, playerStartIndex, config) {
        if (this.state != null) {
            throw new Error("Game has already been started.");
        }

        if (players == null || players.length !== 2) {
            throw new Error("Invalid players given.");
        }

        if (playerStartIndex < 0 || playerStartIndex >= players.length) {
            throw new Error("Invalid player start index.");
        }

        if (config == null) {
            throw new Error("Invalid config given.");
        }

        this.config = config;
        this.state = new State(players, playerStartIndex);
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
        this.state.perform(action);
    }

    /**
     * Finishes the current turn and advances to the next one.
     */
    finishTurn() {
        this.state.finishTurn();
    }

    /**
     * Returns a list of possible actions for the given player based on the current game state.
     */
    listPossibleActions(player) {
        return this.state.possibleActions();
    }

    currentPlayer() {
        return this.state.currentPlayer();
    }
}

export { Game, GameConfig, Player, Action, PlayerType };