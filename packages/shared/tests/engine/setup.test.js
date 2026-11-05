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
