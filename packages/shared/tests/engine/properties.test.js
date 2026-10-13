const { engine, EntityType, PlayerType } = require('./helper');
const { isDonut } = require('../../index');
const rng = require('../../engine/rng');

// plays a bot match and records every applied action
const recordedMatch = (seed, size = 6, onStep = () => {}) => {
    const match = engine.createMatch({
        players: [
            { id: 'a', name: 'A', type: PlayerType.AI_EASY },
            { id: 'b', name: 'B', type: PlayerType.AI_EASY },
        ],
        boardSize: { rows: size, cols: size },
        seed,
    });
    const initial = structuredClone(match);
    const agents = [0, 1].map(playerIndex => new engine.RandomBot({ playerIndex, seed: `${seed}-${playerIndex}`, reactionTimeMs: 1200 + 700 * playerIndex }));
    const log = [];
    const recordingEngine = {
        ...engine,
        applyAction: (target, action) => {
            log.push(action);
            const result = engine.applyAction(target, action);
            onStep(target);
            return result;
        },
    };
    engine.playMatch(recordingEngine, engine.getPlayerView, match, agents, { maxTime: 400000 });
    return { initial, match, log };
};

describe('engine properties', () => {
    test('advancing in random chunks equals advancing in one step', () => {
        for (let i = 0; i < 20; i++) {
            const { match } = recordedMatch(`chunks-${i}`);
            if (match.phase === engine.MatchPhase.ENDED) {
                continue;
            }
            const target = match.t + 120000;
            const once = structuredClone(match);
            engine.advanceTo(once, target);
            const chunked = structuredClone(match);
            const random = { rng: rng.seedFrom(`split-${i}`) };
            while (chunked.t < target) {
                engine.advanceTo(chunked, Math.min(target, chunked.t + rng.nextInt(random, 7000)));
            }
            expect(chunked).toEqual(once);
        }
    });

    test('replaying the action log on the initial state reproduces the match', () => {
        for (let i = 0; i < 10; i++) {
            const { initial, match, log } = recordedMatch(`replay-${i}`);
            const replay = structuredClone(initial);
            log.forEach(action => engine.applyAction(replay, action));
            engine.advanceTo(replay, match.t);
            expect(replay).toEqual(match);
        }
    });

    const hiddenIds = (match, owner) => {
        if (match.players[owner].fieldIndex === null) {
            return [];
        }
        const hidden = match.board.fields[match.players[owner].fieldIndex].grid.flatMap(cell => {
            const creamed = cell.occupiedBy.some(entity => entity.type === EntityType.CREAM);
            return cell.occupiedBy.filter(entity => isDonut(entity.type) || (creamed && entity.type !== EntityType.CREAM));
        });
        return [...hidden, ...match.players[owner].donuts].map(entity => entity.id);
    };

    test('a view never reveals what is hidden at that moment: board, new events, opponent resources, random state', () => {
        for (let i = 0; i < 30; i++) {
            const lastSeq = [-1, -1];
            let checks = 0;
            recordedMatch(`redaction-${i}`, 8, match => {
                [0, 1].forEach(viewer => {
                    const opponent = 1 - viewer;
                    const view = engine.getPlayerView(match, viewer, { eventsAfter: lastSeq[viewer] });
                    const fresh = JSON.stringify({ board: view.board, events: view.events, players: view.players });
                    hiddenIds(match, opponent).forEach(id => expect(fresh).not.toContain(`"${id}"`));
                    expect(view).not.toHaveProperty('rng');
                    expect(view).not.toHaveProperty('seed');
                    expect(fresh).not.toContain('"secret"');
                    if (match.phase !== engine.MatchPhase.ENDED) {
                        expect(view.players[opponent]).not.toHaveProperty('cacao');
                        expect(view.players[opponent]).not.toHaveProperty('donuts');
                        expect(view.players[opponent]).not.toHaveProperty('statistics');
                    }
                    if (view.events.length > 0) {
                        lastSeq[viewer] = view.events[view.events.length - 1].seq;
                    }
                    checks += 1;
                });
            });
            expect(checks).toBeGreaterThan(50);
        }
    });

    test('cocoa is conserved: start + produced - spent = current', () => {
        for (let i = 0; i < 20; i++) {
            const { match } = recordedMatch(`conservation-${i}`);
            match.players.forEach(player => {
                expect(player.cacao).toBe(match.balance.match.startCacao + player.statistics.producedCacao - player.statistics.spentCacao);
                expect(player.cacao).toBeGreaterThanOrEqual(0);
                expect(player.buildTokens).toBeGreaterThanOrEqual(0);
            });
        }
    });

    test('bot matches finish without engine errors', () => {
        for (let i = 0; i < 20; i++) {
            const { match } = recordedMatch(`finish-${i}`);
            engine.advanceTo(match, Math.max(match.t, match.endsAt || 0));
            expect(match.phase).toBe(engine.MatchPhase.ENDED);
        }
    });
});
