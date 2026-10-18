// Match setup by player score, shared by the single player host in the PWA and the live
// match server: board size, the AI opponent and its handicap, the prepared first matches and
// the relaxed deadlines of matches against the AI.

const { PlayerType, EntityType, BoardCellTypes } = require('../constants');
const { DefaultBalance } = require('../balance');
const { MatchPhase } = require('./index');

const boardSizeForScore = score => {
    if (score < 200) {
        return { rows: 6, cols: 6 };
    }
    if (score < 500) {
        return { rows: 8, cols: 8 };
    }
    return { rows: 10, cols: 10 };
};

// Gustav Ganache plays well at handicap 0 and like a beginner at 4
const handicapForScore = score => {
    if (score < 1) {
        return 4;
    }
    if (score < 200) {
        return 3;
    }
    if (score < 500) {
        return 2;
    }
    if (score < 1000) {
        return 1;
    }
    return 0;
};

const STRONG_AI_FROM_SCORE = 800;

/**
 * The AI opponent for a player: the easy Tom Toffee below a score of 800, afterwards Gustav
 * Ganache with a handicap by score.
 *
 * @returns {{id: string, name: string, type: string, agent: {kind: string, options?: object}}}
 */
const aiOpponentForScore = (score, { forceEasy = false } = {}) => (score >= STRONG_AI_FROM_SCORE && !forceEasy
    ? {
        id: 'ai-gustav-ganache',
        name: 'Gustav Ganache',
        type: PlayerType.AI_STRONG,
        agent: { kind: 'GustavGanache', options: { handicap: handicapForScore(score) } },
    }
    : {
        id: 'ai-tom-toffee',
        name: 'Tom Toffee',
        type: PlayerType.AI_EASY,
        agent: { kind: 'TomToffee' },
    });

// up to this score (the tutorial gives 100) a player starts from the prepared first-game board
const FIRST_GAME_MAX_SCORE = 100;

const { BLACK, BROWN } = BoardCellTypes;

// the first matches of a new player: a running game with a few own buildings in place
// (player 0 is the human, see engine.prepareScenario)
const firstGame = Object.freeze({
    boardSize: { rows: 6, cols: 6 },
    opponent: 'TomToffee',
    scenario: {
        phase: MatchPhase.RUNNING,
        cacao: [200, 50],
        cells: [
            { row: 0, col: 0, type: BLACK, cream: true, entities: [EntityType.FACTORY] },
            { row: 3, col: 4, type: BROWN, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
            { row: 0, col: 1, type: BROWN, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
            { row: 1, col: 4, type: BLACK, cream: true, entities: [EntityType.CACAOTREE] },
            { row: 5, col: 5, type: BROWN, cream: false, entities: [EntityType.CACAOTREE] },
            { player: 1, row: 3, col: 0, type: BROWN, cream: true, entities: [EntityType.FACTORY] },
        ],
    },
});

// against the AI nobody has to hurry: field choice and placement wait for the player
const AI_MATCH_DEADLINE_MS = 60 * 60 * 1000;

/** The balance of a match against the AI: the given one with relaxed field choice and placement. */
const aiMatchBalance = (balance = DefaultBalance) => {
    const relaxed = JSON.parse(JSON.stringify(balance));
    relaxed.match.fieldChoiceTimeoutMs = AI_MATCH_DEADLINE_MS;
    relaxed.match.placementTimeoutMs = AI_MATCH_DEADLINE_MS;
    return relaxed;
};

/**
 * Everything a match of a player against the AI needs, by the player's score: the board size,
 * the opponent (always the easy Tom Toffee in a prepared first game), the scenario to prepare
 * the fresh match with (engine.prepareScenario; undefined when none) and the relaxed balance.
 * Used by the single player host and by the live server, which reads the score from its database.
 *
 * @param {number} score the human player's score (XP)
 * @param {object} [options]
 * @param {object} [options.scenario] a prepared board instead of the one by score ({ boardSize, opponent, scenario })
 * @param {object} [options.balance] base balance
 */
const aiMatchSetup = (score, { scenario, balance } = {}) => {
    const prepared = typeof scenario !== 'undefined'
        ? scenario
        : (Number(score) || 0) <= FIRST_GAME_MAX_SCORE ? firstGame : undefined;
    return {
        boardSize: prepared ? { ...prepared.boardSize } : boardSizeForScore(score),
        opponent: aiOpponentForScore(score, { forceEasy: Boolean(prepared && prepared.opponent === 'TomToffee') }),
        scenario: prepared ? JSON.parse(JSON.stringify(prepared.scenario)) : undefined,
        balance: aiMatchBalance(balance),
    };
};

const scenarios = { firstGame };

module.exports = {
    boardSizeForScore,
    handicapForScore,
    aiOpponentForScore,
    aiMatchBalance,
    aiMatchSetup,
    scenarios,
    STRONG_AI_FROM_SCORE,
    FIRST_GAME_MAX_SCORE,
    AI_MATCH_DEADLINE_MS,
};
