// Plays many matches between AI agents with the real-time engine and prints statistics.
// Usage: node scripts/simulate.js [matches=200] [boardSize=6] [agentA=gustav:0] [agentB=tom]
// Agents: random | tom | gustav:<handicap>[:<DEFENSIVE|AGGRESSIVE|BALANCED>]

const { engine, PlayerType } = require('../index');

const matches = Number(process.argv[2] || 200);
const size = Number(process.argv[3] || 6);
const specs = [process.argv[4] || 'gustav:0', process.argv[5] || 'tom'];

const createAgent = (spec, playerIndex, seed) => {
    const [kind, handicap, personality] = spec.split(':');
    if (kind === 'random') {
        return new engine.RandomBot({ playerIndex, seed, reactionTimeMs: 1500 });
    } else if (kind === 'tom') {
        return new engine.ai.TomToffee({ playerIndex, seed });
    } else if (kind === 'gustav') {
        return new engine.ai.GustavGanache({
            playerIndex,
            seed,
            handicap: Number(handicap || 0),
            personality: personality ? engine.ai.Personality[personality] : undefined,
        });
    }
    throw new Error('unknown agent ' + spec);
};

const results = { wins: [0, 0], draws: 0, reasons: {}, durations: [], actions: 0, rejected: 0, errors: 0 };
const started = Date.now();

for (let i = 0; i < matches; i++) {
    // alternate the seats so neither agent profits from being player 0
    const swap = i % 2 === 1;
    const seats = swap ? [specs[1], specs[0]] : specs;
    const match = engine.createMatch({
        players: [
            { id: 'a', name: seats[0], type: PlayerType.AI_STRONG },
            { id: 'b', name: seats[1], type: PlayerType.AI_STRONG },
        ],
        boardSize: { rows: size, cols: size },
        seed: `simulation-${i}`,
    });
    const agents = seats.map((spec, playerIndex) => createAgent(spec, playerIndex, `agent-${i}-${playerIndex}`));
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
            results.draws += 1;
        } else {
            const winnerSpec = outcome.winners[0] === 0 ? 0 : 1;
            results.wins[swap ? 1 - winnerSpec : winnerSpec] += 1;
        }
        results.durations.push(outcome.t - match.startedAt);
    } catch (error) {
        results.errors += 1;
        console.error(`match ${i}:`, error);
    }
}

const sorted = [...results.durations].sort((a, b) => a - b);
const percentile = p => (sorted.length ? Math.round(sorted[Math.floor((sorted.length - 1) * p)] / 1000) : 0);
console.log(`${matches} matches on ${size}x${size}: ${specs[0]} vs ${specs[1]} in ${Date.now() - started} ms`);
console.log(`wins: ${specs[0]} ${results.wins[0]} (${Math.round(100 * results.wins[0] / matches)} %), ${specs[1]} ${results.wins[1]}, draws ${results.draws}`);
console.log('reasons:', results.reasons);
console.log(`duration s: p10 ${percentile(0.1)}, median ${percentile(0.5)}, p90 ${percentile(0.9)}`);
console.log(`actions: ${results.actions}, rejected: ${results.rejected} (${Math.round(100 * results.rejected / Math.max(1, results.actions))} %), engine errors: ${results.errors}`);
process.exitCode = results.errors > 0 ? 1 : 0;
