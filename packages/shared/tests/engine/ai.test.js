const { engine, PlayerType, runningMatch, place } = require('./helper');
const { EntityType } = require('../../index');

const { TomToffee, GustavGanache, Personality } = engine.ai;

const play = (agentA, agentB, seed, size = 6) => {
    const match = engine.createMatch({
        players: [
            { id: 'a', name: 'A', type: PlayerType.AI_STRONG },
            { id: 'b', name: 'B', type: PlayerType.AI_STRONG },
        ],
        boardSize: { rows: size, cols: size },
        seed,
    });
    const { stats } = engine.playMatch(engine, engine.getPlayerView, match, [agentA(0, seed), agentB(1, seed)]);
    return { match, stats };
};

const gustav = (handicap, personality) => (playerIndex, seed) =>
    new GustavGanache({ playerIndex, seed: `${seed}-${playerIndex}`, handicap, personality });
const tom = (playerIndex, seed) => new TomToffee({ playerIndex, seed: `${seed}-${playerIndex}` });

describe('AI agents', () => {
    test('Tom Toffee and Gustav Ganache only send valid actions and finish their matches', () => {
        for (let i = 0; i < 10; i++) {
            const { match, stats } = play(gustav(i % 5), tom, `valid-${i}`);
            expect(stats.rejected).toBe(0);
            expect(match.phase).toBe(engine.MatchPhase.ENDED);
        }
    });

    test('Gustav Ganache at handicap 0 beats Tom Toffee clearly', () => {
        let wins = 0;
        for (let i = 0; i < 30; i++) {
            const gustavFirst = i % 2 === 0;
            const { match } = gustavFirst ? play(gustav(0), tom, `strength-${i}`) : play(tom, gustav(0), `strength-${i}`);
            const gustavIndex = gustavFirst ? 0 : 1;
            if (match.outcome.winners.length === 1 && match.outcome.winners[0] === gustavIndex) {
                wins += 1;
            }
        }
        expect(wins).toBeGreaterThanOrEqual(27);
    });

    test('Gustav Ganache places the factory under cream', () => {
        const { match } = play(gustav(0), tom, 'factory-cream');
        const placement = match.events.find(event => event.type === 'factoryPlaced' && event.player === 0);
        expect(placement.secret.creamed).toBe(true);
    });

    test('an aggressive Gustav rushes more than a defensive one', () => {
        const rushes = personality => {
            let total = 0;
            for (let i = 0; i < 10; i++) {
                const { match } = play(gustav(0, personality), tom, `rush-${personality}-${i}`);
                total += match.players[0].statistics.rushes;
            }
            return total;
        };
        expect(rushes(Personality.AGGRESSIVE)).toBeGreaterThan(rushes(Personality.DEFENSIVE));
    });

    test('a high handicap keeps the advanced buildings away from Gustav', () => {
        for (let i = 0; i < 5; i++) {
            const { match } = play(gustav(4), tom, `gates-${i}`);
            const built = match.events.filter(event => event.type === 'built' && event.player === 0).map(event => event.data.entityType);
            [EntityType.FACTORY_EXTENSION, EntityType.CHOCOLATE_FOUNTAIN, EntityType.SPYING_EASTER_BUNNY,
                EntityType.XMAS_FACTORY, EntityType.FRUIT_CANNON, EntityType.DONUT_FACTORY]
                .forEach(type => expect(built).not.toContain(type));
        }
    });

    test('Gustav keeps its memory across a save', () => {
        const agent = new GustavGanache({ playerIndex: 0, seed: 'save', handicap: 1 });
        agent.memory = { '1:2': { types: [EntityType.FACTORY], seenAt: 1000 } };
        agent.rage = 0.9;
        const copy = new GustavGanache({ playerIndex: 0, seed: 'save', handicap: 1 });
        copy.importState(JSON.parse(JSON.stringify(agent.exportState())));
        expect(copy.memory).toEqual(agent.memory);
        expect(copy.rage).toBe(0.9);
        expect(copy.personality).toBe(agent.personality);
    });

    test('Gustav aims its cream at the centre of the exposed buildings', () => {
        const match = runningMatch();
        [[2, 2], [2, 4], [4, 2], [4, 4]].forEach(([row, col]) => place(match, 0, EntityType.CACAOTREE, row, col));
        const agent = new GustavGanache({ playerIndex: 0, seed: 'cream', handicap: 0, personality: Personality.DEFENSIVE });
        agent.rage = 0;
        agent.rageUntil = Infinity;
        const decision = agent.build(engine.getPlayerView(match, 0), match.t);
        expect(decision.payload).toEqual({ entityType: EntityType.CREAM, row: 3, col: 3 });
    });
});
