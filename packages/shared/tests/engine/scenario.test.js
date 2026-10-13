const { engine, MatchPhase, EntityType, BoardCellTypes, newMatch, cellOf } = require('./helper');
const { AttackType } = require('../../index');

describe('scenarios', () => {
    test('a placement scenario rewrites cells and waits for the factories', () => {
        const match = newMatch({ size: 8 });
        engine.prepareScenario(match, {
            cells: [
                { row: 7, col: 7, type: BoardCellTypes.BLACK, cream: true },
                { row: 6, col: 7, type: BoardCellTypes.BROWN, cream: false },
            ],
        });
        expect(match.phase).toBe(MatchPhase.PLACEMENT);
        expect(cellOf(match, 0, 7, 7).type).toBe(BoardCellTypes.BLACK);
        expect(cellOf(match, 0, 7, 7).occupiedBy.map(entity => entity.type)).toEqual([EntityType.CREAM]);
        expect(cellOf(match, 0, 6, 7).occupiedBy).toHaveLength(0);
    });

    test('a running scenario starts with prepared buildings, timers and cacao', () => {
        const match = newMatch({ size: 6 });
        engine.prepareScenario(match, {
            phase: MatchPhase.RUNNING,
            cacao: [200, 50],
            cells: [
                { row: 0, col: 0, type: BoardCellTypes.BLACK, cream: true, entities: [EntityType.FACTORY] },
                { row: 3, col: 4, cream: true, entities: [EntityType.RUM_TRUFFLE_CANNON] },
                { row: 1, col: 1, cream: true, entities: [EntityType.FRUIT_CANNON] },
                { player: 1, row: 3, col: 0, cream: true, entities: [EntityType.FACTORY] },
            ],
        });
        expect(match.phase).toBe(MatchPhase.RUNNING);
        expect(match.players.map(player => player.cacao)).toEqual([200, 50]);
        expect(match.players[0].buildTokens).toBe(3);
        expect(engine.weaponsOf(match, 0, AttackType.TRUFFLE)).toHaveLength(2);
        expect(engine.weaponsOf(match, 0, AttackType.FRUIT)).toHaveLength(1);
        engine.advanceTo(match, match.t + 10000);
        expect(match.players[0].cacao).toBe(200 + 5);
    });

    test('missing factories are placed when a scenario starts running', () => {
        const match = newMatch();
        engine.prepareScenario(match, { phase: MatchPhase.RUNNING });
        [0, 1].forEach(player => expect(engine.entitiesOf(match, player).some(entity => entity.type === EntityType.FACTORY)).toBe(true));
    });

    test('a scenario needs a fresh match', () => {
        const match = newMatch();
        engine.prepareScenario(match, {});
        expect(() => engine.prepareScenario(match, {})).toThrow();
    });
});
