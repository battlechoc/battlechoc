const { updateRating, rateMatch } = require('../index');

test('Glicko-2 matches the example in Glickman (2012)', () => {
    const result = updateRating({ rating: 1500, deviation: 200, volatility: 0.06 }, [
        { opponent: { rating: 1400, deviation: 30 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300 }, score: 0 },
    ]);
    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.deviation).toBeCloseTo(151.52, 1);
    expect(result.volatility).toBeCloseTo(0.05999, 4);
});

test('without games the deviation grows, but never above 350', () => {
    const idle = updateRating({ rating: 1600, deviation: 340, volatility: 0.06 }, []);
    expect(idle.rating).toBe(1600);
    expect(idle.deviation).toBeGreaterThan(340);
    expect(updateRating({ rating: 1600, deviation: 350, volatility: 0.06 }, []).deviation).toBe(350);
});

test('rateMatch: the winner gains, the loser loses, a draw between equals changes nothing', () => {
    const fresh = { rating: 1500, deviation: 350, volatility: 0.06 };
    const [winner, loser] = rateMatch(fresh, fresh, 1);
    expect(winner.rating).toBeGreaterThan(1500);
    expect(loser.rating).toBeLessThan(1500);
    expect(winner.rating - 1500).toBeCloseTo(1500 - loser.rating, 5);
    const [a, b] = rateMatch(fresh, fresh, 0.5);
    expect(a.rating).toBeCloseTo(1500, 5);
    expect(b.rating).toBeCloseTo(1500, 5);
});
