const PlayerType = Object.freeze({
    human: Symbol("human"),
    non_human: Symbol("non_human")
});

/**
 * Actions are performed by players. They trigger events when fired by players.
 */
class Action {
    /**
     * Actions and its perform method are the only place where the gameState may be changed.
     * 
     * @param {State} gameState The current game state affected by the execution of this event.
     * @returns {State} the changed game state.
     */
    perform(gameState) {
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

    addAction(action) {
        this.actions.push(action);
    }
}

/**
 * The state describes the current state of a game. States result from an initial state an a series of turns.
 */
class State {
    /**
     * Initializes the state.
     * 
     * @param {Player} players.
     */
    constructor(players) {
        console.log("gamestate: " + players);
        this.players = players;
        this.currentPlayerIndex = 0;
        this.turns = [];
        this.currentTurn = new Turn(this.players[0]);
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
            action.perform(this);
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
        console.log(this.currentPlayerIndex);
        this.currentPlayerIndex = ((this.currentPlayerIndex + 1) % this.players.length);
        console.log(this.currentPlayerIndex);
        return this.currentPlayer;
    }

    getCurrentPlayer() {
        console.log("currentPlayer:" + this.players);
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
 * A game consists of the history of turn performed so far and the current state.
 */
class Game {
    constructor(gameStateType) {
        if (gameStateType == null) {
            throw new Error("Invalid gamestate type given.");
        }
        this.gameStateType = gameStateType;
        this.state = null;
    }

    /**
     * Starts a game. Will throw an error if the game has already been started.
     * 
     * @param {Player} players the list of players participating in the game
     */
    start(players) {
        if (this.state != null) {
            throw new Error("Game has already been started.");
        }

        if (players == null || players.length !== 2) {
            throw new Error("Invalid players given.");
        }

        try {
            console.log("game: " + players);
            this.state = new this.gameStateType(players);
        } catch (error) {
            throw new Error("could not create initial game state. (" + error + ")");
        }
    }

    /**
     * Persists the current game state and the turn history in order to reload or replay it later on.
     */
    save() {
        // persist the game state
    }

    /**
     * Loads an persisted game.
     */
    load() {
        // load a game state
    }

    /**
     * Performs the given action on the current game state.
     * @param {Action} action 
     */
    perform(action) {
        this.state.perform(action);
    }

    /**
     * Returns a list of possible actions for the given player based on the current game state.
     */
    listPossibleActions(player) {
        return this.state.possibleActions(player);
    }

    getCurrentPlayer() {
        return this.state.currentPlayer;
    }
}

export { Game, Player, Action, PlayerType, State };