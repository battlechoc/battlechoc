const PlayerType = Object.freeze({
    human: Symbol("human"),
    non_human: Symbol("non_human")
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
 * Actions are performed by players. They trigger events when fired by players.
 */
class Action {
    constructor(actionType) {
        this.actionType = actionType;
    }

    getActionType() {
        return this.actionType;
    }
    
    /**
     * Actions and its perform method are the only place where the gameState may be changed.
     * 
     * @param {State} gameState The current game state affected by the execution of this event.
     * @returns {State} the changed game state.
     */
    perform(gameState) {
        return true;
    }

    /**
     * Evaluates this action on the given game state and returns the resulting game state.
     * Leaves the given game state "untouched". Needed by npc to evaluate the outcome possible actions.
     * 
     * @param {State} gameState State object on which the action shall be applied.
     * @returns {State} a State object representing the state after the action was performed on the given game state.
     */
    evaluate(gameState) {
        return gameState.clone();
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
     * @param {Game} game the game hosting this game state.
     * @param {Player} players the players playing the game.
     * @param {Object} config game configuration parameters
     */
    constructor(game, players, config) {
        this.players = players;
        this.game = game;
        this.currentPlayerIndex = 0;
        this.config = config;
        this.currentTurn = new Turn(this.players[0]);
    }

    /**
     * Clones this game state.
     * 
     * @returns A deep copy of this game state object.
     */
    clone() {
        return new State();
    }

    /**
     * Checks if the given action is a valid move based on the current game state and player.
     * 
     * @param {Action} action 
     */
    isValidAction(action) {
        return true;
    }

    /**
     * Performs the given action on the current game state.
     * 
     * @param {Action} action Action that shall be executed on this game state.
     * @returns true if action was valid and successfully executed, false otherwise. false means action was rolled back.
     */
    dispatch(action) {
        if (this.isValidAction(action) === true) {
            this.currentTurn.addAction(action);
            return action.perform(this);
        } else {
            console.error("Trying to perform invalid action.");
            return false;   
        }
    }

    /**
     * Finishes the current turn and advances to the next one.
     */
    finishTurn(keepPlayer = false) {
        this.game.turnFinished(this.currentTurn);
        if (keepPlayer === true) {
            this.currentTurn = new Turn(this.currentPlayer());
        } else {
            this.currentTurn = new Turn(this.nextPlayer());
        }
    }

    nextPlayer() {
        this.currentPlayerIndex = ((this.currentPlayerIndex + 1) % this.players.length);
        return this.currentPlayer();
    }

    currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    otherPlayer() {
        return this.players[(this.currentPlayerIndex + 1) % this.players.length];
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
        this.turnHistory = [];
        this.state = null;
    }

    /**
     * Starts a game. Will throw an error if the game has already been started.
     * 
     * @param {Player} players the list of players participating in the game
     * @param {Object} config game configuration parameters
     */
    start(players, config) {
        if (this.state != null) {
            throw new Error("Game has already been started.");
        }

        if (players == null || players.length !== 2) {
            throw new Error("Invalid players given.");
        }

        try {
            this.state = new this.gameStateType(this, players, config);
        } catch (error) {
            throw new Error("could not create initial game state. (" + error + ")");
        }
    }

    /**
     * Persists the current game state and the turn history in order to reload or replay it later on.
     */
    save() {
        // persist the game state and turn history
    }

    /**
     * Loads a persisted game.
     */
    load() {
        // load a game state and turn history
    }

    /**
     * Performs the given action on the current game state.
     * 
     * @param {Action} action Action object that shall be executed on the current game state.
     */
    dispatch(action) {
        this.state.dispatch(action);
    }

    turnFinished(turn) {
        this.turnHistory.push(turn);
    }

    /**
     * Returns a list of possible actions for the given player based on the current game state.
     */
    listPossibleActions(player) {
        return this.state.listPossibleActions(player);
    }

    currentPlayer() {
        return this.state.currentPlayer();
    }

    otherPlayer() {
        return this.state.otherPlayer();
    }

    currentState() {
        return this.state;
    }
}

export { Game, Player, Action, PlayerType, State };