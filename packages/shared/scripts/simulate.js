// Plays many matches between random bots with the real-time engine and prints statistics.
// Usage: node scripts/simulate.js [matches=200] [boardSize=6]

const { engine, PlayerType } = require('../index');

const matches = Number(process.argv[2] || 200);
const size = Number(process.argv[3] || 6);

const results = { winners: { 0: 0, 1: 0, draw: 0 }, reasons: {}, durations: [], actions: 0, rejected: 0, errors: 0 };
const started = Date.now();

for (let i = 0; i < matches; i++) {
    const match = engine.createMatch({
        players: [
            { id: 'bot-a', name: 'Bot A', type: PlayerType.AI_EASY },
            { id: 'bot-b', name: 'Bot B', type: PlayerType.AI_EASY },
        ],
        boardSize: { rows: size, cols: size },
        seed: `simulation-${i}`,
    });
    const agents = [0, 1].map(playerIndex => new engine.RandomBot({ playerIndex, seed: `bot-${i}-${playerIndex}`, reactionTimeMs: 1500 + 500 * playerIndex }));
    try {
        const { stats } = engine.playMatch(engine, engine.getPlayerView, match, agents);
        results.actions += stats.actions;
        results.rejected += stats.rejected;
        const outcome = match.outcome;
        if (!outcome) {
            results.reasons.UNFINISHED = (results.reasons.UNFINISHED || 0) + 1;
            continue;
        }
        results.reasons[outcome.reason] = (results.reasons[outcome.reason] || 0) + 1;
        if (outcome.winners.length === 2) {
            results.winners.draw += 1;
        } else {
            results.winners[outcome.winners[0]] += 1;
        }
        results.durations.push(outcome.t - match.startedAt);
    } catch (error) {
        results.errors += 1;
        console.error(`match ${i}:`, error);
    }
}

const sorted = [...results.durations].sort((a, b) => a - b);
const percentile = p => (sorted.length ? Math.round(sorted[Math.floor((sorted.length - 1) * p)] / 1000) : 0);
console.log(`${matches} matches on ${size}x${size} in ${Date.now() - started} ms`);
console.log('winners:', results.winners, 'reasons:', results.reasons);
console.log(`duration s: p10 ${percentile(0.1)}, median ${percentile(0.5)}, p90 ${percentile(0.9)}`);
console.log(`actions: ${results.actions}, rejected: ${results.rejected} (${Math.round(100 * results.rejected / Math.max(1, results.actions))} %), engine errors: ${results.errors}`);
process.exitCode = results.errors > 0 ? 1 : 0;
