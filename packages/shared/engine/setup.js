// Match setup shared by the single player host in the PWA and the live match server: the AI
// ladder (opponent and board of matches against the AI), the prepared first match, the relaxed
// deadlines of matches against the AI, board sizes by score (matches between players) and the
// challenge matches.

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

// The AI ladder (2026-11-05, a play test: XP from a good win put a beginner against Gustav Ganache
// at full strength after two or three matches, and losing never made it easier): the step decides
// the opponent and the board. Two wins in a row go one step up, every loss one step down, a draw
// breaks the run; once a player reached the 10x10 board, they never go back to a smaller one.
// Each step has a fixed rating (2026-11-08): a verified match against the server AI moves the
// player's stars like a match against a player of that rating; the AI's rating never changes.
const AI_LADDER = Object.freeze([
    Object.freeze({ step: 1, board: 6, opponent: 'TomToffee', rating: 900 }),
    Object.freeze({ step: 2, board: 8, opponent: 'TomToffee', rating: 1050 }),
    Object.freeze({ step: 3, board: 8, opponent: 'GustavGanache', handicap: 4, rating: 1200 }),
    Object.freeze({ step: 4, board: 10, opponent: 'GustavGanache', handicap: 4, rating: 1300 }),
    Object.freeze({ step: 5, board: 10, opponent: 'GustavGanache', handicap: 3, rating: 1400 }),
    Object.freeze({ step: 6, board: 10, opponent: 'GustavGanache', handicap: 2, rating: 1500 }),
    Object.freeze({ step: 7, board: 10, opponent: 'GustavGanache', handicap: 1, rating: 1600 }),
    Object.freeze({ step: 8, board: 10, opponent: 'GustavGanache', handicap: 0, rating: 1700 }),
]);
// the AI's strength is known: a small, fixed deviation
const AI_RATING_DEVIATION = 50;
const TOP_STEP = AI_LADDER.length;
// the first step on the 10x10 board: a player who got there stays there
const BIG_BOARD_STEP = AI_LADDER.find(entry => entry.board === 10).step;
const WINS_TO_CLIMB = 2;

const floorOf = step => (step >= BIG_BOARD_STEP ? BIG_BOARD_STEP : 1);

/**
 * Where a player starts on the ladder: a new player at the bottom with the prepared first game
 * (games 0); a player from before the ladder where their XP used to put them.
 */
const initialAiLadder = xp => {
    const score = Math.max(0, Number(xp) || 0);
    if (score <= FIRST_GAME_MAX_SCORE) {
        return { step: 1, wins: 0, floor: 1, games: 0 };
    }
    const step = score < 200 ? 1 : score < 500 ? 2 : score < 800 ? 3 : score < 1000 ? 4 : 5;
    return { step, wins: 0, floor: floorOf(step), games: 1 };
};

/** A player's ladder from their stats (stats.aiLadder, else from their XP). */
const aiLadderOf = stats => (stats && stats.aiLadder && Number.isInteger(stats.aiLadder.step)
    ? stats.aiLadder
    : initialAiLadder(stats && stats.score));

/** The ladder after a match against the AI: outcome 'won', 'lost' or 'draw'. */
const nextAiLadder = (ladder, outcome) => {
    const current = ladder && Number.isInteger(ladder.step) ? ladder : initialAiLadder(0);
    let { step, wins } = current;
    if (outcome === 'won') {
        wins += 1;
        if (wins >= WINS_TO_CLIMB) {
            step = Math.min(TOP_STEP, step + 1);
            wins = 0;
        }
    } else if (outcome === 'lost') {
        step = Math.max(current.floor || 1, step - 1);
        wins = 0;
    } else {
        wins = 0;
    }
    return { step, wins, floor: Math.max(current.floor || 1, floorOf(step)), games: (current.games || 0) + 1 };
};

/**
 * Everything a match of a player against the AI needs, by their ladder: the board size, the
 * opponent, the scenario to prepare the fresh match with (the prepared first game for the very
 * first match against the AI; undefined otherwise) and the relaxed balance. Used by the single
 * player host and by the live server.
 *
 * @param {{step: number, wins: number, floor: number, games: number}} ladder
 * @param {object} [options]
 * @param {object} [options.scenario] a prepared board instead (debug boards: { boardSize, opponent, scenario })
 * @param {object} [options.balance] base balance
 */
const aiLadderSetup = (ladder, { scenario, balance } = {}) => {
    const current = ladder && Number.isInteger(ladder.step) ? ladder : initialAiLadder(0);
    const prepared = typeof scenario !== 'undefined' ? scenario : current.games === 0 ? firstGame : undefined;
    const entry = AI_LADDER[Math.min(TOP_STEP, Math.max(1, current.step)) - 1];
    const easy = (prepared && prepared.opponent === 'TomToffee') || entry.opponent === 'TomToffee';
    const opponent = easy
        ? aiOpponentForScore(0)
        : { ...aiOpponentForScore(STRONG_AI_FROM_SCORE), agent: { kind: 'GustavGanache', options: { handicap: entry.handicap } } };
    return {
        boardSize: prepared ? { ...prepared.boardSize } : { rows: entry.board, cols: entry.board },
        opponent,
        scenario: prepared ? JSON.parse(JSON.stringify(prepared.scenario)) : undefined,
        balance: aiMatchBalance(balance),
    };
};

/**
 * The fixed rating ({ rating, deviation }) of a server AI by its agent and the board it plays on;
 * null for an AI that is not on the ladder (a debug board, a test bot): such a match is not rated.
 */
const aiRatingOf = ({ kind, handicap = 0, board }) => {
    const entry = AI_LADDER.find(step => step.opponent === kind && (step.handicap || 0) === handicap && step.board === board);
    return entry ? { rating: entry.rating, deviation: AI_RATING_DEVIATION } : null;
};

// a match against a friend through a challenge link: always the big board, and more time to place
// the factory, since the friend may never have played before
const CHALLENGE_BOARD_SIZE = Object.freeze({ rows: 10, cols: 10 });
const CHALLENGE_PLACEMENT_MS = 45000;

/** Board size and balance (the given one, default DefaultBalance, with the longer placement) of a challenge match. */
const challengeMatchSetup = ({ balance = DefaultBalance } = {}) => {
    const copy = JSON.parse(JSON.stringify(balance));
    copy.match.placementTimeoutMs = CHALLENGE_PLACEMENT_MS;
    return { boardSize: { ...CHALLENGE_BOARD_SIZE }, balance: copy };
};

const scenarios = { firstGame };

module.exports = {
    boardSizeForScore,
    handicapForScore,
    aiOpponentForScore,
    aiMatchBalance,
    AI_LADDER,
    initialAiLadder,
    aiLadderOf,
    nextAiLadder,
    aiLadderSetup,
    aiRatingOf,
    challengeMatchSetup,
    CHALLENGE_BOARD_SIZE,
    CHALLENGE_PLACEMENT_MS,
    scenarios,
    STRONG_AI_FROM_SCORE,
    FIRST_GAME_MAX_SCORE,
    AI_MATCH_DEADLINE_MS,
};
