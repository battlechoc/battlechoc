const { engine, PlayerType } = require('./helper');

const newMatch = seed => engine.createMatch({
    players: [
        { id: 'a', name: 'A', type: PlayerType.AI_STRONG },
        { id: 'b', name: 'B', type: PlayerType.AI_STRONG },
    ],
    boardSize: { rows: 6, cols: 6 },
    seed,
});

// a host loop like the PWA's and the server's: wake up, advance, let the agents act
const host = (match, agents, until) => {
    const log = [];
    let next = engine.nextWakeAt(match, agents);
    while (next !== null && next <= until) {
        engine.advanceTo(match, next);
        log.push(...engine.runDueAgents(match, agents));
        next = engine.nextWakeAt(match, agents);
    }
    return log;
};

describe('match hosting helpers', () => {
    test('a saved agent continues exactly like the original', () => {
        const descriptor = { kind: 'GustavGanache', playerIndex: 1, seed: 'g', options: { handicap: 2 } };
        const original = [engine.createAgent({ kind: 'TomToffee', playerIndex: 0, seed: 't' }), engine.createAgent(descriptor)];
        const match = newMatch('save');
        host(match, original, 60000);

        const copy = structuredClone(match);
        const restored = original.map(agent => engine.createAgent(JSON.parse(JSON.stringify(engine.serializeAgent(agent)))));
        const logA = host(match, original, 240000);
        const logB = host(copy, restored, 240000);
        expect(logB).toEqual(logA);
        expect(copy).toEqual(match);
    });

    test('runDueAgents returns the applied actions, so replaying them rebuilds the match', () => {
        const agents = [engine.createAgent({ kind: 'RandomBot', playerIndex: 0, seed: 'a' }), engine.createAgent({ kind: 'TomToffee', playerIndex: 1, seed: 'b' })];
        const match = newMatch('replay');
        const replica = newMatch('replay');
        const log = host(match, agents, 11 * 60 * 1000);
        expect(match.phase).toBe(engine.MatchPhase.ENDED);
        log.forEach(action => expect(engine.applyAction(replica, action).ok).toBe(true));
        engine.advanceTo(replica, match.t);
        expect(replica).toEqual(match);
    });

    test('a throwing agent skips its decision and the match goes on', () => {
        const broken = engine.createAgent({ kind: 'RandomBot', playerIndex: 0, seed: 'x' });
        broken.decide = () => {
            throw new Error('boom');
        };
        const errors = [];
        const match = newMatch('broken');
        engine.advanceTo(match, broken.wakeAt);
        engine.runDueAgents(match, [broken], { onRejected: error => errors.push(error.message) });
        expect(errors).toEqual(['boom']);
        expect(broken.wakeAt).toBeGreaterThan(match.t);
        expect(() => engine.createAgent({ kind: 'Nobody', playerIndex: 0, seed: 'x' })).toThrow('Unknown agent kind');
    });

    test('match setup by score', () => {
        expect(engine.boardSizeForScore(0)).toEqual({ rows: 6, cols: 6 });
        expect(engine.boardSizeForScore(200)).toEqual({ rows: 8, cols: 8 });
        expect(engine.boardSizeForScore(500)).toEqual({ rows: 10, cols: 10 });
        expect(engine.aiOpponentForScore(799).agent.kind).toBe('TomToffee');
        expect(engine.aiOpponentForScore(800).agent).toEqual({ kind: 'GustavGanache', options: { handicap: 1 } });
        expect(engine.aiOpponentForScore(5000, { forceEasy: true }).name).toBe('Tom Toffee');
        expect([0, 1, 200, 500, 1000].map(engine.handicapForScore)).toEqual([4, 3, 2, 1, 0]);
    });

    test('matches against the AI: the prepared first game up to a score of 100, relaxed deadlines', () => {
        const first = engine.aiMatchSetup(100);
        expect(first.boardSize).toEqual({ rows: 6, cols: 6 });
        expect(first.opponent.name).toBe('Tom Toffee');
        expect(first.scenario).toEqual(engine.scenarios.firstGame.scenario);
        // a copy: preparing a match must not change the shared scenario
        expect(first.scenario).not.toBe(engine.scenarios.firstGame.scenario);
        expect(first.balance.match.fieldChoiceTimeoutMs).toBe(engine.AI_MATCH_DEADLINE_MS);
        expect(first.balance.match.placementTimeoutMs).toBe(engine.AI_MATCH_DEADLINE_MS);
        expect(engine.aiMatchSetup(undefined).scenario).toBeDefined();

        const later = engine.aiMatchSetup(900);
        expect(later.scenario).toBeUndefined();
        expect(later.boardSize).toEqual({ rows: 10, cols: 10 });
        expect(later.opponent.agent).toEqual({ kind: 'GustavGanache', options: { handicap: 1 } });
        expect(later.balance.match.placementTimeoutMs).toBe(engine.AI_MATCH_DEADLINE_MS);
        expect(engine.aiMatchSetup(101).scenario).toBeUndefined();

        // the first game prepares a running match for the human (player 0)
        const match = engine.createMatch({
            players: [
                { id: 'p0', name: 'Carolin Cacao', type: PlayerType.HUMAN },
                { id: 'p1', name: first.opponent.name, type: first.opponent.type },
            ],
            boardSize: first.boardSize,
            seed: 'first',
            balance: first.balance,
        });
        engine.prepareScenario(match, first.scenario);
        expect(match.phase).toBe(engine.MatchPhase.RUNNING);
        expect(match.players.map(player => player.cacao)).toEqual([200, 50]);
    });
});
