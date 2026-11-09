const { engine, DefaultBalance } = require('../../index');

describe('challenge match setup', () => {
    test('a challenge is always 10x10 with 45 s for the placement', () => {
        const { boardSize, balance } = engine.challengeMatchSetup();
        expect(boardSize).toEqual({ rows: 10, cols: 10 });
        expect(balance.match.placementTimeoutMs).toBe(45000);
        expect(balance.match.fieldChoiceTimeoutMs).toBe(10000);
        expect(DefaultBalance.match.placementTimeoutMs).toBe(20000);
    });
});

describe('the AI ladder', () => {
    const ladder = (step, more = {}) => ({ step, wins: 0, floor: step >= 4 ? 4 : 1, games: 5, ...more });
    const opponentOf = setup => (setup.opponent.agent.kind === 'TomToffee'
        ? 'Tom'
        : `Gustav ${setup.opponent.agent.options.handicap}`);

    test('Tom on 6x6 and 8x8, a very easy Gustav on 8x8 and on 10x10, then a stronger one each step', () => {
        const steps = [1, 2, 3, 4, 5, 6, 7, 8].map(step => engine.aiLadderSetup(ladder(step)));
        expect(steps.map(opponentOf)).toEqual(['Tom', 'Tom', 'Gustav 4', 'Gustav 4', 'Gustav 3', 'Gustav 2', 'Gustav 1', 'Gustav 0']);
        expect(steps.map(setup => setup.boardSize.rows)).toEqual([6, 8, 8, 10, 10, 10, 10, 10]);
        steps.forEach(setup => {
            expect(setup.scenario).toBeUndefined();
            expect(setup.balance.match.placementTimeoutMs).toBe(engine.AI_MATCH_DEADLINE_MS);
        });
    });

    test('the very first match against the AI is the prepared first game', () => {
        const first = engine.aiLadderSetup(engine.initialAiLadder(0));
        expect(first.scenario).toEqual(engine.scenarios.firstGame.scenario);
        expect(first.scenario).not.toBe(engine.scenarios.firstGame.scenario);
        expect(first.boardSize).toEqual({ rows: 6, cols: 6 });
        expect(first.opponent.name).toBe('Tom Toffee');
        // a given scenario (debug boards) wins
        const custom = { boardSize: { rows: 8, cols: 8 }, opponent: 'TomToffee', scenario: { phase: 'x', cells: [] } };
        expect(engine.aiLadderSetup(ladder(6), { scenario: custom }).boardSize).toEqual({ rows: 8, cols: 8 });
    });

    test('two wins in a row go one step up, a loss one step down, a draw breaks the run', () => {
        let state = ladder(2);
        state = engine.nextAiLadder(state, 'won');
        expect(state).toMatchObject({ step: 2, wins: 1, games: 6 });
        state = engine.nextAiLadder(state, 'won');
        expect(state).toMatchObject({ step: 3, wins: 0, games: 7 });
        state = engine.nextAiLadder(engine.nextAiLadder(state, 'won'), 'draw');
        expect(state).toMatchObject({ step: 3, wins: 0 });
        state = engine.nextAiLadder(state, 'lost');
        expect(state).toMatchObject({ step: 2, wins: 0 });
        expect(engine.nextAiLadder(ladder(1), 'lost')).toMatchObject({ step: 1 });
        const top = engine.nextAiLadder(engine.nextAiLadder(ladder(8), 'won'), 'won');
        expect(top).toMatchObject({ step: 8 });
    });

    test('once on the 10x10 board, a loss never takes the player back to a smaller one', () => {
        const reached = engine.nextAiLadder(engine.nextAiLadder(ladder(3), 'won'), 'won');
        expect(reached).toMatchObject({ step: 4, floor: 4 });
        expect(engine.nextAiLadder(reached, 'lost')).toMatchObject({ step: 4, floor: 4 });
        expect(engine.nextAiLadder(ladder(6), 'lost')).toMatchObject({ step: 5, floor: 4 });
    });

    test('players from before the ladder start where their XP put them', () => {
        expect(engine.initialAiLadder(0)).toEqual({ step: 1, wins: 0, floor: 1, games: 0 });
        expect(engine.initialAiLadder(100)).toEqual({ step: 1, wins: 0, floor: 1, games: 0 });
        expect([150, 300, 600, 900, 1500].map(xp => engine.initialAiLadder(xp).step)).toEqual([1, 2, 3, 4, 5]);
        expect(engine.initialAiLadder(150).games).toBeGreaterThan(0);
        expect(engine.initialAiLadder(1500).floor).toBe(4);
        expect(engine.aiLadderOf({ score: 600 })).toMatchObject({ step: 3 });
        expect(engine.aiLadderOf({ score: 600, aiLadder: ladder(7) })).toMatchObject({ step: 7 });
    });
});

describe('the AI ratings', () => {
    test('every step of the AI ladder has a fixed rating, rising with the step', () => {
        const ratings = engine.AI_LADDER.map(entry =>
            engine.aiRatingOf({ kind: entry.opponent, handicap: entry.handicap, board: entry.board }));
        ratings.forEach((ai, index) => expect(ai).toEqual({ rating: engine.AI_LADDER[index].rating, deviation: expect.any(Number) }));
        ratings.slice(1).forEach((ai, index) => expect(ai.rating).toBeGreaterThan(ratings[index].rating));
    });

    test('Tom Toffee plays without a handicap; an AI that is not on the ladder has no rating', () => {
        expect(engine.aiRatingOf({ kind: 'TomToffee', board: 6 }).rating).toBe(engine.AI_LADDER[0].rating);
        expect(engine.aiRatingOf({ kind: 'TomToffee', handicap: 0, board: 8 }).rating).toBe(engine.AI_LADDER[1].rating);
        expect(engine.aiRatingOf({ kind: 'GustavGanache', handicap: 4, board: 6 })).toBeNull();
        expect(engine.aiRatingOf({ kind: 'RandomBot', board: 10 })).toBeNull();
    });
});
