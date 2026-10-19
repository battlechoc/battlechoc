// Plays many matches between AI agents with the real-time engine and prints statistics.
// Usage: node scripts/simulate.js [matches=200] [boardSize=6] [agentA=gustav:0] [agentB=tom]
// Agents: random | tom | gustav:<handicap>[:<DEFENSIVE|AGGRESSIVE|BALANCED>]

const { engine, PlayerType, EntityType, AttackType, isDonut } = require('../index');

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
// cream statistics per agent spec: builds, cells covered, time-weighted shares while RUNNING
const creamStats = specs.map(() => ({ builds: 0, cells: 0, coveredMs: 0, hiddenMs: 0, runningMs: 0, shots: 0, shotsOnBuildings: 0 }));
const hasCream = cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM);
const isBuilding = entity => entity.type !== EntityType.CREAM && !isDonut(entity.type);
const sampler = seatStats => {
    let lastT = null;
    return match => {
        if (match.phase !== engine.MatchPhase.RUNNING) {
            lastT = null;
            return;
        }
        const dt = lastT === null ? 0 : match.t - lastT;
        lastT = match.t;
        seatStats.forEach((stats, playerIndex) => {
            const grid = match.board.fields[match.players[playerIndex].fieldIndex].grid.filter(cell => !cell.molten);
            const withBuildings = grid.filter(cell => cell.occupiedBy.some(isBuilding));
            stats.coveredMs += dt * grid.filter(hasCream).length / Math.max(1, grid.length);
            stats.hiddenMs += dt * (withBuildings.length ? withBuildings.filter(hasCream).length / withBuildings.length : 0);
            stats.runningMs += dt;
        });
    };
};
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
        const seatStats = seats.map((spec, playerIndex) => creamStats[swap ? 1 - playerIndex : playerIndex]);
        const { stats } = engine.playMatch(engine, engine.getPlayerView, match, agents, { onStep: sampler(seatStats) });
        match.events.forEach(event => {
            const seat = seatStats[event.player];
            if (event.type === 'built' && event.data.entityType === EntityType.CREAM) {
                seat.builds += 1;
                seat.cells += event.data.cells.length;
            } else if (event.type === 'attack' && [AttackType.TRUFFLE, AttackType.FRUIT].includes(event.data.attackType)) {
                seat.shots += 1;
                seat.shotsOnBuildings += event.secret.targetBefore.some(type => type !== EntityType.CREAM && !isDonut(type)) ? 1 : 0;
            }
        });
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
const pct = (a, b) => `${Math.round(100 * a / Math.max(1, b))} %`;
creamStats.forEach((stats, index) => {
    console.log(`${specs[index]}: cream builds/match ${(stats.builds / matches).toFixed(1)}, cells/build ${(stats.cells / Math.max(1, stats.builds)).toFixed(1)}, ` +
        `board under cream ${pct(stats.coveredMs, stats.runningMs)}, own buildings hidden ${pct(stats.hiddenMs, stats.runningMs)}, ` +
        `shots ${(stats.shots / matches).toFixed(1)}/match, of them on buildings ${pct(stats.shotsOnBuildings, stats.shots)}`);
});
process.exitCode = results.errors > 0 ? 1 : 0;
