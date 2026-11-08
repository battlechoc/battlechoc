const { updateRating, rateMatch, rateAgainstAi, starsOf, engine, AI_RATING_REACH } = require('../index');

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

test('stars: the rating minus twice its deviation, 0 before the first rated match, never below 0', () => {
    expect(starsOf({ rating: 1700, deviation: 100, ratedMatches: 3 })).toBe(1500);
    expect(starsOf({ rating: 1612.6, deviation: 50.2, ratedMatches: 1 })).toBe(1512);
    expect(starsOf({ rating: 1500, deviation: 350, ratedMatches: 0 })).toBe(0);
    expect(starsOf({ rating: 600, deviation: 350, ratedMatches: 2 })).toBe(0);
});

test('stars grow with verified matches: the same strength, more certainty', () => {
    const opponent = { rating: 1500, deviation: 50 };
    let player = { rating: 1500, deviation: 350, volatility: 0.06 };
    // after every pair of matches (a win, then a loss) the stars are higher than after the last pair
    const afterPairs = [];
    for (let match = 1; match <= 10; match += 1) {
        player = updateRating(player, [{ opponent, score: match % 2 }]);
        if (match % 2 === 0) {
            afterPairs.push(starsOf({ ...player, ratedMatches: match }));
        }
    }
    afterPairs.slice(1).forEach((stars, index) => expect(stars).toBeGreaterThan(afterPairs[index]));
});

const aiOf = entry => engine.aiRatingOf({ kind: entry.opponent, handicap: entry.handicap, board: entry.board });

test('beating a much weaker AI gains little', () => {
    const strong = { rating: 1700, deviation: 60, volatility: 0.06 };
    expect(rateAgainstAi(strong, aiOf(engine.AI_LADDER[2]), 1).rating - 1700).toBeLessThan(5);
});

test('wins against the AI lift the stars at most AI_RATING_REACH above that AI', () => {
    const strongest = engine.AI_LADDER[engine.AI_LADDER.length - 1];
    let player = { rating: 1500, deviation: 350, volatility: 0.06 };
    for (let match = 1; match <= 300; match += 1) {
        player = rateAgainstAi(player, aiOf(strongest), 1);
    }
    const stars = starsOf({ ...player, ratedMatches: 300 });
    expect(stars).toBeLessThanOrEqual(strongest.rating + AI_RATING_REACH);
    expect(stars).toBeGreaterThan(strongest.rating + AI_RATING_REACH - 10);
    // Tom Toffee on the small board takes a new player only so far, although 1500 is above his reach
    const tom = engine.AI_LADDER[0];
    let rookie = { rating: 1500, deviation: 350, volatility: 0.06 };
    for (let match = 1; match <= 50; match += 1) {
        rookie = rateAgainstAi(rookie, aiOf(tom), 1);
        expect(starsOf({ ...rookie, ratedMatches: match })).toBeLessThanOrEqual(tom.rating + AI_RATING_REACH);
    }
});

test('stars above the reach, from matches against people, stay when beating the AI; a loss still costs', () => {
    const champion = { rating: 2100, deviation: 80, volatility: 0.06 };
    const top = aiOf(engine.AI_LADDER[engine.AI_LADDER.length - 1]);
    const before = starsOf({ ...champion, ratedMatches: 30 });
    expect(starsOf({ ...rateAgainstAi(champion, top, 1), ratedMatches: 31 })).toBe(before);
    expect(starsOf({ ...rateAgainstAi(champion, top, 0), ratedMatches: 31 })).toBeLessThan(before);
});
