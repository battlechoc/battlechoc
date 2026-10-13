// Match setup by player score, shared by the single player host in the PWA and the live
// match server (AI fallback): board size, the AI opponent and its handicap.

const { PlayerType } = require('../constants');

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

module.exports = { boardSizeForScore, handicapForScore, aiOpponentForScore, STRONG_AI_FROM_SCORE };
