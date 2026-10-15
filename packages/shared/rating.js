// Glicko-2 (Glickman 2012): a rating, its deviation (how uncertain it is) and the volatility.
// Used for the public highscore; only verified online matches between humans change it.

const SCALE = 173.7178;
const EPSILON = 0.000001;
const MAX_DEVIATION = 350;

const g = phi => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muOpponent, phiOpponent) => 1 / (1 + Math.exp(-g(phiOpponent) * (mu - muOpponent)));

/**
 * New rating of `player` ({ rating, deviation, volatility }) after `results`
 * ([{ opponent: { rating, deviation }, score }], score 1 = win, 0.5 = draw, 0 = loss).
 */
const updateRating = ({ rating, deviation, volatility }, results, tau = 0.5) => {
    const mu = (rating - 1500) / SCALE;
    const phi = deviation / SCALE;
    if (results.length === 0) {
        return { rating, deviation: Math.min(MAX_DEVIATION, Math.sqrt(phi * phi + volatility * volatility) * SCALE), volatility };
    }
    const opponents = results.map(result => ({
        mu: (result.opponent.rating - 1500) / SCALE,
        phi: result.opponent.deviation / SCALE,
        score: result.score,
    }));
    const v = 1 / opponents.reduce((sum, o) => {
        const e = expected(mu, o.mu, o.phi);
        return sum + g(o.phi) ** 2 * e * (1 - e);
    }, 0);
    const improvement = opponents.reduce((sum, o) => sum + g(o.phi) * (o.score - expected(mu, o.mu, o.phi)), 0);
    const delta = v * improvement;

    // the new volatility (Illinois algorithm, step 5 of the paper)
    const a = Math.log(volatility ** 2);
    const f = x => {
        const ex = Math.exp(x);
        return (ex * (delta ** 2 - phi ** 2 - v - ex)) / (2 * (phi ** 2 + v + ex) ** 2) - (x - a) / tau ** 2;
    };
    let A = a;
    let B;
    if (delta ** 2 > phi ** 2 + v) {
        B = Math.log(delta ** 2 - phi ** 2 - v);
    } else {
        let k = 1;
        while (f(a - k * tau) < 0) {
            k += 1;
        }
        B = a - k * tau;
    }
    let fA = f(A);
    let fB = f(B);
    while (Math.abs(B - A) > EPSILON) {
        const C = A + ((A - B) * fA) / (fB - fA);
        const fC = f(C);
        if (fC * fB <= 0) {
            A = B;
            fA = fB;
        } else {
            fA /= 2;
        }
        B = C;
        fB = fC;
    }
    const sigma = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi ** 2 + sigma ** 2);
    const phiNew = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v);
    const muNew = mu + phiNew ** 2 * improvement;
    return { rating: muNew * SCALE + 1500, deviation: phiNew * SCALE, volatility: sigma };
};

/** New ratings of two players after one match; scoreA is 1, 0.5 or 0. */
const rateMatch = (a, b, scoreA) => [
    updateRating(a, [{ opponent: b, score: scoreA }]),
    updateRating(b, [{ opponent: a, score: 1 - scoreA }]),
];

module.exports = { updateRating, rateMatch };
